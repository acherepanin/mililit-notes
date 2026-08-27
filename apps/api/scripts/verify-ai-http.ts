import { createHash, randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createDatabasePool } from "@notes/db";

import { canonicalJsonSha256 } from "../src/ai/canonical-json.js";

const apiUrl = process.env.AI_VERIFY_API_URL ?? "http://localhost:3201/api";
const appOrigin = process.env.APP_ORIGIN ?? "http://localhost:3200";
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://notes_v2:notes_v2_local_only@localhost:55432/notes_v2";
const mailpitUrl = process.env.MAILPIT_URL ?? "http://localhost:18025";
const mockProviderPort = Number(process.env.AI_VERIFY_PROVIDER_PORT ?? 3219);
const mockProviderBaseUrl =
  process.env.AI_VERIFY_PROVIDER_BASE_URL ??
  `http://host.docker.internal:${mockProviderPort}/v1`;
const storageBucket = process.env.OBJECT_STORAGE_BUCKET ?? "notes-v2";
const storage = new S3Client({
  credentials: {
    accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY ?? "notes_v2_local",
    secretAccessKey:
      process.env.OBJECT_STORAGE_SECRET_KEY ?? "notes_v2_local_password",
  },
  endpoint: process.env.OBJECT_STORAGE_ENDPOINT ?? "http://localhost:19000",
  forcePathStyle: true,
  region: process.env.OBJECT_STORAGE_REGION ?? "us-east-1",
});

interface MockProviderCall {
  authorized: boolean;
  body: Record<string, unknown>;
}

interface MockVoiceProviderCall {
  authorized: boolean;
  body: string;
  path: string;
}

const mockProviderCalls: MockProviderCall[] = [];
const mockVoiceProviderCalls: MockVoiceProviderCall[] = [];

async function rawRequestBody(requestValue: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of requestValue) body += String(chunk);
  return body;
}

async function requestBody(
  requestValue: IncomingMessage,
): Promise<Record<string, unknown>> {
  return object(JSON.parse(await rawRequestBody(requestValue)));
}

function writeProviderEvent(response: ServerResponse, value: unknown): void {
  response.write(`data: ${JSON.stringify(value)}\n\n`);
}

const mockProvider = createServer(async (requestValue, response) => {
  try {
    if (requestValue.method !== "POST") {
      response.writeHead(404).end();
      return;
    }
    if (requestValue.url === "/v1/realtime/calls") {
      const body = await rawRequestBody(requestValue);
      mockVoiceProviderCalls.push({
        authorized:
          requestValue.headers.authorization?.startsWith("Bearer ") ?? false,
        body,
        path: requestValue.url,
      });
      response
        .writeHead(200, { "content-type": "application/sdp" })
        .end("v=0\r\no=mock-answer");
      return;
    }
    if (requestValue.url === "/v1/audio/transcriptions") {
      mockVoiceProviderCalls.push({
        authorized:
          requestValue.headers.authorization?.startsWith("Bearer ") ?? false,
        body: await rawRequestBody(requestValue),
        path: requestValue.url,
      });
      response
        .writeHead(200, { "content-type": "application/json" })
        .end(JSON.stringify({ text: "Verified transcript" }));
      return;
    }
    if (requestValue.url === "/v1/audio/speech") {
      mockVoiceProviderCalls.push({
        authorized:
          requestValue.headers.authorization?.startsWith("Bearer ") ?? false,
        body: await rawRequestBody(requestValue),
        path: requestValue.url,
      });
      response
        .writeHead(200, { "content-type": "audio/mpeg" })
        .end(Buffer.from([1, 2, 3]));
      return;
    }
    if (requestValue.url !== "/v1/responses") {
      response.writeHead(404).end();
      return;
    }
    const body = await requestBody(requestValue);
    const model = String(body.model ?? "");
    mockProviderCalls.push({
      authorized:
        requestValue.headers.authorization?.startsWith("Bearer ") ?? false,
      body,
    });
    if (model === "gpt-test") {
      response
        .writeHead(503, { "content-type": "application/json" })
        .end(JSON.stringify({ error: { code: "mock_unavailable" } }));
      return;
    }
    response.writeHead(200, {
      "cache-control": "no-cache",
      "content-type": "text/event-stream",
    });
    const responseId = `resp_${randomUUID()}`;
    writeProviderEvent(response, {
      response: { id: responseId },
      type: "response.created",
    });
    writeProviderEvent(response, {
      delta:
        model === "gpt-test-partial" ? "Partial response" : "Verified response",
      type: "response.output_text.delta",
    });
    if (model === "gpt-test-partial") {
      response.end();
      return;
    }
    writeProviderEvent(response, {
      response: {
        id: responseId,
        model,
        output: [],
        usage: {
          input_tokens: 24,
          input_tokens_details: { cached_tokens: 4 },
          output_tokens: 3,
          output_tokens_details: { reasoning_tokens: 1 },
        },
      },
      type: "response.completed",
    });
    response.end();
  } catch {
    response.writeHead(500).end();
  }
});

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected an object response");
  }
  return value as Record<string, unknown>;
}

