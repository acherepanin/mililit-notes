import { createHash, randomBytes } from "node:crypto";

import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  aiAuditLogs,
  aiMessages,
  aiToolCalls,
  aiToolConfirmations,
  aiUserSettings,
} from "@notes/db";
import { and, asc, eq, gt, inArray, lt } from "drizzle-orm";

import { DatabaseService } from "../database/database.service.js";
import { CorrelationContextService } from "../observability/correlation-context.service.js";
import { AiPolicyService } from "./ai-policy.service.js";
import type { JsonObject } from "./ai.types.js";
import { canonicalJsonSha256 } from "./canonical-json.js";

const CONFIRMATION_TTL_MS = 10 * 60 * 1_000;

function tokenHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

@Injectable()
export class ToolConfirmationService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AiPolicyService) private readonly policy: AiPolicyService,
    @Inject(CorrelationContextService)
    private readonly correlation: CorrelationContextService,
  ) {}

  async createToolCall(
    userId: number,
    messageId: number,
    toolName: string,
    argumentsValue: JsonObject,
    idempotencyKey?: string,
    forceConfirmation = false,
  ) {
    const riskClass = this.policy.riskFor(toolName);
    const argumentsHash = canonicalJsonSha256(argumentsValue);
    const token = randomBytes(32).toString("base64url");
    const now = new Date();
    return this.database.client.transaction(async (tx) => {
      const [message] = await tx
        .select({ id: aiMessages.id })
        .from(aiMessages)
        .where(and(eq(aiMessages.id, messageId), eq(aiMessages.userId, userId)))
        .limit(1);
      if (!message) throw new NotFoundException("AI message was not found");
      const [settings] = await tx
        .select({
          requireActionConfirmation: aiUserSettings.requireActionConfirmation,
        })
        .from(aiUserSettings)
        .where(eq(aiUserSettings.userId, userId))
        .limit(1);
      const requiresConfirmation =
        forceConfirmation ||
        this.policy.requiresConfirmation(toolName) ||
        (riskClass === "reversible_write" &&
          (settings?.requireActionConfirmation ?? true));
      const [toolCall] = await tx
        .insert(aiToolCalls)
        .values({
          arguments: argumentsValue,
          argumentsHash,
          correlationId: this.correlation.getOrCreate(),
          ...(idempotencyKey ? { idempotencyKey } : {}),
          messageId,
          requiresConfirmation,
          riskClass,
          status: requiresConfirmation ? "awaiting_confirmation" : "approved",
          toolName,
          userId,
        })
        .returning();
      if (!toolCall) throw new Error("AI tool call insert failed");
      if (!requiresConfirmation) {
        return { confirmation: null, toolCall };
      }
      const [confirmation] = await tx
        .insert(aiToolConfirmations)
        .values({
          argumentsHash,
          expiresAt: new Date(now.getTime() + CONFIRMATION_TTL_MS),
          tokenHash: tokenHash(token),
          toolCallId: toolCall.id,
          userId,
        })
        .returning();
      if (!confirmation) throw new Error("AI tool confirmation insert failed");
      return {
        confirmation: {
          expiresAt: confirmation.expiresAt.toISOString(),
          id: confirmation.id,
          token,
        },
        toolCall,
      };
    });
  }

  async listPending(userId: number) {
    await this.expirePending(userId);
    const rows = await this.database.client
      .select({
        arguments: aiToolCalls.arguments,
        argumentsHash: aiToolConfirmations.argumentsHash,
        createdAt: aiToolConfirmations.createdAt,
        expiresAt: aiToolConfirmations.expiresAt,
        id: aiToolConfirmations.id,
        riskClass: aiToolCalls.riskClass,
        toolCallId: aiToolCalls.id,
        toolName: aiToolCalls.toolName,
      })
      .from(aiToolConfirmations)
      .innerJoin(
        aiToolCalls,
        eq(aiToolCalls.id, aiToolConfirmations.toolCallId),
      )
      .where(
        and(
          eq(aiToolConfirmations.userId, userId),
          eq(aiToolConfirmations.status, "pending"),
          gt(aiToolConfirmations.expiresAt, new Date()),
        ),
      )
      .orderBy(asc(aiToolConfirmations.createdAt), asc(aiToolConfirmations.id));
    return rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
    }));
  }

  async decide(userId: number, id: number, decision: "approved" | "rejected") {
    const result = await this.database.client.transaction(async (tx) => {
      const [row] = await tx
        .select({
          expiresAt: aiToolConfirmations.expiresAt,
          status: aiToolConfirmations.status,
          toolCallId: aiToolConfirmations.toolCallId,
          toolName: aiToolCalls.toolName,
        })
        .from(aiToolConfirmations)
        .innerJoin(
          aiToolCalls,
          eq(aiToolCalls.id, aiToolConfirmations.toolCallId),
        )
        .where(
          and(
            eq(aiToolConfirmations.id, id),
            eq(aiToolConfirmations.userId, userId),
          ),
        )
        .for("update")
        .limit(1);
      if (!row) throw new NotFoundException("AI confirmation was not found");
      if (row.status !== "pending") {
        throw new ConflictException("AI confirmation is no longer pending");
      }
      const now = new Date();
      if (row.expiresAt <= now) {
        await tx
          .update(aiToolConfirmations)
          .set({ status: "expired" })
          .where(eq(aiToolConfirmations.id, id));
        await tx
          .update(aiToolCalls)
          .set({ status: "expired" })
          .where(eq(aiToolCalls.id, row.toolCallId));
        return "expired" as const;
      }
      await tx
        .update(aiToolConfirmations)
        .set({ decidedAt: now, status: decision })
        .where(eq(aiToolConfirmations.id, id));
      await tx
        .update(aiToolCalls)
        .set({ status: decision })
        .where(
          and(
            eq(aiToolCalls.id, row.toolCallId),
            eq(aiToolCalls.userId, userId),
          ),
        );
      await tx.insert(aiAuditLogs).values({
        action: `ai.tool-confirmations.${decision}`,
        details: { toolName: row.toolName },
        targetId: row.toolCallId,
        targetType: "ai_tool_call",
        userId,
      });
      return "decided" as const;
    });
    if (result === "expired") {
      throw new ConflictException("AI confirmation has expired");
    }
    const [confirmation] = await this.database.client
      .select({ toolCallId: aiToolConfirmations.toolCallId })
      .from(aiToolConfirmations)
      .where(
        and(
          eq(aiToolConfirmations.id, id),
          eq(aiToolConfirmations.userId, userId),
        ),
      )
      .limit(1);
    if (!confirmation)
      throw new NotFoundException("AI confirmation was not found");
    return { decision, id, toolCallId: confirmation.toolCallId };
  }

  async claimForExecution(userId: number, toolCallId: number) {
    return this.database.client.transaction(async (tx) => {
      const [toolCall] = await tx
        .select()
        .from(aiToolCalls)
        .where(
          and(eq(aiToolCalls.id, toolCallId), eq(aiToolCalls.userId, userId)),
        )
        .for("update")
        .limit(1);
      if (!toolCall) throw new NotFoundException("AI tool call was not found");
      if (toolCall.status !== "approved") {
        throw new ConflictException("AI tool call is not approved");
      }
      const [claimed] = await tx
        .update(aiToolCalls)
        .set({ startedAt: new Date(), status: "executing" })
        .where(
          and(
            eq(aiToolCalls.id, toolCallId),
            eq(aiToolCalls.userId, userId),
            eq(aiToolCalls.status, "approved"),
          ),
        )
        .returning();
      if (!claimed)
        throw new ConflictException("AI tool call was already claimed");
      await tx
        .update(aiToolConfirmations)
        .set({ consumedAt: new Date(), status: "consumed" })
        .where(
          and(
            eq(aiToolConfirmations.toolCallId, toolCallId),
            eq(aiToolConfirmations.userId, userId),
            eq(aiToolConfirmations.status, "approved"),
          ),
        );
      return claimed;
    });
  }

  async finishExecution(
    userId: number,
    toolCallId: number,
    result: JsonObject | null,
    errorCode: string | null = null,
  ): Promise<void> {
    const status = errorCode === null ? "succeeded" : "failed";
    await this.database.client.transaction(async (tx) => {
      const [updated] = await tx
        .update(aiToolCalls)
        .set({ completedAt: new Date(), errorCode, result, status })
        .where(
          and(
            eq(aiToolCalls.id, toolCallId),
            eq(aiToolCalls.userId, userId),
            eq(aiToolCalls.status, "executing"),
          ),
        )
        .returning({ toolName: aiToolCalls.toolName });
      if (!updated) {
        throw new ConflictException("AI tool call is not executing");
      }
      await tx.insert(aiAuditLogs).values({
        action: `ai.tools.${status}`,
        details: { errorCode, toolName: updated.toolName },
        targetId: toolCallId,
        targetType: "ai_tool_call",
        userId,
      });
    });
  }

  async failApproved(
    userId: number,
    toolCallId: number,
    errorCode: string,
  ): Promise<void> {
    const [updated] = await this.database.client
      .update(aiToolCalls)
      .set({ completedAt: new Date(), errorCode, status: "failed" })
      .where(
        and(
          eq(aiToolCalls.id, toolCallId),
          eq(aiToolCalls.userId, userId),
          eq(aiToolCalls.status, "approved"),
        ),
      )
      .returning({ id: aiToolCalls.id });
    if (!updated) throw new ConflictException("AI tool call is not approved");
  }

  private async expirePending(userId: number): Promise<void> {
    await this.database.client.transaction(async (tx) => {
      const expired = await tx
        .update(aiToolConfirmations)
        .set({ status: "expired" })
        .where(
          and(
            eq(aiToolConfirmations.userId, userId),
            eq(aiToolConfirmations.status, "pending"),
            lt(aiToolConfirmations.expiresAt, new Date()),
          ),
        )
        .returning({ toolCallId: aiToolConfirmations.toolCallId });
      if (expired.length > 0) {
        await tx
          .update(aiToolCalls)
          .set({ status: "expired" })
          .where(
            and(
              eq(aiToolCalls.userId, userId),
              inArray(
                aiToolCalls.id,
                expired.map((item) => item.toolCallId),
              ),
            ),
          );
      }
    });
  }
}
