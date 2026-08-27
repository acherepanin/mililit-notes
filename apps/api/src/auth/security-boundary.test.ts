import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { AccessPolicyService } from "./access-policy.service.js";
import { withDefaultAuthCallback } from "./auth-email-url.js";
import { isAllowedMutationOrigin } from "./csrf.js";

describe("authentication security boundary", () => {
  it("defaults verification redirects to the application origin", () => {
    const url = withDefaultAuthCallback(
      "http://localhost:3201/api/auth/verify-email?token=test&callbackURL=%2F",
      "http://localhost:3200",
    );

    expect(new URL(url).searchParams.get("callbackURL")).toBe(
      "http://localhost:3200",
    );
  });

  it("requires the configured origin for state-changing routes", () => {
    expect(
      isAllowedMutationOrigin("GET", undefined, "https://notes.test"),
    ).toBe(true);
    expect(
      isAllowedMutationOrigin("POST", undefined, "https://notes.test"),
    ).toBe(false);
    expect(
      isAllowedMutationOrigin(
        "POST",
        "https://attacker.test",
        "https://notes.test",
      ),
    ).toBe(false);
    expect(
      isAllowedMutationOrigin(
        "POST",
        "https://notes.test",
        "https://notes.test",
      ),
    ).toBe(true);
  });

  it("rejects cross-user access while allowing owner and administrator", () => {
    const policy = new AccessPolicyService();

    expect(() =>
      policy.assertOwnerOrAdmin({ id: 10, role: "user" }, 11),
    ).toThrow(ForbiddenException);
    expect(() =>
      policy.assertOwnerOrAdmin({ id: 10, role: "user" }, 10),
    ).not.toThrow();
    expect(() =>
      policy.assertOwnerOrAdmin({ id: 1, role: "admin" }, 11),
    ).not.toThrow();
  });
});
