import { BadRequestException } from "@nestjs/common";

import type {
  CreateNoteInput,
  MoveNoteInput,
  SetTagsInput,
  UpdateNoteInput,
} from "./notes.types.js";

const MAX_CONTENT_BYTES = 2_000_000;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestException("Request body must be an object");
  }
  return value as Record<string, unknown>;
}

function integer(value: unknown, field: string, minimum = 1): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new BadRequestException(`${field} must be an integer >= ${minimum}`);
  }
  return value as number;
}

function text(value: unknown, field: string, maximum: number): string {
  if (typeof value !== "string") {
    throw new BadRequestException(`${field} must be a string`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) {
    throw new BadRequestException(
      `${field} must contain 1-${maximum} characters`,
    );
  }
  return normalized;
}

function optionalParent(value: unknown): number | null {
  return value === undefined || value === null
    ? null
    : integer(value, "parentId");
}

export function parseCreateNote(value: unknown): CreateNoteInput {
  const body = record(value);
  return {
    name: text(body.name, "name", 160),
    parentId: optionalParent(body.parentId),
  };
}

export function parseUpdateNote(value: unknown): UpdateNoteInput {
  const body = record(value);
  const input: UpdateNoteInput = {
    revision: integer(body.revision, "revision"),
  };
  if (body.name !== undefined) input.name = text(body.name, "name", 160);
  for (const field of ["contentHtml", "contentText"] as const) {
    const fieldValue = body[field];
    if (fieldValue !== undefined) {
      if (
        typeof fieldValue !== "string" ||
        Buffer.byteLength(fieldValue, "utf8") > MAX_CONTENT_BYTES
      ) {
        throw new BadRequestException(`${field} exceeds the 2 MB limit`);
      }
      input[field] = fieldValue;
    }
  }
  for (const field of ["isFavorite", "isPinned"] as const) {
    if (body[field] !== undefined) {
      if (typeof body[field] !== "boolean")
        throw new BadRequestException(`${field} must be boolean`);
      input[field] = body[field];
    }
  }
  if (body.attachmentFolderId !== undefined) {
    input.attachmentFolderId =
      body.attachmentFolderId === null
        ? null
        : integer(body.attachmentFolderId, "attachmentFolderId");
  }
  if (Object.keys(input).length === 1)
    throw new BadRequestException("At least one note change is required");
  return input;
}

export function parseMoveNote(value: unknown): MoveNoteInput {
  const body = record(value);
  return {
    parentId: optionalParent(body.parentId),
    ...(body.position === undefined
      ? {}
      : { position: integer(body.position, "position", 0) }),
    revision: integer(body.revision, "revision"),
  };
}

export function parseSetTags(value: unknown): SetTagsInput {
  const body = record(value);
  if (!Array.isArray(body.tags) || body.tags.length > 20) {
    throw new BadRequestException(
      "tags must be an array with at most 20 items",
    );
  }
  const tags = [
    ...new Set(
      body.tags.map((tag) => text(tag, "tag", 64).toLocaleLowerCase("ru")),
    ),
  ];
  return { revision: integer(body.revision, "revision"), tags };
}

export function parseTagName(value: unknown): string {
  return text(record(value).name, "name", 64).toLocaleLowerCase("ru");
}

export function parseRevision(value: unknown): number {
  return integer(record(value).revision, "revision");
}

export function parseSearchQuery(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value !== "string")
    throw new BadRequestException("q must be a string");
  return value.trim().slice(0, 200);
}
