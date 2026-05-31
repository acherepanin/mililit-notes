import { Injectable } from '@nestjs/common';

import type { MonitoringRange, RequestSample } from './monitoring.types';
import { rangeToMs, shouldIgnoreRequestMetrics } from './monitoring.util';

const MAX_SAMPLES = 12_000;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class RequestMetricsService {
  private samples: RequestSample[] = [];

  record(sample: Omit<RequestSample, 'timestamp'> & { timestamp?: number }): void {
    if (shouldIgnoreRequestMetrics(sample.method, sample.path)) {
      return;
    }

    this.samples.push({
      ...sample,
      timestamp: sample.timestamp ?? Date.now(),
    });

    this.prune();
  }

  getSamplesInRange(range: MonitoringRange): RequestSample[] {
    const from = Date.now() - rangeToMs(range);
    return this.samples.filter((sample) => sample.timestamp >= from);
  }

  private prune(): void {
    const minTimestamp = Date.now() - RETENTION_MS;
    if (this.samples.length > MAX_SAMPLES) {
      this.samples = this.samples.slice(-MAX_SAMPLES);
    }
    this.samples = this.samples.filter((sample) => sample.timestamp >= minTimestamp);
  }
}
