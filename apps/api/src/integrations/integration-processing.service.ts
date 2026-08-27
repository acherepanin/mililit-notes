import { basename } from "node:path";
import { randomInt } from "node:crypto";

import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { IntegrationEventJob } from "@notes/config";
import { activityLogs, aiBotWebhookEvents } from "@notes/db";
import { and, eq } from "drizzle-orm";
import { Api } from "grammy";
import { VK } from "vk-io";

import { AiConversationService } from "../ai/ai-conversation.service.js";
import { AiPolicyService } from "../ai/ai-policy.service.js";
import { AiResponseService } from "../ai/ai-response.service.js";
import type { AiToolName } from "../ai/ai-tool-registry.js";
import { AiToolExecutionService } from "../ai/ai-tool-execution.service.js";
import { ToolConfirmationService } from "../ai/tool-confirmation.service.js";
import { VoiceService } from "../ai/voice.service.js";
import { DatabaseService } from "../database/database.service.js";
import { EntitlementsService } from "../entitlements/entitlements.service.js";
import { FilesService } from "../files/files.service.js";
import { IntegrationPendingActionsService } from "./integration-pending-actions.service.js";
import { IntegrationSettingsService } from "./integration-settings.service.js";
import type { IntegrationProvider } from "./integrations.types.js";

const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 30_000;
const MESSAGE_CHUNK = 3_500;

interface IncomingFile {
  fileId?: string;
  fileName: string;
  mimeType: string;
  sourceUrl?: string;
  type: "file" | "image" | "voice";
}

interface IncomingMessage {
  chatId: string;
  externalId: string;
  files: IncomingFile[];
  provider: IntegrationProvider;
  text: string;
  username: string | null;
}

interface BotToolPermissions {
  accessMode: string;
  allowAttachments: boolean;
  allowNoteDelete: boolean;
  allowNoteRead: boolean;
  allowNoteWrite: boolean;
  allowShareLinks: boolean;
  allowTags: boolean;
  allowTemplates: boolean;
  allowVersions: boolean;
}

type AdminRow = Awaited<
  ReturnType<IntegrationSettingsService["getRuntimeAdminSettings"]>
>;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function id(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  return typeof value === "number" && Number.isSafeInteger(value)
    ? String(value)
    : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : "unknown_error")
    .replaceAll(/[\r\n]/g, " ")
    .slice(0, 500);
}

export function integrationToolAllowlist(
  user: BotToolPermissions,
): AiToolName[] {
  return [
    ...(user.allowNoteRead
      ? (["notes.read", "notes.search", "notes.semanticSearch"] as const)
      : []),
    ...(user.accessMode === "write" && user.allowNoteWrite
      ? ([
          "notes.create",
          "notes.createNestedBatch",
          "notes.favorite.set",
          "notes.pinned.set",
          "notes.restore",
          "notes.update",
        ] as const)
      : []),
    ...(user.accessMode === "write" && user.allowNoteDelete
      ? (["notes.delete", "notes.deleteAll"] as const)
      : []),
    ...(user.accessMode === "write" && user.allowTags
      ? (["notes.autotag", "notes.tags.set"] as const)
      : []),
    ...(user.allowAttachments ? (["attachments.list"] as const) : []),
    ...(user.accessMode === "write" && user.allowAttachments
      ? (["attachments.attachToNote"] as const)
      : []),
    ...(user.allowTemplates ? (["templates.list"] as const) : []),
    ...(user.accessMode === "write" && user.allowTemplates
      ? (["templates.createNote"] as const)
      : []),
    ...(user.allowVersions ? (["versions.list"] as const) : []),
    ...(user.accessMode === "write" && user.allowVersions
      ? (["versions.restore"] as const)
      : []),
    ...(user.accessMode === "write" && user.allowShareLinks
      ? (["shareLinks.create"] as const)
      : []),
  ];
}

