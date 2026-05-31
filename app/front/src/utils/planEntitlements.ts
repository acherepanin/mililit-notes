import { normalizePlanCurrency } from './subscriptionPricing';
import type { PlanEntitlements, SubscriptionPlan } from '../types';

export const DEFAULT_FREE_ENTITLEMENTS: PlanEntitlements = {
  workspace: { enabled: true, maxNotes: null, maxNoteContentBytes: 512 * 1024 },
  publicShare: { enabled: false },
  templates: { enabled: true },
  versioning: { enabled: false },
  commands: { enabled: true },
  exportImport: { enabled: false },
  ai: { enabled: false, monthlyTokenLimit: null, defaultModel: null },
  files: { enabled: true, storageLimitBytes: 100 * 1024 * 1024 },
};

export function emptyEntitlements(): PlanEntitlements {
  return {
    workspace: { enabled: true, maxNotes: null, maxNoteContentBytes: null },
    publicShare: { enabled: false },
    templates: { enabled: false },
    versioning: { enabled: false },
    commands: { enabled: false },
    exportImport: { enabled: false },
    ai: { enabled: false, monthlyTokenLimit: null, defaultModel: null },
    files: { enabled: false, storageLimitBytes: null },
  };
}

export function normalizeEntitlements(
  value: Partial<PlanEntitlements> | null | undefined,
  fallback: PlanEntitlements = DEFAULT_FREE_ENTITLEMENTS,
): PlanEntitlements {
  return {
    workspace: {
      enabled:
        value?.workspace?.enabled === undefined
          ? fallback.workspace.enabled
          : Boolean(value.workspace.enabled),
      maxNotes:
        value?.workspace?.maxNotes === null
          ? null
          : typeof value?.workspace?.maxNotes === 'number'
            ? value.workspace.maxNotes
            : fallback.workspace.maxNotes,
      maxNoteContentBytes:
        value?.workspace?.maxNoteContentBytes === null
          ? null
          : typeof value?.workspace?.maxNoteContentBytes === 'number'
            ? value.workspace.maxNoteContentBytes
            : fallback.workspace.maxNoteContentBytes,
    },
    publicShare: {
      enabled:
        value?.publicShare?.enabled === undefined
          ? fallback.publicShare.enabled
          : Boolean(value.publicShare.enabled),
    },
    templates: {
      enabled:
        value?.templates?.enabled === undefined
          ? fallback.templates.enabled
          : Boolean(value.templates.enabled),
    },
    versioning: {
      enabled:
        value?.versioning?.enabled === undefined
          ? fallback.versioning.enabled
          : Boolean(value.versioning.enabled),
    },
    commands: {
      enabled:
        value?.commands?.enabled === undefined
          ? fallback.commands.enabled
          : Boolean(value.commands.enabled),
    },
    exportImport: {
      enabled:
        value?.exportImport?.enabled === undefined
          ? fallback.exportImport.enabled
          : Boolean(value.exportImport.enabled),
    },
    ai: {
      enabled: value?.ai?.enabled === undefined ? fallback.ai.enabled : Boolean(value.ai.enabled),
      monthlyTokenLimit:
        value?.ai?.monthlyTokenLimit === null
          ? null
          : typeof value?.ai?.monthlyTokenLimit === 'number'
            ? value.ai.monthlyTokenLimit
            : fallback.ai.monthlyTokenLimit ?? null,
      defaultModel:
        typeof value?.ai?.defaultModel === 'string' && value.ai.defaultModel.trim()
          ? value.ai.defaultModel.trim()
          : value?.ai?.defaultModel === null
            ? null
            : fallback.ai.defaultModel ?? null,
    },
    files: {
      enabled:
        value?.files?.enabled === undefined ? fallback.files.enabled : Boolean(value.files.enabled),
      storageLimitBytes:
        value?.files?.storageLimitBytes === null
          ? null
          : typeof value?.files?.storageLimitBytes === 'number'
            ? value.files.storageLimitBytes
            : fallback.files.storageLimitBytes,
    },
  };
}

export function normalizeSubscriptionPlan(plan: SubscriptionPlan): SubscriptionPlan {
  return {
    ...plan,
    currency: normalizePlanCurrency(plan.currency),
    isHidden: Boolean(plan.isHidden),
    entitlements: normalizeEntitlements(plan.entitlements),
  };
}
