import type { PlanEntitlements } from '../entitlements.types';
import type { BillingPeriod } from '../subscriptions.types';

export class CreateSubscriptionPlanDto {
  slug!: string;
  name!: string;
  description?: string;
  priceCents!: number;
  currency?: string;
  billingPeriod!: BillingPeriod;
  entitlements!: PlanEntitlements;
  iconKey?: string;
  cardColor?: string;
  cardArt?: string;
  isActive?: boolean;
  isHidden?: boolean;
  sortOrder?: number;
}
