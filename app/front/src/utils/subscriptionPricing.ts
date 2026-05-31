import type { BillingPeriod, UserLanguage } from '../types';
import type { Translator } from '../i18n';

export const CHECKOUT_TERM_MONTHS = [1, 3, 6, 12] as const;
export type CheckoutTermMonths = (typeof CHECKOUT_TERM_MONTHS)[number];
export type CheckoutMode = 'purchase' | 'renew';

export function getTermDiscountPercent(termMonths: CheckoutTermMonths): number {
  switch (termMonths) {
    case 1:
      return 0;
    case 3:
      return 3;
    case 6:
      return 6;
    case 12:
      return 9;
    default:
      return 0;
  }
}

export function calculateCheckoutAmount(
  monthlyPriceCents: number,
  termMonths: CheckoutTermMonths,
  billingPeriod: BillingPeriod,
): { amountCents: number; discountPercent: number; termMonths: CheckoutTermMonths } {
  if (billingPeriod === 'year') {
    return {
      amountCents: monthlyPriceCents,
      discountPercent: 0,
      termMonths: 12,
    };
  }

  if (billingPeriod !== 'month') {
    return {
      amountCents: monthlyPriceCents,
      discountPercent: 0,
      termMonths: 1,
    };
  }

  const discountPercent = getTermDiscountPercent(termMonths);
  const subtotal = monthlyPriceCents * termMonths;
  const amountCents = Math.round(subtotal * (1 - discountPercent / 100));

  return { amountCents, discountPercent, termMonths };
}

export function formatCheckoutTermLabel(
  termMonths: CheckoutTermMonths,
  language: 'ru' | 'en',
): string {
  if (termMonths === 12) {
    return language === 'ru' ? '1 год' : '1 year';
  }
  if (termMonths === 1) {
    return language === 'ru' ? '1 месяц' : '1 month';
  }
  const unit = language === 'ru' ? 'месяца' : 'months';
  return `${termMonths} ${unit}`;
}

export function normalizePlanCurrency(currency: string | null | undefined): string {
  const normalized = (currency ?? 'rub').trim().toLowerCase();
  if (normalized === 'usd' || normalized === 'rur' || normalized === '') {
    return 'rub';
  }
  return normalized;
}

export function formatPlanPriceCents(
  cents: number,
  currency: string | null | undefined,
  language: UserLanguage,
): string {
  const value = cents / 100;
  if (normalizePlanCurrency(currency) === 'rub') {
    return `${value.toLocaleString(language === 'ru' ? 'ru-RU' : 'en-US')} ₽`;
  }
  return value.toLocaleString(language === 'ru' ? 'ru-RU' : 'en-US', {
    style: 'currency',
    currency: currency?.toUpperCase() ?? 'RUB',
  });
}

export function formatPlanBilling(t: Translator, period: BillingPeriod): string {
  if (period === 'year') {
    return t('billingYear');
  }
  if (period === 'lifetime') {
    return t('billingLifetime');
  }
  return t('billingMonth');
}

export function isPurchasablePlan(plan: {
  slug: string;
  priceCents: number;
  billingPeriod: BillingPeriod;
  isHidden?: boolean;
  isActive?: boolean;
}): boolean {
  return (
    !plan.isHidden &&
    plan.isActive !== false &&
    plan.slug !== 'free' &&
    plan.billingPeriod !== 'lifetime'
  );
}

export function supportsTermSelection(billingPeriod: BillingPeriod): boolean {
  return billingPeriod === 'month';
}

export function canRenewPlan(plan: {
  slug: string;
  priceCents: number;
  billingPeriod: BillingPeriod;
  isHidden?: boolean;
}): boolean {
  return isPurchasablePlan(plan);
}
