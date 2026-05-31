import type { PlanEntitlements } from './entitlements.types';

export type BillingPeriod = 'month' | 'year' | 'lifetime';
export type CheckoutMode = 'purchase' | 'renew';
export type UserSubscriptionStatus = 'active' | 'expired' | 'cancelled' | 'pending';
export type SubscriptionOrderStatus = 'pending' | 'paid' | 'failed' | 'cancelled';
export type UserSubscriptionSource = 'admin_grant' | 'checkout' | 'migration';

export interface SubscriptionPlanRecord {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  billing_period: BillingPeriod;
  entitlements_json: string;
  icon_key: string;
  card_color: string;
  card_art: string;
  is_active: number;
  is_hidden: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionPlanResponse {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  billingPeriod: BillingPeriod;
  entitlements: PlanEntitlements;
  iconKey: string;
  cardColor: string;
  cardArt: string;
  isActive: boolean;
  isHidden: boolean;
  sortOrder: number;
}

export interface UserSubscriptionRecord {
  id: number;
  user_id: number;
  plan_id: number;
  status: UserSubscriptionStatus;
  started_at: string;
  expires_at: string | null;
  cancelled_at: string | null;
  source: UserSubscriptionSource;
  created_at: string;
  updated_at: string;
}

export interface UserSubscriptionResponse {
  id: number;
  plan: SubscriptionPlanResponse;
  status: UserSubscriptionStatus;
  startedAt: string;
  expiresAt: string | null;
  source: UserSubscriptionSource;
}

export interface SubscriptionOrderRecord {
  id: number;
  user_id: number;
  plan_id: number;
  status: SubscriptionOrderStatus;
  amount_cents: number;
  currency: string;
  payment_provider: string;
  payment_external_id: string | null;
  paid_at: string | null;
  term_months: number;
  checkout_mode: CheckoutMode;
  discount_percent: number;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionOrderResponse {
  id: number;
  planId: number;
  status: SubscriptionOrderStatus;
  amountCents: number;
  currency: string;
  paymentProvider: string;
  termMonths: number;
  checkoutMode: CheckoutMode;
  discountPercent: number;
  createdAt: string;
}

export interface MeSubscriptionBundle {
  subscription: UserSubscriptionResponse | null;
  entitlements: PlanEntitlements;
  storageUsedBytes: number;
}
