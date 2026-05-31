import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { ActivityService } from '../activity/activity.service';
import { DatabaseService } from '../infra/database.service';
import { bindSqlList } from '../infra/sql';
import { EntitlementsService } from '../subscriptions/entitlements.service';
import type { CreateNoteDto } from './dto/create-note.dto';
import type { MoveNoteDto } from './dto/move-note.dto';
import type { UpdateNoteDto } from './dto/update-note.dto';
import { mapNote } from './notes.mapper';
import type {
  NoteRecord,
  NoteResponse,
  NoteSearchResult,
  NoteTreeNode,
  NoteVersionRecord,
  NoteVersionResponse,
  TagResponse,
} from './notes.types';
import { SecretFieldCryptoService } from './secret-field-crypto.service';

const MAX_NOTE_VERSIONS = 80;
const MAX_BATCH_CREATED_NOTES = 300;

interface CreateNestedBatchOptions {
  parentIds?: number[];
  parentScope: 'allActiveNotes' | 'parentIds' | 'recentNamedNotes';
  parentNames?: string[];
  expectedParentCount?: number | null;
  recentWithinMinutes?: number | null;
  childCount: number;
  nestedChildCount: number;
  childNamePattern?: string;
  nestedNamePattern?: string;
}

@Injectable()
export class NotesService {
  constructor(
    @Inject(DatabaseService) private readonly databaseService: DatabaseService,
    @Inject(ActivityService) private readonly activityService: ActivityService,
    @Inject(SecretFieldCryptoService)
    private readonly secretFieldCryptoService: SecretFieldCryptoService,
    @Inject(EntitlementsService) private readonly entitlementsService: EntitlementsService,
  ) {}

  getTree(userId: number): NoteTreeNode[] {
    const notes = this.databaseService.connection
      .prepare(
        `
          SELECT *
          FROM notes
          WHERE user_id = @userId AND deleted_at IS NULL
          ORDER BY COALESCE(parent_id, 0), position ASC, lower(name) ASC
        `,
      )
      .all({ userId }) as NoteRecord[];
    const tagsByNote = this.getTagsForNotes(notes.map((note) => note.id));

    const nodes = new Map<number, NoteTreeNode>();
    for (const note of notes) {
      nodes.set(note.id, {
        id: note.id,
        name: note.name,
        parentId: note.parent_id,
        isFavorite: note.is_favorite === 1,
        isPinned: note.is_pinned === 1,
        tags: tagsByNote.get(note.id) ?? [],
        children: [],
      });
    }

    const roots: NoteTreeNode[] = [];
    for (const note of notes) {
      const node = nodes.get(note.id);
      if (!node) {
        continue;
      }

      if (note.parent_id === null || !nodes.has(note.parent_id)) {
        roots.push(node);
        continue;
      }

      nodes.get(note.parent_id)?.children.push(node);
    }

    return roots;
  }

  getById(userId: number, id: number): NoteResponse {
    return this.mapNoteResponse(this.requireNote(userId, id));
  }

  create(userId: number, dto: CreateNoteDto): NoteResponse {
    this.entitlementsService.assertNoteCreationAllowed(userId);
    const name = this.normalizeName(dto.name);
    const parentId = dto.parentId ?? null;
    if (parentId !== null) {
      this.requireNote(userId, parentId);
    }

    const now = new Date().toISOString();
    const position = this.nextPosition(userId, parentId);
    const result = this.databaseService.connection
      .prepare(
        `
          INSERT INTO notes (user_id, name, content_html, content_text, parent_id, position, created_at, updated_at)
          VALUES (@userId, @name, '', '', @parentId, @position, @now, @now)
        `,
      )
      .run({
        userId,
        name,
        parentId,
        position,
        now,
      });

    const note = this.getById(userId, Number(result.lastInsertRowid));
    this.syncFts(note.id);
    this.activityService.record({
      actorId: userId,
      userId,
      action: 'notes.create',
      targetType: 'note',
      targetId: note.id,
      details: { name: note.name },
    });

    return note;
  }

