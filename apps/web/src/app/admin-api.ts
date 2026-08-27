import { requestApi } from "./notes-api";

export type AdminAuditScope =
  "all" | "ai" | "files" | "integrations" | "notes" | "workspace";
export type AdminAuditSource = "activity" | "ai";
export type AdminDiagnosticSource = "ai_tool" | "integration" | "request";
export type DataRetentionPolicyKey =
  | "activity_logs"
  | "ai_audit_logs"
  | "ai_bot_webhook_events"
  | "request_error_logs";

export interface AdminAuditItem {
  action: string;
  actorId: number | null;
  createdAt: string;
  detail: string | null;
  id: string;
  source: AdminAuditSource;
  targetId: number | null;
  targetType: string | null;
  userId: number | null;
}

export interface AdminDiagnosticItem {
  correlationId: string;
  createdAt: string;
  detail: string;
  id: string;
  severity: "critical" | "warning";
  source: AdminDiagnosticSource;
  title: string;
  userId: number | null;
}

export interface AdminHistoryPage<Item> {
  items: Item[];
  nextCursor: string | null;
}

export type AdminAlertName =
  "NotesApiHighErrorRatio" | "NotesTargetDown" | "NotesWorkerJobFailed";

export interface AdminAlertingState {
  alerts: Array<{
    alertName: AdminAlertName;
    endsAt: string | null;
    fingerprint: string | null;
    job: string | null;
    jobName: string | null;
    queue: string | null;
    receivers: string[];
    severity: "critical" | "warning";
    silencedBy: string[];
    startsAt: string | null;
    state: "active" | "suppressed";
    summary: string;
  }>;
  configured: boolean;
  delivery: { failed: number; sent: number };
  generatedAt: string;
  silences: Array<{
    alertName: AdminAlertName;
    canDelete: boolean;
    comment: string;
    endsAt: string | null;
    id: string;
    startsAt: string | null;
  }>;
}

export interface AdminOverview {
  generatedAt: string;
  metrics: {
    aiFailures24h: number;
    audits24h: number;
    critical24h: number;
    integrationFailures24h: number;
    pendingConfirmations: number;
    warnings24h: number;
  };
  recentFailures: Array<{
    correlationId: string;
    createdAt: string;
    detail: string;
    id: string;
    kind: "ai_tool" | "integration" | "request";
    title: string;
    userId: number | null;
  }>;
  services: Array<{
    detail: string;
    latencyMs: number | null;
    name: "object-storage" | "postgres" | "redis" | "worker";
    status: "degraded" | "ok";
  }>;
  storage: {
    trackedBytes: number;
    trackedFiles: number;
  };
  users: {
    admins: number;
    items: Array<{
      createdAt: string;
      email: string;
      emailVerified: boolean;
      id: number;
      lastLoginAt: string | null;
      name: string;
      role: "admin" | "user";
      subscription: {
        id: number | null;
        planId: number;
        planName: string;
        planSlug: string;
      } | null;
    }>;
    total: number;
  };
}

export interface AdminPlanEntitlements {
  ai?: { enabled?: boolean; monthlyTokenLimit?: number | null };
  commands?: { enabled?: boolean };
  exportImport?: { enabled?: boolean };
  files?: { enabled?: boolean; storageLimitBytes?: number | null };
  publicShare?: { enabled?: boolean };
  templates?: { enabled?: boolean };
  versioning?: { enabled?: boolean };
  voice?: { enabled?: boolean };
  workspace?: {
    enabled?: boolean;
    maxNoteContentBytes?: number | null;
    maxNotes?: number | null;
  };
}

export interface AdminPlan {
  billingPeriod: "lifetime" | "month" | "year";
  currency: string;
  description: string | null;
  entitlements: AdminPlanEntitlements;
  id: number;
  isActive: boolean;
  isHidden: boolean;
  name: string;
  priceCents: number;
  revision: number;
  slug: string;
  sortOrder: number;
  subscribers: number;
  updatedAt: string;
}

export interface AdminPlanState {
  items: AdminPlan[];
}

export interface AdminPlanUpdateInput {
  billingPeriod?: AdminPlan["billingPeriod"];
  currency?: string;
  description?: string | null;
  entitlements?: Omit<AdminPlanEntitlements, "commands">;
  expectedRevision: number;
  isActive?: boolean;
  isHidden?: boolean;
  name?: string;
  priceCents?: number;
  sortOrder?: number;
}

export interface AdminRetentionPolicy {
  enabled: boolean;
  lastCompletedAt: string | null;
  lastDeletedCount: number;
  lastError: "backlog_remaining" | "cleanup_failed" | null;
  lastStartedAt: string | null;
  policyKey: DataRetentionPolicyKey;
  retentionDays: number;
  updatedAt: string;
  updatedByUserId: number | null;
}

export interface AdminRetentionState {
  items: AdminRetentionPolicy[];
  scheduleEveryMinutes: number;
}

export const adminApi = {
  alerting() {
    return requestApi<AdminAlertingState>("/admin/alerting");
  },
  assignSubscription(
    userId: number,
    input: { expectedCurrentSubscriptionId: number | null; planId: number },
  ) {
    return requestApi<{
      subscription: {
        id: number;
        planId: number;
        planName: string;
        planSlug: string;
      };
    }>(`/admin/users/${userId}/subscription`, {
      body: JSON.stringify(input),
      method: "PUT",
    });
  },
  audits(input: {
    cursor?: string | null;
    scope: AdminAuditScope;
    source: "all" | AdminAuditSource;
  }) {
    const query = new URLSearchParams({
      limit: "12",
      scope: input.scope,
      source: input.source,
    });
    if (input.cursor) query.set("cursor", input.cursor);
    return requestApi<AdminHistoryPage<AdminAuditItem>>(
      `/admin/audits?${query}`,
    );
  },
  diagnostics(input: {
    cursor?: string | null;
    kind: "all" | AdminDiagnosticSource;
  }) {
    const query = new URLSearchParams({ kind: input.kind, limit: "12" });
    if (input.cursor) query.set("cursor", input.cursor);
    return requestApi<AdminHistoryPage<AdminDiagnosticItem>>(
      `/admin/diagnostics?${query}`,
    );
  },
  createSilence(input: {
    alertName: AdminAlertName;
    comment: string;
    durationMinutes: number;
  }) {
    return requestApi<AdminAlertingState>("/admin/alerting/silences", {
      body: JSON.stringify(input),
      method: "POST",
    });
  },
  deleteSilence(silenceId: string) {
    return requestApi<AdminAlertingState>(
      `/admin/alerting/silences/${silenceId}`,
      { method: "DELETE" },
    );
  },
  overview() {
    return requestApi<AdminOverview>("/admin/overview");
  },
  plans() {
    return requestApi<AdminPlanState>("/admin/plans");
  },
  retention() {
    return requestApi<AdminRetentionState>("/admin/retention");
  },
  updateRetention(
    policyKey: DataRetentionPolicyKey,
    input: { enabled: boolean; retentionDays: number },
  ) {
    return requestApi<AdminRetentionState>(`/admin/retention/${policyKey}`, {
      body: JSON.stringify(input),
      method: "PUT",
    });
  },
  updatePlan(planId: number, input: AdminPlanUpdateInput) {
    return requestApi<AdminPlanState>(`/admin/plans/${planId}`, {
      body: JSON.stringify(input),
      method: "PUT",
    });
  },
};
