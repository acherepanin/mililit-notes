import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SecretFieldCryptoService } from "./secret-field-crypto.service.js";

describe("SecretFieldCryptoService", () => {
  beforeEach(() => {
    process.env.NOTE_FIELD_ENCRYPTION_KEY = "test-only-field-key";
  });
  afterEach(() => {
    delete process.env.NOTE_FIELD_ENCRYPTION_KEY;
  });

  it("encrypts secret copy fields while preserving ordinary fields", () => {
    const service = new SecretFieldCryptoService();
    const html =
      '<p>Before</p><div class="copy" data-value="login" data-copy-field data-kind="text"></div><div data-kind="token" data-copy-field="true" data-value="top-secret"></div>';
    const stored = service.encryptHtml(html);

    expect(stored).toContain('data-value="login"');
    expect(stored).not.toContain("top-secret");
    expect(stored).toContain("enc:v2:");
    expect(service.decryptHtml(stored)).toBe(html);
  });

  it("redacts hostile attribute orders and matching text labels", () => {
    const service = new SecretFieldCryptoService();
    expect(
      service.redactHtml(
        '<div data-value="value" data-secret="true" data-copy-field="1"></div>',
      ),
    ).toContain('data-value="[secret hidden]"');
    expect(service.redactText("token = value\nnormal text")).toBe(
      "token: [secret hidden]\nnormal text",
    );
  });
});
