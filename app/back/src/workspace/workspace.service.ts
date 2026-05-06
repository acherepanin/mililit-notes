import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

import { AttachmentFilesService } from '../infra/attachment-files.service';
import { DatabaseService } from '../infra/database.service';
import { bindSqlList } from '../infra/sql';
import { CreateNoteDto } from '../notes/dto/create-note.dto';
import { mapNote } from '../notes/notes.mapper';
import { NotesService } from '../notes/notes.service';
import type { NoteRecord } from '../notes/notes.types';
import { SecretFieldCryptoService } from '../notes/secret-field-crypto.service';
import type {
  CreateNoteFromTemplateDto,
  CreateShareLinkDto,
  AttachAttachmentDto,
  ImportNotesDto,
  RenameAttachmentDto,
  TemplateDto,
  UploadAttachmentDto,
} from './dto/workspace.dto';
import type {
  AttachmentResponse,
  ExportResponse,
  NoteTemplateResponse,
  PublicShareResponse,
  ShareLinkResponse,
} from './workspace.types';

interface TemplateRecord {
  id: number;
  user_id: number | null;
  name: string;
  content_html: string;
  content_text: string;
  is_system: 0 | 1;
  created_at: string;
  updated_at: string;
}

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

interface AttachmentRecord {
  id: number;
  note_id: number | null;
  note_name?: string | null;
  user_id: number;
  file_name: string;
  mime_type: string;
  size: number;
  storage_path: string;
  created_at: string;
}

interface ZipEntry {
  fileName: string;
  content: Buffer;
}

const CRC32_TABLE = new Uint32Array(256);
for (let index = 0; index < CRC32_TABLE.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  CRC32_TABLE[index] = value >>> 0;
}

interface ShareLinkRecord {
  id: number;
  note_id: number;
  user_id: number;
  token_hash: string;
  public_url: string | null;
  expires_at: string;
  include_secrets: 0 | 1;
  max_access_count: number | null;
  access_count: number;
  revoked_at: string | null;
  created_at: string;
  last_accessed_at: string | null;
}

@Injectable()
export class WorkspaceService {
  private readonly uploadDir: string;
  private readonly maxUploadBytes: number;
  private readonly allowedExtensions: Set<string>;

  constructor(
    @Inject(DatabaseService) private readonly databaseService: DatabaseService,
    @Inject(AttachmentFilesService)
    private readonly attachmentFilesService: AttachmentFilesService,
    @Inject(NotesService) private readonly notesService: NotesService,
    @Inject(SecretFieldCryptoService)
    private readonly secretFieldCryptoService: SecretFieldCryptoService,
    @Inject(ConfigService) configService: ConfigService,
  ) {
    this.uploadDir =
      configService.get<string>('UPLOAD_DIR')?.trim() || join(process.cwd(), 'uploads');
    this.maxUploadBytes =
      Number(configService.get<string>('MAX_UPLOAD_SIZE_MB') ?? 25) * 1024 * 1024;
    this.allowedExtensions = new Set(
      (
        configService.get<string>('ALLOWED_UPLOAD_EXTENSIONS') ??
        '.txt,.md,.json,.yaml,.yml,.env,.png,.jpg,.jpeg,.webp,.pdf,.zip'
      )
        .split(',')
        .map((extension) => extension.trim().toLowerCase())
        .filter(Boolean),
    );
    mkdirSync(this.uploadDir, { recursive: true });
  }

  listTemplates(userId: number): NoteTemplateResponse[] {
    const rows = this.databaseService.connection
      .prepare(
        `
          SELECT *
          FROM note_templates
          WHERE user_id = @userId OR is_system = 1
          ORDER BY is_system DESC, lower(name) ASC
        `,
      )
      .all({ userId }) as TemplateRecord[];
    return rows.map((row) => this.mapTemplate(row));
  }

