import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";

import { AdminModule } from "./admin/admin.module.js";
import { HealthController } from "./health.controller.js";
import { AiModule } from "./ai/ai.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { CsrfGuard } from "./auth/csrf.guard.js";
import { SessionAuthGuard } from "./auth/session-auth.guard.js";
import { DatabaseModule } from "./database/database.module.js";
import { FilesModule } from "./files/files.module.js";
import { IntegrationsModule } from "./integrations/integrations.module.js";
import { NotesModule } from "./notes/notes.module.js";
import { NotificationsModule } from "./notifications/notifications.module.js";
import { ObservabilityModule } from "./observability/observability.module.js";
import { WorkspaceModule } from "./workspace/workspace.module.js";
import { SubscriptionsModule } from "./subscriptions/subscriptions.module.js";

@Module({
  controllers: [HealthController],
  imports: [
    DatabaseModule,
    ObservabilityModule,
    AuthModule,
    AdminModule,
    AiModule,
    NotesModule,
    NotificationsModule,
    WorkspaceModule,
    FilesModule,
    IntegrationsModule,
    SubscriptionsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: SessionAuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
})
export class AppModule {}
