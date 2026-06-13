import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { normalizePlanCurrency } from '../common/currency.util';
import { SubscriptionPlanEntity } from '../database/entities/subscription.entity';
import { nowIso } from '../database/db.util';
import {
  DEFAULT_FREE_ENTITLEMENTS,
  DEFAULT_PRO_ENTITLEMENTS,
} from './entitlements.types';
import { parseEntitlementsJson, serializeEntitlements } from './entitlements.util';
import type { BillingPeriod, SubscriptionPlanResponse } from './subscriptions.types';
import type { CreateSubscriptionPlanDto } from './dto/create-subscription-plan.dto';
import type { UpdateSubscriptionPlanDto } from './dto/update-subscription-plan.dto';

/**
 * Owns the subscription plan catalogue: CRUD, default seeding and mapping.
 * Kept separate from user subscriptions/checkout so plan management stays
 * isolated and independently testable.
 */
@Injectable()
export class SubscriptionPlansService implements OnModuleInit {
  constructor(
    @InjectRepository(SubscriptionPlanEntity)
    private readonly plansRepo: Repository<SubscriptionPlanEntity>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedDefaultPlans();
  }

  async listActivePlans(): Promise<SubscriptionPlanResponse[]> {
    const rows = await this.plansRepo.find({
      where: { is_active: 1, is_hidden: 0 },
      order: { sort_order: 'ASC', id: 'ASC' },
    });
    return rows.map((row) => this.mapPlan(row));
  }

  async listAllPlans(): Promise<SubscriptionPlanResponse[]> {
    const rows = await this.plansRepo.find({ order: { sort_order: 'ASC', id: 'ASC' } });
    return rows.map((row) => this.mapPlan(row));
  }

  async getPlanEntityById(id: number): Promise<SubscriptionPlanEntity> {
    const row = await this.plansRepo.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException(`Plan ${id} was not found`);
    }
    return row;
  }

  async getPlanById(id: number): Promise<SubscriptionPlanResponse> {
    return this.mapPlan(await this.getPlanEntityById(id));
  }

  async getPlanBySlug(slug: string): Promise<SubscriptionPlanResponse> {
    const row = await this.plansRepo.findOne({ where: { slug } });
    if (!row) {
      throw new NotFoundException(`Plan ${slug} was not found`);
    }
    return this.mapPlan(row);
  }

  async createPlan(dto: CreateSubscriptionPlanDto): Promise<SubscriptionPlanResponse> {
    const now = nowIso();
    try {
      const created = await this.plansRepo.save(
        this.plansRepo.create({
          slug: dto.slug.trim(),
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          price_cents: dto.priceCents,
          currency: dto.currency?.trim() || 'rub',
          billing_period: dto.billingPeriod,
          entitlements_json: serializeEntitlements(dto.entitlements),
          icon_key: dto.iconKey?.trim() || 'package',
          card_color: dto.cardColor?.trim() || 'sky',
          card_art: dto.cardArt?.trim() || 'bubbles',
          is_active: dto.isActive === false ? 0 : 1,
          is_hidden: dto.isHidden === true ? 1 : 0,
          sort_order: dto.sortOrder ?? 0,
          created_at: now,
          updated_at: now,
        }),
      );
      return this.mapPlan(created);
    } catch {
      throw new BadRequestException('Plan slug must be unique');
    }
  }

  async updatePlan(id: number, dto: UpdateSubscriptionPlanDto): Promise<SubscriptionPlanResponse> {
    const current = await this.mapPlan(await this.getPlanEntityById(id));
    if (current.slug === 'free' && dto.isActive === false) {
      throw new BadRequestException('The free plan cannot be deactivated');
    }
    if (current.slug === 'free' && dto.isHidden === true) {
      throw new BadRequestException('The free plan cannot be hidden');
    }

    await this.plansRepo.update(id, {
      slug: dto.slug?.trim() ?? current.slug,
      name: dto.name?.trim() ?? current.name,
      description:
        dto.description === undefined ? current.description : dto.description?.trim() || null,
      price_cents: dto.priceCents ?? current.priceCents,
      currency: dto.currency?.trim() ?? current.currency,
      billing_period: dto.billingPeriod ?? current.billingPeriod,
      entitlements_json: dto.entitlements
        ? serializeEntitlements(dto.entitlements)
        : serializeEntitlements(current.entitlements),
      icon_key: dto.iconKey?.trim() ?? current.iconKey,
      card_color: dto.cardColor?.trim() ?? current.cardColor,
      card_art: dto.cardArt?.trim() ?? current.cardArt,
      is_active: dto.isActive === undefined ? (current.isActive ? 1 : 0) : dto.isActive ? 1 : 0,
      is_hidden: dto.isHidden === undefined ? (current.isHidden ? 1 : 0) : dto.isHidden ? 1 : 0,
      sort_order: dto.sortOrder ?? current.sortOrder,
      updated_at: nowIso(),
    });
    return this.getPlanById(id);
  }

  /**
   * Hard-deletes a plan after the free-plan guard. The caller
   * (SubscriptionsService) is responsible for verifying there are no active
   * user subscriptions referencing the plan first.
   */
  async removePlan(id: number): Promise<{ id: number }> {
    const plan = await this.getPlanById(id);
    if (plan.slug === 'free') {
      throw new BadRequestException('The free plan cannot be deleted');
    }
    await this.plansRepo.delete({ id });
    return { id };
  }

  private mapPlan(row: SubscriptionPlanEntity): SubscriptionPlanResponse {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      priceCents: row.price_cents,
      currency: normalizePlanCurrency(row.currency),
      billingPeriod: row.billing_period as BillingPeriod,
      entitlements: parseEntitlementsJson(row.entitlements_json),
      iconKey: row.icon_key || 'package',
      cardColor: row.card_color || 'sky',
      cardArt: row.card_art || 'bubbles',
      isActive: row.is_active === 1,
      isHidden: (row.is_hidden ?? 0) === 1,
      sortOrder: row.sort_order,
    };
  }

  async seedDefaultPlans(): Promise<void> {
    const count = await this.plansRepo.count();
    if (count > 0) {
      return;
    }
    const now = nowIso();
    const plans = [
      {
        slug: 'free',
        name: 'Free',
        description: 'Basic notes and limited storage',
        price_cents: 0,
        billing_period: 'lifetime' as BillingPeriod,
        entitlements: DEFAULT_FREE_ENTITLEMENTS,
        icon_key: 'notebook',
        card_color: 'slate',
        card_art: 'blocks',
        sort_order: 0,
      },
      {
        slug: 'pro',
        name: 'Pro',
        description: 'AI assistant and expanded storage',
        price_cents: 990,
        billing_period: 'month' as BillingPeriod,
        entitlements: DEFAULT_PRO_ENTITLEMENTS,
        icon_key: 'sparkles',
        card_color: 'sky',
        card_art: 'stars',
        sort_order: 1,
      },
    ];
    await this.plansRepo.save(
      plans.map((plan) =>
        this.plansRepo.create({
          slug: plan.slug,
          name: plan.name,
          description: plan.description,
          price_cents: plan.price_cents,
          currency: 'rub',
          billing_period: plan.billing_period,
          entitlements_json: serializeEntitlements(plan.entitlements),
          icon_key: plan.icon_key,
          card_color: plan.card_color,
          card_art: plan.card_art,
          is_active: 1,
          sort_order: plan.sort_order,
          created_at: now,
          updated_at: now,
        }),
      ),
    );
  }
}