async function request(
  path: string,
  options: RequestInit & { expected?: number } = {},
): Promise<{ body: unknown; response: Response }> {
  const response = await fetch(`${apiUrl}${path}`, options);
  const text = await response.text();
  const body: unknown = text ? JSON.parse(text) : null;
  const expected = options.expected ?? 200;
  if (response.status !== expected) {
    throw new Error(`${options.method ?? "GET"} ${path}: ${response.status}`);
  }
  return { body, response };
}

function jsonRequest(method: string, body?: unknown): RequestInit {
  return {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      origin: appOrigin,
    },
    method,
  };
}

function cookies(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";", 1)[0])
    .filter((value): value is string => Boolean(value))
    .join("; ");
}

async function waitForVerificationUrl(email: string): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await fetch(`${mailpitUrl}/api/v1/messages?limit=50`);
    if (!response.ok) throw new Error(`Mailpit list: ${response.status}`);
    const payload = object(await response.json());
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    const message = messages.find((item) =>
      JSON.stringify(item).toLowerCase().includes(email.toLowerCase()),
    );
    if (message) {
      const id = object(message).ID ?? object(message).Id ?? object(message).id;
      if (typeof id !== "string")
        throw new Error("Mailpit message ID is missing");
      const detailResponse = await fetch(`${mailpitUrl}/api/v1/message/${id}`);
      if (!detailResponse.ok) {
        throw new Error(`Mailpit message: ${detailResponse.status}`);
      }
      const source = JSON.stringify(await detailResponse.json())
        .replaceAll("&amp;", "&")
        .replaceAll("\\u0026", "&");
      const link = source.match(
        /https?:\/\/[^\s"'<>]+\/api\/auth\/verify-email\?[^\s"'<>]+/,
      )?.[0];
      if (link) return link.replaceAll("\\/", "/");
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Verification email did not arrive");
}

async function signIn(username: string, password: string): Promise<string> {
  const { response } = await request("/auth/sign-in/username", {
    ...jsonRequest("POST", { password, username }),
  });
  const cookie = cookies(response);
  if (!cookie) throw new Error("Sign-in did not return a session cookie");
  return cookie;
}

function authorized(
  cookie: string,
  method = "GET",
  body?: unknown,
): RequestInit {
  const base = jsonRequest(method, body);
  return {
    ...base,
    headers: { ...base.headers, cookie },
  };
}

async function streamResponse(
  path: string,
  cookie: string,
  body: unknown,
): Promise<string> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...authorized(cookie, "POST", body),
    headers: {
      ...authorized(cookie, "POST", body).headers,
      accept: "text/event-stream",
    },
  });
  const text = await response.text();
  if (response.status !== 201) {
    throw new Error(`POST ${path}: ${response.status} ${text}`);
  }
  if (!response.headers.get("content-type")?.includes("text/event-stream")) {
    throw new Error("AI response did not use text/event-stream");
  }
  return text;
}

function assertEventOrder(stream: string, names: string[]): void {
  let position = -1;
  for (const name of names) {
    const next = stream.indexOf(`event: ${name}`, position + 1);
    if (next < 0) throw new Error(`SSE event ${name} is missing`);
    if (next <= position) throw new Error(`SSE event ${name} is out of order`);
    position = next;
  }
}

