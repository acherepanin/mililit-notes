import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";

const run = promisify(execFile);
const durationMs = Number(process.env.LOAD_DURATION_MS ?? 15_000);
const concurrency = Number(process.env.LOAD_CONCURRENCY ?? 20);
const maximumP95Ms = Number(process.env.LOAD_MAX_P95_MS ?? 750);
const maximumP99Ms = Number(process.env.LOAD_MAX_P99_MS ?? 1_500);
const maximumErrorRate = Number(process.env.LOAD_MAX_ERROR_RATE ?? 0.01);
const minimumRequestsPerSecond = Number(process.env.LOAD_MIN_RPS ?? 20);
const maximumCpuPercent = Number(process.env.LOAD_MAX_CPU_PERCENT ?? 350);
const maximumMemoryMiB = Number(process.env.LOAD_MAX_MEMORY_MIB ?? 1024);
const maximumPids = Number(process.env.LOAD_MAX_PIDS ?? 200);
const targets = (
  process.env.LOAD_TARGETS ??
  "http://localhost:3201/api/health,http://localhost:3200/"
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const containers = (
  process.env.LOAD_CONTAINERS ?? "notes-v2-api-1,notes-v2-web-1"
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

interface Result {
  duration: number;
  ok: boolean;
  target: string;
}

interface ResourceSample {
  cpu: number;
  memoryMiB: number;
  name: string;
  pids: number;
}

function finitePositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0)
    throw new Error(`${name} must be positive`);
}

function percentile(values: number[], ratio: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return (
    sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)] ??
    0
  );
}

function memoryMiB(value: string): number {
  const match = value.trim().match(/^([0-9.]+)([KMG]iB)$/);
  if (!match) throw new Error(`unsupported Docker memory value: ${value}`);
  const amount = Number(match[1]);
  return amount * ({ KiB: 1 / 1024, MiB: 1, GiB: 1024 }[match[2]!] ?? 0);
}

async function resources(): Promise<ResourceSample[]> {
  const { stdout } = await run(
    "docker",
    ["stats", "--no-stream", "--format", "{{json .}}", ...containers],
    { maxBuffer: 1024 * 1024, windowsHide: true },
  );
  return stdout
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const value = JSON.parse(line) as {
        CPUPerc: string;
        MemUsage: string;
        Name: string;
        PIDs: string;
      };
      return {
        cpu: Number.parseFloat(value.CPUPerc),
        memoryMiB: memoryMiB(value.MemUsage.split("/")[0]!),
        name: value.Name,
        pids: Number(value.PIDs),
      };
    });
}

finitePositive(durationMs, "LOAD_DURATION_MS");
finitePositive(concurrency, "LOAD_CONCURRENCY");
assert.ok(targets.length > 0, "LOAD_TARGETS must contain at least one URL");

const results: Result[] = [];
const resourceSamples: ResourceSample[] = [];
const started = performance.now();
const deadline = started + durationMs;
let requestIndex = 0;

const sampler = (async () => {
  while (performance.now() < deadline) {
    resourceSamples.push(...(await resources()));
  }
})();

await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (performance.now() < deadline) {
      const target = targets[requestIndex++ % targets.length]!;
      const requestStarted = performance.now();
      let ok = false;
      try {
        const response = await fetch(target, {
          cache: "no-store",
          signal: AbortSignal.timeout(maximumP99Ms * 2),
        });
        ok = response.ok;
        await response.arrayBuffer();
      } catch {
        ok = false;
      }
      results.push({
        duration: performance.now() - requestStarted,
        ok,
        target,
      });
    }
  }),
);
await sampler;

const elapsedSeconds = (performance.now() - started) / 1000;
const errors = results.filter(({ ok }) => !ok).length;
const errorRate = errors / results.length;
const rps = results.length / elapsedSeconds;
const p95 = percentile(
  results.map(({ duration }) => duration),
  0.95,
);
const p99 = percentile(
  results.map(({ duration }) => duration),
  0.99,
);
const peakCpu = Math.max(...resourceSamples.map(({ cpu }) => cpu), 0);
const peakMemoryMiB = Math.max(
  ...resourceSamples.map(({ memoryMiB }) => memoryMiB),
  0,
);
const peakPids = Math.max(...resourceSamples.map(({ pids }) => pids), 0);

assert.ok(
  errorRate <= maximumErrorRate,
  `error rate ${errorRate} exceeds ${maximumErrorRate}`,
);
assert.ok(p95 <= maximumP95Ms, `P95 ${p95} ms exceeds ${maximumP95Ms} ms`);
assert.ok(p99 <= maximumP99Ms, `P99 ${p99} ms exceeds ${maximumP99Ms} ms`);
assert.ok(
  rps >= minimumRequestsPerSecond,
  `RPS ${rps} is below ${minimumRequestsPerSecond}`,
);
assert.ok(
  peakCpu <= maximumCpuPercent,
  `CPU ${peakCpu}% exceeds ${maximumCpuPercent}%`,
);
assert.ok(
  peakMemoryMiB <= maximumMemoryMiB,
  `memory ${peakMemoryMiB} MiB exceeds ${maximumMemoryMiB} MiB`,
);
assert.ok(peakPids <= maximumPids, `PIDs ${peakPids} exceeds ${maximumPids}`);

console.log(
  `Load verification passed: ${results.length} requests, ${rps.toFixed(1)} RPS, ` +
    `P95 ${p95.toFixed(1)} ms, P99 ${p99.toFixed(1)} ms, ${(errorRate * 100).toFixed(2)}% errors, ` +
    `peak CPU ${peakCpu.toFixed(1)}%, memory ${peakMemoryMiB.toFixed(1)} MiB, PIDs ${peakPids}`,
);
