import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Inject,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
} from "@nestjs/common";

import { CurrentPrincipal } from "../auth/auth.decorators.js";
import type { AuthenticatedPrincipal } from "../auth/auth-runtime.service.js";
import { FileArchivesService } from "./file-archives.service.js";
import { FilesService } from "./files.service.js";
import {
  parseCompleteUpload,
  parseArchiveSelection,
  parseCreateFolder,
  parseCreateUpload,
  parseDuplicateFile,
  parseFilePatch,
  parseInline,
  parseMoveFolder,
  parseOptionalId,
  parseRenameFolder,
  parseSearch,
} from "./files.validation.js";

@Controller("files")
export class FilesController {
  constructor(
    @Inject(FileArchivesService)
    private readonly archives: FileArchivesService,
    @Inject(FilesService) private readonly files: FilesService,
  ) {}

  @Get("folders")
  listFolders(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.files.listFolders(principal.id);
  }

  @Post("folders")
  createFolder(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: unknown,
  ) {
    return this.files.createFolder(principal.id, parseCreateFolder(body));
  }

  @Patch("folders/:id")
  renameFolder(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    return this.files.renameFolder(
      principal.id,
      id,
      parseRenameFolder(body).name,
    );
  }

  @Patch("folders/:id/move")
  moveFolder(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    return this.files.moveFolder(
      principal.id,
      id,
      parseMoveFolder(body).parentId,
    );
  }

  @Delete("folders/:id")
  deleteFolder(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.files.deleteFolder(principal.id, id);
  }

  @Get("usage")
  usage(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.files.usage(principal.id);
  }

  @Post("uploads")
  createUpload(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: unknown,
  ) {
    return this.files.createUpload(principal.id, parseCreateUpload(body));
  }

  @Get("uploads/:id")
  getUpload(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.files.getUpload(principal.id, id);
  }

  @Post("uploads/:id/parts/:partNumber/url")
  signUploadPart(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Param("partNumber", ParseIntPipe) partNumber: number,
  ) {
    return this.files.signUploadPart(principal.id, id, partNumber);
  }

  @Post("uploads/:id/complete")
  completeUpload(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    return this.files.completeUpload(
      principal.id,
      id,
      parseCompleteUpload(body),
    );
  }

  @Delete("uploads/:id")
  abortUpload(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.files.abortUpload(principal.id, id);
  }

  @Get("archive")
  @Header("Cache-Control", "no-store")
  async downloadArchive(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query("ids") fileIds: unknown,
    @Query("folderIds") folderIds: unknown,
    @Query("noteId") noteId: unknown,
  ): Promise<StreamableFile> {
    const archive = await this.archives.create(
      principal.id,
      parseArchiveSelection(fileIds, folderIds, noteId),
    );
    return new StreamableFile(archive.stream, {
      disposition: `attachment; filename="files.zip"; filename*=UTF-8''${encodeURIComponent(archive.fileName)}`,
      type: "application/zip",
    });
  }

  @Get(":id/url")
  signedUrl(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Query("inline") inline: unknown,
  ) {
    return this.files.signedUrl(principal.id, id, parseInline(inline));
  }

  @Patch(":id")
  patchFile(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    return this.files.patchFile(principal.id, id, parseFilePatch(body));
  }

  @Post(":id/duplicate")
  duplicateFile(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    return this.files.duplicateFile(
      principal.id,
      id,
      parseDuplicateFile(body).folderId,
    );
  }

  @Delete(":id")
  deleteFile(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.files.deleteFile(principal.id, id);
  }

  @Get()
  listFiles(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query("folderId") folderId: unknown,
    @Query("noteId") noteId: unknown,
    @Query("q") query: unknown,
  ) {
    return this.files.listFiles(principal.id, {
      folderId: parseOptionalId(folderId, "folderId"),
      noteId: parseOptionalId(noteId, "noteId"),
      query: parseSearch(query),
    });
  }
}
