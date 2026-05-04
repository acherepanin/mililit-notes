import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../infra/database.module';
import { NotesModule } from '../notes/notes.module';
import { PublicShareController, WorkspaceController } from './workspace.controller';
import { WorkspaceService } from './workspace.service';

@Module({
  imports: [AuthModule, DatabaseModule, NotesModule],
  controllers: [WorkspaceController, PublicShareController],
  providers: [WorkspaceService],
  exports: [WorkspaceService],
})
export class WorkspaceModule {}
