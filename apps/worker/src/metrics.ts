import {
  collectDefaultMetrics,
  Counter,
  Histogram,
  Registry,
} from "prom-client";

const JOB_NAMES = new Set([
  "files.cleanup-expired-uploads",
  "password-reset",
  "process",
  "system.cleanup-data-retention",
  "verification",
]);
const QUEUES = new Set(["auth-email", "integration-events", "system"]);

function bounded(value: unknown, allowed: ReadonlySet<string>): string {
  return typeof value === "string" && allowed.has(value) ? value : "other";
}

export class WorkerMetrics {
  private readonly duration = new Histogram<"job_name" | "queue" | "result">({
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120],
    help: "Notes AI worker job duration in seconds.",
    labelNames: ["queue", "job_name", "result"],
    name: "notes_worker_job_duration_seconds",
    registers: [],
  });
  private readonly jobs = new Counter<"job_name" | "queue" | "result">({
    help: "Completed Notes AI worker jobs.",
    labelNames: ["queue", "job_name", "result"],
    name: "notes_worker_jobs_total",
    registers: [],
  });
  private readonly registry = new Registry();

  constructor() {
    this.registry.registerMetric(this.duration);
    this.registry.registerMetric(this.jobs);
    collectDefaultMetrics({ prefix: "notes_worker_", register: this.registry });
  }

  async measureJob<Result>(
    queueValue: unknown,
    jobValue: unknown,
    operation: () => Promise<Result>,
  ): Promise<Result> {
    const startedAt = performance.now();
    const labels = {
      job_name: bounded(jobValue, JOB_NAMES),
      queue: bounded(queueValue, QUEUES),
      result: "success",
    };
    try {
      return await operation();
    } catch (error) {
      labels.result = "failure";
      throw error;
    } finally {
      const durationSeconds = (performance.now() - startedAt) / 1_000;
      this.jobs.inc(labels);
      this.duration.observe(labels, Math.max(0, durationSeconds));
    }
  }

  get contentType(): string {
    return this.registry.contentType;
  }

  render(): Promise<string> {
    return this.registry.metrics();
  }
}
