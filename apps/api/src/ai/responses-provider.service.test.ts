import { describe, expect, it } from "vitest";

import {
  AiProviderError,
  parseJsonEventStream,
  ResponsesProviderService,
} from "./responses-provider.service.js";

function stream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe("ResponsesProviderService", () => {
  it("parses JSON SSE across arbitrary chunk boundaries", async () => {
    const events = [];
    for await (const event of parseJsonEventStream(
      stream([
        'event: response.output_text.delta\r\ndata: {"type":"response.output_',
        'text.delta","delta":"Hi"}\r\n\r\n',
        ": keep-alive\n\ndata: [DONE]\n\n",
      ]),
    )) {
      events.push(event);
    }
    expect(events).toEqual([
      { delta: "Hi", type: "response.output_text.delta" },
    ]);
  });

  it("normalizes provider events and reads usage only from completion", async () => {
    const policy = {
      assertAllowedForRequest: async (value: string) => value,
    };
    const correlation = { getOrCreate: () => "provider:test" };
    const service = new ResponsesProviderService(
      policy as never,
      correlation as never,
    );
    const providerEvents = [
      {
        response: { id: "resp_1" },
        type: "response.created",
      },
      { delta: "Hello", type: "response.output_text.delta" },
      {
        response: {
          id: "resp_1",
          model: "gpt-test",
          output: [{ type: "function_call" }],
          usage: {
            input_tokens: 12,
            input_tokens_details: { cached_tokens: 3 },
            output_tokens: 5,
            output_tokens_details: { reasoning_tokens: 2 },
          },
        },
        type: "response.completed",
      },
    ];
    const body = providerEvents
      .map((event) => `data: ${JSON.stringify(event)}\n\n`)
      .join("");
    const output = [];
    for await (const event of service.stream(
      {
        apiKey: "test-key",
        baseUrl: "https://provider.example/v1",
        providerName: "Test",
      },
      {
        input: [{ content: "Hello", role: "user" }],
        instructions: "Answer.",
        maxOutputTokens: 100,
        model: "gpt-test",
        reasoningEffort: "none",
        temperature: null,
        tools: [],
      },
      undefined,
      async (_input, init) => {
        expect(new Headers(init?.headers).get("x-correlation-id")).toBe(
          "provider:test",
        );
        return new Response(stream([body]), {
          headers: { "content-type": "text/event-stream" },
          status: 200,
        });
      },
    )) {
      output.push(event);
    }
    expect(output).toEqual([
      { providerResponseId: "resp_1", type: "response.created" },
      { delta: "Hello", type: "response.output_text.delta" },
      {
        model: "gpt-test",
        providerResponseId: "resp_1",
        type: "response.completed",
        usage: {
          cachedInputTokens: 3,
          inputTokens: 12,
          outputTokens: 5,
          reasoningTokens: 2,
          toolCallCount: 1,
        },
      },
    ]);
  });

  it("rejects incomplete and rate-limited streams", async () => {
    const policy = {
      assertAllowedForRequest: async (value: string) => value,
    };
    const service = new ResponsesProviderService(
      policy as never,
      { getOrCreate: () => "provider:test" } as never,
    );
    const request = {
      input: [],
      instructions: "Answer.",
      maxOutputTokens: null,
      model: "gpt-test",
      reasoningEffort: "none" as const,
      temperature: null,
      tools: [],
    };
    const config = {
      apiKey: "test-key",
      baseUrl: "https://provider.example/v1",
      providerName: "Test",
    };
    const consume = async (response: Response) => {
      for await (const event of service.stream(
        config,
        request,
        undefined,
        async () => response,
      )) {
        void event;
      }
    };
    await expect(
      consume(new Response(stream([]), { status: 200 })),
    ).rejects.toMatchObject({
      code: "provider_stream_incomplete",
      retryable: true,
    });
    await expect(
      consume(
        new Response(JSON.stringify({ error: { code: "rate_limit" } }), {
          status: 429,
        }),
      ),
    ).rejects.toBeInstanceOf(AiProviderError);
  });
});
