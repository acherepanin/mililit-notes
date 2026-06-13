import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { nowIso } from '../database/db.util';
import { NoteTagEntity, TagEntity } from '../database/entities/note.entity';
import type { TagResponse } from './notes.types';

const MAX_TAGS_PER_NOTE = 20;

/**
 * Owns tags and the note<->tag relation, including batch tag loading used by
 * the tree and search. Isolated from NotesService so tag rules live in one
 * place and can be reused by other features.
 */
@Injectable()
export class TagsService {
  constructor(
    @InjectRepository(TagEntity) private readonly tagsRepo: Repository<TagEntity>,
    @InjectRepository(NoteTagEntity) private readonly noteTagsRepo: Repository<NoteTagEntity>,
  ) {}

  async listTags(userId: number): Promise<TagResponse[]> {
    const rows = await this.tagsRepo
      .createQueryBuilder('t')
      .select('t.id', 'id')
      .addSelect('lower(t.name)', 'name')
      .addSelect('t.color', 'color')
      .where('t.user_id = :userId', { userId })
      .orderBy('lower(t.name)', 'ASC')
      .getRawMany<TagResponse>();
    return rows;
  }

  async createTag(userId: number, name: string): Promise<TagResponse> {
    const tagId = await this.ensureTag(userId, name);
    return this.requireTag(userId, tagId);
  }

  async deleteTag(userId: number, tagId: number): Promise<{ id: number }> {
    await this.tagsRepo.delete({ id: tagId, user_id: userId });
    return { id: tagId };
  }

  async updateTag(userId: number, tagId: number, name: string): Promise<TagResponse> {
    await this.requireTag(userId, tagId);
    const normalizedName = this.normalizeTagName(name);

    const existing = await this.tagsRepo
      .createQueryBuilder('t')
      .where('t.user_id = :userId', { userId })
      .andWhere('lower(t.name) = lower(:name)', { name: normalizedName })
      .andWhere('t.id != :tagId', { tagId })
      .getOne();

    if (existing) {
      await this.noteTagsRepo.manager.transaction(async (manager) => {
        const links = await manager.find(NoteTagEntity, { where: { tag_id: tagId } });
        for (const link of links) {
          await manager
            .createQueryBuilder()
            .insert()
            .into(NoteTagEntity)
            .values({ note_id: link.note_id, tag_id: existing.id, created_at: nowIso() })
            .orIgnore()
            .execute();
        }
        await manager.delete(TagEntity, { id: tagId, user_id: userId });
      });
      return this.requireTag(userId, existing.id);
    }

    await this.tagsRepo.update(
      { id: tagId, user_id: userId },
      { name: normalizedName, updated_at: nowIso() },
    );
    return this.requireTag(userId, tagId);
  }

  /**
   * Replaces the full tag set of a note with the given tag names (which must
   * already exist for the user). Returns nothing; the caller re-reads the note.
   */
  async setNoteTags(userId: number, noteId: number, tags: string[]): Promise<void> {
    const normalizedTags = [
      ...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean)),
    ].slice(0, MAX_TAGS_PER_NOTE);

    const existingTags = await this.getExistingTagIds(userId, normalizedTags);
    if (existingTags.size !== normalizedTags.length) {
      throw new BadRequestException('Tag does not exist');
    }

    await this.noteTagsRepo.manager.transaction(async (manager) => {
      await manager.delete(NoteTagEntity, { note_id: noteId });
      for (const tag of normalizedTags) {
        const tagId = existingTags.get(tag);
        if (!tagId) {
          continue;
        }
        await manager
          .createQueryBuilder()
          .insert()
          .into(NoteTagEntity)
          .values({ note_id: noteId, tag_id: tagId, created_at: nowIso() })
          .orIgnore()
          .execute();
      }
    });
  }

  async getTagsForNote(noteId: number): Promise<string[]> {
    const map = await this.getTagsForNotes([noteId]);
    return map.get(noteId) ?? [];
  }

  async getTagsForNotes(noteIds: number[]): Promise<Map<number, string[]>> {
    const tagsByNote = new Map<number, string[]>();
    if (noteIds.length === 0) {
      return tagsByNote;
    }

    const rows = await this.noteTagsRepo
      .createQueryBuilder('nt')
      .innerJoin(TagEntity, 't', 't.id = nt.tag_id')
      .select('nt.note_id', 'note_id')
      .addSelect('lower(t.name)', 'name')
      .where('nt.note_id IN (:...noteIds)', { noteIds })
      .orderBy('lower(t.name)', 'ASC')
      .getRawMany<{ note_id: number; name: string }>();

    for (const row of rows) {
      const current = tagsByNote.get(row.note_id) ?? [];
      current.push(row.name);
      tagsByNote.set(row.note_id, current);
    }

    return tagsByNote;
  }

  private async ensureTag(userId: number, name: string): Promise<number> {
    const normalizedName = this.normalizeTagName(name);
    const existing = await this.tagsRepo
      .createQueryBuilder('t')
      .where('t.user_id = :userId', { userId })
      .andWhere('lower(t.name) = lower(:name)', { name: normalizedName })
      .getOne();
    if (existing) {
      return existing.id;
    }

    const now = nowIso();
    const created = await this.tagsRepo.save(
      this.tagsRepo.create({
        user_id: userId,
        name: normalizedName,
        created_at: now,
        updated_at: now,
      }),
    );
    return created.id;
  }

  private normalizeTagName(name: string): string {
    const normalizedName = name.trim().toLowerCase().slice(0, 32);
    if (!normalizedName) {
      throw new BadRequestException('Tag name cannot be empty');
    }
    return normalizedName;
  }

  private async requireTag(userId: number, tagId: number): Promise<TagResponse> {
    const tag = await this.tagsRepo.findOne({ where: { id: tagId, user_id: userId } });
    if (!tag) {
      throw new NotFoundException(`Tag ${tagId} was not found`);
    }
    return { id: tag.id, name: tag.name.toLowerCase(), color: tag.color };
  }

  private async getExistingTagIds(userId: number, tags: string[]): Promise<Map<string, number>> {
    const tagIds = new Map<string, number>();
    if (tags.length === 0) {
      return tagIds;
    }

    const rows = await this.tagsRepo
      .createQueryBuilder('t')
      .select('t.id', 'id')
      .addSelect('lower(t.name)', 'name')
      .where('t.user_id = :userId', { userId })
      .andWhere('lower(t.name) IN (:...tags)', { tags: tags.map((tag) => tag.toLowerCase()) })
      .getRawMany<{ id: number; name: string }>();

    for (const row of rows) {
      tagIds.set(row.name, row.id);
    }
    return tagIds;
  }
}
