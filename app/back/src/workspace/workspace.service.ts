import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
  AttachmentFolderDto,
  CreateNoteFromTemplateDto,
  CreateShareLinkDto,
  AttachAttachmentDto,
  DuplicateAttachmentDto,
  ImportNotesDto,
  MoveAttachmentFolderDto,
  MoveAttachmentFolderParentDto,
  RenameAttachmentDto,
  TemplateDto,
  UploadAttachmentDto,
} from './dto/workspace.dto';
import type {
  AttachmentFolderResponse,
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

interface AttachmentFolderRecord {
  id: number;
  user_id: number;
  parent_id: number | null;
  name: string;
  position: number;
  created_at: string;
}

interface AttachmentRecord {
  id: number;
  note_id: number | null;
  note_name?: string | null;
  folder_id?: number | null;
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
    const folderId =
      noteId !== null
        ? this.resolveUploadFolderForNote(
            userId,
            this.requireNote(userId, noteId),
            dto.folderId ?? null,
          )
        : (dto.folderId ?? null);
    if (folderId !== null) {
      this.requireAttachmentFolder(userId, folderId);
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
          INSERT INTO attachments (note_id, folder_id, user_id, file_name, mime_type, size, storage_path, created_at)
          VALUES (@noteId, @folderId, @userId, @fileName, @mimeType, @size, @storagePath, @createdAt)
        `,
      )
      .run({
        noteId,
        folderId,
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

  listAccountAttachments(userId: number, folderId?: number | null): AttachmentResponse[] {
    let sql = `
      SELECT attachments.*, notes.name as note_name
      FROM attachments
      LEFT JOIN notes ON notes.id = attachments.note_id AND notes.deleted_at IS NULL
      WHERE attachments.user_id = @userId
    `;
    const params: { userId: number; folderId?: number } = { userId };
    if (folderId !== undefined) {
      if (folderId === null) {
        sql += ' AND attachments.folder_id IS NULL';
      } else {
        sql += ' AND attachments.folder_id = @folderId';
        params.folderId = folderId;
      }
    }
    sql += ' ORDER BY attachments.created_at DESC';
    const rows = this.databaseService.connection.prepare(sql).all(params) as AttachmentRecord[];
    return rows.map((row) => this.mapAttachment(row));
  }

  listAttachmentFolders(userId: number): AttachmentFolderResponse[] {
    const rows = this.databaseService.connection
      .prepare(
        `
          SELECT *
          FROM attachment_folders
          WHERE user_id = @userId
          ORDER BY parent_id IS NOT NULL, position, lower(name)
        `,
      )
      .all({ userId }) as AttachmentFolderRecord[];
    return rows.map((row) => this.mapAttachmentFolder(row));
  }

  createAttachmentFolder(userId: number, dto: AttachmentFolderDto): AttachmentFolderResponse {
    const parentId = dto.parentId ?? null;
    if (parentId !== null) {
      this.requireAttachmentFolder(userId, parentId);
    }
    const name = this.sanitizeFolderName(dto.name);
    this.assertUniqueFolderName(userId, parentId, name);
    const position = this.nextFolderPosition(userId, parentId);
    const result = this.databaseService.connection
      .prepare(
        `
          INSERT INTO attachment_folders (user_id, parent_id, name, position, created_at)
          VALUES (@userId, @parentId, @name, @position, @createdAt)
        `,
      )
      .run({
        userId,
        parentId,
        name,
        position,
        createdAt: new Date().toISOString(),
      });
    return this.getAttachmentFolder(userId, Number(result.lastInsertRowid));
  }

  renameAttachmentFolder(
    userId: number,
    id: number,
    dto: AttachmentFolderDto,
  ): AttachmentFolderResponse {
    const folder = this.requireAttachmentFolder(userId, id);
    const name = this.sanitizeFolderName(dto.name);
    this.assertUniqueFolderName(userId, folder.parent_id ?? null, name, id);
    this.databaseService.connection
      .prepare(
        `
          UPDATE attachment_folders
          SET name = @name
          WHERE id = @id AND user_id = @userId
        `,
      )
      .run({ id, userId, name });
    return this.getAttachmentFolder(userId, id);
  }

  deleteAttachmentFolder(userId: number, id: number): { id: number } {
    this.requireAttachmentFolder(userId, id);
    const folderIds = this.collectDescendantFolderIds(userId, id);
    if (folderIds.length === 0) {
      return { id };
    }

    const folderList = bindSqlList('folderId', folderIds);
    const attachmentRows = this.databaseService.connection
      .prepare(
        `
          SELECT id
          FROM attachments
          WHERE user_id = @userId AND folder_id IN (${folderList.placeholders})
        `,
      )
      .all({ userId, ...folderList.params }) as Array<{ id: number }>;
    const attachmentIds = attachmentRows.map((row) => row.id);
    if (attachmentIds.length > 0) {
      this.attachmentFilesService.deleteByIds(userId, attachmentIds);
      const attachmentList = bindSqlList('attachmentId', attachmentIds);
      this.databaseService.connection
        .prepare(
          `DELETE FROM attachments WHERE user_id = @userId AND id IN (${attachmentList.placeholders})`,
        )
        .run({ userId, ...attachmentList.params });
    }

    for (const folderId of [...folderIds].reverse()) {
      this.databaseService.connection
        .prepare('DELETE FROM attachment_folders WHERE id = @folderId AND user_id = @userId')
        .run({ folderId, userId });
    }

    return { id };
  }

  moveAttachmentFolder(
    userId: number,
    id: number,
    dto: MoveAttachmentFolderParentDto,
  ): AttachmentFolderResponse {
    this.requireAttachmentFolder(userId, id);
    const parentId = dto.parentId ?? null;
    if (parentId === id) {
      throw new BadRequestException('A folder cannot be moved into itself');
    }
    const folder = this.requireAttachmentFolder(userId, id);
    if (parentId !== null) {
      this.requireAttachmentFolder(userId, parentId);
      if (this.isFolderDescendant(userId, id, parentId)) {
        throw new BadRequestException('A folder cannot be moved into its subfolder');
      }
    }
    this.assertUniqueFolderName(userId, parentId, folder.name, id);

    this.databaseService.connection
      .prepare(
        `
          UPDATE attachment_folders
          SET parent_id = @parentId
          WHERE id = @id AND user_id = @userId
        `,
      )
      .run({ id, userId, parentId });

    return this.getAttachmentFolder(userId, id);
  }

  duplicateAttachment(
    userId: number,
    id: number,
    dto: DuplicateAttachmentDto = {},
  ): AttachmentResponse {
    const source = this.getAttachmentRecord(userId, id);
    if (!existsSync(source.storage_path)) {
      throw new NotFoundException('Attachment file was not found');
    }

    const folderId = dto.folderId ?? source.folder_id ?? null;
    if (folderId !== null) {
      this.requireAttachmentFolder(userId, folderId);
    }

    const content = readFileSync(source.storage_path);
    const extension = extname(source.file_name).toLowerCase();
    const storageName = `${userId}-${Date.now()}-${randomBytes(8).toString('hex')}${extension}`;
    const storagePath = join(this.uploadDir, storageName);
    writeFileSync(storagePath, content);

    const result = this.databaseService.connection
      .prepare(
        `
          INSERT INTO attachments (note_id, folder_id, user_id, file_name, mime_type, size, storage_path, created_at)
          VALUES (@noteId, @folderId, @userId, @fileName, @mimeType, @size, @storagePath, @createdAt)
        `,
      )
      .run({
        noteId: source.note_id,
        folderId,
        userId,
        fileName: this.makeUniqueAttachmentName(userId, source.file_name, folderId),
        mimeType: source.mime_type,
        size: content.byteLength,
        storagePath,
        createdAt: new Date().toISOString(),
      });

    return this.getAttachment(userId, Number(result.lastInsertRowid));
  }

  moveAttachmentToFolder(
    userId: number,
    id: number,
    dto: MoveAttachmentFolderDto,
  ): AttachmentResponse {
    this.getAttachmentRecord(userId, id);
    const folderId = dto.folderId ?? null;
    if (folderId !== null) {
      this.requireAttachmentFolder(userId, folderId);
    }
    this.databaseService.connection
      .prepare(
        `
          UPDATE attachments
          SET folder_id = @folderId
          WHERE id = @id AND user_id = @userId
        `,
      )
      .run({ id, userId, folderId });
    return this.getAttachment(userId, id);
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
    folderIds: number[] = [],
  ): { fileName: string; content: Buffer } {
    const folders = this.listAttachmentFolders(userId);
    const folderById = new Map(folders.map((folder) => [folder.id, folder]));
    const usedPaths = new Set<string>();
    const includedAttachmentIds = new Set<number>();
    const entries: ZipEntry[] = [];

    for (const folderId of folderIds) {
      const folder = this.getAttachmentFolder(userId, folderId);
      const subtreeFolderIds = this.collectDescendantFolderIds(userId, folderId);
      if (subtreeFolderIds.length === 0) {
        continue;
      }
      const folderList = bindSqlList('folderId', subtreeFolderIds);
      const rows = this.databaseService.connection
        .prepare(
          `
            SELECT *
            FROM attachments
            WHERE user_id = @userId AND folder_id IN (${folderList.placeholders})
            ORDER BY folder_id, created_at DESC
          `,
        )
        .all({ userId, ...folderList.params }) as AttachmentRecord[];

      for (const row of rows) {
        if (includedAttachmentIds.has(row.id) || !existsSync(row.storage_path)) {
          continue;
        }
        includedAttachmentIds.add(row.id);
        entries.push({
          fileName: this.makeUniqueZipPath(
            this.buildFolderAttachmentZipPath(folderById, folder, row),
            usedPaths,
          ),
          content: readFileSync(row.storage_path),
        });
      }
    }

    for (const attachmentId of attachmentIds) {
      if (includedAttachmentIds.has(attachmentId)) {
        continue;
      }
      const row = this.getAttachmentRecord(userId, attachmentId);
      if (!existsSync(row.storage_path)) {
        continue;
      }
      includedAttachmentIds.add(row.id);
      entries.push({
        fileName: this.makeUniqueZipPath(this.sanitizeAttachmentName(row.file_name), usedPaths),
        content: readFileSync(row.storage_path),
      });
    }

    if (entries.length === 0) {
      throw new BadRequestException('No files available for download');
    }

    const archiveName =
      folderIds.length === 1 && attachmentIds.length === 0
        ? `${this.sanitizeZipFolderSegment(this.requireAttachmentFolder(userId, folderIds[0]).name)}.zip`
        : 'account-files.zip';

    return {
      fileName: archiveName,
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
      folderId: row.folder_id ?? null,
      fileName: row.file_name,
      mimeType: row.mime_type,
      size: row.size,
      createdAt: row.created_at,
    };
  }

  private mapAttachmentFolder(row: AttachmentFolderRecord): AttachmentFolderResponse {
    return {
      id: row.id,
      parentId: row.parent_id,
      name: row.name,
      position: row.position,
      createdAt: row.created_at,
    };
  }

  private getAttachmentFolder(userId: number, id: number): AttachmentFolderResponse {
    return this.mapAttachmentFolder(this.requireAttachmentFolder(userId, id));
  }

  private requireAttachmentFolder(userId: number, id: number): AttachmentFolderRecord {
    const row = this.databaseService.connection
      .prepare('SELECT * FROM attachment_folders WHERE id = @id AND user_id = @userId')
      .get({ id, userId }) as AttachmentFolderRecord | undefined;
    if (!row) {
      throw new NotFoundException(`Folder ${id} was not found`);
    }
    return row;
  }

  private nextFolderPosition(userId: number, parentId: number | null): number {
    const row = (
      parentId === null
        ? this.databaseService.connection.prepare(
            `
              SELECT COALESCE(MAX(position), -1) as maxPosition
              FROM attachment_folders
              WHERE user_id = @userId AND parent_id IS NULL
            `,
          )
        : this.databaseService.connection.prepare(
            `
              SELECT COALESCE(MAX(position), -1) as maxPosition
              FROM attachment_folders
              WHERE user_id = @userId AND parent_id = @parentId
            `,
          )
    ).get(parentId === null ? { userId } : { userId, parentId }) as { maxPosition: number };
    return Number(row.maxPosition) + 1;
  }

  private collectDescendantFolderIds(userId: number, rootId: number): number[] {
    const collected: number[] = [rootId];
    const queue = [rootId];
    while (queue.length > 0) {
      const currentId = queue.shift();
      if (currentId === undefined) {
        continue;
      }
      const children = this.databaseService.connection
        .prepare(
          'SELECT id FROM attachment_folders WHERE parent_id = @parentId AND user_id = @userId',
        )
        .all({ parentId: currentId, userId }) as Array<{ id: number }>;
      for (const child of children) {
        collected.push(child.id);
        queue.push(child.id);
      }
    }
    return collected;
  }

  private isFolderDescendant(userId: number, ancestorId: number, candidateId: number): boolean {
    let currentId: number | null = candidateId;
    while (currentId !== null) {
      if (currentId === ancestorId) {
        return true;
      }
      const row = this.databaseService.connection
        .prepare('SELECT parent_id FROM attachment_folders WHERE id = @id AND user_id = @userId')
        .get({ id: currentId, userId }) as { parent_id: number | null } | undefined;
      currentId = row?.parent_id ?? null;
    }
    return false;
  }

  private makeUniqueAttachmentName(
    userId: number,
    fileName: string,
    folderId: number | null,
  ): string {
    const baseName = this.sanitizeAttachmentName(fileName);
    const extension = extname(baseName);
    const stem = baseName.slice(0, baseName.length - extension.length) || 'file';
    let candidate = baseName;
    let index = 1;
    while (this.attachmentNameExists(userId, candidate, folderId)) {
      candidate = `${stem} (${index})${extension}`;
      index += 1;
    }
    return candidate;
  }

  private attachmentNameExists(
    userId: number,
    fileName: string,
    folderId: number | null,
  ): boolean {
    const row = this.databaseService.connection
      .prepare(
        folderId === null
          ? `
              SELECT id
              FROM attachments
              WHERE user_id = @userId AND folder_id IS NULL AND file_name = @fileName
              LIMIT 1
            `
          : `
              SELECT id
              FROM attachments
              WHERE user_id = @userId AND folder_id = @folderId AND file_name = @fileName
              LIMIT 1
            `,
      )
      .get(folderId === null ? { userId, fileName } : { userId, fileName, folderId }) as
      | { id: number }
      | undefined;
    return Boolean(row);
  }

  private resolveUploadFolderForNote(
    userId: number,
    note: NoteRecord,
    explicitFolderId: number | null,
  ): number | null {
    if (explicitFolderId !== null) {
      return explicitFolderId;
    }

    if (note.attachment_folder_id !== null) {
      this.requireAttachmentFolder(userId, note.attachment_folder_id);
      return note.attachment_folder_id;
    }

    const folderName = this.sanitizeFolderName(note.name);
    const existing = this.findFolderByParentAndName(userId, null, folderName);
    const folderId = existing?.id ?? this.createAttachmentFolder(userId, { name: folderName }).id;
    this.setNoteAttachmentFolder(userId, note.id, folderId);
    return folderId;
  }

  private setNoteAttachmentFolder(userId: number, noteId: number, folderId: number | null): void {
    this.databaseService.connection
      .prepare(
        `
          UPDATE notes
          SET attachment_folder_id = @folderId, updated_at = @updatedAt
          WHERE id = @noteId AND user_id = @userId
        `,
      )
      .run({
        noteId,
        userId,
        folderId,
        updatedAt: new Date().toISOString(),
      });
  }

  private findFolderByParentAndName(
    userId: number,
    parentId: number | null,
    name: string,
    excludeId?: number,
  ): AttachmentFolderRecord | undefined {
    const parentClause = parentId === null ? 'parent_id IS NULL' : 'parent_id = @parentId';
    const excludeClause = excludeId !== undefined ? 'AND id != @excludeId' : '';
    return this.databaseService.connection
      .prepare(
        `
          SELECT *
          FROM attachment_folders
          WHERE user_id = @userId
            AND ${parentClause}
            AND lower(name) = lower(@name)
            ${excludeClause}
          LIMIT 1
        `,
      )
      .get({ userId, parentId, name, excludeId }) as AttachmentFolderRecord | undefined;
  }

  private assertUniqueFolderName(
    userId: number,
    parentId: number | null,
    name: string,
    excludeId?: number,
  ): void {
    if (this.findFolderByParentAndName(userId, parentId, name, excludeId)) {
      throw new ConflictException('A folder with this name already exists in this location');
    }
  }

  private sanitizeFolderName(name: string): string {
    const safeName = name.trim().replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
    if (!safeName) {
      throw new BadRequestException('Folder name is invalid');
    }
    return safeName;
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
    return this.makeUniqueZipPath(this.sanitizeAttachmentName(fileName), usedNames);
  }

  private makeUniqueZipPath(path: string, usedPaths: Set<string>): string {
    const safePath = path
      .replace(/\\/g, '/')
      .split('/')
      .map((segment) => this.sanitizeZipFolderSegment(segment))
      .filter(Boolean)
      .join('/');
    if (!safePath) {
      throw new BadRequestException('Archive path is invalid');
    }

    let candidate = safePath;
    let index = 2;
    while (usedPaths.has(candidate.toLowerCase())) {
      const segments = candidate.split('/');
      const fileName = segments.pop() ?? 'file';
      const directory = segments.join('/');
      const extension = extname(fileName);
      const baseName = extension ? fileName.slice(0, -extension.length) : fileName;
      const nextFileName = `${baseName} (${index})${extension}`;
      candidate = directory ? `${directory}/${nextFileName}` : nextFileName;
      index += 1;
    }
    usedPaths.add(candidate.toLowerCase());
    return candidate;
  }

  private sanitizeZipFolderSegment(segment: string): string {
    const safeSegment = segment.trim().replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ');
    if (!safeSegment || safeSegment === '.' || safeSegment === '..') {
      return 'folder';
    }
    return safeSegment;
  }

  private buildFolderAttachmentZipPath(
    folderById: Map<number, AttachmentFolderResponse>,
    rootFolder: AttachmentFolderResponse,
    attachment: AttachmentRecord,
  ): string {
    const fileName = this.sanitizeAttachmentName(attachment.file_name);
    const attachmentFolderId = attachment.folder_id;
    if (attachmentFolderId === null || attachmentFolderId === rootFolder.id) {
      return `${this.sanitizeZipFolderSegment(rootFolder.name)}/${fileName}`;
    }

    const innerSegments: string[] = [];
    let currentId: number | null = attachmentFolderId ?? null;
    while (currentId !== null && currentId !== rootFolder.id) {
      const folder = folderById.get(currentId);
      if (!folder) {
        break;
      }
      innerSegments.unshift(this.sanitizeZipFolderSegment(folder.name));
      currentId = folder.parentId;
    }

    const prefix = this.sanitizeZipFolderSegment(rootFolder.name);
    return innerSegments.length > 0
      ? `${prefix}/${innerSegments.join('/')}/${fileName}`
      : `${prefix}/${fileName}`;
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
