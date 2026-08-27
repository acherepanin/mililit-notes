import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import {
  parseArchiveSelection,
  parseCompleteUpload,
  parseCreateUpload,
  parseFilePatch,
  parseInline,
  sanitizeFileName,
  sanitizeFolderName,
} from "./files.validation.js";

describe("file request validation", () => {
  it("normalizes safe names and strips path separators", () => {
    expect(sanitizeFileName(" reports\\2026/q1.txt ")).toBe(
      "reports-2026-q1.txt",
    );
    expect(sanitizeFolderName(" projects/current ")).toBe("projects-current");
  });

  it.each(["", ".", "..", "\u0000"])("rejects invalid file name %j", (name) => {
    expect(() => sanitizeFileName(name)).toThrow(BadRequestException);
  });

  it("validates upload size, checksum and ownership references", () => {
    expect(
      parseCreateUpload({
        checksumSha256: "A".repeat(64),
        fileName: "data.json",
        folderId: "12",
        mimeType: "Application/JSON",
        noteId: null,
        sizeBytes: 42,
      }),
    ).toEqual({
      checksumSha256: "a".repeat(64),
      fileName: "data.json",
      folderId: 12,
      mimeType: "application/json",
      noteId: null,
      sizeBytes: 42,
    });
    expect(() => parseCreateUpload({ fileName: "x", sizeBytes: 0 })).toThrow(
      BadRequestException,
    );
  });

  it("sorts complete multipart input and rejects duplicate parts", () => {
    expect(
      parseCompleteUpload({
        parts: [
          { etag: "second", partNumber: 2 },
          { etag: "first", partNumber: 1 },
        ],
      }),
    ).toEqual({
      parts: [
        { etag: "first", partNumber: 1 },
        { etag: "second", partNumber: 2 },
      ],
    });
    expect(() =>
      parseCompleteUpload({
        parts: [
          { etag: "first", partNumber: 1 },
          { etag: "again", partNumber: 1 },
        ],
      }),
    ).toThrow(BadRequestException);
  });

  it("requires an explicit file patch and a valid inline flag", () => {
    expect(() => parseFilePatch({})).toThrow(BadRequestException);
    expect(parseInline(undefined)).toBe(false);
    expect(parseInline("true")).toBe(true);
    expect(() => parseInline("yes")).toThrow(BadRequestException);
  });

  it("parses bounded unique archive selections", () => {
    expect(parseArchiveSelection("3,1", "8", "12")).toEqual({
      fileIds: [3, 1],
      folderIds: [8],
      noteId: 12,
    });
    expect(() => parseArchiveSelection("1,1", undefined, undefined)).toThrow(
      BadRequestException,
    );
    expect(() =>
      parseArchiveSelection(
        Array.from({ length: 201 }, (_, index) => index + 1).join(","),
        undefined,
        undefined,
      ),
    ).toThrow(BadRequestException);
  });
});