  createNestedBatch(
    userId: number,
    options: CreateNestedBatchOptions,
  ): {
    parentCount: number;
    createdCount: number;
    createdIds: number[];
    directChildIds: number[];
    nestedChildIds: number[];
  } {
    const parents = this.resolveBatchParents(userId, options);
    const totalCount = parents.length * options.childCount * (1 + options.nestedChildCount);

    if (totalCount > MAX_BATCH_CREATED_NOTES) {
      throw new BadRequestException(
        `Batch would create ${totalCount} notes, maximum is ${MAX_BATCH_CREATED_NOTES}`,
      );
    }

    const createdIds: number[] = [];
    const directChildIds: number[] = [];
    const nestedChildIds: number[] = [];
    for (const parent of parents) {
      for (let childIndex = 1; childIndex <= options.childCount; childIndex += 1) {
        const child = this.create(userId, {
          name: this.formatBatchNoteName(
            options.childNamePattern ?? 'Вложение {index}',
            childIndex,
            parent.name,
          ),
          parentId: parent.id,
        });
        createdIds.push(child.id);
        directChildIds.push(child.id);

        for (let nestedIndex = 1; nestedIndex <= options.nestedChildCount; nestedIndex += 1) {
          const nested = this.create(userId, {
            name: this.formatBatchNoteName(
              options.nestedNamePattern ?? 'Вложенная заметка {index}',
              nestedIndex,
              child.name,
            ),
            parentId: child.id,
          });
          createdIds.push(nested.id);
          nestedChildIds.push(nested.id);
        }
      }
    }

    return {
      parentCount: parents.length,
      createdCount: createdIds.length,
      createdIds,
      directChildIds,
      nestedChildIds,
    };
  }

  update(userId: number, id: number, dto: UpdateNoteDto): NoteResponse {
    const existing = this.requireNote(userId, id);
    if (dto.contentHtml !== undefined || dto.contentText !== undefined) {
      const contentBytes = Math.max(
        dto.contentHtml !== undefined ? Buffer.byteLength(dto.contentHtml, 'utf8') : 0,
        dto.contentText !== undefined ? Buffer.byteLength(dto.contentText, 'utf8') : 0,
      );
      this.entitlementsService.assertNoteContentSize(userId, contentBytes);
    }
    if (this.entitlementsService.isVersioningEnabled(userId)) {
      this.createVersion(existing);
    }

    const fields: string[] = ['updated_at = @updatedAt'];
    const params: Record<string, string | number | null> = {
      id,
      userId,
      updatedAt: new Date().toISOString(),
    };

    if (dto.name !== undefined) {
      fields.push('name = @name');
      params.name = this.normalizeName(dto.name);
    }

    if (dto.contentHtml !== undefined) {
      fields.push('content_html = @contentHtml');
      params.contentHtml = this.secretFieldCryptoService.encryptNoteHtml(dto.contentHtml);
    }

    if (dto.contentText !== undefined) {
      fields.push('content_text = @contentText');
      params.contentText = dto.contentText;
    }

    if (dto.isFavorite !== undefined) {
      fields.push('is_favorite = @isFavorite');
      params.isFavorite = dto.isFavorite ? 1 : 0;
    }

    if (dto.isPinned !== undefined) {
      fields.push('is_pinned = @isPinned');
      params.isPinned = dto.isPinned ? 1 : 0;
    }

    if (dto.attachmentFolderId !== undefined) {
      if (dto.attachmentFolderId !== null) {
        const folder = this.databaseService.connection
          .prepare(
            'SELECT id FROM attachment_folders WHERE id = @folderId AND user_id = @userId',
          )
          .get({ folderId: dto.attachmentFolderId, userId }) as { id: number } | undefined;
        if (!folder) {
          throw new NotFoundException(`Folder ${dto.attachmentFolderId} was not found`);
        }
      }
      fields.push('attachment_folder_id = @attachmentFolderId');
      params.attachmentFolderId = dto.attachmentFolderId;
    }

    this.databaseService.connection
      .prepare(`UPDATE notes SET ${fields.join(', ')} WHERE id = @id AND user_id = @userId`)
      .run(params);

    const note = this.getById(userId, id);
    this.syncFts(id);
    this.activityService.record({
      actorId: userId,
      userId,
      action: 'notes.update',
      targetType: 'note',
      targetId: note.id,
      details: { name: note.name },
    });

    return note;
  }

