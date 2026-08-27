import { ApiError } from "./client-providers";

export type AiModelRole = "chat" | "reasoning" | "vision";

export interface AiConversation {
  id: number;
  modelRole: AiModelRole;
  title: string | null;
}

export interface AiMessage {
  contentText: string;
  errorCode: string | null;
  id: number;
  status: "completed" | "failed" | "pending" | "streaming";
}

export interface AiStreamEvent {
  data: Record<string, unknown>;
  event: string;
  id: number | null;
}

export interface AiToolDecision {
  decision: "approved" | "rejected";
  id: number;
  result?: Record<string, unknown>;
  toolCallId: number;
}

export interface AiModelRoute {
  enabled: boolean;
  fallbackModels: string[];
  model: string;
  role: AiModelRole;
}

export interface AiAvailableModel {
  capabilities: string[];
  id: string;
  label: string;
  providerName: string;
}

export interface AiUsageSummary {
  cachedInputTokens: number;
  inputTokens: number;
  outputTokens: number;
  requests: number;
  totalCostUsd: number;
}

interface CreateResponseInput {
  context: { fileIds: number[]; noteIds: number[] };
  parts: Array<
    | { text: string; type: "text" }
    | {
        fileId: number;
        type: "file" | "image";
      }
  >;
  model?: string | null;
  promptKey: string;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function responseError(response: Response): Promise<ApiError> {
  const text = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = record(text ? JSON.parse(text) : {});
  } catch {
    // Keep the stable fallback below for non-JSON proxy failures.
  }
  const message = Array.isArray(body.message)
    ? body.message.join(". ")
    : typeof body.message === "string"
      ? body.message
      : "Не удалось выполнить AI-запрос. Повторите попытку.";
  return new ApiError(
    message,
    response.status,
    typeof body.code === "string" ? body.code : undefined,
  );
}

export async function* parseSemanticEventStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<AiStreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder
        .decode(value, { stream: !done })
        .replaceAll("\r\n", "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const lines = block.split("\n");
        const event = lines
          .find((line) => line.startsWith("event: "))
          ?.slice(7);
        const data = lines.find((line) => line.startsWith("data: "))?.slice(6);
        const rawId = lines.find((line) => line.startsWith("id: "))?.slice(4);
        if (event && data) {
          yield {
            data: record(JSON.parse(data)),
            event,
            id:
              rawId && Number.isSafeInteger(Number(rawId))
                ? Number(rawId)
                : null,
          };
        }
        boundary = buffer.indexOf("\n\n");
      }
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
}

export const aiApi = {
  async decideToolConfirmation(
    confirmationId: number,
    decision: "approve" | "reject",
  ): Promise<AiToolDecision> {
    const response = await fetch(
      `/api/ai/tool-confirmations/${confirmationId}/${decision}`,
      { method: "POST" },
    );
    if (!response.ok) throw await responseError(response);
    return (await response.json()) as AiToolDecision;
  },

  async createConversation(input: {
    modelRole: AiModelRole;
    title: string | null;
  }): Promise<AiConversation> {
    const response = await fetch("/api/ai/conversations", {
      body: JSON.stringify(input),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    if (!response.ok) throw await responseError(response);
    return (await response.json()) as AiConversation;
  },

  async getMessage(
    conversationId: number,
    messageId: number,
  ): Promise<AiMessage> {
    const response = await fetch(
      `/api/ai/conversations/${conversationId}/messages/${messageId}`,
    );
    if (!response.ok) throw await responseError(response);
    return (await response.json()) as AiMessage;
  },

  async listModelRoutes(): Promise<AiModelRoute[]> {
    const response = await fetch("/api/ai/model-routes");
    if (!response.ok) throw await responseError(response);
    return (await response.json()) as AiModelRoute[];
  },

  async listModels(): Promise<AiAvailableModel[]> {
    const response = await fetch("/api/ai/models");
    if (!response.ok) throw await responseError(response);
    return (await response.json()) as AiAvailableModel[];
  },

  async usageSummary(): Promise<AiUsageSummary> {
    const response = await fetch("/api/ai/usage-summary");
    if (!response.ok) throw await responseError(response);
    return (await response.json()) as AiUsageSummary;
  },

  async streamResponse(
    conversationId: number,
    input: CreateResponseInput,
    onEvent: (event: AiStreamEvent) => void,
    signal: AbortSignal,
  ): Promise<void> {
    const response = await fetch(
      `/api/ai/conversations/${conversationId}/responses`,
      {
        body: JSON.stringify(input),
        headers: {
          accept: "text/event-stream",
          "content-type": "application/json",
        },
        method: "POST",
        signal,
      },
    );
    if (!response.ok) throw await responseError(response);
    if (!response.body) throw new Error("AI stream is unavailable");
    for await (const event of parseSemanticEventStream(response.body)) {
      onEvent(event);
    }
  },
};
