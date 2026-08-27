import { Inject, Injectable } from "@nestjs/common";
import { activityLogs, noteTags, noteTemplates, notes, tags } from "@notes/db";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { DatabaseService } from "../database/database.service.js";
import { EntitlementsService } from "../entitlements/entitlements.service.js";
import { SecretFieldCryptoService } from "../notes/secret-field-crypto.service.js";
import type {
  ExportPayload,
  ImportPayload,
  ImportResponse,
} from "./workspace.types.js";

@Injectable()
export class ImportExportService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(EntitlementsService)
    private readonly entitlements: EntitlementsService,
    @Inject(SecretFieldCryptoService)
    private readonly secretFields: SecretFieldCryptoService,
  ) {}

  async exportJson(userId: number): Promise<ExportPayload> {
    return this.database.client.transaction(async (tx) => {
      await tx.execute(sql`set transaction isolation level repeatable read`);
      await this.entitlements.assertExportImportEnabled(userId, tx);
      const noteRows = await tx
        .select()
        .from(notes)
        .where(and(eq(notes.userId, userId), isNull(notes.deletedAt)))
        .orderBy(asc(notes.parentId), asc(notes.position), asc(notes.id));
      const noteIds = noteRows.map((note) => note.id);
      const tagRows =
        noteIds.length === 0
          ? []
          : await tx
              .select({ name: tags.name, noteId: noteTags.noteId })
              .from(noteTags)
              .innerJoin(
                tags,
                and(eq(tags.id, noteTags.tagId), eq(tags.userId, userId)),
              )
              .where(
                and(
                  eq(noteTags.userId, userId),
                  inArray(noteTags.noteId, noteIds),
                ),
              )
              .orderBy(asc(tags.name), asc(tags.id));
      const tagsByNote = new Map<number, string[]>();
      for (const row of tagRows) {
        tagsByNote.set(row.noteId, [
          ...(tagsByNote.get(row.noteId) ?? []),
          row.name,
        ]);
      }
      const templateRows = await tx
        .select()
        .from(noteTemplates)
        .where(
          and(
            eq(noteTemplates.userId, userId),
            eq(noteTemplates.isSystem, false),
          ),
        )
        .orderBy(asc(noteTemplates.name), asc(noteTemplates.id));
      await tx.insert(activityLogs).values({
        action: "workspace.export",
        actorId: userId,
        details: {
          noteCount: noteRows.length,
          templateCount: templateRows.length,
        },
        targetType: "workspace",
        userId,
      });
      return {
        exportedAt: new Date().toISOString(),
        formatVersion: 1,
        notes: noteRows.map((note) => ({
          contentHtml: this.secretFields.decryptHtml(note.contentHtml),
          contentText: note.contentText,
          id: note.id,
          isFavorite: note.isFavorite,
          isPinned: note.isPinned,
          name: note.name,
          parentId: note.parentId,
          position: note.position,
          tags: tagsByNote.get(note.id) ?? [],
        })),
        templates: templateRows.map((template) => ({
          contentHtml: this.secretFields.decryptHtml(template.contentHtml),
          contentText: template.contentText,
          name: template.name,
        })),
      };
    });
  }

  async importJson(
    userId: number,
    input: ImportPayload,
  ): Promise<ImportResponse> {
    return this.database.client.transaction(async (tx) => {
      await this.entitlements.lockUserQuota(userId, tx);
      await this.entitlements.assertExportImportEnabled(userId, tx);
      const effective = await this.entitlements.assertCanCreateNotes(
        userId,
        input.notes.length,
        tx,
      );
      if (input.templates.length > 0) {
        await this.entitlements.assertTemplatesEnabled(userId, tx);
      }
      for (const note of input.notes) {
        this.entitlements.assertNoteContentSize(
          effective,
          note.contentHtml,
          note.contentText,
        );
      }
      const idMap = new Map<number, number>();
      for (const note of input.notes) {
        const [created] = await tx
          .insert(notes)
          .values({
            contentHtml: this.secretFields.encryptHtml(note.contentHtml),
            contentText: note.contentText,
            isFavorite: note.isFavorite,
            isPinned: note.isPinned,
            name: note.name,
            parentId: null,
            position: note.position,
            userId,
          })
          .returning({ id: notes.id });
        if (!created) throw new Error("Imported note did not return an id");
        idMap.set(note.id, created.id);
      }

      for (const note of input.notes) {
        if (note.parentId === null) continue;
        await tx
          .update(notes)
          .set({ parentId: idMap.get(note.parentId) ?? null })
          .where(
            and(
              eq(notes.id, idMap.get(note.id) ?? 0),
              eq(notes.userId, userId),
            ),
          );
      }

      const tagNames = [...new Set(input.notes.flatMap((note) => note.tags))];
      if (tagNames.length > 0) {
        await tx
          .insert(tags)
          .values(tagNames.map((name) => ({ name, userId })))
          .onConflictDoNothing();
        const tagRows = await tx
          .select({ id: tags.id, name: tags.name })
          .from(tags)
          .where(and(eq(tags.userId, userId), inArray(tags.name, tagNames)));
        const tagIds = new Map(tagRows.map((tag) => [tag.name, tag.id]));
        const bindings = input.notes.flatMap((note) =>
          note.tags.map((name) => ({
            noteId: idMap.get(note.id) as number,
            tagId: tagIds.get(name) as number,
            userId,
          })),
        );
        if (bindings.length > 0) await tx.insert(noteTags).values(bindings);
      }

      if (input.templates.length > 0) {
        await tx.insert(noteTemplates).values(
          input.templates.map((template) => ({
            contentHtml: this.secretFields.encryptHtml(template.contentHtml),
            contentText: template.contentText,
            name: template.name,
            userId,
          })),
        );
      }
      await tx.insert(activityLogs).values({
        action: "workspace.import",
        actorId: userId,
        details: {
          noteCount: input.notes.length,
          templateCount: input.templates.length,
        },
        targetType: "workspace",
        userId,
      });
      return {
        importedNotes: input.notes.length,
        importedTemplates: input.templates.length,
      };
    });
  }
}
