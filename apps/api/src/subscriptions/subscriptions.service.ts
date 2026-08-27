import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  activityLogs,
  notificationPreferences,
  subscriptionOrders,
  subscriptionPlans,
  userNotifications,
  userSubscriptions,
} from "@notes/db";
import { and, asc, desc, eq, gt, isNull, or, sql } from "drizzle-orm";

import { DatabaseService } from "../database/database.service.js";
import { EntitlementsService } from "../entitlements/entitlements.service.js";
import {
  checkoutAmount,
  type CheckoutInput,
} from "./subscriptions.validation.js";

@Injectable()
export class SubscriptionsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(EntitlementsService)
    private readonly entitlements: EntitlementsService,
  ) {}

  async getState(userId: number) {
    const now = new Date();
    const [effective, plans, active] = await Promise.all([
      this.entitlements.getEffective(userId),
      this.database.client
        .select({
          billingPeriod: subscriptionPlans.billingPeriod,
          currency: subscriptionPlans.currency,
          description: subscriptionPlans.description,
          entitlements: subscriptionPlans.entitlements,
          id: subscriptionPlans.id,
          name: subscriptionPlans.name,
          priceCents: subscriptionPlans.priceCents,
          slug: subscriptionPlans.slug,
        })
        .from(subscriptionPlans)
        .where(
          and(
            eq(subscriptionPlans.isActive, true),
            eq(subscriptionPlans.isHidden, false),
          ),
        )
        .orderBy(asc(subscriptionPlans.sortOrder), asc(subscriptionPlans.id)),
      this.database.client
        .select({
          expiresAt: userSubscriptions.expiresAt,
          id: userSubscriptions.id,
          source: userSubscriptions.source,
          startedAt: userSubscriptions.startedAt,
        })
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
        .limit(1),
    ]);
    return {
      checkoutAvailable: this.mockCheckoutAllowed(),
      current: {
        entitlements: effective,
        expiresAt: active[0]?.expiresAt?.toISOString() ?? null,
        id: effective.subscriptionId,
        plan: effective.plan,
        source: active[0]?.source ?? "fallback",
        startedAt: active[0]?.startedAt?.toISOString() ?? null,
      },
      plans,
    };
  }

  async checkout(userId: number, input: CheckoutInput) {
    this.assertMockCheckoutAllowed();
    const [plan] = await this.database.client
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, input.planId))
      .limit(1);
    if (!plan || !plan.isActive) {
      throw new NotFoundException("Subscription plan is not available");
    }
    if (
      plan.isHidden ||
      plan.slug === "free" ||
      plan.billingPeriod === "lifetime"
    ) {
      throw new BadRequestException(
        "This subscription plan cannot be purchased",
      );
    }
    const termMonths = plan.billingPeriod === "year" ? 12 : input.termMonths;
    if (input.mode === "renew") {
      const effective = await this.entitlements.getEffective(userId);
      if (effective.plan.id !== plan.id || effective.subscriptionId === null) {
        throw new BadRequestException(
          "Only the current paid plan can be renewed",
        );
      }
    }
    const quote = checkoutAmount(plan.priceCents, termMonths);
    const [order] = await this.database.client
      .insert(subscriptionOrders)
      .values({
        ...quote,
        checkoutMode: input.mode,
        currency: plan.currency,
        paymentProvider: "mock",
        planId: plan.id,
        status: "pending",
        termMonths,
        userId,
      })
      .returning();
    if (!order) throw new Error("Subscription order insert returned no row");
    return this.mapOrder(order);
  }

  async confirm(userId: number, orderId: number) {
    this.assertMockCheckoutAllowed();
    return this.database.client.transaction(async (tx) => {
      await tx.execute(
        sql`select ${subscriptionOrders.id} from ${subscriptionOrders} where ${subscriptionOrders.id} = ${orderId} for update`,
      );
      const [order] = await tx
        .select()
        .from(subscriptionOrders)
        .where(
          and(
            eq(subscriptionOrders.id, orderId),
            eq(subscriptionOrders.userId, userId),
          ),
        )
        .limit(1);
      if (!order)
        throw new NotFoundException("Subscription order was not found");
      if (order.status !== "pending") {
        throw new ConflictException("Subscription order was already processed");
      }
      const [plan] = await tx
        .select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.id, order.planId))
        .limit(1);
      if (!plan) throw new NotFoundException("Subscription plan was not found");
      await tx.execute(sql`select pg_advisory_xact_lock(92020, ${userId})`);
      const now = new Date();
      const [current] = await tx
        .select()
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
      let subscriptionId: number;
      let expiresAt: Date | null;
      if (order.checkoutMode === "renew") {
        if (!current || current.planId !== plan.id) {
          throw new ConflictException(
            "The active subscription changed before renewal",
          );
        }
        expiresAt = this.addMonths(
          current.expiresAt && current.expiresAt > now
            ? current.expiresAt
            : now,
          order.termMonths,
        );
        await tx
          .update(userSubscriptions)
          .set({ expiresAt, updatedAt: now })
          .where(eq(userSubscriptions.id, current.id));
        subscriptionId = current.id;
      } else {
        await tx
          .update(userSubscriptions)
          .set({ cancelledAt: now, status: "cancelled", updatedAt: now })
          .where(
            and(
              eq(userSubscriptions.userId, userId),
              eq(userSubscriptions.status, "active"),
            ),
          );
        expiresAt = this.addMonths(now, order.termMonths);
        const [created] = await tx
          .insert(userSubscriptions)
          .values({
            expiresAt,
            planId: plan.id,
            source: "checkout",
            startedAt: now,
            status: "active",
            userId,
          })
          .returning({ id: userSubscriptions.id });
        if (!created) throw new Error("Subscription insert returned no row");
        subscriptionId = created.id;
      }
      await tx
        .update(subscriptionOrders)
        .set({
          paidAt: now,
          paymentExternalId: `mock-${order.id}`,
          status: "paid",
          updatedAt: now,
        })
        .where(eq(subscriptionOrders.id, order.id));
      await tx.insert(activityLogs).values({
        action:
          order.checkoutMode === "renew"
            ? "subscription.renew"
            : "subscription.purchase",
        actorId: userId,
        details: {
          amountCents: order.amountCents,
          planId: plan.id,
          termMonths: order.termMonths,
        },
        targetId: subscriptionId,
        targetType: "subscription",
        userId,
      });
      const [preferences] = await tx
        .select({
          subscriptionEvents: notificationPreferences.subscriptionEvents,
        })
        .from(notificationPreferences)
        .where(eq(notificationPreferences.userId, userId))
        .limit(1);
      if (preferences?.subscriptionEvents !== false) {
        await tx
          .insert(userNotifications)
          .values({
            kind:
              order.checkoutMode === "renew"
                ? "subscription_renew"
                : "subscription_purchase",
            payload: {
              expiresAt: expiresAt.toISOString(),
              planName: plan.name,
            },
            sourceKey: `subscription-order:${order.id}`,
            userId,
          })
          .onConflictDoNothing({ target: userNotifications.sourceKey });
      }
      return {
        expiresAt: expiresAt.toISOString(),
        id: subscriptionId,
        plan: { id: plan.id, name: plan.name, slug: plan.slug },
      };
    });
  }

  private addMonths(value: Date, months: number) {
    const result = new Date(value);
    result.setUTCMonth(result.getUTCMonth() + months);
    return result;
  }

  private assertMockCheckoutAllowed() {
    if (!this.mockCheckoutAllowed()) {
      throw new BadRequestException("Mock checkout is disabled");
    }
  }

  private mockCheckoutAllowed() {
    return (
      process.env.NODE_ENV !== "production" ||
      process.env.ALLOW_MOCK_CHECKOUT === "true"
    );
  }

  private mapOrder(order: typeof subscriptionOrders.$inferSelect) {
    return {
      amountCents: order.amountCents,
      checkoutMode: order.checkoutMode,
      currency: order.currency,
      discountPercent: order.discountPercent,
      id: order.id,
      planId: order.planId,
      status: order.status,
      termMonths: order.termMonths,
    };
  }
}
