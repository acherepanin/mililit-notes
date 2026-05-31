import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';

import { ActivityModule } from '../activity/activity.module';
import { ActivityService } from '../activity/activity.service';
import { ConfigService } from '@nestjs/config';

import { normalizePlanCurrency } from '../common/currency.util';
import { DatabaseService } from '../infra/database.service';
import {
  DEFAULT_FREE_ENTITLEMENTS,
  DEFAULT_PRO_ENTITLEMENTS,
  type PlanEntitlements,
} from './entitlements.types';
import { parseEntitlementsJson, serializeEntitlements } from './entitlements.util';
import {
  addMonths,
  calculateCheckoutAmount,
  isCheckoutTermMonths,
  type CheckoutMode,
  type CheckoutTermMonths,
} from './subscription-pricing.util';
import type {
  BillingPeriod,
  MeSubscriptionBundle,
  SubscriptionOrderRecord,
  SubscriptionOrderResponse,
  SubscriptionPlanRecord,
  SubscriptionPlanResponse,
  UserSubscriptionRecord,
  UserSubscriptionResponse,
  UserSubscriptionSource,
  UserSubscriptionStatus,
} from './subscriptions.types';
import type { CreateSubscriptionPlanDto } from './dto/create-subscription-plan.dto';
import type { UpdateSubscriptionPlanDto } from './dto/update-subscription-plan.dto';
import type { CheckoutDto } from './dto/checkout.dto';

@Injectable()
export class SubscriptionsService implements OnModuleInit {
  constructor(
    @Inject(DatabaseService) private readonly databaseService: DatabaseService,
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(ActivityService) private readonly activityService: ActivityService,
  ) {}

  onModuleInit(): void {
    this.seedDefaultPlans();
    this.migrateUsersToFreePlan();
  }

  listActivePlans(): SubscriptionPlanResponse[] {
    return this.databaseService.connection
      .prepare(
        `
          SELECT *
          FROM subscription_plans
          WHERE is_active = 1 AND is_hidden = 0
          ORDER BY sort_order ASC, id ASC
        `,
      )
      .all()
      .map((row) => this.mapPlan(row as SubscriptionPlanRecord));
  }

  listAllPlans(): SubscriptionPlanResponse[] {
    return this.databaseService.connection
      .prepare('SELECT * FROM subscription_plans ORDER BY sort_order ASC, id ASC')
      .all()
      .map((row) => this.mapPlan(row as SubscriptionPlanRecord));
  }

  getPlanById(id: number): SubscriptionPlanResponse {
    const row = this.databaseService.connection
      .prepare('SELECT * FROM subscription_plans WHERE id = @id')
      .get({ id }) as SubscriptionPlanRecord | undefined;
    if (!row) {
      throw new NotFoundException(`Plan ${id} was not found`);
    }
    return this.mapPlan(row);
  }

  getPlanBySlug(slug: string): SubscriptionPlanResponse {
    const row = this.databaseService.connection
      .prepare('SELECT * FROM subscription_plans WHERE slug = @slug')
      .get({ slug }) as SubscriptionPlanRecord | undefined;
    if (!row) {
      throw new NotFoundException(`Plan ${slug} was not found`);
    }
    return this.mapPlan(row);
  }

