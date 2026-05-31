import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { ActivityModule } from '../activity/activity.module';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../infra/database.module';
import { MonitoringController } from './monitoring.controller';
import { MonitoringInterceptor } from './monitoring.interceptor';
import { MonitoringService } from './monitoring.service';
import { RequestErrorLogService } from './request-error-log.service';
import { RequestMetricsService } from './request-metrics.service';

@Module({
  imports: [ActivityModule, AuthModule, DatabaseModule],
  controllers: [MonitoringController],
  providers: [
    MonitoringService,
    RequestMetricsService,
    RequestErrorLogService,
    {
      provide: APP_INTERCEPTOR,
      useClass: MonitoringInterceptor,
    },
  ],
  exports: [MonitoringService, RequestMetricsService, RequestErrorLogService],
})
export class MonitoringModule {}
