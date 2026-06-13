import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { nowIso } from '../database/db.util';
import { AiModelCatalogEntity } from '../database/entities/ai.entity';
import { getAiModelPricing, type AiModelPricing } from './ai-pricing';
import type { AiModelResponse, AiModelSignal, AiModelTier } from './ai.types';

type ModelCatalogSignal = Partial<
  Pick<
    AiModelResponse,
    | 'tier'
    | 'quality'
    | 'speed'
    | 'cost'
    | 'score'
    | 'speedScore'
    | 'valueScore'
    | 'sortRank'
    | 'capabilities'
    | 'inputPricePer1M'
    | 'cachedInputPricePer1M'
    | 'outputPricePer1M'
  >
>;

type CatalogEntryInput = ModelCatalogSignal & {
  modelId: string;
  label?: unknown;
  deprecated?: unknown;
};

export interface AiModelClassification {
  tier: AiModelTier;
  quality: AiModelSignal;
  speed: AiModelSignal;
  cost: AiModelSignal;
  score: number;
  speedScore: number;
  valueScore: number;
  sortRank: number;
}

interface RemoteCatalogEntry {
  id?: unknown;
  modelId?: unknown;
  label?: unknown;
  tier?: unknown;
  quality?: unknown;
  speed?: unknown;
  cost?: unknown;
  score?: unknown;
  speedScore?: unknown;
  valueScore?: unknown;
  sortRank?: unknown;
  capabilities?: unknown;
  inputPricePer1M?: unknown;
  cachedInputPricePer1M?: unknown;
  outputPricePer1M?: unknown;
  deprecated?: unknown;
}

const catalogSyncIntervalMs = 24 * 60 * 60 * 1000;
const sortRankMultiplier = 1_000_000_000;

const builtinCatalog: Record<string, ModelCatalogSignal> = {
  'gpt-5.2-pro': { score: 99, speedScore: 62, valueScore: 54, sortRank: 5220 },
  'gpt-5.2': { score: 97, speedScore: 70, valueScore: 62, sortRank: 5200 },
  'gpt-5.1-codex-max': { score: 96, speedScore: 63, valueScore: 58, sortRank: 5160 },
  'gpt-5.1-codex-mini': { score: 84, speedScore: 86, valueScore: 78, sortRank: 5155 },
  'gpt-5.1-codex': { score: 94, speedScore: 68, valueScore: 60, sortRank: 5150 },
  'gpt-5.1': { score: 94, speedScore: 72, valueScore: 66, sortRank: 5100 },
  'gpt-5-pro': { score: 96, speedScore: 58, valueScore: 52, sortRank: 5020 },
  'gpt-5-mini': { score: 82, speedScore: 88, valueScore: 82, sortRank: 5010 },
  'gpt-5-nano': { score: 68, speedScore: 98, valueScore: 88, sortRank: 5005 },
  'gpt-5': { score: 91, speedScore: 74, valueScore: 68, sortRank: 5000 },
  'gpt-4.5': { score: 88, speedScore: 55, valueScore: 46, sortRank: 4500 },
  'gpt-4.1-nano': { score: 56, speedScore: 97, valueScore: 88, sortRank: 4105 },
  'gpt-4.1-mini': { score: 72, speedScore: 91, valueScore: 84, sortRank: 4110 },
  'gpt-4.1': { score: 83, speedScore: 76, valueScore: 72, sortRank: 4100 },
  'gpt-4o-mini': { score: 66, speedScore: 92, valueScore: 86, sortRank: 4060 },
  'gpt-4o': { score: 78, speedScore: 82, valueScore: 74, sortRank: 4050 },
  'gpt-4-turbo': { score: 70, speedScore: 64, valueScore: 48, sortRank: 4010 },
  'gpt-4': { score: 64, speedScore: 48, valueScore: 36, sortRank: 4000 },
  'gpt-3.5-turbo': { score: 40, speedScore: 86, valueScore: 70, sortRank: 3500 },
  'o4-mini': { score: 74, speedScore: 84, valueScore: 82, sortRank: 4040 },
  'o3-pro': { score: 89, speedScore: 44, valueScore: 38, sortRank: 3035 },
  'o3-mini': { score: 58, speedScore: 82, valueScore: 74, sortRank: 3031 },
  o3: { score: 82, speedScore: 58, valueScore: 54, sortRank: 3030 },
  'o1-pro': { score: 78, speedScore: 38, valueScore: 32, sortRank: 1015 },
  'o1-mini': { score: 48, speedScore: 78, valueScore: 68, sortRank: 1011 },
  o1: { score: 70, speedScore: 48, valueScore: 42, sortRank: 1010 },
  'gpt-oss-120b': { tier: 'free', score: 76, speedScore: 70, valueScore: 90, sortRank: 1200 },
  'gpt-oss-20b': { tier: 'free', score: 52, speedScore: 88, valueScore: 92, sortRank: 200 },
};

