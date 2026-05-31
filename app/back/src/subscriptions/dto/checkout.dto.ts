import type { CheckoutMode, CheckoutTermMonths } from '../subscription-pricing.util';

export class CheckoutDto {
  planId!: number;
  termMonths?: CheckoutTermMonths;
  mode?: CheckoutMode;
}