  createTemplate(userId: number, dto: TemplateDto): NoteTemplateResponse {
    const now = new Date().toISOString();
    const result = this.databaseService.connection
      .prepare(
        `
          INSERT INTO note_templates (user_id, name, content_html, content_text, is_system, created_at, updated_at)
          VALUES (@userId, @name, @contentHtml, @contentText, 0, @now, @now)
        `,
      )
      .run({
        userId,
        name: dto.name.trim(),
        contentHtml: this.secretFieldCryptoService.encryptNoteHtml(dto.contentHtml),
        contentText: dto.contentText,
        now,
      });
    return this.getTemplate(userId, Number(result.lastInsertRowid));
  }

  updateTemplate(userId: number, id: number, dto: TemplateDto): NoteTemplateResponse {
    this.getTemplateRecord(userId, id, { writable: true });
    this.databaseService.connection
      .prepare(
        `
          UPDATE note_templates
          SET name = @name, content_html = @contentHtml, content_text = @contentText, updated_at = @updatedAt
          WHERE id = @id AND user_id = @userId
        `,
      )
      .run({
        id,
        userId,
        name: dto.name.trim(),
        contentHtml: this.secretFieldCryptoService.encryptNoteHtml(dto.contentHtml),
        contentText: dto.contentText,
        updatedAt: new Date().toISOString(),
      });
    return this.getTemplate(userId, id);
  }

  deleteTemplate(userId: number, id: number): { id: number } {
    this.getTemplateRecord(userId, id, { writable: true });
    this.databaseService.connection
      .prepare('DELETE FROM note_templates WHERE id = @id AND user_id = @userId')
      .run({ id, userId });
    return { id };
  }

  createNoteFromTemplate(userId: number, dto: CreateNoteFromTemplateDto) {
    const template = this.getTemplateRecord(userId, dto.templateId);
    const created = this.notesService.create(userId, {
      name: template.name,
      parentId: dto.parentId ?? null,
    } satisfies CreateNoteDto);
    return this.notesService.update(userId, created.id, {
      contentHtml: this.secretFieldCryptoService.decryptNoteHtml(template.content_html),
      contentText: template.content_text,
    });
  }

  exportJson(userId: number): ExportResponse {
    const rows = this.databaseService.connection
      .prepare(
        `
          SELECT *
          FROM notes
          WHERE user_id = @userId AND deleted_at IS NULL
          ORDER BY parent_id, position, id
        `,
      )
      .all({ userId }) as NoteRecord[];
    const tagsByNote = this.getExportTagsByNote(rows.map((row) => row.id));

    return {
      exportedAt: new Date().toISOString(),
      notes: rows.map((row) => mapNote(row, tagsByNote.get(row.id) ?? [])),
      templates: this.listExportTemplates(userId),
    };
  }

  importJson(userId: number, dto: ImportNotesDto): { imported: number } {
    const notes = this.normalizeImportNotes(dto.notes);
    const transaction = this.databaseService.connection.transaction(() => {
      const idMap = new Map<number, number>();
      let imported = 0;

      for (const note of notes) {
        const created = this.notesService.create(userId, {
          name: note.name,
          parentId: null,
        } satisfies CreateNoteDto);
        this.notesService.update(userId, created.id, {
          contentHtml: note.contentHtml,
          contentText: note.contentText,
          isFavorite: note.isFavorite,
          isPinned: note.isPinned,
        });

        for (const tag of note.tags) {
          this.notesService.createTag(userId, tag);
        }
        if (note.tags.length > 0) {
          this.notesService.updateTags(userId, created.id, note.tags);
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
          this.notesService.move(userId, nextId, { parentId: nextParentId });
        }
      }

      const templates = Array.isArray(dto.templates) ? dto.templates : [];
      for (const rawTemplate of templates) {
        if (!rawTemplate || typeof rawTemplate !== 'object') {
          continue;
        }

        const template = rawTemplate as Record<string, unknown>;
        this.createTemplate(userId, {
          name: this.normalizeImportName(template.name),
          contentHtml: this.readString(template.contentHtml),
          contentText: this.readString(template.contentText),
        });
      }

      return { imported };
    });

    return transaction();
  }

