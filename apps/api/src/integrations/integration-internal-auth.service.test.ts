import { createHmac } from "node:crypto";

import { ForbiddenException } from "@nestjs/common";
import { afterEach, describe, expect, it } from "vitest";

import { IntegrationInternalAuthService } from "./integration-internal-auth.service.js";

const originalSecret = process.env.INTERNAL_INTEGRATION_SECRET;

afterEach(() => {
  if (originalSecret === undefined)
    delete process.env.INTERNAL_INTEGRATION_SECRET;
  else process.env.INTERNAL_INTEGRATION_SECRET = originalSecret;
});

describe("IntegrationInternalAuthService", () => {
  it("accepts a current body signature and rejects replayed timestamps", () => {
    process.env.INTERNAL_INTEGRATION_SECRET = "test-internal-secret";
    const service = new IntegrationInternalAuthService();
    const body = { eventId: "1" };
    const timestamp = Date.now();
    const signature = createHmac("sha256", "test-internal-secret")
      .update(`${timestamp}.${JSON.stringify(body)}`)
      .digest("hex");

    expect(() =>
      service.verify(body, String(timestamp), signature),
    ).not.toThrow();
    expect(() =>
      service.verify(body, String(timestamp - 600_000), signature),
    ).toThrow(ForbiddenException);
  });
});
