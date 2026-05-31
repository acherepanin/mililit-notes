import type { BillingPeriod } from './subscriptions.types';

export const CHECKOUT_TERM_MONTHS = [1, 3, 6, 12] as const;
export type CheckoutTermMonths = (typeof CHECKOUT_TERM_MONTHS)[number];
export type CheckoutMode = 'purchase' | 'renew';

export function isCheckoutTermMonths(value: number): value is CheckoutTermMonths {
  return CHECKOUT_TERM_MONTHS.includes(value as CheckoutTermMonths);
}

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

export function addMonths(fromIso: string, months: number): string {
  const date = new Date(fromIso);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString();
}
