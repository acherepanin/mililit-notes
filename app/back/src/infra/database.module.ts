import { Module } from '@nestjs/common';

import { AttachmentFilesService } from './attachment-files.service';
import { DatabaseService } from './database.service';

@Module({
  providers: [AttachmentFilesService, DatabaseService],
  exports: [AttachmentFilesService, DatabaseService],
})
export class DatabaseModule {}
