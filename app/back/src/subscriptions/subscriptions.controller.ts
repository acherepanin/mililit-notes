import { Body, Controller, Get, Inject, Param, ParseIntPipe, Post, Req } from '@nestjs/common';

import { type AuthenticatedRequest } from '../auth/auth.guard';
import { CheckoutDto } from './dto/checkout.dto';
import { SubscriptionsService } from './subscriptions.service';
import type {
  MeSubscriptionBundle,
  SubscriptionOrderResponse,
  SubscriptionPlanResponse,
  UserSubscriptionResponse,
} from './subscriptions.types';

@Controller()
export class SubscriptionsController {
  constructor(@Inject(SubscriptionsService) private readonly subscriptionsService: SubscriptionsService) {}

  @Get('subscription-plans')
  listPlans(): SubscriptionPlanResponse[] {
    return this.subscriptionsService.listActivePlans();
  }

  @Get('me/subscription')
  getMySubscription(@Req() request: AuthenticatedRequest): MeSubscriptionBundle {
    return this.subscriptionsService.getMeSubscriptionBundle(request.user.id);
  }

  @Post('subscription/checkout')
  checkout(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CheckoutDto,
  ): SubscriptionOrderResponse {
    return this.subscriptionsService.createCheckout(request.user.id, dto);
  }

  @Post('subscription/checkout/:id/confirm')
  confirmCheckout(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): UserSubscriptionResponse {
    return this.subscriptionsService.confirmMockCheckout(request.user.id, id);
  }
}
