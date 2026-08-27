import { createHmac } from "node:crypto";

import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
} from "@nestjs/common";

import { EntitlementsService } from "../entitlements/entitlements.service.js";
import type { VoiceSpeechInput } from "./ai.types.js";
import { AiRegistryService } from "./ai-registry.service.js";
import { PromptRegistryService } from "./prompt-registry.service.js";
import { ProviderEndpointPolicyService } from "./provider-endpoint-policy.service.js";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const MAX_SPEECH_BYTES = 20 * 1024 * 1024;
type Fetcher = typeof fetch;

function safeVoice(value: string): string {
  if (!/^[a-z][a-z0-9_-]{1,63}$/.test(value)) {
    throw new BadRequestException("voice is invalid");
  }
  return value;
}

function validatedAudio(
  audio: unknown,
  mimeType: unknown,
): { audio: Buffer; mimeType: string } {
  if (
    !Buffer.isBuffer(audio) ||
    audio.length < 1 ||
    audio.length > MAX_AUDIO_BYTES
  ) {
    throw new BadRequestException("audio must contain 1 byte to 10 MB");
  }
  if (
    typeof mimeType !== "string" ||
    !/^audio\/[a-z0-9.+-]+$/i.test(mimeType)
  ) {
    throw new BadRequestException("content-type must be an audio MIME type");
  }
  return { audio, mimeType: mimeType.toLowerCase() };
}

@Injectable()
export class VoiceService {
  constructor(
    @Inject(AiRegistryService) private readonly registry: AiRegistryService,
    @Inject(PromptRegistryService)
    private readonly prompts: PromptRegistryService,
    @Inject(ProviderEndpointPolicyService)
    private readonly endpoints: ProviderEndpointPolicyService,
    @Inject(EntitlementsService)
    private readonly entitlements: EntitlementsService,
  ) {}

  async createRealtimeCall(
    userId: number,
    sdp: unknown,
    voiceValue: string,
    fetcher: Fetcher = fetch,
  ): Promise<string> {
    await this.entitlements.assertVoiceEnabled(userId);
    if (
      typeof sdp !== "string" ||
      !sdp.startsWith("v=") ||
      sdp.length > 100_000
    ) {
      throw new BadRequestException("SDP offer is invalid");
    }
    const route = await this.registry.resolveRoute(userId, "voice");
    const prompt = await this.prompts.resolveRuntime(
      "notes.assistant",
      "voice",
    );
    const baseUrl = await this.endpoints.assertAllowedForRequest(
      route.provider.baseUrl,
    );
    const session = {
      audio: {
        input: {
          turn_detection: {
            create_response: true,
            eagerness: "auto",
            interrupt_response: true,
            type: "semantic_vad",
          },
        },
        output: { voice: safeVoice(voiceValue) },
      },
      instructions: prompt.content,
      max_output_tokens: route.maxOutputTokens ?? "inf",
      model: route.model,
      output_modalities: ["audio"],
      ...(route.reasoningEffort === "none"
        ? {}
        : { reasoning: { effort: route.reasoningEffort } }),
      type: "realtime",
    };
    const form = new FormData();
    form.set("sdp", sdp);
    form.set("session", JSON.stringify(session));
    const secret = process.env.BETTER_AUTH_SECRET;
    if (!secret) throw new Error("BETTER_AUTH_SECRET is required");
    const safetyIdentifier = createHmac("sha256", secret)
      .update(`notes-user:${userId}`)
      .digest("hex");
    const response = await fetcher(`${baseUrl}/realtime/calls`, {
      body: form,
      headers: {
        authorization: `Bearer ${route.provider.apiKey}`,
        "openai-safety-identifier": safetyIdentifier,
      },
      method: "POST",
    });
    const answer = await response.text();
    if (!response.ok || !answer.startsWith("v=")) {
      throw new BadGatewayException(
        "Realtime voice provider rejected the call",
      );
    }
    return answer;
  }

  async transcribe(
    userId: number,
    audioValue: unknown,
    mimeTypeValue: unknown,
    fetcher: Fetcher = fetch,
  ): Promise<{ text: string }> {
    await this.entitlements.assertVoiceEnabled(userId);
    const { audio, mimeType } = validatedAudio(audioValue, mimeTypeValue);
    const route = await this.registry.resolveRoute(userId, "transcription");
    const baseUrl = await this.endpoints.assertAllowedForRequest(
      route.provider.baseUrl,
    );
    const form = new FormData();
    form.set(
      "file",
      new Blob([new Uint8Array(audio)], { type: mimeType }),
      `voice.${mimeType.split("/")[1] ?? "webm"}`,
    );
    form.set("model", route.model);
    const response = await fetcher(`${baseUrl}/audio/transcriptions`, {
      body: form,
      headers: { authorization: `Bearer ${route.provider.apiKey}` },
      method: "POST",
    });
    if (!response.ok) {
      throw new BadGatewayException("Voice transcription failed");
    }
    const payload = (await response.json()) as { text?: unknown };
    if (typeof payload.text !== "string" || !payload.text.trim()) {
      throw new BadGatewayException("Voice transcription returned no text");
    }
    return { text: payload.text.trim() };
  }

  async speak(
    userId: number,
    input: VoiceSpeechInput,
    fetcher: Fetcher = fetch,
  ): Promise<{ audio: Buffer; contentType: string }> {
    await this.entitlements.assertVoiceEnabled(userId);
    const route = await this.registry.resolveRoute(userId, "speech");
    const baseUrl = await this.endpoints.assertAllowedForRequest(
      route.provider.baseUrl,
    );
    const response = await fetcher(`${baseUrl}/audio/speech`, {
      body: JSON.stringify({
        format: "mp3",
        input: input.text,
        model: route.model,
        voice: safeVoice(input.voice),
      }),
      headers: {
        authorization: `Bearer ${route.provider.apiKey}`,
        "content-type": "application/json",
      },
      method: "POST",
    });
    if (!response.ok) throw new BadGatewayException("Speech generation failed");
    const audio = Buffer.from(await response.arrayBuffer());
    if (audio.length < 1 || audio.length > MAX_SPEECH_BYTES) {
      throw new BadGatewayException("Speech response size is invalid");
    }
    return {
      audio,
      contentType: response.headers.get("content-type") ?? "audio/mpeg",
    };
  }
}
