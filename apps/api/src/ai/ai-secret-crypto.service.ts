import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import { Injectable } from "@nestjs/common";

const PREFIX = "enc:ai:v1:";

function deriveKey(value: string): Buffer {
  return createHash("sha256")
    .update("notes:ai-provider-key:v1\0")
    .update(value)
    .digest();
}

@Injectable()
export class AiSecretCryptoService {
  private readonly currentKey: Buffer;
  private readonly previousKey: Buffer | null;

  constructor() {
    const root =
      process.env.AI_PROVIDER_ENCRYPTION_KEY || process.env.BETTER_AUTH_SECRET;
    if (!root) {
      throw new Error(
        "AI_PROVIDER_ENCRYPTION_KEY or BETTER_AUTH_SECRET is required",
      );
    }
    this.currentKey = deriveKey(root);
    this.previousKey = process.env.AI_PROVIDER_ENCRYPTION_KEY_PREVIOUS
      ? deriveKey(process.env.AI_PROVIDER_ENCRYPTION_KEY_PREVIOUS)
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
    if (!value.startsWith(PREFIX)) {
      throw new Error("Unsupported AI provider credential format");
    }
    const payload = Buffer.from(value.slice(PREFIX.length), "base64url");
    for (const key of [this.currentKey, this.previousKey]) {
      if (!key || payload.length < 29) continue;
      try {
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
      } catch {
        // Try the previous rotation key.
      }
    }
    throw new Error("AI provider credential cannot be decrypted");
  }

  hint(value: string): string {
    const suffix = value.trim().slice(-4);
    return suffix ? `...${suffix}` : "configured";
  }
}