  uploadAttachment(userId: number, dto: UploadAttachmentDto): AttachmentResponse {
    const noteId = dto.noteId ?? null;
    if (noteId !== null) {
      this.requireNote(userId, noteId);
    }

    const content = Buffer.from(dto.contentBase64, 'base64');
    if (content.byteLength > this.maxUploadBytes) {
      throw new BadRequestException('File is too large');
    }

    const fileName = this.sanitizeAttachmentName(dto.fileName);
    const extension = extname(fileName).toLowerCase();
    if (extension && !this.allowedExtensions.has(extension)) {
      throw new BadRequestException('File type is not allowed');
    }

    const storageName = `${userId}-${Date.now()}-${randomBytes(8).toString('hex')}${extension}`;
    const storagePath = join(this.uploadDir, storageName);
    writeFileSync(storagePath, content);
    const result = this.databaseService.connection
      .prepare(
        `
          INSERT INTO attachments (note_id, user_id, file_name, mime_type, size, storage_path, created_at)
          VALUES (@noteId, @userId, @fileName, @mimeType, @size, @storagePath, @createdAt)
        `,
      )
      .run({
        noteId,
        userId,
        fileName,
        mimeType: dto.mimeType ?? 'application/octet-stream',
        size: content.byteLength,
        storagePath,
        createdAt: new Date().toISOString(),
      });
    return this.getAttachment(userId, Number(result.lastInsertRowid));
  }

  renameAttachment(userId: number, id: number, dto: RenameAttachmentDto): AttachmentResponse {
    this.getAttachmentRecord(userId, id);
    const fileName = this.sanitizeAttachmentName(dto.fileName);
    this.databaseService.connection
      .prepare(
        `
          UPDATE attachments
          SET file_name = @fileName
          WHERE id = @id AND user_id = @userId
        `,
      )
      .run({ id, userId, fileName });
    return this.getAttachment(userId, id);
  }

  attachAttachmentToNote(userId: number, id: number, dto: AttachAttachmentDto): AttachmentResponse {
    this.getAttachmentRecord(userId, id);
    const noteId = dto.noteId ?? null;
    if (noteId !== null) {
      this.requireNote(userId, noteId);
    }

    this.databaseService.connection
      .prepare(
        `
          UPDATE attachments
          SET note_id = @noteId
          WHERE id = @id AND user_id = @userId
        `,
      )
      .run({ id, userId, noteId });

    return this.getAttachment(userId, id);
  }

  listAccountAttachments(userId: number): AttachmentResponse[] {
    const rows = this.databaseService.connection
      .prepare(
        `
          SELECT attachments.*, notes.name as note_name
          FROM attachments
          LEFT JOIN notes ON notes.id = attachments.note_id AND notes.deleted_at IS NULL
          WHERE attachments.user_id = @userId
          ORDER BY attachments.created_at DESC
        `,
      )
      .all({ userId }) as AttachmentRecord[];
    return rows.map((row) => this.mapAttachment(row));
  }

  listAttachments(userId: number, noteId: number): AttachmentResponse[] {
    this.requireNote(userId, noteId);
    const rows = this.databaseService.connection
      .prepare(
        `
          SELECT attachments.*, notes.name as note_name
          FROM attachments
          LEFT JOIN notes ON notes.id = attachments.note_id
          WHERE attachments.note_id = @noteId AND attachments.user_id = @userId
          ORDER BY attachments.created_at DESC
        `,
      )
      .all({ noteId, userId }) as AttachmentRecord[];
    return rows.map((row) => this.mapAttachment(row));
  }

  downloadAttachment(userId: number, id: number): { record: AttachmentResponse; content: Buffer } {
    const row = this.getAttachmentRecord(userId, id);
    if (!existsSync(row.storage_path)) {
      throw new NotFoundException('Attachment file was not found');
    }
    return { record: this.mapAttachment(row), content: readFileSync(row.storage_path) };
  }

