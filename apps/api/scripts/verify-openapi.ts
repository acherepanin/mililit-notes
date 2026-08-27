import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

interface OpenApiOperation {
  operationId?: string;
}

interface OpenApiDocument {
  info?: { title?: string; version?: string };
  openapi?: string;
  paths?: Record<string, Record<string, OpenApiOperation>>;
}

interface ClientContract {
  method: string;
  path: string;
  source: string;
}

const root = fileURLToPath(new URL("../../../", import.meta.url));
process.loadEnvFile(join(root, "infra/compose/.env"));
const port = Number(process.env.OPENAPI_PORT ?? 3213);
const url = `http://127.0.0.1:${port}`;
const databaseUser = process.env.POSTGRES_USER?.trim() || "notes_v2";
const databasePassword =
  process.env.POSTGRES_PASSWORD?.trim() || "notes_v2_local_only";
const database = process.env.POSTGRES_DB?.trim() || "notes_v2";
const databasePort = process.env.POSTGRES_PORT?.trim() || "55432";

function normalizePath(path: string): string {
  const clean = path.split("?", 1)[0]?.replace(/\/$/, "") || "/";
  return clean
    .split("/")
    .map((part) => (part.startsWith("{") && part.endsWith("}") ? "{}" : part))
    .join("/");
}

function expressionText(expression: ts.Expression): string | null {
  if (
    ts.isStringLiteral(expression) ||
    ts.isNoSubstitutionTemplateLiteral(expression)
  ) {
    return expression.text;
  }
  if (!ts.isTemplateExpression(expression)) return null;
  let value = expression.head.text;
  for (const span of expression.templateSpans) {
    value += `{value}${span.literal.text}`;
  }
  return value;
}

function stringUnionValues(
  expression: ts.Expression,
  context: ts.Node,
): string[] | null {
  if (!ts.isIdentifier(expression)) return null;
  let current: ts.Node | undefined = context;
  while (current) {
    if (
      ts.isMethodDeclaration(current) ||
      ts.isFunctionDeclaration(current) ||
      ts.isFunctionExpression(current) ||
      ts.isArrowFunction(current)
    ) {
      const parameter = current.parameters.find(
        ({ name }) => ts.isIdentifier(name) && name.text === expression.text,
      );
      const type = parameter?.type;
      if (!type) return null;
      const types = ts.isUnionTypeNode(type) ? type.types : [type];
      const values = types.flatMap((candidate) =>
        ts.isLiteralTypeNode(candidate) && ts.isStringLiteral(candidate.literal)
          ? [candidate.literal.text]
          : [],
      );
      return values.length === types.length ? values : null;
    }
    current = current.parent;
  }
  return null;
}

function requestPaths(expression: ts.Expression, context: ts.Node): string[] {
  const staticValue = expressionText(expression);
  if (staticValue !== null && !ts.isTemplateExpression(expression)) {
    return [staticValue];
  }
  if (!ts.isTemplateExpression(expression)) return [];
  let values = [expression.head.text];
  for (const span of expression.templateSpans) {
    const dynamic =
      ts.isCallExpression(span.expression) &&
      ts.isIdentifier(span.expression.expression) &&
      span.expression.expression.text === "queryString"
        ? [""]
        : (stringUnionValues(span.expression, context) ?? ["{}"]);
    values = values.flatMap((value) =>
      dynamic.map((part) => `${value}${part}${span.literal.text}`),
    );
  }
  return values;
}

