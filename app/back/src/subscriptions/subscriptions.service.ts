import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ActivityService } from '../activity/activity.service';
import { normalizePlanCurrency } from '../common/currency.util';
import { nowIso } from '../database/db.util';
import { AttachmentEntity } from '../database/entities/attachment.entity';
import {
  SubscriptionOrderEntity,
  UserSubscriptionEntity,
} from '../database/entities/subscription.entity';
import { UserEntity } from '../database/entities/user.entity';
import { DEFAULT_FREE_ENTITLEMENTS } from './entitlements.types';
import { SubscriptionPlansService } from './subscription-plans.service';
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
  SubscriptionOrderResponse,
  SubscriptionPlanResponse,
  UserSubscriptionResponse,
  UserSubscriptionSource,
} from './subscriptions.types';
import type { CheckoutDto } from './dto/checkout.dto';

@Injectable()
export class SubscriptionsService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(UserSubscriptionEntity)
    private readonly subsRepo: Repository<UserSubscriptionEntity>,
    @InjectRepository(SubscriptionOrderEntity)
    private readonly ordersRepo: Repository<SubscriptionOrderEntity>,
    @InjectRepository(AttachmentEntity)
    private readonly attachmentsRepo: Repository<AttachmentEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
    @Inject(SubscriptionPlansService) private readonly plansService: SubscriptionPlansService,
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(ActivityService) private readonly activityService: ActivityService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.migrateUsersToFreePlan();
  }

  async deletePlan(id: number): Promise<{ id: number }> {
    const usage = await this.subsRepo.count({ where: { plan_id: id } });
    if (usage > 0) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Cannot delete a plan that has user subscriptions',
        code: 'PLAN_HAS_SUBSCRIBERS',
      });
    }
    return this.plansService.removePlan(id);
  }

  async getMeSubscriptionBundle(userId: number): Promise<MeSubscriptionBundle> {
    await this.expireOutdatedSubscriptions();
    const subscription = await this.getActiveUserSubscription(userId);
    const entitlements = subscription ? subscription.plan.entitlements : DEFAULT_FREE_ENTITLEMENTS;
    return {
      subscription,
      entitlements,
      storageUsedBytes: await this.getUserStorageBytes(userId),
    };
  }

  async assignPlanToUser(
    userId: number,
    planId: number,
    source: UserSubscriptionSource = 'admin_grant',
    actorId?: number | null,
  ): Promise<UserSubscriptionResponse> {
    const plan = await this.plansService.getPlanById(planId);
    const now = nowIso();
    const expiresAt = this.calculateExpiresAt(plan.billingPeriod, now);

    await this.cancelActiveSubscriptions(userId, now);

    const created = await this.subsRepo.save(
      this.subsRepo.create({
        user_id: userId,
        plan_id: planId,
        status: 'active',
        started_at: now,
        expires_at: expiresAt,
        cancelled_at: null,
        source,
        created_at: now,
        updated_at: now,
      }),
    );

    const subscription = await this.getUserSubscriptionById(created.id);

    if (source === 'admin_grant') {
      await this.activityService.record({
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

  async ensureDefaultSubscription(userId: number): Promise<void> {
    const existing = await this.subsRepo
      .createQueryBuilder('s')
      .where('s.user_id = :userId', { userId })
      .andWhere("s.status = 'active'")
      .andWhere('(s.expires_at IS NULL OR s.expires_at > :now)', { now: nowIso() })
      .limit(1)
      .getOne();
    if (existing) {
      return;
    }
    const freePlan = await this.plansService.getPlanBySlug('free');
    await this.assignPlanToUser(userId, freePlan.id, 'migration');
  }

  async createCheckout(userId: number, dto: CheckoutDto): Promise<SubscriptionOrderResponse> {
    this.assertMockCheckoutAllowed();
    const plan = await this.plansService.getPlanById(dto.planId);
    if (!plan.isActive) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Plan is not available for purchase',
        code: 'PLAN_INACTIVE',
      });
    }
    if (plan.isHidden || plan.slug === 'free' || plan.billingPeriod === 'lifetime') {
      throw new BadRequestException({
        statusCode: 400,
        message: 'This plan cannot be purchased',
        code: 'PLAN_NOT_PURCHASABLE',
      });
    }

    const mode: CheckoutMode = dto.mode === 'renew' ? 'renew' : 'purchase';
    const termMonths = this.resolveCheckoutTermMonths(plan.billingPeriod, dto.termMonths);
    const active = await this.getActiveUserSubscription(userId);

    if (mode === 'renew' && (!active || active.plan.id !== plan.id)) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Renewal is only available for your current active plan',
        code: 'RENEW_REQUIRES_ACTIVE_PLAN',
      });
    }

    const { amountCents, discountPercent } = calculateCheckoutAmount(
      plan.priceCents,
      termMonths,
      plan.billingPeriod,
    );
    const now = nowIso();
    const created = await this.ordersRepo.save(
      this.ordersRepo.create({
        user_id: userId,
        plan_id: dto.planId,
        status: 'pending',
        amount_cents: amountCents,
        currency: plan.currency,
        payment_provider: 'mock',
        payment_external_id: null,
        paid_at: null,
        term_months: termMonths,
        checkout_mode: mode,
        discount_percent: discountPercent,
        created_at: now,
        updated_at: now,
      }),
    );
    return this.mapOrder(created);
  }

  async confirmMockCheckout(userId: number, orderId: number): Promise<UserSubscriptionResponse> {
    this.assertMockCheckoutAllowed();
    const order = await this.ordersRepo.findOne({ where: { id: orderId, user_id: userId } });
    if (!order) {
      throw new NotFoundException({
        statusCode: 404,
        message: `Order ${orderId} was not found`,
        code: 'ORDER_NOT_FOUND',
      });
    }
    if (order.status !== 'pending') {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Order is not pending',
        code: 'ORDER_NOT_PENDING',
      });
    }
    const now = nowIso();
    await this.ordersRepo.update(orderId, {
      status: 'paid',
      paid_at: now,
      payment_external_id: `mock-${orderId}`,
      updated_at: now,
    });
    order.status = 'paid';
    order.paid_at = now;
    return this.fulfillCheckoutOrder(userId, order);
  }

  private async fulfillCheckoutOrder(
    userId: number,
    order: SubscriptionOrderEntity,
  ): Promise<UserSubscriptionResponse> {
    const plan = await this.plansService.getPlanById(order.plan_id);
    const termMonths = order.term_months as CheckoutTermMonths;
    const mode = order.checkout_mode as CheckoutMode;
    const now = nowIso();

    if (mode === 'renew') {
      const active = await this.getActiveUserSubscription(userId);
      if (!active || active.plan.id !== plan.id) {
        throw new BadRequestException({
          statusCode: 400,
          message: 'Renewal is only available for your current active plan',
          code: 'RENEW_REQUIRES_ACTIVE_PLAN',
        });
      }

      const baseDate = active.expiresAt && active.expiresAt > now ? active.expiresAt : now;
      const expiresAt = this.calculateCheckoutExpiresAt(plan.billingPeriod, baseDate, termMonths);
      await this.subsRepo.update(active.id, { expires_at: expiresAt, updated_at: now });

      const renewed = await this.getUserSubscriptionById(active.id);
      await this.activityService.record({
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

    await this.cancelActiveSubscriptions(userId, now);

    const expiresAt = this.calculateCheckoutExpiresAt(plan.billingPeriod, now, termMonths);
    const created = await this.subsRepo.save(
      this.subsRepo.create({
        user_id: userId,
        plan_id: plan.id,
        status: 'active',
        started_at: now,
        expires_at: expiresAt,
        cancelled_at: null,
        source: 'checkout',
        created_at: now,
        updated_at: now,
      }),
    );

    const subscription = await this.getUserSubscriptionById(created.id);
    await this.activityService.record({
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

  async getUserStorageBytes(userId: number): Promise<number> {
    const raw = await this.attachmentsRepo
      .createQueryBuilder('a')
      .select('COALESCE(SUM(a.size), 0)', 'total')
      .where('a.user_id = :userId', { userId })
      .getRawOne<{ total: string }>();
    return Number(raw?.total ?? 0);
  }

  private async migrateUsersToFreePlan(): Promise<void> {
    const users = await this.usersRepo.find({ select: { id: true } });
    for (const user of users) {
      await this.ensureDefaultSubscription(user.id);
    }
  }

  private async cancelActiveSubscriptions(userId: number, now: string): Promise<void> {
    await this.subsRepo
      .createQueryBuilder()
      .update()
      .set({ status: 'cancelled', cancelled_at: now, updated_at: now })
      .where('user_id = :userId', { userId })
      .andWhere("status = 'active'")
      .execute();
  }

  private async getActiveUserSubscription(
    userId: number,
  ): Promise<UserSubscriptionResponse | null> {
    const row = await this.subsRepo
      .createQueryBuilder('s')
      .where('s.user_id = :userId', { userId })
      .andWhere("s.status = 'active'")
      .orderBy('s.id', 'DESC')
      .limit(1)
      .getOne();
    if (!row) {
      return null;
    }
    if (row.expires_at && row.expires_at <= nowIso()) {
      return null;
    }
    return this.mapUserSubscription(row);
  }

  private async getUserSubscriptionById(id: number): Promise<UserSubscriptionResponse> {
    const row = await this.subsRepo.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException(`Subscription ${id} was not found`);
    }
    return this.mapUserSubscription(row);
  }

  private async expireOutdatedSubscriptions(): Promise<void> {
    const now = nowIso();
    await this.subsRepo
      .createQueryBuilder()
      .update()
      .set({ status: 'expired', updated_at: now })
      .where("status = 'active'")
      .andWhere('expires_at IS NOT NULL')
      .andWhere('expires_at <= :now', { now })
      .execute();
  }

  private resolveCheckoutTermMonths(
    billingPeriod: BillingPeriod,
    requested?: number,
  ): CheckoutTermMonths {
    if (billingPeriod === 'year') {
      return 12;
    }
    if (billingPeriod !== 'month') {
      throw new BadRequestException({
        statusCode: 400,
        message: 'This plan cannot be purchased',
        code: 'PLAN_NOT_PURCHASABLE',
      });
    }
    const termMonths = requested ?? 1;
    if (!isCheckoutTermMonths(termMonths)) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Invalid subscription term',
        code: 'INVALID_TERM',
      });
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
      throw new BadRequestException({
        statusCode: 400,
        message: 'Mock checkout is disabled',
        code: 'CHECKOUT_DISABLED',
      });
    }
  }

  private async mapUserSubscription(
    row: UserSubscriptionEntity,
  ): Promise<UserSubscriptionResponse> {
    return {
      id: row.id,
      plan: await this.plansService.getPlanById(row.plan_id),
      status: row.status as UserSubscriptionResponse['status'],
      startedAt: row.started_at,
      expiresAt: row.expires_at,
      source: row.source as UserSubscriptionSource,
    };
  }

  private mapOrder(row: SubscriptionOrderEntity): SubscriptionOrderResponse {
    return {
      id: row.id,
      planId: row.plan_id,
      status: row.status as SubscriptionOrderResponse['status'],
      amountCents: row.amount_cents,
      currency: normalizePlanCurrency(row.currency),
      paymentProvider: row.payment_provider,
      termMonths: row.term_months ?? 1,
      checkoutMode: (row.checkout_mode as CheckoutMode) ?? 'purchase',
      discountPercent: row.discount_percent ?? 0,
      createdAt: row.created_at,
    };
  }
}

export type { SubscriptionPlanResponse };
