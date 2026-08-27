import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { attachments, notes, users } from "@notes/db";
import { asc, count, eq } from "drizzle-orm";

import { DatabaseService } from "../database/database.service.js";
import { FilesService } from "../files/files.service.js";
import { NotesService } from "../notes/notes.service.js";
import { CorrelationContextService } from "../observability/correlation-context.service.js";
import { ShareLinksService } from "../workspace/share-links.service.js";
import { TemplatesService } from "../workspace/templates.service.js";
import type { AiToolName } from "./ai-tool-registry.js";
import type { JsonObject } from "./ai.types.js";
import { ToolConfirmationService } from "./tool-confirmation.service.js";

function record(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestException("AI tool arguments must be an object");
  }
  return value as JsonObject;
}

function integer(value: unknown, name: string, minimum = 1): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) {
    throw new BadRequestException(`${name} must be an integer >= ${minimum}`);
  }
  return Number(value);
}

function optionalId(value: unknown, name: string): number | null {
  return value === undefined || value === null ? null : integer(value, name);
}

function text(value: unknown, name: string, maximum = 200): string {
  if (typeof value !== "string") {
    throw new BadRequestException(`${name} must be a string`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) {
    throw new BadRequestException(
      `${name} must contain 1-${maximum} characters`,
    );
  }
  return normalized;
}

function boolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") {
    throw new BadRequestException(`${name} must be boolean`);
  }
  return value;
}

function strings(value: unknown, name: string, maximum = 20): string[] {
  if (!Array.isArray(value) || value.length > maximum) {
    throw new BadRequestException(
      `${name} must contain at most ${maximum} items`,
    );
  }
  return value.map((item) => text(item, name, 160));
}

function errorCode(error: unknown): string {
  const name = error instanceof Error ? error.name : "tool_execution_error";
  return name.replaceAll(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 100);
}

