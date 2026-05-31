import { Module } from '@nestjs/common';

import { ActivityModule } from '../activity/activity.module';
import { AdminModule } from '../admin/admin.module';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../infra/database.module';
import { NotesModule } from '../notes/notes.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { WorkspaceModule } from '../workspace/workspace.module';
import { AiBotRuntimeService } from './ai-bot-runtime.service';
import { AiController } from './ai.controller';
import { AiBotSettingsService } from './ai-bot-settings.service';
import { AiBotWebhookController } from './ai-bot-webhook.controller';
import { AiCryptoService } from './ai-crypto.service';
import { AiEmbeddingsService } from './ai-embeddings.service';
import { AiModelCatalogService } from './ai-model-catalog.service';
import { AiService } from './ai.service';
import { AiToolsService } from './ai-tools.service';

@Module({
  imports: [
    ActivityModule,
    AdminModule,
    AuthModule,
    DatabaseModule,
    NotesModule,
    SubscriptionsModule,
    WorkspaceModule,
  ],
  controllers: [AiController, AiBotWebhookController],
  providers: [
    AiBotRuntimeService,
    AiBotSettingsService,
    AiCryptoService,
    AiEmbeddingsService,
    AiModelCatalogService,
    AiService,
    AiToolsService,
  ],
  exports: [
    AiBotRuntimeService,
    AiBotSettingsService,
    AiModelCatalogService,
    AiService,
    AiToolsService,
  ],
})
export class AiModule {}