  move(userId: number, id: number, dto: MoveNoteDto): NoteResponse {
    this.requireNote(userId, id);
    const parentId = dto.parentId ?? null;

    if (parentId === id) {
      throw new BadRequestException('Note cannot be moved into itself');
    }

    if (parentId !== null) {
      this.requireNote(userId, parentId);
      if (this.isDescendant(userId, parentId, id)) {
        throw new BadRequestException('Note cannot be moved into its descendant');
      }
    }

    const position = dto.position ?? this.nextPosition(userId, parentId);
    this.databaseService.connection
      .prepare(
        `
          UPDATE notes
          SET parent_id = @parentId, position = @position, updated_at = @updatedAt
          WHERE id = @id AND user_id = @userId
        `,
      )
      .run({
        id,
        userId,
        parentId,
        position,
        updatedAt: new Date().toISOString(),
      });

    const note = this.getById(userId, id);
    this.activityService.record({
      actorId: userId,
      userId,
      action: 'notes.move',
      targetType: 'note',
      targetId: note.id,
      details: { parentId, position },
    });

    return note;
  }

  delete(userId: number, id: number): { id: number } {
    const note = this.requireNote(userId, id);
    this.deleteVersions(userId, id);
    const deletedAt = new Date().toISOString();
    this.databaseService.connection
      .prepare(
        `
          UPDATE notes
          SET deleted_at = @deletedAt, deleted_by = @userId, updated_at = @deletedAt
          WHERE id = @id AND user_id = @userId
        `,
      )
      .run({ id, userId, deletedAt });
    this.detachAttachments(userId, [id]);
    this.removeFts(id);
    this.activityService.record({
      actorId: userId,
      userId,
      action: 'notes.delete',
      targetType: 'note',
      targetId: id,
      details: { name: note.name },
    });

    return { id };
  }

  deleteAll(userId: number): { deletedCount: number } {
    const rows = this.databaseService.connection
      .prepare('SELECT id FROM notes WHERE user_id = @userId AND deleted_at IS NULL')
      .all({ userId }) as Array<{ id: number }>;
    const noteIds = rows.map((row) => row.id);

    if (noteIds.length === 0) {
      return { deletedCount: 0 };
    }

    const deletedAt = new Date().toISOString();
    const noteIdList = bindSqlList('noteId', noteIds);
    const transaction = this.databaseService.connection.transaction(() => {
      this.deleteVersions(userId, noteIds);
      this.detachAttachments(userId, noteIds);
      this.databaseService.connection
        .prepare(
          `
            UPDATE notes
            SET deleted_at = @deletedAt, deleted_by = @userId, updated_at = @deletedAt
            WHERE id IN (${noteIdList.placeholders}) AND user_id = @userId
          `,
        )
        .run({ ...noteIdList.params, userId, deletedAt });
      this.databaseService.connection
        .prepare(`DELETE FROM note_fts WHERE note_id IN (${noteIdList.placeholders})`)
        .run(noteIdList.params);
    });

    transaction();
    this.activityService.record({
      actorId: userId,
      userId,
      action: 'notes.delete_all',
      targetType: 'note',
      targetId: userId,
      details: { count: noteIds.length },
    });

    return { deletedCount: noteIds.length };
  }

  listTrash(userId: number): NoteResponse[] {
    const rows = this.databaseService.connection
      .prepare(
        `
          SELECT *
          FROM notes
          WHERE user_id = @userId AND deleted_at IS NOT NULL
          ORDER BY deleted_at DESC, id DESC
        `,
      )
      .all({ userId }) as NoteRecord[];

    return rows.map((row) => this.mapNoteResponse(row));
  }

  restore(userId: number, id: number): NoteResponse {
    const note = this.requireNote(userId, id, { includeDeleted: true });
    const parentExists =
      note.parent_id === null ||
      Boolean(
        this.databaseService.connection
          .prepare(
            'SELECT id FROM notes WHERE id = @parentId AND user_id = @userId AND deleted_at IS NULL',
          )
          .get({ parentId: note.parent_id, userId }),
      );
    const restoredAt = new Date().toISOString();
    this.databaseService.connection
      .prepare(
        `
          UPDATE notes
          SET deleted_at = NULL,
              deleted_by = NULL,
              delete_reason = NULL,
              parent_id = @parentId,
              updated_at = @restoredAt
          WHERE id = @id AND user_id = @userId
        `,
      )
      .run({ id, userId, parentId: parentExists ? note.parent_id : null, restoredAt });
    this.syncFts(id);

    return this.getById(userId, id);
  }

