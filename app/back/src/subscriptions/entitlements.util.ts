import {
  DEFAULT_FREE_ENTITLEMENTS,
  type FeatureToggle,
  type PlanEntitlements,
  type WorkspaceEntitlement,
} from './entitlements.types';

function parseFeatureToggle(
  value: Partial<FeatureToggle> | undefined,
  fallback: FeatureToggle,
): FeatureToggle {
  return {
    enabled: value?.enabled === undefined ? fallback.enabled : Boolean(value.enabled),
  };
}

function parseWorkspaceEntitlement(
  value: Partial<WorkspaceEntitlement> | undefined,
  fallback: WorkspaceEntitlement,
): WorkspaceEntitlement {
  return {
    enabled: value?.enabled === undefined ? fallback.enabled : Boolean(value.enabled),
    maxNotes:
      value?.maxNotes === null
        ? null
        : typeof value?.maxNotes === 'number'
          ? value.maxNotes
          : fallback.maxNotes,
    maxNoteContentBytes:
      value?.maxNoteContentBytes === null
        ? null
        : typeof value?.maxNoteContentBytes === 'number'
          ? value.maxNoteContentBytes
          : fallback.maxNoteContentBytes,
  };
}

export function normalizeEntitlements(
  parsed: Partial<PlanEntitlements> | null | undefined,
  fallback: PlanEntitlements = DEFAULT_FREE_ENTITLEMENTS,
): PlanEntitlements {
  return {
    workspace: parseWorkspaceEntitlement(parsed?.workspace, fallback.workspace),
    publicShare: parseFeatureToggle(parsed?.publicShare, fallback.publicShare),
    templates: parseFeatureToggle(parsed?.templates, fallback.templates),
    versioning: parseFeatureToggle(parsed?.versioning, fallback.versioning),
    commands: parseFeatureToggle(parsed?.commands, fallback.commands),
    exportImport: parseFeatureToggle(parsed?.exportImport, fallback.exportImport),
    ai: {
      enabled: parsed?.ai?.enabled === undefined ? fallback.ai.enabled : Boolean(parsed.ai.enabled),
      monthlyTokenLimit:
        parsed?.ai?.monthlyTokenLimit === null
          ? null
          : typeof parsed?.ai?.monthlyTokenLimit === 'number'
            ? parsed.ai.monthlyTokenLimit
            : fallback.ai.monthlyTokenLimit ?? null,
      defaultModel:
        typeof parsed?.ai?.defaultModel === 'string' && parsed.ai.defaultModel.trim()
          ? parsed.ai.defaultModel.trim()
          : parsed?.ai?.defaultModel === null
            ? null
            : fallback.ai.defaultModel ?? null,
    },
    files: {
      enabled:
        parsed?.files?.enabled === undefined ? fallback.files.enabled : Boolean(parsed.files.enabled),
      storageLimitBytes:
        parsed?.files?.storageLimitBytes === null
          ? null
          : typeof parsed?.files?.storageLimitBytes === 'number'
            ? parsed.files.storageLimitBytes
            : fallback.files.storageLimitBytes,
    },
  };
}

export function parseEntitlementsJson(raw: string): PlanEntitlements {
  try {
    const parsed = JSON.parse(raw) as Partial<PlanEntitlements>;
    return normalizeEntitlements(parsed);
  } catch {
    return DEFAULT_FREE_ENTITLEMENTS;
  }
}

export function serializeEntitlements(entitlements: PlanEntitlements): string {
  return JSON.stringify(normalizeEntitlements(entitlements));
}
