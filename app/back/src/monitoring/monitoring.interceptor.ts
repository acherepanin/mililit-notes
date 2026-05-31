import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, catchError, tap, throwError } from 'rxjs';

import type { AuthenticatedRequest } from '../auth/auth.guard';
import { RequestErrorLogService } from './request-error-log.service';
import { RequestMetricsService } from './request-metrics.service';
import { normalizeRequestPath } from './monitoring.util';

@Injectable()
export class MonitoringInterceptor implements NestInterceptor {
  constructor(
    @Inject(RequestMetricsService) private readonly requestMetricsService: RequestMetricsService,
    @Inject(RequestErrorLogService) private readonly requestErrorLogService: RequestErrorLogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest & Request>();
    const response = http.getResponse<Response>();
    const startedAt = Date.now();
    const method = request.method;
    const path = normalizeRequestPath(request.originalUrl ?? request.url ?? '/api');

    const finalize = (statusCode: number, error?: unknown) => {
      const durationMs = Date.now() - startedAt;

      this.requestMetricsService.record({
        method,
        path,
        statusCode,
        durationMs,
      });

      if (error) {
        const { message, errorName, errorBody } = this.extractErrorDetails(error, statusCode);
        this.requestErrorLogService.record({
          userId: request.user?.id ?? null,
          method,
          path,
          statusCode,
          message,
          errorName,
          errorBody,
          durationMs,
        });
      }
    };

    return next.handle().pipe(
      tap(() => {
        finalize(response.statusCode || 200);
      }),
      catchError((error: unknown) => {
        const statusCode = this.resolveStatusCode(error, response.statusCode);
        finalize(statusCode, error);
        return throwError(() => error);
      }),
    );
  }

  private resolveStatusCode(error: unknown, fallbackStatus: number): number {
    if (error instanceof HttpException) {
      return error.getStatus();
    }

    return fallbackStatus >= 400 ? fallbackStatus : 500;
  }

  private extractErrorDetails(
    error: unknown,
    statusCode: number,
  ): { message: string | null; errorName: string | null; errorBody: unknown } {
    if (error instanceof HttpException) {
      const responseBody = error.getResponse();
      const message =
        typeof responseBody === 'string'
          ? responseBody
          : typeof responseBody === 'object' &&
              responseBody !== null &&
              'message' in responseBody
            ? this.stringifyMessage((responseBody as { message: unknown }).message)
            : error.message;

      return {
        message,
        errorName: error.name,
        errorBody: responseBody,
      };
    }

    if (error instanceof Error) {
      return {
        message: error.message,
        errorName: error.name,
        errorBody: { message: error.message, statusCode },
      };
    }

    return {
      message: 'Unknown error',
      errorName: 'Error',
      errorBody: { statusCode, value: String(error) },
    };
  }

  private stringifyMessage(value: unknown): string {
    if (Array.isArray(value)) {
      return value.map((item) => String(item)).join('; ');
    }

    return String(value);
  }
}