  createPlan(dto: CreateSubscriptionPlanDto): SubscriptionPlanResponse {
    const now = new Date().toISOString();
    const entitlements = serializeEntitlements(dto.entitlements);
    try {
      const result = this.databaseService.connection
        .prepare(
          `
            INSERT INTO subscription_plans
              (slug, name, description, price_cents, currency, billing_period, entitlements_json, icon_key, card_color, card_art, is_active, is_hidden, sort_order, created_at, updated_at)
            VALUES
              (@slug, @name, @description, @priceCents, @currency, @billingPeriod, @entitlementsJson, @iconKey, @cardColor, @cardArt, @isActive, @isHidden, @sortOrder, @now, @now)
          `,
        )
        .run({
          slug: dto.slug.trim(),
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          priceCents: dto.priceCents,
          currency: dto.currency?.trim() || 'rub',
          billingPeriod: dto.billingPeriod,
          entitlementsJson: entitlements,
          iconKey: dto.iconKey?.trim() || 'package',
          cardColor: dto.cardColor?.trim() || 'sky',
          cardArt: dto.cardArt?.trim() || 'bubbles',
          isActive: dto.isActive === false ? 0 : 1,
          isHidden: dto.isHidden === true ? 1 : 0,
          sortOrder: dto.sortOrder ?? 0,
          now,
        });
      return this.getPlanById(Number(result.lastInsertRowid));
    } catch {
      throw new BadRequestException('Plan slug must be unique');
    }
  }

  updatePlan(id: number, dto: UpdateSubscriptionPlanDto): SubscriptionPlanResponse {
    const current = this.getPlanById(id);
    if (current.slug === 'free' && dto.isActive === false) {
      throw new BadRequestException('The free plan cannot be deactivated');
    }
    if (current.slug === 'free' && dto.isHidden === true) {
      throw new BadRequestException('The free plan cannot be hidden');
    }
    const now = new Date().toISOString();
    this.databaseService.connection
      .prepare(
        `
          UPDATE subscription_plans
          SET
            slug = @slug,
            name = @name,
            description = @description,
            price_cents = @priceCents,
            currency = @currency,
            billing_period = @billingPeriod,
            entitlements_json = @entitlementsJson,
            icon_key = @iconKey,
            card_color = @cardColor,
            card_art = @cardArt,
            is_active = @isActive,
            is_hidden = @isHidden,
            sort_order = @sortOrder,
            updated_at = @now
          WHERE id = @id
        `,
      )
      .run({
        id,
        slug: dto.slug?.trim() ?? current.slug,
        name: dto.name?.trim() ?? current.name,
        description:
          dto.description === undefined
            ? current.description
            : dto.description?.trim() || null,
        priceCents: dto.priceCents ?? current.priceCents,
        currency: dto.currency?.trim() ?? current.currency,
        billingPeriod: dto.billingPeriod ?? current.billingPeriod,
        entitlementsJson: dto.entitlements
          ? serializeEntitlements(dto.entitlements)
          : serializeEntitlements(current.entitlements),
        iconKey: dto.iconKey?.trim() ?? current.iconKey,
        cardColor: dto.cardColor?.trim() ?? current.cardColor,
        cardArt: dto.cardArt?.trim() ?? current.cardArt,
        isActive: dto.isActive === undefined ? (current.isActive ? 1 : 0) : dto.isActive ? 1 : 0,
        isHidden: dto.isHidden === undefined ? (current.isHidden ? 1 : 0) : dto.isHidden ? 1 : 0,
        sortOrder: dto.sortOrder ?? current.sortOrder,
        now,
      });
    return this.getPlanById(id);
  }