  permanentDelete(userId: number, id: number): { id: number } {
    this.requireNote(userId, id, { includeDeleted: true });
    const noteIds = this.collectSubtreeIds(userId, id);
    const transaction = this.databaseService.connection.transaction(() => {
      this.deleteVersions(userId, noteIds);
      this.detachAttachments(userId, noteIds);
      this.databaseService.connection
        .prepare('DELETE FROM notes WHERE id = @id AND user_id = @userId')
        .run({ id, userId });

      for (const noteId of noteIds) {
        this.removeFts(noteId);
      }
    });

    transaction();
    return { id };
  }

  listVersions(userId: number, noteId: number): NoteVersionResponse[] {
    this.entitlementsService.assertVersioningAccess(userId);
    this.requireNote(userId, noteId, { includeDeleted: true });
    this.pruneVersions(userId, noteId);
    const rows = this.databaseService.connection
      .prepare(
        `
          SELECT *
          FROM note_versions
          WHERE note_id = @noteId AND user_id = @userId
          ORDER BY created_at DESC, id DESC
          LIMIT @limit
        `,
      )
      .all({ noteId, userId, limit: MAX_NOTE_VERSIONS }) as NoteVersionRecord[];

    return rows.map((row) => this.mapVersion(row));
  }

  restoreVersion(userId: number, noteId: number, versionId: number): NoteResponse {
    this.entitlementsService.assertVersioningAccess(userId);
    const current = this.requireNote(userId, noteId, { includeDeleted: true });
    const version = this.databaseService.connection
      .prepare(
        'SELECT * FROM note_versions WHERE id = @versionId AND note_id = @noteId AND user_id = @userId',
      )
      .get({ versionId, noteId, userId }) as NoteVersionRecord | undefined;

    if (!version) {
      throw new NotFoundException(`Version ${versionId} was not found`);
    }

    if (this.entitlementsService.isVersioningEnabled(userId)) {
      this.createVersion(current);
    }
    const updatedAt = new Date().toISOString();
    this.databaseService.connection
      .prepare(
        `
          UPDATE notes
          SET name = @name,
              content_html = @contentHtml,
              content_text = @contentText,
              deleted_at = NULL,
              deleted_by = NULL,
              updated_at = @updatedAt
          WHERE id = @noteId AND user_id = @userId
        `,
      )
      .run({
        noteId,
        userId,
        name: version.name,
        contentHtml: version.content_html,
        contentText: version.content_text,
        updatedAt,
      });
    this.syncFts(noteId);

    return this.getById(userId, noteId);
  }

  listTags(userId: number): TagResponse[] {
    return this.databaseService.connection
      .prepare(
        'SELECT id, lower(name) as name, color FROM tags WHERE user_id = @userId ORDER BY lower(name) ASC',
      )
      .all({ userId }) as TagResponse[];
  }

  createTag(userId: number, name: string): TagResponse {
    const tagId = this.ensureTag(userId, name);
    return this.requireTag(userId, tagId);
  }

  deleteTag(userId: number, tagId: number): { id: number } {
    const tag = this.findTag(userId, tagId);
    if (!tag) {
      return { id: tagId };
    }

    const noteIds = this.databaseService.connection
      .prepare('SELECT note_id FROM note_tags WHERE tag_id = @tagId')
      .all({ tagId }) as Array<{ note_id: number }>;

    this.databaseService.connection
      .prepare('DELETE FROM tags WHERE id = @tagId AND user_id = @userId')
      .run({ tagId, userId });

    for (const row of noteIds) {
      this.syncFts(row.note_id);
    }

    return { id: tagId };
  }

