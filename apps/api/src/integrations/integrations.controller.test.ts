import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { InternalIntegrationsController } from "./integrations.controller.js";

const job = {
  correlationId: "integration:42",
  eventId: "event-42",
  ledgerId: 42,
  payload: { update_id: 42 },
  provider: "telegram" as const,
};

describe("internal integration correlation", () => {
  it("requires the request header to match the signed job", () => {
    const auth = { verify: vi.fn() };
    const processing = { process: vi.fn(() => ({ duplicate: false })) };
    const controller = new InternalIntegrationsController(
      auth as never,
      processing as never,
    );

    expect(() =>
      controller.process(job, "integration:other", "1", "signature"),
    ).toThrow(ForbiddenException);
    expect(processing.process).not.toHaveBeenCalled();

    expect(
      controller.process(job, job.correlationId, "1", "signature"),
    ).toEqual({ duplicate: false });
    expect(processing.process).toHaveBeenCalledWith(job);
  });
});