  deletePlan(id: number): { id: number } {
    const plan = this.getPlanById(id);
    if (plan.slug === 'free') {
      throw new BadRequestException('The free plan cannot be deleted');
    }
    const usage = this.databaseService.connection
      .prepare('SELECT COUNT(*) as count FROM user_subscriptions WHERE plan_id = @id')
      .get({ id }) as { count: number };
    if (usage.count > 0) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Cannot delete a plan that has user subscriptions',
        code: 'PLAN_HAS_SUBSCRIBERS',
      });
    }
    this.databaseService.connection
      .prepare('DELETE FROM subscription_plans WHERE id = @id')
      .run({ id });
    return { id };
  }

  getMeSubscriptionBundle(userId: number): MeSubscriptionBundle {
    this.expireOutdatedSubscriptions();
    const subscription = this.getActiveUserSubscription(userId);
    const entitlements = subscription
      ? subscription.plan.entitlements
      : DEFAULT_FREE_ENTITLEMENTS;
    return {
      subscription,
      entitlements,
      storageUsedBytes: this.getUserStorageBytes(userId),
    };
  }

  assignPlanToUser(
    userId: number,
    planId: number,
    source: UserSubscriptionSource = 'admin_grant',
    actorId?: number | null,
  ): UserSubscriptionResponse {
    const plan = this.getPlanById(planId);
    const now = new Date().toISOString();
    const expiresAt = this.calculateExpiresAt(plan.billingPeriod, now);

    this.databaseService.connection
      .prepare(
        `
          UPDATE user_subscriptions
          SET status = 'cancelled', cancelled_at = @now, updated_at = @now
          WHERE user_id = @userId AND status = 'active'
        `,
      )
      .run({ userId, now });

    const result = this.databaseService.connection
      .prepare(
        `
          INSERT INTO user_subscriptions
            (user_id, plan_id, status, started_at, expires_at, cancelled_at, source, created_at, updated_at)
          VALUES
            (@userId, @planId, 'active', @startedAt, @expiresAt, NULL, @source, @now, @now)
        `,
      )
      .run({
        userId,
        planId,
        startedAt: now,
        expiresAt,
        source,
        now,
      });

    const subscription = this.getUserSubscriptionById(Number(result.lastInsertRowid));

    if (source === 'admin_grant') {
      this.activityService.record({
        actorId: actorId ?? userId,
        userId,
        action: 'subscription.admin_assign',
        targetType: 'subscription',
        targetId: subscription.id,
        details: {
          planName: plan.name,
          planSlug: plan.slug,
          billingPeriod: plan.billingPeriod,
          expiresAt: subscription.expiresAt,
          source,
        },
      });
    }

    return subscription;
  }

  ensureDefaultSubscription(userId: number): void {
    const existing = this.databaseService.connection
      .prepare(
        `
          SELECT id
          FROM user_subscriptions
          WHERE user_id = @userId
            AND status = 'active'
            AND (expires_at IS NULL OR expires_at > datetime('now'))
          LIMIT 1
        `,
      )
      .get({ userId }) as { id: number } | undefined;
    if (existing) {
      return;
    }
    const freePlan = this.getPlanBySlug('free');
    this.assignPlanToUser(userId, freePlan.id, 'migration');
  }

  createCheckout(userId: number, dto: CheckoutDto): SubscriptionOrderResponse {
    this.assertMockCheckoutAllowed();
    const plan = this.getPlanById(dto.planId);
    if (!plan.isActive) {
      throw new BadRequestException('Plan is not available for purchase');
    }
    if (plan.isHidden) {
      throw new BadRequestException('This plan cannot be purchased');
    }
    if (plan.slug === 'free' || plan.billingPeriod === 'lifetime') {
      throw new BadRequestException('This plan cannot be purchased');
    }

    const mode: CheckoutMode = dto.mode === 'renew' ? 'renew' : 'purchase';
    const termMonths = this.resolveCheckoutTermMonths(plan.billingPeriod, dto.termMonths);
    const active = this.getActiveUserSubscription(userId);

    if (mode === 'renew') {
      if (!active || active.plan.id !== plan.id) {
        throw new BadRequestException('Renewal is only available for your current active plan');
      }
    }

    const { amountCents, discountPercent } = calculateCheckoutAmount(
      plan.priceCents,
      termMonths,
      plan.billingPeriod,
    );
    const now = new Date().toISOString();
    const result = this.databaseService.connection
      .prepare(
        `
          INSERT INTO subscription_orders
            (user_id, plan_id, status, amount_cents, currency, payment_provider, payment_external_id, paid_at, term_months, checkout_mode, discount_percent, created_at, updated_at)
          VALUES
            (@userId, @planId, 'pending', @amountCents, @currency, 'mock', NULL, NULL, @termMonths, @checkoutMode, @discountPercent, @now, @now)
        `,
      )
      .run({
        userId,
        planId: dto.planId,
        amountCents,
        currency: plan.currency,
        termMonths,
        checkoutMode: mode,
        discountPercent,
        now,
      });
    return this.mapOrder(
      this.databaseService.connection
        .prepare('SELECT * FROM subscription_orders WHERE id = @id')
        .get({ id: Number(result.lastInsertRowid) }) as SubscriptionOrderRecord,
    );
  }

  confirmMockCheckout(userId: number, orderId: number): UserSubscriptionResponse {
    this.assertMockCheckoutAllowed();
    const order = this.databaseService.connection
      .prepare('SELECT * FROM subscription_orders WHERE id = @id AND user_id = @userId')
      .get({ id: orderId, userId }) as SubscriptionOrderRecord | undefined;
    if (!order) {
      throw new NotFoundException(`Order ${orderId} was not found`);
    }
    if (order.status !== 'pending') {
      throw new BadRequestException('Order is not pending');
    }
    const now = new Date().toISOString();
    this.databaseService.connection
      .prepare(
        `
          UPDATE subscription_orders
          SET status = 'paid', paid_at = @now, payment_external_id = @externalId, updated_at = @now
          WHERE id = @id
        `,
      )
      .run({ id: orderId, now, externalId: `mock-${orderId}` });
    const paidOrder = {
      ...order,
      status: 'paid' as const,
      paid_at: now,
    };
    return this.fulfillCheckoutOrder(userId, paidOrder);
  }

  private fulfillCheckoutOrder(
    userId: number,
    order: SubscriptionOrderRecord & { paid_at?: string | null },
  ): UserSubscriptionResponse {
    const plan = this.getPlanById(order.plan_id);
    const termMonths = order.term_months as CheckoutTermMonths;
    const mode = order.checkout_mode;
    const now = new Date().toISOString();

    if (mode === 'renew') {
      const active = this.getActiveUserSubscription(userId);
      if (!active || active.plan.id !== plan.id) {
        throw new BadRequestException('Renewal is only available for your current active plan');
      }

      const baseDate =
        active.expiresAt && active.expiresAt > now ? active.expiresAt : now;
      const expiresAt = this.calculateCheckoutExpiresAt(plan.billingPeriod, baseDate, termMonths);

      this.databaseService.connection
        .prepare(
          `
            UPDATE user_subscriptions
            SET expires_at = @expiresAt, updated_at = @now
            WHERE id = @id
          `,
        )
        .run({ id: active.id, expiresAt, now });

      const renewed = this.getUserSubscriptionById(active.id);
      this.activityService.record({
        actorId: userId,
        userId,
        action: 'subscription.renew',
        targetType: 'subscription_order',
        targetId: order.id,
        details: {
          planName: plan.name,
          planSlug: plan.slug,
          amountCents: order.amount_cents,
          currency: order.currency,
          termMonths,
          expiresAt: renewed.expiresAt,
          paidAt: order.paid_at ?? now,
          checkoutMode: mode,
        },
      });

      return renewed;
    }

    this.databaseService.connection
      .prepare(
        `
          UPDATE user_subscriptions
          SET status = 'cancelled', cancelled_at = @now, updated_at = @now
          WHERE user_id = @userId AND status = 'active'
        `,
      )
      .run({ userId, now });

    const expiresAt = this.calculateCheckoutExpiresAt(plan.billingPeriod, now, termMonths);
    const result = this.databaseService.connection
      .prepare(
        `
          INSERT INTO user_subscriptions
            (user_id, plan_id, status, started_at, expires_at, cancelled_at, source, created_at, updated_at)
          VALUES
            (@userId, @planId, 'active', @startedAt, @expiresAt, NULL, 'checkout', @now, @now)
        `,
      )
      .run({
        userId,
        planId: plan.id,
        startedAt: now,
        expiresAt,
        now,
      });

    const subscription = this.getUserSubscriptionById(Number(result.lastInsertRowid));
    this.activityService.record({
      actorId: userId,
      userId,
      action: 'subscription.purchase',
      targetType: 'subscription_order',
      targetId: order.id,
      details: {
        planName: plan.name,
        planSlug: plan.slug,
        amountCents: order.amount_cents,
        currency: order.currency,
        termMonths,
        expiresAt: subscription.expiresAt,
        paidAt: order.paid_at ?? now,
        checkoutMode: mode,
      },
    });

    return subscription;
  }

  private resolveCheckoutTermMonths(
    billingPeriod: BillingPeriod,
    requested?: number,
  ): CheckoutTermMonths {
    if (billingPeriod === 'year') {
      return 12;
    }
    if (billingPeriod !== 'month') {
      throw new BadRequestException('This plan cannot be purchased');
    }
    const termMonths = requested ?? 1;
    if (!isCheckoutTermMonths(termMonths)) {
      throw new BadRequestException('Invalid subscription term');
    }
    return termMonths;
  }

  private calculateCheckoutExpiresAt(
    billingPeriod: BillingPeriod,
    fromIso: string,
    termMonths: CheckoutTermMonths,
  ): string | null {
    if (billingPeriod === 'lifetime') {
      return null;
    }
    if (billingPeriod === 'year') {
      return addMonths(fromIso, 12);
    }
    return addMonths(fromIso, termMonths);
  }

  seedDefaultPlans(): void {
    const count = this.databaseService.connection
      .prepare('SELECT COUNT(*) as count FROM subscription_plans')
      .get() as { count: number };
    if (count.count > 0) {
      return;
    }
    const now = new Date().toISOString();
    const plans = [
      {
        slug: 'free',
        name: 'Free',
        description: 'Basic notes and limited storage',
        priceCents: 0,
        billingPeriod: 'lifetime' as BillingPeriod,
        entitlements: DEFAULT_FREE_ENTITLEMENTS,
        iconKey: 'notebook',
        cardColor: 'slate',
        cardArt: 'blocks',
        sortOrder: 0,
      },
      {
        slug: 'pro',
        name: 'Pro',
        description: 'AI assistant and expanded storage',
        priceCents: 990,
        billingPeriod: 'month' as BillingPeriod,
        entitlements: DEFAULT_PRO_ENTITLEMENTS,
        iconKey: 'sparkles',
        cardColor: 'sky',
        cardArt: 'stars',
        sortOrder: 1,
      },
    ];
    for (const plan of plans) {
      this.databaseService.connection
        .prepare(
          `
            INSERT INTO subscription_plans
              (slug, name, description, price_cents, currency, billing_period, entitlements_json, icon_key, card_color, card_art, is_active, sort_order, created_at, updated_at)
            VALUES
              (@slug, @name, @description, @priceCents, 'rub', @billingPeriod, @entitlementsJson, @iconKey, @cardColor, @cardArt, 1, @sortOrder, @now, @now)
          `,
        )
        .run({
          slug: plan.slug,
          name: plan.name,
          description: plan.description,
          priceCents: plan.priceCents,
          billingPeriod: plan.billingPeriod,
          entitlementsJson: serializeEntitlements(plan.entitlements),
          iconKey: plan.iconKey ?? 'package',
          cardColor: plan.cardColor ?? 'sky',
          cardArt: plan.cardArt ?? 'bubbles',
          sortOrder: plan.sortOrder,
          now,
        });
    }
  }

  migrateUsersToFreePlan(): void {
    const freePlan = this.databaseService.connection
      .prepare("SELECT id FROM subscription_plans WHERE slug = 'free'")
      .get() as { id: number } | undefined;
    if (!freePlan) {
      return;
    }
    const users = this.databaseService.connection
      .prepare('SELECT id FROM users')
      .all() as Array<{ id: number }>;
    for (const user of users) {
      this.ensureDefaultSubscription(user.id);
    }
  }

  private getActiveUserSubscription(userId: number): UserSubscriptionResponse | null {
    const row = this.databaseService.connection
      .prepare(
        `
          SELECT *
          FROM user_subscriptions
          WHERE user_id = @userId AND status = 'active'
          ORDER BY id DESC
          LIMIT 1
        `,
      )
      .get({ userId }) as UserSubscriptionRecord | undefined;
    if (!row) {
      return null;
    }
    if (row.expires_at && row.expires_at <= new Date().toISOString()) {
      return null;
    }
    return this.mapUserSubscription(row);
  }

  private getUserSubscriptionById(id: number): UserSubscriptionResponse {
    const row = this.databaseService.connection
      .prepare('SELECT * FROM user_subscriptions WHERE id = @id')
      .get({ id }) as UserSubscriptionRecord | undefined;
    if (!row) {
      throw new NotFoundException(`Subscription ${id} was not found`);
    }
    return this.mapUserSubscription(row);
  }

  private expireOutdatedSubscriptions(): void {
    const now = new Date().toISOString();
    this.databaseService.connection
      .prepare(
        `
          UPDATE user_subscriptions
          SET status = 'expired', updated_at = @now
          WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= @now
        `,
      )
      .run({ now });
  }

  private calculateExpiresAt(period: BillingPeriod, fromIso: string): string | null {
    if (period === 'lifetime') {
      return null;
    }
    const from = new Date(fromIso);
    if (period === 'year') {
      from.setUTCFullYear(from.getUTCFullYear() + 1);
    } else {
      from.setUTCMonth(from.getUTCMonth() + 1);
    }
    return from.toISOString();
  }

  private assertMockCheckoutAllowed(): void {
    const nodeEnv = this.configService.get<string>('NODE_ENV')?.trim() || 'development';
    const allowMock = this.configService.get<string>('ALLOW_MOCK_CHECKOUT')?.trim() === 'true';
    if (nodeEnv === 'production' && !allowMock) {
      throw new BadRequestException('Mock checkout is disabled');
    }
  }

  private mapPlan(row: SubscriptionPlanRecord): SubscriptionPlanResponse {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      priceCents: row.price_cents,
      currency: normalizePlanCurrency(row.currency),
      billingPeriod: row.billing_period,
      entitlements: parseEntitlementsJson(row.entitlements_json),
      iconKey: row.icon_key || 'package',
      cardColor: row.card_color || 'sky',
      cardArt: row.card_art || 'bubbles',
      isActive: row.is_active === 1,
      isHidden: (row.is_hidden ?? 0) === 1,
      sortOrder: row.sort_order,
    };
  }

  private mapUserSubscription(row: UserSubscriptionRecord): UserSubscriptionResponse {
    return {
      id: row.id,
      plan: this.getPlanById(row.plan_id),
      status: row.status,
      startedAt: row.started_at,
      expiresAt: row.expires_at,
      source: row.source,
    };
  }

  getUserStorageBytes(userId: number): number {
    const row = this.databaseService.connection
      .prepare('SELECT COALESCE(SUM(size), 0) as total FROM attachments WHERE user_id = @userId')
      .get({ userId }) as { total: number };
    return row.total;
  }

  private mapOrder(row: SubscriptionOrderRecord): SubscriptionOrderResponse {
    return {
      id: row.id,
      planId: row.plan_id,
      status: row.status,
      amountCents: row.amount_cents,
      currency: normalizePlanCurrency(row.currency),
      paymentProvider: row.payment_provider,
      termMonths: row.term_months ?? 1,
      checkoutMode: row.checkout_mode ?? 'purchase',
      discountPercent: row.discount_percent ?? 0,
      createdAt: row.created_at,
    };
  }
}
