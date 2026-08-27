import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import {
  encodeAdminHistoryCursor,
  parseAdminAuditList,
  parseAdminDiagnosticList,
} from "./admin-history.validation.js";

describe("admin history validation", () => {
  it("round-trips an opaque audit cursor and bounded filters", () => {
    const createdAt = new Date("2026-08-05T08:30:00.000Z");
    expect(
      parseAdminAuditList(
        encodeAdminHistoryCursor(createdAt, "activity", 42),
        "25",
        "activity",
        "notes",
        "7",
      ),
    ).toEqual({
      cursor: { createdAt, id: 42, source: "activity" },
      limit: 25,
      scope: "notes",
      source: "activity",
      userId: 7,
    });
  });

  it("rejects forged filters and cursor/source mismatches", () => {
    expect(() =>
      parseAdminDiagnosticList(undefined, "500", "request", undefined),
    ).toThrow(BadRequestException);
    expect(() =>
      parseAdminDiagnosticList(
        encodeAdminHistoryCursor(new Date(), "integration", 3),
        undefined,
        "request",
        undefined,
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      parseAdminAuditList(undefined, undefined, "all", "secrets", undefined),
    ).toThrow(BadRequestException);
  });
});
