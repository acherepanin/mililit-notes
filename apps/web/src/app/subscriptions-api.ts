import { requestApi } from "./notes-api";

export interface PlanEntitlements {
  ai?: { enabled?: boolean; monthlyTokenLimit?: number | null };
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

export interface SubscriptionPlan {
  billingPeriod: "lifetime" | "month" | "year";
  currency: string;
  description: string | null;
  entitlements: PlanEntitlements;
  id: number;
  name: string;
  priceCents: number;
  slug: string;
}

export interface SubscriptionState {
  checkoutAvailable: boolean;
  current: {
    entitlements: PlanEntitlements;
    expiresAt: string | null;
    id: number | null;
    plan: { id: number | null; name: string; slug: string };
    source: string;
    startedAt: string | null;
  };
  plans: SubscriptionPlan[];
}

export interface SubscriptionOrder {
  amountCents: number;
  checkoutMode: "purchase" | "renew";
  currency: string;
  discountPercent: number;
  id: number;
  planId: number;
  status: string;
  termMonths: number;
}

export const subscriptionsApi = {
  checkout(input: {
    mode: "purchase" | "renew";
    planId: number;
    termMonths: number;
  }) {
    return requestApi<SubscriptionOrder>("/subscriptions/checkout", {
      body: JSON.stringify(input),
      method: "POST",
    });
  },
  confirm(orderId: number) {
    return requestApi<{ id: number }>(
      `/subscriptions/checkout/${orderId}/confirm`,
      { method: "POST" },
    );
  },
  state() {
    return requestApi<SubscriptionState>("/subscriptions");
  },
};
