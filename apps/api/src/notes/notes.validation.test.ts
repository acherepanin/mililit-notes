import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import {
  parseMoveNote,
  parseSetTags,
  parseUpdateNote,
} from "./notes.validation.js";

describe("notes validation", () => {
  it("normalizes tags and requires optimistic revisions", () => {
    expect(
      parseSetTags({ revision: 2, tags: [" Work ", "work", "AI"] }),
    ).toEqual({ revision: 2, tags: ["work", "ai"] });
    expect(() => parseUpdateNote({ name: "Missing revision" })).toThrow(
      BadRequestException,
    );
  });

  it("accepts root moves and rejects negative positions", () => {
    expect(parseMoveNote({ parentId: null, position: 0, revision: 3 })).toEqual(
      { parentId: null, position: 0, revision: 3 },
    );
    expect(() =>
      parseMoveNote({ parentId: null, position: -1, revision: 3 }),
    ).toThrow(BadRequestException);
  });
});
