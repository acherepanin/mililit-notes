import type { Translator } from '../../i18n';
import type { AdminStats } from '../../types';

export type StatsSubTab = 'overview' | 'activity' | 'storage' | 'ai';

export interface StatsDerived {
  maxActivity: number;
  maxAiModelUsers: number;
  maxStorage: number;
  maxUserActivity: number;
  volumeRows: Array<{ label: string; value: number; width: string }>;
  activityTotals: {
    total: number;
    login: number;
    notes: number;
    admin: number;
    ai: number;
  };
  aiMonthlySpendTotalUsd: number;
  aiMonthlySpendHasUnknown: boolean;
}

export function buildStatsDerived(stats: AdminStats, t: Translator): StatsDerived {
  const volumeRows = [
    { label: t('adminNotes'), value: stats.notesTotal },
    { label: t('adminEvents'), value: stats.activityTotal },
    { label: t('adminFiles'), value: stats.attachmentsTotal },
    { label: t('adminVersions'), value: stats.noteVersionsTotal },
    { label: t('adminActiveLinks'), value: stats.shareLinksActiveTotal },
  ];
  const maxVolume = Math.max(...volumeRows.map((item) => item.value), 1);

  return {
    maxActivity: Math.max(...stats.activityByDay.map((day) => day.total), 1),
    maxAiModelUsers: Math.max(...stats.topAiModels.map((model) => model.usersTotal), 1),
    maxStorage: Math.max(...stats.topStorageUsers.map((user) => user.storageBytes), 1),
    maxUserActivity: Math.max(...stats.topActivityUsers.map((user) => user.eventsTotal), 1),
    volumeRows: volumeRows.map((item) => ({
      ...item,
      width: `${Math.max(4, Math.round((item.value / maxVolume) * 100))}%`,
    })),
    activityTotals: stats.activityByDay.reduce(
      (totals, day) => ({
        total: totals.total + day.total,
        login: totals.login + day.login,
        notes: totals.notes + day.notes,
        admin: totals.admin + day.admin,
        ai: totals.ai + day.ai,
      }),
      { total: 0, login: 0, notes: 0, admin: 0, ai: 0 },
    ),
    aiMonthlySpendTotalUsd: stats.aiMonthlySpendUsers.reduce(
      (sum, user) => sum + user.knownCostUsd,
      0,
    ),
    aiMonthlySpendHasUnknown: stats.aiMonthlySpendUsers.some((user) => user.hasUnknownCost),
  };
}

export function getActivityDayLabel(date: string, dateLocale: string): string {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(date)) {
    return new Intl.DateTimeFormat(dateLocale, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(`${date}:00:00.000Z`));
  }

  if (/^\d{4}-\d{2}$/.test(date)) {
    return new Intl.DateTimeFormat(dateLocale, {
      month: 'short',
      year: 'numeric',
    }).format(new Date(`${date}-01T00:00:00.000Z`));
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return new Intl.DateTimeFormat(dateLocale, {
      day: '2-digit',
      month: '2-digit',
    }).format(new Date(`${date}T00:00:00.000Z`));
  }

  return date;
}

export function getFileTypeLabel(type: string, t: Translator): string {
  switch (type) {
    case 'image':
      return t('adminFileTypeImage');
    case 'video':
      return t('adminFileTypeVideo');
    case 'audio':
      return t('adminFileTypeAudio');
    case 'pdf':
      return t('adminFileTypePdf');
    case 'text':
      return t('adminFileTypeText');
    case 'archive':
      return t('adminFileTypeArchive');
    default:
      return t('adminFileTypeOther');
  }
}
