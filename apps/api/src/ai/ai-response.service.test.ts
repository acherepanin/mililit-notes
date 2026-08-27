import type { Readable } from "node:stream";

import { describe, expect, it, vi } from "vitest";

import type { CreateResponseInput } from "./ai.types.js";
import { AiResponseService } from "./ai-response.service.js";
import { AiProviderError } from "./responses-provider.service.js";

const input: CreateResponseInput = {
  context: { fileIds: [], includeSecrets: false, noteIds: [] },
  parts: [{ text: "Hello", type: "text" }],
  promptKey: "notes.assistant",
};

async function read(stream: Readable): Promise<string> {
  let output = "";
  for await (const chunk of stream) output += String(chunk);
  return output;
}

function dependencies(provider: object, toolAllowlist: string[] = []) {
  const conversations = {
    completeAssistant: vi.fn(),
    createTurn: vi.fn(async () => ({
      assistantMessage: { id: 22 },
      userMessage: { id: 21 },
    })),
    failAssistant: vi.fn(),
    getRuntimeConversation: vi.fn(async () => ({ modelRole: "chat" })),
    markAssistantStreaming: vi.fn(),
    saveAssistantPartial: vi.fn(),
  };
  const usage = {
    complete: vi.fn(async () => ({
      cachedInputTokens: 0,
      currency: "USD",
      inputTokens: 3,
      outputTokens: 2,
      totalCost: 0.001,
    })),
    fail: vi.fn(),
    markStreaming: vi.fn(),
    reserve: vi.fn(async () => ({ id: 31, requestId: "request-31" })),
  };
  const confirmations = { createToolCall: vi.fn() };
  const tools = { execute: vi.fn() };
  const service = new AiResponseService(
    conversations as never,
    {
      build: vi.fn(async () => ({
        estimatedInputTokens: 3,
        input: [{ content: "Hello", role: "user" }],
      })),
    } as never,
    {
      resolveRoute: vi.fn(async () => ({
        fallbackModels: ["gpt-fallback"],
        maxOutputTokens: 100,
        model: "gpt-primary",
        provider: {
          apiKey: "server-secret",
          baseUrl: "https://provider.example/v1",
          providerName: "Test",
        },
        reasoningEffort: "low",
        temperature: null,
      })),
    } as never,
    usage as never,
    {
      resolveRuntime: vi.fn(async () => ({
        content: "Answer safely.",
        id: 4,
        reasoningEffort: "none",
        toolAllowlist,
      })),
    } as never,
    provider as never,
    confirmations as never,
    tools as never,
  );
  return { confirmations, conversations, service, tools, usage };
}

describe("AiResponseService", () => {
  it("falls back before the first delta and completes the semantic stream", async () => {
    const provider = {
      stream: vi.fn(async function* (_config, request: { model: string }) {
        if (request.model === "gpt-primary") {
          throw new AiProviderError("provider_unavailable", true, 503);
        }
        yield { providerResponseId: "resp-1", type: "response.created" };
        yield { delta: "Hello", type: "response.output_text.delta" };
        yield {
          model: request.model,
          providerResponseId: "resp-1",
          type: "response.completed",
          usage: {
            cachedInputTokens: 0,
            inputTokens: 3,
            outputTokens: 2,
            reasoningTokens: 0,
            toolCallCount: 0,
          },
        };
      }),
    };
    const { conversations, service, usage } = dependencies(provider);

    const result = await service.start(1, 10, input);
    const output = await read(result.stream);

    expect(provider.stream).toHaveBeenCalledTimes(2);
    expect(output).toContain("event: message.created");
    expect(output).toContain("event: message.retrying");
    expect(output).toContain("event: message.started");
    expect(output).toContain("event: message.delta");
    expect(output).toContain("event: usage.completed");
    expect(output).toContain("event: message.completed");
    expect(conversations.completeAssistant).toHaveBeenCalledWith(
      1,
      22,
      "Hello",
      "gpt-fallback",
      "resp-1",
    );
    expect(usage.fail).not.toHaveBeenCalled();
  });

  it("persists partial output and fails without fallback after a delta", async () => {
    const provider = {
      stream: vi.fn(async function* () {
        yield { providerResponseId: "resp-2", type: "response.created" };
        yield { delta: "Partial", type: "response.output_text.delta" };
        throw new AiProviderError("provider_stream_incomplete", true);
      }),
    };
    const { conversations, service, usage } = dependencies(provider);

    const result = await service.start(1, 10, input);
    const output = await read(result.stream);

    expect(provider.stream).toHaveBeenCalledTimes(1);
    expect(output).toContain("event: message.failed");
    expect(output).toContain('"partialText":"Partial"');
    expect(conversations.failAssistant).toHaveBeenCalledWith(
      1,
      22,
      "Partial",
      "provider_stream_incomplete",
      "resp-2",
    );
    expect(usage.fail).toHaveBeenCalledWith(
      1,
      31,
      "provider_stream_incomplete",
      expect.any(Number),
      "resp-2",
    );
  });

  it("persists and executes an allowed read-only tool call", async () => {
    const provider = {
      stream: vi.fn(async function* () {
        yield { providerResponseId: "resp-tools", type: "response.created" };
        yield {
          arguments: '{"query":"roadmap"}',
          callId: "call-1",
          itemId: "item-1",
          name: "notes_search",
          type: "response.function_call_arguments.done",
        };
        yield {
          model: "gpt-primary",
          providerResponseId: "resp-tools",
          type: "response.completed",
          usage: {
            cachedInputTokens: 0,
            inputTokens: 5,
            outputTokens: 1,
            reasoningTokens: 0,
            toolCallCount: 1,
          },
        };
      }),
    };
    const { confirmations, service, tools } = dependencies(provider, [
      "notes.search",
    ]);
    confirmations.createToolCall.mockResolvedValue({
      confirmation: null,
      toolCall: { id: 51 },
    });
    tools.execute.mockResolvedValue({ notes: [] });

    const result = await service.start(1, 10, input);
    const output = await read(result.stream);

    expect(confirmations.createToolCall).toHaveBeenCalledWith(
      1,
      22,
      "notes.search",
      { query: "roadmap" },
      "call-1",
      false,
    );
    expect(tools.execute).toHaveBeenCalledWith(1, 51);
    expect(output).toContain("event: tool.completed");
    expect(output).toContain('"toolName":"notes.search"');
  });
});
