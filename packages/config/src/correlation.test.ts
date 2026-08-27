import { describe, expect, it } from "vitest";

import { isCorrelationId } from "./correlation.js";

describe("correlation IDs", () => {
  it("accepts bounded opaque IDs and rejects header injection", () => {
    expect(isCorrelationId("edge:request-42.trace_1")).toBe(true);
    expect(isCorrelationId("secret\nheader")).toBe(false);
    expect(isCorrelationId("x".repeat(101))).toBe(false);
  });
});
