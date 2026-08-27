import { Inject, Injectable } from "@nestjs/common";

import type { AiReasoningEffort, JsonObject } from "./ai.types.js";
import { CorrelationContextService } from "../observability/correlation-context.service.js";
import { ProviderEndpointPolicyService } from "./provider-endpoint-policy.service.js";

const MAX_EVENT_BYTES = 1024 * 1024;
const RESPONSE_TIMEOUT_MS = 10 * 60 * 1000;
const MODEL_LIST_TIMEOUT_MS = 30_000;

type Fetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface ResponsesProviderConfig {
  apiKey: string;
  baseUrl: string;
  providerName: string;
}

export interface ResponsesProviderRequest {
  input: JsonObject[];
  instructions: string;
  maxOutputTokens: number | null;
  model: string;
  reasoningEffort: AiReasoningEffort;
  temperature: number | null;
  tools: JsonObject[];
}

export interface ResponsesUsage {
  cachedInputTokens: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  toolCallCount: number;
}

export interface ProviderModelInfo {
  createdAt: Date | null;
  id: string;
}

export type ResponsesProviderEvent =
  | { providerResponseId: string; type: "response.created" }
  | { delta: string; type: "response.output_text.delta" }
  | {
      callId: string;
      delta: string;
      itemId: string;
      type: "response.function_call_arguments.delta";
    }
  | {
      arguments: string;
      callId: string;
      itemId: string;
      name: string;
      type: "response.function_call_arguments.done";
    }
  | {
      model: string;
      providerResponseId: string;
      type: "response.completed";
      usage: ResponsesUsage;
    };

export class AiProviderError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    readonly statusCode: number | null = null,
  ) {
    super(code);
    this.name = "AiProviderError";
  }
}

function object(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function nonnegativeInteger(value: unknown): number {
  return Number.isSafeInteger(value) && (value as number) >= 0
    ? (value as number)
    : 0;
}

function string(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function safeCode(value: unknown, fallback: string): string {
  return typeof value === "string" && /^[a-zA-Z0-9_.-]{1,100}$/.test(value)
    ? value
    : fallback;
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function retryableCode(code: string): boolean {
  return /timeout|rate_limit|overloaded|unavailable|server_error/i.test(code);
}

function parseUsage(response: JsonObject): ResponsesUsage {
  const usage = object(response.usage) ?? {};
  const inputDetails = object(usage.input_tokens_details) ?? {};
  const outputDetails = object(usage.output_tokens_details) ?? {};
  const output = Array.isArray(response.output) ? response.output : [];
  return {
    cachedInputTokens: nonnegativeInteger(inputDetails.cached_tokens),
    inputTokens: nonnegativeInteger(usage.input_tokens),
    outputTokens: nonnegativeInteger(usage.output_tokens),
    reasoningTokens: nonnegativeInteger(outputDetails.reasoning_tokens),
    toolCallCount: output.filter(
      (item) => object(item)?.type === "function_call",
    ).length,
  };
}

function parseSseBlock(block: string): JsonObject | null {
  if (!block.trim() || block.startsWith(":")) return null;
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  if (!data || data === "[DONE]") return null;
  if (Buffer.byteLength(data, "utf8") > MAX_EVENT_BYTES) {
    throw new AiProviderError("provider_event_too_large", false);
  }
  try {
    const parsed = object(JSON.parse(data));
    if (!parsed) throw new Error();
    return parsed;
  } catch (error) {
    if (error instanceof AiProviderError) throw error;
    throw new AiProviderError("provider_event_invalid", false);
  }
}

export async function* parseJsonEventStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<JsonObject> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      if (Buffer.byteLength(buffer, "utf8") > MAX_EVENT_BYTES * 2) {
        throw new AiProviderError("provider_stream_buffer_too_large", false);
      }
      let boundary = buffer.match(/\r?\n\r?\n/);
      while (boundary?.index !== undefined) {
        const block = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        const event = parseSseBlock(block);
        if (event) yield event;
        boundary = buffer.match(/\r?\n\r?\n/);
      }
      if (done) break;
    }
    const finalEvent = parseSseBlock(buffer);
    if (finalEvent) yield finalEvent;
  } finally {
    reader.releaseLock();
  }
}

@Injectable()
export class ResponsesProviderService {
  constructor(
    @Inject(ProviderEndpointPolicyService)
    private readonly endpoints: ProviderEndpointPolicyService,
    @Inject(CorrelationContextService)
    private readonly correlation: CorrelationContextService,
  ) {}

