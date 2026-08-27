import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { aiMessages, attachments } from "@notes/db";
import { and, desc, eq, inArray, lte } from "drizzle-orm";

import { DatabaseService } from "../database/database.service.js";
import { ObjectStorageService } from "../files/object-storage.service.js";
import type { JsonObject } from "./ai.types.js";

const MAX_HISTORY_MESSAGES = 30;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_TOTAL_FILE_BYTES = 50 * 1024 * 1024;
const IMAGE_MIME_TYPES = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

interface BuiltInput {
  estimatedInputTokens: number;
  input: JsonObject[];
}

@Injectable()
export class AiInputBuilderService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(ObjectStorageService)
    private readonly storage: ObjectStorageService,
  ) {}

  async build(
    userId: number,
    conversationId: number,
    currentMessageId: number,
  ): Promise<BuiltInput> {
    const [current] = await this.database.client
      .select({ sequence: aiMessages.sequence })
      .from(aiMessages)
      .where(
        and(
          eq(aiMessages.id, currentMessageId),
          eq(aiMessages.userId, userId),
          eq(aiMessages.conversationId, conversationId),
          eq(aiMessages.role, "user"),
        ),
      )
      .limit(1);
    if (!current) throw new NotFoundException("AI user message was not found");

    const rows = await this.database.client
      .select({
        content: aiMessages.content,
        contentText: aiMessages.contentText,
        id: aiMessages.id,
        role: aiMessages.role,
        sequence: aiMessages.sequence,
      })
      .from(aiMessages)
      .where(
        and(
          eq(aiMessages.userId, userId),
          eq(aiMessages.conversationId, conversationId),
          eq(aiMessages.status, "completed"),
          lte(aiMessages.sequence, current.sequence),
        ),
      )
      .orderBy(desc(aiMessages.sequence))
      .limit(MAX_HISTORY_MESSAGES);

    const input: JsonObject[] = [];
    for (const row of rows.toReversed()) {
      if (row.id === currentMessageId) {
        input.push({
          content: await this.currentContent(userId, row.content),
          role: "user",
        });
      } else if (
        (row.role === "user" || row.role === "assistant") &&
        row.contentText
      ) {
        input.push({ role: row.role, content: row.contentText });
      }
    }
    const serializedBytes = Buffer.byteLength(JSON.stringify(input), "utf8");
    return {
      estimatedInputTokens: Math.max(1, Math.ceil(serializedBytes / 3)),
      input,
    };
  }

  private async currentContent(
    userId: number,
    content: JsonObject[],
  ): Promise<JsonObject[]> {
    const fileParts = content.filter((part) =>
      ["file", "image", "file_context"].includes(String(part.type)),
    );
    const fileIds = [
      ...new Set(
        fileParts
          .map((part) => part.fileId)
          .filter(
            (value): value is number =>
              Number.isSafeInteger(value) && (value as number) > 0,
          ),
      ),
    ];
    const files =
      fileIds.length === 0
        ? []
        : await this.database.client
            .select({
              detectedMimeType: attachments.detectedMimeType,
              fileName: attachments.fileName,
              id: attachments.id,
              mimeType: attachments.mimeType,
              objectKey: attachments.objectKey,
              sizeBytes: attachments.sizeBytes,
            })
            .from(attachments)
            .where(
              and(
                eq(attachments.userId, userId),
                eq(attachments.storageStatus, "ready"),
                inArray(attachments.id, fileIds),
              ),
            );
    if (
      files.length !== fileIds.length ||
      files.some((file) => !file.objectKey)
    ) {
      throw new NotFoundException("One or more AI input files are unavailable");
    }
    if (
      files.some((file) => file.sizeBytes > MAX_FILE_BYTES) ||
      files.reduce((sum, file) => sum + file.sizeBytes, 0) >
        MAX_TOTAL_FILE_BYTES
    ) {
      throw new BadRequestException("AI input files exceed the 50 MB limit");
    }
    const filesById = new Map(files.map((file) => [file.id, file]));
    const encoded = new Map<number, string>();
    const result: JsonObject[] = [];
    const emittedFiles = new Set<number>();

    for (const part of content) {
      if (part.type === "text") {
        if (typeof part.text === "string" && part.text) {
          result.push({ text: part.text, type: "input_text" });
        }
      } else if (part.type === "note_context") {
        const name = typeof part.name === "string" ? part.name : "Note";
        const text =
          typeof part.contentText === "string" ? part.contentText : "";
        result.push({
          text: `Note context (${name}):\n${text}`,
          type: "input_text",
        });
      } else if (
        part.type === "file" ||
        part.type === "image" ||
        part.type === "file_context"
      ) {
        const fileId = Number(part.fileId);
        if (emittedFiles.has(fileId)) continue;
        const file = filesById.get(fileId);
        if (!file?.objectKey) {
          throw new NotFoundException("AI input file is unavailable");
        }
        const mimeType = file.detectedMimeType ?? file.mimeType;
        const data =
          encoded.get(fileId) ??
          (await this.readDataUrl(file.objectKey, mimeType, file.sizeBytes));
        encoded.set(fileId, data);
        if (part.type === "image" || mimeType.startsWith("image/")) {
          if (!IMAGE_MIME_TYPES.has(mimeType)) {
            throw new BadRequestException(
              `Image ${file.fileName} has an unsupported format`,
            );
          }
          result.push({ detail: "auto", image_url: data, type: "input_image" });
        } else {
          result.push({
            file_data: data,
            filename: file.fileName,
            type: "input_file",
          });
        }
        emittedFiles.add(fileId);
      }
    }
    if (result.length === 0) {
      throw new BadRequestException("AI message has no provider input");
    }
    return result;
  }

  private async readDataUrl(
    objectKey: string,
    mimeType: string,
    expectedBytes: number,
  ): Promise<string> {
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const raw of this.storage.openReadStream(objectKey)) {
      const chunk = Buffer.from(raw);
      total += chunk.length;
      if (total > MAX_FILE_BYTES) {
        throw new BadRequestException("AI input file exceeds the 50 MB limit");
      }
      chunks.push(chunk);
    }
    if (total !== expectedBytes) {
      throw new BadRequestException("AI input file changed during reading");
    }
    return `data:${mimeType};base64,${Buffer.concat(chunks).toString("base64")}`;
  }
}
