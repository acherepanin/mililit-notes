import { createHash } from "node:crypto";

function serialize(value: unknown, seen: Set<object>): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("JSON number must be finite");
    return JSON.stringify(value);
  }
  if (typeof value !== "object") {
    throw new Error("Value is not JSON serializable");
  }
  if (seen.has(value)) throw new Error("JSON value cannot contain cycles");
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((item) => serialize(item, seen)).join(",")}]`;
    }
    const prototype = Object.getPrototypeOf(value) as unknown;
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error("JSON object must be plain");
    }
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${serialize(record[key], seen)}`)
      .join(",")}}`;
  } finally {
    seen.delete(value);
  }
}

export function canonicalJson(value: unknown): string {
  return serialize(value, new Set());
}

export function canonicalJsonSha256(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
