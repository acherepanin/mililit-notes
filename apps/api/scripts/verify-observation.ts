import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";

const run = promisify(execFile);
const durationMs = Number(process.env.OBSERVATION_DURATION_MS ?? 60_000);
const intervalMs = Number(process.env.OBSERVATION_INTERVAL_MS ?? 1_000);
const maximumP95Ms = Number(process.env.OBSERVATION_MAX_P95_MS ?? 500);
const endpoints = [
  "http://localhost:3200/api/health",
  "http://localhost:3201/api/health",
  "http://localhost:3202/ready",
  "http://localhost:19000/minio/health/live",
  "http://127.0.0.1:19090/-/healthy",
  "http://127.0.0.1:19093/-/healthy",
];
const containers = [
  "notes-v2-web-1",
  "notes-v2-api-1",
  "notes-v2-worker-1",
  "notes-v2-postgres-1",
  "notes-v2-redis-1",
  "notes-v2-object-storage-1",
  "notes-v2-mail-1",
  "notes-v2-prometheus-1",
  "notes-v2-alertmanager-1",
  "notes-v2-otel-collector-1",
  "notes-v2-tempo-1",
];

interface ContainerState {
  health: string;
  name: string;
  restarts: number;
  status: string;
}

async function states(): Promise<Map<string, ContainerState>> {
  const result = new Map<string, ContainerState>();
  for (const name of containers) {
    const { stdout } = await run(
      "docker",
      [
        "inspect",
        "--format",
        "{{json .Name}}|{{.RestartCount}}|{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}",
        name,
      ],
      { windowsHide: true },
    );
    const [rawName, restarts, status, health] = stdout.trim().split("|");
    const resolvedName = JSON.parse(rawName ?? '""') as string;
    result.set(name, {
      health: health ?? "",
      name: resolvedName.replace(/^\//, ""),
      restarts: Number(restarts),
      status: status ?? "",
    });
  }
  return result;
}

function percentile(values: number[], ratio: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return (
    sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)] ??
    0
  );
}

assert.ok(Number.isFinite(durationMs) && durationMs >= 10_000);
assert.ok(Number.isFinite(intervalMs) && intervalMs >= 250);
const before = await states();
const since = new Date().toISOString();
const durations: number[] = [];
const failures: string[] = [];
const deadline = Date.now() + durationMs;

while (Date.now() < deadline) {
  const cycleStarted = performance.now();
  await Promise.all(
    endpoints.map(async (endpoint) => {
      const started = performance.now();
      try {
        const response = await fetch(endpoint, {
          cache: "no-store",
          signal: AbortSignal.timeout(maximumP95Ms * 4),
        });
        durations.push(performance.now() - started);
        if (!response.ok) failures.push(`${endpoint}: HTTP ${response.status}`);
      } catch (error) {
        failures.push(
          `${endpoint}: ${error instanceof Error ? error.message : "request failed"}`,
        );
      }
    }),
  );
  const wait = intervalMs - (performance.now() - cycleStarted);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

const after = await states();
for (const [name, state] of after) {
  const initial = before.get(name);
  assert.ok(initial, `${name} was absent at observation start`);
  assert.equal(state.restarts, initial.restarts, `${name} restarted`);
  assert.equal(state.status, "running", `${name} is ${state.status}`);
  if (state.health)
    assert.equal(state.health, "healthy", `${name} is ${state.health}`);
}
assert.deepEqual(failures, []);
const p95 = percentile(durations, 0.95);
assert.ok(
  p95 <= maximumP95Ms,
  `health P95 ${p95} ms exceeds ${maximumP95Ms} ms`,
);

const logs = (
  await Promise.all(
    ["notes-v2-api-1", "notes-v2-worker-1", "notes-v2-web-1"].map(
      async (name) => {
        const { stderr, stdout } = await run(
          "docker",
          ["logs", "--since", since, name],
          {
            maxBuffer: 4 * 1024 * 1024,
            windowsHide: true,
          },
        );
        return `${stdout}\n${stderr}`;
      },
    ),
  )
).join("\n");
const errorLines = logs
  .split(/\r?\n/)
  .filter((line) => /\b(error|fatal|unhandled|exception)\b/i.test(line));
assert.deepEqual(errorLines, [], "runtime emitted error-level log lines");

console.log(
  `Observation passed for ${(durationMs / 1_000).toFixed(0)}s: ${durations.length} probes, P95 ${p95.toFixed(1)} ms, 0 failures, 0 restarts, 0 error logs`,
);
