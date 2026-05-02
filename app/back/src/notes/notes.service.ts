import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { ActivityService } from '../activity/activity.service';
import { DatabaseService } from '../infra/database.service';
import type { CreateNoteDto } from './dto/create-note.dto';
import type { MoveNoteDto } from './dto/move-note.dto';
import type { UpdateNoteDto } from './dto/update-note.dto';
import { mapNote } from './notes.mapper';
import type { NoteRecord, NoteResponse, NoteTreeNode } from './notes.types';

@Injectable()
export class NotesService {
  constructor(
    @Inject(DatabaseService) private readonly databaseService: DatabaseService,
    @Inject(ActivityService) private readonly activityService: ActivityService,
  ) {}

  getTree(userId: number): NoteTreeNode[] {
    const notes = this.databaseService.connection
      .prepare(
        `
          SELECT *
          FROM notes
          WHERE user_id = @userId
          ORDER BY COALESCE(parent_id, 0), position ASC, lower(name) ASC
        `,
      )
      .all({ userId }) as NoteRecord[];

    const nodes = new Map<number, NoteTreeNode>();
    for (const note of notes) {
      nodes.set(note.id, {
        id: note.id,
        name: note.name,
        parentId: note.parent_id,
        children: [],
      });
    }

    const roots: NoteTreeNode[] = [];
    for (const note of notes) {
      const node = nodes.get(note.id);
      if (!node) {
        continue;
      }

      if (note.parent_id === null) {
        roots.push(node);
        continue;
      }

      nodes.get(note.parent_id)?.children.push(node);
    }

    return roots;
  }

  getById(userId: number, id: number): NoteResponse {
    return mapNote(this.requireNote(userId, id));
  }

  create(userId: number, dto: CreateNoteDto): NoteResponse {
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

  update(userId: number, id: number, dto: UpdateNoteDto): NoteResponse {
    this.requireNote(userId, id);

    const fields: string[] = ['updated_at = @updatedAt'];
    const params: Record<string, string | number> = {
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
      params.contentHtml = dto.contentHtml;
    }

    if (dto.contentText !== undefined) {
      fields.push('content_text = @contentText');
      params.contentText = dto.contentText;
    }

    this.databaseService.connection
      .prepare(`UPDATE notes SET ${fields.join(', ')} WHERE id = @id AND user_id = @userId`)
      .run(params);

    const note = this.getById(userId, id);
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
    this.databaseService.connection
      .prepare('DELETE FROM notes WHERE id = @id AND user_id = @userId')
      .run({ id, userId });
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

  private requireNote(userId: number, id: number): NoteRecord {
    const note = this.databaseService.connection
      .prepare('SELECT * FROM notes WHERE id = @id AND user_id = @userId')
      .get({ id, userId }) as NoteRecord | undefined;

    if (!note) {
      throw new NotFoundException(`Note ${id} was not found`);
    }

    return note;
  }

  private nextPosition(userId: number, parentId: number | null): number {
    const sql =
      parentId === null
        ? 'SELECT COALESCE(MAX(position), -1) + 1 as position FROM notes WHERE user_id = @userId AND parent_id IS NULL'
        : 'SELECT COALESCE(MAX(position), -1) + 1 as position FROM notes WHERE user_id = @userId AND parent_id = @parentId';
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
}
