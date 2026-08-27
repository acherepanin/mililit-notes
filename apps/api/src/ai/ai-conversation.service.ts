import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  aiAuditLogs,
  aiConversations,
  aiMessages,
  aiUserSettings,
  attachments,
  notes,
} from "@notes/db";
import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";

import { DatabaseService } from "../database/database.service.js";
import { SecretFieldCryptoService } from "../notes/secret-field-crypto.service.js";
import type {
  ConversationListInput,
  CreateConversationInput,
  CreateMessageInput,
  JsonObject,
  MessageListInput,
  UpdateConversationInput,
} from "./ai.types.js";
import { encodeConversationCursor } from "./ai.validation.js";

type ConversationRow = typeof aiConversations.$inferSelect;
type MessageRow = typeof aiMessages.$inferSelect;

@Injectable()
export class AiConversationService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(SecretFieldCryptoService)
    private readonly secretFields: SecretFieldCryptoService,
  ) {}

  async list(userId: number, input: ConversationListInput) {
    const cursorCondition = input.cursor
      ? or(
          lt(aiConversations.updatedAt, input.cursor.updatedAt),
          and(
            eq(aiConversations.updatedAt, input.cursor.updatedAt),
            lt(aiConversations.id, input.cursor.id),
          ),
        )
      : undefined;
    const rows = await this.database.client
      .select()
      .from(aiConversations)
      .where(
        and(
          eq(aiConversations.userId, userId),
          eq(aiConversations.status, input.status),
          cursorCondition,
        ),
      )
      .orderBy(desc(aiConversations.updatedAt), desc(aiConversations.id))
      .limit(input.limit + 1);
    const hasMore = rows.length > input.limit;
    const page = rows.slice(0, input.limit);
    const last = page.at(-1);
    return {
      items: page.map((row) => this.mapConversation(row)),
      nextCursor:
        hasMore && last
          ? encodeConversationCursor(last.updatedAt, last.id)
          : null,
    };
  }

  async get(userId: number, id: number) {
    return this.mapConversation(await this.requireConversation(userId, id));
  }

  async create(userId: number, input: CreateConversationInput) {
    const row = await this.database.client.transaction(async (tx) => {
      const [created] = await tx
        .insert(aiConversations)
        .values({
          channel: "web",
          modelRole: input.modelRole,
          title: input.title,
          userId,
        })
        .returning();
      if (!created) throw new Error("AI conversation insert failed");
      await tx.insert(aiAuditLogs).values({
        action: "ai.conversations.create",
        details: { modelRole: input.modelRole },
        targetId: created.id,
        targetType: "ai_conversation",
        userId,
      });
      return created;
    });
    return this.mapConversation(row);
  }

  async getOrCreateChannelConversation(
    userId: number,
    channel: "telegram" | "vk",
  ): Promise<number> {
    return this.database.client.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(${userId}, ${channel === "telegram" ? 1 : 2})`,
      );
      const [existing] = await tx
        .select({ id: aiConversations.id })
        .from(aiConversations)
        .where(
          and(
            eq(aiConversations.userId, userId),
            eq(aiConversations.channel, channel),
            eq(aiConversations.status, "active"),
          ),
        )
        .orderBy(desc(aiConversations.updatedAt), desc(aiConversations.id))
        .limit(1);
      if (existing) return existing.id;
      const [created] = await tx
        .insert(aiConversations)
        .values({
          channel,
          modelRole: "chat",
          title: channel === "telegram" ? "Telegram" : "VK",
          userId,
        })
        .returning({ id: aiConversations.id });
      if (!created) throw new Error("Channel conversation insert failed");
      await tx.insert(aiAuditLogs).values({
        action: "ai.conversations.create",
        details: { channel, modelRole: "chat" },
        targetId: created.id,
        targetType: "ai_conversation",
        userId,
      });
      return created.id;
    });
  }

  async update(userId: number, id: number, input: UpdateConversationInput) {
    const row = await this.database.client.transaction(async (tx) => {
      const [updated] = await tx
        .update(aiConversations)
        .set({ ...input, updatedAt: new Date() })
        .where(
          and(eq(aiConversations.id, id), eq(aiConversations.userId, userId)),
        )
        .returning();
      if (!updated)
        throw new NotFoundException("AI conversation was not found");
      await tx.insert(aiAuditLogs).values({
        action: "ai.conversations.update",
        details: { fields: Object.keys(input) },
        targetId: id,
        targetType: "ai_conversation",
        userId,
      });
      return updated;
    });
    return this.mapConversation(row);
  }

  async delete(userId: number, id: number): Promise<{ id: number }> {
    return this.database.client.transaction(async (tx) => {
      const [deleted] = await tx
        .delete(aiConversations)
        .where(
          and(eq(aiConversations.id, id), eq(aiConversations.userId, userId)),
        )
        .returning({ id: aiConversations.id });
      if (!deleted)
        throw new NotFoundException("AI conversation was not found");
      await tx.insert(aiAuditLogs).values({
        action: "ai.conversations.delete",
        details: {},
        targetId: id,
        targetType: "ai_conversation",
        userId,
      });
      return deleted;
    });
  }

  async listMessages(userId: number, id: number, input: MessageListInput) {
    await this.requireConversation(userId, id);
    const rows = await this.database.client
      .select()
      .from(aiMessages)
      .where(
        and(
          eq(aiMessages.conversationId, id),
          eq(aiMessages.userId, userId),
          input.beforeSequence === null
            ? undefined
            : lt(aiMessages.sequence, input.beforeSequence),
        ),
      )
      .orderBy(desc(aiMessages.sequence))
      .limit(input.limit + 1);
    const hasMore = rows.length > input.limit;
    const page = rows.slice(0, input.limit);
    return {
      items: page.toReversed().map((row) => this.mapMessage(row)),
      nextBeforeSequence:
        hasMore && page.length > 0 ? page.at(-1)?.sequence : null,
    };
  }

  async getMessage(userId: number, conversationId: number, messageId: number) {
    const [row] = await this.database.client
      .select()
      .from(aiMessages)
      .where(
        and(
          eq(aiMessages.id, messageId),
          eq(aiMessages.conversationId, conversationId),
          eq(aiMessages.userId, userId),
        ),
      )
      .limit(1);
    if (!row) throw new NotFoundException("AI message was not found");
    return this.mapMessage(row);
  }

  async getRuntimeConversation(userId: number, id: number) {
    const row = await this.requireConversation(userId, id);
    if (row.status !== "active") {
      throw new BadRequestException("Archived conversations are read-only");
    }
    return { id: row.id, modelRole: row.modelRole };
  }

  async createTurn(
    userId: number,
    conversationId: number,
    input: CreateMessageInput,
    execution: {
      model: string;
      promptVersionId: number | null;
      providerName: string;
    },
  ) {
    const content = await this.resolveContent(userId, input);
    const contentText = input.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n\n");
    const now = new Date();
    return this.database.client.transaction(async (tx) => {
      const [conversation] = await tx
        .select({ id: aiConversations.id, status: aiConversations.status })
        .from(aiConversations)
        .where(
          and(
            eq(aiConversations.id, conversationId),
            eq(aiConversations.userId, userId),
          ),
        )
        .for("update")
        .limit(1);
      if (!conversation) {
        throw new NotFoundException("AI conversation was not found");
      }
      if (conversation.status !== "active") {
        throw new BadRequestException("Archived conversations are read-only");
      }
      const [sequenceRow] = await tx
        .select({
          value:
            sql<number>`coalesce(max(${aiMessages.sequence}), 0) + 1`.mapWith(
              Number,
            ),
        })
        .from(aiMessages)
        .where(eq(aiMessages.conversationId, conversationId));
      const userSequence = sequenceRow?.value ?? 1;
      const [userMessage] = await tx
        .insert(aiMessages)
        .values({
          completedAt: now,
          content,
          contentText,
          conversationId,
          role: "user",
          sequence: userSequence,
          startedAt: now,
          status: "completed",
          userId,
        })
        .returning();
      const [assistantMessage] = await tx
        .insert(aiMessages)
        .values({
          content: [],
          conversationId,
          model: execution.model,
          promptVersionId: execution.promptVersionId,
          providerName: execution.providerName,
          role: "assistant",
          sequence: userSequence + 1,
          startedAt: now,
          status: "pending",
          userId,
        })
        .returning();
      if (!userMessage || !assistantMessage) {
        throw new Error("AI turn insert failed");
      }
      await tx
        .update(aiConversations)
        .set({ lastMessageAt: now, updatedAt: now })
        .where(
          and(
            eq(aiConversations.id, conversationId),
            eq(aiConversations.userId, userId),
          ),
        );
      await tx.insert(aiAuditLogs).values({
        action: "ai.responses.create",
        details: {
          contextFileCount: input.context.fileIds.length,
          contextNoteCount: input.context.noteIds.length,
          model: execution.model,
          partCount: input.parts.length,
          promptVersionId: execution.promptVersionId,
        },
        targetId: assistantMessage.id,
        targetType: "ai_message",
        userId,
      });
      return { assistantMessage, userMessage };
    });
  }

  async markAssistantStreaming(
    userId: number,
    messageId: number,
    model: string,
    providerResponseId: string,
  ): Promise<void> {
    await this.database.client
      .update(aiMessages)
      .set({ model, providerResponseId, status: "streaming" })
      .where(
        and(
          eq(aiMessages.id, messageId),
          eq(aiMessages.userId, userId),
          eq(aiMessages.role, "assistant"),
          inArray(aiMessages.status, ["pending", "streaming"]),
        ),
      );
  }

  async saveAssistantPartial(
    userId: number,
    messageId: number,
    text: string,
  ): Promise<void> {
    await this.database.client
      .update(aiMessages)
      .set({
        content: text ? [{ text, type: "output_text" }] : [],
        contentText: text,
        status: "streaming",
      })
      .where(
        and(
          eq(aiMessages.id, messageId),
          eq(aiMessages.userId, userId),
          eq(aiMessages.role, "assistant"),
          inArray(aiMessages.status, ["pending", "streaming"]),
        ),
      );
  }

  async completeAssistant(
    userId: number,
    messageId: number,
    text: string,
    model: string,
    providerResponseId: string,
  ): Promise<void> {
    await this.database.client
      .update(aiMessages)
      .set({
        completedAt: new Date(),
        content: text ? [{ text, type: "output_text" }] : [],
        contentText: text,
        errorCode: null,
        model,
        providerResponseId,
        status: "completed",
      })
      .where(
        and(
          eq(aiMessages.id, messageId),
          eq(aiMessages.userId, userId),
          eq(aiMessages.role, "assistant"),
          inArray(aiMessages.status, ["pending", "streaming"]),
        ),
      );
  }

  async failAssistant(
    userId: number,
    messageId: number,
    text: string,
    code: string,
    providerResponseId: string | null,
  ): Promise<void> {
    await this.database.client
      .update(aiMessages)
      .set({
        completedAt: new Date(),
        content: text ? [{ text, type: "output_text" }] : [],
        contentText: text,
        errorCode: code,
        ...(providerResponseId ? { providerResponseId } : {}),
        status: "failed",
      })
      .where(
        and(
          eq(aiMessages.id, messageId),
          eq(aiMessages.userId, userId),
          eq(aiMessages.role, "assistant"),
          inArray(aiMessages.status, ["pending", "streaming"]),
        ),
      );
  }

  async createMessage(userId: number, id: number, input: CreateMessageInput) {
    const content = await this.resolveContent(userId, input);
    const contentText = input.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n\n");
    const now = new Date();
    const row = await this.database.client.transaction(async (tx) => {
      const [conversation] = await tx
        .select({ id: aiConversations.id, status: aiConversations.status })
        .from(aiConversations)
        .where(
          and(eq(aiConversations.id, id), eq(aiConversations.userId, userId)),
        )
        .for("update")
        .limit(1);
      if (!conversation) {
        throw new NotFoundException("AI conversation was not found");
      }
      if (conversation.status !== "active") {
        throw new BadRequestException("Archived conversations are read-only");
      }
      const [sequenceRow] = await tx
        .select({
          value:
            sql<number>`coalesce(max(${aiMessages.sequence}), 0) + 1`.mapWith(
              Number,
            ),
        })
        .from(aiMessages)
        .where(eq(aiMessages.conversationId, id));
      const [created] = await tx
        .insert(aiMessages)
        .values({
          completedAt: now,
          content,
          contentText,
          conversationId: id,
          role: "user",
          sequence: sequenceRow?.value ?? 1,
          startedAt: now,
          status: "completed",
          userId,
        })
        .returning();
      if (!created) throw new Error("AI message insert failed");
      await tx
        .update(aiConversations)
        .set({ lastMessageAt: now, updatedAt: now })
        .where(
          and(eq(aiConversations.id, id), eq(aiConversations.userId, userId)),
        );
      await tx.insert(aiAuditLogs).values({
        action: "ai.messages.create",
        details: {
          contextFileCount: input.context.fileIds.length,
          contextNoteCount: input.context.noteIds.length,
          partCount: input.parts.length,
          secretsIncluded: input.context.includeSecrets,
        },
        targetId: created.id,
        targetType: "ai_message",
        userId,
      });
      return created;
    });
    return this.mapMessage(row);
  }

  private async resolveContent(
    userId: number,
    input: CreateMessageInput,
  ): Promise<JsonObject[]> {
    if (input.context.includeSecrets) {
      const [settings] = await this.database.client
        .select({ allowReadSecrets: aiUserSettings.allowReadSecrets })
        .from(aiUserSettings)
        .where(eq(aiUserSettings.userId, userId))
        .limit(1);
      if (!settings?.allowReadSecrets) {
        throw new ForbiddenException("AI access to secret fields is disabled");
      }
    }

    const partFileIds = input.parts.flatMap((part) =>
      part.type === "file" || part.type === "image" ? [part.fileId] : [],
    );
    const allFileIds = [...new Set([...partFileIds, ...input.context.fileIds])];
    const fileRows =
      allFileIds.length === 0
        ? []
        : await this.database.client
            .select({
              detectedMimeType: attachments.detectedMimeType,
              fileName: attachments.fileName,
              id: attachments.id,
              mimeType: attachments.mimeType,
              sizeBytes: attachments.sizeBytes,
            })
            .from(attachments)
            .where(
              and(
                eq(attachments.userId, userId),
                eq(attachments.storageStatus, "ready"),
                inArray(attachments.id, allFileIds),
              ),
            );
    if (fileRows.length !== allFileIds.length) {
      throw new NotFoundException("One or more AI files were not found");
    }
    const filesById = new Map(fileRows.map((row) => [row.id, row]));

    const noteRows =
      input.context.noteIds.length === 0
        ? []
        : await this.database.client
            .select({
              contentText: notes.contentText,
              id: notes.id,
              name: notes.name,
            })
            .from(notes)
            .where(
              and(
                eq(notes.userId, userId),
                isNull(notes.deletedAt),
                inArray(notes.id, input.context.noteIds),
              ),
            );
    if (noteRows.length !== input.context.noteIds.length) {
      throw new NotFoundException(
        "One or more AI context notes were not found",
      );
    }
    const notesById = new Map(noteRows.map((row) => [row.id, row]));

    const content: JsonObject[] = input.parts.map((part) => {
      if (part.type === "text") return part;
      const file = filesById.get(part.fileId);
      if (!file) throw new NotFoundException("AI file was not found");
      const mimeType = file.detectedMimeType ?? file.mimeType;
      if (part.type === "image" && !mimeType.startsWith("image/")) {
        throw new BadRequestException(`File ${part.fileId} is not an image`);
      }
      return {
        fileId: file.id,
        fileName: file.fileName,
        mimeType,
        sizeBytes: file.sizeBytes,
        type: part.type,
      };
    });
    for (const noteId of input.context.noteIds) {
      const note = notesById.get(noteId);
      if (!note) throw new NotFoundException("AI context note was not found");
      content.push({
        contentText: input.context.includeSecrets
          ? note.contentText
          : this.secretFields.redactText(note.contentText),
        name: note.name,
        noteId: note.id,
        secretsIncluded: input.context.includeSecrets,
        type: "note_context",
      });
    }
    for (const fileId of input.context.fileIds) {
      const file = filesById.get(fileId);
      if (!file) throw new NotFoundException("AI context file was not found");
      content.push({
        fileId: file.id,
        fileName: file.fileName,
        mimeType: file.detectedMimeType ?? file.mimeType,
        sizeBytes: file.sizeBytes,
        type: "file_context",
      });
    }
    if (Buffer.byteLength(JSON.stringify(content), "utf8") > 1_000_000) {
      throw new BadRequestException("AI message context exceeds 1 MB");
    }
    return content;
  }

  private async requireConversation(
    userId: number,
    id: number,
  ): Promise<ConversationRow> {
    const [row] = await this.database.client
      .select()
      .from(aiConversations)
      .where(
        and(eq(aiConversations.id, id), eq(aiConversations.userId, userId)),
      )
      .limit(1);
    if (!row) throw new NotFoundException("AI conversation was not found");
    return row;
  }

  private mapConversation(row: ConversationRow) {
    return {
      channel: row.channel,
      createdAt: row.createdAt.toISOString(),
      id: row.id,
      lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
      metadata: row.metadata,
      modelRole: row.modelRole,
      status: row.status,
      title: row.title,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapMessage(row: MessageRow) {
    return {
      completedAt: row.completedAt?.toISOString() ?? null,
      content: row.content,
      contentText: row.contentText,
      conversationId: row.conversationId,
      createdAt: row.createdAt.toISOString(),
      errorCode: row.errorCode,
      id: row.id,
      model: row.model,
      providerName: row.providerName,
      providerResponseId: row.providerResponseId,
      role: row.role,
      sequence: row.sequence,
      startedAt: row.startedAt?.toISOString() ?? null,
      status: row.status,
    };
  }
}
