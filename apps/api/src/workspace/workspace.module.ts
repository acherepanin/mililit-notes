import { Module } from "@nestjs/common";

import { EntitlementsModule } from "../entitlements/entitlements.module.js";
import { NotesModule } from "../notes/notes.module.js";
import { ImportExportService } from "./import-export.service.js";
import { ShareLinksService } from "./share-links.service.js";
import { TemplatesService } from "./templates.service.js";
import {
  PublicShareController,
  WorkspaceController,
} from "./workspace.controller.js";

@Module({
  controllers: [WorkspaceController, PublicShareController],
  exports: [TemplatesService, ShareLinksService],
  imports: [EntitlementsModule, NotesModule],
  providers: [TemplatesService, ImportExportService, ShareLinksService],
})
export class WorkspaceModule {}
