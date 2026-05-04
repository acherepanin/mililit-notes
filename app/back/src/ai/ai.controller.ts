import { Body, Controller, Get, Inject, Patch, Post, Req, UseGuards } from '@nestjs/common';

import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { AiService } from './ai.service';
import { ExecuteAiToolDto } from './dto/execute-ai-tool.dto';
import { SendAiMessageDto } from './dto/send-ai-message.dto';
import { UpdateAiSettingsDto } from './dto/update-ai-settings.dto';
import type { AiChatResponse, AiSettingsResponse, AiToolExecutionResponse } from './ai.types';

@Controller('ai')
@UseGuards(AuthGuard)
export class AiController {
  constructor(@Inject(AiService) private readonly aiService: AiService) {}

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

  @Post('test-connection')
  testConnection(
    @Req() request: AuthenticatedRequest,
  ): Promise<{ ok: boolean; checkedAt: string }> {
    return this.aiService.testConnection(request.user.id);
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
}
