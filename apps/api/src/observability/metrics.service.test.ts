import { describe, expect, it } from "vitest";

import { metricRoute, MetricsService } from "./metrics.service.js";

describe("API metrics", () => {
  it("uses bounded route templates without request identifiers", async () => {
    const metrics = new MetricsService();
    const end = metrics.beginHttp("get", "/api/notes/:id");
    metrics.observeHttp("get", "/api/notes/:id", 204, 0.025);
    end();
    const output = await metrics.render();

    expect(output).toContain("notes_api_http_requests_total");
    expect(output).toContain('route="/api/notes/:id"');
    expect(output).toContain('status_class="2xx"');
    expect(metricRoute("/api/notes/42?token=secret")).toBe("unmatched");
    expect(output).not.toContain("secret");
  });
});
