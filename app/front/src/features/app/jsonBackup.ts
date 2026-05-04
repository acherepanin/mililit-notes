import type { Note, NoteTemplate } from '../../types';

export interface JsonExportPayload {
  exportedAt?: string;
  notes: Note[];
  templates?: NoteTemplate[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isNote(value: unknown): value is Note {
  return (
    isRecord(value) &&
    typeof value.id === 'number' &&
    typeof value.name === 'string' &&
    typeof value.contentHtml === 'string' &&
    typeof value.contentText === 'string' &&
    (typeof value.parentId === 'number' || value.parentId === null) &&
    typeof value.position === 'number' &&
    typeof value.isFavorite === 'boolean' &&
    typeof value.isPinned === 'boolean' &&
    isStringArray(value.tags) &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string'
  );
}

function isNoteTemplate(value: unknown): value is NoteTemplate {
  return (
    isRecord(value) &&
    typeof value.id === 'number' &&
    typeof value.name === 'string' &&
    typeof value.contentHtml === 'string' &&
    typeof value.contentText === 'string' &&
    typeof value.isSystem === 'boolean' &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string'
  );
}

export function validateJsonExportPayload(value: unknown): JsonExportPayload {
  if (!isRecord(value) || !Array.isArray(value.notes) || !value.notes.every(isNote)) {
    throw new Error('Invalid JSON backup');
  }

  if (
    value.templates !== undefined &&
    (!Array.isArray(value.templates) || !value.templates.every(isNoteTemplate))
  ) {
    throw new Error('Invalid JSON backup');
  }

  return {
    exportedAt: typeof value.exportedAt === 'string' ? value.exportedAt : undefined,
    notes: value.notes,
    templates: value.templates,
  };
}

export function downloadJsonFile(payload: JsonExportPayload): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `notes-export-${date}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
