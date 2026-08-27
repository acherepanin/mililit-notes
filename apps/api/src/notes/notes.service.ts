import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  activityLogs,
  attachmentFolders,
  attachments,
  noteTags,
  noteVersions,
  notes,
  tags,
} from "@notes/db";
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm";

import { DatabaseService } from "../database/database.service.js";
import { EntitlementsService } from "../entitlements/entitlements.service.js";
import { buildNoteTree, reorderIds, wouldCreateCycle } from "./notes.domain.js";
import { SecretFieldCryptoService } from "./secret-field-crypto.service.js";
import type {
  CreateNoteInput,
  MoveNoteInput,
  NoteResponse,
  NoteSearchResult,
  NoteTreeNode,
  NoteVersionResponse,
  SetTagsInput,
  TagResponse,
  UpdateNoteInput,
} from "./notes.types.js";

const MAX_NOTE_VERSIONS = 80;
const SEARCH_LIMIT = 30;
const VERSION_THROTTLE_MS = 60_000;

type NoteRow = typeof notes.$inferSelect;

@Injectable()
export class NotesService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(SecretFieldCryptoService)
    private readonly secretFields: SecretFieldCryptoService,
    @Inject(EntitlementsService)
    private readonly entitlements: EntitlementsService,
  ) {}

  async getTree(userId: number): Promise<NoteTreeNode[]> {
    const rows = await this.database.client
      .select()
      .from(notes)
      .where(and(eq(notes.userId, userId), isNull(notes.deletedAt)))
      .orderBy(
        asc(notes.parentId),
        asc(notes.position),
        asc(sql`lower(${notes.name})`),
        asc(notes.id),
      );
    const tagsByNote = await this.tagsForNotes(
      userId,
      rows.map((row) => row.id),
    );
    return buildNoteTree(
      rows.map((row) => ({
        id: row.id,
        isFavorite: row.isFavorite,
        isPinned: row.isPinned,
        name: row.name,
        parentId: row.parentId,
        position: row.position,
        revision: row.revision,
        tags: tagsByNote.get(row.id) ?? [],
        updatedAt: row.updatedAt.toISOString(),
      })),
    );
  }

  async getById(userId: number, id: number): Promise<NoteResponse> {
    return this.mapNote(await this.requireNote(userId, id));
  }

  async create(userId: number, input: CreateNoteInput): Promise<NoteResponse> {
    const id = await this.database.client.transaction(async (tx) => {
      await this.entitlements.lockUserQuota(userId, tx);
      const effective = await this.entitlements.assertCanCreateNotes(
        userId,
        1,
        tx,
      );
      this.entitlements.assertNoteContentSize(effective, "", "");
      if (input.parentId !== null) {
        const [parent] = await tx
          .select({ id: notes.id })
          .from(notes)
          .where(
            and(
              eq(notes.id, input.parentId),
              eq(notes.userId, userId),
              isNull(notes.deletedAt),
            ),
          )
          .limit(1);
        if (!parent)
          throw new NotFoundException(
            `Parent note ${input.parentId} was not found`,
          );
      }

      const parentCondition =
        input.parentId === null
          ? isNull(notes.parentId)
          : eq(notes.parentId, input.parentId);
      const [positionRow] = await tx
        .select({
          next: sql<number>`coalesce(max(${notes.position}), -1) + 1`.mapWith(
            Number,
          ),
        })
        .from(notes)
        .where(
          and(
            eq(notes.userId, userId),
            isNull(notes.deletedAt),
            parentCondition,
          ),
        );
      const [created] = await tx
        .insert(notes)
        .values({
          name: input.name,
          parentId: input.parentId,
          position: positionRow?.next ?? 0,
          userId,
        })
        .returning({ id: notes.id });
      if (!created) throw new Error("Note insert did not return an id");
      await tx.insert(activityLogs).values({
        action: "notes.create",
        actorId: userId,
        details: { name: input.name },
        targetId: created.id,
        targetType: "note",
        userId,
      });
      return created.id;
    });
    return this.getById(userId, id);
  }

  async update(
    userId: number,
    id: number,
    input: UpdateNoteInput,
  ): Promise<NoteResponse> {
    await this.database.client.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(notes)
        .where(
          and(
            eq(notes.id, id),
            eq(notes.userId, userId),
            isNull(notes.deletedAt),
          ),
        )
        .for("update")
        .limit(1);
      if (!existing) throw new NotFoundException(`Note ${id} was not found`);
      this.assertRevision(existing.revision, input.revision);
      const effective = await this.entitlements.assertWorkspaceEnabled(
        userId,
        tx,
      );
      if (input.contentHtml !== undefined || input.contentText !== undefined) {
        this.entitlements.assertNoteContentSize(
          effective,
          input.contentHtml ??
            this.secretFields.decryptHtml(existing.contentHtml),
          input.contentText ?? existing.contentText,
        );
      }

      if (
        input.attachmentFolderId !== undefined &&
        input.attachmentFolderId !== null
      ) {
        const [folder] = await tx
          .select({ id: attachmentFolders.id })
          .from(attachmentFolders)
          .where(
            and(
              eq(attachmentFolders.id, input.attachmentFolderId),
              eq(attachmentFolders.userId, userId),
            ),
          )
          .limit(1);
        if (!folder)
          throw new NotFoundException(
            `Folder ${input.attachmentFolderId} was not found`,
          );
      }

      const recordVersion = await this.entitlements.shouldRecordVersion(
        userId,
        tx,
      );
      if (
        recordVersion &&
        (input.name !== undefined ||
          input.contentHtml !== undefined ||
          input.contentText !== undefined)
      ) {
        const [latest] = await tx
          .select({ createdAt: noteVersions.createdAt })
          .from(noteVersions)
          .where(
            and(eq(noteVersions.noteId, id), eq(noteVersions.userId, userId)),
          )
          .orderBy(desc(noteVersions.createdAt), desc(noteVersions.id))
          .limit(1);
        if (
          !latest ||
          Date.now() - latest.createdAt.getTime() >= VERSION_THROTTLE_MS
        ) {
          await tx.insert(noteVersions).values({
            contentHtml: existing.contentHtml,
            contentText: existing.contentText,
            name: existing.name,
            noteId: id,
            userId,
          });
          await tx.execute(sql`delete from note_versions where id in (
            select id from note_versions where note_id = ${id} and user_id = ${userId}
            order by created_at desc, id desc offset ${MAX_NOTE_VERSIONS}
          )`);
        }
      }

      const [updated] = await tx
        .update(notes)
        .set({
          ...(input.attachmentFolderId !== undefined
            ? { attachmentFolderId: input.attachmentFolderId }
            : {}),
          ...(input.contentHtml !== undefined
            ? { contentHtml: this.secretFields.encryptHtml(input.contentHtml) }
            : {}),
          ...(input.contentText !== undefined
            ? { contentText: input.contentText }
            : {}),
          ...(input.isFavorite !== undefined
            ? { isFavorite: input.isFavorite }
            : {}),
          ...(input.isPinned !== undefined ? { isPinned: input.isPinned } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
          revision: sql`${notes.revision} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(notes.id, id),
            eq(notes.userId, userId),
            eq(notes.revision, input.revision),
            isNull(notes.deletedAt),
          ),
        )
        .returning({ id: notes.id });
      if (!updated) throw this.revisionConflict(existing.revision);
      await tx.insert(activityLogs).values({
        action: "notes.update",
        actorId: userId,
        details: {
          fields: Object.keys(input).filter((field) => field !== "revision"),
        },
        targetId: id,
        targetType: "note",
        userId,
      });
    });
    return this.getById(userId, id);
  }

  async move(
    userId: number,
    id: number,
    input: MoveNoteInput,
  ): Promise<NoteResponse> {
    await this.database.client.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(notes)
        .where(
          and(
            eq(notes.id, id),
            eq(notes.userId, userId),
            isNull(notes.deletedAt),
          ),
        )
        .for("update")
        .limit(1);
      if (!existing) throw new NotFoundException(`Note ${id} was not found`);
      this.assertRevision(existing.revision, input.revision);
      await this.entitlements.assertWorkspaceEnabled(userId, tx);
      if (input.parentId === id)
        throw new BadRequestException("A note cannot be moved into itself");

      const graph = await tx
        .select({ id: notes.id, parentId: notes.parentId })
        .from(notes)
        .where(and(eq(notes.userId, userId), isNull(notes.deletedAt)));
      if (
        input.parentId !== null &&
        !graph.some((row) => row.id === input.parentId)
      ) {
        throw new NotFoundException(
          `Parent note ${input.parentId} was not found`,
        );
      }
      if (wouldCreateCycle(graph, id, input.parentId)) {
        throw new BadRequestException(
          "A note cannot be moved into its descendant",
        );
      }

      const sourceCondition =
        existing.parentId === null
          ? isNull(notes.parentId)
          : eq(notes.parentId, existing.parentId);
      const targetCondition =
        input.parentId === null
          ? isNull(notes.parentId)
          : eq(notes.parentId, input.parentId);
      const sourceRows = await tx
        .select({ id: notes.id })
        .from(notes)
        .where(
          and(
            eq(notes.userId, userId),
            isNull(notes.deletedAt),
            sourceCondition,
          ),
        )
        .orderBy(asc(notes.position), asc(notes.id));
      const targetRows =
        existing.parentId === input.parentId
          ? sourceRows
          : await tx
              .select({ id: notes.id })
              .from(notes)
              .where(
                and(
                  eq(notes.userId, userId),
                  isNull(notes.deletedAt),
                  targetCondition,
                ),
              )
              .orderBy(asc(notes.position), asc(notes.id));

      if (existing.parentId !== input.parentId) {
        const sourceOrder = sourceRows
          .map((row) => row.id)
          .filter((noteId) => noteId !== id);
        for (const [position, noteId] of sourceOrder.entries()) {
          await tx
            .update(notes)
            .set({ position })
            .where(and(eq(notes.id, noteId), eq(notes.userId, userId)));
        }
      }

      const targetOrder = reorderIds(
        targetRows.map((row) => row.id),
        id,
        input.position,
      );
      for (const [position, noteId] of targetOrder.entries()) {
        await tx
          .update(notes)
          .set(
            noteId === id
              ? {
                  parentId: input.parentId,
                  position,
                  revision: sql`${notes.revision} + 1`,
                  updatedAt: new Date(),
                }
              : { position },
          )
          .where(
            and(
              eq(notes.id, noteId),
              eq(notes.userId, userId),
              isNull(notes.deletedAt),
            ),
          );
      }
      await tx.insert(activityLogs).values({
        action: "notes.move",
        actorId: userId,
        details: {
          parentId: input.parentId,
          position: targetOrder.indexOf(id),
        },
        targetId: id,
        targetType: "note",
        userId,
      });
    });
    return this.getById(userId, id);
  }

  async listTags(userId: number): Promise<TagResponse[]> {
    return this.database.client
      .select({ color: tags.color, id: tags.id, name: tags.name })
      .from(tags)
      .where(eq(tags.userId, userId))
      .orderBy(asc(tags.name), asc(tags.id));
  }

  async createTag(userId: number, name: string): Promise<TagResponse> {
    await this.database.client
      .insert(tags)
      .values({ name, userId })
      .onConflictDoNothing();
    const [tag] = await this.database.client
      .select({ color: tags.color, id: tags.id, name: tags.name })
      .from(tags)
      .where(and(eq(tags.userId, userId), eq(tags.name, name)))
      .limit(1);
    if (!tag) throw new Error("Tag insert did not return a row");
    return tag;
  }

  async updateTag(
    userId: number,
    tagId: number,
    name: string,
  ): Promise<TagResponse> {
    const [duplicate] = await this.database.client
      .select({ id: tags.id })
      .from(tags)
      .where(
        and(eq(tags.userId, userId), eq(tags.name, name), ne(tags.id, tagId)),
      )
      .limit(1);
    if (duplicate)
      throw new ConflictException("A tag with this name already exists");
    const [updated] = await this.database.client
      .update(tags)
      .set({ name, updatedAt: new Date() })
      .where(and(eq(tags.id, tagId), eq(tags.userId, userId)))
      .returning({ color: tags.color, id: tags.id, name: tags.name });
    if (!updated) throw new NotFoundException(`Tag ${tagId} was not found`);
    return updated;
  }

  async deleteTag(userId: number, tagId: number): Promise<{ id: number }> {
    const [deleted] = await this.database.client
      .delete(tags)
      .where(and(eq(tags.id, tagId), eq(tags.userId, userId)))
      .returning({ id: tags.id });
    if (!deleted) throw new NotFoundException(`Tag ${tagId} was not found`);
    return deleted;
  }

  async setTags(
    userId: number,
    noteId: number,
    input: SetTagsInput,
  ): Promise<NoteResponse> {
    await this.database.client.transaction(async (tx) => {
      const [note] = await tx
        .select({ revision: notes.revision })
        .from(notes)
        .where(
          and(
            eq(notes.id, noteId),
            eq(notes.userId, userId),
            isNull(notes.deletedAt),
          ),
        )
        .for("update")
        .limit(1);
      if (!note) throw new NotFoundException(`Note ${noteId} was not found`);
      this.assertRevision(note.revision, input.revision);
      await this.entitlements.assertWorkspaceEnabled(userId, tx);

      for (const name of input.tags) {
        await tx.insert(tags).values({ name, userId }).onConflictDoNothing();
      }
      const tagRows =
        input.tags.length === 0
          ? []
          : await tx
              .select({ id: tags.id })
              .from(tags)
              .where(
                and(eq(tags.userId, userId), inArray(tags.name, input.tags)),
              );
      await tx
        .delete(noteTags)
        .where(and(eq(noteTags.noteId, noteId), eq(noteTags.userId, userId)));
      if (tagRows.length > 0) {
        await tx
          .insert(noteTags)
          .values(tagRows.map((tag) => ({ noteId, tagId: tag.id, userId })));
      }
      await tx
        .update(notes)
        .set({ revision: sql`${notes.revision} + 1`, updatedAt: new Date() })
        .where(
          and(
            eq(notes.id, noteId),
            eq(notes.userId, userId),
            eq(notes.revision, input.revision),
          ),
        );
    });
    return this.getById(userId, noteId);
  }

  async search(userId: number, query: string): Promise<NoteSearchResult[]> {
    if (!query) return [];
    const pattern = `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    const rows = await this.database.client
      .select({
        contentText: notes.contentText,
        id: notes.id,
        name: notes.name,
        updatedAt: notes.updatedAt,
      })
      .from(notes)
      .where(
        and(
          eq(notes.userId, userId),
          isNull(notes.deletedAt),
          or(ilike(notes.name, pattern), ilike(notes.contentText, pattern)),
        ),
      )
      .orderBy(desc(notes.updatedAt), desc(notes.id))
      .limit(SEARCH_LIMIT);
    const tagsByNote = await this.tagsForNotes(
      userId,
      rows.map((row) => row.id),
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      snippet: row.contentText.slice(0, 180),
      tags: tagsByNote.get(row.id) ?? [],
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async listTrash(userId: number): Promise<NoteResponse[]> {
    const rows = await this.database.client
      .select()
      .from(notes)
      .where(and(eq(notes.userId, userId), isNotNull(notes.deletedAt)))
      .orderBy(desc(notes.deletedAt), desc(notes.id));
    return Promise.all(rows.map((row) => this.mapNote(row)));
  }

  async remove(
    userId: number,
    id: number,
    revision: number,
  ): Promise<{ id: number; revision: number }> {
    return this.database.client.transaction(async (tx) => {
      const [note] = await tx
        .select()
        .from(notes)
        .where(
          and(
            eq(notes.id, id),
            eq(notes.userId, userId),
            isNull(notes.deletedAt),
          ),
        )
        .for("update")
        .limit(1);
      if (!note) throw new NotFoundException(`Note ${id} was not found`);
      this.assertRevision(note.revision, revision);
      await tx
        .delete(noteVersions)
        .where(
          and(eq(noteVersions.noteId, id), eq(noteVersions.userId, userId)),
        );
      await tx
        .update(attachments)
        .set({ noteId: null })
        .where(and(eq(attachments.noteId, id), eq(attachments.userId, userId)));
      const [deleted] = await tx
        .update(notes)
        .set({
          deletedAt: new Date(),
          deletedBy: userId,
          revision: sql`${notes.revision} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(notes.id, id),
            eq(notes.userId, userId),
            eq(notes.revision, revision),
          ),
        )
        .returning({ id: notes.id, revision: notes.revision });
      if (!deleted) throw this.revisionConflict(note.revision);
      await tx.insert(activityLogs).values({
        action: "notes.delete",
        actorId: userId,
        details: { name: note.name },
        targetId: id,
        targetType: "note",
        userId,
      });
      return deleted;
    });
  }

  async restore(
    userId: number,
    id: number,
    revision: number,
  ): Promise<NoteResponse> {
    await this.database.client.transaction(async (tx) => {
      await this.entitlements.lockUserQuota(userId, tx);
      const effective = await this.entitlements.assertCanCreateNotes(
        userId,
        1,
        tx,
      );
      const [note] = await tx
        .select()
        .from(notes)
        .where(
          and(
            eq(notes.id, id),
            eq(notes.userId, userId),
            isNotNull(notes.deletedAt),
          ),
        )
        .for("update")
        .limit(1);
      if (!note)
        throw new NotFoundException(`Deleted note ${id} was not found`);
      this.assertRevision(note.revision, revision);
      this.entitlements.assertNoteContentSize(
        effective,
        this.secretFields.decryptHtml(note.contentHtml),
        note.contentText,
      );
      let parentId = note.parentId;
      if (parentId !== null) {
        const [parent] = await tx
          .select({ id: notes.id })
          .from(notes)
          .where(
            and(
              eq(notes.id, parentId),
              eq(notes.userId, userId),
              isNull(notes.deletedAt),
            ),
          )
          .limit(1);
        if (!parent) parentId = null;
      }
      await tx
        .update(notes)
        .set({
          deleteReason: null,
          deletedAt: null,
          deletedBy: null,
          parentId,
          revision: sql`${notes.revision} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(notes.id, id),
            eq(notes.userId, userId),
            eq(notes.revision, revision),
          ),
        );
      await tx.insert(activityLogs).values({
        action: "notes.restore",
        actorId: userId,
        details: {},
        targetId: id,
        targetType: "note",
        userId,
      });
    });
    return this.getById(userId, id);
  }

  async removePermanently(
    userId: number,
    id: number,
    revision: number,
  ): Promise<{ id: number }> {
    return this.database.client.transaction(async (tx) => {
      const [note] = await tx
        .select({ id: notes.id, revision: notes.revision })
        .from(notes)
        .where(
          and(
            eq(notes.id, id),
            eq(notes.userId, userId),
            isNotNull(notes.deletedAt),
          ),
        )
        .for("update")
        .limit(1);
      if (!note)
        throw new NotFoundException(`Deleted note ${id} was not found`);
      this.assertRevision(note.revision, revision);
      await tx
        .delete(notes)
        .where(
          and(
            eq(notes.id, id),
            eq(notes.userId, userId),
            eq(notes.revision, revision),
          ),
        );
      await tx.insert(activityLogs).values({
        action: "notes.delete_permanent",
        actorId: userId,
        details: {},
        targetId: id,
        targetType: "note",
        userId,
      });
      return { id };
    });
  }

  async listVersions(
    userId: number,
    noteId: number,
  ): Promise<NoteVersionResponse[]> {
    await this.entitlements.assertVersioningEnabled(userId);
    await this.requireNote(userId, noteId, true);
    const rows = await this.database.client
      .select()
      .from(noteVersions)
      .where(
        and(eq(noteVersions.noteId, noteId), eq(noteVersions.userId, userId)),
      )
      .orderBy(desc(noteVersions.createdAt), desc(noteVersions.id))
      .limit(MAX_NOTE_VERSIONS);
    return rows.map((row) => ({
      contentHtml: this.secretFields.decryptHtml(row.contentHtml),
      contentText: row.contentText,
      createdAt: row.createdAt.toISOString(),
      id: row.id,
      name: row.name,
      noteId: row.noteId,
    }));
  }

  async restoreVersion(
    userId: number,
    noteId: number,
    versionId: number,
    revision: number,
  ): Promise<NoteResponse> {
    await this.database.client.transaction(async (tx) => {
      await this.entitlements.lockUserQuota(userId, tx);
      await this.entitlements.assertVersioningEnabled(userId, tx);
      const [note] = await tx
        .select()
        .from(notes)
        .where(and(eq(notes.id, noteId), eq(notes.userId, userId)))
        .for("update")
        .limit(1);
      if (!note) throw new NotFoundException(`Note ${noteId} was not found`);
      this.assertRevision(note.revision, revision);
      const effective =
        note.deletedAt === null
          ? await this.entitlements.assertWorkspaceEnabled(userId, tx)
          : await this.entitlements.assertCanCreateNotes(userId, 1, tx);
      const [version] = await tx
        .select()
        .from(noteVersions)
        .where(
          and(
            eq(noteVersions.id, versionId),
            eq(noteVersions.noteId, noteId),
            eq(noteVersions.userId, userId),
          ),
        )
        .limit(1);
      if (!version)
        throw new NotFoundException(`Version ${versionId} was not found`);
      this.entitlements.assertNoteContentSize(
        effective,
        this.secretFields.decryptHtml(version.contentHtml),
        version.contentText,
      );
      await tx.insert(noteVersions).values({
        contentHtml: note.contentHtml,
        contentText: note.contentText,
        name: note.name,
        noteId,
        userId,
      });
      await tx
        .update(notes)
        .set({
          contentHtml: version.contentHtml,
          contentText: version.contentText,
          deletedAt: null,
          deletedBy: null,
          name: version.name,
          revision: sql`${notes.revision} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(notes.id, noteId),
            eq(notes.userId, userId),
            eq(notes.revision, revision),
          ),
        );
      await tx.insert(activityLogs).values({
        action: "notes.version_restore",
        actorId: userId,
        details: { versionId },
        targetId: noteId,
        targetType: "note",
        userId,
      });
    });
    return this.getById(userId, noteId);
  }

  private async requireNote(
    userId: number,
    id: number,
    includeDeleted = false,
  ): Promise<NoteRow> {
    const [note] = await this.database.client
      .select()
      .from(notes)
      .where(
        and(
          eq(notes.id, id),
          eq(notes.userId, userId),
          ...(includeDeleted ? [] : [isNull(notes.deletedAt)]),
        ),
      )
      .limit(1);
    if (!note) throw new NotFoundException(`Note ${id} was not found`);
    return note;
  }

  private async mapNote(row: NoteRow): Promise<NoteResponse> {
    const tagMap = await this.tagsForNotes(row.userId, [row.id]);
    return {
      attachmentFolderId: row.attachmentFolderId,
      contentHtml: this.secretFields.decryptHtml(row.contentHtml),
      contentText: row.contentText,
      createdAt: row.createdAt.toISOString(),
      deletedAt: row.deletedAt?.toISOString() ?? null,
      id: row.id,
      isFavorite: row.isFavorite,
      isPinned: row.isPinned,
      name: row.name,
      parentId: row.parentId,
      position: row.position,
      revision: row.revision,
      tags: tagMap.get(row.id) ?? [],
      updatedAt: row.updatedAt.toISOString(),
      userId: row.userId,
    };
  }

  private async tagsForNotes(
    userId: number,
    noteIds: number[],
  ): Promise<Map<number, string[]>> {
    const result = new Map<number, string[]>();
    if (noteIds.length === 0) return result;
    const rows = await this.database.client
      .select({ name: tags.name, noteId: noteTags.noteId })
      .from(noteTags)
      .innerJoin(
        tags,
        and(eq(tags.id, noteTags.tagId), eq(tags.userId, noteTags.userId)),
      )
      .where(
        and(eq(noteTags.userId, userId), inArray(noteTags.noteId, noteIds)),
      )
      .orderBy(asc(tags.name), asc(tags.id));
    for (const row of rows)
      result.set(row.noteId, [...(result.get(row.noteId) ?? []), row.name]);
    return result;
  }

  private assertRevision(current: number, provided: number): void {
    if (current !== provided) throw this.revisionConflict(current);
  }

  private revisionConflict(currentRevision: number): ConflictException {
    return new ConflictException({
      code: "NOTE_REVISION_CONFLICT",
      currentRevision,
      message: "The note changed in another session",
    });
  }
}
