import { ForbiddenException, PayloadTooLargeException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import {
  normalizeEntitlements,
  type EffectiveEntitlements,
  EntitlementsService,
} from "./entitlements.service.js";

describe("entitlements normalization", () => {
  it("keeps legacy functionality enabled while files stay plan-gated", () => {
    const entitlements = normalizeEntitlements({});
    expect(entitlements.files).toEqual({
      enabled: false,
      storageLimitBytes: 0,
    });
    expect(entitlements.workspace.enabled).toBe(true);
    expect(entitlements.templates.enabled).toBe(true);
    expect(entitlements.publicShare.enabled).toBe(true);
    expect(entitlements.versioning.enabled).toBe(true);
    expect(entitlements.ai.enabled).toBe(true);
    expect(entitlements.voice.enabled).toBe(true);
  });

  it("normalizes bounded plan knobs without trusting unknown shapes", () => {
    expect(
      normalizeEntitlements({
        ai: { enabled: false, monthlyTokenLimit: 1000 },
        files: { enabled: true, storageLimitBytes: null },
        workspace: { maxNoteContentBytes: 2048, maxNotes: 25 },
      }),
    ).toMatchObject({
      ai: { enabled: false, monthlyTokenLimit: 1000 },
      files: { enabled: true, storageLimitBytes: null },
      workspace: { maxNoteContentBytes: 2048, maxNotes: 25 },
    });
    expect(
      normalizeEntitlements({
        files: { enabled: true, storageLimitBytes: -1 },
        workspace: { maxNotes: "many" },
      }),
    ).toMatchObject({
      files: { enabled: true, storageLimitBytes: 0 },
      workspace: { maxNotes: null },
    });
  });
});

describe("entitlements local assertions", () => {
  it("rejects over-limit UTF-8 note content", () => {
    const service = new EntitlementsService({} as never);
    const effective = {
      workspace: {
        enabled: true,
        maxNoteContentBytes: 4,
        maxNotes: null,
      },
    } as EffectiveEntitlements;
    expect(() => service.assertNoteContentSize(effective, "аб", "в")).toThrow(
      PayloadTooLargeException,
    );
  });

  it("filters integration tools through the effective plan", async () => {
    class TestEntitlementsService extends EntitlementsService {
      override async getEffective(): Promise<EffectiveEntitlements> {
        return {
          ...normalizeEntitlements({
            files: { enabled: false },
            publicShare: { enabled: false },
            templates: { enabled: true },
            versioning: { enabled: false },
            workspace: { enabled: true },
          }),
          plan: { id: 1, name: "Free", slug: "free" },
          subscriptionId: null,
        };
      }
    }
    const service = new TestEntitlementsService({} as never);
    await expect(
      service.integrationToolAllowlist(1, [
        "notes.read",
        "attachments.list",
        "templates.list",
        "versions.list",
        "shareLinks.create",
      ]),
    ).resolves.toEqual(["notes.read", "templates.list"]);
  });

  it("rejects every integration tool when AI is disabled", async () => {
    class TestEntitlementsService extends EntitlementsService {
      override async getEffective(): Promise<EffectiveEntitlements> {
        return {
          ...normalizeEntitlements({ ai: { enabled: false } }),
          plan: { id: 1, name: "Free", slug: "free" },
          subscriptionId: null,
        };
      }
    }
    const service = new TestEntitlementsService({} as never);
    await expect(
      service.integrationToolAllowlist(1, ["notes.read"]),
    ).resolves.toEqual([]);
    await expect(service.assertVoiceEnabled(1)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
