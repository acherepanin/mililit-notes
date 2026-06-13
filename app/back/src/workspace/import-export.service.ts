import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { NoteEntity } from '../database/entities/note.entity';
import type { CreateNoteDto } from '../notes/dto/create-note.dto';
import { mapNote } from '../notes/notes.mapper';
import { NotesService } from '../notes/notes.service';
import type { NoteRecord } from '../notes/notes.types';
import { TagsService } from '../notes/tags.service';
import { EntitlementsService } from '../subscriptions/entitlements.service';
import type { ImportNotesDto } from './dto/workspace.dto';
import { TemplatesService } from './templates.service';
import type { ExportResponse } from './workspace.types';

interface ImportableNote {
  id: number | null;
  name: string;
  contentHtml: string;
  contentText: string;
  parentId: number | null;
  isFavorite: boolean;
  isPinned: boolean;
  tags: string[];
}

const MAX_IMPORT_NOTES = 1000;
const MAX_TAGS_PER_NOTE = 20;

@Injectable()
export class ImportExportService {
  constructor(
    @InjectRepository(NoteEntity) private readonly notesRepo: Repository<NoteEntity>,
    @Inject(NotesService) private readonly notesService: NotesService,
    @Inject(TagsService) private readonly tagsService: TagsService,
    @Inject(TemplatesService) private readonly templatesService: TemplatesService,
    @Inject(EntitlementsService) private readonly entitlementsService: EntitlementsService,
  ) {}

  async exportJson(userId: number): Promise<ExportResponse> {
    await this.entitlementsService.assertExportImportAccess(userId);
    const rows = await this.notesRepo
      .createQueryBuilder('n')
      .where('n.user_id = :userId', { userId })
      .andWhere('n.deleted_at IS NULL')
      .orderBy('n.parent_id', 'ASC')
      .addOrderBy('n.position', 'ASC')
      .addOrderBy('n.id', 'ASC')
      .getMany();
    const tagsByNote = await this.tagsService.getTagsForNotes(rows.map((row) => row.id));

    return {
      exportedAt: new Date().toISOString(),
      notes: rows.map((row) =>
        mapNote(this.toNoteRecord(row), tagsByNote.get(row.id) ?? []),
      ),
      templates: await this.templatesService.listExportTemplates(userId),
    };
  }

  async importJson(userId: number, dto: ImportNotesDto): Promise<{ imported: number }> {
    await this.entitlementsService.assertExportImportAccess(userId);
    const notes = this.normalizeImportNotes(dto.notes);
    const idMap = new Map<number, number>();
    let imported = 0;

    for (const note of notes) {
      const created = await this.notesService.create(userId, {
        name: note.name,
        parentId: null,
      } satisfies CreateNoteDto);
      await this.notesService.update(userId, created.id, {
        contentHtml: note.contentHtml,
        contentText: note.contentText,
        isFavorite: note.isFavorite,
        isPinned: note.isPinned,
      });

      for (const tag of note.tags) {
        await this.notesService.createTag(userId, tag);
      }
      if (note.tags.length > 0) {
        await this.notesService.updateTags(userId, created.id, note.tags);
      }

      if (note.id !== null) {
        idMap.set(note.id, created.id);
      }
      imported += 1;
    }

    for (const note of notes) {
      if (note.id === null || note.parentId === null) {
        continue;
      }
      const nextId = idMap.get(note.id);
      const nextParentId = idMap.get(note.parentId);
      if (nextId && nextParentId && nextId !== nextParentId) {
        await this.notesService.move(userId, nextId, { parentId: nextParentId });
      }
    }

    const templates = Array.isArray(dto.templates) ? dto.templates : [];
    for (const rawTemplate of templates) {
      if (!rawTemplate || typeof rawTemplate !== 'object') {
        continue;
      }
      const template = rawTemplate as Record<string, unknown>;
      await this.templatesService.createTemplate(userId, {
        name: this.normalizeImportName(template.name),
        contentHtml: this.readString(template.contentHtml),
        contentText: this.readString(template.contentText),
      });
    }

    return { imported };
  }

  private toNoteRecord(row: NoteEntity): NoteRecord {
    return {
      ...row,
      is_favorite: row.is_favorite as 0 | 1,
      is_pinned: row.is_pinned as 0 | 1,
    };
  }

  private normalizeImportNotes(notes: Array<Record<string, unknown>>): ImportableNote[] {
    if (!Array.isArray(notes)) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'JSON file must contain notes array',
        code: 'IMPORT_INVALID_JSON',
      });
    }
    if (notes.length > MAX_IMPORT_NOTES) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'JSON file contains too many notes',
        code: 'IMPORT_TOO_MANY',
      });
    }
    return notes.map((rawNote) => this.normalizeImportNote(rawNote));
  }

  private normalizeImportNote(rawNote: Record<string, unknown>): ImportableNote {
    if (!rawNote || typeof rawNote !== 'object') {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Invalid note in JSON file',
        code: 'IMPORT_INVALID_NOTE',
      });
    }

    const tags = Array.isArray(rawNote.tags)
      ? [
          ...new Set(
            rawNote.tags
              .filter((tag): tag is string => typeof tag === 'string')
              .map((tag) => tag.trim().toLowerCase())
              .filter(Boolean),
          ),
        ].slice(0, MAX_TAGS_PER_NOTE)
      : [];

    return {
      id: this.readNullableNumber(rawNote.id),
      name: this.normalizeImportName(rawNote.name),
      contentHtml: this.readString(rawNote.contentHtml),
      contentText: this.readString(rawNote.contentText),
      parentId: this.readNullableNumber(rawNote.parentId),
      isFavorite: rawNote.isFavorite === true,
      isPinned: rawNote.isPinned === true,
      tags,
    };
  }

  private normalizeImportName(value: unknown): string {
    const name = typeof value === 'string' ? value.trim() : '';
    return (name || 'Imported note').slice(0, 120);
  }

  private readString(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private readNullableNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
  }
}
