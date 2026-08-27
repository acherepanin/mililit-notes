import { createHmac, timingSafeEqual } from "node:crypto";

import { ForbiddenException, Injectable } from "@nestjs/common";

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1_000;

@Injectable()
export class IntegrationInternalAuthService {
  private readonly secret: string;

  constructor() {
    const secret = process.env.INTERNAL_INTEGRATION_SECRET?.trim();
    if (!secret) throw new Error("INTERNAL_INTEGRATION_SECRET is required");
    this.secret = secret;
  }

  verify(
    body: unknown,
    timestampValue?: string,
    signatureValue?: string,
  ): void {
    const timestamp = Number(timestampValue);
    if (
      !Number.isSafeInteger(timestamp) ||
      Math.abs(Date.now() - timestamp) > MAX_CLOCK_SKEW_MS ||
      !signatureValue
    ) {
      throw new ForbiddenException("Invalid internal integration signature");
    }
    const expected = createHmac("sha256", this.secret)
      .update(`${timestamp}.${JSON.stringify(body)}`)
      .digest("hex");
    const expectedBytes = Buffer.from(expected);
    const suppliedBytes = Buffer.from(signatureValue);
    if (
      suppliedBytes.length !== expectedBytes.length ||
      !timingSafeEqual(expectedBytes, suppliedBytes)
    ) {
      throw new ForbiddenException("Invalid internal integration signature");
    }
  }
}
