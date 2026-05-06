import type {
  AiBotAccessMode,
  AiBotPermissions,
  AiBotProvider,
  AiBotUserSettings,
  AiModel,
  AiModelTier,
  AiSettings,
} from '../../types';
import { parseDigitsLimit } from '../../utils/numberFormatting';
export interface DraftSettings {
  providerName: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  allowReadSecrets: boolean;
  requireActionConfirmation: boolean;
  dailyRequestLimit: string;
  dailyTokenLimit: string;
}

export type AiModelFilter = 'all' | 'paid' | 'free';
export type AiModelGroup = { tier: AiModelTier | 'deprecated' | 'selected'; models: AiModel[] };
export type AiSettingsView = 'settings' | 'usage';
export type AiProviderPresetId = 'openai' | 'openrouter' | 'groq' | 'deepseek' | 'mistral' | 'qwen';
export type AiProviderPresetSelectValue = AiProviderPresetId | 'custom';
export type AiBotPermissionKey = keyof AiBotPermissions;
export type BotAccessMenuMode = AiBotAccessMode | 'secrets' | AiBotPermissionKey;
export type BotSettingsPatch = Partial<Omit<AiBotUserSettings, 'permissions'>> & {
  permissions?: Partial<AiBotPermissions>;
};

export interface AiProviderPreset {
  id: AiProviderPresetId;
  label: string;
  providerName: string;
  baseUrl: string;
  hint: string;
}

const modelTierOrder: AiModelTier[] = ['paid', 'free', 'unknown'];

export const botProviders: AiBotProvider[] = ['telegram', 'vk'];

export const defaultBotPermissions: AiBotPermissions = {
  readNotes: true,
  writeNotes: false,
  deleteNotes: false,
  manageTags: false,
  useTemplates: false,
  useVersions: false,
  listAttachments: false,
  createShareLinks: false,
};

export const providerPresets: AiProviderPreset[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    providerName: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    hint: 'GPT',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    providerName: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    hint: 'multi',
  },
  {
    id: 'groq',
    label: 'Groq',
    providerName: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    hint: 'fast',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    providerName: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    hint: 'code',
  },
  {
    id: 'mistral',
    label: 'Mistral',
    providerName: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    hint: 'EU',
  },
  {
    id: 'qwen',
    label: 'Qwen',
    providerName: 'Qwen',
    baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    hint: 'long',
  },
];

export function createDefaultBotSettings(provider: AiBotProvider): AiBotUserSettings {
  return {
    provider,
    enabled: false,
    accessMode: 'read',
    allowSecrets: false,
    permissions: { ...defaultBotPermissions },
    dailyRequestLimit: null,
    dailyReadLimit: null,
    dailyWriteLimit: null,
    linkedExternalId: null,
    linkedUsername: null,
    linkedAt: null,
  };
}

export function mergeBotSettings(
  provider: AiBotProvider,
  current: AiBotUserSettings | undefined,
  response: AiBotUserSettings,
  patch: BotSettingsPatch,
): AiBotUserSettings {
  const base = current ?? createDefaultBotSettings(provider);

  return {
    ...base,
    ...response,
    enabled: patch.enabled ?? response.enabled,
    accessMode: patch.accessMode ?? response.accessMode,
    allowSecrets: patch.allowSecrets ?? response.allowSecrets,
    dailyRequestLimit:
      patch.dailyRequestLimit === undefined ? response.dailyRequestLimit : patch.dailyRequestLimit,
    dailyReadLimit:
      patch.dailyReadLimit === undefined ? response.dailyReadLimit : patch.dailyReadLimit,
    dailyWriteLimit:
      patch.dailyWriteLimit === undefined ? response.dailyWriteLimit : patch.dailyWriteLimit,
    permissions: {
      ...defaultBotPermissions,
      ...base.permissions,
      ...response.permissions,
      ...patch.permissions,
    },
  };
}

