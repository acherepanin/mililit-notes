import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import {
  parseAdminId,
  parseAdminPlanUpdate,
  parseAdminSubscriptionAssignment,
} from "./admin-billing.validation.js";

describe("admin billing validation", () => {
  it("accepts bounded quota patches and normalizes plan fields", () => {
    expect(
      parseAdminPlanUpdate({
        currency: "RUB",
        entitlements: {
          ai: { enabled: true, monthlyTokenLimit: 1_000_000 },
          exportImport: { enabled: false },
          files: { storageLimitBytes: 1024 ** 3 },
          publicShare: { enabled: true },
          templates: { enabled: true },
          versioning: { enabled: false },
          voice: { enabled: true },
          workspace: {
            enabled: true,
            maxNoteContentBytes: 2 * 1024 ** 2,
            maxNotes: 5_000,
          },
        },
        expectedRevision: 3,
        name: "  Pro  ",
      }),
    ).toMatchObject({
      currency: "rub",
      entitlements: {
        ai: { enabled: true, monthlyTokenLimit: 1_000_000 },
        exportImport: { enabled: false },
        files: { storageLimitBytes: 1024 ** 3 },
        publicShare: { enabled: true },
        templates: { enabled: true },
        versioning: { enabled: false },
        voice: { enabled: true },
        workspace: {
          enabled: true,
          maxNoteContentBytes: 2 * 1024 ** 2,
          maxNotes: 5_000,
        },
      },
      name: "Pro",
    });
    expect(parseAdminId("42", "planId")).toBe(42);
  });

  it("rejects mass assignment and unbounded entitlements", () => {
    expect(() =>
      parseAdminPlanUpdate({
        expectedRevision: 1,
        slug: "enterprise",
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      parseAdminPlanUpdate({
        entitlements: { files: { bucket: "private" } },
        expectedRevision: 1,
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      parseAdminPlanUpdate({
        entitlements: { commands: { enabled: true } },
        expectedRevision: 1,
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      parseAdminPlanUpdate({
        entitlements: {
          workspace: { maxNoteContentBytes: 2 * 1024 ** 2 + 1 },
        },
        expectedRevision: 1,
      }),
    ).toThrow(BadRequestException);
  });

  it("requires explicit assignment concurrency state", () => {
    expect(
      parseAdminSubscriptionAssignment({
        expectedCurrentSubscriptionId: null,
        planId: 2,
      }),
    ).toEqual({ expectedCurrentSubscriptionId: null, planId: 2 });
    expect(() => parseAdminSubscriptionAssignment({ planId: 2 })).toThrow(
      BadRequestException,
    );
  });
});
