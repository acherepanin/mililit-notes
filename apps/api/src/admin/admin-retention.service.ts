import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  activityLogs,
  dataRetentionPolicies,
  type DataRetentionPolicyKey,
} from "@notes/db";
import { asc, eq } from "drizzle-orm";

import { DatabaseService } from "../database/database.service.js";
import type { RetentionPolicyUpdateInput } from "./admin-retention.validation.js";

type RetentionPolicyRow = typeof dataRetentionPolicies.$inferSelect;

@Injectable()
export class AdminRetentionService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async list() {
    const rows = await this.database.client
      .select()
      .from(dataRetentionPolicies)
      .orderBy(asc(dataRetentionPolicies.id));
    return {
      items: rows.map((row) => this.map(row)),
      scheduleEveryMinutes: 60,
    };
  }

  async update(
    actorId: number,
    policyKey: DataRetentionPolicyKey,
    input: RetentionPolicyUpdateInput,
  ) {
    await this.database.client.transaction(async (tx) => {
      const [updated] = await tx
        .update(dataRetentionPolicies)
        .set({
          ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
          ...(input.retentionDays === undefined
            ? {}
            : { retentionDays: input.retentionDays }),
          updatedAt: new Date(),
          updatedByUserId: actorId,
        })
        .where(eq(dataRetentionPolicies.policyKey, policyKey))
        .returning({ id: dataRetentionPolicies.id });
      if (!updated)
        throw new NotFoundException("Retention policy was not found");
      await tx.insert(activityLogs).values({
        action: "admin.retention.update",
        actorId,
        details: { policyKey, ...input },
        targetId: updated.id,
        targetType: "data_retention_policy",
      });
    });
    return this.list();
  }

  private map(row: RetentionPolicyRow) {
    return {
      enabled: row.enabled,
      lastCompletedAt: row.lastCompletedAt?.toISOString() ?? null,
      lastDeletedCount: row.lastDeletedCount,
      lastError: row.lastError,
      lastStartedAt: row.lastStartedAt?.toISOString() ?? null,
      policyKey: row.policyKey,
      retentionDays: row.retentionDays,
      updatedAt: row.updatedAt.toISOString(),
      updatedByUserId: row.updatedByUserId,
    };
  }
}
