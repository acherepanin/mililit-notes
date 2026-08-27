import { scryptSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  hashPassword,
  isLegacyPasswordHash,
  verifyPassword,
} from "./password.js";

describe("password compatibility", () => {
  it("accepts valid legacy scrypt hashes without accepting a wrong password", async () => {
    const password = "legacy-password";
    const salt = "0123456789abcdef0123456789abcdef";
    const hash = scryptSync(password, salt, 64).toString("hex");
    const stored = `scrypt:${salt}:${hash}`;

    expect(isLegacyPasswordHash(stored)).toBe(true);
    await expect(verifyPassword({ hash: stored, password })).resolves.toBe(
      true,
    );
    await expect(
      verifyPassword({ hash: stored, password: "wrong-password" }),
    ).resolves.toBe(false);
  });

  it("creates and verifies Argon2id hashes", async () => {
    const hash = await hashPassword("new-password");

    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(isLegacyPasswordHash(hash)).toBe(false);
    await expect(
      verifyPassword({ hash, password: "new-password" }),
    ).resolves.toBe(true);
  });
});
