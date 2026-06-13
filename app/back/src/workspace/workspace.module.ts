import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../infra/database.module';
import { NotesModule } from '../notes/notes.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AttachmentFoldersService } from './attachment-folders.service';
import { AttachmentsService } from './attachments.service';
import { ImportExportService } from './import-export.service';
import { ShareLinksService } from './share-links.service';
import { TemplatesService } from './templates.service';
import { PublicShareController, WorkspaceController } from './workspace.controller';
import { WorkspaceService } from './workspace.service';

@Module({
  imports: [AuthModule, DatabaseModule, NotesModule, SubscriptionsModule],
  controllers: [WorkspaceController, PublicShareController],
  providers: [
    WorkspaceService,
    TemplatesService,
    AttachmentsService,
    AttachmentFoldersService,
    ShareLinksService,
    ImportExportService,
  ],
  exports: [WorkspaceService],
})
export class WorkspaceModule {}