  async listModels(
    config: ResponsesProviderConfig,
    fetcher: Fetcher = fetch,
  ): Promise<ProviderModelInfo[]> {
    const baseUrl = await this.endpoints.assertAllowedForRequest(
      config.baseUrl,
    );
    const response = await fetcher(`${baseUrl}/models`, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${config.apiKey}`,
        "x-correlation-id": this.correlation.getOrCreate(),
      },
      signal: AbortSignal.timeout(MODEL_LIST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new AiProviderError(
        `provider_models_http_${response.status}`,
        retryableStatus(response.status),
        response.status,
      );
    }
    const payload = object(await response.json());
    const data = Array.isArray(payload?.data) ? payload.data.slice(0, 500) : [];
    return data.flatMap((value) => {
      const model = object(value);
      const id = string(model?.id);
      if (!id || !/^[a-zA-Z0-9_.:/-]{1,200}$/.test(id)) return [];
      const created = Number(model?.created);
      const createdAt =
        Number.isSafeInteger(created) && created > 0
          ? new Date(created * 1000)
          : null;
      return [{ createdAt, id }];
    });
  }

  async *stream(
    config: ResponsesProviderConfig,
    request: ResponsesProviderRequest,
    signal?: AbortSignal,
    fetcher: Fetcher = fetch,
  ): AsyncGenerator<ResponsesProviderEvent> {
    const baseUrl = await this.endpoints.assertAllowedForRequest(
      config.baseUrl,
    );
    const timeout = AbortSignal.timeout(RESPONSE_TIMEOUT_MS);
    const response = await fetcher(`${baseUrl}/responses`, {
      body: JSON.stringify({
        input: request.input,
        instructions: request.instructions,
        ...(request.maxOutputTokens === null
          ? {}
          : { max_output_tokens: request.maxOutputTokens }),
        model: request.model,
        ...(request.reasoningEffort === "none"
          ? {}
          : { reasoning: { effort: request.reasoningEffort } }),
        store: false,
        stream: true,
        ...(request.temperature === null
          ? {}
          : { temperature: request.temperature }),
        ...(request.tools.length === 0 ? {} : { tools: request.tools }),
      }),
      headers: {
        accept: "text/event-stream",
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
        "x-correlation-id": this.correlation.getOrCreate(),
      },
      method: "POST",
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (!response.ok) {
      let code = `provider_http_${response.status}`;
      try {
        const payload = object(await response.json());
        code = safeCode(object(payload?.error)?.code, code);
      } catch {
        // The status code remains the stable client-facing error.
      }
      throw new AiProviderError(
        code,
        retryableStatus(response.status) || retryableCode(code),
        response.status,
      );
    }
    if (!response.body) {
      throw new AiProviderError("provider_stream_missing", true);
    }

    let completed = false;
    for await (const raw of parseJsonEventStream(response.body)) {
      const type = string(raw.type);
      if (type === "response.created") {
        const id = string(object(raw.response)?.id);
        if (id) yield { providerResponseId: id, type };
      } else if (type === "response.output_text.delta") {
        const delta = typeof raw.delta === "string" ? raw.delta : "";
        if (delta) yield { delta, type };
      } else if (type === "response.function_call_arguments.delta") {
        const callId = string(raw.call_id);
        const itemId = string(raw.item_id);
        const delta = typeof raw.delta === "string" ? raw.delta : "";
        if (callId && itemId && delta) {
          yield { callId, delta, itemId, type };
        }
      } else if (type === "response.function_call_arguments.done") {
        const callId = string(raw.call_id);
        const itemId = string(raw.item_id);
        const name = string(raw.name);
        const argumentsValue = string(raw.arguments);
        if (callId && itemId && name && argumentsValue) {
          yield {
            arguments: argumentsValue,
            callId,
            itemId,
            name,
            type,
          };
        }
      } else if (type === "response.completed") {
        const result = object(raw.response);
        const providerResponseId = string(result?.id);
        const model = string(result?.model);
        if (!result || !providerResponseId || !model) {
          throw new AiProviderError("provider_completion_invalid", false);
        }
        completed = true;
        yield {
          model,
          providerResponseId,
          type,
          usage: parseUsage(result),
        };
      } else if (
        type === "response.failed" ||
        type === "response.incomplete" ||
        type === "error"
      ) {
        const responseValue = object(raw.response);
        const error = object(raw.error) ?? object(responseValue?.error) ?? {};
        const code = safeCode(
          error.code,
          `provider_${type.replaceAll(".", "_")}`,
        );
        throw new AiProviderError(code, retryableCode(code));
      }
    }
    if (!completed) {
      throw new AiProviderError("provider_stream_incomplete", true);
    }
  }
}
