import { Body, Controller, Get, Inject, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';

import { AdminGuard } from '../auth/admin.guard';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { AiBotSettingsService } from './ai-bot-settings.service';
import { AiModelCatalogService } from './ai-model-catalog.service';
import { AiService } from './ai.service';
import { CreateAiBotLinkCodeDto } from './dto/create-ai-bot-link-code.dto';
import { ExecuteAiToolDto } from './dto/execute-ai-tool.dto';
import { SendAiMessageDto } from './dto/send-ai-message.dto';
import { UpdateAiBotAdminSettingsDto } from './dto/update-ai-bot-admin-settings.dto';
import { UpdateAiBotUserSettingsDto } from './dto/update-ai-bot-user-settings.dto';
import { UpdateAiSettingsDto } from './dto/update-ai-settings.dto';
import type {
  AiBotAdminSettingsResponse,
  AiBotConnectionCheckResponse,
  AiBotLinkCodeResponse,
  AiBotUserSettingsResponse,
  AiChatResponse,
  AiMonthlyUsageResponse,
  AiSettingsResponse,
  AiToolExecutionResponse,
} from './ai.types';

@Controller('ai')
@UseGuards(AuthGuard)
export class AiController {
  constructor(
    @Inject(AiService) private readonly aiService: AiService,
    @Inject(AiModelCatalogService)
    private readonly aiModelCatalogService: AiModelCatalogService,
    @Inject(AiBotSettingsService) private readonly aiBotSettingsService: AiBotSettingsService,
  ) {}

  @Get('settings')
  getSettings(@Req() request: AuthenticatedRequest): AiSettingsResponse {
    return this.aiService.getSettings(request.user.id);
  }

  @Patch('settings')
  updateSettings(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateAiSettingsDto,
  ): AiSettingsResponse {
    return this.aiService.updateSettings(request.user.id, dto);
  }

  @Post('models/sync')
  syncModels(@Req() request: AuthenticatedRequest): Promise<AiSettingsResponse> {
    return this.aiService.syncModels(request.user.id);
  }

  @Post('models/catalog/sync')
  @UseGuards(AdminGuard)
  async syncModelCatalog(): Promise<{ ok: true }> {
    await this.aiModelCatalogService.syncFromConfiguredUrl();
    return { ok: true };
  }

  @Post('test-connection')
  testConnection(
    @Req() request: AuthenticatedRequest,
  ): Promise<{ ok: boolean; checkedAt: string }> {
    return this.aiService.testConnection(request.user.id);
  }

  @Get('usage/monthly')
  getMonthlyUsage(@Req() request: AuthenticatedRequest): AiMonthlyUsageResponse {
    return this.aiService.getMonthlyUsage(request.user.id);
  }

  @Post('chat')
  chat(
    @Req() request: AuthenticatedRequest,
    @Body() dto: SendAiMessageDto,
  ): Promise<AiChatResponse> {
    return this.aiService.chat(request.user.id, dto);
  }

  @Post('actions/execute')
  executeAction(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ExecuteAiToolDto,
  ): AiToolExecutionResponse {
    return this.aiService.executeAction(request.user.id, dto);
  }

  @Get('bots/admin-settings')
  @UseGuards(AdminGuard)
  listBotAdminSettings(): AiBotAdminSettingsResponse[] {
    return this.aiBotSettingsService.listAdminSettings();
  }

  @Patch('bots/admin-settings/:provider')
  @UseGuards(AdminGuard)
  updateBotAdminSettings(
    @Req() request: AuthenticatedRequest,
    @Param('provider') provider: string,
    @Body() dto: UpdateAiBotAdminSettingsDto,
  ): AiBotAdminSettingsResponse {
    return this.aiBotSettingsService.updateAdminSettings(request.user.id, provider, dto);
  }

  @Post('bots/admin-settings/:provider/test')
  @UseGuards(AdminGuard)
  testBotAdminConnection(
    @Req() request: AuthenticatedRequest,
    @Param('provider') provider: string,
  ): Promise<AiBotConnectionCheckResponse> {
    return this.aiBotSettingsService.testAdminConnection(request.user.id, provider);
  }

  @Get('bots/me')
  listBotUserSettings(@Req() request: AuthenticatedRequest): AiBotUserSettingsResponse[] {
    return this.aiBotSettingsService.listUserSettings(request.user.id);
  }

  @Patch('bots/me/:provider')
  updateBotUserSettings(
    @Req() request: AuthenticatedRequest,
    @Param('provider') provider: string,
    @Body() dto: UpdateAiBotUserSettingsDto,
  ): AiBotUserSettingsResponse {
    return this.aiBotSettingsService.updateUserSettings(request.user.id, provider, dto);
  }

  @Post('bots/link-code')
  createBotLinkCode(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateAiBotLinkCodeDto,
  ): AiBotLinkCodeResponse {
    return this.aiBotSettingsService.createLinkCode(request.user.id, dto.provider);
  }
}