function requestMethod(options: ts.Expression | undefined): string {
  if (!options) return "get";
  if (
    ts.isCallExpression(options) &&
    ts.isIdentifier(options.expression) &&
    options.expression.text === "json"
  ) {
    return "post";
  }
  if (!ts.isObjectLiteralExpression(options)) return "get";
  for (const property of options.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const name = property.name.getText().replaceAll(/["']/g, "");
    if (name !== "method") continue;
    const value = expressionText(property.initializer);
    return value?.toLowerCase() ?? "get";
  }
  return "get";
}

async function clientContracts(): Promise<ClientContract[]> {
  const directory = join(root, "apps/web/src/app");
  const files = (await readdir(directory)).filter((name) =>
    name.endsWith("-api.ts"),
  );
  const contracts: ClientContract[] = [];
  for (const file of files) {
    const source = ts.createSourceFile(
      file,
      await readFile(join(directory, file), "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const name = node.expression.text;
        if (name === "requestApi" || name === "request" || name === "fetch") {
          const rawPaths = node.arguments[0]
            ? requestPaths(node.arguments[0], node)
            : [];
          for (const raw of rawPaths) {
            if (raw === "/api{}" && name === "fetch") continue;
            const path = name === "fetch" ? raw : `/api${raw}`;
            if (path.startsWith("/api/")) {
              contracts.push({
                method: requestMethod(node.arguments[1]),
                path: normalizePath(path),
                source: file,
              });
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return [
    ...new Map(
      contracts.map((contract) => [
        `${contract.method} ${contract.path}`,
        contract,
      ]),
    ).values(),
  ];
}

async function waitForDocument(
  service: ChildProcess,
  logs: string[],
): Promise<OpenApiDocument> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (service.exitCode !== null) {
      throw new Error(`OpenAPI service exited: ${logs.join("\n")}`);
    }
    try {
      const response = await fetch(`${url}/api/openapi.json`, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) return (await response.json()) as OpenApiDocument;
    } catch {
      // API initialization is still in progress.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`OpenAPI service timed out: ${logs.join("\n")}`);
}

function stop(service: ChildProcess): Promise<void> {
  if (service.exitCode !== null) return Promise.resolve();
  service.kill("SIGTERM");
  return Promise.race([
    new Promise<void>((resolve) => service.once("exit", () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
  ]);
}

assert.ok(Number.isInteger(port) && port > 0);
const logs: string[] = [];
const service = spawn(process.execPath, [join(root, "apps/api/dist/main.js")], {
  cwd: root,
  env: {
    ...process.env,
    APP_ORIGIN: "http://localhost:3200",
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: url,
    DATABASE_URL: `postgresql://${encodeURIComponent(databaseUser)}:${encodeURIComponent(databasePassword)}@127.0.0.1:${databasePort}/${encodeURIComponent(database)}`,
    HOST: "127.0.0.1",
    INTERNAL_INTEGRATION_SECRET: process.env.INTERNAL_INTEGRATION_SECRET,
    INTERNAL_WORKER_HEALTH_URL: "http://127.0.0.1:3202/ready",
    NODE_ENV: "production",
    OBJECT_STORAGE_ACCESS_KEY:
      process.env.MINIO_ROOT_USER?.trim() || "notes_v2_local",
    OBJECT_STORAGE_BUCKET:
      process.env.OBJECT_STORAGE_BUCKET?.trim() || "notes-v2",
    OBJECT_STORAGE_ENDPOINT: "http://127.0.0.1:19000",
    OBJECT_STORAGE_PUBLIC_ENDPOINT: "http://127.0.0.1:19000",
    OBJECT_STORAGE_SECRET_KEY:
      process.env.MINIO_ROOT_PASSWORD?.trim() || "notes_v2_local_password",
    OPENAPI_ENABLED: "true",
    PORT: String(port),
    REDIS_URL: "redis://127.0.0.1:56379",
    WEBAUTHN_ORIGIN: "http://localhost:3200",
    WEBAUTHN_RP_ID: "localhost",
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
const capture = (value: Buffer): void => {
  logs.push(value.toString("utf8").trim());
  if (logs.length > 30) logs.shift();
};
service.stdout?.on("data", capture);
service.stderr?.on("data", capture);

try {
  const document = await waitForDocument(service, logs);
  assert.match(document.openapi ?? "", /^3\./);
  assert.equal(document.info?.title, "Notes AI API");
  assert.equal(document.info?.version, "1.0.0");
  const paths = document.paths ?? {};
  const operations = Object.entries(paths).flatMap(([path, methods]) =>
    Object.entries(methods)
      .filter(([method]) =>
        ["delete", "get", "patch", "post", "put"].includes(method),
      )
      .map(([method, operation]) => ({ method, operation, path })),
  );
  assert.ok(
    operations.length >= 75,
    `only ${operations.length} operations found`,
  );
  const operationIds = operations.map(({ operation }) => operation.operationId);
  assert.ok(
    operationIds.every(Boolean),
    "an OpenAPI operation has no operationId",
  );
  assert.equal(new Set(operationIds).size, operationIds.length);

  const serverContracts = new Set(
    operations.map(({ method, path }) => `${method} ${normalizePath(path)}`),
  );
  const clients = await clientContracts();
  assert.ok(
    clients.length >= 45,
    `only ${clients.length} client calls extracted`,
  );
  const missing = clients.filter(
    ({ method, path }) => !serverContracts.has(`${method} ${path}`),
  );
  assert.deepEqual(
    missing,
    [],
    `frontend calls missing from OpenAPI: ${missing
      .map(
        ({ method, path, source }) =>
          `${method.toUpperCase()} ${path} (${source})`,
      )
      .join(", ")}`,
  );
  console.log(
    `OpenAPI compatibility passed for ${operations.length} server operations and ${clients.length} statically resolved frontend calls`,
  );
} finally {
  await stop(service);
}
