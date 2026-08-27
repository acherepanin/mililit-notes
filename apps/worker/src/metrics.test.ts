import { describe, expect, it } from "vitest";

import { WorkerMetrics } from "./metrics.js";

describe("worker metrics", () => {
  it("records fixed queue labels without exception detail", async () => {
    const metrics = new WorkerMetrics();
    await expect(
      metrics.measureJob("integration-events", "process", async () => {
        throw new Error("secret payload");
      }),
    ).rejects.toThrow("secret payload");
    const output = await metrics.render();

    expect(output).toContain("notes_worker_jobs_total");
    expect(output).toContain('queue="integration-events"');
    expect(output).toContain('job_name="process"');
    expect(output).toContain('result="failure"');
    expect(output).not.toContain("secret payload");
  });
});
