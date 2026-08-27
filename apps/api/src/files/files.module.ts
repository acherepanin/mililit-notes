import { Module } from "@nestjs/common";

import { EntitlementsModule } from "../entitlements/entitlements.module.js";
import { FilesController } from "./files.controller.js";
import { FileArchivesService } from "./file-archives.service.js";
import { FilesService } from "./files.service.js";
import { ObjectStorageService } from "./object-storage.service.js";

@Module({
  controllers: [FilesController],
  exports: [FilesService, ObjectStorageService],
  imports: [EntitlementsModule],
  providers: [FileArchivesService, FilesService, ObjectStorageService],
})
export class FilesModule {}
