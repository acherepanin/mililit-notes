import { IsIn, IsInt, IsOptional, IsPositive } from 'class-validator';

import {
  CHECKOUT_TERM_MONTHS,
  type CheckoutMode,
  type CheckoutTermMonths,
} from '../subscription-pricing.util';

export class CheckoutDto {
  @IsInt()
  @IsPositive()
  planId!: number;

  @IsOptional()
  @IsIn(CHECKOUT_TERM_MONTHS)
  termMonths?: CheckoutTermMonths;

  @IsOptional()
  @IsIn(['purchase', 'renew'])
  mode?: CheckoutMode;
}
