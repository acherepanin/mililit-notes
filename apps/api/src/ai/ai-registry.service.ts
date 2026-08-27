import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  aiAuditLogs,
  aiModelCatalog,
  aiModelRoutes,
  aiProviderModels,
  aiProviderSettings,
  aiUsageLogs,
  users,
} from "@notes/db";
import { and, asc, desc, eq, sql } from "drizzle-orm";

import { DatabaseService } from "../database/database.service.js";
import type {
  AiModelRole,
  CreateProviderInput,
  ModelRouteInput,
  UpdateProviderInput,
} from "./ai.types.js";
import { AiSecretCryptoService } from "./ai-secret-crypto.service.js";
import { ProviderEndpointPolicyService } from "./provider-endpoint-policy.service.js";
import {
  AiProviderError,
  ResponsesProviderService,
} from "./responses-provider.service.js";

function databaseCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error
    ? String(error.code)
    : undefined;
}

type ProviderRow = typeof aiProviderSettings.$inferSelect;

function modelCapabilities(model: string): string[] {
  const id = model.toLowerCase();
  const capabilities = new Set<string>(["text", "streaming"]);
  if (/gpt-4o|gpt-5|vision|gemini|claude|sonnet|opus/.test(id)) {
    capabilities.add("vision");
  }
  if (/gpt-5|(^|[-_.])o[134]($|[-_.])|reason|thinking|deepseek-r/.test(id)) {
    capabilities.add("reasoning");
  }
  if (/audio|realtime|voice/.test(id)) capabilities.add("audio");
  if (/transcri|whisper/.test(id)) capabilities.add("transcription");
  if (/tts|speech/.test(id)) capabilities.add("speech");
  if (/embed/.test(id)) capabilities.add("embedding");
  return [...capabilities];
}

