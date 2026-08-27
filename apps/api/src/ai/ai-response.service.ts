import { Readable } from "node:stream";

import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";

import type {
  AiPromptModelRole,
  AiReasoningEffort,
  CreateResponseInput,
} from "./ai.types.js";
import {
  internalToolName,
  providerTools,
  type AiToolName,
} from "./ai-tool-registry.js";
import { AiToolExecutionService } from "./ai-tool-execution.service.js";
import { AiConversationService } from "./ai-conversation.service.js";
import { AiInputBuilderService } from "./ai-input-builder.service.js";
import { AiRegistryService } from "./ai-registry.service.js";
import { AiUsageService } from "./ai-usage.service.js";
import { PromptRegistryService } from "./prompt-registry.service.js";
import { ToolConfirmationService } from "./tool-confirmation.service.js";
import {
  AiProviderError,
  ResponsesProviderService,
} from "./responses-provider.service.js";

const DEFAULT_MAX_OUTPUT_TOKENS = 4_096;
const PARTIAL_FLUSH_BYTES = 4_096;
const PARTIAL_FLUSH_MS = 250;

interface PreparedResponse {
  assistantMessageId: number;
  conversationId: number;
  estimatedInputTokens: number;
  input: Record<string, unknown>[];
  models: string[];
  prompt: {
    content: string;
    id: number | null;
    reasoningEffort: string;
    toolAllowlist: string[];
  };
  provider: {
    apiKey: string;
    baseUrl: string;
    providerName: string;
  };
  route: {
    maxOutputTokens: number | null;
    reasoningEffort: AiReasoningEffort;
    temperature: number | null;
  };
  usageId: number;
  usageRequestId: string;
  userId: number;
  userMessageId: number;
  options: AiResponseOptions;
}

export interface AiResponseOptions {
  allowedTools?: readonly string[];
  beforeToolExecution?: (toolName: AiToolName) => Promise<void>;
  forceToolConfirmation?: boolean;
}

export interface CompletedAiResponse {
  pendingConfirmations: Array<{
    confirmationId: number;
    expiresAt: string;
    toolCallId: number;
    toolName: AiToolName;
  }>;
  text: string;
}

