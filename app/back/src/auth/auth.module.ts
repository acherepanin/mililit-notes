import { Module } from '@nestjs/common';

import { ActivityModule } from '../activity/activity.module';
import { DatabaseModule } from '../infra/database.module';
import { AdminGuard } from './admin.guard';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

@Module({
  imports: [ActivityModule, DatabaseModule],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, AdminGuard],
  exports: [AuthService, AuthGuard, AdminGuard],
})
export class AuthModule {}
