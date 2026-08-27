import { scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

import argon2 from "argon2";

const scrypt = promisify(scryptCallback);
const legacyKeyLength = 64;

const argonOptions = {
  memoryCost: 19_456,
  parallelism: 1,
  timeCost: 2,
  type: argon2.argon2id,
} as const;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, argonOptions);
}

async function verifyLegacyScrypt(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const [algorithm, salt, encodedHash, extra] = storedHash.split(":");
  if (
    algorithm !== "scrypt" ||
    !salt ||
    !encodedHash ||
    extra !== undefined ||
    !/^[0-9a-f]+$/i.test(encodedHash)
  ) {
    return false;
  }

  const expected = Buffer.from(encodedHash, "hex");
  if (expected.length !== legacyKeyLength) {
    return false;
  }

  const candidate = (await scrypt(password, salt, legacyKeyLength)) as Buffer;
  return timingSafeEqual(candidate, expected);
}

export async function verifyPassword(input: {
  hash: string;
  password: string;
}): Promise<boolean> {
  if (input.hash.startsWith("scrypt:")) {
    return verifyLegacyScrypt(input.password, input.hash);
  }

  if (!input.hash.startsWith("$argon2id$")) {
    return false;
  }

  try {
    return await argon2.verify(input.hash, input.password);
  } catch {
    return false;
  }
}

export function isLegacyPasswordHash(hash: string | null): boolean {
  return hash?.startsWith("scrypt:") ?? false;
}
