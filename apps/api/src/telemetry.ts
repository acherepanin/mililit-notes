import { FastifyOtelInstrumentation } from "@fastify/otel";
import { type Attributes } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { NestInstrumentation } from "@opentelemetry/instrumentation-nestjs-core";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import { NodeSDK } from "@opentelemetry/sdk-node";

const endpoint = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?.trim();

function safePath(value: string): string {
  let path = value.split("?", 1)[0] || "/";
  try {
    path = decodeURI(path);
  } catch {
    return "/invalid-path";
  }
  return path
    .split("/")
    .map((segment) =>
      /^\d+$|^[0-9a-f]{24,}$|^[0-9a-f-]{36}$/i.test(segment) ||
      segment.length > 48
        ? ":id"
        : segment,
    )
    .join("/")
    .slice(0, 500);
}

function safeIncomingAttributes(url: string | undefined): Attributes {
  return {
    "client.address": undefined,
    "network.peer.address": undefined,
    "network.peer.port": undefined,
    "url.path": safePath(url ?? "/"),
    "url.query": undefined,
    "user_agent.original": undefined,
  };
}

const sdk = endpoint
  ? new NodeSDK({
      instrumentations: [
        new HttpInstrumentation({
          startIncomingSpanHook: (request) =>
            safeIncomingAttributes(request.url),
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
          instrumentHooks: false,
          recordExceptions: false,
          registerOnInitialization: true,
          requestHook: (span, request) => {
            span.setAttribute("url.path", safePath(request.url));
            const correlationId = request.headers["x-correlation-id"];
            if (
              typeof correlationId === "string" &&
              /^[a-zA-Z0-9._:-]{1,100}$/.test(correlationId)
            ) {
              span.setAttribute("notes.correlation_id", correlationId);
            }
          },
        }),
        new NestInstrumentation(),
      ],
      serviceName: process.env.OTEL_SERVICE_NAME?.trim() || "notes-api",
      traceExporter: new OTLPTraceExporter({
        timeoutMillis: 5_000,
        url: endpoint,
      }),
    })
  : null;

sdk?.start();

export async function shutdownTelemetry(): Promise<void> {
  await sdk?.shutdown();
}
