import type { NoteRecord, NoteResponse } from './notes.types';

export function mapNote(record: NoteRecord, tags: string[] = []): NoteResponse {
  return {
    id: record.id,
    userId: record.user_id,
    name: record.name,
    contentHtml: record.content_html,
    contentText: record.content_text,
    parentId: record.parent_id,
    position: record.position,
    isFavorite: record.is_favorite === 1,
    isPinned: record.is_pinned === 1,
    tags,
    attachmentFolderId: record.attachment_folder_id ?? null,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}
