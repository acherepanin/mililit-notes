import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  Inject,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  StreamableFile,
} from "@nestjs/common";

import { CurrentPrincipal, Roles } from "../auth/auth.decorators.js";
import type { AuthenticatedPrincipal } from "../auth/auth-runtime.service.js";
import { AiConversationService } from "./ai-conversation.service.js";
import { AiRegistryService } from "./ai-registry.service.js";
import { AiResponseService } from "./ai-response.service.js";
import { AiToolExecutionService } from "./ai-tool-execution.service.js";
import { PromptRegistryService } from "./prompt-registry.service.js";
import { ToolConfirmationService } from "./tool-confirmation.service.js";
import { VoiceService } from "./voice.service.js";
import {
  parseConversationList,
  parseCreateConversation,
  parseCreateMessage,
  parseCreateProvider,
  parseCreateResponse,
  parseMessageList,
  parseModelRole,
  parseModelRoute,
  parsePromptDefinition,
  parsePromptEvalCase,
  parsePromptEvalRun,
  parsePromptVersion,
  parseUpdateProvider,
  parseUpdateConversation,
  parseVoiceSpeech,
} from "./ai.validation.js";

@Controller("ai")
export class AiController {
  constructor(
    @Inject(AiConversationService)
    private readonly conversations: AiConversationService,
    @Inject(AiRegistryService) private readonly registry: AiRegistryService,
    @Inject(AiResponseService) private readonly responses: AiResponseService,
    @Inject(ToolConfirmationService)
    private readonly confirmations: ToolConfirmationService,
    @Inject(AiToolExecutionService)
    private readonly tools: AiToolExecutionService,
    @Inject(VoiceService) private readonly voice: VoiceService,
  ) {}

  @Post("voice/realtime")
  @HttpCode(200)
  @Header("Content-Type", "application/sdp")
  createRealtimeVoice(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() sdp: unknown,
    @Query("voice") voice: unknown,
  ) {
    return this.voice.createRealtimeCall(
      principal.id,
      sdp,
      typeof voice === "string" ? voice : "marin",
    );
  }

  @Post("voice/transcriptions")
  transcribeVoice(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: unknown,
    @Headers("content-type") contentType: unknown,
  ) {
    return this.voice.transcribe(principal.id, body, contentType);
  }

  @Post("voice/speech")
  async speakVoice(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: unknown,
  ): Promise<StreamableFile> {
    const result = await this.voice.speak(principal.id, parseVoiceSpeech(body));
    return new StreamableFile(result.audio, {
      disposition: "inline",
      type: result.contentType,
    });
  }

  @Get("conversations")
  listConversations(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query("cursor") cursor: unknown,
    @Query("limit") limit: unknown,
    @Query("status") status: unknown,
  ) {
    return this.conversations.list(
      principal.id,
      parseConversationList(cursor, limit, status),
    );
  }

  @Post("conversations")
  createConversation(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: unknown,
  ) {
    return this.conversations.create(
      principal.id,
      parseCreateConversation(body),
    );
  }

  @Get("conversations/:id")
  getConversation(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.conversations.get(principal.id, id);
  }

  @Patch("conversations/:id")
  updateConversation(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    return this.conversations.update(
      principal.id,
      id,
      parseUpdateConversation(body),
    );
  }

  @Delete("conversations/:id")
  deleteConversation(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.conversations.delete(principal.id, id);
  }

  @Get("conversations/:id/messages")
  listMessages(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Query("beforeSequence") beforeSequence: unknown,
    @Query("limit") limit: unknown,
  ) {
    return this.conversations.listMessages(
      principal.id,
      id,
      parseMessageList(beforeSequence, limit),
    );
  }

  @Post("conversations/:id/messages")
  createMessage(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    return this.conversations.createMessage(
      principal.id,
      id,
      parseCreateMessage(body),
    );
  }

  @Get("conversations/:id/messages/:messageId")
  getMessage(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Param("messageId", ParseIntPipe) messageId: number,
  ) {
    return this.conversations.getMessage(principal.id, id, messageId);
  }

