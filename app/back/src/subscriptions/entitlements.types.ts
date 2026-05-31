export interface AiEntitlement {
  enabled: boolean;
  monthlyTokenLimit?: number | null;
  defaultModel?: string | null;
}

export interface FilesEntitlement {
  enabled: boolean;
  storageLimitBytes: number | null;
}

export interface FeatureToggle {
  enabled: boolean;
}

export interface WorkspaceEntitlement {
  enabled: boolean;
  maxNotes: number | null;
  maxNoteContentBytes: number | null;
}

export interface PlanEntitlements {
  workspace: WorkspaceEntitlement;
  publicShare: FeatureToggle;
  templates: FeatureToggle;
  versioning: FeatureToggle;
  commands: FeatureToggle;
  exportImport: FeatureToggle;
  ai: AiEntitlement;
  files: FilesEntitlement;
}

export const DEFAULT_FREE_ENTITLEMENTS: PlanEntitlements = {
  workspace: { enabled: true, maxNotes: null, maxNoteContentBytes: 512 * 1024 },
  publicShare: { enabled: false },
  templates: { enabled: true },
  versioning: { enabled: false },
  commands: { enabled: true },
  exportImport: { enabled: false },
  ai: { enabled: false },
  files: { enabled: true, storageLimitBytes: 100 * 1024 * 1024 },
};

export const DEFAULT_PRO_ENTITLEMENTS: PlanEntitlements = {
  workspace: { enabled: true, maxNotes: null, maxNoteContentBytes: null },
  publicShare: { enabled: true },
  templates: { enabled: true },
  versioning: { enabled: true },
  commands: { enabled: true },
  exportImport: { enabled: true },
  ai: { enabled: true, monthlyTokenLimit: null, defaultModel: null },
  files: { enabled: true, storageLimitBytes: null },
};

export const DEFAULT_ADMIN_ENTITLEMENTS: PlanEntitlements = {
  workspace: { enabled: true, maxNotes: null, maxNoteContentBytes: null },
  publicShare: { enabled: true },
  templates: { enabled: true },
  versioning: { enabled: true },
  commands: { enabled: true },
  exportImport: { enabled: true },
  ai: { enabled: true, monthlyTokenLimit: null, defaultModel: null },
  files: { enabled: true, storageLimitBytes: null },
};

export type SubscriptionErrorCode =
  | 'SUBSCRIPTION_REQUIRED'
  | 'STORAGE_LIMIT_EXCEEDED'
  | 'NOTE_LIMIT_EXCEEDED'
  | 'NOTE_SIZE_LIMIT_EXCEEDED';
