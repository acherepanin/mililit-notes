import { afterEach, describe, expect, it, vi } from "vitest";

import { VoiceService } from "./voice.service.js";

function service() {
  return new VoiceService(
    {
      resolveRoute: vi.fn(async (_userId: number, role: string) => ({
        fallbackModels: [],
        maxOutputTokens: 256,
        model: `model-${role}`,
        provider: {
          apiKey: "server-key",
          baseUrl: "https://provider.example/v1",
          providerName: "Test",
        },
        reasoningEffort: "low",
        temperature: null,
      })),
    } as never,
    {
      resolveRuntime: vi.fn(async () => ({
        content: "Speak concisely.",
        id: 1,
        reasoningEffort: "none",
      })),
    } as never,
    {
      assertAllowedForRequest: vi.fn(async (value: string) => value),
    } as never,
    {
      assertVoiceEnabled: vi.fn(),
    } as never,
  );
}

describe("VoiceService", () => {
  afterEach(() => {
    delete process.env.BETTER_AUTH_SECRET;
  });

  it("creates a unified WebRTC call without exposing the standard key", async () => {
    process.env.BETTER_AUTH_SECRET = "voice-test-secret";
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.headers).toMatchObject({
        authorization: "Bearer server-key",
      });
      const form = init.body as FormData;
      const session = JSON.parse(String(form.get("session"))) as {
        audio: { input: { turn_detection: Record<string, unknown> } };
        model: string;
      };
      expect(session.model).toBe("model-voice");
      expect(session.audio.input.turn_detection).toMatchObject({
        interrupt_response: true,
        type: "semantic_vad",
      });
      return new Response("v=0\r\no=answer", { status: 200 });
    });

    await expect(
      service().createRealtimeCall(
        1,
        "v=0\r\no=offer",
        "marin",
        fetcher as never,
      ),
    ).resolves.toContain("o=answer");
  });

  it("uses bounded server-side transcription and speech routes", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ text: "Hello" }), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-type": "audio/mpeg" },
          status: 200,
        }),
      );
    const voice = service();
    await expect(
      voice.transcribe(1, Buffer.from("audio"), "audio/webm", fetcher as never),
    ).resolves.toEqual({ text: "Hello" });
    await expect(
      voice.speak(1, { text: "Hello", voice: "marin" }, fetcher as never),
    ).resolves.toMatchObject({
      audio: Buffer.from([1, 2, 3]),
      contentType: "audio/mpeg",
    });
  });
});
