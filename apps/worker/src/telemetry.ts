import { FastifyOtelInstrumentation } from "@fastify/otel";
import {
  context,
  propagation,
  SpanKind,
  SpanStatusCode,
  trace,
  type Attributes,
  type Context,
} from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import { NodeSDK } from "@opentelemetry/sdk-node";

const endpoint = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?.trim();

function safePath(value: string): string {
  return (value.split("?", 1)[0] || "/").slice(0, 500);
}

const sdk = endpoint
  ? new NodeSDK({
      instrumentations: [
        new HttpInstrumentation({
          startIncomingSpanHook: (request) => ({
            "client.address": undefined,
            "network.peer.address": undefined,
            "network.peer.port": undefined,
            "url.path": safePath(request.url ?? "/"),
            "url.query": undefined,
            "user_agent.original": undefined,
          }),
          startOutgoingSpanHook: (request) => ({
            "url.full": `${request.protocol ?? "http:"}//${request.hostname ?? request.host ?? "unknown"}${safePath(request.path ?? "/")}`,
          }),
        }),
        new UndiciInstrumentation({
          requireParentforSpans: true,
          startSpanHook: (request) => ({
            "url.full": `${request.origin}${safePath(request.path)}`,
            "url.path": safePath(request.path),
            "url.query": undefined,
          }),
        }),
        new FastifyOtelInstrumentation({
          ignorePaths: (request) =>
            request.url === "/health" || request.url === "/metrics",
          instrumentHooks: false,
          recordExceptions: false,
          registerOnInitialization: true,
          requestHook: (span, request) => {
            span.setAttribute("url.path", safePath(request.url));
          },
        }),
      ],
      serviceName: process.env.OTEL_SERVICE_NAME?.trim() || "notes-worker",
      traceExporter: new OTLPTraceExporter({
        timeoutMillis: 5_000,
        url: endpoint,
      }),
    })
  : null;

sdk?.start();

const tracer = trace.getTracer("notes-worker");

export function extractJobContext(carrier: {
  traceparent?: string;
  tracestate?: string;
}): Context {
  return propagation.extract(context.active(), carrier);
}

export function traceJob<Result>(
  parent: Context,
  name: string,
  attributes: Attributes,
  callback: () => Promise<Result>,
): Promise<Result> {
  return context.with(parent, () =>
    tracer.startActiveSpan(
      name,
      { attributes, kind: SpanKind.CONSUMER },
      async (span) => {
        try {
          return await callback();
        } catch (error) {
          span.setStatus({ code: SpanStatusCode.ERROR });
          throw error;
        } finally {
          span.end();
        }
      },
    ),
  );
}

export async function shutdownTelemetry(): Promise<void> {
  await sdk?.shutdown();
}