function event(id: number, name: string, data: unknown): string {
  return `id: ${id}\nevent: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}

function errorState(error: unknown, aborted: boolean) {
  if (error instanceof AiProviderError) {
    return { code: error.code, retryable: error.retryable };
  }
  return {
    code: aborted ? "stream_cancelled" : "provider_internal_error",
    retryable: !aborted,
  };
}

@Injectable()
export class AiResponseService {
  constructor(
    @Inject(AiConversationService)
    private readonly conversations: AiConversationService,
    @Inject(AiInputBuilderService)
    private readonly inputBuilder: AiInputBuilderService,
    @Inject(AiRegistryService) private readonly registry: AiRegistryService,
    @Inject(AiUsageService) private readonly usage: AiUsageService,
    @Inject(PromptRegistryService)
    private readonly prompts: PromptRegistryService,
    @Inject(ResponsesProviderService)
    private readonly provider: ResponsesProviderService,
    @Inject(ToolConfirmationService)
    private readonly confirmations: ToolConfirmationService,
    @Inject(AiToolExecutionService)
    private readonly tools: AiToolExecutionService,
  ) {}

  async start(
    userId: number,
    conversationId: number,
    input: CreateResponseInput,
    options: AiResponseOptions = {},
  ) {
    const conversation = await this.conversations.getRuntimeConversation(
      userId,
      conversationId,
    );
    const route = await this.registry.resolveRoute(
      userId,
      conversation.modelRole as AiPromptModelRole,
      input.model,
    );
    const prompt = await this.prompts.resolveRuntime(
      input.promptKey,
      conversation.modelRole,
    );
    const turn = await this.conversations.createTurn(
      userId,
      conversationId,
      input,
      {
        model: route.model,
        promptVersionId: prompt.id,
        providerName: route.provider.providerName,
      },
    );
    let built;
    try {
      built = await this.inputBuilder.build(
        userId,
        conversationId,
        turn.userMessage.id,
      );
    } catch (error) {
      await this.conversations.failAssistant(
        userId,
        turn.assistantMessage.id,
        "",
        "input_build_failed",
        null,
      );
      throw error;
    }
    let reservation;
    try {
      reservation = await this.usage.reserve({
        conversationId,
        estimatedInputTokens: built.estimatedInputTokens,
        maxOutputTokens: route.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        messageId: turn.assistantMessage.id,
        model: route.model,
        promptVersionId: prompt.id,
        providerName: route.provider.providerName,
        userId,
      });
    } catch (error) {
      await this.conversations.failAssistant(
        userId,
        turn.assistantMessage.id,
        "",
        "limit_rejected",
        null,
      );
      throw error;
    }
    const prepared: PreparedResponse = {
      assistantMessageId: turn.assistantMessage.id,
      conversationId,
      estimatedInputTokens: built.estimatedInputTokens,
      input: built.input,
      models: [route.model, ...route.fallbackModels],
      prompt,
      provider: route.provider,
      route,
      usageId: reservation.id,
      usageRequestId: reservation.requestId,
      userId,
      userMessageId: turn.userMessage.id,
      options,
    };
    const abort = new AbortController();
    const stream = Readable.from(this.run(prepared, abort.signal));
    stream.once("close", () => abort.abort());
    return {
      assistantMessageId: prepared.assistantMessageId,
      stream,
      userMessageId: prepared.userMessageId,
    };
  }

  async completeText(
    userId: number,
    conversationId: number,
    input: CreateResponseInput,
  ): Promise<string> {
    return (await this.complete(userId, conversationId, input)).text;
  }

  async complete(
    userId: number,
    conversationId: number,
    input: CreateResponseInput,
    options: AiResponseOptions = {},
  ): Promise<CompletedAiResponse> {
    const response = await this.start(userId, conversationId, input, options);
    let buffer = "";
    let completed: string | null = null;
    let failureCode: string | null = null;
    const pendingConfirmations: CompletedAiResponse["pendingConfirmations"] =
      [];
    for await (const chunk of response.stream) {
      buffer += Buffer.from(chunk).toString("utf8");
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const name = frame.match(/^event: (.+)$/m)?.[1];
        const data = frame.match(/^data: (.+)$/m)?.[1];
        if (data && name === "message.completed") {
          const payload = JSON.parse(data) as { text?: unknown };
          if (typeof payload.text === "string") completed = payload.text;
        } else if (data && name === "tool.confirmation.required") {
          const payload = JSON.parse(data) as Record<string, unknown>;
          if (
            Number.isSafeInteger(payload.confirmationId) &&
            typeof payload.expiresAt === "string" &&
            Number.isSafeInteger(payload.toolCallId) &&
            typeof payload.toolName === "string"
          ) {
            pendingConfirmations.push(payload as never);
          }
        } else if (data && name === "message.failed") {
          const payload = JSON.parse(data) as { code?: unknown };
          failureCode =
            typeof payload.code === "string" ? payload.code : "ai_failed";
        }
        boundary = buffer.indexOf("\n\n");
      }
    }
    if (completed !== null) return { pendingConfirmations, text: completed };
    throw new ServiceUnavailableException(failureCode ?? "AI response failed");
  }

  private async *run(
    prepared: PreparedResponse,
    signal: AbortSignal,
  ): AsyncGenerator<string> {
    const startedAt = Date.now();
    let sequence = 1;
    let text = "";
    let providerResponseId: string | null = null;
    let firstTokenAt: number | null = null;
    let lastFlushAt = startedAt;
    let flushedBytes = 0;
    let settled = false;
    const toolCalls: Array<{
      status: "pending" | "succeeded" | "failed";
      toolCallId: number;
      toolName: AiToolName;
    }> = [];

    const effectiveTools = prepared.options.allowedTools
      ? prepared.prompt.toolAllowlist.filter((name) =>
          prepared.options.allowedTools?.includes(name),
        )
      : prepared.prompt.toolAllowlist;

    yield event(sequence++, "message.created", {
      assistantMessageId: prepared.assistantMessageId,
      conversationId: prepared.conversationId,
      recoveryUrl: `/api/ai/conversations/${prepared.conversationId}/messages/${prepared.assistantMessageId}`,
      requestId: prepared.usageRequestId,
      userMessageId: prepared.userMessageId,
    });

    try {
      for (const [modelIndex, model] of prepared.models.entries()) {
        try {
          for await (const providerEvent of this.provider.stream(
            prepared.provider,
            {
              input: prepared.input,
              instructions: prepared.prompt.content,
              maxOutputTokens: prepared.route.maxOutputTokens,
              model,
              reasoningEffort:
                prepared.prompt.reasoningEffort === "none"
                  ? prepared.route.reasoningEffort
                  : (prepared.prompt.reasoningEffort as AiReasoningEffort),
              temperature: prepared.route.temperature,
              tools: providerTools(effectiveTools),
            },
            signal,
          )) {
            if (providerEvent.type === "response.created") {
              providerResponseId = providerEvent.providerResponseId;
              await Promise.all([
                this.conversations.markAssistantStreaming(
                  prepared.userId,
                  prepared.assistantMessageId,
                  model,
                  providerResponseId,
                ),
                this.usage.markStreaming(
                  prepared.userId,
                  prepared.usageId,
                  model,
                  providerResponseId,
                ),
              ]);
              yield event(sequence++, "message.started", {
                messageId: prepared.assistantMessageId,
                model,
              });
            } else if (providerEvent.type === "response.output_text.delta") {
              if (firstTokenAt === null) firstTokenAt = Date.now();
              text += providerEvent.delta;
              const textBytes = Buffer.byteLength(text, "utf8");
              if (
                textBytes - flushedBytes >= PARTIAL_FLUSH_BYTES ||
                Date.now() - lastFlushAt >= PARTIAL_FLUSH_MS
              ) {
                await this.conversations.saveAssistantPartial(
                  prepared.userId,
                  prepared.assistantMessageId,
                  text,
                );
                flushedBytes = textBytes;
                lastFlushAt = Date.now();
              }
              yield event(sequence++, "message.delta", {
                delta: providerEvent.delta,
                messageId: prepared.assistantMessageId,
              });
            } else if (
              providerEvent.type === "response.function_call_arguments.delta"
            ) {
              yield event(sequence++, "tool.arguments.delta", {
                callId: providerEvent.callId,
                delta: providerEvent.delta,
                messageId: prepared.assistantMessageId,
              });
            } else if (
              providerEvent.type === "response.function_call_arguments.done"
            ) {
              const toolName = internalToolName(providerEvent.name);
              if (!toolName || !effectiveTools.includes(toolName)) {
                throw new AiProviderError("tool_not_allowed", false);
              }
              let argumentsValue: Record<string, unknown>;
              try {
                const parsed = JSON.parse(providerEvent.arguments) as unknown;
                if (
                  !parsed ||
                  typeof parsed !== "object" ||
                  Array.isArray(parsed)
                ) {
                  throw new Error();
                }
                argumentsValue = parsed as Record<string, unknown>;
              } catch {
                throw new AiProviderError("tool_arguments_invalid", false);
              }
              const created = await this.confirmations.createToolCall(
                prepared.userId,
                prepared.assistantMessageId,
                toolName,
                argumentsValue,
                providerEvent.callId,
                prepared.options.forceToolConfirmation ?? false,
              );
              yield event(sequence++, "tool.arguments.done", {
                arguments: providerEvent.arguments,
                callId: providerEvent.callId,
                messageId: prepared.assistantMessageId,
                name: toolName,
              });
              if (created.confirmation) {
                toolCalls.push({
                  status: "pending",
                  toolCallId: created.toolCall.id,
                  toolName,
                });
                yield event(sequence++, "tool.confirmation.required", {
                  confirmationId: created.confirmation.id,
                  expiresAt: created.confirmation.expiresAt,
                  messageId: prepared.assistantMessageId,
                  toolCallId: created.toolCall.id,
                  toolName,
                });
              } else {
                try {
                  await prepared.options.beforeToolExecution?.(toolName);
                } catch (error) {
                  const code =
                    error instanceof Error
                      ? error.name
                      : "tool_authorization_failed";
                  await this.confirmations.failApproved(
                    prepared.userId,
                    created.toolCall.id,
                    code,
                  );
                  toolCalls.push({
                    status: "failed",
                    toolCallId: created.toolCall.id,
                    toolName,
                  });
                  yield event(sequence++, "tool.failed", {
                    code,
                    toolCallId: created.toolCall.id,
                    toolName,
                  });
                  continue;
                }
                try {
                  const result = await this.tools.execute(
                    prepared.userId,
                    created.toolCall.id,
                  );
                  toolCalls.push({
                    status: "succeeded",
                    toolCallId: created.toolCall.id,
                    toolName,
                  });
                  yield event(sequence++, "tool.completed", {
                    result,
                    toolCallId: created.toolCall.id,
                    toolName,
                  });
                } catch (error) {
                  toolCalls.push({
                    status: "failed",
                    toolCallId: created.toolCall.id,
                    toolName,
                  });
                  yield event(sequence++, "tool.failed", {
                    code:
                      error instanceof Error
                        ? error.name
                        : "tool_execution_failed",
                    toolCallId: created.toolCall.id,
                    toolName,
                  });
                }
              }
            } else if (providerEvent.type === "response.completed") {
              providerResponseId = providerEvent.providerResponseId;
              const latencyMs = Date.now() - startedAt;
              const usage = await this.usage.complete(
                prepared.userId,
                prepared.usageId,
                prepared.provider.providerName,
                providerEvent.model,
                providerResponseId,
                providerEvent.usage,
                latencyMs,
                firstTokenAt === null ? null : firstTokenAt - startedAt,
              );
              await this.conversations.completeAssistant(
                prepared.userId,
                prepared.assistantMessageId,
                text,
                providerEvent.model,
                providerResponseId,
              );
              settled = true;
              yield event(sequence++, "usage.completed", {
                messageId: prepared.assistantMessageId,
                ...usage,
              });
              yield event(sequence++, "message.completed", {
                messageId: prepared.assistantMessageId,
                providerResponseId,
                text,
                toolCalls,
              });
              return;
            }
          }
        } catch (error) {
          const state = errorState(error, signal.aborted);
          const canFallback =
            state.retryable &&
            !signal.aborted &&
            text.length === 0 &&
            toolCalls.length === 0 &&
            modelIndex < prepared.models.length - 1;
          if (canFallback) {
            yield event(sequence++, "message.retrying", {
              code: state.code,
              messageId: prepared.assistantMessageId,
              nextModel: prepared.models[modelIndex + 1],
            });
            continue;
          }
          throw error;
        }
      }
    } catch (error) {
      const state = errorState(error, signal.aborted);
      await Promise.all([
        this.conversations.failAssistant(
          prepared.userId,
          prepared.assistantMessageId,
          text,
          state.code,
          providerResponseId,
        ),
        this.usage.fail(
          prepared.userId,
          prepared.usageId,
          state.code,
          Date.now() - startedAt,
          providerResponseId,
        ),
      ]);
      settled = true;
      yield event(sequence++, "message.failed", {
        code: state.code,
        messageId: prepared.assistantMessageId,
        partialText: text,
        retryable: state.retryable,
      });
    } finally {
      if (!settled) {
        await Promise.all([
          this.conversations.failAssistant(
            prepared.userId,
            prepared.assistantMessageId,
            text,
            "stream_cancelled",
            providerResponseId,
          ),
          this.usage.fail(
            prepared.userId,
            prepared.usageId,
            "stream_cancelled",
            Date.now() - startedAt,
            providerResponseId,
          ),
        ]);
      }
    }
  }
}
