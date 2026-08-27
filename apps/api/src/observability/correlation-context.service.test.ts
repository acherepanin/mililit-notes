import { describe, expect, it } from "vitest";

import { CorrelationContextService } from "./correlation-context.service.js";

describe("CorrelationContextService", () => {
  it("keeps concurrent async flows isolated", async () => {
    const context = new CorrelationContextService();
    const [first, second] = await Promise.all([
      context.run("request:first", async () => {
        await Promise.resolve();
        return context.current();
      }),
      context.run("request:second", async () => {
        await Promise.resolve();
        return context.current();
      }),
    ]);
    expect([first, second]).toEqual(["request:first", "request:second"]);
    expect(context.current()).toBeNull();
  });
});
