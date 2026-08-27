import { Module } from "@nestjs/common";

import { AiModule } from "../ai/ai.module.js";
import { EntitlementsModule } from "../entitlements/entitlements.module.js";
import { FilesModule } from "../files/files.module.js";
import { IntegrationInternalAuthService } from "./integration-internal-auth.service.js";
import { IntegrationDiagnosticsService } from "./integration-diagnostics.service.js";
import { IntegrationPendingActionsService } from "./integration-pending-actions.service.js";
import { IntegrationProcessingService } from "./integration-processing.service.js";
import { IntegrationSecretCryptoService } from "./integration-secret-crypto.service.js";
import { IntegrationSettingsService } from "./integration-settings.service.js";
import { IntegrationWebhookService } from "./integration-webhook.service.js";
import {
  AdminIntegrationsController,
  InternalIntegrationsController,
  IntegrationsController,
  IntegrationWebhooksController,
  LegacyIntegrationWebhooksController,
} from "./integrations.controller.js";

@Module({
  controllers: [
    IntegrationsController,
    AdminIntegrationsController,
    InternalIntegrationsController,
    IntegrationWebhooksController,
    LegacyIntegrationWebhooksController,
  ],
  exports: [IntegrationSettingsService],
  imports: [AiModule, EntitlementsModule, FilesModule],
  providers: [
    IntegrationDiagnosticsService,
    IntegrationInternalAuthService,
    IntegrationPendingActionsService,
    IntegrationProcessingService,
    IntegrationSecretCryptoService,
    IntegrationSettingsService,
    IntegrationWebhookService,
  ],
})
export class IntegrationsModule {}