  downloadAttachmentsArchive(
    userId: number,
    noteId: number,
    attachmentIds: number[] = [],
  ): { fileName: string; content: Buffer } {
    this.requireNote(userId, noteId);
    const selectedIds = new Set(attachmentIds);
    const rows = (
      this.databaseService.connection
        .prepare(
          'SELECT * FROM attachments WHERE note_id = @noteId AND user_id = @userId ORDER BY created_at DESC',
        )
        .all({ noteId, userId }) as AttachmentRecord[]
    ).filter((row) => selectedIds.size === 0 || selectedIds.has(row.id));

    const names = new Set<string>();
    const entries = rows
      .filter((row) => existsSync(row.storage_path))
      .map((row) => ({
        fileName: this.makeUniqueZipName(row.file_name, names),
        content: readFileSync(row.storage_path),
      }));

    return {
      fileName: `note-${noteId}-attachments.zip`,
      content: this.createZip(entries),
    };
  }

  downloadAccountAttachmentsArchive(
    userId: number,
    attachmentIds: number[] = [],
  ): { fileName: string; content: Buffer } {
    const rows = this.listAttachmentRecords(userId, attachmentIds);
    const names = new Set<string>();
    const entries = rows
      .filter((row) => existsSync(row.storage_path))
      .map((row) => ({
        fileName: this.makeUniqueZipName(row.file_name, names),
        content: readFileSync(row.storage_path),
      }));

    return {
      fileName: 'account-attachments.zip',
      content: this.createZip(entries),
    };
  }

  deleteAttachment(userId: number, id: number): { id: number } {
    this.getAttachmentRecord(userId, id);
    this.attachmentFilesService.deleteByIds(userId, [id]);
    this.databaseService.connection
      .prepare('DELETE FROM attachments WHERE id = @id AND user_id = @userId')
      .run({ id, userId });
    return { id };
  }

  listShareLinks(userId: number, noteId: number): ShareLinkResponse[] {
    this.requireNote(userId, noteId);
    const rows = this.databaseService.connection
      .prepare(
        'SELECT * FROM share_links WHERE note_id = @noteId AND user_id = @userId ORDER BY created_at DESC',
      )
      .all({ noteId, userId }) as ShareLinkRecord[];
    return rows.map((row) => this.mapShareLink(row));
  }

