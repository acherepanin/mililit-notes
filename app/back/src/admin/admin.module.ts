import { Module } from '@nestjs/common';

import { ActivityModule } from '../activity/activity.module';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../infra/database.module';
import { AdminController } from './admin.controller';
import { AdminStatsService } from './admin-stats.service';
import { AdminService } from './admin.service';

@Module({
  imports: [ActivityModule, AuthModule, DatabaseModule],
  controllers: [AdminController],
  providers: [AdminService, AdminStatsService],
  exports: [AdminService],
})
export class AdminModule {}
