import { Module } from "@nestjs/common";

import { EntitlementsModule } from "../entitlements/entitlements.module.js";
import { NotesModule } from "../notes/notes.module.js";
import { FilesModule } from "../files/files.module.js";
import { WorkspaceModule } from "../workspace/workspace.module.js";
import { AiConversationService } from "./ai-conversation.service.js";
import { AiInputBuilderService } from "./ai-input-builder.service.js";
import { AiController, AdminPromptController } from "./ai.controller.js";
import { AiPolicyService } from "./ai-policy.service.js";
import { AiRegistryService } from "./ai-registry.service.js";
import { AiSecretCryptoService } from "./ai-secret-crypto.service.js";
import { AiResponseService } from "./ai-response.service.js";
import { AiToolExecutionService } from "./ai-tool-execution.service.js";
import { AiUsageService } from "./ai-usage.service.js";
import { PromptRegistryService } from "./prompt-registry.service.js";
import { ProviderEndpointPolicyService } from "./provider-endpoint-policy.service.js";
import { ResponsesProviderService } from "./responses-provider.service.js";
import { ToolConfirmationService } from "./tool-confirmation.service.js";
import { VoiceService } from "./voice.service.js";

@Module({
  controllers: [AiController, AdminPromptController],
  imports: [EntitlementsModule, FilesModule, NotesModule, WorkspaceModule],
  exports: [
    AiPolicyService,
    AiConversationService,
    AiResponseService,
    AiToolExecutionService,
    AiRegistryService,
    AiSecretCryptoService,
    ProviderEndpointPolicyService,
    ToolConfirmationService,
    VoiceService,
  ],
  providers: [
    AiConversationService,
    AiInputBuilderService,
    AiPolicyService,
    AiRegistryService,
    AiSecretCryptoService,
    AiResponseService,
    AiToolExecutionService,
    AiUsageService,
    PromptRegistryService,
    ProviderEndpointPolicyService,
    ResponsesProviderService,
    ToolConfirmationService,
    VoiceService,
  ],
})
export class AiModule {}
