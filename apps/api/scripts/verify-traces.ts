import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

import { INTEGRATION_QUEUE, type IntegrationEventJob } from "@notes/config";
import { createDatabase, createDatabasePool } from "@notes/db";
import { Queue } from "bullmq";
import { Redis } from "ioredis";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://notes_v2:notes_v2_local_only@127.0.0.1:55432/notes_v2";
const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:56379";
const tempoUrl = process.env.TEMPO_URL ?? "http://127.0.0.1:19100";
process.env.REDIS_URL = redisUrl;
process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ??=
  "http://127.0.0.1:14318/v1/traces";
process.env.OTEL_SERVICE_NAME = "notes-api";

const [{ shutdownTelemetry }, { CorrelationContextService }, webhookModule] =
  await Promise.all([
    import("../src/telemetry.js"),
    import("../src/observability/correlation-context.service.js"),
    import("../src/integrations/integration-webhook.service.js"),
  ]);

interface OtlpAttribute {
  key?: string;
  value?: {
    boolValue?: boolean;
    doubleValue?: number;
    intValue?: number | string;
    stringValue?: string;
  };
}

interface TempoSpan {
  attributes?: OtlpAttribute[];
  name?: string;
}

interface TempoResourceSpan {
  resource?: { attributes?: OtlpAttribute[] };
  scopeSpans?: Array<{ spans?: TempoSpan[] }>;
}

interface TempoTrace {
  batches?: TempoResourceSpan[];
  resourceSpans?: TempoResourceSpan[];
}

function attributes(values: OtlpAttribute[] | undefined): Map<string, unknown> {
  const result = new Map<string, unknown>();
  for (const attribute of values ?? []) {
    if (!attribute.key || !attribute.value) continue;
    const value = attribute.value;
    result.set(
      attribute.key,
      value.stringValue ??
        value.intValue ??
        value.doubleValue ??
        value.boolValue,
    );
  }
  return result;
}

function traceSpans(trace: TempoTrace) {
  return (trace.batches ?? trace.resourceSpans ?? []).flatMap((batch) => {
    const service = attributes(batch.resource?.attributes).get("service.name");
    return (batch.scopeSpans ?? []).flatMap((scope) =>
      (scope.spans ?? []).map((span) => ({
        attributes: attributes(span.attributes),
        name: span.name ?? "",
        service: typeof service === "string" ? service : "",
      })),
    );
  });
}

async function findTrace(correlationId: string): Promise<TempoTrace> {
  const deadline = Date.now() + 30_000;
  const query = `{ span.notes.correlation_id = "${correlationId}" }`;
  while (Date.now() < deadline) {
    const searchUrl = new URL("/api/search", tempoUrl);
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set("limit", "20");
    const searchResponse = await fetch(searchUrl, {
      headers: { accept: "application/json" },
    });
    assert.equal(
      searchResponse.ok,
      true,
      `Tempo search: ${searchResponse.status}`,
    );
    const search = (await searchResponse.json()) as {
      traces?: Array<{ traceID?: string; traceId?: string }>;
    };
    for (const summary of search.traces ?? []) {
      const traceId = summary.traceID ?? summary.traceId;
      if (!traceId) continue;
      const response = await fetch(
        new URL(`/api/traces/${encodeURIComponent(traceId)}`, tempoUrl),
        { headers: { accept: "application/json" } },
      );
      if (!response.ok) continue;
      const trace = (await response.json()) as TempoTrace;
      const spans = traceSpans(trace);
      if (
        spans.some(
          (span) =>
            span.attributes.get("notes.correlation_id") === correlationId,
        ) &&
        new Set(spans.map((span) => span.service)).has("notes-worker")
      ) {
        return trace;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Trace not found for ${correlationId}`);
}

const suffix = randomUUID();
const correlationId = `phase9-trace-${suffix}`;
const eventId = `trace-${suffix}`;
const secret = `trace-secret-${suffix}`;
const payload = { update_id: eventId };
const jobId = createHash("sha256").update(`telegram\0${eventId}`).digest("hex");
const pool = createDatabasePool(databaseUrl, { max: 2 });
const database = createDatabase(pool);
const redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
const queue = new Queue<IntegrationEventJob>(INTEGRATION_QUEUE, {
  connection: redis,
  prefix: "notes",
});
const correlation = new CorrelationContextService();
const settings = {
  decryptSecret(value: string | null) {
    return value;
  },
  async getRuntimeAdminSettings() {
    return { secretEncrypted: secret };
  },
};
const webhook = new webhookModule.IntegrationWebhookService(
  { client: database } as never,
  settings as never,
  correlation,
);
let ledgerId = 0;
let telemetryClosed = false;

try {
  await webhook.onModuleInit();
  const accepted = await correlation.run(correlationId, () =>
    webhook.acceptTelegram(payload, secret, "phase9-trace-verifier"),
  );
  assert.equal(accepted.correlationId, correlationId);

  const ledger = await pool.query<{ id: number }>(
    "select id from ai_bot_webhook_events where provider = 'telegram' and event_id = $1",
    [eventId],
  );
  ledgerId = ledger.rows[0]?.id ?? 0;
  assert.ok(ledgerId);

  const deadline = Date.now() + 30_000;
  let state = "unknown";
  while (Date.now() < deadline) {
    const job = await queue.getJob(jobId);
    state = job ? await job.getState() : "missing";
    if (state === "completed" || state === "failed") break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(
    state === "completed" || state === "failed",
    `Integration job remained ${state}`,
  );

  await webhook.onModuleDestroy();
  await shutdownTelemetry();
  telemetryClosed = true;

  const trace = await findTrace(correlationId);
  const spans = traceSpans(trace);
  const services = new Set(spans.map((span) => span.service));
  assert.equal(services.has("notes-api"), true);
  assert.equal(services.has("notes-worker"), true);
  assert.equal(
    spans.some((span) => span.name === "integration-event enqueue"),
    true,
  );
  assert.equal(
    spans.some((span) => span.name === "integration-event process"),
    true,
  );
  assert.equal(
    spans.some(
      (span) =>
        span.attributes.get("url.path") ===
        "/api/internal/integrations/process",
    ),
    true,
  );

  const forbidden =
    /authorization|cookie|secret|token|signature|request\.body|response\.body|url\.full|url\.query|http\.url|http\.target|user_agent|client\.address|network\.peer/i;
  for (const span of spans) {
    for (const [key, value] of span.attributes) {
      assert.equal(
        forbidden.test(key),
        false,
        `Forbidden trace attribute: ${key}`,
      );
      assert.notEqual(value, secret, `Secret leaked through ${key}`);
    }
  }
  console.log("OpenTelemetry trace verification passed");
} finally {
  await webhook.onModuleDestroy().catch(() => undefined);
  if (!telemetryClosed) await shutdownTelemetry().catch(() => undefined);
  const job = await queue.getJob(jobId);
  if (job && ((await job.isCompleted()) || (await job.isFailed()))) {
    await job.remove();
  }
  if (ledgerId) {
    await pool.query(
      "delete from request_error_logs where correlation_id = $1",
      [correlationId],
    );
    await pool.query(
      "delete from ai_bot_webhook_events where id = $1 and status in ('succeeded', 'failed')",
      [ledgerId],
    );
  }
  await queue.close();
  await redis.quit();
  await pool.end();
}