  updateTag(userId: number, tagId: number, name: string): TagResponse {
    this.requireTag(userId, tagId);
    const normalizedName = this.normalizeTagName(name);
    const existing = this.databaseService.connection
      .prepare(
        'SELECT id FROM tags WHERE user_id = @userId AND lower(name) = lower(@name) AND id != @tagId',
      )
      .get({ userId, name: normalizedName, tagId }) as { id: number } | undefined;
    if (existing) {
      const noteIds = this.databaseService.connection
        .prepare('SELECT note_id FROM note_tags WHERE tag_id = @tagId')
        .all({ tagId }) as Array<{ note_id: number }>;
      const transaction = this.databaseService.connection.transaction(() => {
        for (const row of noteIds) {
          this.databaseService.connection
            .prepare('INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (@noteId, @tagId)')
            .run({ noteId: row.note_id, tagId: existing.id });
        }
        this.databaseService.connection
          .prepare('DELETE FROM tags WHERE id = @tagId AND user_id = @userId')
          .run({ tagId, userId });
      });
      transaction();
      for (const row of noteIds) {
        this.syncFts(row.note_id);
      }

      return this.requireTag(userId, existing.id);
    }

    this.databaseService.connection
      .prepare(
        `
          UPDATE tags
          SET name = @name, updated_at = @updatedAt
          WHERE id = @tagId AND user_id = @userId
        `,
      )
      .run({
        tagId,
        userId,
        name: normalizedName,
        updatedAt: new Date().toISOString(),
      });

    const noteIds = this.databaseService.connection
      .prepare('SELECT note_id FROM note_tags WHERE tag_id = @tagId')
      .all({ tagId }) as Array<{ note_id: number }>;
    for (const row of noteIds) {
      this.syncFts(row.note_id);
    }

    return this.requireTag(userId, tagId);
  }