@Injectable()
export class AiModelCatalogService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiModelCatalogService.name);
  private syncInterval: NodeJS.Timeout | null = null;
  private readonly signalCache = new Map<string, ModelCatalogSignal | null>();
  private catalogRowsCache: AiModelCatalogEntity[] = [];
  private catalogByModelId = new Map<string, ModelCatalogSignal>();

  constructor(
    @InjectRepository(AiModelCatalogEntity)
    private readonly catalogRepo: Repository<AiModelCatalogEntity>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedBuiltinCatalog();
    this.syncInterval = setInterval(() => void this.syncFromConfiguredUrl(), catalogSyncIntervalMs);
    this.syncInterval.unref?.();
    void this.syncFromConfiguredUrl();
  }

  onModuleDestroy(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  findSignal(modelId: string): ModelCatalogSignal | null {
    const normalized = this.normalizeModelId(modelId);
    const cached = this.signalCache.get(normalized);

    if (cached !== undefined) {
      return cached;
    }

    const exact = this.catalogByModelId.get(normalized) ?? null;
    const matchedRow = exact ? null : this.findMatchingCatalogRow(normalized);
    const signal = exact ?? (matchedRow ? this.mapRow(matchedRow) : null);
    this.signalCache.set(normalized, signal);
    return signal;
  }

  getPricing(modelId: string): AiModelPricing {
    const signal = this.findSignal(modelId);
    const fallback = getAiModelPricing(modelId);

    return {
      inputPricePer1M: this.readNumber(signal?.inputPricePer1M) ?? fallback.inputPricePer1M,
      cachedInputPricePer1M:
        this.readNumber(signal?.cachedInputPricePer1M) ?? fallback.cachedInputPricePer1M,
      outputPricePer1M: this.readNumber(signal?.outputPricePer1M) ?? fallback.outputPricePer1M,
    };
  }

  classifyModel(modelId: string): AiModelClassification {
    const lowerModelId = modelId.toLowerCase();
    const known = this.findSignal(lowerModelId);
    const score = known?.score ?? this.estimateModelScore(lowerModelId);
    const speedScore = known?.speedScore ?? this.estimateSpeedScore(lowerModelId);
    const valueScore = known?.valueScore ?? this.estimateValueScore(lowerModelId, speedScore);

    return {
      tier: known?.tier ?? this.estimateTier(lowerModelId),
      quality: known?.quality ?? this.signalFromScore(score),
      speed: known?.speed ?? this.signalFromScore(speedScore),
      cost: known?.cost ?? (valueScore >= 78 ? 'low' : valueScore >= 55 ? 'medium' : 'high'),
      score,
      speedScore,
      valueScore,
      sortRank: known?.sortRank ?? this.estimateSortRank(lowerModelId),
    };
  }

  createSortRank(modelId: string, baseSortRank: number, providerCreatedAt: number | null): number {
    return (
      baseSortRank * sortRankMultiplier +
      (providerCreatedAt ?? this.extractDateRankFromModelId(modelId) ?? 0)
    );
  }

  normalizeProviderCreatedAt(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      return null;
    }

    return Math.trunc(value);
  }

  async syncFromConfiguredUrl(): Promise<void> {
    const url = process.env.AI_MODEL_CATALOG_URL?.trim();
    if (!url) {
      return;
    }

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) {
        throw new Error(`catalog returned ${response.status}`);
      }

      const payload = (await response.json()) as unknown;
      const entries = this.readRemoteEntries(payload);
      if (entries.length > 0) {
        await this.upsertEntries(entries, 'remote');
      }
    } catch (caught) {
      this.logger.warn(`AI model catalog sync failed: ${(caught as Error).message}`);
    }
  }

  private async seedBuiltinCatalog(): Promise<void> {
    const entries = Object.entries(builtinCatalog).map(([modelId, signal]) => ({
      modelId,
      ...signal,
    }));
    await this.upsertEntries(entries, 'builtin');
  }

  private async upsertEntries(entries: CatalogEntryInput[], source: string): Promise<void> {
    const now = nowIso();
    const values = entries.map((entry) => {
      const modelId = this.normalizeModelId(entry.modelId);
      const pricing = getAiModelPricing(modelId);
      return {
        model_id: modelId,
        label: this.readString(entry.label) ?? modelId,
        tier: entry.tier ?? 'unknown',
        quality: entry.quality ?? 'unknown',
        speed: entry.speed ?? 'unknown',
        cost: entry.cost ?? 'unknown',
        score: entry.score ?? 50,
        speed_score: entry.speedScore ?? 50,
        value_score: entry.valueScore ?? 50,
        sort_rank: entry.sortRank ?? 0,
        input_price_per_1m: this.readNumber(entry.inputPricePer1M) ?? pricing.inputPricePer1M,
        cached_input_price_per_1m:
          this.readNumber(entry.cachedInputPricePer1M) ?? pricing.cachedInputPricePer1M,
        output_price_per_1m: this.readNumber(entry.outputPricePer1M) ?? pricing.outputPricePer1M,
        capabilities: JSON.stringify(entry.capabilities ?? ['chat']),
        is_deprecated: this.readBoolean(entry.deprecated) ? 1 : 0,
        source,
        last_seen_at: now,
        created_at: now,
        updated_at: now,
      };
    });

    if (values.length === 0) {
      return;
    }

    await this.catalogRepo
      .createQueryBuilder()
      .insert()
      .into(AiModelCatalogEntity)
      .values(values)
      .orUpdate(
        [
          'label',
          'tier',
          'quality',
          'speed',
          'cost',
          'score',
          'speed_score',
          'value_score',
          'sort_rank',
          'input_price_per_1m',
          'cached_input_price_per_1m',
          'output_price_per_1m',
          'capabilities',
          'is_deprecated',
          'source',
          'last_seen_at',
          'updated_at',
        ],
        ['model_id'],
      )
      .execute();
    await this.reloadCache();
  }

  private async reloadCache(): Promise<void> {
    const rows = await this.catalogRepo.find();
    this.catalogRowsCache = [...rows].sort((a, b) => b.model_id.length - a.model_id.length);
    this.catalogByModelId = new Map(rows.map((row) => [row.model_id, this.mapRow(row)]));
    this.signalCache.clear();
  }

  private findMatchingCatalogRow(modelId: string): AiModelCatalogEntity | null {
    return (
      this.catalogRowsCache.find((row) => this.isKnownModelMatch(modelId, row.model_id)) ?? null
    );
  }

  private mapRow(row: AiModelCatalogEntity): ModelCatalogSignal {
    return {
      tier: row.tier as AiModelTier,
      quality: row.quality as AiModelSignal,
      speed: row.speed as AiModelSignal,
      cost: row.cost as AiModelSignal,
      score: row.score,
      speedScore: row.speed_score,
      valueScore: row.value_score,
      sortRank: row.sort_rank,
      inputPricePer1M: row.input_price_per_1m ?? undefined,
      cachedInputPricePer1M: row.cached_input_price_per_1m ?? undefined,
      outputPricePer1M: row.output_price_per_1m ?? undefined,
      capabilities: this.parseCapabilities(row.capabilities),
    };
  }

  private readRemoteEntries(payload: unknown): CatalogEntryInput[] {
    const list =
      payload && typeof payload === 'object' && 'models' in payload
        ? (payload as { models?: unknown }).models
        : payload;
    if (!Array.isArray(list)) {
      return [];
    }

    return list
      .map((entry): CatalogEntryInput | null => {
        if (!entry || typeof entry !== 'object') {
          return null;
        }

        const record = entry as RemoteCatalogEntry;
        const modelId = this.readString(record.modelId) ?? this.readString(record.id);
        return modelId
          ? {
              modelId,
              label: record.label,
              tier: this.readTier(record.tier),
              quality: this.readSignal(record.quality),
              speed: this.readSignal(record.speed),
              cost: this.readSignal(record.cost),
              score: this.readNumber(record.score) ?? undefined,
              speedScore: this.readNumber(record.speedScore) ?? undefined,
              valueScore: this.readNumber(record.valueScore) ?? undefined,
              sortRank: this.readNumber(record.sortRank) ?? undefined,
              capabilities: this.readStringArray(record.capabilities),
              inputPricePer1M: this.readNumber(record.inputPricePer1M) ?? undefined,
              cachedInputPricePer1M: this.readNumber(record.cachedInputPricePer1M) ?? undefined,
              outputPricePer1M: this.readNumber(record.outputPricePer1M) ?? undefined,
              deprecated: record.deprecated,
            }
          : null;
      })
      .filter((entry): entry is CatalogEntryInput => Boolean(entry));
  }

  private parseCapabilities(value: string): string[] {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string')
        : [];
    } catch {
      return [];
    }
  }

  private isKnownModelMatch(modelId: string, knownId: string): boolean {
    return (
      modelId === knownId ||
      modelId.startsWith(`${knownId}-`) ||
      modelId.startsWith(`${knownId}:`) ||
      modelId.startsWith(`${knownId}/`)
    );
  }

  private normalizeModelId(modelId: string): string {
    return modelId.trim().toLowerCase().split('/').pop() ?? modelId.trim().toLowerCase();
  }

  private estimateTier(modelId: string): AiModelTier {
    if (modelId.includes(':free') || modelId.includes('-free') || modelId.includes('free')) {
      return 'free';
    }

    if (/^(gpt-|o\d|chatgpt-|computer-use|codex)/.test(modelId)) {
      return 'paid';
    }

    return 'unknown';
  }

  private estimateModelScore(modelId: string): number {
    if (modelId.includes('gpt-5')) {
      return modelId.includes('nano') ? 68 : modelId.includes('mini') ? 82 : 90;
    }

    if (modelId.includes('gpt-4.1')) {
      return modelId.includes('nano') ? 56 : modelId.includes('mini') ? 72 : 83;
    }

    if (modelId.includes('gpt-4o')) {
      return modelId.includes('mini') ? 66 : 78;
    }

    if (modelId.startsWith('o4')) {
      return 74;
    }

    if (modelId.startsWith('o3')) {
      return modelId.includes('mini') ? 58 : 82;
    }

    if (modelId.startsWith('o1')) {
      return modelId.includes('mini') ? 48 : 70;
    }

    return 50;
  }

  private estimateSpeedScore(modelId: string): number {
    if (modelId.includes('nano')) {
      return 98;
    }

    if (modelId.includes('mini')) {
      return 88;
    }

    if (modelId.includes('pro')) {
      return 46;
    }

    if (modelId.includes('turbo')) {
      return 78;
    }

    return 68;
  }

  private estimateValueScore(modelId: string, speedScore: number): number {
    if (modelId.includes('nano')) {
      return 88;
    }

    if (modelId.includes('mini')) {
      return 82;
    }

    if (modelId.includes('pro')) {
      return 36;
    }

    if (modelId.includes('turbo')) {
      return 62;
    }

    return Math.max(
      35,
      Math.min(82, Math.round((speedScore + this.estimateModelScore(modelId)) / 2 - 8)),
    );
  }

  private estimateSortRank(modelId: string): number {
    const gptMatch = modelId.match(/gpt-(\d)(?:\.(\d))?(?:\.(\d))?/);

    if (gptMatch) {
      const major = Number(gptMatch[1] ?? 0);
      const minor = Number(gptMatch[2] ?? 0);
      const patch = Number(gptMatch[3] ?? 0);
      const sizeBonus = modelId.includes('pro')
        ? 20
        : modelId.includes('mini')
          ? 10
          : modelId.includes('nano')
            ? 5
            : 0;

      return major * 1000 + minor * 100 + patch * 10 + sizeBonus;
    }

    const reasoningMatch = modelId.match(/^o(\d)/);

    if (reasoningMatch) {
      return Number(reasoningMatch[1]) * 1000 + (modelId.includes('mini') ? 10 : 20);
    }

    return 0;
  }

  private extractDateRankFromModelId(modelId: string): number | null {
    const dateMatch = modelId.match(/(?:^|[-_])(\d{4})[-_]?(\d{2})[-_]?(\d{2})(?:$|[-_])/);

    if (!dateMatch) {
      return null;
    }

    return Number(`${dateMatch[1]}${dateMatch[2]}${dateMatch[3]}`);
  }

  private signalFromScore(score: number): AiModelSignal {
    if (score >= 75) {
      return 'high';
    }

    if (score >= 50) {
      return 'medium';
    }

    return 'low';
  }

  private readString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private readTier(value: unknown): AiModelResponse['tier'] | undefined {
    const tier = this.readString(value);
    return tier === 'free' || tier === 'paid' || tier === 'unknown' ? tier : undefined;
  }

  private readSignal(value: unknown): AiModelResponse['quality'] | undefined {
    const signal = this.readString(value);
    return signal === 'low' || signal === 'medium' || signal === 'high' || signal === 'unknown'
      ? signal
      : undefined;
  }

  private readNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private readBoolean(value: unknown): boolean {
    return value === true || value === 1 || value === 'true';
  }

  private readStringArray(value: unknown): string[] | undefined {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : undefined;
  }
}
