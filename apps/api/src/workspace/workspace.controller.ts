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
  Req,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";

import { CurrentPrincipal, Public } from "../auth/auth.decorators.js";
import type { AuthenticatedPrincipal } from "../auth/auth-runtime.service.js";
import { ImportExportService } from "./import-export.service.js";
import { ShareLinksService } from "./share-links.service.js";
import { TemplatesService } from "./templates.service.js";
import {
  parseCreateFromTemplate,
  parseCreateShare,
  parseImport,
  parseShareToken,
  parseTemplate,
} from "./workspace.validation.js";

@Public()
@Controller("share")
export class PublicShareController {
  constructor(
    @Inject(ShareLinksService) private readonly shares: ShareLinksService,
  ) {}

  @Get(":token")
  @Header("Cache-Control", "no-store")
  getPublic(@Param("token") token: string, @Req() request: FastifyRequest) {
    return this.shares.getPublic(
      parseShareToken(token),
      request.headers["user-agent"],
      request.ip,
    );
  }
}

@Controller()
export class WorkspaceController {
  constructor(
    @Inject(TemplatesService) private readonly templates: TemplatesService,
    @Inject(ImportExportService)
    private readonly importExport: ImportExportService,
    @Inject(ShareLinksService) private readonly shares: ShareLinksService,
  ) {}

  @Get("templates")
  listTemplates(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.templates.list(principal.id);
  }

  @Post("templates")
  createTemplate(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: unknown,
  ) {
    return this.templates.create(principal.id, parseTemplate(body));
  }

  @Patch("templates/:id")
  updateTemplate(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    return this.templates.update(principal.id, id, parseTemplate(body));
  }

  @Delete("templates/:id")
  deleteTemplate(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.templates.remove(principal.id, id);
  }

  @Post("notes/from-template")
  createNoteFromTemplate(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: unknown,
  ) {
    const input = parseCreateFromTemplate(body);
    return this.templates.createNote(
      principal.id,
      input.templateId,
      input.parentId,
    );
  }

  @Get("export/json")
  @Header("Cache-Control", "no-store")
  exportJson(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.importExport.exportJson(principal.id);
  }

  @Post("import/json")
  importJson(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: unknown,
  ) {
    return this.importExport.importJson(principal.id, parseImport(body));
  }

  @Get("notes/:id/share-links")
  listShareLinks(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.shares.list(principal.id, id);
  }

  @Post("notes/:id/share-links")
  createShareLink(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    return this.shares.create(principal.id, id, parseCreateShare(body));
  }

  @Delete("share-links/:id")
  revokeShareLink(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.shares.revoke(principal.id, id);
  }
}
