import { forwardRef, Module } from '@nestjs/common';

import { ActivityModule } from '../activity/activity.module';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../infra/database.module';
import { AdminSubscriptionPlansController } from './admin-subscription-plans.controller';
import { EntitlementsService } from './entitlements.service';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  imports: [DatabaseModule, ActivityModule, forwardRef(() => AuthModule)],
  controllers: [SubscriptionsController, AdminSubscriptionPlansController],
  providers: [SubscriptionsService, EntitlementsService],
  exports: [SubscriptionsService, EntitlementsService],
})
export class SubscriptionsModule {}
