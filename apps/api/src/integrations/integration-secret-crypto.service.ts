import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import { Injectable } from "@nestjs/common";

const PREFIX = "enc:integration:v1:";
const LEGACY_PREFIX = "ai:v1:";

function deriveKey(domain: string, value: string): Buffer {
  return createHash("sha256")
    .update(domain)
    .update("\0")
    .update(value)
    .digest();
}

function decryptPayload(value: string, prefix: string, key: Buffer): string {
  const payload = Buffer.from(value.slice(prefix.length), "base64url");
  if (payload.length < 29)
    throw new Error("Invalid encrypted integration credential");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    payload.subarray(0, 12),
  );
  decipher.setAuthTag(payload.subarray(12, 28));
  return Buffer.concat([
    decipher.update(payload.subarray(28)),
    decipher.final(),
  ]).toString("utf8");
}

@Injectable()
export class IntegrationSecretCryptoService {
  private readonly currentKey: Buffer;
  private readonly previousKey: Buffer | null;
  private readonly legacyKey: Buffer | null;

  constructor() {
    const root =
      process.env.INTEGRATION_ENCRYPTION_KEY ||
      process.env.AI_PROVIDER_ENCRYPTION_KEY ||
      process.env.BETTER_AUTH_SECRET;
    if (!root)
      throw new Error(
        "INTEGRATION_ENCRYPTION_KEY or BETTER_AUTH_SECRET is required",
      );
    this.currentKey = deriveKey("notes:integration-key:v1", root);
    this.previousKey = process.env.INTEGRATION_ENCRYPTION_KEY_PREVIOUS
      ? deriveKey(
          "notes:integration-key:v1",
          process.env.INTEGRATION_ENCRYPTION_KEY_PREVIOUS,
        )
      : null;
    this.legacyKey = process.env.AI_CREDENTIALS_ENCRYPTION_KEY
      ? createHash("sha256")
          .update(process.env.AI_CREDENTIALS_ENCRYPTION_KEY)
          .digest()
      : null;
  }

  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.currentKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(value, "utf8"),
      cipher.final(),
    ]);
    return `${PREFIX}${Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url")}`;
  }

  decrypt(value: string): string {
    if (value.startsWith(LEGACY_PREFIX) && this.legacyKey) {
      return decryptPayload(value, LEGACY_PREFIX, this.legacyKey);
    }
    if (!value.startsWith(PREFIX))
      throw new Error("Unsupported integration credential format");
    for (const key of [this.currentKey, this.previousKey]) {
      if (!key) continue;
      try {
        return decryptPayload(value, PREFIX, key);
      } catch {
        // Try the previous rotation key.
      }
    }
    throw new Error("Integration credential cannot be decrypted");
  }

  hint(encrypted: string | null): string | null {
    if (!encrypted) return null;
    try {
      const value = this.decrypt(encrypted).trim();
      return value ? `...${value.slice(-4)}` : "configured";
    } catch {
      return "configured";
    }
  }
}
