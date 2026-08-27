import { createHash, randomBytes } from "node:crypto";

import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  activityLogs,
  notes,
  shareLinkAccessLogs,
  shareLinks,
} from "@notes/db";
import { and, desc, eq, isNull } from "drizzle-orm";

import { DatabaseService } from "../database/database.service.js";
import { EntitlementsService } from "../entitlements/entitlements.service.js";
import { SecretFieldCryptoService } from "../notes/secret-field-crypto.service.js";
import type {
  CreateShareInput,
  PublicShareResponse,
  ShareLinkResponse,
} from "./workspace.types.js";

@Injectable()
export class ShareLinksService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(EntitlementsService)
    private readonly entitlements: EntitlementsService,
    @Inject(SecretFieldCryptoService)
    private readonly secretFields: SecretFieldCryptoService,
  ) {}

  async list(userId: number, noteId: number): Promise<ShareLinkResponse[]> {
    await this.requireNote(userId, noteId);
    const rows = await this.database.client
      .select()
      .from(shareLinks)
      .where(and(eq(shareLinks.userId, userId), eq(shareLinks.noteId, noteId)))
      .orderBy(desc(shareLinks.createdAt), desc(shareLinks.id));
    return rows.map((row) => this.map(row));
  }

  async create(
    userId: number,
    noteId: number,
    input: CreateShareInput,
  ): Promise<ShareLinkResponse> {
    const token = randomBytes(24).toString("base64url");
    const url = `/share/${token}`;
    const expiresAt = new Date(Date.now() + input.ttlHours * 60 * 60 * 1_000);
    const created = await this.database.client.transaction(async (tx) => {
      await this.entitlements.assertPublicShareEnabled(userId, tx);
      const [note] = await tx
        .select({ id: notes.id })
        .from(notes)
        .where(
          and(
            eq(notes.id, noteId),
            eq(notes.userId, userId),
            isNull(notes.deletedAt),
          ),
        )
        .limit(1);
      if (!note) throw new NotFoundException(`Note ${noteId} was not found`);
      const [row] = await tx
        .insert(shareLinks)
        .values({
          expiresAt,
          includeSecrets: input.includeSecrets,
          maxAccessCount: input.oneTime ? 1 : null,
          noteId,
          tokenHash: this.hashToken(token),
          userId,
        })
        .returning();
      if (!row) throw new Error("Share link did not return a row");
      await tx.insert(activityLogs).values({
        action: "workspace.share_create",
        actorId: userId,
        details: {
          expiresAt: expiresAt.toISOString(),
          includeSecrets: input.includeSecrets,
          oneTime: input.oneTime,
        },
        targetId: row.id,
        targetType: "share_link",
        userId,
      });
      return row;
    });
    return { ...this.map(created), url };
  }

  async revoke(userId: number, id: number): Promise<{ id: number }> {
    return this.database.client.transaction(async (tx) => {
      const now = new Date();
      const [revoked] = await tx
        .update(shareLinks)
        .set({ revokedAt: now })
        .where(and(eq(shareLinks.id, id), eq(shareLinks.userId, userId)))
        .returning({ id: shareLinks.id });
      if (!revoked)
        throw new NotFoundException(`Share link ${id} was not found`);
      await tx.insert(activityLogs).values({
        action: "workspace.share_revoke",
        actorId: userId,
        details: {},
        targetId: id,
        targetType: "share_link",
        userId,
      });
      return revoked;
    });
  }

  async getPublic(
    token: string,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<PublicShareResponse> {
    return this.database.client.transaction(async (tx) => {
      const [link] = await tx
        .select()
        .from(shareLinks)
        .where(eq(shareLinks.tokenHash, this.hashToken(token)))
        .for("update")
        .limit(1);
      const unavailable =
        !link ||
        link.revokedAt !== null ||
        link.expiresAt.getTime() <= Date.now() ||
        (link.maxAccessCount !== null &&
          link.accessCount >= link.maxAccessCount);
      if (unavailable || !link) {
        throw new NotFoundException("Share link was not found");
      }
      const [note] = await tx
        .select()
        .from(notes)
        .where(
          and(
            eq(notes.id, link.noteId),
            eq(notes.userId, link.userId),
            isNull(notes.deletedAt),
          ),
        )
        .limit(1);
      if (!note) throw new NotFoundException("Share link was not found");

      const accessedAt = new Date();
      const accessCount = link.accessCount + 1;
      await tx
        .update(shareLinks)
        .set({
          accessCount,
          lastAccessedAt: accessedAt,
          revokedAt:
            link.maxAccessCount !== null && accessCount >= link.maxAccessCount
              ? accessedAt
              : link.revokedAt,
        })
        .where(eq(shareLinks.id, link.id));
      await tx.insert(shareLinkAccessLogs).values({
        ipAddress: ipAddress ?? null,
        shareLinkId: link.id,
        userAgent: userAgent?.slice(0, 512) ?? null,
      });
      await tx.insert(activityLogs).values({
        action: "workspace.share_access",
        actorId: null,
        details: {},
        targetId: link.id,
        targetType: "share_link",
        userId: link.userId,
      });

      const decryptedHtml = this.secretFields.decryptHtml(note.contentHtml);
      return {
        expiresAt: link.expiresAt.toISOString(),
        note: {
          contentHtml: link.includeSecrets
            ? decryptedHtml
            : this.secretFields.redactHtml(decryptedHtml),
          contentText: link.includeSecrets
            ? note.contentText
            : this.secretFields.redactText(note.contentText),
          id: note.id,
          name: note.name,
          updatedAt: note.updatedAt.toISOString(),
        },
      };
    });
  }

  private async requireNote(userId: number, noteId: number): Promise<void> {
    const [note] = await this.database.client
      .select({ id: notes.id })
      .from(notes)
      .where(
        and(
          eq(notes.id, noteId),
          eq(notes.userId, userId),
          isNull(notes.deletedAt),
        ),
      )
      .limit(1);
    if (!note) throw new NotFoundException(`Note ${noteId} was not found`);
  }

  private map(row: typeof shareLinks.$inferSelect): ShareLinkResponse {
    return {
      accessCount: row.accessCount,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      id: row.id,
      includeSecrets: row.includeSecrets,
      lastAccessedAt: row.lastAccessedAt?.toISOString() ?? null,
      maxAccessCount: row.maxAccessCount,
      noteId: row.noteId,
      oneTime: row.maxAccessCount === 1,
      revokedAt: row.revokedAt?.toISOString() ?? null,
      url: row.publicUrl ?? "",
    };
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
