import {
  type CallHandler,
  type ExecutionContext,
  HttpException,
  Inject,
  Injectable,
  Logger,
  type NestInterceptor,
} from "@nestjs/common";
import { requestErrorLogs } from "@notes/db";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  catchError,
  defer,
  finalize,
  from,
  mergeMap,
  type Observable,
  throwError,
} from "rxjs";

import type { AuthenticatedRequest } from "../auth/auth-request.js";
import { DatabaseService } from "../database/database.service.js";
import { CorrelationContextService } from "./correlation-context.service.js";
import { MetricsService } from "./metrics.service.js";
import { sanitizeDiagnosticMessage } from "./request-context.js";

type ObservedRequest = FastifyRequest &
  AuthenticatedRequest & { correlationId?: string };

function safeName(error: unknown): string {
  return (error instanceof Error ? error.name : "UnknownError")
    .replaceAll(/[^a-zA-Z0-9_.-]/g, "_")
    .slice(0, 100);
}

@Injectable()
export class RequestObservabilityInterceptor implements NestInterceptor {
  private readonly logger = new Logger("RequestError");

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CorrelationContextService)
    private readonly correlation: CorrelationContextService,
    @Inject(MetricsService) private readonly metrics: MetricsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();
    const request = context.switchToHttp().getRequest<ObservedRequest>();
    const reply = context.switchToHttp().getResponse<FastifyReply>();
    const startedAt = performance.now();
    const correlationId = request.correlationId ?? request.id;
    const route = request.routeOptions?.url;
    const endActive = this.metrics.beginHttp(request.method, route);
    let errorStatus: number | null = null;
    return defer(() =>
      this.correlation.run(correlationId, () =>
        next.handle().pipe(
          catchError((error: unknown) => {
            errorStatus =
              error instanceof HttpException ? error.getStatus() : 500;
            return from(this.record(request, error, startedAt)).pipe(
              mergeMap(() => throwError(() => error)),
            );
          }),
          finalize(() => {
            endActive();
            this.metrics.observeHttp(
              request.method,
              route,
              errorStatus ?? reply.statusCode,
              (performance.now() - startedAt) / 1_000,
            );
          }),
        ),
      ),
    );
  }

  private async record(
    request: ObservedRequest,
    error: unknown,
    startedAt: number,
  ): Promise<void> {
    const statusCode = error instanceof HttpException ? error.getStatus() : 500;
    const entry = {
      correlationId: request.correlationId ?? request.id,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      errorName: safeName(error),
      message: sanitizeDiagnosticMessage(error),
      method: request.method.slice(0, 16),
      path: request.url.split("?", 1)[0]!.slice(0, 500),
      statusCode,
      userId: request.principal?.id ?? null,
    };
    const line = JSON.stringify({ event: "request.failed", ...entry });
    if (statusCode >= 500) this.logger.error(line);
    else this.logger.warn(line);
    try {
      await this.database.client.insert(requestErrorLogs).values({
        ...entry,
        errorBody: { code: entry.errorName },
      });
    } catch (loggingError) {
      this.logger.error(
        JSON.stringify({
          correlationId: entry.correlationId,
          error: safeName(loggingError),
          event: "request.error_log_failed",
        }),
      );
    }
  }
}
