import { randomUUID } from "node:crypto";

import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from "@nestjs/common";
import {
  aiModelCatalog,
  aiProviderModels,
  aiUsageLogs,
  aiUserSettings,
} from "@notes/db";
import { and, eq, gte, sql } from "drizzle-orm";

import { DatabaseService } from "../database/database.service.js";
import { EntitlementsService } from "../entitlements/entitlements.service.js";
import type { ResponsesUsage } from "./responses-provider.service.js";

const RESERVATION_TTL_MS = 15 * 60 * 1000;

interface UsageReservationInput {
  conversationId: number;
  estimatedInputTokens: number;
  maxOutputTokens: number;
  messageId: number;
  model: string;
  promptVersionId: number | null;
  providerName: string;
  userId: number;
}

export interface UsageReservation {
  id: number;
  requestId: string;
}

interface UsagePrices {
  cachedInputPricePer1m: number | null;
  inputPricePer1m: number | null;
  outputPricePer1m: number | null;
}

export function calculateUsageCosts(
  usage: ResponsesUsage,
  prices: UsagePrices,
) {
  const cachedTokens = Math.min(usage.cachedInputTokens, usage.inputTokens);
  const regularInputTokens = usage.inputTokens - cachedTokens;
  const inputCost =
    (regularInputTokens * (prices.inputPricePer1m ?? 0)) / 1_000_000;
  const cachedInputCost =
    (cachedTokens *
      (prices.cachedInputPricePer1m ?? prices.inputPricePer1m ?? 0)) /
    1_000_000;
  const outputCost =
    (usage.outputTokens * (prices.outputPricePer1m ?? 0)) / 1_000_000;
  const round = (value: number) => Math.round(value * 1e8) / 1e8;
  return {
    cachedInputCost: round(cachedInputCost),
    inputCost: round(inputCost),
    outputCost: round(outputCost),
    totalCost: round(inputCost + cachedInputCost + outputCost),
  };
}

