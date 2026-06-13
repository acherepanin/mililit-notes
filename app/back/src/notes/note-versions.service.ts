import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { nowIso } from '../database/db.util';
import { NoteVersionEntity } from '../database/entities/note.entity';
import type { NoteVersionResponse } from './notes.types';
import { SecretFieldCryptoService } from './secret-field-crypto.service';

const MAX_NOTE_VERSIONS = 80;
const VERSION_THROTTLE_MS = 60_000;

interface VersionableNote {
  id: number;
  user_id: number;
  name: string;
  content_html: string;
  content_text: string;
}

/**
 * Owns note version history: throttled snapshots, pruning to a cap, listing and
 * raw version lookup for restore. Content HTML is stored as-is (already
 * encrypted at rest) and only decrypted when mapped to a response.
 */
@Injectable()
export class NoteVersionsService {
  constructor(
    @InjectRepository(NoteVersionEntity)
    private readonly versionsRepo: Repository<NoteVersionEntity>,
    @Inject(SecretFieldCryptoService)
    private readonly secretFieldCryptoService: SecretFieldCryptoService,
  ) {}

  async createSnapshot(note: VersionableNote): Promise<void> {
    const latest = await this.versionsRepo.findOne({
      where: { note_id: note.id, user_id: note.user_id },
      order: { created_at: 'DESC', id: 'DESC' },
    });
    if (latest && Date.now() - Date.parse(latest.created_at) < VERSION_THROTTLE_MS) {
      await this.prune(note.user_id, note.id);
      return;
    }

    await this.versionsRepo.insert({
      note_id: note.id,
      user_id: note.user_id,
      name: note.name,
      content_html: note.content_html,
      content_text: note.content_text,
      created_at: nowIso(),
    });
    await this.prune(note.user_id, note.id);
  }

  async list(userId: number, noteId: number): Promise<NoteVersionResponse[]> {
    await this.prune(userId, noteId);
    const rows = await this.versionsRepo.find({
      where: { note_id: noteId, user_id: userId },
      order: { created_at: 'DESC', id: 'DESC' },
      take: MAX_NOTE_VERSIONS,
    });
    return rows.map((row) => this.mapVersion(row));
  }

  async getRaw(userId: number, noteId: number, versionId: number): Promise<NoteVersionEntity> {
    const version = await this.versionsRepo.findOne({
      where: { id: versionId, note_id: noteId, user_id: userId },
    });
    if (!version) {
      throw new NotFoundException(`Version ${versionId} was not found`);
    }
    return version;
  }

  async deleteForNotes(userId: number, noteIds: number[]): Promise<void> {
    if (noteIds.length === 0) {
      return;
    }
    await this.versionsRepo.delete({ note_id: In(noteIds), user_id: userId });
  }

  private async prune(userId: number, noteId: number): Promise<void> {
    const ids = await this.versionsRepo.find({
      where: { note_id: noteId, user_id: userId },
      order: { created_at: 'DESC', id: 'DESC' },
      select: { id: true },
    });
    const toDelete = ids.slice(MAX_NOTE_VERSIONS).map((row) => row.id);
    if (toDelete.length > 0) {
      await this.versionsRepo.delete({ id: In(toDelete) });
    }
  }

  private mapVersion(record: NoteVersionEntity): NoteVersionResponse {
    return {
      id: record.id,
      noteId: record.note_id,
      name: record.name,
      contentHtml: this.secretFieldCryptoService.decryptNoteHtml(record.content_html),
      contentText: record.content_text,
      createdAt: record.created_at,
    };
  }
}
