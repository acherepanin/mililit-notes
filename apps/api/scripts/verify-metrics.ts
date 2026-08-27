import assert from "node:assert/strict";

const apiUrl = process.env.API_URL ?? "http://127.0.0.1:3201";
const workerUrl = process.env.WORKER_URL ?? "http://127.0.0.1:3202";
const prometheusUrl = process.env.PROMETHEUS_URL ?? "http://127.0.0.1:19090";

async function text(url: string, metric: string): Promise<void> {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  assert.equal(response.ok, true, `${url} returned ${response.status}`);
  assert.match(response.headers.get("content-type") ?? "", /^text\/plain/);
  assert.match(await response.text(), new RegExp(`\\b${metric}\\b`));
}

async function prometheus<Value>(path: string): Promise<Value> {
  const response = await fetch(`${prometheusUrl}${path}`, {
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(response.ok, true, `${path} returned ${response.status}`);
  const body = (await response.json()) as {
    data: Value;
    status: string;
  };
  assert.equal(body.status, "success");
  return body.data;
}

await Promise.all([
  text(`${apiUrl}/api/metrics`, "notes_api_http_requests_total"),
  text(`${workerUrl}/metrics`, "notes_worker_jobs_total"),
]);

const targets = await prometheus<{
  activeTargets: Array<{
    health: string;
    labels: { job?: string };
    lastError: string;
  }>;
}>("/api/v1/targets");
for (const job of ["alertmanager", "notes-api", "notes-worker"]) {
  const target = targets.activeTargets.find((item) => item.labels.job === job);
  assert.ok(target, `${job} target is missing`);
  assert.equal(target.health, "up", target.lastError);
}

const groups = await prometheus<{
  groups: Array<{
    rules: Array<{ name: string; state: string }>;
  }>;
}>("/api/v1/rules");
const rules = groups.groups.flatMap((group) => group.rules);
assert.deepEqual(
  new Set(rules.map((rule) => rule.name)),
  new Set([
    "NotesApiHighErrorRatio",
    "NotesTargetDown",
    "NotesWorkerJobFailed",
  ]),
);

const routeLabels = await prometheus<string[]>("/api/v1/label/route/values");
assert.ok(
  routeLabels.every(
    (route) =>
      route === "unmatched" ||
      (/^\/[a-zA-Z0-9_./:*()-]{1,200}$/.test(route) && !route.includes("?")),
  ),
  "Prometheus contains an unbounded route label",
);

console.log("Prometheus metrics verification passed");
