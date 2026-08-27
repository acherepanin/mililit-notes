import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { noteTemplates } from "@notes/db";
import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";

import { DatabaseService } from "../database/database.service.js";
import { EntitlementsService } from "../entitlements/entitlements.service.js";
import { NotesService } from "../notes/notes.service.js";
import { SecretFieldCryptoService } from "../notes/secret-field-crypto.service.js";
import type { TemplateInput, TemplateResponse } from "./workspace.types.js";

@Injectable()
export class TemplatesService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(EntitlementsService)
    private readonly entitlements: EntitlementsService,
    @Inject(NotesService) private readonly notes: NotesService,
    @Inject(SecretFieldCryptoService)
    private readonly secretFields: SecretFieldCryptoService,
  ) {}

  async list(userId: number): Promise<TemplateResponse[]> {
    const rows = await this.database.client
      .select()
      .from(noteTemplates)
      .where(
        or(
          eq(noteTemplates.userId, userId),
          and(eq(noteTemplates.isSystem, true), isNull(noteTemplates.userId)),
        ),
      )
      .orderBy(
        desc(noteTemplates.isSystem),
        asc(sql`lower(${noteTemplates.name})`),
      );
    return rows.map((row) => this.map(row));
  }

  async create(userId: number, input: TemplateInput) {
    await this.entitlements.assertTemplatesEnabled(userId);
    const [created] = await this.database.client
      .insert(noteTemplates)
      .values({
        ...input,
        contentHtml: this.secretFields.encryptHtml(input.contentHtml),
        userId,
      })
      .returning();
    if (!created) throw new Error("Template insert did not return a row");
    return this.map(created);
  }

  async update(userId: number, id: number, input: TemplateInput) {
    await this.entitlements.assertTemplatesEnabled(userId);
    const [updated] = await this.database.client
      .update(noteTemplates)
      .set({
        ...input,
        contentHtml: this.secretFields.encryptHtml(input.contentHtml),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(noteTemplates.id, id),
          eq(noteTemplates.userId, userId),
          eq(noteTemplates.isSystem, false),
        ),
      )
      .returning();
    if (!updated) throw new NotFoundException(`Template ${id} was not found`);
    return this.map(updated);
  }

  async remove(userId: number, id: number) {
    const [removed] = await this.database.client
      .delete(noteTemplates)
      .where(
        and(
          eq(noteTemplates.id, id),
          eq(noteTemplates.userId, userId),
          eq(noteTemplates.isSystem, false),
        ),
      )
      .returning({ id: noteTemplates.id });
    if (!removed) throw new NotFoundException(`Template ${id} was not found`);
    return removed;
  }

  async createNote(
    userId: number,
    templateId: number,
    parentId: number | null,
  ) {
    await this.entitlements.assertTemplatesEnabled(userId);
    const [template] = await this.database.client
      .select()
      .from(noteTemplates)
      .where(
        and(
          eq(noteTemplates.id, templateId),
          or(
            eq(noteTemplates.userId, userId),
            and(eq(noteTemplates.isSystem, true), isNull(noteTemplates.userId)),
          ),
        ),
      )
      .limit(1);
    if (!template)
      throw new NotFoundException(`Template ${templateId} was not found`);
    const note = await this.notes.create(userId, {
      name: template.name,
      parentId,
    });
    return this.notes.update(userId, note.id, {
      contentHtml: this.secretFields.decryptHtml(template.contentHtml),
      contentText: template.contentText,
      revision: note.revision,
    });
  }

  private map(row: typeof noteTemplates.$inferSelect): TemplateResponse {
    return {
      contentHtml: this.secretFields.decryptHtml(row.contentHtml),
      contentText: row.contentText,
      createdAt: row.createdAt.toISOString(),
      id: row.id,
      isSystem: row.isSystem,
      name: row.name,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
