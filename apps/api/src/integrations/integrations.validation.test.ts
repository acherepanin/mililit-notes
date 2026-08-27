import { describe, expect, it } from "vitest";

import {
  parseAdminIntegration,
  parseIntegrationProvider,
  parseUserIntegration,
} from "./integrations.validation.js";

describe("integration validation", () => {
  it("accepts bounded admin and user settings", () => {
    expect(
      parseAdminIntegration({
        enabled: true,
        secret: "webhook-secret",
        webhookUrl: "https://notes.example/api/integrations/webhooks/telegram",
      }),
    ).toMatchObject({ enabled: true, secret: "webhook-secret" });
    expect(
      parseUserIntegration({
        accessMode: "write",
        permissions: { readNotes: true, writeNotes: true },
      }),
    ).toMatchObject({
      accessMode: "write",
      permissions: { readNotes: true, writeNotes: true },
    });
    expect(parseIntegrationProvider("telegram")).toBe("telegram");
  });

  it("rejects mass assignment and unsafe webhook URLs", () => {
    expect(() =>
      parseUserIntegration({ linkedExternalId: "attacker" }),
    ).toThrow("Unsupported fields");
    expect(() =>
      parseAdminIntegration({ webhookUrl: "http://localhost/webhook" }),
    ).toThrow("must use HTTPS");
    expect(() => parseIntegrationProvider("email")).toThrow(
      "Unsupported integration provider",
    );
  });
});
