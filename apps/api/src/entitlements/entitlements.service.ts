import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from "@nestjs/common";
import {
  aiUsageLogs,
  attachmentUploads,
  attachments,
  notes,
  subscriptionPlans,
  userSubscriptions,
  users,
  type Entitlements,
} from "@notes/db";
import { and, desc, eq, gt, gte, inArray, isNull, or, sql } from "drizzle-orm";

import { DatabaseService } from "../database/database.service.js";

const ACTIVE_UPLOAD_STATUSES = [
  "preparing",
  "uploading",
  "completing",
  "expiring",
];

type EntitlementDatabase = Pick<
  DatabaseService["client"],
  "execute" | "select"
>;

interface BooleanEntitlement {
  enabled: boolean;
}

export interface NormalizedEntitlements {
  ai: BooleanEntitlement & { monthlyTokenLimit: number | null };
  exportImport: BooleanEntitlement;
  files: BooleanEntitlement & { storageLimitBytes: number | null };
  publicShare: BooleanEntitlement;
  templates: BooleanEntitlement;
  versioning: BooleanEntitlement;
  voice: BooleanEntitlement;
  workspace: BooleanEntitlement & {
    maxNoteContentBytes: number | null;
    maxNotes: number | null;
  };
}

export interface EffectiveEntitlements extends NormalizedEntitlements {
  plan: {
    id: number | null;
    name: string;
    slug: string;
  };
  subscriptionId: number | null;
}

export interface FileUsageEntitlement {
  enabled: boolean;
  limitBytes: number | null;
  reservedBytes: number;
  usedBytes: number;
}

const DEFAULT_ENTITLEMENTS: NormalizedEntitlements = {
  ai: { enabled: true, monthlyTokenLimit: null },
  exportImport: { enabled: true },
  files: { enabled: false, storageLimitBytes: 0 },
  publicShare: { enabled: true },
  templates: { enabled: true },
  versioning: { enabled: true },
  voice: { enabled: true },
  workspace: {
    enabled: true,
    maxNoteContentBytes: null,
    maxNotes: null,
  },
};

