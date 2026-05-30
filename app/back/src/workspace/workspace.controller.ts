import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';

import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import {
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
import { WorkspaceService } from './workspace.service';
import type {
  AttachmentFolderResponse,
  AttachmentResponse,
  ExportResponse,
  NoteTemplateResponse,
  PublicShareResponse,
  ShareLinkResponse,
} from './workspace.types';

interface PublicRequest {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
}

interface DownloadResponse {
  setHeader(name: string, value: string): void;
  send(body: Buffer): void;
}

function parseAttachmentIds(rawIds?: string): number[] {
  if (!rawIds) {
    return [];
  }
  return rawIds
    .split(',')
    .map((id) => Number(id.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);
}

function parseFolderIds(rawIds?: string): number[] {
  if (!rawIds) {
    return [];
  }
  return rawIds
    .split(',')
    .map((id) => Number(id.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);
}

function parseFolderId(rawFolderId?: string): number | null | undefined {
  if (rawFolderId === undefined) {
    return undefined;
  }
  if (rawFolderId === '' || rawFolderId === 'root') {
    return null;
  }
  const folderId = Number(rawFolderId);
  return Number.isInteger(folderId) && folderId > 0 ? folderId : undefined;
}

@Controller()
export class PublicShareController {
  constructor(@Inject(WorkspaceService) private readonly workspaceService: WorkspaceService) {}

  @Get('share/:token')
  getPublicShare(
    @Param('token') token: string,
    @Req() request: PublicRequest,
  ): PublicShareResponse {
    const userAgent = request.headers['user-agent'];
    return this.workspaceService.getPublicShare(
      token,
      Array.isArray(userAgent) ? userAgent.join(' ') : userAgent,
      request.ip,
    );
  }
}

@Controller()
@UseGuards(AuthGuard)
export class WorkspaceController {
  constructor(@Inject(WorkspaceService) private readonly workspaceService: WorkspaceService) {}

  @Get('templates')
  listTemplates(@Req() request: AuthenticatedRequest): NoteTemplateResponse[] {
    return this.workspaceService.listTemplates(request.user.id);
  }

  @Post('templates')
  createTemplate(
    @Req() request: AuthenticatedRequest,
    @Body() dto: TemplateDto,
  ): NoteTemplateResponse {
    return this.workspaceService.createTemplate(request.user.id, dto);
  }

  @Patch('templates/:id')
  updateTemplate(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TemplateDto,
  ): NoteTemplateResponse {
    return this.workspaceService.updateTemplate(request.user.id, id, dto);
  }

  @Delete('templates/:id')
  deleteTemplate(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): { id: number } {
    return this.workspaceService.deleteTemplate(request.user.id, id);
  }

  @Post('notes/from-template')
  createNoteFromTemplate(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateNoteFromTemplateDto,
  ) {
    return this.workspaceService.createNoteFromTemplate(request.user.id, dto);
  }

  @Get('export/json')
  exportJson(@Req() request: AuthenticatedRequest): ExportResponse {
    return this.workspaceService.exportJson(request.user.id);
  }

  @Get('attachment-folders')
  listAttachmentFolders(@Req() request: AuthenticatedRequest): AttachmentFolderResponse[] {
    return this.workspaceService.listAttachmentFolders(request.user.id);
  }

  @Post('attachment-folders')
  createAttachmentFolder(
    @Req() request: AuthenticatedRequest,
    @Body() dto: AttachmentFolderDto,
  ): AttachmentFolderResponse {
    return this.workspaceService.createAttachmentFolder(request.user.id, dto);
  }

  @Patch('attachment-folders/:id')
  renameAttachmentFolder(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AttachmentFolderDto,
  ): AttachmentFolderResponse {
    return this.workspaceService.renameAttachmentFolder(request.user.id, id, dto);
  }

  @Delete('attachment-folders/:id')
  deleteAttachmentFolder(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): { id: number } {
    return this.workspaceService.deleteAttachmentFolder(request.user.id, id);
  }

  @Patch('attachment-folders/:id/parent')
  moveAttachmentFolderParent(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MoveAttachmentFolderParentDto,
  ): AttachmentFolderResponse {
    return this.workspaceService.moveAttachmentFolder(request.user.id, id, dto);
  }

  @Get('attachments')
  listAccountAttachments(
    @Req() request: AuthenticatedRequest,
    @Query('folderId') folderId?: string,
  ): AttachmentResponse[] {
    return this.workspaceService.listAccountAttachments(
      request.user.id,
      parseFolderId(folderId),
    );
  }

  @Post('attachments')
  uploadAccountAttachment(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UploadAttachmentDto,
  ): AttachmentResponse {
    return this.workspaceService.uploadAttachment(request.user.id, dto);
  }

  @Get('attachments/archive')
  downloadAccountAttachmentsArchive(
    @Req() request: AuthenticatedRequest,
    @Query('ids') ids: string | undefined,
    @Query('folderIds') folderIds: string | undefined,
    @Res() response: DownloadResponse,
  ): void {
    const { fileName, content } = this.workspaceService.downloadAccountAttachmentsArchive(
      request.user.id,
      parseAttachmentIds(ids),
      parseFolderIds(folderIds),
    );
    response.setHeader('Content-Type', 'application/zip');
    response.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    response.send(content);
  }

  @Post('import/json')
  importJson(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ImportNotesDto,
  ): { imported: number } {
    return this.workspaceService.importJson(request.user.id, dto);
  }

  @Post('notes/:id/attachments')
  uploadNoteAttachment(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UploadAttachmentDto,
  ): AttachmentResponse {
    return this.workspaceService.uploadAttachment(request.user.id, { ...dto, noteId: id });
  }

  @Get('notes/:id/attachments')
  listAttachments(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): AttachmentResponse[] {
    return this.workspaceService.listAttachments(request.user.id, id);
  }

  @Get('notes/:id/attachments/archive')
  downloadAttachmentsArchive(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Query('ids') ids: string | undefined,
    @Res() response: DownloadResponse,
  ): void {
    const { fileName, content } = this.workspaceService.downloadAttachmentsArchive(
      request.user.id,
      id,
      parseAttachmentIds(ids),
    );
    response.setHeader('Content-Type', 'application/zip');
    response.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    response.send(content);
  }

  @Patch('attachments/:id')
  renameAttachment(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RenameAttachmentDto,
  ): AttachmentResponse {
    return this.workspaceService.renameAttachment(request.user.id, id, dto);
  }

  @Patch('attachments/:id/note')
  attachAttachmentToNote(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AttachAttachmentDto,
  ): AttachmentResponse {
    return this.workspaceService.attachAttachmentToNote(request.user.id, id, dto);
  }

  @Patch('attachments/:id/folder')
  moveAttachmentToFolder(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MoveAttachmentFolderDto,
  ): AttachmentResponse {
    return this.workspaceService.moveAttachmentToFolder(request.user.id, id, dto);
  }

  @Post('attachments/:id/duplicate')
  duplicateAttachment(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DuplicateAttachmentDto,
  ): AttachmentResponse {
    return this.workspaceService.duplicateAttachment(request.user.id, id, dto);
  }

  @Get('attachments/:id/download')
  downloadAttachment(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Res() response: DownloadResponse,
  ): void {
    const { record, content } = this.workspaceService.downloadAttachment(request.user.id, id);
    response.setHeader('Content-Type', record.mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(record.fileName)}"`,
    );
    response.send(content);
  }

  @Delete('attachments/:id')
  deleteAttachment(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): { id: number } {
    return this.workspaceService.deleteAttachment(request.user.id, id);
  }

  @Get('notes/:id/share-links')
  listShareLinks(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): ShareLinkResponse[] {
    return this.workspaceService.listShareLinks(request.user.id, id);
  }

  @Post('notes/:id/share-links')
  createShareLink(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateShareLinkDto,
  ): ShareLinkResponse {
    return this.workspaceService.createShareLink(request.user.id, id, dto);
  }

  @Delete('share-links/:id')
  revokeShareLink(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): { id: number } {
    return this.workspaceService.revokeShareLink(request.user.id, id);
  }
}
