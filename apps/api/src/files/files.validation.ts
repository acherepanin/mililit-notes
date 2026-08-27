import { BadRequestException } from "@nestjs/common";

import type {
  CompleteUploadInput,
  CreateUploadInput,
  FileArchiveInput,
  FilePatchInput,
} from "./files.types.js";

const MAX_FILE_SIZE = 5 * 1024 ** 4;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestException("Request body must be an object");
  }
  return value as Record<string, unknown>;
}

function integer(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new BadRequestException(`${name} must be an integer`);
  }
  return value;
}

function nullableId(value: unknown, name: string): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "string" ? Number(value) : value;
  const id = integer(parsed, name);
  if (id < 1) throw new BadRequestException(`${name} must be positive`);
  return id;
}

function text(value: unknown, name: string, max: number): string {
  if (typeof value !== "string") {
    throw new BadRequestException(`${name} must be a string`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > max) {
    throw new BadRequestException(`${name} must contain 1-${max} characters`);
  }
  return normalized;
}

function stripControlCharacters(value: string): string {
  return [...value]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join("");
}

export function sanitizeFileName(value: unknown): string {
  const name = stripControlCharacters(text(value, "fileName", 255))
    .replace(/[\\/]+/g, "-")
    .trim();
  if (!name || name === "." || name === "..") {
    throw new BadRequestException("fileName is invalid");
  }
  return name;
}

export function sanitizeFolderName(value: unknown): string {
  const name = stripControlCharacters(text(value, "name", 160))
    .replace(/[\\/]+/g, "-")
    .trim();
  if (!name || name === "." || name === "..") {
    throw new BadRequestException("name is invalid");
  }
  return name;
}

export function parseCreateFolder(value: unknown): {
  name: string;
  parentId: number | null;
} {
  const body = record(value);
  return {
    name: sanitizeFolderName(body.name),
    parentId: nullableId(body.parentId, "parentId"),
  };
}

export function parseRenameFolder(value: unknown): { name: string } {
  const body = record(value);
  return { name: sanitizeFolderName(body.name) };
}

export function parseMoveFolder(value: unknown): { parentId: number | null } {
  const body = record(value);
  return { parentId: nullableId(body.parentId, "parentId") };
}

export function parseDuplicateFile(value: unknown): {
  folderId: number | null;
} {
  const body = record(value);
  return { folderId: nullableId(body.folderId, "folderId") };
}

export function parseCreateUpload(value: unknown): CreateUploadInput {
  const body = record(value);
  const sizeBytes = integer(body.sizeBytes, "sizeBytes");
  if (sizeBytes < 1 || sizeBytes > MAX_FILE_SIZE) {
    throw new BadRequestException("sizeBytes is outside the S3 file limit");
  }
  const rawMime = body.mimeType ?? "application/octet-stream";
  const mimeType = text(rawMime, "mimeType", 255).toLocaleLowerCase("en");
  const checksum = body.checksumSha256;
  if (
    checksum !== undefined &&
    checksum !== null &&
    (typeof checksum !== "string" || !/^[0-9a-fA-F]{64}$/.test(checksum))
  ) {
    throw new BadRequestException("checksumSha256 must be a SHA-256 hex value");
  }
  return {
    checksumSha256:
      typeof checksum === "string" ? checksum.toLocaleLowerCase("en") : null,
    fileName: sanitizeFileName(body.fileName),
    folderId: nullableId(body.folderId, "folderId"),
    mimeType,
    noteId: nullableId(body.noteId, "noteId"),
    sizeBytes,
  };
}

export function parseCompleteUpload(value: unknown): CompleteUploadInput {
  const body = record(value);
  if (!Array.isArray(body.parts) || body.parts.length === 0) {
    throw new BadRequestException("parts must be a non-empty array");
  }
  const parts = body.parts.map((raw, index) => {
    const part = record(raw);
    const partNumber = integer(part.partNumber, `parts[${index}].partNumber`);
    const etag = text(part.etag, `parts[${index}].etag`, 200);
    if (partNumber < 1 || partNumber > 10_000) {
      throw new BadRequestException(`parts[${index}].partNumber is invalid`);
    }
    return { etag, partNumber };
  });
  const numbers = parts.map((part) => part.partNumber);
  if (new Set(numbers).size !== numbers.length) {
    throw new BadRequestException("parts contains duplicate part numbers");
  }
  parts.sort((left, right) => left.partNumber - right.partNumber);
  return { parts };
}

export function parseFilePatch(value: unknown): FilePatchInput {
  const body = record(value);
  const result: FilePatchInput = {};
  if (body.fileName !== undefined)
    result.fileName = sanitizeFileName(body.fileName);
  if (body.folderId !== undefined)
    result.folderId = nullableId(body.folderId, "folderId");
  if (body.noteId !== undefined)
    result.noteId = nullableId(body.noteId, "noteId");
  if (Object.keys(result).length === 0) {
    throw new BadRequestException("At least one file field is required");
  }
  return result;
}

export function parseSearch(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value !== "string")
    throw new BadRequestException("q must be a string");
  return value.trim().slice(0, 200);
}

export function parseOptionalId(value: unknown, name: string): number | null {
  return nullableId(value, name);
}

export function parseInline(value: unknown): boolean {
  if (value === undefined || value === "false" || value === false) return false;
  if (value === "true" || value === true) return true;
  throw new BadRequestException("inline must be true or false");
}

function parseIdList(value: unknown, name: string, max: number): number[] {
  if (value === undefined || value === "") return [];
  if (typeof value !== "string") {
    throw new BadRequestException(`${name} must be a comma-separated list`);
  }
  const values = value.split(",");
  if (values.length > max) {
    throw new BadRequestException(`${name} contains too many IDs`);
  }
  const ids = values.map((raw, index) => {
    if (!/^[1-9]\d*$/.test(raw)) {
      throw new BadRequestException(`${name}[${index}] must be positive`);
    }
    return integer(Number(raw), `${name}[${index}]`);
  });
  if (new Set(ids).size !== ids.length) {
    throw new BadRequestException(`${name} contains duplicate IDs`);
  }
  return ids;
}

export function parseArchiveSelection(
  fileIds: unknown,
  folderIds: unknown,
  noteId: unknown,
): FileArchiveInput {
  return {
    fileIds: parseIdList(fileIds, "ids", 200),
    folderIds: parseIdList(folderIds, "folderIds", 100),
    noteId: nullableId(noteId, "noteId"),
  };
}
