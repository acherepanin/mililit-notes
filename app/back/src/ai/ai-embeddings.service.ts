import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';

import { redactSecretText } from '../common/secret-redaction.util';
import { nowIso } from '../database/db.util';
import { AiNoteEmbeddingEntity, AiUsageLogEntity } from '../database/entities/ai.entity';
import { NotesService } from '../notes/notes.service';
import type { NoteSearchResult } from '../notes/notes.types';
import { AiCryptoService } from './ai-crypto.service';

const embeddingsTimeoutMs = 35_000;
const maxSemanticNotes = 300;
const embeddingBatchSize = 24;
const defaultEmbeddingModel = 'text-embedding-3-small';
const minSemanticScore = 0.16;

interface AiEmbeddingSettingsRow {
  user_id: number;
  provider_name: string;
  base_url: string;
  model: string | null;
  api_key_encrypted: string | null;
}

interface EmbeddingCandidate {
  id: number;
  name: string;
  contentText: string;
  tags: string;
  updatedAt: string;
}

interface EmbeddingRecord extends EmbeddingCandidate {
  contentHash: string;
  inputText: string;
  vector: number[] | null;
}

interface EmbeddingRow {
  note_id: number;
  content_hash: string;
  vector_json: string;
}

interface EmbeddingsResponse {
  data?: Array<{
    index?: unknown;
    embedding?: unknown;
  }>;
  usage?: {
    prompt_tokens?: unknown;
    total_tokens?: unknown;
  };
}

export interface SemanticSearchResult extends NoteSearchResult {
  score: number;
  matchType: 'semantic' | 'text';
}

@Injectable()
export class AiEmbeddingsService {
  private readonly logger = new Logger(AiEmbeddingsService.name);

  constructor(
    @InjectRepository(AiNoteEmbeddingEntity)
    private readonly embeddingsRepo: Repository<AiNoteEmbeddingEntity>,
    @InjectRepository(AiUsageLogEntity)
    private readonly usageRepo: Repository<AiUsageLogEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(AiCryptoService) private readonly aiCryptoService: AiCryptoService,
    @Inject(NotesService) private readonly notesService: NotesService,
  ) {}

