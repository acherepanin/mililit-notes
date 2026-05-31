import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { AdminGuard } from '../auth/admin.guard';
import { type AuthenticatedRequest } from '../auth/auth.guard';
import { CreateSubscriptionPlanDto } from './dto/create-subscription-plan.dto';
import { UpdateSubscriptionPlanDto } from './dto/update-subscription-plan.dto';
import { SubscriptionsService } from './subscriptions.service';
import type { SubscriptionPlanResponse, UserSubscriptionResponse } from './subscriptions.types';

@Controller('admin/subscription-plans')
@UseGuards(AdminGuard)
export class AdminSubscriptionPlansController {
  constructor(@Inject(SubscriptionsService) private readonly subscriptionsService: SubscriptionsService) {}

  @Get()
  list(): SubscriptionPlanResponse[] {
    return this.subscriptionsService.listAllPlans();
  }

  @Post()
  create(@Body() dto: CreateSubscriptionPlanDto): SubscriptionPlanResponse {
    return this.subscriptionsService.createPlan(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSubscriptionPlanDto,
  ): SubscriptionPlanResponse {
    return this.subscriptionsService.updatePlan(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): { id: number } {
    return this.subscriptionsService.deletePlan(id);
  }

  @Post('assign/:userId')
  assignToUser(
    @Req() request: AuthenticatedRequest,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: { planId: number },
  ): UserSubscriptionResponse {
    return this.subscriptionsService.assignPlanToUser(
      userId,
      body.planId,
      'admin_grant',
      request.user.id,
    );
  }
}
