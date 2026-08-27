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
} from "@nestjs/common";

import { CurrentPrincipal } from "../auth/auth.decorators.js";
import type { AuthenticatedPrincipal } from "../auth/auth-runtime.service.js";
import { NotesService } from "./notes.service.js";
import {
  parseCreateNote,
  parseMoveNote,
  parseRevision,
  parseSearchQuery,
  parseSetTags,
  parseTagName,
  parseUpdateNote,
} from "./notes.validation.js";

@Controller("notes")
export class NotesController {
  constructor(@Inject(NotesService) private readonly notes: NotesService) {}

  @Get("tree")
  getTree(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.notes.getTree(principal.id);
  }

  @Get("trash")
  getTrash(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.notes.listTrash(principal.id);
  }

  @Get("search")
  search(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query("q") query: unknown,
  ) {
    return this.notes.search(principal.id, parseSearchQuery(query));
  }

  @Get("tags")
  listTags(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.notes.listTags(principal.id);
  }

  @Post("tags")
  createTag(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: unknown,
  ) {
    return this.notes.createTag(principal.id, parseTagName(body));
  }

  @Patch("tags/:tagId")
  updateTag(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("tagId", ParseIntPipe) tagId: number,
    @Body() body: unknown,
  ) {
    return this.notes.updateTag(principal.id, tagId, parseTagName(body));
  }

  @Delete("tags/:tagId")
  deleteTag(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("tagId", ParseIntPipe) tagId: number,
  ) {
    return this.notes.deleteTag(principal.id, tagId);
  }

  @Post()
  create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: unknown,
  ) {
    return this.notes.create(principal.id, parseCreateNote(body));
  }

  @Get(":id")
  getById(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.notes.getById(principal.id, id);
  }

  @Patch(":id")
  update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    return this.notes.update(principal.id, id, parseUpdateNote(body));
  }

  @Patch(":id/move")
  move(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    return this.notes.move(principal.id, id, parseMoveNote(body));
  }

  @Patch(":id/tags")
  setTags(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    return this.notes.setTags(principal.id, id, parseSetTags(body));
  }

  @Delete(":id")
  remove(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    return this.notes.remove(principal.id, id, parseRevision(body));
  }

  @Post(":id/restore")
  restore(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    return this.notes.restore(principal.id, id, parseRevision(body));
  }

  @Delete(":id/permanent")
  removePermanently(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    return this.notes.removePermanently(principal.id, id, parseRevision(body));
  }

  @Get(":id/versions")
  listVersions(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.notes.listVersions(principal.id, id);
  }

  @Post(":id/versions/:versionId/restore")
  restoreVersion(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Param("versionId", ParseIntPipe) versionId: number,
    @Body() body: unknown,
  ) {
    return this.notes.restoreVersion(
      principal.id,
      id,
      versionId,
      parseRevision(body),
    );
  }
}
