import { Module } from '@nestjs/common';

import { ActivityModule } from '../activity/activity.module';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../infra/database.module';
import { NotesModule } from '../notes/notes.module';
import { WorkspaceModule } from '../workspace/workspace.module';
import { AiController } from './ai.controller';
import { AiCryptoService } from './ai-crypto.service';
import { AiService } from './ai.service';
import { AiToolsService } from './ai-tools.service';

@Module({
  imports: [ActivityModule, AuthModule, DatabaseModule, NotesModule, WorkspaceModule],
  controllers: [AiController],
  providers: [AiCryptoService, AiService, AiToolsService],
  exports: [AiService, AiToolsService],
})
export class AiModule {}
