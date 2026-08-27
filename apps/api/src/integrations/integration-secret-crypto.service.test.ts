import { afterEach, describe, expect, it } from "vitest";

import { IntegrationSecretCryptoService } from "./integration-secret-crypto.service.js";

describe("IntegrationSecretCryptoService", () => {
  afterEach(() => {
    delete process.env.BETTER_AUTH_SECRET;
    delete process.env.INTEGRATION_ENCRYPTION_KEY;
    delete process.env.INTEGRATION_ENCRYPTION_KEY_PREVIOUS;
  });

  it("encrypts credentials with a domain-specific authenticated format", () => {
    process.env.INTEGRATION_ENCRYPTION_KEY = "integration-current-key";
    const service = new IntegrationSecretCryptoService();
    const encrypted = service.encrypt("secret-value");
    expect(encrypted).toMatch(/^enc:integration:v1:/);
    expect(encrypted).not.toContain("secret-value");
    expect(service.decrypt(encrypted)).toBe("secret-value");
    expect(service.hint(encrypted)).toBe("...alue");
  });

  it("supports a previous integration key during rotation", () => {
    process.env.INTEGRATION_ENCRYPTION_KEY = "old-key";
    const encrypted = new IntegrationSecretCryptoService().encrypt("rotated");
    process.env.INTEGRATION_ENCRYPTION_KEY = "new-key";
    process.env.INTEGRATION_ENCRYPTION_KEY_PREVIOUS = "old-key";
    expect(new IntegrationSecretCryptoService().decrypt(encrypted)).toBe(
      "rotated",
    );
  });
});
