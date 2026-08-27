import { describe, expect, it } from "vitest";

import { canonicalJson, canonicalJsonSha256 } from "./canonical-json.js";

describe("canonical JSON", () => {
  it("binds equivalent objects to the same hash", () => {
    const left = { noteId: 4, patch: { name: "A", pinned: true } };
    const right = { patch: { pinned: true, name: "A" }, noteId: 4 };

    expect(canonicalJson(left)).toBe(canonicalJson(right));
    expect(canonicalJsonSha256(left)).toBe(canonicalJsonSha256(right));
  });

  it("changes the hash when any argument changes", () => {
    expect(canonicalJsonSha256({ noteId: 4 })).not.toBe(
      canonicalJsonSha256({ noteId: 5 }),
    );
  });

  it("rejects values that JSON cannot represent safely", () => {
    expect(() => canonicalJson({ value: undefined })).toThrow();
    expect(() => canonicalJson({ value: Number.NaN })).toThrow();
  });
});
