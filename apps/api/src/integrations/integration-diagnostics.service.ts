import { Inject, Injectable } from "@nestjs/common";
import { aiBotAdminSettings } from "@notes/db";
import { eq } from "drizzle-orm";
import { Api } from "grammy";
import { VK } from "vk-io";

import { DatabaseService } from "../database/database.service.js";
import { IntegrationSettingsService } from "./integration-settings.service.js";
import type { IntegrationProvider } from "./integrations.types.js";

@Injectable()
export class IntegrationDiagnosticsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(IntegrationSettingsService)
    private readonly settings: IntegrationSettingsService,
  ) {}

  async test(provider: IntegrationProvider) {
    const row = await this.settings.getAdminSettings(provider);
    const checkedAt = new Date();
    try {
      const identity =
        provider === "telegram"
          ? await this.testTelegram(row.botTokenEncrypted)
          : await this.testVk(row.accessTokenEncrypted, row.groupId);
      await this.database.client
        .update(aiBotAdminSettings)
        .set({
          lastCheckAt: checkedAt,
          lastCheckError: null,
          lastCheckStatus: "ok",
          updatedAt: checkedAt,
        })
        .where(eq(aiBotAdminSettings.provider, provider));
      return { checkedAt: checkedAt.toISOString(), identity, status: "ok" };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message.slice(0, 500)
          : "Connection failed";
      await this.database.client
        .update(aiBotAdminSettings)
        .set({
          lastCheckAt: checkedAt,
          lastCheckError: message,
          lastCheckStatus: "failed",
          updatedAt: checkedAt,
        })
        .where(eq(aiBotAdminSettings.provider, provider));
      return {
        checkedAt: checkedAt.toISOString(),
        error: message,
        status: "failed",
      };
    }
  }

  private async testTelegram(encrypted: string | null): Promise<string> {
    const token = this.settings.decryptSecret(encrypted);
    if (!token) throw new Error("Telegram bot token is not configured");
    const bot = await new Api(token).getMe();
    return bot.username ? `@${bot.username}` : String(bot.id);
  }

  private async testVk(
    encrypted: string | null,
    groupId: string | null,
  ): Promise<string> {
    const token = this.settings.decryptSecret(encrypted);
    if (!token) throw new Error("VK access token is not configured");
    if (!groupId) throw new Error("VK group id is not configured");
    const response = await new VK({ token }).api.groups.getById({
      group_id: groupId,
    });
    const group = response.groups[0];
    if (!group) throw new Error("VK group is unavailable");
    return group.name || String(group.id);
  }
}
