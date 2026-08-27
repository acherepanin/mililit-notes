import { afterEach, describe, expect, it, vi } from "vitest";

import {
  cancelRealtimeResponse,
  microphoneErrorMessage,
  speakVoice,
  transcribeVoice,
} from "./voice-api";

describe("voice API", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends raw audio through the STT fallback and plays TTS", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ text: "  hello  " }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2]), {
          headers: { "content-type": "audio/mpeg" },
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:voice"),
      revokeObjectURL: vi.fn(),
    });
    const audio = { play: vi.fn(async () => {}), src: "", srcObject: null };

    await expect(
      transcribeVoice(new Blob(["voice"], { type: "audio/webm" })),
    ).resolves.toBe("hello");
    await speakVoice("answer", audio as never);

    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      body: expect.any(Blob),
      headers: { "content-type": "audio/webm" },
    });
    expect(audio.src).toBe("blob:voice");
    expect(audio.play).toHaveBeenCalledOnce();
  });

  it("cancels an active realtime response and explains permission denial", () => {
    const channel = { readyState: "open", send: vi.fn() };
    cancelRealtimeResponse(channel as never);
    expect(channel.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "response.cancel" }),
    );
    expect(
      microphoneErrorMessage(
        new DOMException("Permission denied", "NotAllowedError"),
      ),
    ).toContain("Разрешите доступ");
  });
});
