import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

import type { PlanEntitlements } from '../entitlements.types';
import type { BillingPeriod } from '../subscriptions.types';

export class UpdateSubscriptionPlanDto {
  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  priceCents?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsIn(['month', 'year', 'lifetime'])
  billingPeriod?: BillingPeriod;

  @IsOptional()
  @IsObject()
  entitlements?: PlanEntitlements;

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
