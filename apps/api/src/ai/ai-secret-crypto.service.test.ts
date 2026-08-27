import { afterEach, describe, expect, it } from "vitest";

import { AiSecretCryptoService } from "./ai-secret-crypto.service.js";

describe("AiSecretCryptoService", () => {
  afterEach(() => {
    delete process.env.AI_PROVIDER_ENCRYPTION_KEY;
    delete process.env.AI_PROVIDER_ENCRYPTION_KEY_PREVIOUS;
    delete process.env.BETTER_AUTH_SECRET;
  });

  it("encrypts credentials without retaining plaintext", () => {
    process.env.AI_PROVIDER_ENCRYPTION_KEY = "current-test-key";
    const service = new AiSecretCryptoService();
    const encrypted = service.encrypt("sk-private-value-1234");

    expect(encrypted).toMatch(/^enc:ai:v1:/);
    expect(encrypted).not.toContain("sk-private-value-1234");
    expect(service.decrypt(encrypted)).toBe("sk-private-value-1234");
    expect(service.hint("sk-private-value-1234")).toBe("...1234");
  });

  it("reads credentials encrypted with the previous rotation key", () => {
    process.env.AI_PROVIDER_ENCRYPTION_KEY = "old-test-key";
    const encrypted = new AiSecretCryptoService().encrypt("rotated-secret");
    process.env.AI_PROVIDER_ENCRYPTION_KEY = "new-test-key";
    process.env.AI_PROVIDER_ENCRYPTION_KEY_PREVIOUS = "old-test-key";

    expect(new AiSecretCryptoService().decrypt(encrypted)).toBe(
      "rotated-secret",
    );
  });

  it("falls back to the auth secret when Compose provides an empty key", () => {
    process.env.AI_PROVIDER_ENCRYPTION_KEY = "";
    process.env.BETTER_AUTH_SECRET = "test-auth-secret";
    const service = new AiSecretCryptoService();

    expect(service.decrypt(service.encrypt("fallback-secret"))).toBe(
      "fallback-secret",
    );
  });
});
