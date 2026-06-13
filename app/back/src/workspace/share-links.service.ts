import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { Repository } from 'typeorm';

import { hideSecretValuesInHtml, redactSecretText } from '../common/secret-redaction.util';
import { nowIso } from '../database/db.util';
import { NoteEntity } from '../database/entities/note.entity';
import {
  ShareLinkAccessLogEntity,
  ShareLinkEntity,
} from '../database/entities/share.entity';
import { NotesService } from '../notes/notes.service';
import { EntitlementsService } from '../subscriptions/entitlements.service';
import type { CreateShareLinkDto } from './dto/workspace.dto';
import type { PublicShareResponse, ShareLinkResponse } from './workspace.types';

@Injectable()
export class ShareLinksService {
  constructor(
    @InjectRepository(ShareLinkEntity)
    private readonly shareLinksRepo: Repository<ShareLinkEntity>,
    @InjectRepository(ShareLinkAccessLogEntity)
    private readonly accessLogsRepo: Repository<ShareLinkAccessLogEntity>,
    @InjectRepository(NoteEntity) private readonly notesRepo: Repository<NoteEntity>,
    @Inject(NotesService) private readonly notesService: NotesService,
    @Inject(EntitlementsService) private readonly entitlementsService: EntitlementsService,
  ) {}

  async listShareLinks(userId: number, noteId: number): Promise<ShareLinkResponse[]> {
    await this.requireNote(userId, noteId);
    const rows = await this.shareLinksRepo.find({
      where: { note_id: noteId, user_id: userId },
      order: { created_at: 'DESC' },
    });
    return rows.map((row) => this.mapShareLink(row));
  }

  async createShareLink(
    userId: number,
    noteId: number,
    dto: CreateShareLinkDto,
  ): Promise<ShareLinkResponse> {
    await this.entitlementsService.assertPublicShareAccess(userId);
    await this.requireNote(userId, noteId);
    const token = randomBytes(24).toString('base64url');
    const publicUrl = `/share/${token}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (dto.ttlHours ?? 24) * 60 * 60 * 1000).toISOString();
    const created = await this.shareLinksRepo.save(
      this.shareLinksRepo.create({
        note_id: noteId,
        user_id: userId,
        token_hash: this.hashToken(token),
        public_url: publicUrl,
        expires_at: expiresAt,
        include_secrets: dto.includeSecrets ? 1 : 0,
        max_access_count: dto.oneTime ? 1 : null,
        created_at: now.toISOString(),
      }),
    );
    return { ...this.mapShareLink(created), url: publicUrl };
  }

  async revokeShareLink(userId: number, id: number): Promise<{ id: number }> {
    const result = await this.shareLinksRepo.delete({ id, user_id: userId });
    if (!result.affected) {
      throw new NotFoundException(`Share link ${id} was not found`);
    }
    return { id };
  }

  async getPublicShare(
    token: string,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<PublicShareResponse> {
    const tokenHash = this.hashToken(token);
    const row = await this.shareLinksRepo.findOne({ where: { token_hash: tokenHash } });
    const accessLimitReached = row
      ? row.max_access_count !== null && row.access_count >= row.max_access_count
      : false;

    if (!row || row.revoked_at || Date.parse(row.expires_at) < Date.now() || accessLimitReached) {
      throw new NotFoundException('Share link was not found');
    }

    const accessedAt = nowIso();
    const nextAccessCount = row.access_count + 1;
    const reachedLimit = row.max_access_count !== null && nextAccessCount >= row.max_access_count;
    await this.shareLinksRepo.update(row.id, {
      last_accessed_at: accessedAt,
      access_count: nextAccessCount,
      revoked_at: reachedLimit ? accessedAt : row.revoked_at,
    });
    await this.accessLogsRepo.insert({
      share_link_id: row.id,
      user_agent: userAgent ?? null,
      ip_address: ipAddress ?? null,
      accessed_at: accessedAt,
    });

    const note = await this.notesService.getById(row.user_id, row.note_id);
    return {
      note: {
        id: note.id,
        name: note.name,
        contentHtml: row.include_secrets
          ? note.contentHtml
          : hideSecretValuesInHtml(note.contentHtml),
        contentText: row.include_secrets ? note.contentText : redactSecretText(note.contentText),
        updatedAt: note.updatedAt,
      },
      expiresAt: row.expires_at,
    };
  }

  private async requireNote(userId: number, id: number): Promise<void> {
    const exists = await this.notesRepo
      .createQueryBuilder('n')
      .where('n.id = :id', { id })
      .andWhere('n.user_id = :userId', { userId })
      .andWhere('n.deleted_at IS NULL')
      .getExists();
    if (!exists) {
      throw new NotFoundException(`Note ${id} was not found`);
    }
  }

  private mapShareLink(row: ShareLinkEntity): ShareLinkResponse {
    return {
      id: row.id,
      noteId: row.note_id,
      url: row.public_url ?? '',
      expiresAt: row.expires_at,
      includeSecrets: row.include_secrets === 1,
      oneTime: row.max_access_count === 1,
      accessCount: row.access_count,
      maxAccessCount: row.max_access_count,
      revokedAt: row.revoked_at,
      createdAt: row.created_at,
      lastAccessedAt: row.last_accessed_at,
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
