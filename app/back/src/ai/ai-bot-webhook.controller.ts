import { Body, Controller, Headers, Inject, Post } from '@nestjs/common';

import { Public } from '../auth/public.decorator';
import { AiBotRuntimeService } from './ai-bot-runtime.service';

@Public()
@Controller('ai/bots')
export class AiBotWebhookController {
  constructor(
    @Inject(AiBotRuntimeService) private readonly aiBotRuntimeService: AiBotRuntimeService,
  ) {}

  @Post('telegram/webhook')
  handleTelegramWebhook(
    @Body() payload: unknown,
    @Headers('x-telegram-bot-api-secret-token') secretToken?: string,
  ): Promise<{ ok: true }> {
    return this.aiBotRuntimeService.handleTelegramWebhook(payload as never, secretToken);
  }

  @Post('vk/webhook')
  handleVkWebhook(@Body() payload: unknown): Promise<string> {
    return this.aiBotRuntimeService.handleVkWebhook(payload as never);
  }
}
