import { BadRequestException } from "@nestjs/common";
import { afterEach, describe, expect, it } from "vitest";

import { ProviderEndpointPolicyService } from "./provider-endpoint-policy.service.js";

describe("ProviderEndpointPolicyService", () => {
  const policy = new ProviderEndpointPolicyService();

  afterEach(() => {
    delete process.env.AI_PROVIDER_ENDPOINT_ALLOWLIST;
  });

  it("normalizes a public HTTPS API base URL", () => {
    expect(policy.normalize(" https://api.openai.com/v1/ ")).toBe(
      "https://api.openai.com/v1",
    );
  });

  it.each([
    "http://api.openai.com/v1",
    "https://localhost/v1",
    "https://127.0.0.1/v1",
    "https://[::1]/v1",
    "https://169.254.169.254/latest/meta-data",
    "https://user:password@example.com/v1",
    "https://example.com/v1?token=secret",
    "https://metadata.google.internal/v1",
  ])("rejects unsafe provider URL %s", (value) => {
    expect(() => policy.normalize(value)).toThrow(BadRequestException);
  });

  it("allows only an exact explicitly configured private endpoint", async () => {
    process.env.AI_PROVIDER_ENDPOINT_ALLOWLIST =
      "http://host.docker.internal:3219/v1";

    await expect(
      policy.assertAllowedForRequest("http://host.docker.internal:3219/v1/"),
    ).resolves.toBe("http://host.docker.internal:3219/v1");
    expect(() =>
      policy.normalize("http://host.docker.internal:3219/v2"),
    ).toThrow(BadRequestException);
  });
});
