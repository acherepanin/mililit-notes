import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { nowIso } from '../database/db.util';
import { NoteTemplateEntity } from '../database/entities/note.entity';
import type { CreateNoteDto } from '../notes/dto/create-note.dto';
import { NotesService } from '../notes/notes.service';
import type { NoteResponse } from '../notes/notes.types';
import { SecretFieldCryptoService } from '../notes/secret-field-crypto.service';
import { EntitlementsService } from '../subscriptions/entitlements.service';
import type { CreateNoteFromTemplateDto, TemplateDto } from './dto/workspace.dto';
import type { NoteTemplateResponse } from './workspace.types';

@Injectable()
export class TemplatesService {
  constructor(
    @InjectRepository(NoteTemplateEntity)
    private readonly templatesRepo: Repository<NoteTemplateEntity>,
    @Inject(NotesService) private readonly notesService: NotesService,
    @Inject(SecretFieldCryptoService)
    private readonly secretFieldCryptoService: SecretFieldCryptoService,
    @Inject(EntitlementsService) private readonly entitlementsService: EntitlementsService,
  ) {}

  async listTemplates(userId: number): Promise<NoteTemplateResponse[]> {
    const rows = await this.templatesRepo
      .createQueryBuilder('t')
      .where('(t.user_id = :userId OR t.is_system = 1)', { userId })
      .orderBy('t.is_system', 'DESC')
      .addOrderBy('lower(t.name)', 'ASC')
      .getMany();
    return rows.map((row) => this.mapTemplate(row));
  }

  async createTemplate(userId: number, dto: TemplateDto): Promise<NoteTemplateResponse> {
    await this.entitlementsService.assertTemplatesAccess(userId);
    const now = nowIso();
    const created = await this.templatesRepo.save(
      this.templatesRepo.create({
        user_id: userId,
        name: dto.name.trim(),
        content_html: this.secretFieldCryptoService.encryptNoteHtml(dto.contentHtml),
        content_text: dto.contentText,
        is_system: 0,
        created_at: now,
        updated_at: now,
      }),
    );
    return this.mapTemplate(created);
  }

  async updateTemplate(userId: number, id: number, dto: TemplateDto): Promise<NoteTemplateResponse> {
    await this.entitlementsService.assertTemplatesAccess(userId);
    await this.getTemplateRecord(userId, id, { writable: true });
    await this.templatesRepo.update(
      { id, user_id: userId },
      {
        name: dto.name.trim(),
        content_html: this.secretFieldCryptoService.encryptNoteHtml(dto.contentHtml),
        content_text: dto.contentText,
        updated_at: nowIso(),
      },
    );
    return this.mapTemplate(await this.getTemplateRecord(userId, id));
  }

  async deleteTemplate(userId: number, id: number): Promise<{ id: number }> {
    await this.entitlementsService.assertTemplatesAccess(userId);
    await this.getTemplateRecord(userId, id, { writable: true });
    await this.templatesRepo.delete({ id, user_id: userId });
    return { id };
  }

  async createNoteFromTemplate(
    userId: number,
    dto: CreateNoteFromTemplateDto,
  ): Promise<NoteResponse> {
    await this.entitlementsService.assertTemplatesAccess(userId);
    const template = await this.getTemplateRecord(userId, dto.templateId);
    const created = await this.notesService.create(userId, {
      name: template.name,
      parentId: dto.parentId ?? null,
    } satisfies CreateNoteDto);
    return this.notesService.update(userId, created.id, {
      contentHtml: this.secretFieldCryptoService.decryptNoteHtml(template.content_html),
      contentText: template.content_text,
    });
  }

  async listExportTemplates(userId: number): Promise<NoteTemplateResponse[]> {
    const rows = await this.templatesRepo
      .createQueryBuilder('t')
      .where('t.user_id = :userId', { userId })
      .andWhere('t.is_system = 0')
      .orderBy('lower(t.name)', 'ASC')
      .addOrderBy('t.id', 'ASC')
      .getMany();
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      contentHtml: row.content_html,
      contentText: row.content_text,
      isSystem: false,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  private async getTemplateRecord(
    userId: number,
    id: number,
    options: { writable?: boolean } = {},
  ): Promise<NoteTemplateEntity> {
    const qb = this.templatesRepo.createQueryBuilder('t').where('t.id = :id', { id });
    if (options.writable) {
      qb.andWhere('t.user_id = :userId', { userId });
    } else {
      qb.andWhere('(t.user_id = :userId OR t.is_system = 1)', { userId });
    }
    const row = await qb.getOne();
    if (!row) {
      throw new NotFoundException(`Template ${id} was not found`);
    }
    return row;
  }

  private mapTemplate(row: NoteTemplateEntity): NoteTemplateResponse {
    return {
      id: row.id,
      name: row.name,
      contentHtml: this.secretFieldCryptoService.decryptNoteHtml(row.content_html),
      contentText: row.content_text,
      isSystem: row.is_system === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