function eventData(stream: string, name: string): Record<string, unknown> {
  const block = stream
    .split("\n\n")
    .find((value) => value.includes(`event: ${name}\n`));
  const data = block
    ?.split("\n")
    .find((line) => line.startsWith("data: "))
    ?.slice("data: ".length);
  if (!data) throw new Error(`SSE event ${name} has no data`);
  return object(JSON.parse(data));
}

const nonce = randomUUID().replaceAll("-", "");
const username = `phase7_${nonce.slice(0, 16)}`;
const email = `${username}@notes.local`;
const password = `Phase7-${nonce}-Aa1!`;
const apiKey = `sk-phase7-${nonce}`;
const promptKey = `phase7.${nonce.slice(0, 16)}`;
const pool = createDatabasePool(databaseUrl, { max: 2 });
let userId: number | null = null;
let objectKey: string | null = null;
let mockProviderListening = false;

try {
  await new Promise<void>((resolve, reject) => {
    mockProvider.once("error", reject);
    mockProvider.listen(mockProviderPort, "0.0.0.0", () => {
      mockProvider.off("error", reject);
      mockProviderListening = true;
      resolve();
    });
  });
  await request("/auth/sign-up/email", {
    ...jsonRequest("POST", {
      email,
      language: "ru",
      name: username,
      password,
      theme: "system",
      username,
    }),
    expected: 200,
  });
  const verificationUrl = await waitForVerificationUrl(email);
  const verification = await fetch(verificationUrl, { redirect: "manual" });
  if (![200, 302].includes(verification.status)) {
    throw new Error(`Email verification: ${verification.status}`);
  }

  let cookie = await signIn(username, password);
  const session = object(
    (
      await request("/auth/get-session", {
        headers: { cookie },
      })
    ).body,
  );
  const sessionUser = object(session.user);
  userId = Number(sessionUser.id);
  if (!Number.isSafeInteger(userId) || userId < 1) {
    throw new Error("Session user ID is invalid");
  }

  const note = await pool.query<{ id: number }>(
    `insert into notes (user_id, name, content_text)
     values ($1, $2, $3) returning id`,
    [
      userId,
      `Phase 7 context ${nonce}`,
      "token: phase7-context-secret\nsafe context",
    ],
  );
  const noteId = note.rows[0]?.id;
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nKsAAAAASUVORK5CYII=",
    "base64",
  );
  objectKey = `acceptance/${nonce}.png`;
  await storage.send(
    new PutObjectCommand({
      Body: png,
      Bucket: storageBucket,
      ContentType: "image/png",
      Key: objectKey,
    }),
  );
  const file = await pool.query<{ id: number }>(
    `insert into attachments (
       user_id, note_id, file_name, mime_type, detected_mime_type, size_bytes,
       object_key, storage_status
     ) values ($1, $2, $3, 'image/png', 'image/png', $4, $5, 'ready')
     returning id`,
    [userId, noteId, `phase7-${nonce}.png`, png.byteLength, objectKey],
  );
  const fileId = file.rows[0]?.id;
  if (!noteId || !fileId) throw new Error("AI context fixture insert failed");

  const conversation = object(
    (
      await request("/ai/conversations", {
        ...authorized(cookie, "POST", {
          modelRole: "vision",
          title: "Phase 7 acceptance conversation",
        }),
        expected: 201,
      })
    ).body,
  );
  const conversationId = Number(conversation.id);
  const userMessage = object(
    (
      await request(`/ai/conversations/${conversationId}/messages`, {
        ...authorized(cookie, "POST", {
          context: { fileIds: [fileId], noteIds: [noteId] },
          parts: [
            { text: "Analyze the attached context", type: "text" },
            { fileId, type: "image" },
          ],
        }),
        expected: 201,
      })
    ).body,
  );
  const serializedMessage = JSON.stringify(userMessage);
  if (
    serializedMessage.includes("phase7-context-secret") ||
    !serializedMessage.includes("[secret hidden]") ||
    serializedMessage.includes(`acceptance/${nonce}.png`)
  ) {
    throw new Error("AI context redaction or storage metadata boundary failed");
  }
  await request(`/ai/conversations/${conversationId}/messages`, {
    ...authorized(cookie, "POST", {
      context: { includeSecrets: true, noteIds: [noteId] },
      parts: [{ text: "Read the secret", type: "text" }],
    }),
    expected: 403,
  });
  const messagePage = object(
    (
      await request(`/ai/conversations/${conversationId}/messages?limit=1`, {
        headers: { cookie },
      })
    ).body,
  );
  if (!Array.isArray(messagePage.items) || messagePage.items.length !== 1) {
    throw new Error("AI message history is invalid");
  }
  const conversationPage = object(
    (await request("/ai/conversations?limit=1", { headers: { cookie } })).body,
  );
  if (
    !Array.isArray(conversationPage.items) ||
    !conversationPage.items.some(
      (item) => Number(object(item).id) === conversationId,
    )
  ) {
    throw new Error("AI conversation list is invalid");
  }
  await request(`/ai/conversations/${conversationId}`, {
    ...authorized(cookie, "PATCH", { status: "archived" }),
  });
  await request(`/ai/conversations/${conversationId}/messages`, {
    ...authorized(cookie, "POST", {
      parts: [{ text: "Archived write", type: "text" }],
    }),
    expected: 400,
  });

  const provider = object(
    (
      await request("/ai/providers", {
        ...authorized(cookie, "POST", {
          apiKey,
          baseUrl: mockProviderBaseUrl,
          model: "gpt-test",
          providerName: "Phase 7 acceptance",
        }),
        expected: 201,
      })
    ).body,
  );
  if (
    provider.hasApiKey !== true ||
    JSON.stringify(provider).includes(apiKey)
  ) {
    throw new Error("Provider credential leaked or was not stored");
  }
  const providerId = Number(provider.id);
  await request("/ai/model-routes/chat", {
    ...authorized(cookie, "PUT", {
      fallbackModels: ["gpt-test-fallback"],
      model: "gpt-test",
      providerSettingId: providerId,
      reasoningEffort: "medium",
    }),
  });
  for (const [role, model] of [
    ["voice", "gpt-realtime-test"],
    ["transcription", "gpt-transcribe-test"],
    ["speech", "gpt-speech-test"],
  ]) {
    await request(`/ai/model-routes/${role}`, {
      ...authorized(cookie, "PUT", {
        fallbackModels: [],
        model,
        providerSettingId: providerId,
        reasoningEffort: "none",
      }),
    });
  }
  const routes = (await request("/ai/model-routes", { headers: { cookie } }))
    .body;
  if (
    !Array.isArray(routes) ||
    !routes.some((route) => object(route).role === "chat")
  ) {
    throw new Error("Model route was not persisted");
  }
  const encrypted = await pool.query<{ api_key_encrypted: string }>(
    `select api_key_encrypted
       from ai_provider_settings
      where id = $1 and user_id = $2`,
    [providerId, userId],
  );
  if (
    !encrypted.rows[0]?.api_key_encrypted.startsWith("enc:ai:v1:") ||
    encrypted.rows[0].api_key_encrypted.includes(apiKey)
  ) {
    throw new Error("Provider credential is not encrypted at rest");
  }

  await pool.query("update users set role = 'admin' where id = $1", [userId]);
  await request("/auth/sign-out", { ...authorized(cookie, "POST") });
  cookie = await signIn(username, password);

  const definitions = (
    await request("/admin/ai/prompts", {
      ...authorized(cookie, "POST", {
        description: "Disposable Phase 7 acceptance prompt",
        name: "Phase 7 acceptance",
        promptKey,
        securityPolicyKey: "notes-ai-v1",
      }),
      expected: 201,
    })
  ).body;
  if (!Array.isArray(definitions)) throw new Error("Prompt list is invalid");
  const definition = definitions.find(
    (item) => object(item).promptKey === promptKey,
  );
  if (!definition) throw new Error("Prompt definition was not created");
  const definitionId = Number(object(definition).id);
  await request(`/admin/ai/prompts/${definitionId}/versions`, {
    ...authorized(cookie, "POST", {
      approvalPolicy: { destructive: "always" },
      changeSummary: "Initial acceptance version",
      content: "Answer using the provided Notes context.",
      inputSchema: { type: "object" },
      modelRole: "chat",
      outputSchema: { type: "object" },
      reasoningEffort: "medium",
      retryLimit: 1,
      stopConditions: { maxToolRounds: 4 },
      toolAllowlist: ["notes.read", "notes.delete"],
    }),
    expected: 201,
  });
  await request(`/admin/ai/prompts/${definitionId}/versions/1/review`, {
    ...authorized(cookie, "POST"),
  });
  await request(`/admin/ai/prompts/${definitionId}/versions/1/activate`, {
    ...authorized(cookie, "POST"),
    expected: 409,
  });
  const evalState = object(
    (
      await request(`/admin/ai/prompts/${definitionId}/eval-cases`, {
        ...authorized(cookie, "POST", {
          caseKey: "grounded.safe-answer",
          expected: { schema: "answer" },
          input: { question: "Summarize the provided note" },
          name: "Grounded safe answer",
          thresholds: {
            maxCostUsd: 0.1,
            maxLatencyMs: 5_000,
            minQuality: 0.8,
            requireAuthorization: true,
            requireSchema: true,
          },
        }),
        expected: 201,
      })
    ).body,
  );
  const evalCases = Array.isArray(evalState.cases) ? evalState.cases : [];
  const evalCaseId = Number(object(evalCases[0]).id);
  if (!Number.isSafeInteger(evalCaseId) || evalCaseId < 1) {
    throw new Error("Prompt eval case was not created");
  }
  const evalRun = object(
    (
      await request(`/admin/ai/prompts/${definitionId}/versions/1/eval-runs`, {
        ...authorized(cookie, "POST", {
          evaluator: "promptfoo-acceptance",
          results: [
            {
              authorizationPassed: true,
              caseId: evalCaseId,
              costUsd: 0.02,
              error: null,
              latencyMs: 1_200,
              quality: 0.92,
              schemaValid: true,
            },
          ],
        }),
        expected: 201,
      })
    ).body,
  );
  if (evalRun.status !== "passed") {
    throw new Error("Prompt eval gate did not pass valid evidence");
  }
  await request(`/admin/ai/prompts/${definitionId}/versions/1/activate`, {
    ...authorized(cookie, "POST"),
  });

  const runtimeConversation = object(
    (
      await request("/ai/conversations", {
        ...authorized(cookie, "POST", {
          modelRole: "chat",
          title: "Phase 7 Responses runtime",
        }),
        expected: 201,
      })
    ).body,
  );
  const runtimeConversationId = Number(runtimeConversation.id);
  const successStream = await streamResponse(
    `/ai/conversations/${runtimeConversationId}/responses`,
    cookie,
    {
      context: { fileIds: [fileId], noteIds: [noteId] },
      parts: [
        { text: "Analyze the attached context", type: "text" },
        { fileId, type: "image" },
      ],
      promptKey,
    },
  );
  assertEventOrder(successStream, [
    "message.created",
    "message.retrying",
    "message.started",
    "message.delta",
    "usage.completed",
    "message.completed",
  ]);
  const completed = eventData(successStream, "message.completed");
  const completedMessageId = Number(completed.messageId);
  const recoveredCompleted = object(
    (
      await request(
        `/ai/conversations/${runtimeConversationId}/messages/${completedMessageId}`,
        { headers: { cookie } },
      )
    ).body,
  );
  if (
    recoveredCompleted.status !== "completed" ||
    recoveredCompleted.contentText !== "Verified response"
  ) {
    throw new Error("Completed AI response recovery state is invalid");
  }
  const providerPayload = JSON.stringify(mockProviderCalls.at(-1)?.body);
  if (
    mockProviderCalls.length < 2 ||
    !mockProviderCalls.every((call) => call.authorized) ||
    !providerPayload.includes("input_image") ||
    !providerPayload.includes("data:image/png;base64,") ||
    !providerPayload.includes("[secret hidden]") ||
    providerPayload.includes("phase7-context-secret") ||
    providerPayload.includes(objectKey) ||
    providerPayload.includes(apiKey)
  ) {
    throw new Error("Provider input transport or secret boundary failed");
  }
  const completedUsage = await pool.query<{
    reserved_tokens: number;
    status: string;
  }>(
    `select reserved_tokens, status
       from ai_usage_logs
      where message_id = $1 and user_id = $2`,
    [completedMessageId, userId],
  );
  if (
    completedUsage.rows[0]?.status !== "succeeded" ||
    completedUsage.rows[0]?.reserved_tokens !== 0
  ) {
    throw new Error("Completed AI usage reservation was not released");
  }

  await request("/ai/model-routes/chat", {
    ...authorized(cookie, "PUT", {
      fallbackModels: [],
      model: "gpt-test-partial",
      providerSettingId: providerId,
      reasoningEffort: "medium",
    }),
  });
  const failedConversation = object(
    (
      await request("/ai/conversations", {
        ...authorized(cookie, "POST", {
          modelRole: "chat",
          title: "Phase 7 partial recovery",
        }),
        expected: 201,
      })
    ).body,
  );
  const failedConversationId = Number(failedConversation.id);
  const failedStream = await streamResponse(
    `/ai/conversations/${failedConversationId}/responses`,
    cookie,
    {
      parts: [{ text: "Trigger partial response", type: "text" }],
      promptKey,
    },
  );
  assertEventOrder(failedStream, [
    "message.created",
    "message.started",
    "message.delta",
    "message.failed",
  ]);
  const failed = eventData(failedStream, "message.failed");
  const failedMessageId = Number(failed.messageId);
  const recoveredFailed = object(
    (
      await request(
        `/ai/conversations/${failedConversationId}/messages/${failedMessageId}`,
        { headers: { cookie } },
      )
    ).body,
  );
  if (
    failed.code !== "provider_stream_incomplete" ||
    failed.partialText !== "Partial response" ||
    recoveredFailed.status !== "failed" ||
    recoveredFailed.contentText !== "Partial response" ||
    recoveredFailed.errorCode !== "provider_stream_incomplete"
  ) {
    throw new Error("Partial AI response recovery state is invalid");
  }
  const failedUsage = await pool.query<{
    reserved_tokens: number;
    status: string;
  }>(
    `select reserved_tokens, status
       from ai_usage_logs
      where message_id = $1 and user_id = $2`,
    [failedMessageId, userId],
  );
  if (
    failedUsage.rows[0]?.status !== "failed" ||
    failedUsage.rows[0]?.reserved_tokens !== 0
  ) {
    throw new Error("Failed AI usage reservation was not released");
  }

  const realtimeResponse = await fetch(
    `${apiUrl}/ai/voice/realtime?voice=marin`,
    {
      body: "v=0\r\no=mock-offer",
      headers: {
        "content-type": "application/sdp",
        cookie,
        origin: appOrigin,
      },
      method: "POST",
    },
  );
  const realtimeSdp = await realtimeResponse.text();
  if (
    realtimeResponse.status !== 200 ||
    !realtimeResponse.headers
      .get("content-type")
      ?.includes("application/sdp") ||
    !realtimeSdp.includes("o=mock-answer")
  ) {
    throw new Error("Realtime SDP exchange failed");
  }
  const transcriptionResponse = await fetch(
    `${apiUrl}/ai/voice/transcriptions`,
    {
      body: Buffer.from("mock-webm-audio"),
      headers: {
        "content-type": "audio/webm",
        cookie,
        origin: appOrigin,
      },
      method: "POST",
    },
  );
  const transcription = object(await transcriptionResponse.json());
  if (
    transcriptionResponse.status !== 201 ||
    transcription.text !== "Verified transcript"
  ) {
    throw new Error("Voice transcription fallback failed");
  }
  const speechResponse = await fetch(`${apiUrl}/ai/voice/speech`, {
    ...authorized(cookie, "POST", { text: "Verified answer", voice: "marin" }),
  });
  if (
    speechResponse.status !== 201 ||
    !speechResponse.headers.get("content-type")?.includes("audio/mpeg") ||
    (await speechResponse.arrayBuffer()).byteLength !== 3
  ) {
    throw new Error("Voice speech fallback failed");
  }
  const voicePayload = mockVoiceProviderCalls
    .map((call) => call.body)
    .join("\n");
  if (
    mockVoiceProviderCalls.length !== 3 ||
    !mockVoiceProviderCalls.every((call) => call.authorized) ||
    !voicePayload.includes("gpt-realtime-test") ||
    !voicePayload.includes("gpt-transcribe-test") ||
    !voicePayload.includes("gpt-speech-test") ||
    voicePayload.includes(apiKey)
  ) {
    throw new Error("Voice provider transport or secret boundary failed");
  }

  const client = await pool.connect();
  let confirmationId: number;
  try {
    await client.query("begin");
    const conversation = await client.query<{ id: number }>(
      "insert into ai_conversations (user_id) values ($1) returning id",
      [userId],
    );
    const message = await client.query<{ id: number }>(
      `insert into ai_messages (conversation_id, user_id, sequence, role)
       values ($1, $2, 1, 'assistant') returning id`,
      [conversation.rows[0]?.id, userId],
    );
    const note = await client.query<{ id: number; revision: number }>(
      `insert into notes (user_id, name, position)
       values (
         $1,
         'Tool confirmation acceptance',
         (select coalesce(max(position), -1) + 1
            from notes
           where user_id = $1 and parent_id is null and deleted_at is null)
       )
       returning id, revision`,
      [userId],
    );
    const argumentsValue = {
      noteId: note.rows[0]?.id,
      revision: note.rows[0]?.revision,
    };
    const hash = canonicalJsonSha256(argumentsValue);
    const toolCall = await client.query<{ id: number }>(
      `insert into ai_tool_calls (
         message_id, user_id, tool_name, risk_class, arguments, arguments_hash,
         status, requires_confirmation
       ) values ($1, $2, 'notes.delete', 'destructive', $3, $4,
                 'awaiting_confirmation', true)
       returning id`,
      [message.rows[0]?.id, userId, argumentsValue, hash],
    );
    const confirmation = await client.query<{ id: number }>(
      `insert into ai_tool_confirmations (
         tool_call_id, user_id, arguments_hash, token_hash, expires_at
       ) values ($1, $2, $3, $4, now() + interval '10 minutes')
       returning id`,
      [
        toolCall.rows[0]?.id,
        userId,
        hash,
        createHash("sha256").update(randomUUID()).digest("hex"),
      ],
    );
    confirmationId = confirmation.rows[0]?.id ?? 0;
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  await request(`/ai/tool-confirmations/${confirmationId}/approve`, {
    ...authorized(cookie, "POST"),
  });
  await request(`/ai/tool-confirmations/${confirmationId}/approve`, {
    ...authorized(cookie, "POST"),
    expected: 409,
  });
  const state = await pool.query<{ confirmation: string; tool_call: string }>(
    `select c.status as confirmation, t.status as tool_call
       from ai_tool_confirmations c
       join ai_tool_calls t on t.id = c.tool_call_id
      where c.id = $1 and c.user_id = $2`,
    [confirmationId, userId],
  );
  if (
    state.rows[0]?.confirmation !== "consumed" ||
    state.rows[0].tool_call !== "succeeded"
  ) {
    throw new Error("Tool confirmation state transition failed");
  }

  console.log(
    "AI HTTP verification passed: auth, contexts, encrypted provider, prompts, Responses SSE, fallback, recovery, usage, voice, confirmation",
  );
} finally {
  if (objectKey !== null) {
    await storage
      .send(new DeleteObjectCommand({ Bucket: storageBucket, Key: objectKey }))
      .catch(() => undefined);
  }
  if (userId !== null) {
    await pool.query(
      "delete from ai_prompt_definitions where prompt_key = $1",
      [promptKey],
    );
    await pool.query("delete from users where id = $1", [userId]);
  }
  await pool.end();
  if (mockProviderListening) {
    await new Promise<void>((resolve, reject) => {
      mockProvider.close((error) => (error ? reject(error) : resolve()));
    });
  }
}
