import { Body, Controller, Delete, Get, Inject, Param, ParseIntPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';

import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { CreateNoteDto } from './dto/create-note.dto';
import { MoveNoteDto } from './dto/move-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
import { NotesService } from './notes.service';
import type { NoteResponse, NoteTreeNode } from './notes.types';

@Controller('notes')
@UseGuards(AuthGuard)
export class NotesController {
  constructor(@Inject(NotesService) private readonly notesService: NotesService) {}

  @Get('tree')
  getTree(@Req() request: AuthenticatedRequest): NoteTreeNode[] {
    return this.notesService.getTree(request.user.id);
  }

  @Get(':id')
  getById(@Req() request: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number): NoteResponse {
    return this.notesService.getById(request.user.id, id);
  }

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateNoteDto): NoteResponse {
    return this.notesService.create(request.user.id, dto);
  }

  @Patch(':id')
  update(@Req() request: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateNoteDto): NoteResponse {
    return this.notesService.update(request.user.id, id, dto);
  }

  @Patch(':id/move')
  move(@Req() request: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: MoveNoteDto): NoteResponse {
    return this.notesService.move(request.user.id, id, dto);
  }

  @Delete(':id')
  delete(@Req() request: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number): { id: number } {
    return this.notesService.delete(request.user.id, id);
  }
}