  async semanticSearch(
    userId: number,
    query: string,
    limit: number,
    allowReadSecrets: boolean,
  ): Promise<SemanticSearchResult[]> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return [];
    }

    try {
      return await this.searchWithEmbeddings(userId, normalizedQuery, limit, allowReadSecrets);
    } catch (caught) {
      this.logger.warn(`Semantic search fallback for user ${userId}: ${(caught as Error).message}`);
      const fallback = await this.notesService.search(userId, normalizedQuery);
      return fallback
        .slice(0, limit)
        .map((result) => ({ ...result, score: 0, matchType: 'text' as const }));
    }
  }

  private async searchWithEmbeddings(
    userId: number,
    query: string,
    limit: number,
    allowReadSecrets: boolean,
  ): Promise<SemanticSearchResult[]> {
    const settings = await this.getSettings(userId);
    const apiKey = this.aiCryptoService.decrypt(settings.api_key_encrypted);
    const model = this.selectEmbeddingModel(settings.model);

    if (!apiKey) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'AI API key is not configured or cannot be decrypted',
        code: 'AI_KEY_MISSING',
      });
    }

    const candidates = await this.listCandidates(userId, allowReadSecrets);
    if (candidates.length === 0) {
      return [];
    }

    const records = this.createRecords(candidates);
    await this.ensureEmbeddings(settings, apiKey, model, records);
    const queryVector = (await this.fetchEmbeddings(settings, apiKey, model, [query]))[0];

    if (!queryVector) {
      return [];
    }

    return records
      .map((record) => ({
        record,
        score: record.vector ? this.cosineSimilarity(queryVector, record.vector) : -1,
      }))
      .filter(({ score }) => score >= minSemanticScore)
      .sort((left, right) => right.score - left.score)
      .slice(0, limit)
      .map(({ record, score }) => ({
        id: record.id,
        name: record.name,
        snippet: record.contentText.slice(0, 180),
        tags: record.tags ? record.tags.split(' ').filter(Boolean) : [],
        updatedAt: record.updatedAt,
        score: Math.round(score * 1000) / 1000,
        matchType: 'semantic',
      }));
  }

  private async getSettings(userId: number): Promise<AiEmbeddingSettingsRow> {
    const rows = (await this.dataSource.query(
      `
        SELECT user_settings.user_id,
               user_settings.provider_name,
               user_settings.base_url,
               provider_settings.model,
               provider_settings.api_key_encrypted
        FROM ai_user_settings user_settings
        JOIN ai_provider_settings provider_settings
          ON provider_settings.user_id = user_settings.user_id
         AND provider_settings.provider_name = user_settings.provider_name
         AND provider_settings.base_url = user_settings.base_url
        WHERE user_settings.user_id = $1
        LIMIT 1
      `,
      [userId],
    )) as AiEmbeddingSettingsRow[];

    const row = rows[0];
    if (!row) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'AI settings are not configured',
        code: 'AI_NOT_CONFIGURED',
      });
    }

    return row;
  }

  private selectEmbeddingModel(chatModel: string | null): string {
    const normalizedModel = chatModel?.trim();
    return normalizedModel?.toLowerCase().includes('embed')
      ? normalizedModel
      : defaultEmbeddingModel;
  }

  private async listCandidates(
    userId: number,
    allowReadSecrets: boolean,
  ): Promise<EmbeddingCandidate[]> {
    const rows = (await this.dataSource.query(
      `
        SELECT notes.id,
               notes.name,
               notes.content_text as "contentText",
               notes.updated_at as "updatedAt",
               COALESCE(string_agg(lower(tags.name), ' '), '') as tags
        FROM notes
        LEFT JOIN note_tags ON note_tags.note_id = notes.id
        LEFT JOIN tags ON tags.id = note_tags.tag_id
        WHERE notes.user_id = $1
          AND notes.deleted_at IS NULL
        GROUP BY notes.id
        ORDER BY notes.updated_at DESC, notes.id DESC
        LIMIT $2
      `,
      [userId, maxSemanticNotes],
    )) as EmbeddingCandidate[];

    return rows.map((row) => ({
      ...row,
      contentText: allowReadSecrets ? row.contentText : redactSecretText(row.contentText),
    }));
  }

  private createRecords(candidates: EmbeddingCandidate[]): EmbeddingRecord[] {
    return candidates.map((candidate) => {
      const inputText = [candidate.name, candidate.tags, candidate.contentText]
        .filter(Boolean)
        .join('\n')
        .slice(0, 12_000);

      return {
        ...candidate,
        inputText,
        contentHash: createHash('sha256').update(inputText).digest('hex'),
        vector: null,
      };
    });
  }

  private async ensureEmbeddings(
    settings: AiEmbeddingSettingsRow,
    apiKey: string,
    model: string,
    records: EmbeddingRecord[],
  ): Promise<void> {
    const existing = await this.getExistingEmbeddings(settings, model, records);
    const missing: EmbeddingRecord[] = [];

    for (const record of records) {
      const row = existing.get(record.id);
      if (row?.content_hash === record.contentHash) {
        record.vector = this.parseVector(row.vector_json);
        continue;
      }

      missing.push(record);
    }

    for (let index = 0; index < missing.length; index += embeddingBatchSize) {
      const batch = missing.slice(index, index + embeddingBatchSize);
      const vectors = await this.fetchEmbeddings(
        settings,
        apiKey,
        model,
        batch.map((record) => record.inputText),
      );

      batch.forEach((record, recordIndex) => {
        record.vector = vectors[recordIndex] ?? null;
      });
      await this.upsertEmbeddings(settings, model, batch);
    }
  }

  private async getExistingEmbeddings(
    settings: AiEmbeddingSettingsRow,
    model: string,
    records: EmbeddingRecord[],
  ): Promise<Map<number, EmbeddingRow>> {
    if (records.length === 0) {
      return new Map();
    }

    const rows = await this.embeddingsRepo.find({
      where: {
        user_id: settings.user_id,
        provider_name: settings.provider_name,
        base_url: settings.base_url,
        model,
      },
      select: { note_id: true, content_hash: true, vector_json: true },
    });

    return new Map(
      rows.map((row) => [
        row.note_id,
        { note_id: row.note_id, content_hash: row.content_hash, vector_json: row.vector_json },
      ]),
    );
  }

  private async upsertEmbeddings(
    settings: AiEmbeddingSettingsRow,
    model: string,
    records: EmbeddingRecord[],
  ): Promise<void> {
    const now = nowIso();
    const values = records
      .filter((record) => record.vector)
      .map((record) => ({
        user_id: settings.user_id,
        note_id: record.id,
        provider_name: settings.provider_name,
        base_url: settings.base_url,
        model,
        content_hash: record.contentHash,
        vector_json: JSON.stringify(record.vector),
        created_at: now,
        updated_at: now,
      }));

    if (values.length === 0) {
      return;
    }

    await this.embeddingsRepo
      .createQueryBuilder()
      .insert()
      .into(AiNoteEmbeddingEntity)
      .values(values)
      .orUpdate(
        ['content_hash', 'vector_json', 'updated_at'],
        ['user_id', 'note_id', 'provider_name', 'base_url', 'model'],
      )
      .execute();
  }

  private async fetchEmbeddings(
    settings: AiEmbeddingSettingsRow,
    apiKey: string,
    model: string,
    inputs: string[],
  ): Promise<number[][]> {
    const response = await fetch(`${settings.base_url.replace(/\/+$/, '')}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, input: inputs }),
      signal: AbortSignal.timeout(embeddingsTimeoutMs),
    });

    if (!response.ok) {
      throw new BadRequestException(`Embeddings provider returned ${response.status}`);
    }

    const payload = (await response.json()) as EmbeddingsResponse;
    await this.recordEmbeddingUsage(settings, model, payload, inputs);

    const vectors = new Array<number[]>(inputs.length);
    for (const [fallbackIndex, item] of (payload.data ?? []).entries()) {
      const index =
        typeof item.index === 'number' && Number.isInteger(item.index) ? item.index : fallbackIndex;
      const vector = this.parseEmbedding(item.embedding);

      if (vector && index >= 0 && index < vectors.length) {
        vectors[index] = vector;
      }
    }

    if (vectors.some((vector) => !vector)) {
      throw new BadRequestException('Embeddings provider returned malformed vectors');
    }

    return vectors;
  }

  private async recordEmbeddingUsage(
    settings: AiEmbeddingSettingsRow,
    model: string,
    payload: EmbeddingsResponse,
    inputs: string[],
  ): Promise<void> {
    const inputTokens =
      this.readTokenUsage(payload.usage?.prompt_tokens) ??
      this.readTokenUsage(payload.usage?.total_tokens) ??
      this.estimateTokens(inputs.join('\n'));

    await this.usageRepo.insert({
      user_id: settings.user_id,
      provider_name: settings.provider_name,
      model,
      input_tokens: inputTokens,
      output_tokens: 0,
      created_at: nowIso(),
    });
  }

  private parseEmbedding(value: unknown): number[] | null {
    return Array.isArray(value) &&
      value.length > 0 &&
      value.every((item): item is number => typeof item === 'number' && Number.isFinite(item))
      ? value
      : null;
  }

  private parseVector(value: string): number[] | null {
    try {
      return this.parseEmbedding(JSON.parse(value) as unknown);
    } catch {
      return null;
    }
  }

  private cosineSimilarity(left: number[], right: number[]): number {
    const length = Math.min(left.length, right.length);
    let dot = 0;
    let leftNorm = 0;
    let rightNorm = 0;

    for (let index = 0; index < length; index += 1) {
      dot += left[index] * right[index];
      leftNorm += left[index] * left[index];
      rightNorm += right[index] * right[index];
    }

    return leftNorm > 0 && rightNorm > 0 ? dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm)) : 0;
  }

  private readTokenUsage(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
      ? Math.trunc(value)
      : null;
  }

  private estimateTokens(value: string): number {
    return Math.ceil(value.length / 4);
  }
}
