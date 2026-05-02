import type { NoteRecord, NoteResponse } from './notes.types';

export function mapNote(record: NoteRecord): NoteResponse {
  return {
    id: record.id,
    userId: record.user_id,
    name: record.name,
    contentHtml: record.content_html,
    contentText: record.content_text,
    parentId: record.parent_id,
    position: record.position,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}
