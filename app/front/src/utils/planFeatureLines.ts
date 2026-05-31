import type { LucideIcon } from 'lucide-react';
import {
  ArrowDownUp,
  Bot,
  Folder,
  History,
  LayoutTemplate,
  Link2,
  NotebookPen,
  Terminal,
} from 'lucide-react';

import type { Translator } from '../i18n';
import type { PlanEntitlements, SubscriptionPlan, UserLanguage } from '../types';

export type PlanFeatureTone = 'available' | 'unavailable';

export interface PlanFeatureItem {
  available: boolean;
  detail?: string;
  details?: string[];
  icon: LucideIcon;
  id: string;
  label: string;
  tone: PlanFeatureTone;
}

function formatBytesLimit(bytes: number, language: UserLanguage): string {
  const mb = bytes / 1024 ** 2;
  if (mb >= 1024) {
    const gb = mb / 1024;
    const value = gb >= 10 ? gb.toFixed(0) : gb.toFixed(1);
    return `${value} ${language === 'ru' ? 'ГБ' : 'GB'}`;
  }
  const value = mb >= 10 ? mb.toFixed(0) : mb.toFixed(1);
  return `${value} ${language === 'ru' ? 'МБ' : 'MB'}`;
}

function formatStorageLimit(bytes: number, language: UserLanguage): string {
  return formatBytesLimit(bytes, language);
}

function formatCount(value: number, language: UserLanguage): string {
  return value.toLocaleString(language === 'ru' ? 'ru-RU' : 'en-US');
}

function item(
  id: string,
  icon: LucideIcon,
  label: string,
  available: boolean,
  detail?: string,
): PlanFeatureItem {
  return {
    id,
    icon,
    label,
    available,
    detail,
    tone: available ? 'available' : 'unavailable',
  };
}

function buildWorkspaceItem(
  entitlements: PlanEntitlements,
  t: Translator,
  language: UserLanguage,
): PlanFeatureItem {
  const { workspace } = entitlements;
  const workspaceOn = workspace.enabled;

  if (!workspaceOn) {
    return item('workspace', NotebookPen, t('planFeatureWorkspace'), false);
  }

  const notesValue =
    workspace.maxNotes !== null
      ? formatCount(workspace.maxNotes, language)
      : t('planFeatureUnlimited');

  const noteSizeValue =
    workspace.maxNoteContentBytes !== null
      ? formatBytesLimit(workspace.maxNoteContentBytes, language)
      : t('planFeatureUnlimited');

  return {
    ...item('workspace', NotebookPen, t('planFeatureWorkspace'), true),
    details: [
      `${t('planFeatureMaxNotes')}: ${notesValue}`,
      `${t('planFeatureMaxNoteSize')}: ${noteSizeValue}`,
    ],
  };
}

function buildAiItem(
  entitlements: PlanEntitlements,
  t: Translator,
  language: UserLanguage,
): PlanFeatureItem {
  const { ai } = entitlements;
  const available = ai.enabled;

  if (!available) {
    return item('ai', Bot, t('planFeatureAi'), false);
  }

  const tokenValue =
    ai.monthlyTokenLimit !== null && ai.monthlyTokenLimit !== undefined
      ? formatCount(ai.monthlyTokenLimit, language)
      : t('planFeatureUnlimited');

  const details = [`${t('planFeatureAiTokens')}: ${tokenValue}`];

  const model = ai.defaultModel;
  if (model) {
    details.push(`${t('planFeatureAiModel')}: ${model}`);
  }

  return {
    ...item('ai', Bot, t('planFeatureAi'), true),
    details,
  };
}

function buildFilesItem(
  entitlements: PlanEntitlements,
  t: Translator,
  language: UserLanguage,
): PlanFeatureItem {
  const { files } = entitlements;
  const available = files.enabled;

  if (!available) {
    return item('files', Folder, t('planFeatureFiles'), false);
  }

  const storageValue =
    files.storageLimitBytes !== null
      ? formatStorageLimit(files.storageLimitBytes, language)
      : t('planFeatureUnlimited');

  return {
    ...item('files', Folder, t('planFeatureFiles'), true),
    details: [`${t('planFeatureStorage')}: ${storageValue}`],
  };
}

export function buildPlanFeatureItems(
  plan: SubscriptionPlan,
  t: Translator,
  language: UserLanguage,
): PlanFeatureItem[] {
  const { entitlements } = plan;

  return [
    buildWorkspaceItem(entitlements, t, language),
    item('public-share', Link2, t('planFeaturePublicShare'), entitlements.publicShare.enabled),
    item('templates', LayoutTemplate, t('planFeatureTemplates'), entitlements.templates.enabled),
    item('versioning', History, t('planFeatureVersioning'), entitlements.versioning.enabled),
    item('commands', Terminal, t('planFeatureCommands'), entitlements.commands.enabled),
    item(
      'export-import',
      ArrowDownUp,
      t('planFeatureExportImport'),
      entitlements.exportImport.enabled,
    ),
    buildAiItem(entitlements, t, language),
    buildFilesItem(entitlements, t, language),
  ];
}

function formatFeatureSummary(item: PlanFeatureItem, t: Translator): string {
  if (!item.available) {
    return `${item.label}: ${t('planFeatureNotIncluded')}`;
  }

  const detailLines = item.details?.length ? item.details : item.detail ? [item.detail] : [];
  if (!detailLines.length) {
    return item.label;
  }

  return `${item.label}: ${detailLines.join(' · ')}`;
}
