import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import {
  parseRetentionPolicyKey,
  parseRetentionPolicyUpdate,
} from "./admin-retention.validation.js";

describe("admin retention validation", () => {
  it("accepts allowlisted policy changes", () => {
    expect(parseRetentionPolicyKey("request_error_logs")).toBe(
      "request_error_logs",
    );
    expect(
      parseRetentionPolicyUpdate({ enabled: false, retentionDays: 45 }),
    ).toEqual({ enabled: false, retentionDays: 45 });
  });

  it("rejects forged keys, mass assignment, and unsafe ranges", () => {
    expect(() => parseRetentionPolicyKey("users")).toThrow(BadRequestException);
    expect(() =>
      parseRetentionPolicyUpdate({ lastError: null, retentionDays: 30 }),
    ).toThrow("Unsupported fields");
    expect(() => parseRetentionPolicyUpdate({ retentionDays: 1 })).toThrow(
      BadRequestException,
    );
    expect(() => parseRetentionPolicyUpdate({})).toThrow(BadRequestException);
  });
});