@Injectable()
export class AiUsageService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(EntitlementsService)
    private readonly entitlements: EntitlementsService,
  ) {}

  async reserve(input: UsageReservationInput): Promise<UsageReservation> {
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);
    const requestedTokens = Math.min(
      2_147_483_647,
      Math.max(1, input.estimatedInputTokens) +
        Math.max(1, input.maxOutputTokens),
    );
    return this.database.client.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(71007, ${input.userId})`,
      );
      await this.entitlements.assertAiUsage(input.userId, requestedTokens, tx);
      const [settings] = await tx
        .select({
          dailyRequestLimit: aiUserSettings.dailyRequestLimit,
          dailyTokenLimit: aiUserSettings.dailyTokenLimit,
          enabled: aiUserSettings.enabled,
        })
        .from(aiUserSettings)
        .where(eq(aiUserSettings.userId, input.userId))
        .limit(1);
      if (settings && !settings.enabled) {
        throw new ForbiddenException("AI is disabled in user settings");
      }
      const [usage] = await tx
        .select({
          requests: sql<number>`count(*)::int`.mapWith(Number),
          tokens:
            sql<number>`coalesce(sum(${aiUsageLogs.inputTokens} + ${aiUsageLogs.outputTokens} + case when ${aiUsageLogs.reservationExpiresAt} > ${now} then ${aiUsageLogs.reservedTokens} else 0 end), 0)::int`.mapWith(
              Number,
            ),
        })
        .from(aiUsageLogs)
        .where(
          and(
            eq(aiUsageLogs.userId, input.userId),
            gte(aiUsageLogs.createdAt, dayStart),
          ),
        );
      if (
        settings?.dailyRequestLimit &&
        (usage?.requests ?? 0) >= settings.dailyRequestLimit
      ) {
        throw new HttpException(
          "Daily AI request limit reached",
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      if (
        settings?.dailyTokenLimit &&
        (usage?.tokens ?? 0) + requestedTokens > settings.dailyTokenLimit
      ) {
        throw new HttpException(
          "Daily AI token limit reached",
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      const requestId = randomUUID();
      const [created] = await tx
        .insert(aiUsageLogs)
        .values({
          conversationId: input.conversationId,
          messageId: input.messageId,
          model: input.model,
          promptVersionId: input.promptVersionId,
          providerName: input.providerName,
          requestId,
          requestKind: "response",
          reservationExpiresAt: new Date(now.getTime() + RESERVATION_TTL_MS),
          reservedTokens: requestedTokens,
          status: "started",
          userId: input.userId,
        })
        .returning({ id: aiUsageLogs.id });
      if (!created) throw new Error("AI usage reservation insert failed");
      return { id: created.id, requestId };
    });
  }

  async markStreaming(
    userId: number,
    id: number,
    model: string,
    providerResponseId: string,
  ): Promise<void> {
    await this.database.client
      .update(aiUsageLogs)
      .set({
        model,
        providerRequestId: providerResponseId,
        status: "streaming",
      })
      .where(and(eq(aiUsageLogs.id, id), eq(aiUsageLogs.userId, userId)));
  }

  async complete(
    userId: number,
    id: number,
    providerName: string,
    model: string,
    providerResponseId: string,
    usage: ResponsesUsage,
    latencyMs: number,
    timeToFirstTokenMs: number | null,
  ) {
    const prices = await this.prices(userId, providerName, model);
    const costs = calculateUsageCosts(usage, prices);
    const now = new Date();
    await this.database.client
      .update(aiUsageLogs)
      .set({
        cachedInputCost: costs.cachedInputCost,
        cachedInputTokens: Math.min(usage.cachedInputTokens, usage.inputTokens),
        completedAt: now,
        inputCost: costs.inputCost,
        inputTokens: usage.inputTokens,
        latencyMs,
        model,
        outputCost: costs.outputCost,
        outputTokens: usage.outputTokens,
        providerRequestId: providerResponseId,
        reasoningTokens: usage.reasoningTokens,
        reservationReleasedAt: now,
        reservedTokens: 0,
        status: "succeeded",
        timeToFirstTokenMs,
        toolCallCount: usage.toolCallCount,
        totalCost: costs.totalCost,
      })
      .where(and(eq(aiUsageLogs.id, id), eq(aiUsageLogs.userId, userId)));
    return { ...costs, currency: "USD", ...usage };
  }

  async fail(
    userId: number,
    id: number,
    code: string,
    latencyMs: number,
    providerResponseId: string | null,
  ): Promise<void> {
    const now = new Date();
    await this.database.client
      .update(aiUsageLogs)
      .set({
        completedAt: now,
        errorCode: code,
        latencyMs,
        ...(providerResponseId
          ? { providerRequestId: providerResponseId }
          : {}),
        reservationReleasedAt: now,
        reservedTokens: 0,
        status: "failed",
      })
      .where(and(eq(aiUsageLogs.id, id), eq(aiUsageLogs.userId, userId)));
  }

  private async prices(
    userId: number,
    providerName: string,
    model: string,
  ): Promise<UsagePrices> {
    const [provider] = await this.database.client
      .select({
        cachedInputPricePer1m: aiProviderModels.cachedInputPricePer1m,
        inputPricePer1m: aiProviderModels.inputPricePer1m,
        outputPricePer1m: aiProviderModels.outputPricePer1m,
      })
      .from(aiProviderModels)
      .where(
        and(
          eq(aiProviderModels.userId, userId),
          eq(aiProviderModels.providerName, providerName),
          eq(aiProviderModels.modelId, model),
        ),
      )
      .limit(1);
    if (provider) return provider;
    const [catalog] = await this.database.client
      .select({
        cachedInputPricePer1m: aiModelCatalog.cachedInputPricePer1m,
        inputPricePer1m: aiModelCatalog.inputPricePer1m,
        outputPricePer1m: aiModelCatalog.outputPricePer1m,
      })
      .from(aiModelCatalog)
      .where(eq(aiModelCatalog.modelId, model))
      .limit(1);
    return (
      catalog ?? {
        cachedInputPricePer1m: null,
        inputPricePer1m: null,
        outputPricePer1m: null,
      }
    );
  }
}