  createShareLink(userId: number, noteId: number, dto: CreateShareLinkDto): ShareLinkResponse {
    this.requireNote(userId, noteId);
    const token = randomBytes(24).toString('base64url');
    const publicUrl = `/share/${token}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (dto.ttlHours ?? 24) * 60 * 60 * 1000).toISOString();
    const result = this.databaseService.connection
      .prepare(
        `
          INSERT INTO share_links
            (note_id, user_id, token_hash, public_url, expires_at, include_secrets, max_access_count, created_at)
          VALUES
            (@noteId, @userId, @tokenHash, @publicUrl, @expiresAt, @includeSecrets, @maxAccessCount, @createdAt)
        `,
      )
      .run({
        noteId,
        userId,
        tokenHash: this.hashToken(token),
        publicUrl,
        expiresAt,
        includeSecrets: dto.includeSecrets ? 1 : 0,
        maxAccessCount: dto.oneTime ? 1 : null,
        createdAt: now.toISOString(),
      });
    return {
      ...this.getShareLink(userId, Number(result.lastInsertRowid)),
      url: publicUrl,
    };
  }

  revokeShareLink(userId: number, id: number): { id: number } {
    const result = this.databaseService.connection
      .prepare(
        `
          DELETE FROM share_links
          WHERE id = @id AND user_id = @userId
        `,
      )
      .run({ id, userId });
    if (result.changes === 0) {
      throw new NotFoundException(`Share link ${id} was not found`);
    }
    return { id };
  }

  getPublicShare(token: string, userAgent?: string, ipAddress?: string): PublicShareResponse {
    const tokenHash = this.hashToken(token);
    const row = this.databaseService.connection
      .prepare('SELECT * FROM share_links WHERE token_hash = @tokenHash')
      .get({ tokenHash }) as ShareLinkRecord | undefined;
    const accessLimitReached = row
      ? row.max_access_count !== null && row.access_count >= row.max_access_count
      : false;

    if (!row || row.revoked_at || Date.parse(row.expires_at) < Date.now() || accessLimitReached) {
      throw new NotFoundException('Share link was not found');
    }

    const accessedAt = new Date().toISOString();
    const nextAccessCount = row.access_count + 1;
    this.databaseService.connection
      .prepare(
        `
          UPDATE share_links
          SET last_accessed_at = @accessedAt,
              access_count = @accessCount,
              revoked_at = CASE
                WHEN max_access_count IS NOT NULL AND @accessCount >= max_access_count THEN @accessedAt
                ELSE revoked_at
              END
          WHERE id = @id
        `,
      )
      .run({ id: row.id, accessedAt, accessCount: nextAccessCount });
    this.databaseService.connection
      .prepare(
        `
          INSERT INTO share_link_access_logs (share_link_id, user_agent, ip_address, accessed_at)
          VALUES (@shareLinkId, @userAgent, @ipAddress, @accessedAt)
        `,
      )
      .run({ shareLinkId: row.id, userAgent, ipAddress, accessedAt });

    const note = this.notesService.getById(row.user_id, row.note_id);
    return {
      note: {
        id: note.id,
        name: note.name,
        contentHtml: row.include_secrets
          ? note.contentHtml
          : this.hideSecretValues(note.contentHtml),
        contentText: note.contentText,
        updatedAt: note.updatedAt,
      },
      expiresAt: row.expires_at,
    };
  }

  private getTemplate(userId: number, id: number): NoteTemplateResponse {
    return this.mapTemplate(this.getTemplateRecord(userId, id));
  }

  private getTemplateRecord(
    userId: number,
    id: number,
    options: { writable?: boolean } = {},
  ): TemplateRecord {
    const predicate = options.writable
      ? 'user_id = @userId'
      : '(user_id = @userId OR is_system = 1)';
    const row = this.databaseService.connection
      .prepare(`SELECT * FROM note_templates WHERE id = @id AND ${predicate}`)
      .get({ id, userId }) as TemplateRecord | undefined;
    if (!row) {
      throw new NotFoundException(`Template ${id} was not found`);
    }
    return row;
  }

  private requireNote(userId: number, id: number): NoteRecord {
    const note = this.databaseService.connection
      .prepare('SELECT * FROM notes WHERE id = @id AND user_id = @userId AND deleted_at IS NULL')
      .get({ id, userId }) as NoteRecord | undefined;
    if (!note) {
      throw new NotFoundException(`Note ${id} was not found`);
    }
    return note;
  }

  private getAttachment(userId: number, id: number): AttachmentResponse {
    return this.mapAttachment(this.getAttachmentRecord(userId, id));
  }

  private listExportTemplates(userId: number): NoteTemplateResponse[] {
    const rows = this.databaseService.connection
      .prepare(
        `
          SELECT *
          FROM note_templates
          WHERE user_id = @userId AND is_system = 0
          ORDER BY lower(name), id
        `,
      )
      .all({ userId }) as TemplateRecord[];

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

  private getExportTagsByNote(noteIds: number[]): Map<number, string[]> {
    const tagsByNote = new Map<number, string[]>();
    if (noteIds.length === 0) {
      return tagsByNote;
    }

    const noteIdList = bindSqlList('noteId', noteIds);
    const rows = this.databaseService.connection
      .prepare(
        `
          SELECT note_tags.note_id as noteId, lower(tags.name) as name
          FROM note_tags
          JOIN tags ON tags.id = note_tags.tag_id
          WHERE note_tags.note_id IN (${noteIdList.placeholders})
          ORDER BY note_tags.note_id, lower(tags.name)
        `,
      )
      .all(noteIdList.params) as Array<{ noteId: number; name: string }>;

    for (const row of rows) {
      const tags = tagsByNote.get(row.noteId) ?? [];
      tags.push(row.name);
      tagsByNote.set(row.noteId, tags);
    }

    return tagsByNote;
  }

  private normalizeImportNotes(notes: Array<Record<string, unknown>>): ImportableNote[] {
    if (!Array.isArray(notes)) {
      throw new BadRequestException('JSON file must contain notes array');
    }

    if (notes.length > 1000) {
      throw new BadRequestException('JSON file contains too many notes');
    }

    return notes.map((rawNote) => this.normalizeImportNote(rawNote));
  }

  private normalizeImportNote(rawNote: Record<string, unknown>): ImportableNote {
    if (!rawNote || typeof rawNote !== 'object') {
      throw new BadRequestException('Invalid note in JSON file');
    }

    const tags = Array.isArray(rawNote.tags)
      ? [
          ...new Set(
            rawNote.tags
              .filter((tag): tag is string => typeof tag === 'string')
              .map((tag) => tag.trim().toLowerCase())
              .filter(Boolean),
          ),
        ].slice(0, 20)
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

  private getAttachmentRecord(userId: number, id: number): AttachmentRecord {
    const row = this.databaseService.connection
      .prepare(
        `
          SELECT attachments.*, notes.name as note_name
          FROM attachments
          LEFT JOIN notes ON notes.id = attachments.note_id AND notes.deleted_at IS NULL
          WHERE attachments.id = @id AND attachments.user_id = @userId
        `,
      )
      .get({ id, userId }) as AttachmentRecord | undefined;
    if (!row) {
      throw new NotFoundException(`Attachment ${id} was not found`);
    }
    return row;
  }

  private listAttachmentRecords(userId: number, attachmentIds: number[]): AttachmentRecord[] {
    if (attachmentIds.length === 0) {
      return this.databaseService.connection
        .prepare('SELECT * FROM attachments WHERE user_id = @userId ORDER BY created_at DESC')
        .all({ userId }) as AttachmentRecord[];
    }

    const ids = bindSqlList('id', attachmentIds);
    return this.databaseService.connection
      .prepare(
        `
          SELECT *
          FROM attachments
          WHERE user_id = @userId AND id IN (${ids.placeholders})
          ORDER BY created_at DESC
        `,
      )
      .all({ userId, ...ids.params }) as AttachmentRecord[];
  }

  private getShareLink(userId: number, id: number): ShareLinkResponse {
    const row = this.databaseService.connection
      .prepare('SELECT * FROM share_links WHERE id = @id AND user_id = @userId')
      .get({ id, userId }) as ShareLinkRecord | undefined;
    if (!row) {
      throw new NotFoundException(`Share link ${id} was not found`);
    }
    return this.mapShareLink(row);
  }

  private mapTemplate(row: TemplateRecord): NoteTemplateResponse {
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

  private mapAttachment(row: AttachmentRecord): AttachmentResponse {
    return {
      id: row.id,
      noteId: row.note_id,
      noteName: row.note_name ?? null,
      fileName: row.file_name,
      mimeType: row.mime_type,
      size: row.size,
      createdAt: row.created_at,
    };
  }

  private sanitizeAttachmentName(fileName: string): string {
    const safeName = basename(fileName)
      .replace(/[^\p{L}\p{N}._ -]/gu, '_')
      .trim();
    if (!safeName || safeName === '.' || safeName === '..') {
      throw new BadRequestException('File name is invalid');
    }
    return safeName;
  }

  private makeUniqueZipName(fileName: string, usedNames: Set<string>): string {
    const safeName = this.sanitizeAttachmentName(fileName);
    const extension = extname(safeName);
    const baseName = extension ? safeName.slice(0, -extension.length) : safeName;
    let candidate = safeName;
    let index = 2;
    while (usedNames.has(candidate.toLowerCase())) {
      candidate = `${baseName} (${index})${extension}`;
      index += 1;
    }
    usedNames.add(candidate.toLowerCase());
    return candidate;
  }

  private createZip(entries: ZipEntry[]): Buffer {
    const localParts: Buffer[] = [];
    const centralParts: Buffer[] = [];
    let offset = 0;
    const { date, time } = this.getDosDateTime(new Date());

    for (const entry of entries) {
      const fileName = Buffer.from(entry.fileName, 'utf8');
      const checksum = this.crc32(entry.content);
      const localHeader = Buffer.alloc(30);
      localHeader.writeUInt32LE(0x04034b50, 0);
      localHeader.writeUInt16LE(20, 4);
      localHeader.writeUInt16LE(0x0800, 6);
      localHeader.writeUInt16LE(0, 8);
      localHeader.writeUInt16LE(time, 10);
      localHeader.writeUInt16LE(date, 12);
      localHeader.writeUInt32LE(checksum, 14);
      localHeader.writeUInt32LE(entry.content.byteLength, 18);
      localHeader.writeUInt32LE(entry.content.byteLength, 22);
      localHeader.writeUInt16LE(fileName.byteLength, 26);
      localHeader.writeUInt16LE(0, 28);

      const centralHeader = Buffer.alloc(46);
      centralHeader.writeUInt32LE(0x02014b50, 0);
      centralHeader.writeUInt16LE(20, 4);
      centralHeader.writeUInt16LE(20, 6);
      centralHeader.writeUInt16LE(0x0800, 8);
      centralHeader.writeUInt16LE(0, 10);
      centralHeader.writeUInt16LE(time, 12);
      centralHeader.writeUInt16LE(date, 14);
      centralHeader.writeUInt32LE(checksum, 16);
      centralHeader.writeUInt32LE(entry.content.byteLength, 20);
      centralHeader.writeUInt32LE(entry.content.byteLength, 24);
      centralHeader.writeUInt16LE(fileName.byteLength, 28);
      centralHeader.writeUInt16LE(0, 30);
      centralHeader.writeUInt16LE(0, 32);
      centralHeader.writeUInt16LE(0, 34);
      centralHeader.writeUInt16LE(0, 36);
      centralHeader.writeUInt32LE(0, 38);
      centralHeader.writeUInt32LE(offset, 42);

      localParts.push(localHeader, fileName, entry.content);
      centralParts.push(centralHeader, fileName);
      offset += localHeader.byteLength + fileName.byteLength + entry.content.byteLength;
    }

    const centralOffset = offset;
    const centralSize = centralParts.reduce((size, part) => size + part.byteLength, 0);
    const endHeader = Buffer.alloc(22);
    endHeader.writeUInt32LE(0x06054b50, 0);
    endHeader.writeUInt16LE(0, 4);
    endHeader.writeUInt16LE(0, 6);
    endHeader.writeUInt16LE(entries.length, 8);
    endHeader.writeUInt16LE(entries.length, 10);
    endHeader.writeUInt32LE(centralSize, 12);
    endHeader.writeUInt32LE(centralOffset, 16);
    endHeader.writeUInt16LE(0, 20);

    return Buffer.concat([...localParts, ...centralParts, endHeader]);
  }

  private crc32(content: Buffer): number {
    let checksum = 0xffffffff;
    for (const byte of content) {
      checksum = CRC32_TABLE[(checksum ^ byte) & 0xff] ^ (checksum >>> 8);
    }
    return (checksum ^ 0xffffffff) >>> 0;
  }

  private getDosDateTime(value: Date): { date: number; time: number } {
    const year = Math.max(value.getFullYear(), 1980);
    return {
      date: ((year - 1980) << 9) | ((value.getMonth() + 1) << 5) | value.getDate(),
      time:
        (value.getHours() << 11) | (value.getMinutes() << 5) | Math.floor(value.getSeconds() / 2),
    };
  }

  private mapShareLink(row: ShareLinkRecord): ShareLinkResponse {
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

  private hideSecretValues(contentHtml: string): string {
    return contentHtml.replace(/<div\b(?=[^>]*data-copy-field)[^>]*>/g, (tag) => {
      const isSecret = /\sdata-kind=(["'])(password|credential|token)\1/i.test(tag);

      return isSecret ? tag.replace(/\sdata-value=(["'])[^"']*\1/i, ' data-value=""') : tag;
    });
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
