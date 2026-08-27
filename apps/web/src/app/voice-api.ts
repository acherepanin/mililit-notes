import { responseError } from "./ai-api";

export interface RealtimeVoiceSession {
  kind: "realtime";
  stop(): void;
}

export interface RecordedVoiceSession {
  kind: "recording";
  stop(): Promise<Blob>;
}

export type ActiveVoiceSession = RealtimeVoiceSession | RecordedVoiceSession;

export function microphoneErrorMessage(error: unknown): string {
  return error instanceof DOMException && error.name === "NotAllowedError"
    ? "Разрешите доступ к микрофону в настройках браузера."
    : "Не удалось включить микрофон. Проверьте устройство и повторите попытку.";
}

export function cancelRealtimeResponse(channel: RTCDataChannel): void {
  if (channel.readyState === "open") {
    channel.send(JSON.stringify({ type: "response.cancel" }));
  }
}

export async function openMicrophone(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
    },
  });
}

export async function startRealtimeVoice(
  stream: MediaStream,
  audio: HTMLAudioElement,
  voice = "marin",
): Promise<RealtimeVoiceSession> {
  const peer = new RTCPeerConnection();
  const events = peer.createDataChannel("oai-events");
  const stop = () => {
    cancelRealtimeResponse(events);
    events.close();
    peer.close();
    stream.getTracks().forEach((track) => track.stop());
    audio.srcObject = null;
  };

  try {
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));
    peer.ontrack = (event) => {
      audio.srcObject = event.streams[0] ?? new MediaStream([event.track]);
      void audio.play();
    };
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    const response = await fetch(
      `/api/ai/voice/realtime?voice=${encodeURIComponent(voice)}`,
      {
        body: offer.sdp,
        headers: { "content-type": "application/sdp" },
        method: "POST",
      },
    );
    if (!response.ok) throw await responseError(response);
    await peer.setRemoteDescription({
      sdp: await response.text(),
      type: "answer",
    });
    return { kind: "realtime", stop };
  } catch (error) {
    events.close();
    peer.close();
    throw error;
  }
}

export function startRecordedVoice(stream: MediaStream): RecordedVoiceSession {
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.start();

  return {
    kind: "recording",
    stop: () =>
      new Promise<Blob>((resolve, reject) => {
        recorder.onerror = () => reject(new Error("Voice recording failed"));
        recorder.onstop = () => {
          stream.getTracks().forEach((track) => track.stop());
          resolve(
            new Blob(chunks, { type: recorder.mimeType || "audio/webm" }),
          );
        };
        recorder.stop();
      }),
  };
}

export async function transcribeVoice(audio: Blob): Promise<string> {
  const response = await fetch("/api/ai/voice/transcriptions", {
    body: audio,
    headers: { "content-type": audio.type || "audio/webm" },
    method: "POST",
  });
  if (!response.ok) throw await responseError(response);
  const payload = (await response.json()) as { text?: unknown };
  if (typeof payload.text !== "string" || !payload.text.trim()) {
    throw new Error("Речь не распознана. Попробуйте ещё раз.");
  }
  return payload.text.trim();
}

export async function speakVoice(
  text: string,
  audio: HTMLAudioElement,
  voice = "marin",
): Promise<void> {
  const response = await fetch("/api/ai/voice/speech", {
    body: JSON.stringify({ text, voice }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (!response.ok) throw await responseError(response);
  const url = URL.createObjectURL(await response.blob());
  audio.srcObject = null;
  audio.src = url;
  audio.onended = () => URL.revokeObjectURL(url);
  await audio.play();
}
