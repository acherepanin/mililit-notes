import { Inject, Injectable } from '@nestjs/common';
import { freemem, loadavg, totalmem } from 'node:os';

import { ActivityService } from '../activity/activity.service';
import { DatabaseService } from '../infra/database.service';
import { RequestErrorLogService } from './request-error-log.service';
import { RequestMetricsService } from './request-metrics.service';
import {
  normalizeMonitoringLimit,
  rangeToMs,
  shouldPersistRequestError,
} from './monitoring.util';
import type {
  MonitoringPerformanceBucket,
  MonitoringPerformanceResponse,
  MonitoringRange,
  SubscriptionLogRecord,
  SubscriptionLogResponse,
} from './monitoring.types';

@Injectable()
export class MonitoringService {
  private readonly processStartCpu = process.cpuUsage();
  private readonly processStartedAt = Date.now();

  constructor(
    @Inject(ActivityService) private readonly activityService: ActivityService,
    @Inject(DatabaseService) private readonly databaseService: DatabaseService,
    @Inject(RequestErrorLogService) private readonly requestErrorLogService: RequestErrorLogService,
    @Inject(RequestMetricsService) private readonly requestMetricsService: RequestMetricsService,
  ) {}

  listActions(limit?: number) {
    return this.activityService.list(normalizeMonitoringLimit(limit), { excludeSubscription: true });
  }