export function findProviderPreset(providerName: string, baseUrl: string): AiProviderPreset | null {
  const normalizedName = normalizeProviderIdentity(providerName);
  const normalizedUrl = normalizeProviderIdentity(baseUrl);
  const normalizedOpenAiUrl = normalizeProviderIdentity('https://api.openai.com/v1');

  if (normalizedName === 'openai-compatible' && normalizedUrl === normalizedOpenAiUrl) {
    return providerPresets.find((preset) => preset.id === 'openai') ?? null;
  }

  return (
    providerPresets.find(
      (preset) =>
        normalizeProviderIdentity(preset.providerName) === normalizedName &&
        normalizeProviderIdentity(preset.baseUrl) === normalizedUrl,
    ) ?? null
  );
}

export function groupModels(
  models: AiModel[],
  query: string,
  filter: AiModelFilter,
  selectedModelId: string,
): AiModelGroup[] {
  const normalizedQuery = query.trim().toLowerCase();
  const selectedModel = selectedModelId
    ? models.find((model) => model.id === selectedModelId)
    : undefined;
  const visibleModels = models
    .filter((model) => model.id !== selectedModel?.id)
    .filter((model) => filter === 'all' || model.tier === filter)
    .filter(
      (model) =>
        model.label.toLowerCase().includes(normalizedQuery) ||
        model.id.toLowerCase().includes(normalizedQuery),
    )
    .sort(
      (left, right) =>
        right.sortRank - left.sortRank ||
        right.score - left.score ||
        left.label.localeCompare(right.label),
    );
  const activeModels = visibleModels.filter((model) => !model.isDeprecated);

  const groups: AiModelGroup[] = selectedModel
    ? [{ tier: 'selected', models: [selectedModel] }]
    : [];

  groups.push(
    ...modelTierOrder
      .map((tier) => ({
        tier,
        models: activeModels.filter((model) => model.tier === tier),
      }))
      .filter((group) => group.models.length > 0),
  );

  if (filter === 'all' && visibleModels.some((model) => model.isDeprecated)) {
    groups.push({
      tier: 'deprecated',
      models: visibleModels.filter((model) => model.isDeprecated),
    });
  }

  return groups;
}

export function scoreTone(score: number): 'low' | 'medium' | 'high' {
  if (score >= 75) {
    return 'high';
  }

  if (score >= 50) {
    return 'medium';
  }

  return 'low';
}

export function createDraft(settings: AiSettings | null): DraftSettings {
  return {
    providerName: settings?.providerName ?? 'OpenAI-compatible',
    baseUrl: settings?.baseUrl ?? 'https://api.openai.com/v1',
    model: settings?.model ?? '',
    apiKey: '',
    allowReadSecrets: settings?.allowReadSecrets ?? false,
    requireActionConfirmation: settings?.requireActionConfirmation ?? true,
    dailyRequestLimit: settings?.dailyRequestLimit ? String(settings.dailyRequestLimit) : '',
    dailyTokenLimit: settings?.dailyTokenLimit ? String(settings.dailyTokenLimit) : '',
  };
}

export function parseLimit(value: string): number | null {
  return parseDigitsLimit(value);
}

export function estimateContextLimit(model: string | null | undefined): number {
  const normalized = model?.toLowerCase() ?? '';

  if (normalized.includes('4.1')) {
    return 1_000_000;
  }

  if (normalized.includes('5.5') || normalized.includes('5.2') || normalized.includes('5.1')) {
    return 400_000;
  }

  if (normalized.includes('gpt-5') || normalized.includes('gpt-4o') || normalized.includes('o3')) {
    return 128_000;
  }

  if (normalized.includes('3.5')) {
    return 16_000;
  }

  return 128_000;
}

export function estimateTokens(value: string): number {
  return Math.ceil(value.length / 4);
}

function normalizeProviderIdentity(value: string): string {
  return value.trim().replace(/\/+$/, '').toLowerCase();
}
