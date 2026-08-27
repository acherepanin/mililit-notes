import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Req,
} from "@nestjs/common";
import { isIntegrationEventJob } from "@notes/config";
import type { FastifyRequest } from "fastify";

import { CurrentPrincipal, Public, Roles } from "../auth/auth.decorators.js";
import type { AuthenticatedPrincipal } from "../auth/auth-runtime.service.js";
import { IntegrationInternalAuthService } from "./integration-internal-auth.service.js";
import { IntegrationDiagnosticsService } from "./integration-diagnostics.service.js";
import { IntegrationProcessingService } from "./integration-processing.service.js";
import { IntegrationSettingsService } from "./integration-settings.service.js";
import { IntegrationWebhookService } from "./integration-webhook.service.js";
import {
  parseAdminIntegration,
  parseIntegrationProvider,
  parseUserIntegration,
} from "./integrations.validation.js";

@Controller("integrations")
export class IntegrationsController {
  constructor(
    @Inject(IntegrationSettingsService)
    private readonly settings: IntegrationSettingsService,
  ) {}

  @Get()
  list(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.settings.listUserSettings(principal.id);
  }

  @Put(":provider")
  update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("provider") provider: string,
    @Body() body: unknown,
  ) {
    return this.settings.updateUserSettings(
      principal.id,
      parseIntegrationProvider(provider),
      parseUserIntegration(body),
    );
  }

  @Post(":provider/link-codes")
  createLinkCode(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("provider") provider: string,
  ) {
    return this.settings.createLinkCode(
      principal.id,
      parseIntegrationProvider(provider),
    );
  }

  @Delete(":provider/link")
  unlink(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("provider") provider: string,
  ) {
    return this.settings.unlink(
      principal.id,
      parseIntegrationProvider(provider),
    );
  }
}

@Roles("admin")
@Controller("admin/integrations")
export class AdminIntegrationsController {
  constructor(
    @Inject(IntegrationSettingsService)
    private readonly settings: IntegrationSettingsService,
    @Inject(IntegrationDiagnosticsService)
    private readonly diagnostics: IntegrationDiagnosticsService,
  ) {}

  @Get()
  list() {
    return this.settings.listAdminSettings();
  }

  @Put(":provider")
  update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("provider") provider: string,
    @Body() body: unknown,
  ) {
    return this.settings.updateAdminSettings(
      principal.id,
      parseIntegrationProvider(provider),
      parseAdminIntegration(body),
    );
  }

  @Post(":provider/test")
  test(@Param("provider") provider: string) {
    return this.diagnostics.test(parseIntegrationProvider(provider));
  }
}

@Public()
@Controller("integrations/webhooks")
export class IntegrationWebhooksController {
  constructor(
    @Inject(IntegrationWebhookService)
    private readonly webhooks: IntegrationWebhookService,
  ) {}

  @Post("telegram")
  @HttpCode(200)
  telegram(
    @Body() body: unknown,
    @Headers("x-telegram-bot-api-secret-token") secret: string | undefined,
    @Req() request: FastifyRequest,
  ) {
    return this.webhooks.acceptTelegram(body, secret, request.ip);
  }

  @Post("vk")
  @HttpCode(200)
  vk(@Body() body: unknown, @Req() request: FastifyRequest) {
    return this.webhooks.acceptVk(body, request.ip);
  }
}

@Public()
@Controller("ai/bots")
export class LegacyIntegrationWebhooksController {
  constructor(
    @Inject(IntegrationWebhookService)
    private readonly webhooks: IntegrationWebhookService,
  ) {}

  @Post("telegram/webhook")
  @HttpCode(200)
  async telegram(
    @Body() body: unknown,
    @Headers("x-telegram-bot-api-secret-token") secret: string | undefined,
    @Req() request: FastifyRequest,
  ) {
    await this.webhooks.acceptTelegram(body, secret, request.ip);
    return { ok: true };
  }

  @Post("vk/webhook")
  @HttpCode(200)
  vk(@Body() body: unknown, @Req() request: FastifyRequest) {
    return this.webhooks.acceptVk(body, request.ip);
  }
}

@Public()
@Controller("internal/integrations")
export class InternalIntegrationsController {
  constructor(
    @Inject(IntegrationInternalAuthService)
    private readonly auth: IntegrationInternalAuthService,
    @Inject(IntegrationProcessingService)
    private readonly processing: IntegrationProcessingService,
  ) {}

  @Post("process")
  @HttpCode(200)
  process(
    @Body() body: unknown,
    @Headers("x-correlation-id") correlationId: string | undefined,
    @Headers("x-notes-timestamp") timestamp: string | undefined,
    @Headers("x-notes-signature") signature: string | undefined,
  ) {
    this.auth.verify(body, timestamp, signature);
    if (!isIntegrationEventJob(body)) {
      throw new BadRequestException("Invalid integration event job");
    }
    if (correlationId !== body.correlationId) {
      throw new ForbiddenException("Invalid integration correlation ID");
    }
    return this.processing.process(body);
  }
}
