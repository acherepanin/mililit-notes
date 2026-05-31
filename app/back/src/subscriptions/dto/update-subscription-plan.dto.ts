import type { PlanEntitlements } from '../entitlements.types';
import type { BillingPeriod } from '../subscriptions.types';

export class UpdateSubscriptionPlanDto {
  slug?: string;
  name?: string;
  description?: string | null;
  priceCents?: number;
  currency?: string;
  billingPeriod?: BillingPeriod;
  entitlements?: PlanEntitlements;
  iconKey?: string;
  cardColor?: string;
  cardArt?: string;
  isActive?: boolean;
  isHidden?: boolean;
  sortOrder?: number;
}
