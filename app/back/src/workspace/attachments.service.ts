import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { In, Repository, SelectQueryBuilder } from 'typeorm';

import { nowIso } from '../database/db.util';
import { AttachmentEntity } from '../database/entities/attachment.entity';
import { NoteEntity } from '../database/entities/note.entity';
import { AttachmentFilesService } from '../infra/attachment-files.service';
import { EntitlementsService } from '../subscriptions/entitlements.service';
import { AttachmentFoldersService } from './attachment-folders.service';
import type {
  AttachAttachmentDto,
  DuplicateAttachmentDto,
  MoveAttachmentFolderDto,
  RenameAttachmentDto,
  UploadAttachmentDto,
} from './dto/workspace.dto';
import type { AttachmentFolderResponse, AttachmentResponse } from './workspace.types';
import {
  createZip,
  makeUniqueZipName,
  makeUniqueZipPath,
  sanitizeAttachmentName,
  sanitizeFolderName,
  sanitizeZipFolderSegment,
  type ZipEntry,
} from './workspace.util';

interface AttachmentRow {
  id: number;
  note_id: number | null;
  note_name: string | null;
  folder_id: number | null;
  user_id: number;
  file_name: string;
  mime_type: string;
  size: number;
  storage_path: string;
  created_at: string;
}

@Injectable()
export class AttachmentsService {
  private readonly uploadDir: string;
  private readonly maxUploadBytes: number;
  private readonly allowedExtensions: Set<string>;

