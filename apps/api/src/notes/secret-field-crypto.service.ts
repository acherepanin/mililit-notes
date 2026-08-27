import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import { Injectable } from "@nestjs/common";

const CURRENT_PREFIX = "enc:v2:";
const LEGACY_PREFIX = "enc:v1:";
const SECRET_PLACEHOLDER = "[secret hidden]";

function keyFrom(value: string, context = "") {
  return createHash("sha256")
    .update(context)
    .update("\0")
    .update(value)
    .digest();
}

function isSecretTag(tag: string) {
  return (
    /\bdata-secret\s*=\s*(["'])true\1/i.test(tag) ||
    /\bdata-kind\s*=\s*(["'])(?:password|credential|token|secret)\1/i.test(tag)
  );
}

function replaceCopyFieldValues(
  contentHtml: string,
  transform: (value: string, tag: string) => string,
) {
  if (!contentHtml.includes("data-copy-field")) return contentHtml;
  return contentHtml.replace(
    /<div\b(?=[^>]*\bdata-copy-field\b)[^>]*>/gi,
    (tag) =>
      tag.replace(
        /\bdata-value\s*=\s*(["'])(.*?)\1/i,
        (_attribute, quote: string, value: string) =>
          `data-value=${quote}${transform(value, tag)}${quote}`,
      ),
  );
}

@Injectable()
export class SecretFieldCryptoService {
  private readonly currentKey: Buffer;
  private readonly legacyKey: Buffer | null;

  constructor() {
    const rootKey =
      process.env.NOTE_FIELD_ENCRYPTION_KEY ?? process.env.BETTER_AUTH_SECRET;
    if (!rootKey) {
      throw new Error(
        "NOTE_FIELD_ENCRYPTION_KEY or BETTER_AUTH_SECRET is required",
      );
    }
    this.currentKey = keyFrom(rootKey, "notes:data-field:v2");
    this.legacyKey = process.env.LEGACY_SECRET_ENCRYPTION_KEY
      ? keyFrom(process.env.LEGACY_SECRET_ENCRYPTION_KEY)
      : null;
  }

  encryptHtml(contentHtml: string) {
    return replaceCopyFieldValues(contentHtml, (value, tag) => {
      if (
        !isSecretTag(tag) ||
        value.startsWith(CURRENT_PREFIX) ||
        value.startsWith(LEGACY_PREFIX)
      ) {
        return value;
      }
      return this.encrypt(value);
    });
  }

  decryptHtml(contentHtml: string) {
    return replaceCopyFieldValues(contentHtml, (value) => this.decrypt(value));
  }

  redactHtml(contentHtml: string) {
    return replaceCopyFieldValues(contentHtml, (value, tag) =>
      isSecretTag(tag) ? SECRET_PLACEHOLDER : value,
    );
  }

  redactText(contentText: string) {
    return contentText.replace(
      /\b(password|пароль|token|токен|credential|api[-_\s]?key|secret|секрет)\b\s*[:=-]\s*[^\n,;]+/gi,
      (_match, label: string) => `${label}: ${SECRET_PLACEHOLDER}`,
    );
  }

  private encrypt(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.currentKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(value, "utf8"),
      cipher.final(),
    ]);
    return `${CURRENT_PREFIX}${Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url")}`;
  }

  private decrypt(value: string) {
    const key = value.startsWith(CURRENT_PREFIX)
      ? this.currentKey
      : value.startsWith(LEGACY_PREFIX)
        ? this.legacyKey
        : null;
    if (!key) return value.startsWith("enc:v") ? "" : value;
    const prefix = value.startsWith(CURRENT_PREFIX)
      ? CURRENT_PREFIX
      : LEGACY_PREFIX;
    try {
      const payload = Buffer.from(value.slice(prefix.length), "base64url");
      if (payload.length < 29) return "";
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
      return "";
    }
  }
}
