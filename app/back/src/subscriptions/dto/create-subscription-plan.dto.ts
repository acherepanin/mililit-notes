import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

import type { PlanEntitlements } from '../entitlements.types';
import type { BillingPeriod } from '../subscriptions.types';

export class CreateSubscriptionPlanDto {
  @IsString()
  @IsNotEmpty()
  slug!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  @Min(0)
  priceCents!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsIn(['month', 'year', 'lifetime'])
  billingPeriod!: BillingPeriod;

  @IsObject()
  entitlements!: PlanEntitlements;

  @IsOptional()
  @IsString()
  iconKey?: string;

  @IsOptional()
  @IsString()
  cardColor?: string;

  @IsOptional()
  @IsString()
  cardArt?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isHidden?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
