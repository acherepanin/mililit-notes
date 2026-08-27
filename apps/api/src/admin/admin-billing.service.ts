import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  activityLogs,
  type Entitlements,
  subscriptionPlans,
  userSubscriptions,
  users,
} from "@notes/db";
import {
  and,
  asc,
  countDistinct,
  desc,
  eq,
  gt,
  isNull,
  or,
  sql,
} from "drizzle-orm";

import { DatabaseService } from "../database/database.service.js";
import type {
  AdminEntitlementPatch,
  AdminPlanUpdateInput,
  AdminSubscriptionAssignmentInput,
} from "./admin-billing.validation.js";

type PlanRow = typeof subscriptionPlans.$inferSelect;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function mergeEntitlements(
  current: Entitlements,
  patch: AdminEntitlementPatch,
): Entitlements {
  const result: Record<string, unknown> = { ...record(current) };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      result[key] = { ...record(result[key]), ...value };
    }
  }
  return result as Entitlements;
}

@Injectable()
export class AdminBillingService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async listPlans() {
    const now = new Date();
    const [plans, subscriberCounts] = await Promise.all([
      this.database.client
        .select()
        .from(subscriptionPlans)
        .orderBy(asc(subscriptionPlans.sortOrder), asc(subscriptionPlans.id)),
      this.database.client
        .select({
          planId: userSubscriptions.planId,
          subscribers: countDistinct(userSubscriptions.userId),
        })
        .from(userSubscriptions)
        .where(
          and(
            eq(userSubscriptions.status, "active"),
            or(
              isNull(userSubscriptions.expiresAt),
              gt(userSubscriptions.expiresAt, now),
            ),
          ),
        )
        .groupBy(userSubscriptions.planId),
    ]);
    const byPlan = new Map(
      subscriberCounts.map((row) => [row.planId, row.subscribers]),
    );
    return {
      items: plans.map((plan) => this.mapPlan(plan, byPlan.get(plan.id) ?? 0)),
    };
  }

  async updatePlan(
    actorId: number,
    planId: number,
    input: AdminPlanUpdateInput,
  ) {
    await this.database.client.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.id, planId))
        .limit(1);
      if (!current)
        throw new NotFoundException("Subscription plan was not found");
      this.assertFreePlanPolicy(current, input);
      const changedFields = Object.keys(input).filter(
        (key) => key !== "expectedRevision",
      );
      const [updated] = await tx
        .update(subscriptionPlans)
        .set({
          ...(input.billingPeriod === undefined
            ? {}
            : { billingPeriod: input.billingPeriod }),
          ...(input.currency === undefined ? {} : { currency: input.currency }),
          ...(input.description === undefined
            ? {}
            : { description: input.description }),
          ...(input.entitlements === undefined
            ? {}
            : {
                entitlements: mergeEntitlements(
                  current.entitlements,
                  input.entitlements,
                ),
              }),
          ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
          ...(input.isHidden === undefined ? {} : { isHidden: input.isHidden }),
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.priceCents === undefined
            ? {}
            : { priceCents: input.priceCents }),
          ...(input.sortOrder === undefined
            ? {}
            : { sortOrder: input.sortOrder }),
          revision: sql`${subscriptionPlans.revision} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(subscriptionPlans.id, planId),
            eq(subscriptionPlans.revision, input.expectedRevision),
          ),
        )
        .returning({ id: subscriptionPlans.id });
      if (!updated) {
        throw new ConflictException(
          "Subscription plan changed; refresh before saving",
        );
      }
      await tx.insert(activityLogs).values({
        action: "admin.plan.update",
        actorId,
        details: { changedFields, planId },
        targetId: planId,
        targetType: "subscription_plan",
      });
    });
    return this.listPlans();
  }

  async assignSubscription(
    actorId: number,
    userId: number,
    input: AdminSubscriptionAssignmentInput,
  ) {
    const subscription = await this.database.client.transaction(async (tx) => {
      await tx.execute(
        sql`select ${users.id} from ${users} where ${users.id} = ${userId} for update`,
      );
      const [user] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!user) throw new NotFoundException("User was not found");
      const [plan] = await tx
        .select({
          id: subscriptionPlans.id,
          isActive: subscriptionPlans.isActive,
          name: subscriptionPlans.name,
          slug: subscriptionPlans.slug,
        })
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.id, input.planId))
        .limit(1);
      if (!plan) throw new NotFoundException("Subscription plan was not found");
      if (!plan.isActive)
        throw new BadRequestException("Inactive plans cannot be assigned");
      const now = new Date();
      const [current] = await tx
        .select({ id: userSubscriptions.id, planId: userSubscriptions.planId })
        .from(userSubscriptions)
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
      if ((current?.id ?? null) !== input.expectedCurrentSubscriptionId) {
        throw new ConflictException(
          "User subscription changed; refresh before assigning",
        );
      }
      if (current?.planId === plan.id) {
        return {
          id: current.id,
          planId: plan.id,
          planName: plan.name,
          planSlug: plan.slug,
        };
      }
      await tx
        .update(userSubscriptions)
        .set({ cancelledAt: now, status: "cancelled", updatedAt: now })
        .where(
          and(
            eq(userSubscriptions.userId, userId),
            eq(userSubscriptions.status, "active"),
          ),
        );
      const [created] = await tx
        .insert(userSubscriptions)
        .values({
          planId: plan.id,
          source: "admin",
          startedAt: now,
          status: "active",
          userId,
        })
        .returning({ id: userSubscriptions.id });
      if (!created) throw new Error("Subscription insert did not return a row");
      await tx.insert(activityLogs).values({
        action: "admin.subscription.assign",
        actorId,
        details: {
          planId: plan.id,
          previousPlanId: current?.planId ?? null,
          subscriptionId: created.id,
        },
        targetId: userId,
        targetType: "user",
        userId,
      });
      return {
        id: created.id,
        planId: plan.id,
        planName: plan.name,
        planSlug: plan.slug,
      };
    });
    return { subscription };
  }

  private assertFreePlanPolicy(
    current: PlanRow,
    input: AdminPlanUpdateInput,
  ): void {
    if (current.slug !== "free") return;
    if (input.priceCents !== undefined && input.priceCents !== 0) {
      throw new BadRequestException("The free plan price must remain zero");
    }
    if (input.billingPeriod && input.billingPeriod !== "lifetime") {
      throw new BadRequestException(
        "The free plan billing period must remain lifetime",
      );
    }
    if (input.isActive === false || input.isHidden === true) {
      throw new BadRequestException(
        "The free fallback plan must remain active and visible",
      );
    }
  }

  private mapPlan(plan: PlanRow, subscribers: number) {
    return {
      billingPeriod: plan.billingPeriod,
      currency: plan.currency,
      description: plan.description,
      entitlements: plan.entitlements,
      id: plan.id,
      isActive: plan.isActive,
      isHidden: plan.isHidden,
      name: plan.name,
      priceCents: plan.priceCents,
      revision: plan.revision,
      slug: plan.slug,
      sortOrder: plan.sortOrder,
      subscribers,
      updatedAt: plan.updatedAt.toISOString(),
    };
  }
}
