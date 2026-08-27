import { afterEach, describe, expect, it, vi } from "vitest";

import {
  INTEGRATION_EVENT_ATTEMPTS,
  integrationFailureSchedule,
} from "./integration-events.js";

afterEach(() => vi.useRealTimers());

describe("integration event retry schedule", () => {
  it("backs off retryable failures and marks the final attempt exhausted", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T00:00:00.000Z"));

    expect(integrationFailureSchedule(1)).toEqual({
      exhausted: false,
      retryAt: new Date("2026-08-05T00:00:01.000Z"),
    });
    expect(integrationFailureSchedule(INTEGRATION_EVENT_ATTEMPTS)).toEqual({
      exhausted: true,
      retryAt: new Date("2026-08-05T00:00:00.000Z"),
    });
  });
});
