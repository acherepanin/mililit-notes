import { BadRequestException } from "@nestjs/common";

import { wouldCreateCycle } from "../notes/notes.domain.js";
import type {
  CreateShareInput,
  ImportNote,
  ImportPayload,
  TemplateInput,
} from "./workspace.types.js";

const MAX_CONTENT_BYTES = 2_000_000;
const MAX_IMPORT_NOTES = 1_000;
const MAX_IMPORT_TEMPLATES = 200;

function record(value: unknown, message = "Request body must be an object") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestException(message);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string, maximum: number) {
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

function content(value: unknown, field: string) {
  if (
    typeof value !== "string" ||
    Buffer.byteLength(value, "utf8") > MAX_CONTENT_BYTES
  ) {
    throw new BadRequestException(`${field} exceeds the 2 MB limit`);
  }
  return value;
}

function positiveId(value: unknown, field: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new BadRequestException(`${field} must be a positive integer`);
  }
  return value as number;
}

export function parseTemplate(value: unknown): TemplateInput {
  const body = record(value);
  return {
    contentHtml: content(body.contentHtml ?? "", "contentHtml"),
    contentText: content(body.contentText ?? "", "contentText"),
    name: text(body.name, "name", 160),
  };
}

function parseImportNote(value: unknown, index: number): ImportNote {
  const note = record(value, `notes[${index}] must be an object`);
  const rawTags = note.tags ?? [];
  if (!Array.isArray(rawTags) || rawTags.length > 20) {
    throw new BadRequestException(`notes[${index}].tags is invalid`);
  }
  return {
    contentHtml: content(note.contentHtml ?? "", `notes[${index}].contentHtml`),
    contentText: content(note.contentText ?? "", `notes[${index}].contentText`),
    id: positiveId(note.id, `notes[${index}].id`),
    isFavorite: note.isFavorite === true,
    isPinned: note.isPinned === true,
    name: text(note.name ?? "Imported note", `notes[${index}].name`, 160),
    parentId:
      note.parentId === null || note.parentId === undefined
        ? null
        : positiveId(note.parentId, `notes[${index}].parentId`),
    position:
      Number.isSafeInteger(note.position) && (note.position as number) >= 0
        ? (note.position as number)
        : index,
    tags: [
      ...new Set(
        rawTags.map((tag) => text(tag, "tag", 64).toLocaleLowerCase("ru")),
      ),
    ],
  };
}

export function parseImport(value: unknown): ImportPayload {
  const body = record(value, "JSON backup must be an object");
  if (!Array.isArray(body.notes)) {
    throw new BadRequestException("JSON backup must contain notes array");
  }
  if (body.notes.length > MAX_IMPORT_NOTES) {
    throw new BadRequestException("JSON backup contains too many notes");
  }
  const notes = body.notes.map(parseImportNote);
  const ids = new Set<number>();
  for (const note of notes) {
    if (ids.has(note.id))
      throw new BadRequestException(`Duplicate note id ${note.id}`);
    ids.add(note.id);
  }
  for (const note of notes) {
    if (note.parentId !== null && !ids.has(note.parentId)) {
      throw new BadRequestException(`Missing parent ${note.parentId}`);
    }
    if (wouldCreateCycle(notes, note.id, note.parentId)) {
      throw new BadRequestException("JSON backup contains a hierarchy cycle");
    }
  }

  const rawTemplates = body.templates ?? [];
  if (
    !Array.isArray(rawTemplates) ||
    rawTemplates.length > MAX_IMPORT_TEMPLATES
  ) {
    throw new BadRequestException("JSON backup templates are invalid");
  }
  return { notes, templates: rawTemplates.map(parseTemplate) };
}

export function parseCreateFromTemplate(value: unknown) {
  const body = record(value);
  return {
    parentId:
      body.parentId === null || body.parentId === undefined
        ? null
        : positiveId(body.parentId, "parentId"),
    templateId: positiveId(body.templateId, "templateId"),
  };
}

export function parseCreateShare(value: unknown): CreateShareInput {
  const body = record(value);
  const ttlHours = body.ttlHours ?? 24;
  if (
    !Number.isSafeInteger(ttlHours) ||
    (ttlHours as number) < 1 ||
    (ttlHours as number) > 720
  ) {
    throw new BadRequestException(
      "ttlHours must be an integer between 1 and 720",
    );
  }
  return {
    includeSecrets: body.includeSecrets === true,
    oneTime: body.oneTime === true,
    ttlHours: ttlHours as number,
  };
}

export function parseShareToken(value: string) {
  if (!/^[A-Za-z0-9_-]{24,200}$/.test(value)) {
    throw new BadRequestException("Invalid share token");
  }
  return value;
}
