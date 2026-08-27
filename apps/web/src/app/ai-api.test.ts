import { describe, expect, it } from "vitest";

import { parseSemanticEventStream } from "./ai-api";

function stream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe("AI semantic event stream", () => {
  it("parses events split across transport chunks", async () => {
    const events = [];
    for await (const event of parseSemanticEventStream(
      stream([
        'id: 1\r\nevent: message.created\r\ndata: {"messageId":7}\r\n',
        '\r\nid: 2\nevent: message.delta\ndata: {"delta":"Hi"}\n\n',
      ]),
    )) {
      events.push(event);
    }
    expect(events).toEqual([
      { data: { messageId: 7 }, event: "message.created", id: 1 },
      { data: { delta: "Hi" }, event: "message.delta", id: 2 },
    ]);
  });
});
