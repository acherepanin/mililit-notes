import { isCorrelationId } from "./correlation.js";

export const INTEGRATION_QUEUE = "integration-events";

export type IntegrationProvider = "telegram" | "vk";

export interface IntegrationEventJob {
  correlationId: string;
  eventId: string;
  ledgerId: number;
  payload: Record<string, unknown>;
  provider: IntegrationProvider;
  traceparent?: string;
  tracestate?: string;
}

const TRACEPARENT = /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/;

export function isTraceparent(value: unknown): value is string {
  if (typeof value !== "string" || !TRACEPARENT.test(value)) return false;
  const [, traceId, spanId] = value.split("-");
  return !/^0+$/.test(traceId ?? "") && !/^0+$/.test(spanId ?? "");
}

export function isTracestate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 512 &&
    !/[\r\n]/.test(value)
  );
}

export function isIntegrationEventJob(
  value: unknown,
): value is IntegrationEventJob {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const job = value as Partial<IntegrationEventJob>;
  return (
    isCorrelationId(job.correlationId) &&
    typeof job.eventId === "string" &&
    job.eventId.length > 0 &&
    Number.isSafeInteger(job.ledgerId) &&
    Number(job.ledgerId) > 0 &&
    (job.provider === "telegram" || job.provider === "vk") &&
    (job.traceparent === undefined || isTraceparent(job.traceparent)) &&
    (job.tracestate === undefined || isTracestate(job.tracestate)) &&
    Boolean(job.payload) &&
    typeof job.payload === "object" &&
    !Array.isArray(job.payload)
  );
}