  @Post("conversations/:id/responses")
  @Header("Cache-Control", "no-cache, no-store, no-transform")
  @Header("X-Accel-Buffering", "no")
  async createResponse(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: unknown,
  ): Promise<StreamableFile> {
    const response = await this.responses.start(
      principal.id,
      id,
      parseCreateResponse(body),
    );
    return new StreamableFile(response.stream, { type: "text/event-stream" });
  }

  @Get("tool-confirmations")
  listToolConfirmations(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.confirmations.listPending(principal.id);
  }

  @Post("tool-confirmations/:id/approve")
  @HttpCode(200)
  async approveToolConfirmation(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseIntPipe) id: number,
  ) {
    const decision = await this.confirmations.decide(
      principal.id,
      id,
      "approved",
    );
    return {
      ...decision,
      result: await this.tools.execute(principal.id, decision.toolCallId),
    };
  }

  @Post("tool-confirmations/:id/reject")
  @HttpCode(200)
  rejectToolConfirmation(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.confirmations.decide(principal.id, id, "rejected");
  }

  @Get("providers")
  listProviders(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.registry.listProviders(principal.id);
  }

  @Get("providers/:id/models")
  listProviderModels(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.registry.listProviderModels(principal.id, id);
  }

  @Post("providers/:id/models/sync")
  @HttpCode(200)
  syncProviderModels(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.registry.syncProviderModels(principal.id, id);
  }

  @Get("models")
  listAvailableModels(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.registry.listAvailableModels(principal.id);
  }

  @Get("usage-summary")
  usageSummary(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.registry.usageSummary(principal.id);
  }

  @Post("providers")
  createProvider(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: unknown,
  ) {
    return this.registry.createProvider(
      principal.id,
      parseCreateProvider(body),
    );
  }

  @Patch("providers/:id")
  updateProvider(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    return this.registry.updateProvider(
      principal.id,
      id,
      parseUpdateProvider(body),
    );
  }

  @Delete("providers/:id")
  deleteProvider(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.registry.deleteProvider(principal.id, id);
  }

  @Get("model-routes")
  listModelRoutes(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.registry.listModelRoutes(principal.id);
  }

  @Put("model-routes/:role")
  putModelRoute(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("role") role: string,
    @Body() body: unknown,
  ) {
    return this.registry.putModelRoute(
      principal.id,
      parseModelRole(role),
      parseModelRoute(body),
    );
  }
}

@Roles("admin")
@Controller("admin/ai/prompts")
export class AdminPromptController {
  constructor(
    @Inject(PromptRegistryService)
    private readonly prompts: PromptRegistryService,
  ) {}

  @Get()
  list() {
    return this.prompts.list();
  }

  @Post()
  createDefinition(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: unknown,
  ) {
    return this.prompts.createDefinition(
      principal.id,
      parsePromptDefinition(body),
    );
  }

  @Post(":id/versions")
  createVersion(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    return this.prompts.createVersion(
      principal.id,
      id,
      parsePromptVersion(body),
    );
  }

  @Get(":id/evals")
  evalState(@Param("id", ParseIntPipe) id: number) {
    return this.prompts.listEvalState(id);
  }

  @Post(":id/eval-cases")
  createEvalCase(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    return this.prompts.createEvalCase(
      principal.id,
      id,
      parsePromptEvalCase(body),
    );
  }

  @Post(":id/versions/:version/eval-runs")
  recordEvalRun(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Param("version", ParseIntPipe) version: number,
    @Body() body: unknown,
  ) {
    return this.prompts.recordEvalRun(
      principal.id,
      id,
      version,
      parsePromptEvalRun(body),
    );
  }

  @Post(":id/versions/:version/review")
  @HttpCode(200)
  reviewVersion(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Param("version", ParseIntPipe) version: number,
  ) {
    return this.prompts.reviewVersion(principal.id, id, version);
  }

  @Post(":id/versions/:version/activate")
  @HttpCode(200)
  activateVersion(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Param("version", ParseIntPipe) version: number,
  ) {
    return this.prompts.activateVersion(principal.id, id, version);
  }
}
