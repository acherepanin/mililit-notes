import { forwardRef, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { ActivityModule } from '../activity/activity.module';
import { DatabaseModule } from '../infra/database.module';
import { MailModule } from '../mail/mail.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AdminGuard } from './admin.guard';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { RegistrationService } from './registration.service';

@Module({
  imports: [ActivityModule, DatabaseModule, MailModule, forwardRef(() => SubscriptionsModule)],
  controllers: [AuthController],
  providers: [
    AuthService,
    RegistrationService,
    AuthGuard,
    AdminGuard,
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
  exports: [AuthService, AuthGuard, AdminGuard],
})
export class AuthModule {}
