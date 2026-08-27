import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { AiPolicyService } from "./ai-policy.service.js";

describe("AiPolicyService", () => {
  const policy = new AiPolicyService();

  it("keeps destructive and external actions behind confirmation", () => {
    expect(policy.requiresConfirmation("notes.delete")).toBe(true);
    expect(policy.requiresConfirmation("shareLinks.create")).toBe(true);
    expect(policy.requiresConfirmation("notes.read")).toBe(false);
  });

  it("rejects unknown prompt policies and tools", () => {
    expect(() => policy.assertSecurityPolicy("editable-policy")).toThrow(
      BadRequestException,
    );
    expect(() => policy.assertTools(["notes.read", "shell.execute"])).toThrow(
      BadRequestException,
    );
  });
});