  constructor(
    @InjectRepository(AttachmentEntity)
    private readonly attachmentsRepo: Repository<AttachmentEntity>,
    @InjectRepository(NoteEntity) private readonly notesRepo: Repository<NoteEntity>,
    @Inject(AttachmentFilesService)
    private readonly attachmentFilesService: AttachmentFilesService,
    @Inject(AttachmentFoldersService)
    private readonly foldersService: AttachmentFoldersService,
    @Inject(EntitlementsService) private readonly entitlementsService: EntitlementsService,
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

  async uploadAttachment(userId: number, dto: UploadAttachmentDto): Promise<AttachmentResponse> {
    const noteId = dto.noteId ?? null;
    const folderId =
      noteId !== null
        ? await this.resolveUploadFolderForNote(
            userId,
            await this.requireNote(userId, noteId),
            dto.folderId ?? null,
          )
        : (dto.folderId ?? null);
    if (folderId !== null) {
      await this.foldersService.requireAttachmentFolder(userId, folderId);
    }

    const content = Buffer.from(dto.contentBase64, 'base64');
    if (content.byteLength > this.maxUploadBytes) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'File is too large',
        code: 'FILE_TOO_LARGE',
      });
    }
    await this.entitlementsService.assertStorageCapacity(userId, content.byteLength);

    const fileName = sanitizeAttachmentName(dto.fileName);
    const extension = extname(fileName).toLowerCase();
    if (extension && !this.allowedExtensions.has(extension)) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'File type is not allowed',
        code: 'FILE_TYPE_NOT_ALLOWED',
      });
    }

    const storagePath = this.writeUpload(userId, extension, content);
    const created = await this.attachmentsRepo.save(
      this.attachmentsRepo.create({
        note_id: noteId,
        folder_id: folderId,
        user_id: userId,
        file_name: fileName,
        mime_type: dto.mimeType ?? 'application/octet-stream',
        size: content.byteLength,
        storage_path: storagePath,
        created_at: nowIso(),
      }),
    );
    return this.getAttachment(userId, created.id);
  }

  async renameAttachment(
    userId: number,
    id: number,
    dto: RenameAttachmentDto,
  ): Promise<AttachmentResponse> {
    await this.getAttachmentRow(userId, id);
    await this.attachmentsRepo.update(
      { id, user_id: userId },
      { file_name: sanitizeAttachmentName(dto.fileName) },
    );
    return this.getAttachment(userId, id);
  }

  async attachAttachmentToNote(
    userId: number,
    id: number,
    dto: AttachAttachmentDto,
  ): Promise<AttachmentResponse> {
    await this.getAttachmentRow(userId, id);
    const noteId = dto.noteId ?? null;
    if (noteId !== null) {
      await this.requireNote(userId, noteId);
    }
    await this.attachmentsRepo.update({ id, user_id: userId }, { note_id: noteId });
    return this.getAttachment(userId, id);
  }

  async moveAttachmentToFolder(
    userId: number,
    id: number,
    dto: MoveAttachmentFolderDto,
  ): Promise<AttachmentResponse> {
    await this.getAttachmentRow(userId, id);
    const folderId = dto.folderId ?? null;
    if (folderId !== null) {
      await this.foldersService.requireAttachmentFolder(userId, folderId);
    }
    await this.attachmentsRepo.update({ id, user_id: userId }, { folder_id: folderId });
    return this.getAttachment(userId, id);
  }

  async duplicateAttachment(
    userId: number,
    id: number,
    dto: DuplicateAttachmentDto = {},
  ): Promise<AttachmentResponse> {
    const source = await this.getAttachmentRow(userId, id);
    if (!existsSync(source.storage_path)) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Attachment file was not found',
        code: 'ATTACHMENT_FILE_MISSING',
      });
    }

    const folderId = dto.folderId ?? source.folder_id ?? null;
    if (folderId !== null) {
      await this.foldersService.requireAttachmentFolder(userId, folderId);
    }

    const content = readFileSync(source.storage_path);
    await this.entitlementsService.assertStorageCapacity(userId, content.byteLength);
    const extension = extname(source.file_name).toLowerCase();
    const storagePath = this.writeUpload(userId, extension, content);

    const created = await this.attachmentsRepo.save(
      this.attachmentsRepo.create({
        note_id: source.note_id,
        folder_id: folderId,
        user_id: userId,
        file_name: await this.makeUniqueAttachmentName(userId, source.file_name, folderId),
        mime_type: source.mime_type,
        size: content.byteLength,
        storage_path: storagePath,
        created_at: nowIso(),
      }),
    );
    return this.getAttachment(userId, created.id);
  }

  async listAccountAttachments(
    userId: number,
    folderId?: number | null,
  ): Promise<AttachmentResponse[]> {
    const qb = this.selectAttachmentRow().where('a.user_id = :userId', { userId });
    if (folderId !== undefined) {
      if (folderId === null) {
        qb.andWhere('a.folder_id IS NULL');
      } else {
        qb.andWhere('a.folder_id = :folderId', { folderId });
      }
    }
    qb.orderBy('a.created_at', 'DESC');
    const rows = await qb.getRawMany<AttachmentRow>();
    return rows.map((row) => this.mapAttachment(row));
  }

  async listAttachments(userId: number, noteId: number): Promise<AttachmentResponse[]> {
    await this.requireNote(userId, noteId);
    const rows = await this.selectAttachmentRow()
      .where('a.note_id = :noteId', { noteId })
      .andWhere('a.user_id = :userId', { userId })
      .orderBy('a.created_at', 'DESC')
      .getRawMany<AttachmentRow>();
    return rows.map((row) => this.mapAttachment(row));
  }

  async downloadAttachment(
    userId: number,
    id: number,
  ): Promise<{ record: AttachmentResponse; content: Buffer }> {
    const row = await this.getAttachmentRow(userId, id);
    if (!existsSync(row.storage_path)) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Attachment file was not found',
        code: 'ATTACHMENT_FILE_MISSING',
      });
    }
    return { record: this.mapAttachment(row), content: readFileSync(row.storage_path) };
  }

  async downloadAttachmentsArchive(
    userId: number,
    noteId: number,
    attachmentIds: number[] = [],
  ): Promise<{ fileName: string; content: Buffer }> {
    await this.requireNote(userId, noteId);
    const selectedIds = new Set(attachmentIds);
    const rows = (
      await this.selectAttachmentRow()
        .where('a.note_id = :noteId', { noteId })
        .andWhere('a.user_id = :userId', { userId })
        .orderBy('a.created_at', 'DESC')
        .getRawMany<AttachmentRow>()
    ).filter((row) => selectedIds.size === 0 || selectedIds.has(row.id));

    const names = new Set<string>();
    const entries = rows
      .filter((row) => existsSync(row.storage_path))
      .map((row) => ({
        fileName: makeUniqueZipName(row.file_name, names),
        content: readFileSync(row.storage_path),
      }));

    return { fileName: `note-${noteId}-attachments.zip`, content: createZip(entries) };
  }

  async downloadAccountAttachmentsArchive(
    userId: number,
    attachmentIds: number[] = [],
    folderIds: number[] = [],
  ): Promise<{ fileName: string; content: Buffer }> {
    const folders = await this.foldersService.listAttachmentFolders(userId);
    const folderById = new Map(folders.map((folder) => [folder.id, folder]));
    const usedPaths = new Set<string>();
    const includedAttachmentIds = new Set<number>();
    const entries: ZipEntry[] = [];

    for (const folderId of folderIds) {
      const folder = await this.foldersService.getAttachmentFolder(userId, folderId);
      const subtreeFolderIds = await this.foldersService.collectDescendantFolderIds(
        userId,
        folderId,
      );
      if (subtreeFolderIds.length === 0) {
        continue;
      }
      const rows = await this.selectAttachmentRow()
        .where('a.user_id = :userId', { userId })
        .andWhere('a.folder_id IN (:...subtreeFolderIds)', { subtreeFolderIds })
        .orderBy('a.folder_id', 'ASC')
        .addOrderBy('a.created_at', 'DESC')
        .getRawMany<AttachmentRow>();

      for (const row of rows) {
        if (includedAttachmentIds.has(row.id) || !existsSync(row.storage_path)) {
          continue;
        }
        includedAttachmentIds.add(row.id);
        entries.push({
          fileName: makeUniqueZipPath(
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
      const row = await this.getAttachmentRow(userId, attachmentId);
      if (!existsSync(row.storage_path)) {
        continue;
      }
      includedAttachmentIds.add(row.id);
      entries.push({
        fileName: makeUniqueZipPath(sanitizeAttachmentName(row.file_name), usedPaths),
        content: readFileSync(row.storage_path),
      });
    }

    if (entries.length === 0) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'No files available for download',
        code: 'NO_FILES_FOR_DOWNLOAD',
      });
    }

    const archiveName =
      folderIds.length === 1 && attachmentIds.length === 0
        ? `${sanitizeZipFolderSegment(
            (await this.foldersService.requireAttachmentFolder(userId, folderIds[0])).name,
          )}.zip`
        : 'account-files.zip';

    return { fileName: archiveName, content: createZip(entries) };
  }

  async deleteAttachment(userId: number, id: number): Promise<{ id: number }> {
    await this.getAttachmentRow(userId, id);
    await this.attachmentFilesService.deleteByIds(userId, [id]);
    await this.attachmentsRepo.delete({ id, user_id: userId });
    return { id };
  }

  async deleteAttachmentFolder(userId: number, id: number): Promise<{ id: number }> {
    await this.foldersService.requireAttachmentFolder(userId, id);
    const folderIds = await this.foldersService.collectDescendantFolderIds(userId, id);
    if (folderIds.length === 0) {
      return { id };
    }

    const attachmentRows = await this.attachmentsRepo.find({
      where: { user_id: userId, folder_id: In(folderIds) },
      select: { id: true },
    });
    const attachmentIds = attachmentRows.map((row) => row.id);
    if (attachmentIds.length > 0) {
      await this.attachmentFilesService.deleteByIds(userId, attachmentIds);
      await this.attachmentsRepo.delete({ user_id: userId, id: In(attachmentIds) });
    }

    // Removing the root folder cascades to descendants via the parent_id FK.
    await this.foldersService.deleteFolderRow(userId, id);
    return { id };
  }

  private writeUpload(userId: number, extension: string, content: Buffer): string {
    const storageName = `${userId}-${Date.now()}-${randomBytes(8).toString('hex')}${extension}`;
    const storagePath = join(this.uploadDir, storageName);
    writeFileSync(storagePath, content);
    return storagePath;
  }

  private async requireNote(userId: number, id: number): Promise<NoteEntity> {
    const note = await this.notesRepo
      .createQueryBuilder('n')
      .where('n.id = :id', { id })
      .andWhere('n.user_id = :userId', { userId })
      .andWhere('n.deleted_at IS NULL')
      .getOne();
    if (!note) {
      throw new NotFoundException(`Note ${id} was not found`);
    }
    return note;
  }

  private async resolveUploadFolderForNote(
    userId: number,
    note: NoteEntity,
    explicitFolderId: number | null,
  ): Promise<number | null> {
    if (explicitFolderId !== null) {
      return explicitFolderId;
    }
    if (note.attachment_folder_id !== null) {
      await this.foldersService.requireAttachmentFolder(userId, note.attachment_folder_id);
      return note.attachment_folder_id;
    }

    const folderName = sanitizeFolderName(note.name);
    const folderId = await this.foldersService.setNoteFolderName(userId, null, folderName);
    await this.setNoteAttachmentFolder(userId, note.id, folderId);
    return folderId;
  }

  private async setNoteAttachmentFolder(
    userId: number,
    noteId: number,
    folderId: number | null,
  ): Promise<void> {
    await this.notesRepo.update(
      { id: noteId, user_id: userId },
      { attachment_folder_id: folderId, updated_at: nowIso() },
    );
  }

  private async makeUniqueAttachmentName(
    userId: number,
    fileName: string,
    folderId: number | null,
  ): Promise<string> {
    const baseName = sanitizeAttachmentName(fileName);
    const extension = extname(baseName);
    const stem = baseName.slice(0, baseName.length - extension.length) || 'file';
    let candidate = baseName;
    let index = 1;
    while (await this.attachmentNameExists(userId, candidate, folderId)) {
      candidate = `${stem} (${index})${extension}`;
      index += 1;
    }
    return candidate;
  }

  private async attachmentNameExists(
    userId: number,
    fileName: string,
    folderId: number | null,
  ): Promise<boolean> {
    const qb = this.attachmentsRepo
      .createQueryBuilder('a')
      .where('a.user_id = :userId', { userId })
      .andWhere('a.file_name = :fileName', { fileName });
    if (folderId === null) {
      qb.andWhere('a.folder_id IS NULL');
    } else {
      qb.andWhere('a.folder_id = :folderId', { folderId });
    }
    return qb.getExists();
  }

  private buildFolderAttachmentZipPath(
    folderById: Map<number, AttachmentFolderResponse>,
    rootFolder: AttachmentFolderResponse,
    attachment: AttachmentRow,
  ): string {
    const fileName = sanitizeAttachmentName(attachment.file_name);
    const attachmentFolderId = attachment.folder_id;
    if (attachmentFolderId === null || attachmentFolderId === rootFolder.id) {
      return `${sanitizeZipFolderSegment(rootFolder.name)}/${fileName}`;
    }

    const innerSegments: string[] = [];
    let currentId: number | null = attachmentFolderId;
    while (currentId !== null && currentId !== rootFolder.id) {
      const folder = folderById.get(currentId);
      if (!folder) {
        break;
      }
      innerSegments.unshift(sanitizeZipFolderSegment(folder.name));
      currentId = folder.parentId;
    }

    const prefix = sanitizeZipFolderSegment(rootFolder.name);
    return innerSegments.length > 0
      ? `${prefix}/${innerSegments.join('/')}/${fileName}`
      : `${prefix}/${fileName}`;
  }

  private selectAttachmentRow(): SelectQueryBuilder<AttachmentEntity> {
    return this.attachmentsRepo
      .createQueryBuilder('a')
      .leftJoin(NoteEntity, 'n', 'n.id = a.note_id AND n.deleted_at IS NULL')
      .select('a.id', 'id')
      .addSelect('a.note_id', 'note_id')
      .addSelect('n.name', 'note_name')
      .addSelect('a.folder_id', 'folder_id')
      .addSelect('a.user_id', 'user_id')
      .addSelect('a.file_name', 'file_name')
      .addSelect('a.mime_type', 'mime_type')
      .addSelect('a.size', 'size')
      .addSelect('a.storage_path', 'storage_path')
      .addSelect('a.created_at', 'created_at');
  }

  private async getAttachmentRow(userId: number, id: number): Promise<AttachmentRow> {
    const row = await this.selectAttachmentRow()
      .where('a.id = :id', { id })
      .andWhere('a.user_id = :userId', { userId })
      .getRawOne<AttachmentRow>();
    if (!row) {
      throw new NotFoundException(`Attachment ${id} was not found`);
    }
    return row;
  }

  private async getAttachment(userId: number, id: number): Promise<AttachmentResponse> {
    return this.mapAttachment(await this.getAttachmentRow(userId, id));
  }

  private mapAttachment(row: AttachmentRow): AttachmentResponse {
    return {
      id: row.id,
      noteId: row.note_id,
      noteName: row.note_name ?? null,
      folderId: row.folder_id ?? null,
      fileName: row.file_name,
      mimeType: row.mime_type,
      size: Number(row.size),
      createdAt: row.created_at,
    };
  }
}
