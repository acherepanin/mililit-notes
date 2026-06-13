import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { ActivityService } from '../activity/activity.service';
import { nowIso } from '../database/db.util';
import { AttachmentEntity, AttachmentFolderEntity } from '../database/entities/attachment.entity';
import { NoteEntity } from '../database/entities/note.entity';
import { EntitlementsService } from '../subscriptions/entitlements.service';
import type { CreateNoteDto } from './dto/create-note.dto';
import type { MoveNoteDto } from './dto/move-note.dto';
import type { UpdateNoteDto } from './dto/update-note.dto';
import { NoteVersionsService } from './note-versions.service';
import { mapNote } from './notes.mapper';
import type {
  NoteResponse,
  NoteSearchResult,
  NoteTreeNode,
  NoteVersionResponse,
  TagResponse,
} from './notes.types';
import { SecretFieldCryptoService } from './secret-field-crypto.service';
import { TagsService } from './tags.service';

const MAX_BATCH_CREATED_NOTES = 300;
const SEARCH_LIMIT = 30;
const SNIPPET_LENGTH = 180;

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
    @InjectRepository(NoteEntity) private readonly notesRepo: Repository<NoteEntity>,
    @InjectRepository(AttachmentEntity)
    private readonly attachmentsRepo: Repository<AttachmentEntity>,
    @InjectRepository(AttachmentFolderEntity)
    private readonly foldersRepo: Repository<AttachmentFolderEntity>,
    @Inject(ActivityService) private readonly activityService: ActivityService,
    @Inject(SecretFieldCryptoService)
    private readonly secretFieldCryptoService: SecretFieldCryptoService,
    @Inject(EntitlementsService) private readonly entitlementsService: EntitlementsService,
    @Inject(TagsService) private readonly tagsService: TagsService,
    @Inject(NoteVersionsService) private readonly versionsService: NoteVersionsService,
  ) {}

  async getTree(userId: number): Promise<NoteTreeNode[]> {
    const notes = await this.notesRepo
      .createQueryBuilder('n')
      .where('n.user_id = :userId', { userId })
      .andWhere('n.deleted_at IS NULL')
      .orderBy('COALESCE(n.parent_id, 0)', 'ASC')
      .addOrderBy('n.position', 'ASC')
      .addOrderBy('lower(n.name)', 'ASC')
      .getMany();
    const tagsByNote = await this.tagsService.getTagsForNotes(notes.map((note) => note.id));

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

  async getById(userId: number, id: number): Promise<NoteResponse> {
    return this.mapNoteResponse(await this.requireNote(userId, id));
  }

  async create(userId: number, dto: CreateNoteDto): Promise<NoteResponse> {
    await this.entitlementsService.assertNoteCreationAllowed(userId);
    const name = this.normalizeName(dto.name);
    const parentId = dto.parentId ?? null;
    if (parentId !== null) {
      await this.requireNote(userId, parentId);
    }

    const now = nowIso();
    const position = await this.nextPosition(userId, parentId);
    const created = await this.notesRepo.save(
      this.notesRepo.create({
        user_id: userId,
        name,
        content_html: '',
        content_text: '',
        parent_id: parentId,
        position,
        created_at: now,
        updated_at: now,
      }),
    );

    const note = await this.getById(userId, created.id);
    await this.activityService.record({
      actorId: userId,
      userId,
      action: 'notes.create',
      targetType: 'note',
      targetId: note.id,
      details: { name: note.name },
    });

    return note;
  }

  async createNestedBatch(
    userId: number,
    options: CreateNestedBatchOptions,
  ): Promise<{
    parentCount: number;
    createdCount: number;
    createdIds: number[];
    directChildIds: number[];
    nestedChildIds: number[];
  }> {
    const parents = await this.resolveBatchParents(userId, options);
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
        const child = await this.create(userId, {
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
          const nested = await this.create(userId, {
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

  async update(userId: number, id: number, dto: UpdateNoteDto): Promise<NoteResponse> {
    const existing = await this.requireNote(userId, id);
    if (dto.contentHtml !== undefined || dto.contentText !== undefined) {
      const contentBytes = Math.max(
        dto.contentHtml !== undefined ? Buffer.byteLength(dto.contentHtml, 'utf8') : 0,
        dto.contentText !== undefined ? Buffer.byteLength(dto.contentText, 'utf8') : 0,
      );
      await this.entitlementsService.assertNoteContentSize(userId, contentBytes);
    }
    if (await this.entitlementsService.isVersioningEnabled(userId)) {
      await this.versionsService.createSnapshot(existing);
    }

    const patch: Partial<NoteEntity> = { updated_at: nowIso() };
    if (dto.name !== undefined) {
      patch.name = this.normalizeName(dto.name);
    }
    if (dto.contentHtml !== undefined) {
      patch.content_html = this.secretFieldCryptoService.encryptNoteHtml(dto.contentHtml);
    }
    if (dto.contentText !== undefined) {
      patch.content_text = dto.contentText;
    }
    if (dto.isFavorite !== undefined) {
      patch.is_favorite = dto.isFavorite ? 1 : 0;
    }
    if (dto.isPinned !== undefined) {
      patch.is_pinned = dto.isPinned ? 1 : 0;
    }
    if (dto.attachmentFolderId !== undefined) {
      if (dto.attachmentFolderId !== null) {
        const folder = await this.foldersRepo.findOne({
          where: { id: dto.attachmentFolderId, user_id: userId },
        });
        if (!folder) {
          throw new NotFoundException(`Folder ${dto.attachmentFolderId} was not found`);
        }
      }
      patch.attachment_folder_id = dto.attachmentFolderId;
    }

    await this.notesRepo.update({ id, user_id: userId }, patch);

    const note = await this.getById(userId, id);
    await this.activityService.record({
      actorId: userId,
      userId,
      action: 'notes.update',
      targetType: 'note',
      targetId: note.id,
      details: { name: note.name },
    });

    return note;
  }

  async move(userId: number, id: number, dto: MoveNoteDto): Promise<NoteResponse> {
    await this.requireNote(userId, id);
    const parentId = dto.parentId ?? null;

    if (parentId === id) {
      throw new BadRequestException('Note cannot be moved into itself');
    }

    if (parentId !== null) {
      await this.requireNote(userId, parentId);
      if (await this.isDescendant(userId, parentId, id)) {
        throw new BadRequestException('Note cannot be moved into its descendant');
      }
    }

    const position = dto.position ?? (await this.nextPosition(userId, parentId));
    await this.notesRepo.update(
      { id, user_id: userId },
      { parent_id: parentId, position, updated_at: nowIso() },
    );

    const note = await this.getById(userId, id);
    await this.activityService.record({
      actorId: userId,
      userId,
      action: 'notes.move',
      targetType: 'note',
      targetId: note.id,
      details: { parentId, position },
    });

    return note;
  }

  async delete(userId: number, id: number): Promise<{ id: number }> {
    const note = await this.requireNote(userId, id);
    await this.versionsService.deleteForNotes(userId, [id]);
    const deletedAt = nowIso();
    await this.notesRepo.update(
      { id, user_id: userId },
      { deleted_at: deletedAt, deleted_by: userId, updated_at: deletedAt },
    );
    await this.detachAttachments(userId, [id]);
    await this.activityService.record({
      actorId: userId,
      userId,
      action: 'notes.delete',
      targetType: 'note',
      targetId: id,
      details: { name: note.name },
    });

    return { id };
  }

  async deleteAll(userId: number): Promise<{ deletedCount: number }> {
    const activeRows = await this.notesRepo
      .createQueryBuilder('n')
      .select('n.id', 'id')
      .where('n.user_id = :userId', { userId })
      .andWhere('n.deleted_at IS NULL')
      .getRawMany<{ id: number }>();
    const noteIds = activeRows.map((row) => row.id);

    if (noteIds.length === 0) {
      return { deletedCount: 0 };
    }

    const deletedAt = nowIso();
    await this.versionsService.deleteForNotes(userId, noteIds);
    await this.notesRepo.manager.transaction(async (manager) => {
      await manager.update(
        AttachmentEntity,
        { note_id: In(noteIds), user_id: userId },
        { note_id: null },
      );
      await manager.update(
        NoteEntity,
        { id: In(noteIds), user_id: userId },
        { deleted_at: deletedAt, deleted_by: userId, updated_at: deletedAt },
      );
    });
    await this.activityService.record({
      actorId: userId,
      userId,
      action: 'notes.delete_all',
      targetType: 'note',
      targetId: userId,
      details: { count: noteIds.length },
    });

    return { deletedCount: noteIds.length };
  }

  async listTrash(userId: number): Promise<NoteResponse[]> {
    const rows = await this.notesRepo
      .createQueryBuilder('n')
      .where('n.user_id = :userId', { userId })
      .andWhere('n.deleted_at IS NOT NULL')
      .orderBy('n.deleted_at', 'DESC')
      .addOrderBy('n.id', 'DESC')
      .getMany();

    return Promise.all(rows.map((row) => this.mapNoteResponse(row)));
  }

  async restore(userId: number, id: number): Promise<NoteResponse> {
    const note = await this.requireNote(userId, id, { includeDeleted: true });
    let parentExists = note.parent_id === null;
    if (note.parent_id !== null) {
      const parent = await this.notesRepo
        .createQueryBuilder('n')
        .where('n.id = :parentId', { parentId: note.parent_id })
        .andWhere('n.user_id = :userId', { userId })
        .andWhere('n.deleted_at IS NULL')
        .getOne();
      parentExists = Boolean(parent);
    }
    await this.notesRepo.update(
      { id, user_id: userId },
      {
        deleted_at: null,
        deleted_by: null,
        delete_reason: null,
        parent_id: parentExists ? note.parent_id : null,
        updated_at: nowIso(),
      },
    );

    return this.getById(userId, id);
  }

  async permanentDelete(userId: number, id: number): Promise<{ id: number }> {
    await this.requireNote(userId, id, { includeDeleted: true });
    const noteIds = await this.collectSubtreeIds(userId, id);
    await this.notesRepo.manager.transaction(async (manager) => {
      await this.versionsService.deleteForNotes(userId, noteIds);
      await manager.update(
        AttachmentEntity,
        { note_id: In(noteIds), user_id: userId },
        { note_id: null },
      );
      // Deleting the root cascades to descendants via the parent_id FK.
      await manager.delete(NoteEntity, { id, user_id: userId });
    });

    return { id };
  }

  async listVersions(userId: number, noteId: number): Promise<NoteVersionResponse[]> {
    await this.entitlementsService.assertVersioningAccess(userId);
    await this.requireNote(userId, noteId, { includeDeleted: true });
    return this.versionsService.list(userId, noteId);
  }

  async restoreVersion(
    userId: number,
    noteId: number,
    versionId: number,
  ): Promise<NoteResponse> {
    await this.entitlementsService.assertVersioningAccess(userId);
    const current = await this.requireNote(userId, noteId, { includeDeleted: true });
    const version = await this.versionsService.getRaw(userId, noteId, versionId);

    if (await this.entitlementsService.isVersioningEnabled(userId)) {
      await this.versionsService.createSnapshot(current);
    }
    await this.notesRepo.update(
      { id: noteId, user_id: userId },
      {
        name: version.name,
        content_html: version.content_html,
        content_text: version.content_text,
        deleted_at: null,
        deleted_by: null,
        updated_at: nowIso(),
      },
    );

    return this.getById(userId, noteId);
  }

  // Tag operations are delegated to TagsService; kept on the facade so the
  // existing /notes/tags routes stay stable.
  listTags(userId: number): Promise<TagResponse[]> {
    return this.tagsService.listTags(userId);
  }

  createTag(userId: number, name: string): Promise<TagResponse> {
    return this.tagsService.createTag(userId, name);
  }

  deleteTag(userId: number, tagId: number): Promise<{ id: number }> {
    return this.tagsService.deleteTag(userId, tagId);
  }

  updateTag(userId: number, tagId: number, name: string): Promise<TagResponse> {
    return this.tagsService.updateTag(userId, tagId, name);
  }

  async updateTags(userId: number, noteId: number, tags: string[]): Promise<NoteResponse> {
    await this.requireNote(userId, noteId);
    await this.tagsService.setNoteTags(userId, noteId, tags);
    return this.getById(userId, noteId);
  }

  async search(userId: number, query: string): Promise<NoteSearchResult[]> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return [];
    }

    const like = `%${normalizedQuery.replace(/[%_]/g, (char) => `\\${char}`)}%`;
    const rows = await this.notesRepo
      .createQueryBuilder('n')
      .select(['n.id', 'n.name', 'n.content_text', 'n.updated_at'])
      .where('n.user_id = :userId', { userId })
      .andWhere('n.deleted_at IS NULL')
      .andWhere('(n.name ILIKE :like OR n.content_text ILIKE :like)', { like })
      .orderBy('n.updated_at', 'DESC')
      .limit(SEARCH_LIMIT)
      .getMany();
    const tagsByNote = await this.tagsService.getTagsForNotes(rows.map((row) => row.id));
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      snippet: row.content_text.slice(0, SNIPPET_LENGTH),
      tags: tagsByNote.get(row.id) ?? [],
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Postgres performs search directly against the notes table, so there is no
   * separate index to rebuild. Kept for API compatibility: reports the number
   * of searchable (active) notes.
   */
  async rebuildSearchIndex(userId: number): Promise<{ indexed: number }> {
    const indexed = await this.notesRepo
      .createQueryBuilder('n')
      .where('n.user_id = :userId', { userId })
      .andWhere('n.deleted_at IS NULL')
      .getCount();
    return { indexed };
  }

  private async requireNote(
    userId: number,
    id: number,
    options: { includeDeleted?: boolean } = {},
  ): Promise<NoteEntity> {
    const qb = this.notesRepo
      .createQueryBuilder('n')
      .where('n.id = :id', { id })
      .andWhere('n.user_id = :userId', { userId });
    if (!options.includeDeleted) {
      qb.andWhere('n.deleted_at IS NULL');
    }
    const note = await qb.getOne();
    if (!note) {
      throw new NotFoundException(`Note ${id} was not found`);
    }
    return note;
  }

  private async nextPosition(userId: number, parentId: number | null): Promise<number> {
    const qb = this.notesRepo
      .createQueryBuilder('n')
      .select('COALESCE(MAX(n.position), -1) + 1', 'position')
      .where('n.user_id = :userId', { userId })
      .andWhere('n.deleted_at IS NULL');
    if (parentId === null) {
      qb.andWhere('n.parent_id IS NULL');
    } else {
      qb.andWhere('n.parent_id = :parentId', { parentId });
    }
    const row = await qb.getRawOne<{ position: number | string }>();
    return Number(row?.position ?? 0);
  }

  private normalizeName(name: string): string {
    const normalized = name.trim();
    if (normalized.length === 0) {
      throw new BadRequestException('Note name cannot be empty');
    }
    return normalized;
  }

  private async isDescendant(
    userId: number,
    candidateId: number,
    ancestorId: number,
  ): Promise<boolean> {
    let cursor: number | null = candidateId;
    while (cursor !== null) {
      if (cursor === ancestorId) {
        return true;
      }
      const row = await this.notesRepo.findOne({
        where: { id: cursor, user_id: userId },
        select: { parent_id: true },
      });
      cursor = row?.parent_id ?? null;
    }
    return false;
  }

  private async collectSubtreeIds(userId: number, rootId: number): Promise<number[]> {
    const rows = (await this.notesRepo.query(
      `
        WITH RECURSIVE subtree(id) AS (
          SELECT id FROM notes WHERE id = $1 AND user_id = $2
          UNION ALL
          SELECT notes.id FROM notes
          INNER JOIN subtree ON notes.parent_id = subtree.id
          WHERE notes.user_id = $2
        )
        SELECT id FROM subtree
      `,
      [rootId, userId],
    )) as Array<{ id: number }>;
    return rows.map((row) => Number(row.id));
  }

  private async detachAttachments(userId: number, noteIds: number[]): Promise<void> {
    if (noteIds.length === 0) {
      return;
    }
    await this.attachmentsRepo.update(
      { note_id: In(noteIds), user_id: userId },
      { note_id: null },
    );
  }

  private async resolveBatchParents(
    userId: number,
    options: CreateNestedBatchOptions,
  ): Promise<Array<{ id: number; name: string }>> {
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

  private async listActiveParentSnapshot(
    userId: number,
  ): Promise<Array<{ id: number; name: string }>> {
    return this.notesRepo
      .createQueryBuilder('n')
      .select('n.id', 'id')
      .addSelect('n.name', 'name')
      .where('n.user_id = :userId', { userId })
      .andWhere('n.deleted_at IS NULL')
      .orderBy('n.id', 'ASC')
      .getRawMany<{ id: number; name: string }>();
  }

  private async listParentSnapshot(
    userId: number,
    parentIds: number[],
  ): Promise<Array<{ id: number; name: string }>> {
    const ids = [...new Set(parentIds)];
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.notesRepo
      .createQueryBuilder('n')
      .select('n.id', 'id')
      .addSelect('n.name', 'name')
      .where('n.user_id = :userId', { userId })
      .andWhere('n.deleted_at IS NULL')
      .andWhere('n.id IN (:...ids)', { ids })
      .orderBy('n.id', 'ASC')
      .getRawMany<{ id: number; name: string }>();
    if (rows.length !== ids.length) {
      throw new NotFoundException('One or more parent notes were not found');
    }
    return rows;
  }

  private async listRecentNamedParentSnapshot(
    userId: number,
    parentNames: string[],
    expectedParentCount: number | null | undefined,
    recentWithinMinutes: number | null | undefined,
  ): Promise<Array<{ id: number; name: string }>> {
    const normalizedNames = [
      ...new Set(parentNames.map((name) => name.trim().toLowerCase()).filter(Boolean)),
    ];
    if (normalizedNames.length === 0) {
      throw new BadRequestException('parentNames are required when scope is recentNamedNotes');
    }

    const expectedCount = expectedParentCount ?? 100;
    const createdAfter = new Date(
      Date.now() - Math.max(recentWithinMinutes ?? 240, 1) * 60_000,
    ).toISOString();
    const rows = await this.notesRepo
      .createQueryBuilder('n')
      .select('n.id', 'id')
      .addSelect('n.name', 'name')
      .where('n.user_id = :userId', { userId })
      .andWhere('n.deleted_at IS NULL')
      .andWhere('n.created_at >= :createdAfter', { createdAfter })
      .andWhere('lower(n.name) IN (:...names)', { names: normalizedNames })
      .orderBy('n.created_at', 'DESC')
      .addOrderBy('n.id', 'DESC')
      .limit(Math.min(Math.max(expectedCount, 1), 100))
      .getRawMany<{ id: number; name: string }>();

    if (expectedParentCount && rows.length < expectedParentCount) {
      throw new BadRequestException(
        `Found ${rows.length} recent parent notes, expected ${expectedParentCount}`,
      );
    }

    return rows.sort((left, right) => left.id - right.id);
  }

  private formatBatchNoteName(pattern: string, index: number, parentName: string): string {
    const name = pattern
      .replaceAll('{index}', String(index))
      .replaceAll('{parent}', parentName)
      .trim();
    return name || `Заметка ${index}`;
  }

  private async mapNoteResponse(record: NoteEntity): Promise<NoteResponse> {
    return mapNote(
      {
        ...record,
        content_html: this.secretFieldCryptoService.decryptNoteHtml(record.content_html),
        is_favorite: record.is_favorite as 0 | 1,
        is_pinned: record.is_pinned as 0 | 1,
      },
      await this.tagsService.getTagsForNote(record.id),
    );
  }
}