@Injectable()
export class AiRegistryService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AiSecretCryptoService)
    private readonly secrets: AiSecretCryptoService,
    @Inject(ProviderEndpointPolicyService)
    private readonly endpoints: ProviderEndpointPolicyService,
    @Inject(ResponsesProviderService)
    private readonly responses: ResponsesProviderService,
  ) {}

  async listProviders(userId: number) {
    const rows = await this.database.client
      .select()
      .from(aiProviderSettings)
      .where(eq(aiProviderSettings.userId, userId))
      .orderBy(desc(aiProviderSettings.updatedAt), desc(aiProviderSettings.id));
    return rows.map((row) => this.mapProvider(row));
  }

  async createProvider(userId: number, input: CreateProviderInput) {
    const baseUrl = this.endpoints.normalize(input.baseUrl);
    const now = new Date();
    try {
      const created = await this.database.client.transaction(async (tx) => {
        const [row] = await tx
          .insert(aiProviderSettings)
          .values({
            ...(input.apiKey
              ? {
                  apiKeyEncrypted: this.secrets.encrypt(input.apiKey),
                  apiKeyHint: this.secrets.hint(input.apiKey),
                  apiKeyUpdatedAt: now,
                }
              : {}),
            baseUrl,
            model: input.model,
            providerName: input.providerName,
            userId,
          })
          .returning();
        if (!row) throw new Error("AI provider insert did not return a row");
        await tx.insert(aiAuditLogs).values({
          action: "ai.providers.create",
          details: { baseUrl, providerName: input.providerName },
          targetId: row.id,
          targetType: "ai_provider",
          userId,
        });
        return row;
      });
      return this.mapProvider(created);
    } catch (error) {
      if (databaseCode(error) === "23505") {
        throw new ConflictException("This AI provider is already configured");
      }
      throw error;
    }
  }

  async updateProvider(userId: number, id: number, input: UpdateProviderInput) {
    try {
      const updated = await this.database.client.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(aiProviderSettings)
          .where(
            and(
              eq(aiProviderSettings.id, id),
              eq(aiProviderSettings.userId, userId),
            ),
          )
          .for("update")
          .limit(1);
        if (!existing) throw new NotFoundException("AI provider was not found");
        const now = new Date();
        const [row] = await tx
          .update(aiProviderSettings)
          .set({
            ...(input.providerName !== undefined
              ? { providerName: input.providerName }
              : {}),
            ...(input.baseUrl !== undefined
              ? { baseUrl: this.endpoints.normalize(input.baseUrl) }
              : {}),
            ...(input.model !== undefined ? { model: input.model } : {}),
            ...(input.apiKey
              ? {
                  apiKeyEncrypted: this.secrets.encrypt(input.apiKey),
                  apiKeyHint: this.secrets.hint(input.apiKey),
                  apiKeyUpdatedAt: now,
                }
              : {}),
            ...(input.clearApiKey
              ? {
                  apiKeyEncrypted: null,
                  apiKeyHint: null,
                  apiKeyUpdatedAt: now,
                }
              : {}),
            updatedAt: now,
          })
          .where(
            and(
              eq(aiProviderSettings.id, id),
              eq(aiProviderSettings.userId, userId),
            ),
          )
          .returning();
        if (!row) throw new NotFoundException("AI provider was not found");
        await tx.insert(aiAuditLogs).values({
          action: "ai.providers.update",
          details: {
            apiKeyChanged: Boolean(input.apiKey || input.clearApiKey),
          },
          targetId: id,
          targetType: "ai_provider",
          userId,
        });
        return row;
      });
      return this.mapProvider(updated);
    } catch (error) {
      if (databaseCode(error) === "23505") {
        throw new ConflictException("This AI provider is already configured");
      }
      throw error;
    }
  }

  async deleteProvider(userId: number, id: number) {
    const removed = await this.database.client.transaction(async (tx) => {
      const [row] = await tx
        .delete(aiProviderSettings)
        .where(
          and(
            eq(aiProviderSettings.id, id),
            eq(aiProviderSettings.userId, userId),
          ),
        )
        .returning({ id: aiProviderSettings.id });
      if (!row) throw new NotFoundException("AI provider was not found");
      await tx.insert(aiAuditLogs).values({
        action: "ai.providers.delete",
        details: {},
        targetId: id,
        targetType: "ai_provider",
        userId,
      });
      return row;
    });
    return { deleted: true, id: removed.id };
  }

  async listModelRoutes(userId: number) {
    const rows = await this.database.client
      .select()
      .from(aiModelRoutes)
      .where(eq(aiModelRoutes.userId, userId))
      .orderBy(asc(aiModelRoutes.role), asc(aiModelRoutes.id));
    return rows.map((row) => ({
      enabled: row.enabled,
      fallbackModels: row.fallbackModels,
      id: row.id,
      maxOutputTokens: row.maxOutputTokens,
      model: row.model,
      providerSettingId: row.providerSettingId,
      reasoningEffort: row.reasoningEffort,
      role: row.role,
      temperature: row.temperature,
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async listAvailableModels(userId: number) {
    const models = await this.database.client
      .select()
      .from(aiProviderModels)
      .where(
        and(
          eq(aiProviderModels.userId, userId),
          eq(aiProviderModels.isDeprecated, false),
        ),
      )
      .orderBy(
        desc(aiProviderModels.providerCreatedAt),
        desc(aiProviderModels.lastSeenAt),
        asc(aiProviderModels.modelId),
      )
      .limit(40);
    const result = new Map(
      models.map((model) => [
        model.modelId,
        {
          capabilities: model.capabilities,
          id: model.modelId,
          label: model.label,
          providerName: model.providerName,
        },
      ]),
    );
    return [...result.values()].slice(0, 40);
  }

  async listProviderModels(userId: number, providerId: number) {
    const provider = await this.providerForUser(userId, providerId);
    return this.database.client
      .select({
        capabilities: aiProviderModels.capabilities,
        cachedInputPricePer1m: sql<
          number | null
        >`coalesce(${aiProviderModels.cachedInputPricePer1m}, ${aiModelCatalog.cachedInputPricePer1m})`,
        cost: sql<string>`coalesce(nullif(${aiProviderModels.cost}, 'unknown'), ${aiModelCatalog.cost}, 'unknown')`,
        id: aiProviderModels.modelId,
        inputPricePer1m: sql<
          number | null
        >`coalesce(${aiProviderModels.inputPricePer1m}, ${aiModelCatalog.inputPricePer1m})`,
        label: aiProviderModels.label,
        outputPricePer1m: sql<
          number | null
        >`coalesce(${aiProviderModels.outputPricePer1m}, ${aiModelCatalog.outputPricePer1m})`,
        providerCreatedAt: aiProviderModels.providerCreatedAt,
        quality: sql<string>`coalesce(nullif(${aiProviderModels.quality}, 'unknown'), ${aiModelCatalog.quality}, 'unknown')`,
        speed: sql<string>`coalesce(nullif(${aiProviderModels.speed}, 'unknown'), ${aiModelCatalog.speed}, 'unknown')`,
        tier: sql<string>`coalesce(nullif(${aiProviderModels.tier}, 'unknown'), ${aiModelCatalog.tier}, 'unknown')`,
      })
      .from(aiProviderModels)
      .leftJoin(
        aiModelCatalog,
        eq(aiModelCatalog.modelId, aiProviderModels.modelId),
      )
      .where(
        and(
          eq(aiProviderModels.userId, userId),
          eq(aiProviderModels.providerName, provider.providerName),
          eq(aiProviderModels.isDeprecated, false),
        ),
      )
      .orderBy(
        desc(aiProviderModels.providerCreatedAt),
        asc(aiProviderModels.modelId),
      )
      .limit(100);
  }

  async syncProviderModels(userId: number, providerId: number) {
    const provider = await this.providerForUser(userId, providerId);
    if (!provider.apiKeyEncrypted) {
      throw new BadRequestException("AI provider key is not configured");
    }
    const now = new Date();
    try {
      const models = await this.responses.listModels({
        apiKey: this.secrets.decrypt(provider.apiKeyEncrypted),
        baseUrl: provider.baseUrl,
        providerName: provider.providerName,
      });
      if (models.length === 0) {
        throw new AiProviderError("provider_models_empty", false);
      }
      await this.database.client.transaction(async (tx) => {
        await tx
          .update(aiProviderModels)
          .set({ isDeprecated: true, updatedAt: now })
          .where(
            and(
              eq(aiProviderModels.userId, userId),
              eq(aiProviderModels.providerName, provider.providerName),
            ),
          );
        await tx
          .insert(aiProviderModels)
          .values(
            models.map((model) => ({
              capabilities: modelCapabilities(model.id),
              isDeprecated: false,
              label: model.id,
              lastSeenAt: now,
              modelId: model.id,
              providerCreatedAt: model.createdAt,
              providerName: provider.providerName,
              userId,
            })),
          )
          .onConflictDoUpdate({
            set: {
              isDeprecated: false,
              lastSeenAt: now,
              updatedAt: now,
            },
            target: [
              aiProviderModels.userId,
              aiProviderModels.providerName,
              aiProviderModels.modelId,
            ],
          });
        await tx
          .update(aiProviderSettings)
          .set({
            lastModelsSyncAt: now,
            modelsSyncError: null,
            modelsSyncStatus: "success",
            updatedAt: now,
          })
          .where(eq(aiProviderSettings.id, providerId));
        await tx.insert(aiAuditLogs).values({
          action: "ai.providers.models.sync",
          details: { count: models.length },
          targetId: providerId,
          targetType: "ai_provider",
          userId,
        });
      });
      return this.listProviderModels(userId, providerId);
    } catch (error) {
      const code =
        error instanceof AiProviderError ? error.code : "models_sync_failed";
      await this.database.client
        .update(aiProviderSettings)
        .set({
          lastModelsSyncAt: now,
          modelsSyncError: code,
          modelsSyncStatus: "failed",
          updatedAt: now,
        })
        .where(
          and(
            eq(aiProviderSettings.id, providerId),
            eq(aiProviderSettings.userId, userId),
          ),
        );
      throw new ServiceUnavailableException(
        "Не удалось получить актуальный список моделей провайдера",
      );
    }
  }

  async usageSummary(userId: number) {
    const [summary] = await this.database.client
      .select({
        cachedInputTokens: sql<string>`coalesce(sum(${aiUsageLogs.cachedInputTokens}), 0)`,
        inputTokens: sql<string>`coalesce(sum(${aiUsageLogs.inputTokens}), 0)`,
        outputTokens: sql<string>`coalesce(sum(${aiUsageLogs.outputTokens}), 0)`,
        requests: sql<string>`count(*)`,
        totalCost: sql<string>`coalesce(sum(${aiUsageLogs.totalCost}), 0)`,
      })
      .from(aiUsageLogs)
      .where(eq(aiUsageLogs.userId, userId));
    return {
      cachedInputTokens: Number(summary?.cachedInputTokens ?? 0),
      inputTokens: Number(summary?.inputTokens ?? 0),
      outputTokens: Number(summary?.outputTokens ?? 0),
      requests: Number(summary?.requests ?? 0),
      totalCostUsd: Number(summary?.totalCost ?? 0),
    };
  }

  async resolveRoute(
    userId: number,
    role: AiModelRole,
    modelOverride?: string | null,
  ) {
    const [route] = await this.database.client
      .select()
      .from(aiModelRoutes)
      .where(
        and(
          eq(aiModelRoutes.userId, userId),
          eq(aiModelRoutes.role, role),
          eq(aiModelRoutes.enabled, true),
        ),
      )
      .limit(1);
    if (!route) {
      throw new BadRequestException(`AI model role ${role} is not configured`);
    }
    if (route.providerSettingId === null) {
      throw new BadRequestException("AI model route has no provider");
    }
    const [provider] = await this.database.client
      .select()
      .from(aiProviderSettings)
      .where(
        and(
          eq(aiProviderSettings.id, route.providerSettingId),
          eq(aiProviderSettings.userId, userId),
        ),
      )
      .limit(1);
    if (!provider?.apiKeyEncrypted) {
      throw new BadRequestException("AI provider key is not configured");
    }
    const [profile] = await this.database.client
      .select({ preferredAiModel: users.preferredAiModel })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const preferred = modelOverride ?? profile?.preferredAiModel ?? null;
    let model = route.model;
    if (preferred) {
      const allowedByRoute = [route.model, ...route.fallbackModels].includes(
        preferred,
      );
      const [available] = allowedByRoute
        ? [{ id: preferred }]
        : await this.database.client
            .select({ id: aiProviderModels.modelId })
            .from(aiProviderModels)
            .where(
              and(
                eq(aiProviderModels.userId, userId),
                eq(aiProviderModels.providerName, provider.providerName),
                eq(aiProviderModels.modelId, preferred),
                eq(aiProviderModels.isDeprecated, false),
              ),
            )
            .limit(1);
      if (available) model = preferred;
      else if (modelOverride) {
        throw new BadRequestException("Selected AI model is not available");
      }
    }
    return {
      fallbackModels: [route.model, ...route.fallbackModels].filter(
        (item, index, all) => item !== model && all.indexOf(item) === index,
      ),
      maxOutputTokens: route.maxOutputTokens,
      model,
      provider: {
        apiKey: this.secrets.decrypt(provider.apiKeyEncrypted),
        baseUrl: provider.baseUrl,
        providerName: provider.providerName,
      },
      reasoningEffort:
        route.reasoningEffort as ModelRouteInput["reasoningEffort"],
      temperature: route.temperature,
    };
  }

  private async providerForUser(userId: number, providerId: number) {
    const [provider] = await this.database.client
      .select()
      .from(aiProviderSettings)
      .where(
        and(
          eq(aiProviderSettings.id, providerId),
          eq(aiProviderSettings.userId, userId),
        ),
      )
      .limit(1);
    if (!provider) throw new NotFoundException("AI provider was not found");
    return provider;
  }

  async putModelRoute(
    userId: number,
    role: AiModelRole,
    input: ModelRouteInput,
  ) {
    const row = await this.database.client.transaction(async (tx) => {
      if (input.providerSettingId !== null) {
        const [provider] = await tx
          .select({ id: aiProviderSettings.id })
          .from(aiProviderSettings)
          .where(
            and(
              eq(aiProviderSettings.id, input.providerSettingId),
              eq(aiProviderSettings.userId, userId),
            ),
          )
          .for("share")
          .limit(1);
        if (!provider) throw new NotFoundException("AI provider was not found");
      }
      const [upserted] = await tx
        .insert(aiModelRoutes)
        .values({ ...input, role, userId })
        .onConflictDoUpdate({
          set: { ...input, updatedAt: new Date() },
          target: [aiModelRoutes.userId, aiModelRoutes.role],
        })
        .returning();
      if (!upserted) {
        throw new Error("AI model route upsert did not return a row");
      }
      await tx.insert(aiAuditLogs).values({
        action: "ai.model-routes.put",
        details: { model: input.model, role },
        targetId: upserted.id,
        targetType: "ai_model_route",
        userId,
      });
      return upserted;
    });
    return {
      enabled: row.enabled,
      fallbackModels: row.fallbackModels,
      id: row.id,
      maxOutputTokens: row.maxOutputTokens,
      model: row.model,
      providerSettingId: row.providerSettingId,
      reasoningEffort: row.reasoningEffort,
      role: row.role,
      temperature: row.temperature,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapProvider(row: ProviderRow) {
    return {
      apiKeyHint: row.apiKeyHint,
      apiKeyUpdatedAt: row.apiKeyUpdatedAt?.toISOString() ?? null,
      baseUrl: row.baseUrl,
      hasApiKey: Boolean(row.apiKeyEncrypted),
      id: row.id,
      lastConnectionCheckAt: row.lastConnectionCheckAt?.toISOString() ?? null,
      lastConnectionCheckStatus: row.lastConnectionCheckStatus,
      lastModelsSyncAt: row.lastModelsSyncAt?.toISOString() ?? null,
      model: row.model,
      modelsSyncError: row.modelsSyncError,
      modelsSyncStatus: row.modelsSyncStatus,
      providerName: row.providerName,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
