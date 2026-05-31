import { Inject, Injectable, OnModuleInit } from '@nestjs/common';

import { DatabaseService } from '../infra/database.service';
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
export class RequestErrorLogService implements OnModuleInit {
  constructor(@Inject(DatabaseService) private readonly databaseService: DatabaseService) {}

  onModuleInit(): void {
    this.purgeOlderThanRetention();
  }

  record(params: PersistRequestErrorParams): void {
    if (!shouldPersistRequestError(params.statusCode, params.method, params.path)) {
      return;
    }

    const sanitized = sanitizeErrorBody(params.errorBody);
    const message = params.message ? params.message.slice(0, MAX_MESSAGE_LENGTH) : null;

    this.databaseService.connection
      .prepare(
        `
          INSERT INTO request_error_logs
            (user_id, method, path, status_code, message, error_name, error_body, duration_ms, created_at)
          VALUES
            (@userId, @method, @path, @statusCode, @message, @errorName, @errorBody, @durationMs, @createdAt)
        `,
      )
      .run({
        userId: params.userId,
        method: params.method.toUpperCase(),
        path: params.path,
        statusCode: params.statusCode,
        message,
        errorName: params.errorName,
        errorBody: JSON.stringify(sanitized ?? {}),
        durationMs: Math.max(0, Math.round(params.durationMs)),
        createdAt: new Date().toISOString(),
      });
  }

  list(limit?: number): RequestErrorResponse[] {
    const normalizedLimit = normalizeMonitoringLimit(limit);
    const rows = this.databaseService.connection
      .prepare(
        `
          SELECT
            request_error_logs.*,
            users.username as username
          FROM request_error_logs
          LEFT JOIN users ON users.id = request_error_logs.user_id
          ORDER BY request_error_logs.created_at DESC, request_error_logs.id DESC
          LIMIT @limit
        `,
      )
      .all({ limit: normalizedLimit }) as RequestErrorRecord[];

    return rows.map((row) => this.mapRow(row));
  }

  private purgeOlderThanRetention(): void {
    const cutoff = new Date(Date.now() - RETENTION_MS).toISOString();
    this.databaseService.connection
      .prepare(
        `
          DELETE FROM request_error_logs
          WHERE created_at < @cutoff
        `,
      )
      .run({ cutoff });
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
