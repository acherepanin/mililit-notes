import { describe, expect, it } from "vitest";

import { createAuthEmailMessage } from "./auth-email.js";

describe("auth email", () => {
  it("escapes link markup and rejects non-HTTP URLs", () => {
    const message = createAuthEmailMessage({
      correlationId: "email:test",
      kind: "verification",
      recipient: "user@example.com",
      url: "https://notes.example.com/verify?a=1&b=2",
    });

    expect(message.html).toContain("a=1&amp;b=2");
    expect(() =>
      createAuthEmailMessage({
        correlationId: "email:test",
        kind: "password-reset",
        recipient: "user@example.com",
        url: "javascript:alert(1)",
      }),
    ).toThrow(/http/);
  });
});
