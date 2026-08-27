import { describe, expect, it } from "vitest";

import { readAuthEnvironment, readSmtpEnvironment } from "./auth.js";

describe("auth environment", () => {
  it("derives WebAuthn settings from the public app origin", () => {
    const environment = readAuthEnvironment({
      APP_ORIGIN: "https://notes.example.com",
      BETTER_AUTH_SECRET: "a".repeat(32),
      DATABASE_URL: "postgresql://db/notes",
      REDIS_URL: "redis://cache/0",
    });

    expect(environment.WEBAUTHN_ORIGIN).toBe("https://notes.example.com");
    expect(environment.WEBAUTHN_RP_ID).toBe("notes.example.com");
  });

  it("requires SMTP credentials as a pair", () => {
    expect(() =>
      readSmtpEnvironment({
        SMTP_HOST: "mail.internal",
        SMTP_USER: "notes",
      }),
    ).toThrow(/SMTP_USER and SMTP_PASS/);
  });
});
