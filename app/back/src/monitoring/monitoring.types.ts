export type MonitoringRange = 'hour' | 'day' | 'week' | 'month';

export interface RequestSample {
  timestamp: number;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
}

export interface RequestErrorRecord {
  id: number;
  user_id: number | null;
  username: string | null;
  method: string;
  path: string;
  status_code: number;
  message: string | null;
  error_name: string | null;
  error_body: string;
  duration_ms: number;
  created_at: string;
}

export interface RequestErrorResponse {
  id: number;
  userId: number | null;
  username: string | null;
  method: string;
  path: string;
  statusCode: number;
  message: string | null;
  errorName: string | null;
  errorBody: Record<string, unknown> | null;
  durationMs: number;
  createdAt: string;
}

export interface SubscriptionLogRecord {
  id: number;
  user_id: number;
  username: string;
  plan_id: number;
  plan_name: string;
  plan_slug: string;
  status: string;
  amount_cents: number;
  currency: string;
  term_months: number | null;
  checkout_mode: string | null;
  source: string;
  paid_at: string | null;
  started_at: string | null;
  expires_at: string | null;
  created_at: string;
  total_spent_cents: number;
  last_purchase_at: string | null;
}

export interface SubscriptionLogResponse {
  id: number;
  userId: number;
  username: string;
  planId: number;
  planName: string;
  planSlug: string;
  status: string;
  amountCents: number;
  currency: string;
  termMonths: number | null;
  checkoutMode: string | null;
  source: string;
  paidAt: string | null;
  startedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  totalSpentCents: number;
  lastPurchaseAt: string | null;
}

export interface MonitoringPerformanceBucket {
  label: string;
  count: number;
  avgDurationMs: number;
  errorCount: number;
}

export interface MonitoringPerformanceResponse {
  range: MonitoringRange;
  from: string;
  to: string;
  requestCount: number;
  errorCount: number;
  avgDurationMs: number;
  maxDurationMs: number;
  buckets: MonitoringPerformanceBucket[];
  process: {
    uptimeSec: number;
    memoryRssMb: number;
    memoryHeapUsedMb: number;
    memoryHeapTotalMb: number;
    cpuUserMicros: number;
    cpuSystemMicros: number;
  };
  system: {
    loadAvg1: number;
    loadAvg5: number;
    loadAvg15: number;
    freeMemoryMb: number;
    totalMemoryMb: number;
  };
}
