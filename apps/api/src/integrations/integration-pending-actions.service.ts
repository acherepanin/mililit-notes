import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { aiBotPendingActions } from "@notes/db";
import { and, eq } from "drizzle-orm";

import { DatabaseService } from "../database/database.service.js";
import type { IntegrationProvider } from "./integrations.types.js";

const PROCESSING_LEASE_MS = 3 * 60 * 1_000;

export type PendingActionTerminalStatus =
  "expired" | "failed" | "rejected" | "succeeded";

type PendingActionRow = typeof aiBotPendingActions.$inferSelect;

export type PendingActionClaim =
  | { action: PendingActionRow; kind: "claimed" }
  | { action: PendingActionRow; kind: "terminal"; responseText: string };

function terminalResponse(row: PendingActionRow): string {
  if (row.responseText) return row.responseText;
  if (row.status === "expired") return "Срок подтверждения действия истек.";
  if (row.status === "rejected") return "Действие отменено.";
  if (row.status === "succeeded") return "Действие уже выполнено.";
  return "Действие завершилось ошибкой и не было запущено повторно.";
}

@Injectable()
export class IntegrationPendingActionsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async create(input: {
    actionName: string;
    actionPayload: Record<string, unknown>;
    expiresAt: Date;
    externalId: string;
    provider: IntegrationProvider;
    userId: number;
  }) {
    const [created] = await this.database.client
      .insert(aiBotPendingActions)
      .values(input)
      .returning();
    if (!created) throw new Error("Bot pending action insert failed");
    return created;
  }

  async claim(
    userId: number,
    provider: IntegrationProvider,
    externalId: string,
    pendingId: number,
  ): Promise<PendingActionClaim> {
    if (!Number.isSafeInteger(pendingId) || pendingId < 1) {
      throw new BadRequestException("Invalid pending action ID");
    }
    const result = await this.database.client.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(aiBotPendingActions)
        .where(
          and(
            eq(aiBotPendingActions.id, pendingId),
            eq(aiBotPendingActions.userId, userId),
            eq(aiBotPendingActions.provider, provider),
            eq(aiBotPendingActions.externalId, externalId),
          ),
        )
        .for("update")
        .limit(1);
      if (!row) throw new NotFoundException("Pending action was not found");

      const now = new Date();
      if (
        !["succeeded", "rejected", "failed", "expired"].includes(row.status) &&
        row.expiresAt <= now
      ) {
        const [expired] = await tx
          .update(aiBotPendingActions)
          .set({
            claimedAt: null,
            completedAt: now,
            responseText: "Срок подтверждения действия истек.",
            status: "expired",
            updatedAt: now,
          })
          .where(eq(aiBotPendingActions.id, row.id))
          .returning();
        if (!expired) throw new ConflictException("Pending action expired");
        return "expired" as const;
      }

      if (["succeeded", "rejected", "failed", "expired"].includes(row.status)) {
        return {
          action: row,
          kind: "terminal" as const,
          responseText: terminalResponse(row),
        };
      }
      if (
        row.status === "processing" &&
        row.claimedAt &&
        row.claimedAt.getTime() > now.getTime() - PROCESSING_LEASE_MS
      ) {
        throw new ServiceUnavailableException("Pending action is processing");
      }

      const [claimed] = await tx
        .update(aiBotPendingActions)
        .set({
          claimedAt: now,
          lastError: null,
          status: "processing",
          updatedAt: now,
        })
        .where(eq(aiBotPendingActions.id, row.id))
        .returning();
      if (!claimed) throw new ConflictException("Pending action claim failed");
      return { action: claimed, kind: "claimed" as const };
    });
    if (result === "expired") {
      throw new BadRequestException("Pending action was not found or expired");
    }
    return result;
  }

  async release(id: number, userId: number, lastError: string): Promise<void> {
    const [released] = await this.database.client
      .update(aiBotPendingActions)
      .set({
        claimedAt: null,
        lastError: lastError.slice(0, 500),
        status: "pending",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(aiBotPendingActions.id, id),
          eq(aiBotPendingActions.userId, userId),
          eq(aiBotPendingActions.status, "processing"),
        ),
      )
      .returning({ id: aiBotPendingActions.id });
    if (!released)
      throw new ConflictException("Pending action is not processing");
  }

  async finish(
    id: number,
    userId: number,
    status: Exclude<PendingActionTerminalStatus, "expired">,
    responseText: string,
    lastError: string | null = null,
  ): Promise<void> {
    const now = new Date();
    const [finished] = await this.database.client
      .update(aiBotPendingActions)
      .set({
        completedAt: now,
        lastError: lastError?.slice(0, 500) ?? null,
        responseText: responseText.slice(0, 8_000),
        status,
        updatedAt: now,
      })
      .where(
        and(
          eq(aiBotPendingActions.id, id),
          eq(aiBotPendingActions.userId, userId),
          eq(aiBotPendingActions.status, "processing"),
        ),
      )
      .returning({ id: aiBotPendingActions.id });
    if (!finished)
      throw new ConflictException("Pending action is not processing");
  }
}
