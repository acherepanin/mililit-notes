import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';

import { nowIso } from '../database/db.util';
import { RequestErrorLogEntity } from '../database/entities/activity.entity';
import { UserEntity } from '../database/entities/user.entity';
import { isRecord } from '../utils/type-guards';
import type { RequestErrorRecord, RequestErrorResponse } from './monitoring.types';
import {
  normalizeMonitoringLimit,
  sanitizeErrorBody,
  shouldPersistRequestError,
} from './monitoring.util';

const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_MESSAGE_LENGTH = 2000;

interface PersistRequestErrorParams {
  userId: number | null;
  method: string;
  path: string;
  statusCode: number;
  message: string | null;
  errorName: string | null;
  errorBody: unknown;
  durationMs: number;
}

@Injectable()
export class RequestErrorLogService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(RequestErrorLogEntity)
    private readonly errorsRepo: Repository<RequestErrorLogEntity>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.purgeOlderThanRetention();
  }

  async record(params: PersistRequestErrorParams): Promise<void> {
    if (!shouldPersistRequestError(params.statusCode, params.method, params.path)) {
      return;
    }

    const sanitized = sanitizeErrorBody(params.errorBody);
    const message = params.message ? params.message.slice(0, MAX_MESSAGE_LENGTH) : null;

    await this.errorsRepo.insert({
      user_id: params.userId,
      method: params.method.toUpperCase(),
      path: params.path,
      status_code: params.statusCode,
      message,
      error_name: params.errorName,
      error_body: JSON.stringify(sanitized ?? {}),
      duration_ms: Math.max(0, Math.round(params.durationMs)),
      created_at: nowIso(),
    });
  }

  async list(limit?: number): Promise<RequestErrorResponse[]> {
    const rows = await this.errorsRepo
      .createQueryBuilder('e')
      .leftJoin(UserEntity, 'u', 'u.id = e.user_id')
      .select('e.id', 'id')
      .addSelect('e.user_id', 'user_id')
      .addSelect('u.username', 'username')
      .addSelect('e.method', 'method')
      .addSelect('e.path', 'path')
      .addSelect('e.status_code', 'status_code')
      .addSelect('e.message', 'message')
      .addSelect('e.error_name', 'error_name')
      .addSelect('e.error_body', 'error_body')
      .addSelect('e.duration_ms', 'duration_ms')
      .addSelect('e.created_at', 'created_at')
      .orderBy('e.created_at', 'DESC')
      .addOrderBy('e.id', 'DESC')
      .limit(normalizeMonitoringLimit(limit))
      .getRawMany<RequestErrorRecord>();

    return rows.map((row) => this.mapRow(row));
  }

  private async purgeOlderThanRetention(): Promise<void> {
    const cutoff = new Date(Date.now() - RETENTION_MS).toISOString();
    await this.errorsRepo.delete({ created_at: LessThan(cutoff) });
  }

  private mapRow(row: RequestErrorRecord): RequestErrorResponse {
    return {
      id: row.id,
      userId: row.user_id,
      username: row.username,
      method: row.method,
      path: row.path,
      statusCode: row.status_code,
      message: row.message,
      errorName: row.error_name,
      errorBody: this.parseBody(row.error_body),
      durationMs: row.duration_ms,
      createdAt: row.created_at,
    };
  }

  private parseBody(raw: string): Record<string, unknown> | null {
    try {
      const parsed: unknown = JSON.parse(raw);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}
