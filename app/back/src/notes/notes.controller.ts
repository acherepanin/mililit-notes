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
} from '@nestjs/common';

import { type AuthenticatedRequest } from '../auth/auth.guard';
import { CreateNoteDto } from './dto/create-note.dto';
import { CreateTagDto } from './dto/create-tag.dto';
import { MoveNoteDto } from './dto/move-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
import { UpdateNoteTagsDto } from './dto/update-note-tags.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { NotesService } from './notes.service';
import type {
  NoteResponse,
  NoteSearchResult,
  NoteTreeNode,
  NoteVersionResponse,
  TagResponse,
} from './notes.types';

@Controller('notes')
export class NotesController {
  constructor(@Inject(NotesService) private readonly notesService: NotesService) {}

  @Get('tree')
  getTree(@Req() request: AuthenticatedRequest): Promise<NoteTreeNode[]> {
    return this.notesService.getTree(request.user.id);
  }

  @Get('trash')
  listTrash(@Req() request: AuthenticatedRequest): Promise<NoteResponse[]> {
    return this.notesService.listTrash(request.user.id);
  }

  @Get('search')
  search(
    @Req() request: AuthenticatedRequest,
    @Query('q') query = '',
  ): Promise<NoteSearchResult[]> {
    return this.notesService.search(request.user.id, query);
  }

  @Post('search/reindex')
  rebuildSearchIndex(@Req() request: AuthenticatedRequest): Promise<{ indexed: number }> {
    return this.notesService.rebuildSearchIndex(request.user.id);
  }

  @Get('tags')
  listTags(@Req() request: AuthenticatedRequest): Promise<TagResponse[]> {
    return this.notesService.listTags(request.user.id);
  }

  @Post('tags')
  createTag(@Req() request: AuthenticatedRequest, @Body() dto: CreateTagDto): Promise<TagResponse> {
    return this.notesService.createTag(request.user.id, dto.name);
  }

  @Delete('tags/:tagId')
  deleteTag(
    @Req() request: AuthenticatedRequest,
    @Param('tagId', ParseIntPipe) tagId: number,
  ): Promise<{ id: number }> {
    return this.notesService.deleteTag(request.user.id, tagId);
  }

  @Patch('tags/:tagId')
  updateTag(
    @Req() request: AuthenticatedRequest,
    @Param('tagId', ParseIntPipe) tagId: number,
    @Body() dto: UpdateTagDto,
  ): Promise<TagResponse> {
    return this.notesService.updateTag(request.user.id, tagId, dto.name);
  }

  @Get(':id')
  getById(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<NoteResponse> {
    return this.notesService.getById(request.user.id, id);
  }

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateNoteDto): Promise<NoteResponse> {
    return this.notesService.create(request.user.id, dto);
  }

  @Patch(':id')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateNoteDto,
  ): Promise<NoteResponse> {
    return this.notesService.update(request.user.id, id, dto);
  }

  @Patch(':id/move')
  move(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MoveNoteDto,
  ): Promise<NoteResponse> {
    return this.notesService.move(request.user.id, id, dto);
  }

  @Patch(':id/tags')
  updateTags(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateNoteTagsDto,
  ): Promise<NoteResponse> {
    return this.notesService.updateTags(request.user.id, id, dto.tags);
  }

  @Get(':id/versions')
  listVersions(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<NoteVersionResponse[]> {
    return this.notesService.listVersions(request.user.id, id);
  }

  @Post(':id/versions/:versionId/restore')
  restoreVersion(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('versionId', ParseIntPipe) versionId: number,
  ): Promise<NoteResponse> {
    return this.notesService.restoreVersion(request.user.id, id, versionId);
  }

  @Post(':id/restore')
  restore(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<NoteResponse> {
    return this.notesService.restore(request.user.id, id);
  }

  @Delete(':id/permanent')
  permanentDelete(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ id: number }> {
    return this.notesService.permanentDelete(request.user.id, id);
  }

  @Delete(':id')
  delete(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ id: number }> {
    return this.notesService.delete(request.user.id, id);
  }
}