  listSubscriptionLogs(limit?: number): SubscriptionLogResponse[] {
    const normalizedLimit = normalizeMonitoringLimit(limit);
    const rows = this.databaseService.connection
      .prepare(
        `
          SELECT
            combined.*,
            totals.total_spent_cents,
            totals.last_purchase_at
          FROM (
            SELECT
              o.id,
              o.user_id,
              u.username,
              o.plan_id,
              p.name as plan_name,
              p.slug as plan_slug,
              o.status,
              o.amount_cents,
              o.currency,
              o.term_months,
              o.checkout_mode,
              'checkout' as source,
              o.paid_at,
              NULL as started_at,
              NULL as expires_at,
              o.created_at
            FROM subscription_orders o
            JOIN users u ON u.id = o.user_id
            JOIN subscription_plans p ON p.id = o.plan_id
            WHERE o.status IN ('paid', 'failed', 'cancelled')

            UNION ALL

            SELECT
              us.id,
              us.user_id,
              u.username,
              us.plan_id,
              p.name as plan_name,
              p.slug as plan_slug,
              us.status,
              p.price_cents as amount_cents,
              p.currency,
              NULL as term_months,
              NULL as checkout_mode,
              us.source,
              NULL as paid_at,
              us.started_at,
              us.expires_at,
              us.created_at
            FROM user_subscriptions us
            JOIN users u ON u.id = us.user_id
            JOIN subscription_plans p ON p.id = us.plan_id
            WHERE us.source IN ('admin_grant', 'migration')
          ) combined
          LEFT JOIN (
            SELECT
              user_id,
              SUM(CASE WHEN status = 'paid' THEN amount_cents ELSE 0 END) as total_spent_cents,
              MAX(CASE WHEN status = 'paid' THEN paid_at END) as last_purchase_at
            FROM subscription_orders
            GROUP BY user_id
          ) totals ON totals.user_id = combined.user_id
          ORDER BY combined.created_at DESC, combined.id DESC
          LIMIT @limit
        `,
      )
      .all({ limit: normalizedLimit }) as SubscriptionLogRecord[];

    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      username: row.username,
      planId: row.plan_id,
      planName: row.plan_name,
      planSlug: row.plan_slug,
      status: row.status,
      amountCents: row.amount_cents,
      currency: row.currency,
      termMonths: row.term_months,
      checkoutMode: row.checkout_mode,
      source: row.source,
      paidAt: row.paid_at,
      startedAt: row.started_at,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      totalSpentCents: row.total_spent_cents ?? 0,
      lastPurchaseAt: row.last_purchase_at,
    }));
  }

  listErrors(limit?: number) {
    return this.requestErrorLogService.list(normalizeMonitoringLimit(limit));
  }

  getPerformance(rangeInput?: string): MonitoringPerformanceResponse {
    const range = this.normalizeRange(rangeInput);
    const samples = this.requestMetricsService.getSamplesInRange(range);
    const now = Date.now();
    const from = new Date(now - rangeToMs(range)).toISOString();
    const to = new Date(now).toISOString();

    const requestCount = samples.length;
    const durations = samples.map((sample) => sample.durationMs);
    const avgDurationMs =
      requestCount > 0
        ? Math.round(durations.reduce((sum, value) => sum + value, 0) / requestCount)
        : 0;
    const maxDurationMs = requestCount > 0 ? Math.max(...durations) : 0;
    const errorCount = samples.filter((sample) =>
      shouldPersistRequestError(sample.statusCode, sample.method, sample.path),
    ).length;
    const buckets = this.buildBuckets(samples, range, now);
    const memory = process.memoryUsage();
    const cpu = process.cpuUsage(this.processStartCpu);
    const [loadAvg1, loadAvg5, loadAvg15] = loadavg();

    return {
      range,
      from,
      to,
      requestCount,
      errorCount,
      avgDurationMs,
      maxDurationMs,
      buckets,
      process: {
        uptimeSec: Math.round(process.uptime()),
        memoryRssMb: this.toMb(memory.rss),
        memoryHeapUsedMb: this.toMb(memory.heapUsed),
        memoryHeapTotalMb: this.toMb(memory.heapTotal),
        cpuUserMicros: cpu.user,
        cpuSystemMicros: cpu.system,
      },
      system: {
        loadAvg1,
        loadAvg5,
        loadAvg15,
        freeMemoryMb: this.toMb(freemem()),
        totalMemoryMb: this.toMb(totalmem()),
      },
    };
  }

  private buildBuckets(
    samples: Array<{ timestamp: number; durationMs: number; statusCode: number; method: string; path: string }>,
    range: MonitoringRange,
    now: number,
  ): MonitoringPerformanceBucket[] {
    const bucketMs = this.bucketSizeMs(range);
    const bucketCount = Math.ceil(rangeToMs(range) / bucketMs);
    const start = now - bucketCount * bucketMs;
    const buckets: MonitoringPerformanceBucket[] = [];

    for (let index = 0; index < bucketCount; index += 1) {
      const bucketStart = start + index * bucketMs;
      const bucketEnd = bucketStart + bucketMs;
      const bucketSamples = samples.filter(
        (sample) => sample.timestamp >= bucketStart && sample.timestamp < bucketEnd,
      );
      const count = bucketSamples.length;
      const avgDurationMs =
        count > 0
          ? Math.round(
              bucketSamples.reduce((sum, sample) => sum + sample.durationMs, 0) / count,
            )
          : 0;
      const errorCount = bucketSamples.filter((sample) =>
        shouldPersistRequestError(sample.statusCode, sample.method, sample.path),
      ).length;

      buckets.push({
        label: new Date(bucketStart).toISOString(),
        count,
        avgDurationMs,
        errorCount,
      });
    }

    return buckets;
  }

  private bucketSizeMs(range: MonitoringRange): number {
    switch (range) {
      case 'hour':
        return 5 * 60 * 1000;
      case 'day':
        return 60 * 60 * 1000;
      case 'week':
        return 24 * 60 * 60 * 1000;
      case 'month':
        return 24 * 60 * 60 * 1000;
      default:
        return 60 * 60 * 1000;
    }
  }

  private normalizeRange(value?: string): MonitoringRange {
    if (value === 'hour' || value === 'day' || value === 'week' || value === 'month') {
      return value;
    }

    return 'day';
  }

  private toMb(bytes: number): number {
    return Math.round((bytes / (1024 * 1024)) * 10) / 10;
  }
}