@Injectable()
export class AiToolExecutionService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(NotesService) private readonly notes: NotesService,
    @Inject(FilesService) private readonly files: FilesService,
    @Inject(TemplatesService) private readonly templates: TemplatesService,
    @Inject(ShareLinksService) private readonly shareLinks: ShareLinksService,
    @Inject(ToolConfirmationService)
    private readonly confirmations: ToolConfirmationService,
    @Inject(CorrelationContextService)
    private readonly correlation: CorrelationContextService,
  ) {}

  async execute(userId: number, toolCallId: number): Promise<JsonObject> {
    const call = await this.confirmations.claimForExecution(userId, toolCallId);
    return this.correlation.run(
      call.correlationId ?? this.correlation.getOrCreate(),
      async () => {
        try {
          const result = record(
            await this.run(
              userId,
              call.toolName as AiToolName,
              record(call.arguments),
            ),
          );
          await this.confirmations.finishExecution(userId, toolCallId, result);
          return result;
        } catch (error) {
          await this.confirmations.finishExecution(
            userId,
            toolCallId,
            null,
            errorCode(error),
          );
          throw error;
        }
      },
    );
  }

  private async run(
    userId: number,
    toolName: AiToolName,
    input: JsonObject,
  ): Promise<unknown> {
    switch (toolName) {
      case "admin.stats.read": {
        await this.assertAdministrator(userId);
        const [[userCount], [noteCount], [fileCount]] = await Promise.all([
          this.database.client.select({ value: count() }).from(users),
          this.database.client.select({ value: count() }).from(notes),
          this.database.client.select({ value: count() }).from(attachments),
        ]);
        return {
          attachments: fileCount?.value ?? 0,
          notes: noteCount?.value ?? 0,
          users: userCount?.value ?? 0,
        };
      }
      case "admin.users.list": {
        await this.assertAdministrator(userId);
        const limit =
          input.limit === undefined ? 50 : integer(input.limit, "limit");
        const rows = await this.database.client
          .select({ id: users.id, role: users.role, username: users.username })
          .from(users)
          .orderBy(asc(users.id))
          .limit(Math.min(limit, 100));
        return { users: rows };
      }
      case "attachments.attachToNote":
        return this.files.patchFile(userId, integer(input.fileId, "fileId"), {
          noteId: integer(input.noteId, "noteId"),
        });
      case "attachments.list":
        return {
          files: await this.files.listFiles(userId, {
            folderId: null,
            noteId: optionalId(input.noteId, "noteId"),
            query: input.query === undefined ? "" : text(input.query, "query"),
          }),
        };
      case "notes.autotag":
      case "notes.tags.set":
        return this.notes.setTags(userId, integer(input.noteId, "noteId"), {
          revision: integer(input.revision, "revision"),
          tags: strings(input.tags, "tags").map((tag) =>
            tag.toLocaleLowerCase("ru"),
          ),
        });
      case "notes.create":
        return this.notes.create(userId, {
          name: text(input.name, "name", 160),
          parentId: optionalId(input.parentId, "parentId"),
        });
      case "notes.createNestedBatch": {
        const names = strings(input.names, "names");
        if (names.length === 0) {
          throw new BadRequestException("names must contain at least one item");
        }
        let parentId = optionalId(input.parentId, "parentId");
        const created = [];
        for (const name of names) {
          const note = await this.notes.create(userId, { name, parentId });
          created.push(note);
          parentId = note.id;
        }
        return { notes: created };
      }
      case "notes.delete":
        return this.notes.remove(
          userId,
          integer(input.noteId, "noteId"),
          integer(input.revision, "revision"),
        );
      case "notes.deleteAll": {
        if (!boolean(input.confirmAll, "confirmAll")) {
          throw new BadRequestException("confirmAll must be true");
        }
        const tree = await this.notes.getTree(userId);
        const flattened = tree.flatMap(function flatten(note): typeof tree {
          return [...note.children.flatMap(flatten), note];
        });
        for (const note of flattened) {
          await this.notes.remove(userId, note.id, note.revision);
        }
        return { deleted: flattened.length };
      }
      case "notes.favorite.set":
        return this.notes.update(userId, integer(input.noteId, "noteId"), {
          isFavorite: boolean(input.value, "value"),
          revision: integer(input.revision, "revision"),
        });
      case "notes.pinned.set":
        return this.notes.update(userId, integer(input.noteId, "noteId"), {
          isPinned: boolean(input.value, "value"),
          revision: integer(input.revision, "revision"),
        });
      case "notes.read":
        return this.notes.getById(userId, integer(input.noteId, "noteId"));
      case "notes.restore":
        return this.notes.restore(
          userId,
          integer(input.noteId, "noteId"),
          integer(input.revision, "revision"),
        );
      case "notes.search":
      case "notes.semanticSearch":
        return {
          mode:
            toolName === "notes.semanticSearch"
              ? "lexical_fallback"
              : "lexical",
          notes: await this.notes.search(userId, text(input.query, "query")),
        };
      case "notes.update": {
        const update: JsonObject = {
          revision: integer(input.revision, "revision"),
        };
        if (input.name !== undefined)
          update.name = text(input.name, "name", 160);
        if (input.contentHtml !== undefined) {
          if (typeof input.contentHtml !== "string")
            throw new BadRequestException("contentHtml must be a string");
          update.contentHtml = input.contentHtml;
        }
        if (input.contentText !== undefined) {
          if (typeof input.contentText !== "string")
            throw new BadRequestException("contentText must be a string");
          update.contentText = input.contentText;
        }
        if (Object.keys(update).length === 1) {
          throw new BadRequestException("At least one note change is required");
        }
        return this.notes.update(
          userId,
          integer(input.noteId, "noteId"),
          update as never,
        );
      }
      case "shareLinks.create":
        return this.shareLinks.create(userId, integer(input.noteId, "noteId"), {
          includeSecrets: boolean(input.includeSecrets, "includeSecrets"),
          oneTime: boolean(input.oneTime, "oneTime"),
          ttlHours: integer(input.ttlHours, "ttlHours"),
        });
      case "templates.createNote":
        return this.templates.createNote(
          userId,
          integer(input.templateId, "templateId"),
          optionalId(input.parentId, "parentId"),
        );
      case "templates.list":
        return { templates: await this.templates.list(userId) };
      case "versions.list":
        return {
          versions: await this.notes.listVersions(
            userId,
            integer(input.noteId, "noteId"),
          ),
        };
      case "versions.restore":
        return this.notes.restoreVersion(
          userId,
          integer(input.noteId, "noteId"),
          integer(input.versionId, "versionId"),
          integer(input.revision, "revision"),
        );
    }
  }

  private async assertAdministrator(userId: number): Promise<void> {
    const [user] = await this.database.client
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (user?.role !== "admin") {
      throw new ForbiddenException("Administrator access is required");
    }
  }
}
