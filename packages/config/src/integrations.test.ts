import { describe, expect, it } from "vitest";

import { isIntegrationEventJob } from "./integrations.js";

describe("integration event contract", () => {
  it("accepts only complete Telegram or VK jobs", () => {
    expect(
      isIntegrationEventJob({
        correlationId: "correlation",
        eventId: "42",
        ledgerId: 1,
        payload: {},
        provider: "telegram",
        traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
        tracestate: "notes=phase9",
      }),
    ).toBe(true);
    expect(
      isIntegrationEventJob({
        correlationId: "correlation",
        eventId: "42",
        ledgerId: 0,
        payload: [],
        provider: "other",
      }),
    ).toBe(false);
    expect(
      isIntegrationEventJob({
        correlationId: "correlation",
        eventId: "42",
        ledgerId: 1,
        payload: {},
        provider: "telegram",
        traceparent: "00-00000000000000000000000000000000-00f067aa0ba902b7-01",
      }),
    ).toBe(false);
  });
});