const ADMIN_ENTITLEMENTS: EffectiveEntitlements = {
  ai: { enabled: true, monthlyTokenLimit: null },
  exportImport: { enabled: true },
  files: { enabled: true, storageLimitBytes: null },
  plan: { id: null, name: "Administrator", slug: "admin" },
  publicShare: { enabled: true },
  subscriptionId: null,
  templates: { enabled: true },
  versioning: { enabled: true },
  voice: { enabled: true },
  workspace: {
    enabled: true,
    maxNoteContentBytes: null,
    maxNotes: null,
  },
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function booleanFlag(
  source: Record<string, unknown>,
  fallback: boolean,
): boolean {
  return source.enabled === undefined ? fallback : source.enabled === true;
}

function nullableLimit(value: unknown, fallback: number | null): number | null {
  if (value === undefined) return fallback;
  if (value === null) return null;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : fallback;
}

function utf8Bytes(...parts: string[]): number {
  return parts.reduce(
    (total, part) => total + Buffer.byteLength(part, "utf8"),
    0,
  );
}

export function normalizeEntitlements(
  value: Entitlements | null | undefined,
): NormalizedEntitlements {
  const root = record(value);
  const files = record(root.files);
  const workspace = record(root.workspace);
  const ai = record(root.ai);
  const voice = record(root.voice);
  const templates = record(root.templates);
  const versioning = record(root.versioning);
  const publicShare = record(root.publicShare);
  const exportImport = record(root.exportImport);
  return {
    ai: {
      enabled: booleanFlag(ai, DEFAULT_ENTITLEMENTS.ai.enabled),
      monthlyTokenLimit: nullableLimit(
        ai.monthlyTokenLimit,
        DEFAULT_ENTITLEMENTS.ai.monthlyTokenLimit,
      ),
    },
    exportImport: {
      enabled: booleanFlag(
        exportImport,
        DEFAULT_ENTITLEMENTS.exportImport.enabled,
      ),
    },
    files: {
      enabled: booleanFlag(files, DEFAULT_ENTITLEMENTS.files.enabled),
      storageLimitBytes: nullableLimit(
        files.storageLimitBytes,
        DEFAULT_ENTITLEMENTS.files.storageLimitBytes,
      ),
    },
    publicShare: {
      enabled: booleanFlag(
        publicShare,
        DEFAULT_ENTITLEMENTS.publicShare.enabled,
      ),
    },
    templates: {
      enabled: booleanFlag(templates, DEFAULT_ENTITLEMENTS.templates.enabled),
    },
    versioning: {
      enabled: booleanFlag(versioning, DEFAULT_ENTITLEMENTS.versioning.enabled),
    },
    voice: {
      enabled: booleanFlag(voice, DEFAULT_ENTITLEMENTS.voice.enabled),
    },
    workspace: {
      enabled: booleanFlag(workspace, DEFAULT_ENTITLEMENTS.workspace.enabled),
      maxNoteContentBytes: nullableLimit(
        workspace.maxNoteContentBytes,
        DEFAULT_ENTITLEMENTS.workspace.maxNoteContentBytes,
      ),
      maxNotes: nullableLimit(
        workspace.maxNotes,
        DEFAULT_ENTITLEMENTS.workspace.maxNotes,
      ),
    },
  };
}

@Injectable()
export class EntitlementsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async getEffective(
    userId: number,
    db: EntitlementDatabase = this.database.client,
  ): Promise<EffectiveEntitlements> {
    const [user] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) throw new NotFoundException("User was not found");
    if (user.role === "admin") return ADMIN_ENTITLEMENTS;

    const now = new Date();
    const [active] = await db
      .select({
        entitlements: subscriptionPlans.entitlements,
        planId: subscriptionPlans.id,
        planName: subscriptionPlans.name,
        planSlug: subscriptionPlans.slug,
        subscriptionId: userSubscriptions.id,
      })
      .from(userSubscriptions)
      .innerJoin(
        subscriptionPlans,
        eq(subscriptionPlans.id, userSubscriptions.planId),
      )
      .where(
        and(
          eq(userSubscriptions.userId, userId),
          eq(userSubscriptions.status, "active"),
          or(
            isNull(userSubscriptions.expiresAt),
            gt(userSubscriptions.expiresAt, now),
          ),
        ),
      )
      .orderBy(desc(userSubscriptions.startedAt), desc(userSubscriptions.id))
      .limit(1);
    if (active) {
      return {
        ...normalizeEntitlements(active.entitlements),
        plan: {
          id: active.planId,
          name: active.planName,
          slug: active.planSlug,
        },
        subscriptionId: active.subscriptionId,
      };
    }

    const [free] = await db
      .select({
        entitlements: subscriptionPlans.entitlements,
        id: subscriptionPlans.id,
        name: subscriptionPlans.name,
        slug: subscriptionPlans.slug,
      })
      .from(subscriptionPlans)
      .where(
        and(
          eq(subscriptionPlans.slug, "free"),
          eq(subscriptionPlans.isActive, true),
        ),
      )
      .limit(1);
    return {
      ...normalizeEntitlements(free?.entitlements),
      plan: {
        id: free?.id ?? null,
        name: free?.name ?? "Free",
        slug: free?.slug ?? "free",
      },
      subscriptionId: null,
    };
  }

  async lockUserQuota(userId: number, db: EntitlementDatabase): Promise<void> {
    await db.execute(sql`select pg_advisory_xact_lock(92019, ${userId})`);
  }

  async getFileUsage(
    userId: number,
    db: EntitlementDatabase = this.database.client,
  ): Promise<FileUsageEntitlement> {
    const effective = await this.getEffective(userId, db);
    const [used, reserved] = await Promise.all([
      this.sumFileBytes(userId, db),
      this.sumReservedBytes(userId, db),
    ]);
    return {
      enabled: effective.files.enabled,
      limitBytes: effective.files.storageLimitBytes,
      reservedBytes: reserved,
      usedBytes: used,
    };
  }

  async assertFileStorage(
    userId: number,
    additionalBytes: number,
    db: EntitlementDatabase = this.database.client,
  ): Promise<void> {
    const usage = await this.getFileUsage(userId, db);
    if (!usage.enabled) {
      throw new ForbiddenException("File storage is not enabled for this plan");
    }
    if (
      usage.limitBytes !== null &&
      usage.usedBytes + usage.reservedBytes + additionalBytes > usage.limitBytes
    ) {
      throw new PayloadTooLargeException({
        code: "FILE_STORAGE_LIMIT",
        message: "The file would exceed the account storage limit",
      });
    }
  }

  async assertWorkspaceEnabled(
    userId: number,
    db: EntitlementDatabase = this.database.client,
  ): Promise<EffectiveEntitlements> {
    const effective = await this.getEffective(userId, db);
    if (!effective.workspace.enabled) {
      throw new ForbiddenException("Workspace is not enabled for this plan");
    }
    return effective;
  }

  assertNoteContentSize(
    effective: EffectiveEntitlements,
    contentHtml: string,
    contentText: string,
  ): void {
    const limit = effective.workspace.maxNoteContentBytes;
    if (limit !== null && utf8Bytes(contentHtml, contentText) > limit) {
      throw new PayloadTooLargeException({
        code: "NOTE_CONTENT_LIMIT",
        message: "The note content exceeds the account limit",
      });
    }
  }

  async assertCanCreateNotes(
    userId: number,
    additionalNotes: number,
    db: EntitlementDatabase = this.database.client,
  ): Promise<EffectiveEntitlements> {
    const effective = await this.assertWorkspaceEnabled(userId, db);
    const limit = effective.workspace.maxNotes;
    if (limit !== null) {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int`.mapWith(Number) })
        .from(notes)
        .where(and(eq(notes.userId, userId), isNull(notes.deletedAt)));
      if ((row?.count ?? 0) + additionalNotes > limit) {
        throw new HttpException(
          "Workspace note limit reached",
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
    return effective;
  }

  async assertTemplatesEnabled(
    userId: number,
    db: EntitlementDatabase = this.database.client,
  ): Promise<void> {
    const effective = await this.getEffective(userId, db);
    if (!effective.templates.enabled) {
      throw new ForbiddenException("Templates are not enabled for this plan");
    }
  }

  async assertVersioningEnabled(
    userId: number,
    db: EntitlementDatabase = this.database.client,
  ): Promise<void> {
    const effective = await this.getEffective(userId, db);
    if (!effective.versioning.enabled) {
      throw new ForbiddenException(
        "Version history is not enabled for this plan",
      );
    }
  }

  async shouldRecordVersion(
    userId: number,
    db: EntitlementDatabase = this.database.client,
  ): Promise<boolean> {
    return (await this.getEffective(userId, db)).versioning.enabled;
  }

  async assertPublicShareEnabled(
    userId: number,
    db: EntitlementDatabase = this.database.client,
  ): Promise<void> {
    const effective = await this.getEffective(userId, db);
    if (!effective.publicShare.enabled) {
      throw new ForbiddenException(
        "Public sharing is not enabled for this plan",
      );
    }
  }

  async assertExportImportEnabled(
    userId: number,
    db: EntitlementDatabase = this.database.client,
  ): Promise<void> {
    const effective = await this.getEffective(userId, db);
    if (!effective.exportImport.enabled) {
      throw new ForbiddenException(
        "Import and export are not enabled for this plan",
      );
    }
  }

  async assertAiUsage(
    userId: number,
    requestedTokens: number,
    db: EntitlementDatabase = this.database.client,
  ): Promise<void> {
    const effective = await this.getEffective(userId, db);
    if (!effective.ai.enabled) {
      throw new ForbiddenException("AI is not enabled for this plan");
    }
    const limit = effective.ai.monthlyTokenLimit;
    if (limit === null) return;
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const [usage] = await db
      .select({
        tokens:
          sql<number>`coalesce(sum(${aiUsageLogs.inputTokens} + ${aiUsageLogs.outputTokens} + case when ${aiUsageLogs.reservationExpiresAt} > ${now} then ${aiUsageLogs.reservedTokens} else 0 end), 0)::int`.mapWith(
            Number,
          ),
      })
      .from(aiUsageLogs)
      .where(
        and(
          eq(aiUsageLogs.userId, userId),
          gte(aiUsageLogs.createdAt, monthStart),
        ),
      );
    if ((usage?.tokens ?? 0) + requestedTokens > limit) {
      throw new HttpException(
        "Monthly AI token limit reached",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async assertVoiceEnabled(
    userId: number,
    db: EntitlementDatabase = this.database.client,
  ): Promise<void> {
    const effective = await this.getEffective(userId, db);
    if (!effective.ai.enabled || !effective.voice.enabled) {
      throw new ForbiddenException("Voice AI is not enabled for this plan");
    }
  }

  async integrationToolAllowlist<T extends string>(
    userId: number,
    requested: readonly T[],
    db: EntitlementDatabase = this.database.client,
  ): Promise<T[]> {
    const effective = await this.getEffective(userId, db);
    return requested.filter((tool) => {
      if (!effective.ai.enabled) return false;
      if (tool.startsWith("attachments.")) return effective.files.enabled;
      if (tool.startsWith("templates.")) return effective.templates.enabled;
      if (tool.startsWith("versions.")) return effective.versioning.enabled;
      if (tool.startsWith("shareLinks.")) return effective.publicShare.enabled;
      if (tool.startsWith("notes.")) return effective.workspace.enabled;
      return true;
    });
  }

  private async sumFileBytes(userId: number, db: EntitlementDatabase) {
    const [row] = await db
      .select({
        value: sql<string>`coalesce(sum(${attachments.sizeBytes}), 0)::text`,
      })
      .from(attachments)
      .where(
        and(
          eq(attachments.userId, userId),
          inArray(attachments.storageStatus, ["ready", "copying"]),
        ),
      );
    return Number(row?.value ?? 0);
  }

  private async sumReservedBytes(userId: number, db: EntitlementDatabase) {
    const [row] = await db
      .select({
        value: sql<string>`coalesce(sum(${attachmentUploads.sizeBytes}), 0)::text`,
      })
      .from(attachmentUploads)
      .where(
        and(
          eq(attachmentUploads.userId, userId),
          inArray(attachmentUploads.status, ACTIVE_UPLOAD_STATUSES),
          gt(attachmentUploads.expiresAt, new Date()),
        ),
      );
    return Number(row?.value ?? 0);
  }
}