  updateTags(userId: number, noteId: number, tags: string[]): NoteResponse {
    this.requireNote(userId, noteId);
    const normalizedTags = [
      ...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean)),
    ].slice(0, 20);
    const existingTags = this.getExistingTagIds(userId, normalizedTags);
    if (existingTags.size !== normalizedTags.length) {
      throw new BadRequestException('Tag does not exist');
    }

    const transaction = this.databaseService.connection.transaction(() => {
      this.databaseService.connection
        .prepare('DELETE FROM note_tags WHERE note_id = @noteId')
        .run({ noteId });
      for (const tag of normalizedTags) {
        const tagId = existingTags.get(tag.toLowerCase());
        if (!tagId) {
          continue;
        }
        this.databaseService.connection
          .prepare('INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (@noteId, @tagId)')
          .run({ noteId, tagId });
      }
    });
    transaction();
    this.syncFts(noteId);
    return this.getById(userId, noteId);
  }

  search(userId: number, query: string): NoteSearchResult[] {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return [];
    }

    try {
      const rows = this.databaseService.connection
        .prepare(
          `
            SELECT notes.id, notes.name, notes.content_text, notes.updated_at
            FROM note_fts
            JOIN notes ON notes.id = note_fts.note_id
            WHERE note_fts MATCH @query
              AND note_fts.user_id = @userId
              AND notes.deleted_at IS NULL
            ORDER BY rank
            LIMIT 30
          `,
        )
        .all({ query: normalizedQuery, userId }) as Array<{
        id: number;
        name: string;
        content_text: string;
        updated_at: string;
      }>;
      const tagsByNote = this.getTagsForNotes(rows.map((row) => row.id));
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        snippet: row.content_text.slice(0, 180),
        tags: tagsByNote.get(row.id) ?? [],
        updatedAt: row.updated_at,
      }));
    } catch {
      const like = `%${normalizedQuery}%`;
      const rows = this.databaseService.connection
        .prepare(
          `
            SELECT id, name, content_text, updated_at
            FROM notes
            WHERE user_id = @userId
              AND deleted_at IS NULL
              AND (name LIKE @like OR content_text LIKE @like)
            ORDER BY updated_at DESC
            LIMIT 30
          `,
        )
        .all({ userId, like }) as Array<{
        id: number;
        name: string;
        content_text: string;
        updated_at: string;
      }>;
      const tagsByNote = this.getTagsForNotes(rows.map((row) => row.id));
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        snippet: row.content_text.slice(0, 180),
        tags: tagsByNote.get(row.id) ?? [],
        updatedAt: row.updated_at,
      }));
    }
  }

  rebuildSearchIndex(userId: number): { indexed: number } {
    const notes = this.databaseService.connection
      .prepare('SELECT id FROM notes WHERE user_id = @userId AND deleted_at IS NULL')
      .all({ userId }) as Array<{ id: number }>;
    for (const note of notes) {
      this.syncFts(note.id);
    }

    return { indexed: notes.length };
  }

  private requireNote(
    userId: number,
    id: number,
    options: { includeDeleted?: boolean } = {},
  ): NoteRecord {
    const deletedPredicate = options.includeDeleted ? '' : 'AND deleted_at IS NULL';
    const note = this.databaseService.connection
      .prepare(`SELECT * FROM notes WHERE id = @id AND user_id = @userId ${deletedPredicate}`)
      .get({ id, userId }) as NoteRecord | undefined;

    if (!note) {
      throw new NotFoundException(`Note ${id} was not found`);
    }

    return note;
  }

  private nextPosition(userId: number, parentId: number | null): number {
    const sql =
      parentId === null
        ? 'SELECT COALESCE(MAX(position), -1) + 1 as position FROM notes WHERE user_id = @userId AND parent_id IS NULL AND deleted_at IS NULL'
        : 'SELECT COALESCE(MAX(position), -1) + 1 as position FROM notes WHERE user_id = @userId AND parent_id = @parentId AND deleted_at IS NULL';
    const row = this.databaseService.connection.prepare(sql).get({ userId, parentId }) as {
      position: number;
    };

    return row.position;
  }

  private normalizeName(name: string): string {
    const normalized = name.trim();

    if (normalized.length === 0) {
      throw new BadRequestException('Note name cannot be empty');
    }

    return normalized;
  }

  private isDescendant(userId: number, candidateId: number, ancestorId: number): boolean {
    let cursor: number | null = candidateId;

    while (cursor !== null) {
      if (cursor === ancestorId) {
        return true;
      }

      const row = this.databaseService.connection
        .prepare('SELECT parent_id FROM notes WHERE id = @cursor AND user_id = @userId')
        .get({ cursor, userId }) as { parent_id: number | null } | undefined;
      cursor = row?.parent_id ?? null;
    }

    return false;
  }

  private createVersion(note: NoteRecord): void {
    const latest = this.databaseService.connection
      .prepare(
        `
          SELECT created_at
          FROM note_versions
          WHERE note_id = @noteId AND user_id = @userId
          ORDER BY created_at DESC, id DESC
          LIMIT 1
        `,
      )
      .get({ noteId: note.id, userId: note.user_id }) as { created_at: string } | undefined;
    if (latest && Date.now() - Date.parse(latest.created_at) < 60_000) {
      this.pruneVersions(note.user_id, note.id);
      return;
    }

    this.databaseService.connection
      .prepare(
        `
          INSERT INTO note_versions (note_id, user_id, name, content_html, content_text, created_at)
          VALUES (@noteId, @userId, @name, @contentHtml, @contentText, @createdAt)
        `,
      )
      .run({
        noteId: note.id,
        userId: note.user_id,
        name: note.name,
        contentHtml: note.content_html,
        contentText: note.content_text,
        createdAt: new Date().toISOString(),
      });
    this.pruneVersions(note.user_id, note.id);
  }

  private pruneVersions(userId: number, noteId: number): void {
    this.databaseService.connection
      .prepare(
        `
          DELETE FROM note_versions
          WHERE note_id = @noteId
            AND user_id = @userId
            AND id NOT IN (
              SELECT id
              FROM note_versions
              WHERE note_id = @noteId AND user_id = @userId
              ORDER BY created_at DESC, id DESC
              LIMIT @limit
            )
        `,
      )
      .run({ noteId, userId, limit: MAX_NOTE_VERSIONS });
  }

  private deleteVersions(userId: number, noteIds: number | number[]): void {
    const ids = Array.isArray(noteIds) ? noteIds : [noteIds];
    if (ids.length === 0) {
      return;
    }

    const noteIdList = bindSqlList('id', ids);
    this.databaseService.connection
      .prepare(
        `DELETE FROM note_versions WHERE note_id IN (${noteIdList.placeholders}) AND user_id = @userId`,
      )
      .run({ ...noteIdList.params, userId });
  }

  private listActiveParentSnapshot(userId: number): Array<{ id: number; name: string }> {
    return this.databaseService.connection
      .prepare(
        `
          SELECT id, name
          FROM notes
          WHERE user_id = @userId AND deleted_at IS NULL
          ORDER BY id ASC
        `,
      )
      .all({ userId }) as Array<{ id: number; name: string }>;
  }

  private listParentSnapshot(
    userId: number,
    parentIds: number[],
  ): Array<{ id: number; name: string }> {
    const ids = [...new Set(parentIds)];
    if (ids.length === 0) {
      return [];
    }

    const idList = bindSqlList('parentId', ids);
    const rows = this.databaseService.connection
      .prepare(
        `
          SELECT id, name
          FROM notes
          WHERE user_id = @userId
            AND deleted_at IS NULL
            AND id IN (${idList.placeholders})
          ORDER BY id ASC
        `,
      )
      .all({ ...idList.params, userId }) as Array<{ id: number; name: string }>;

    if (rows.length !== ids.length) {
      throw new NotFoundException('One or more parent notes were not found');
    }

    return rows;
  }

  private listRecentNamedParentSnapshot(
    userId: number,
    parentNames: string[],
    expectedParentCount: number | null | undefined,
    recentWithinMinutes: number | null | undefined,
  ): Array<{ id: number; name: string }> {
    const normalizedNames = [
      ...new Set(parentNames.map((name) => name.trim().toLowerCase()).filter(Boolean)),
    ];
    if (normalizedNames.length === 0) {
      throw new BadRequestException('parentNames are required when scope is recentNamedNotes');
    }

    const expectedCount = expectedParentCount ?? 100;
    const names = bindSqlList('parentName', normalizedNames);
    const createdAfter = new Date(
      Date.now() - Math.max(recentWithinMinutes ?? 240, 1) * 60_000,
    ).toISOString();
    const rows = this.databaseService.connection
      .prepare(
        `
          SELECT id, name
          FROM notes
          WHERE user_id = @userId
            AND deleted_at IS NULL
            AND created_at >= @createdAfter
            AND lower(name) IN (${names.placeholders})
          ORDER BY created_at DESC, id DESC
          LIMIT @limit
        `,
      )
      .all({
        ...names.params,
        userId,
        createdAfter,
        limit: Math.min(Math.max(expectedCount, 1), 100),
      }) as Array<{ id: number; name: string }>;

    if (expectedParentCount && rows.length < expectedParentCount) {
      throw new BadRequestException(
        `Found ${rows.length} recent parent notes, expected ${expectedParentCount}`,
      );
    }

    return rows.sort((left, right) => left.id - right.id);
  }

  private resolveBatchParents(
    userId: number,
    options: CreateNestedBatchOptions,
  ): Array<{ id: number; name: string }> {
    switch (options.parentScope) {
      case 'allActiveNotes':
        return this.listActiveParentSnapshot(userId);
      case 'parentIds':
        return this.listParentSnapshot(userId, options.parentIds ?? []);
      case 'recentNamedNotes':
        return this.listRecentNamedParentSnapshot(
          userId,
          options.parentNames ?? [],
          options.expectedParentCount,
          options.recentWithinMinutes,
        );
    }
  }

  private formatBatchNoteName(pattern: string, index: number, parentName: string): string {
    const name = pattern
      .replaceAll('{index}', String(index))
      .replaceAll('{parent}', parentName)
      .trim();

    return name || `Заметка ${index}`;
  }

  private collectSubtreeIds(userId: number, rootId: number): number[] {
    const rows = this.databaseService.connection
      .prepare(
        `
          WITH RECURSIVE subtree(id) AS (
            SELECT id
            FROM notes
            WHERE id = @rootId AND user_id = @userId

            UNION ALL

            SELECT notes.id
            FROM notes
            INNER JOIN subtree ON notes.parent_id = subtree.id
            WHERE notes.user_id = @userId
          )
          SELECT id FROM subtree
        `,
      )
      .all({ rootId, userId }) as Array<{ id: number }>;

    return rows.map((row) => row.id);
  }

  private detachAttachments(userId: number, noteIds: number[]): void {
    if (noteIds.length === 0) {
      return;
    }

    const noteIdList = bindSqlList('id', noteIds);
    this.databaseService.connection
      .prepare(
        `UPDATE attachments SET note_id = NULL WHERE note_id IN (${noteIdList.placeholders}) AND user_id = @userId`,
      )
      .run({ ...noteIdList.params, userId });
  }

  private mapNoteResponse(record: NoteRecord): NoteResponse {
    return mapNote(
      {
        ...record,
        content_html: this.secretFieldCryptoService.decryptNoteHtml(record.content_html),
      },
      this.getTagsForNote(record.id),
    );
  }

  private mapVersion(record: NoteVersionRecord): NoteVersionResponse {
    return {
      id: record.id,
      noteId: record.note_id,
      name: record.name,
      contentHtml: this.secretFieldCryptoService.decryptNoteHtml(record.content_html),
      contentText: record.content_text,
      createdAt: record.created_at,
    };
  }

  private ensureTag(userId: number, name: string): number {
    const normalizedName = this.normalizeTagName(name);
    const existing = this.databaseService.connection
      .prepare('SELECT id FROM tags WHERE user_id = @userId AND lower(name) = lower(@name)')
      .get({ userId, name: normalizedName }) as { id: number } | undefined;
    if (existing) {
      return existing.id;
    }

    const now = new Date().toISOString();
    const result = this.databaseService.connection
      .prepare(
        `
          INSERT INTO tags (user_id, name, created_at, updated_at)
          VALUES (@userId, @name, @now, @now)
        `,
      )
      .run({ userId, name: normalizedName, now });
    return Number(result.lastInsertRowid);
  }

  private normalizeTagName(name: string): string {
    const normalizedName = name.trim().toLowerCase().slice(0, 32);
    if (!normalizedName) {
      throw new BadRequestException('Tag name cannot be empty');
    }

    return normalizedName;
  }

  private requireTag(userId: number, tagId: number): TagResponse {
    const tag = this.findTag(userId, tagId);

    if (!tag) {
      throw new NotFoundException(`Tag ${tagId} was not found`);
    }

    return tag;
  }

  private findTag(userId: number, tagId: number): TagResponse | undefined {
    return this.databaseService.connection
      .prepare('SELECT id, name, color FROM tags WHERE id = @tagId AND user_id = @userId')
      .get({ tagId, userId }) as TagResponse | undefined;
  }

  private getExistingTagIds(userId: number, tags: string[]): Map<string, number> {
    const tagIds = new Map<string, number>();
    if (tags.length === 0) {
      return tagIds;
    }

    const tagList = bindSqlList(
      'tag',
      tags.map((tag) => tag.toLowerCase()),
    );
    const rows = this.databaseService.connection
      .prepare(
        `
          SELECT id, lower(name) as name
          FROM tags
          WHERE user_id = @userId AND lower(name) IN (${tagList.placeholders})
        `,
      )
      .all({ userId, ...tagList.params }) as Array<{ id: number; name: string }>;

    for (const row of rows) {
      tagIds.set(row.name, row.id);
    }

    return tagIds;
  }

  private getTagsForNote(noteId: number): string[] {
    const rows = this.databaseService.connection
      .prepare(
        `
          SELECT lower(tags.name) as name
          FROM note_tags
          JOIN tags ON tags.id = note_tags.tag_id
          WHERE note_tags.note_id = @noteId
          ORDER BY lower(tags.name) ASC
        `,
      )
      .all({ noteId }) as Array<{ name: string }>;
    return rows.map((row) => row.name.toLowerCase());
  }

  private getTagsForNotes(noteIds: number[]): Map<number, string[]> {
    const tagsByNote = new Map<number, string[]>();
    if (noteIds.length === 0) {
      return tagsByNote;
    }

    const noteIdList = bindSqlList('id', noteIds);
    const rows = this.databaseService.connection
      .prepare(
        `
          SELECT note_tags.note_id, lower(tags.name) as name
          FROM note_tags
          JOIN tags ON tags.id = note_tags.tag_id
          WHERE note_tags.note_id IN (${noteIdList.placeholders})
          ORDER BY lower(tags.name) ASC
        `,
      )
      .all(noteIdList.params) as Array<{ note_id: number; name: string }>;

    for (const row of rows) {
      const current = tagsByNote.get(row.note_id) ?? [];
      current.push(row.name);
      tagsByNote.set(row.note_id, current);
    }

    return tagsByNote;
  }

  private syncFts(noteId: number): void {
    try {
      const note = this.databaseService.connection
        .prepare('SELECT * FROM notes WHERE id = @noteId')
        .get({ noteId }) as NoteRecord | undefined;
      this.removeFts(noteId);
      if (!note || note.deleted_at) {
        return;
      }

      this.databaseService.connection
        .prepare(
          `
            INSERT INTO note_fts (name, content_text, tags, user_id, note_id)
            VALUES (@name, @contentText, @tags, @userId, @noteId)
          `,
        )
        .run({
          name: note.name,
          contentText: note.content_text,
          tags: this.getTagsForNote(note.id).join(' '),
          userId: note.user_id,
          noteId: note.id,
        });
    } catch {
      return;
    }
  }

  private removeFts(noteId: number): void {
    try {
      this.databaseService.connection
        .prepare('DELETE FROM note_fts WHERE note_id = @noteId')
        .run({ noteId });
    } catch {
      return;
    }
  }
}