@Injectable()
export class IntegrationProcessingService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(IntegrationSettingsService)
    private readonly settings: IntegrationSettingsService,
    @Inject(AiConversationService)
    private readonly conversations: AiConversationService,
    @Inject(AiResponseService) private readonly responses: AiResponseService,
    @Inject(AiPolicyService) private readonly aiPolicy: AiPolicyService,
    @Inject(ToolConfirmationService)
    private readonly confirmations: ToolConfirmationService,
    @Inject(AiToolExecutionService)
    private readonly toolExecution: AiToolExecutionService,
    @Inject(IntegrationPendingActionsService)
    private readonly pendingActions: IntegrationPendingActionsService,
    @Inject(VoiceService) private readonly voice: VoiceService,
    @Inject(FilesService) private readonly files: FilesService,
    @Inject(EntitlementsService)
    private readonly entitlements: EntitlementsService,
  ) {}

  async process(job: IntegrationEventJob): Promise<{ duplicate: boolean }> {
    const [ledger] = await this.database.client
      .select()
      .from(aiBotWebhookEvents)
      .where(
        and(
          eq(aiBotWebhookEvents.id, job.ledgerId),
          eq(aiBotWebhookEvents.provider, job.provider),
          eq(aiBotWebhookEvents.eventId, job.eventId),
          eq(aiBotWebhookEvents.correlationId, job.correlationId),
        ),
      )
      .limit(1);
    if (!ledger) throw new NotFoundException("Integration event was not found");
    if (ledger.status === "succeeded") return { duplicate: true };

    const admin = await this.settings.getRuntimeAdminSettings(job.provider);
    const incoming = this.parseIncoming(job);
    if (incoming) {
      try {
        await this.handle(admin, incoming);
      } catch (error) {
        if (!(error instanceof HttpException) || error.getStatus() >= 500) {
          throw error;
        }
        await this.send(
          admin,
          incoming,
          `Не удалось выполнить запрос: ${error.message}`,
        );
      }
    }
    await this.database.client
      .update(aiBotWebhookEvents)
      .set({
        completedAt: new Date(),
        lastError: null,
        lockedAt: null,
        status: "succeeded",
        updatedAt: new Date(),
      })
      .where(eq(aiBotWebhookEvents.id, job.ledgerId));
    return { duplicate: false };
  }

  private async handle(
    admin: AdminRow,
    message: IncomingMessage,
  ): Promise<void> {
    const linkCode = this.linkCode(message.text);
    if (linkCode) {
      await this.settings.consumeLinkCode(
        message.provider,
        linkCode,
        message.externalId,
        message.username,
      );
      await this.send(admin, message, "Аккаунт привязан к Notes AI.");
      return;
    }
    const linked = await this.settings.findLinkedUser(
      message.provider,
      message.externalId,
    );
    if (!linked) {
      await this.send(
        admin,
        message,
        "Аккаунт не привязан. Создайте код в Настройки -> Интеграции и отправьте его сюда.",
      );
      return;
    }
    const command = message.text.toLowerCase();
    if (["/help", "help", "помощь", "/start"].includes(command)) {
      await this.send(
        admin,
        message,
        "Отправьте текст, голосовое сообщение или файл. /unlink отключит этот аккаунт.",
      );
      return;
    }
    if (["/unlink", "unlink", "отвязать"].includes(command)) {
      await this.settings.unlink(linked.userId, message.provider);
      await this.send(admin, message, "Аккаунт отвязан от Notes AI.");
      return;
    }

    const action = command.match(/^\/?(confirm|cancel)\s+(\d+)$/i);
    if (action) {
      await this.handlePendingAction(
        admin,
        linked.userId,
        message,
        action[1] === "confirm" ? "approved" : "rejected",
        Number(action[2]),
      );
      return;
    }

    const user = await this.settings.reserveUsage(
      linked.userId,
      message.provider,
      "message",
    );
    let prompt = message.text;
    const voiceFile = message.files.find((file) => file.type === "voice");
    if (!prompt && voiceFile) {
      const audio = await this.download(admin, voiceFile);
      prompt = (
        await this.voice.transcribe(user.userId, audio, voiceFile.mimeType)
      ).text;
    }
    const inputFiles = message.files.filter((file) => file.type !== "voice");
    if (inputFiles.length > 0 && !user.allowAttachments) {
      throw new BadRequestException(
        "Доступ к файлам выключен в настройках интеграции",
      );
    }
    const fileParts: Array<{ fileId: number; type: "file" | "image" }> = [];
    for (const file of inputFiles.slice(0, 4)) {
      const content = await this.download(admin, file);
      const stored = await this.files.ingestBuffer(user.userId, {
        content,
        fileName: file.fileName,
        mimeType: file.mimeType,
      });
      fileParts.push({
        fileId: stored.id,
        type: file.type === "image" ? "image" : "file",
      });
    }
    if (!prompt && fileParts.length > 0)
      prompt = "Проанализируй приложенные файлы.";
    if (!prompt)
      throw new BadRequestException("Отправьте текст, голос или файл");
    const conversationId =
      await this.conversations.getOrCreateChannelConversation(
        user.userId,
        message.provider,
      );
    const allowedTools = await this.entitlements.integrationToolAllowlist(
      user.userId,
      integrationToolAllowlist(user),
    );
    const answer = await this.responses.complete(
      user.userId,
      conversationId,
      {
        context: {
          fileIds: fileParts.map((part) => part.fileId),
          includeSecrets: Boolean(admin.allowSecrets && user.allowSecrets),
          noteIds: [],
        },
        parts: [{ text: prompt, type: "text" }, ...fileParts],
        promptKey: "notes.assistant",
      },
      {
        allowedTools,
        beforeToolExecution: async (toolName) =>
          this.reserveToolUsage(user.userId, message.provider, toolName),
        forceToolConfirmation: admin.requireConfirmation,
      },
    );
    const confirmations = [];
    for (const pending of answer.pendingConfirmations) {
      const created = await this.pendingActions.create({
        actionName: pending.toolName,
        actionPayload: {
          confirmationId: pending.confirmationId,
          toolCallId: pending.toolCallId,
        },
        expiresAt: new Date(pending.expiresAt),
        externalId: message.externalId,
        provider: message.provider,
        userId: user.userId,
      });
      confirmations.push(
        `${pending.toolName}: /confirm ${created.id} или /cancel ${created.id}`,
      );
    }
    await this.send(
      admin,
      message,
      [answer.text, ...confirmations].filter(Boolean).join("\n\n") || "Готово.",
    );
    await this.database.client.insert(activityLogs).values({
      action: "ai.bot.message",
      actorId: user.userId,
      details: {
        externalId: message.externalId,
        fileCount: fileParts.length,
        hasVoice: Boolean(voiceFile),
        messageLength: prompt.length,
        provider: message.provider,
      },
      targetType: "integration",
      userId: user.userId,
    });
  }

  private async handlePendingAction(
    admin: AdminRow,
    userId: number,
    message: IncomingMessage,
    decision: "approved" | "rejected",
    pendingId: number,
  ): Promise<void> {
    const claim = await this.pendingActions.claim(
      userId,
      message.provider,
      message.externalId,
      pendingId,
    );
    if (claim.kind === "terminal") {
      await this.send(admin, message, claim.responseText);
      return;
    }
    const pending = claim.action;
    const confirmationId = Number(pending.actionPayload.confirmationId);
    const toolCallId = Number(pending.actionPayload.toolCallId);
    if (
      !Number.isSafeInteger(confirmationId) ||
      !Number.isSafeInteger(toolCallId)
    ) {
      await this.pendingActions.finish(
        pending.id,
        userId,
        "failed",
        "Действие не выполнено: некорректные данные подтверждения.",
        "invalid_pending_action_payload",
      );
      throw new BadRequestException("Pending action payload is invalid");
    }
    if (decision === "rejected") {
      const responseText = "Действие отменено.";
      try {
        await this.confirmations.decide(userId, confirmationId, "rejected");
        await this.pendingActions.finish(
          pending.id,
          userId,
          "rejected",
          responseText,
        );
      } catch (error) {
        await this.pendingActions.release(pending.id, userId, safeError(error));
        throw error;
      }
      await this.send(admin, message, responseText);
      return;
    }
    let decisionCommitted = false;
    let terminalCommitted = false;
    try {
      const current = await this.settings.findLinkedUser(
        message.provider,
        message.externalId,
      );
      const allowedTools = current
        ? await this.entitlements.integrationToolAllowlist(
            current.userId,
            integrationToolAllowlist(current),
          )
        : [];
      const actionName = allowedTools.find(
        (tool) => tool === pending.actionName,
      );
      if (!current || !actionName) {
        throw new ForbiddenException("Tool permission is no longer available");
      }
      await this.reserveToolUsage(userId, message.provider, actionName);
      const approved = await this.confirmations.decide(
        userId,
        confirmationId,
        "approved",
      );
      decisionCommitted = true;
      if (approved.toolCallId !== toolCallId) {
        throw new BadRequestException(
          "Pending action does not match confirmation",
        );
      }
      const result = await this.toolExecution.execute(userId, toolCallId);
      const responseText = `Действие выполнено: ${pending.actionName}\n${JSON.stringify(result)}`;
      await this.pendingActions.finish(
        pending.id,
        userId,
        "succeeded",
        responseText,
      );
      terminalCommitted = true;
      await this.send(admin, message, responseText);
    } catch (error) {
      if (terminalCommitted) {
        throw error;
      } else if (decisionCommitted) {
        await this.pendingActions.finish(
          pending.id,
          userId,
          "failed",
          `Действие не выполнено: ${pending.actionName}.`,
          safeError(error),
        );
      } else {
        await this.pendingActions.release(pending.id, userId, safeError(error));
      }
      throw error;
    }
  }

  private async reserveToolUsage(
    userId: number,
    provider: IntegrationProvider,
    toolName: AiToolName,
  ): Promise<void> {
    await this.settings.reserveUsage(
      userId,
      provider,
      this.aiPolicy.riskFor(toolName) === "read_only" ? "read" : "write",
    );
  }

  private parseIncoming(job: IntegrationEventJob): IncomingMessage | null {
    return job.provider === "telegram"
      ? this.parseTelegram(job.payload)
      : this.parseVk(job.payload);
  }

  private parseTelegram(
    payload: Record<string, unknown>,
  ): IncomingMessage | null {
    const message = record(payload.message);
    const from = record(message.from);
    const chat = record(message.chat);
    const externalId = id(from.id);
    const chatId = id(chat.id);
    if (!externalId || !chatId) return null;
    const files: IncomingFile[] = [];
    const voice = record(message.voice ?? message.audio);
    const voiceId = id(voice.file_id);
    if (voiceId) {
      files.push({
        fileId: voiceId,
        fileName: text(voice.file_name) || "telegram-voice.ogg",
        mimeType: text(voice.mime_type) || "audio/ogg",
        type: "voice",
      });
    }
    const document = record(message.document);
    const documentId = id(document.file_id);
    if (documentId) {
      files.push({
        fileId: documentId,
        fileName: text(document.file_name) || "telegram-file",
        mimeType: text(document.mime_type) || "application/octet-stream",
        type: "file",
      });
    }
    const photos = Array.isArray(message.photo)
      ? message.photo.map(record)
      : [];
    const photoId = id(photos.at(-1)?.file_id);
    if (photoId) {
      files.push({
        fileId: photoId,
        fileName: "telegram-photo.jpg",
        mimeType: "image/jpeg",
        type: "image",
      });
    }
    const body = text(message.text) || text(message.caption);
    if (!body && files.length === 0) return null;
    return {
      chatId,
      externalId,
      files,
      provider: "telegram",
      text: body,
      username: text(from.username) || null,
    };
  }

  private parseVk(payload: Record<string, unknown>): IncomingMessage | null {
    const message = record(record(payload.object).message);
    const externalId = id(message.from_id);
    const chatId = id(message.peer_id);
    if (!externalId || !chatId) return null;
    const files: IncomingFile[] = [];
    for (const raw of Array.isArray(message.attachments)
      ? message.attachments
      : []) {
      const attachment = record(raw);
      if (attachment.type === "audio_message") {
        const audio = record(attachment.audio_message);
        const url = text(audio.link_ogg) || text(audio.link_mp3);
        if (url)
          files.push({
            fileName: url.includes(".mp3") ? "vk-voice.mp3" : "vk-voice.ogg",
            mimeType: url.includes(".mp3") ? "audio/mpeg" : "audio/ogg",
            sourceUrl: url,
            type: "voice",
          });
      } else if (attachment.type === "doc") {
        const document = record(attachment.doc);
        const url = text(document.url);
        if (url)
          files.push({
            fileName: text(document.title) || "vk-file",
            mimeType: "application/octet-stream",
            sourceUrl: url,
            type: "file",
          });
      } else if (attachment.type === "photo") {
        const photo = record(attachment.photo);
        const sizes = Array.isArray(photo.sizes) ? photo.sizes.map(record) : [];
        const url = text(sizes.at(-1)?.url);
        if (url)
          files.push({
            fileName: "vk-photo.jpg",
            mimeType: "image/jpeg",
            sourceUrl: url,
            type: "image",
          });
      }
    }
    const body = text(message.text);
    if (!body && files.length === 0) return null;
    return {
      chatId,
      externalId,
      files,
      provider: "vk",
      text: body,
      username: null,
    };
  }

  private async download(admin: AdminRow, file: IncomingFile): Promise<Buffer> {
    let source = file.sourceUrl;
    if (!source && file.fileId) {
      const token = this.settings.decryptSecret(admin.botTokenEncrypted);
      if (!token)
        throw new BadRequestException("Telegram bot token is not configured");
      const remote = await new Api(token).getFile(file.fileId);
      if (!remote.file_path)
        throw new BadRequestException("Telegram file is unavailable");
      if (remote.file_size && remote.file_size > MAX_DOWNLOAD_BYTES) {
        throw new BadRequestException("Файл превышает лимит 20 МБ");
      }
      source = `https://api.telegram.org/file/bot${token}/${remote.file_path}`;
      file.fileName = basename(remote.file_path) || file.fileName;
    }
    if (!source) throw new BadRequestException("File URL is unavailable");
    const url = new URL(source);
    if (url.protocol !== "https:")
      throw new BadRequestException("File URL must use HTTPS");
    const response = await fetch(url, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    const declared = Number(response.headers.get("content-length"));
    if (!response.ok)
      throw new BadRequestException(
        `File download returned ${response.status}`,
      );
    if (Number.isFinite(declared) && declared > MAX_DOWNLOAD_BYTES) {
      throw new BadRequestException("Файл превышает лимит 20 МБ");
    }
    const content = Buffer.from(await response.arrayBuffer());
    if (content.length < 1 || content.length > MAX_DOWNLOAD_BYTES) {
      throw new BadRequestException("Файл пуст или превышает лимит 20 МБ");
    }
    return content;
  }

  private async send(
    admin: AdminRow,
    message: IncomingMessage,
    value: string,
  ): Promise<void> {
    const chunks = this.chunks(value.trim() || "Готово.");
    if (message.provider === "telegram") {
      const token = this.settings.decryptSecret(admin.botTokenEncrypted);
      if (!token)
        throw new BadRequestException("Telegram bot token is not configured");
      const api = new Api(token);
      for (const chunk of chunks) await api.sendMessage(message.chatId, chunk);
      return;
    }
    const token = this.settings.decryptSecret(admin.accessTokenEncrypted);
    if (!token)
      throw new BadRequestException("VK access token is not configured");
    const vk = new VK({ token });
    for (const chunk of chunks) {
      await vk.api.messages.send({
        message: chunk,
        peer_id: Number(message.chatId),
        random_id: randomInt(1, 2_147_483_647),
      });
    }
  }

  private chunks(value: string): string[] {
    const characters = Array.from(value);
    const chunks: string[] = [];
    for (let index = 0; index < characters.length; index += MESSAGE_CHUNK) {
      chunks.push(characters.slice(index, index + MESSAGE_CHUNK).join(""));
    }
    return chunks.slice(0, 20);
  }

  private linkCode(value: string): string | null {
    const match = value.match(
      /^(?:\/start|\/link|link|код|привязать)?\s*([a-z0-9]{4}(?:[-\s]?[a-z0-9]{4}){3,11})$/i,
    );
    return match?.[1] ?? null;
  }
}
