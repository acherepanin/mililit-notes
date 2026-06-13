import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';

import type { ActivityResponse } from '../activity/activity.types';
import { AdminGuard } from '../auth/admin.guard';
import { MonitoringService } from './monitoring.service';
import type {
  MonitoringPerformanceResponse,
  RequestErrorResponse,
  SubscriptionLogResponse,
} from './monitoring.types';

@Controller('admin/monitoring')
@UseGuards(AdminGuard)
export class MonitoringController {
  constructor(@Inject(MonitoringService) private readonly monitoringService: MonitoringService) {}

  @Get('actions')
  listActions(@Query('limit') limit?: string): Promise<ActivityResponse[]> {
    const parsed = limit !== undefined ? Number(limit) : undefined;
    return this.monitoringService.listActions(
      parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined,
    );
  }

  @Get('subscriptions')
  listSubscriptions(@Query('limit') limit?: string): Promise<SubscriptionLogResponse[]> {
    const parsed = limit !== undefined ? Number(limit) : undefined;
    return this.monitoringService.listSubscriptionLogs(
      parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined,
    );
  }

  @Get('errors')
  listErrors(@Query('limit') limit?: string): Promise<RequestErrorResponse[]> {
    const parsed = limit !== undefined ? Number(limit) : undefined;
    return this.monitoringService.listErrors(
      parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined,
    );
  }

  @Get('performance')
  getPerformance(@Query('range') range?: string): MonitoringPerformanceResponse {
    return this.monitoringService.getPerformance(range);
  }
}
