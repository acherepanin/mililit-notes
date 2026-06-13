import { Inject, Injectable } from '@nestjs/common';

import type { NoteResponse } from '../notes/notes.types';
import { AttachmentFoldersService } from './attachment-folders.service';
import { AttachmentsService } from './attachments.service';
import type {
  AttachmentFolderDto,
  AttachAttachmentDto,
  CreateNoteFromTemplateDto,
  CreateShareLinkDto,
  DuplicateAttachmentDto,
  ImportNotesDto,
  MoveAttachmentFolderDto,
  MoveAttachmentFolderParentDto,
  RenameAttachmentDto,
  TemplateDto,
  UploadAttachmentDto,
} from './dto/workspace.dto';
import { ImportExportService } from './import-export.service';
import { ShareLinksService } from './share-links.service';
import { TemplatesService } from './templates.service';
import type {
  AttachmentFolderResponse,
  AttachmentResponse,
  ExportResponse,
  NoteTemplateResponse,
  PublicShareResponse,
  ShareLinkResponse,
} from './workspace.types';

/**
 * Thin facade over the focused workspace services. It keeps the public API
 * surface (and controllers) stable while delegating to templates, attachments,
 * folders, share links and import/export concerns.
 */
@Injectable()
export class WorkspaceService {
  constructor(
    @Inject(TemplatesService) private readonly templatesService: TemplatesService,
    @Inject(AttachmentsService) private readonly attachmentsService: AttachmentsService,
    @Inject(AttachmentFoldersService) private readonly foldersService: AttachmentFoldersService,
    @Inject(ShareLinksService) private readonly shareLinksService: ShareLinksService,
    @Inject(ImportExportService) private readonly importExportService: ImportExportService,
  ) {}

  // Templates
  listTemplates(userId: number): Promise<NoteTemplateResponse[]> {
    return this.templatesService.listTemplates(userId);
  }

  createTemplate(userId: number, dto: TemplateDto): Promise<NoteTemplateResponse> {
    return this.templatesService.createTemplate(userId, dto);
  }

  updateTemplate(userId: number, id: number, dto: TemplateDto): Promise<NoteTemplateResponse> {
    return this.templatesService.updateTemplate(userId, id, dto);
  }

  deleteTemplate(userId: number, id: number): Promise<{ id: number }> {
    return this.templatesService.deleteTemplate(userId, id);
  }

  createNoteFromTemplate(userId: number, dto: CreateNoteFromTemplateDto): Promise<NoteResponse> {
    return this.templatesService.createNoteFromTemplate(userId, dto);
  }

  // Import / export
  exportJson(userId: number): Promise<ExportResponse> {
    return this.importExportService.exportJson(userId);
  }

  importJson(userId: number, dto: ImportNotesDto): Promise<{ imported: number }> {
    return this.importExportService.importJson(userId, dto);
  }

  // Attachment folders
  listAttachmentFolders(userId: number): Promise<AttachmentFolderResponse[]> {
    return this.foldersService.listAttachmentFolders(userId);
  }

  createAttachmentFolder(userId: number, dto: AttachmentFolderDto): Promise<AttachmentFolderResponse> {
    return this.foldersService.createAttachmentFolder(userId, dto);
  }

  renameAttachmentFolder(
    userId: number,
    id: number,
    dto: AttachmentFolderDto,
  ): Promise<AttachmentFolderResponse> {
    return this.foldersService.renameAttachmentFolder(userId, id, dto);
  }

  moveAttachmentFolder(
    userId: number,
    id: number,
    dto: MoveAttachmentFolderParentDto,
  ): Promise<AttachmentFolderResponse> {
    return this.foldersService.moveAttachmentFolder(userId, id, dto);
  }

  deleteAttachmentFolder(userId: number, id: number): Promise<{ id: number }> {
    return this.attachmentsService.deleteAttachmentFolder(userId, id);
  }

  // Attachments
  uploadAttachment(userId: number, dto: UploadAttachmentDto): Promise<AttachmentResponse> {
    return this.attachmentsService.uploadAttachment(userId, dto);
  }

  renameAttachment(userId: number, id: number, dto: RenameAttachmentDto): Promise<AttachmentResponse> {
    return this.attachmentsService.renameAttachment(userId, id, dto);
  }

  attachAttachmentToNote(
    userId: number,
    id: number,
    dto: AttachAttachmentDto,
  ): Promise<AttachmentResponse> {
    return this.attachmentsService.attachAttachmentToNote(userId, id, dto);
  }

  moveAttachmentToFolder(
    userId: number,
    id: number,
    dto: MoveAttachmentFolderDto,
  ): Promise<AttachmentResponse> {
    return this.attachmentsService.moveAttachmentToFolder(userId, id, dto);
  }

  duplicateAttachment(
    userId: number,
    id: number,
    dto: DuplicateAttachmentDto = {},
  ): Promise<AttachmentResponse> {
    return this.attachmentsService.duplicateAttachment(userId, id, dto);
  }

  listAccountAttachments(userId: number, folderId?: number | null): Promise<AttachmentResponse[]> {
    return this.attachmentsService.listAccountAttachments(userId, folderId);
  }

  listAttachments(userId: number, noteId: number): Promise<AttachmentResponse[]> {
    return this.attachmentsService.listAttachments(userId, noteId);
  }

  downloadAttachment(
    userId: number,
    id: number,
  ): Promise<{ record: AttachmentResponse; content: Buffer }> {
    return this.attachmentsService.downloadAttachment(userId, id);
  }

  downloadAttachmentsArchive(
    userId: number,
    noteId: number,
    attachmentIds: number[] = [],
  ): Promise<{ fileName: string; content: Buffer }> {
    return this.attachmentsService.downloadAttachmentsArchive(userId, noteId, attachmentIds);
  }

  downloadAccountAttachmentsArchive(
    userId: number,
    attachmentIds: number[] = [],
    folderIds: number[] = [],
  ): Promise<{ fileName: string; content: Buffer }> {
    return this.attachmentsService.downloadAccountAttachmentsArchive(
      userId,
      attachmentIds,
      folderIds,
    );
  }

  deleteAttachment(userId: number, id: number): Promise<{ id: number }> {
    return this.attachmentsService.deleteAttachment(userId, id);
  }

  // Share links
  listShareLinks(userId: number, noteId: number): Promise<ShareLinkResponse[]> {
    return this.shareLinksService.listShareLinks(userId, noteId);
  }

  createShareLink(userId: number, noteId: number, dto: CreateShareLinkDto): Promise<ShareLinkResponse> {
    return this.shareLinksService.createShareLink(userId, noteId, dto);
  }

  revokeShareLink(userId: number, id: number): Promise<{ id: number }> {
    return this.shareLinksService.revokeShareLink(userId, id);
  }

  getPublicShare(
    token: string,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<PublicShareResponse> {
    return this.shareLinksService.getPublicShare(token, userAgent, ipAddress);
  }
}
