import { createHmac, randomBytes } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from "@nestjs/common";
import {
  activityLogs,
  aiBotAdminSettings,
  aiBotLinkCodes,
  aiBotPendingActions,
  aiBotUsageLogs,
  aiBotUserSettings,
} from "@notes/db";
import { and, asc, eq, gte, lt, ne, or, sql } from "drizzle-orm";

import { DatabaseService } from "../database/database.service.js";
import { IntegrationSecretCryptoService } from "./integration-secret-crypto.service.js";
import type {
  IntegrationPermissions,
  IntegrationProvider,
  UpdateAdminIntegrationInput,
  UpdateUserIntegrationInput,
} from "./integrations.types.js";

const providers: IntegrationProvider[] = ["telegram", "vk"];
const LINK_TTL_MS = 10 * 60 * 1_000;

type AdminRow = typeof aiBotAdminSettings.$inferSelect;
type UserRow = typeof aiBotUserSettings.$inferSelect;

function databaseCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error
    ? String(error.code)
    : undefined;
}

@Injectable()
export class IntegrationSettingsService {
  private readonly linkHashKey: string;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(IntegrationSecretCryptoService)
    private readonly secrets: IntegrationSecretCryptoService,
  ) {
    this.linkHashKey =
      process.env.INTEGRATION_LINK_HASH_KEY ||
      process.env.BETTER_AUTH_SECRET ||
      "";
    if (!this.linkHashKey) {
      throw new Error(
        "INTEGRATION_LINK_HASH_KEY or BETTER_AUTH_SECRET is required",
      );
    }
  }

  async listAdminSettings() {
    await this.ensureAdminRows();
    const rows = await this.database.client
      .select()
      .from(aiBotAdminSettings)
      .orderBy(asc(aiBotAdminSettings.provider));
    return rows.map((row) => this.mapAdmin(row));
  }

  async updateAdminSettings(
    actorId: number,
    provider: IntegrationProvider,
    input: UpdateAdminIntegrationInput,
  ) {
    await this.ensureAdminRows();
    const row = await this.database.client.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(aiBotAdminSettings)
        .where(eq(aiBotAdminSettings.provider, provider))
        .for("update")
        .limit(1);
      if (!current) throw new Error("Integration settings row is missing");
      const now = new Date();
      const [updated] = await tx
        .update(aiBotAdminSettings)
        .set({
          ...(input.accessToken
            ? { accessTokenEncrypted: this.secrets.encrypt(input.accessToken) }
            : {}),
          ...(input.allowSecrets !== undefined
            ? { allowSecrets: input.allowSecrets }
            : {}),
          ...(input.botToken
            ? { botTokenEncrypted: this.secrets.encrypt(input.botToken) }
            : {}),
          ...(input.clearAccessToken ? { accessTokenEncrypted: null } : {}),
          ...(input.clearBotToken ? { botTokenEncrypted: null } : {}),
          ...(input.clearSecret ? { secretEncrypted: null } : {}),
          ...(input.confirmationCode !== undefined
            ? { confirmationCode: input.confirmationCode }
            : {}),
          ...(input.dailyReadLimit !== undefined
            ? { dailyReadLimit: input.dailyReadLimit }
            : {}),
          ...(input.dailyRequestLimit !== undefined
            ? { dailyRequestLimit: input.dailyRequestLimit }
            : {}),
          ...(input.dailyWriteLimit !== undefined
            ? { dailyWriteLimit: input.dailyWriteLimit }
            : {}),
          ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
          ...(input.groupId !== undefined ? { groupId: input.groupId } : {}),
          ...(input.requireConfirmation !== undefined
            ? { requireConfirmation: input.requireConfirmation }
            : {}),
          ...(input.secret
            ? { secretEncrypted: this.secrets.encrypt(input.secret) }
            : {}),
          ...(input.webhookUrl !== undefined
            ? { webhookUrl: input.webhookUrl }
            : {}),
          updatedAt: now,
        })
        .where(eq(aiBotAdminSettings.provider, provider))
        .returning();
      if (!updated)
        throw new Error("Integration settings update returned no row");
      await tx.insert(activityLogs).values({
        action: "integrations.admin.update",
        actorId,
        details: {
          enabled: updated.enabled,
          provider,
          secretsChanged: Boolean(
            input.accessToken ||
            input.botToken ||
            input.secret ||
            input.clearAccessToken ||
            input.clearBotToken ||
            input.clearSecret,
          ),
        },
        targetType: "integration",
      });
      return updated;
    });
    return this.mapAdmin(row);
  }

  async getRuntimeAdminSettings(
    provider: IntegrationProvider,
  ): Promise<AdminRow> {
    await this.ensureAdminRows();
    const [row] = await this.database.client
      .select()
      .from(aiBotAdminSettings)
      .where(eq(aiBotAdminSettings.provider, provider))
      .limit(1);
    if (!row?.enabled) {
      throw new BadRequestException(`${provider} integration is disabled`);
    }
    return row;
  }

  async getAdminSettings(provider: IntegrationProvider): Promise<AdminRow> {
    await this.ensureAdminRows();
    const [row] = await this.database.client
      .select()
      .from(aiBotAdminSettings)
      .where(eq(aiBotAdminSettings.provider, provider))
      .limit(1);
    if (!row) throw new Error("Integration settings row is missing");
    return row;
  }

  decryptSecret(value: string | null): string | null {
    return value ? this.secrets.decrypt(value) : null;
  }

  async listUserSettings(userId: number) {
    await this.ensureAdminRows();
    await this.ensureUserRows(userId);
    const [rows, admins] = await Promise.all([
      this.database.client
        .select()
        .from(aiBotUserSettings)
        .where(eq(aiBotUserSettings.userId, userId))
        .orderBy(asc(aiBotUserSettings.provider)),
      this.database.client.select().from(aiBotAdminSettings),
    ]);
    const available = new Map(admins.map((row) => [row.provider, row.enabled]));
    return rows.map((row) =>
      this.mapUser(row, available.get(row.provider) ?? false),
    );
  }

  async updateUserSettings(
    userId: number,
    provider: IntegrationProvider,
    input: UpdateUserIntegrationInput,
  ) {
    await this.ensureUserRows(userId);
    const row = await this.database.client.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(aiBotUserSettings)
        .where(
          and(
            eq(aiBotUserSettings.userId, userId),
            eq(aiBotUserSettings.provider, provider),
          ),
        )
        .for("update")
        .limit(1);
      if (!current) throw new Error("User integration settings row is missing");
      const permissions = {
        ...this.permissions(current),
        ...input.permissions,
      };
      const [updated] = await tx
        .update(aiBotUserSettings)
        .set({
          ...(input.accessMode !== undefined
            ? { accessMode: input.accessMode }
            : {}),
          ...(input.allowSecrets !== undefined
            ? { allowSecrets: input.allowSecrets }
            : {}),
          allowAttachments: permissions.listAttachments,
          allowNoteDelete: permissions.deleteNotes,
          allowNoteRead: permissions.readNotes,
          allowNoteWrite: permissions.writeNotes,
          allowShareLinks: permissions.createShareLinks,
          allowTags: permissions.manageTags,
          allowTemplates: permissions.useTemplates,
          allowVersions: permissions.useVersions,
          ...(input.dailyReadLimit !== undefined
            ? { dailyReadLimit: input.dailyReadLimit }
            : {}),
          ...(input.dailyRequestLimit !== undefined
            ? { dailyRequestLimit: input.dailyRequestLimit }
            : {}),
          ...(input.dailyWriteLimit !== undefined
            ? { dailyWriteLimit: input.dailyWriteLimit }
            : {}),
          ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(aiBotUserSettings.userId, userId),
            eq(aiBotUserSettings.provider, provider),
          ),
        )
        .returning();
      if (!updated) throw new Error("User integration update returned no row");
      await tx.insert(activityLogs).values({
        action: "integrations.user.update",
        actorId: userId,
        details: { enabled: updated.enabled, provider },
        targetId: updated.id,
        targetType: "integration_settings",
      });
      return updated;
    });
    const admin = await this.getAdminSettings(provider);
    return this.mapUser(row, admin.enabled);
  }

  async createLinkCode(userId: number, provider: IntegrationProvider) {
    await this.getRuntimeAdminSettings(provider);
    await this.ensureUserRows(userId);
    const code = randomBytes(16)
      .toString("hex")
      .toUpperCase()
      .match(/.{1,4}/g)!
      .join("-");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + LINK_TTL_MS);
    await this.database.client.transaction(async (tx) => {
      await tx
        .delete(aiBotLinkCodes)
        .where(
          or(
            and(
              eq(aiBotLinkCodes.userId, userId),
              eq(aiBotLinkCodes.provider, provider),
            ),
            lt(aiBotLinkCodes.expiresAt, now),
          ),
        );
      await tx.insert(aiBotLinkCodes).values({
        codeHash: this.hashCode(provider, code),
        expiresAt,
        provider,
        userId,
      });
      await tx.insert(activityLogs).values({
        action: "integrations.link_code.create",
        actorId: userId,
        details: { expiresAt: expiresAt.toISOString(), provider },
        targetType: "integration",
      });
    });
    return { code, expiresAt: expiresAt.toISOString(), provider };
  }

  async consumeLinkCode(
    provider: IntegrationProvider,
    code: string,
    externalId: string,
    username: string | null,
  ) {
    try {
      return await this.database.client.transaction(async (tx) => {
        const [link] = await tx
          .select()
          .from(aiBotLinkCodes)
          .where(
            and(
              eq(aiBotLinkCodes.provider, provider),
              eq(aiBotLinkCodes.codeHash, this.hashCode(provider, code)),
            ),
          )
          .for("update")
          .limit(1);
        if (!link || link.expiresAt.getTime() <= Date.now()) {
          throw new BadRequestException(
            "Invalid or expired integration link code",
          );
        }
        const [claimed] = await tx
          .select({ userId: aiBotUserSettings.userId })
          .from(aiBotUserSettings)
          .where(
            and(
              eq(aiBotUserSettings.provider, provider),
              eq(aiBotUserSettings.linkedExternalId, externalId),
              ne(aiBotUserSettings.userId, link.userId),
            ),
          )
          .for("update")
          .limit(1);
        if (claimed) {
          throw new ConflictException(
            "This messenger account is already linked",
          );
        }
        await tx
          .insert(aiBotUserSettings)
          .values({ provider, userId: link.userId })
          .onConflictDoNothing({
            target: [aiBotUserSettings.userId, aiBotUserSettings.provider],
          });
        const [updated] = await tx
          .update(aiBotUserSettings)
          .set({
            enabled: true,
            linkedAt: new Date(),
            linkedExternalId: externalId,
            linkedUsername: username,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(aiBotUserSettings.userId, link.userId),
              eq(aiBotUserSettings.provider, provider),
            ),
          )
          .returning();
        if (!updated) throw new Error("Integration link returned no row");
        await tx
          .delete(aiBotLinkCodes)
          .where(
            and(
              eq(aiBotLinkCodes.userId, link.userId),
              eq(aiBotLinkCodes.provider, provider),
            ),
          );
        await tx.insert(activityLogs).values({
          action: "integrations.link",
          actorId: link.userId,
          details: { provider },
          targetId: updated.id,
          targetType: "integration_settings",
        });
        return this.mapUser(updated, true);
      });
    } catch (error) {
      if (databaseCode(error) === "23505") {
        throw new ConflictException("This messenger account is already linked");
      }
      throw error;
    }
  }

  async unlink(userId: number, provider: IntegrationProvider) {
    await this.ensureUserRows(userId);
    const row = await this.database.client.transaction(async (tx) => {
      const [updated] = await tx
        .update(aiBotUserSettings)
        .set({
          enabled: false,
          linkedAt: null,
          linkedExternalId: null,
          linkedUsername: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(aiBotUserSettings.userId, userId),
            eq(aiBotUserSettings.provider, provider),
          ),
        )
        .returning();
      if (!updated) throw new Error("Integration unlink returned no row");
      await tx
        .delete(aiBotLinkCodes)
        .where(
          and(
            eq(aiBotLinkCodes.userId, userId),
            eq(aiBotLinkCodes.provider, provider),
          ),
        );
      await tx
        .delete(aiBotPendingActions)
        .where(
          and(
            eq(aiBotPendingActions.userId, userId),
            eq(aiBotPendingActions.provider, provider),
          ),
        );
      await tx.insert(activityLogs).values({
        action: "integrations.unlink",
        actorId: userId,
        details: { provider },
        targetId: updated.id,
        targetType: "integration_settings",
      });
      return updated;
    });
    const admin = await this.getAdminSettings(provider);
    return this.mapUser(row, admin.enabled);
  }

  async findLinkedUser(provider: IntegrationProvider, externalId: string) {
    const [row] = await this.database.client
      .select()
      .from(aiBotUserSettings)
      .where(
        and(
          eq(aiBotUserSettings.provider, provider),
          eq(aiBotUserSettings.linkedExternalId, externalId),
          eq(aiBotUserSettings.enabled, true),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async reserveUsage(
    userId: number,
    provider: IntegrationProvider,
    kind: "message" | "read" | "write",
    count = 1,
  ): Promise<UserRow> {
    return this.database.client.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(${userId}, ${provider === "telegram" ? 11 : 12})`,
      );
      const [user] = await tx
        .select()
        .from(aiBotUserSettings)
        .where(
          and(
            eq(aiBotUserSettings.userId, userId),
            eq(aiBotUserSettings.provider, provider),
          ),
        )
        .for("update")
        .limit(1);
      const [admin] = await tx
        .select()
        .from(aiBotAdminSettings)
        .where(eq(aiBotAdminSettings.provider, provider))
        .for("share")
        .limit(1);
      if (!user?.enabled || !user.linkedExternalId || !admin?.enabled) {
        throw new BadRequestException("Integration access is disabled");
      }
      const limit =
        kind === "read"
          ? (user.dailyReadLimit ?? admin.dailyReadLimit)
          : kind === "write"
            ? (user.dailyWriteLimit ?? admin.dailyWriteLimit)
            : (user.dailyRequestLimit ?? admin.dailyRequestLimit);
      if (limit !== null) {
        const dayStart = new Date();
        dayStart.setUTCHours(0, 0, 0, 0);
        const [usage] = await tx
          .select({
            count:
              sql<number>`coalesce(sum(${aiBotUsageLogs.usageCount}), 0)::int`.mapWith(
                Number,
              ),
          })
          .from(aiBotUsageLogs)
          .where(
            and(
              eq(aiBotUsageLogs.userId, userId),
              eq(aiBotUsageLogs.provider, provider),
              eq(aiBotUsageLogs.kind, kind),
              gte(aiBotUsageLogs.createdAt, dayStart),
            ),
          );
        if ((usage?.count ?? 0) + count > limit) {
          throw new HttpException(
            `Daily bot ${kind} limit reached`,
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
      }
      await tx.insert(aiBotUsageLogs).values({
        kind,
        provider,
        usageCount: count,
        userId,
      });
      return user;
    });
  }

  private async ensureAdminRows(): Promise<void> {
    await this.database.client
      .insert(aiBotAdminSettings)
      .values(providers.map((provider) => ({ provider })))
      .onConflictDoNothing({ target: aiBotAdminSettings.provider });
  }

  private async ensureUserRows(userId: number): Promise<void> {
    await this.database.client
      .insert(aiBotUserSettings)
      .values(providers.map((provider) => ({ provider, userId })))
      .onConflictDoNothing({
        target: [aiBotUserSettings.userId, aiBotUserSettings.provider],
      });
  }

  private hashCode(provider: IntegrationProvider, code: string): string {
    return createHmac("sha256", this.linkHashKey)
      .update(`${provider}\0${code.replaceAll("-", "").trim().toUpperCase()}`)
      .digest("hex");
  }

  private permissions(row: UserRow): IntegrationPermissions {
    return {
      createShareLinks: row.allowShareLinks,
      deleteNotes: row.allowNoteDelete,
      listAttachments: row.allowAttachments,
      manageTags: row.allowTags,
      readNotes: row.allowNoteRead,
      useTemplates: row.allowTemplates,
      useVersions: row.allowVersions,
      writeNotes: row.allowNoteWrite,
    };
  }

  private mapUser(row: UserRow, available: boolean) {
    return {
      accessMode: row.accessMode,
      available,
      allowSecrets: row.allowSecrets,
      dailyReadLimit: row.dailyReadLimit,
      dailyRequestLimit: row.dailyRequestLimit,
      dailyWriteLimit: row.dailyWriteLimit,
      enabled: row.enabled,
      linkedAt: row.linkedAt?.toISOString() ?? null,
      linkedExternalId: row.linkedExternalId,
      linkedUsername: row.linkedUsername,
      permissions: this.permissions(row),
      provider: row.provider,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapAdmin(row: AdminRow) {
    return {
      accessTokenHint: this.secrets.hint(row.accessTokenEncrypted),
      allowSecrets: row.allowSecrets,
      botTokenHint: this.secrets.hint(row.botTokenEncrypted),
      confirmationCode: row.confirmationCode,
      dailyReadLimit: row.dailyReadLimit,
      dailyRequestLimit: row.dailyRequestLimit,
      dailyWriteLimit: row.dailyWriteLimit,
      enabled: row.enabled,
      groupId: row.groupId,
      hasAccessToken: Boolean(row.accessTokenEncrypted),
      hasBotToken: Boolean(row.botTokenEncrypted),
      hasSecret: Boolean(row.secretEncrypted),
      lastCheckAt: row.lastCheckAt?.toISOString() ?? null,
      lastCheckError: row.lastCheckError,
      lastCheckStatus: row.lastCheckStatus,
      provider: row.provider,
      requireConfirmation: row.requireConfirmation,
      secretHint: this.secrets.hint(row.secretEncrypted),
      updatedAt: row.updatedAt.toISOString(),
      webhookUrl: row.webhookUrl,
    };
  }
}
