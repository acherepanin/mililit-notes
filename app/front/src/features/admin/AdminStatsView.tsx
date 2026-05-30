import {
  Bot,
  FileX2,
  Gauge,
  HardDrive,
  LayoutDashboard,
  Link2,
  TrendingUp,
  UsersRound,
} from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { useCallback, useMemo, useState } from 'react';

import { CustomSelect } from '../../components/CustomSelect';
import { TooltipText } from '../../components/TooltipText';
import type { Translator } from '../../i18n';
import type { AdminStats, AdminStatsRange, UserLanguage } from '../../types';
import { formatFileSize } from '../../utils/files';
import { compactTokenCount, formatUsd } from '../../utils/numberFormatting';
import {
  buildStatsDerived,
  getActivityDayLabel,
  getFileTypeLabel,
  type StatsDerived,
  type StatsSubTab,
} from './adminStats.helpers';

type StatTone = 'blue' | 'cyan' | 'amber' | 'rose' | 'violet';

interface AdminStatsViewProps {
  stats: AdminStats | null;
  activityRange: AdminStatsRange;
  language: UserLanguage;
  t: Translator;
  onActivityRangeChange: (range: AdminStatsRange) => void;
}

interface StatsRankRowProps {
  label: string;
  value: string;
  width: string;
}

function StatsRankRow({ label, value, width }: StatsRankRowProps) {
  return (
    <div className="stats-rank-list__row">
      <TooltipText value={label} />
      <i aria-hidden="true">
        <b style={{ width }} />
      </i>
      <em>{value}</em>
    </div>
  );
}

interface StatsMetricProps {
  label: string;
  value: ReactNode;
}

function StatsMetric({ label, value }: StatsMetricProps) {
  return (
    <div className="stats-metric">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

interface AdminStatsViewContext {
  stats: AdminStats;
  derived: StatsDerived;
  t: Translator;
  dateLocale: string;
  getActivityDayLabelFn: (date: string) => string;
  getFileTypeLabelFn: (type: string) => string;
  formatDateTime: (value: string | null) => string;
}

export function AdminStatsView({
  stats,
  activityRange,
  language,
  t,
  onActivityRangeChange,
}: AdminStatsViewProps) {
  const [statsTab, setStatsTab] = useState<StatsSubTab>('overview');
  const dateLocale = language === 'ru' ? 'ru-RU' : 'en-US';
  const statsRangeOptions = useMemo(
    () => [
      { value: 'day' as const, label: t('adminStatsRangeDay') },
      { value: 'week' as const, label: t('adminStatsRangeWeek') },
      { value: 'month' as const, label: t('adminStatsRangeMonth') },
      { value: 'year' as const, label: t('adminStatsRangeYear') },
    ],
    [t],
  );
  const statsSubTabs = useMemo(
    () =>
      [
        { id: 'overview' as const, label: t('adminStatsTabOverview'), icon: LayoutDashboard },
        { id: 'activity' as const, label: t('adminStatsTabActivity'), icon: TrendingUp },
        { id: 'storage' as const, label: t('adminStatsTabStorage'), icon: HardDrive },
        { id: 'ai' as const, label: t('adminStatsTabAi'), icon: Bot },
      ] satisfies Array<{ id: StatsSubTab; label: string; icon: typeof LayoutDashboard }>,
    [t],
  );
  const statItems = useMemo(
    () =>
      stats
        ? [
            {
              icon: <UsersRound size={17} />,
              label: t('adminUsers'),
              tone: 'blue',
              value: stats.usersTotal,
              description: `${t('adminActiveToday')}: ${stats.activeUsersToday}`,
            },
            {
              icon: <HardDrive size={17} />,
              label: t('adminStorageUsed'),
              tone: 'cyan',
              value: formatFileSize(stats.attachmentsStorageBytes),
              description: `${t('adminFiles')}: ${stats.attachmentsTotal}`,
            },
            {
              icon: <Gauge size={17} />,
              label: t('adminLoad24h'),
              tone: 'amber',
              value: stats.eventsLast24h,
              description: t('adminEventsLast24h'),
            },
            {
              icon: <FileX2 size={17} />,
              label: t('adminDetachedFiles'),
              tone: 'rose',
              value: stats.orphanAttachmentsTotal,
              description: formatFileSize(stats.orphanAttachmentsBytes),
            },
            {
              icon: <Link2 size={17} />,
              label: t('adminActiveLinks'),
              tone: 'violet',
              value: stats.shareLinksActiveTotal,
              description: t('shareLinks'),
            },
          ].map((item) => ({ ...item, tone: item.tone as StatTone }))
        : [],
    [stats, t],
  );
  const derived = useMemo(() => (stats ? buildStatsDerived(stats, t) : null), [stats, t]);
  const getActivityDayLabelFn = useCallback(
    (date: string) => getActivityDayLabel(date, dateLocale),
    [dateLocale],
  );
  const getFileTypeLabelFn = useCallback((type: string) => getFileTypeLabel(type, t), [t]);
  const formatDateTime = useCallback(
    (value: string | null) => (value ? new Date(value).toLocaleString(dateLocale) : t('never')),
    [dateLocale, t],
  );

  const ctx: AdminStatsViewContext | null =
    stats && derived
      ? {
          stats,
          derived,
          t,
          dateLocale,
          getActivityDayLabelFn,
          getFileTypeLabelFn,
          formatDateTime,
        }
      : null;

  return (
    <div className="stats-view">
      <div className="stats-subtabs" role="tablist" aria-label={t('adminStats')}>
        {statsSubTabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={statsTab === id}
            className={`stats-subtabs__item ${statsTab === id ? 'stats-subtabs__item--active' : ''}`}
            onClick={() => setStatsTab(id)}
          >
            <Icon size={15} aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {ctx ? (
        <div className="stats-tab-panel" role="tabpanel">
          {statsTab === 'overview' ? (
            <StatsOverviewTab ctx={ctx} statItems={statItems} />
          ) : null}
          {statsTab === 'activity' ? (
            <StatsActivityTab
              ctx={ctx}
              activityRange={activityRange}
              statsRangeOptions={statsRangeOptions}
              onActivityRangeChange={onActivityRangeChange}
            />
          ) : null}
          {statsTab === 'storage' ? <StatsStorageTab ctx={ctx} /> : null}
          {statsTab === 'ai' ? <StatsAiTab ctx={ctx} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function StatsOverviewTab({
  ctx,
  statItems,
}: {
  ctx: AdminStatsViewContext;
  statItems: Array<{
    description: string;
    icon: ReactNode;
    label: string;
    tone: StatTone;
    value: number | string;
  }>;
}) {
  const { stats, derived, t, formatDateTime } = ctx;

  return (
    <>
      <div className="stats-grid stats-grid--overview">
        {statItems.map(({ description, icon, label, tone, value }) => (
          <div className={`stat-tile stat-tile--${tone}`} key={label}>
            <div className="stat-tile__head">
              <span className="stat-tile__icon">{icon}</span>
              <span className="stat-tile__label">{label}</span>
            </div>
            <strong>{value}</strong>
            <span className="stat-tile__description">{description}</span>
          </div>
        ))}
      </div>

      <section className="stats-chart-card">
        <header className="stats-chart-card__head">
          <span>{t('adminStatsSummary')}</span>
        </header>
        <dl className="stats-metric-grid stats-metric-grid--4">
          <StatsMetric label={t('adminUsers')} value={stats.usersTotal} />
          <StatsMetric label={t('adminAdmins')} value={stats.adminsTotal} />
          <StatsMetric label={t('adminNotes')} value={stats.notesTotal} />
          <StatsMetric label={t('adminVersions')} value={stats.noteVersionsTotal} />
          <StatsMetric label={t('adminEvents')} value={stats.activityTotal} />
          <StatsMetric label={t('adminActiveLinks')} value={stats.shareLinksActiveTotal} />
          <StatsMetric label={t('adminActiveToday')} value={stats.activeUsersToday} />
          <StatsMetric label={t('adminLoad24h')} value={stats.eventsLast24h} />
          <StatsMetric label={t('adminStatsLastLogin')} value={formatDateTime(stats.lastLoginAt)} />
        </dl>
      </section>

      <section className="stats-chart-card">
        <header className="stats-chart-card__head">
          <span>{t('adminWorkload')}</span>
          <strong>{t('adminVolume')}</strong>
        </header>
        <div className="stats-bars stats-bars--spacious">
          {derived.volumeRows.map((item) => (
            <div className="stats-bars__row" key={item.label}>
              <span>{item.label}</span>
              <i aria-hidden="true">
                <b style={{ width: item.width }} />
              </i>
              <em>{item.value}</em>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function StatsActivityTab({
  ctx,
  activityRange,
  statsRangeOptions,
  onActivityRangeChange,
}: {
  ctx: AdminStatsViewContext;
  activityRange: AdminStatsRange;
  statsRangeOptions: Array<{ value: AdminStatsRange; label: string }>;
  onActivityRangeChange: (range: AdminStatsRange) => void;
}) {
  const { stats, derived, t, getActivityDayLabelFn } = ctx;

  return (
    <>
      <section className="stats-chart-card stats-chart-card--activity">
        <header className="stats-chart-card__head">
          <span>{t('adminActivityChart')}</span>
          <CustomSelect
            className="stats-range-select"
            label={t('adminActivityRange')}
            value={activityRange}
            options={statsRangeOptions}
            onChange={onActivityRangeChange}
          />
        </header>
        <div
          className="stats-activity-chart stats-activity-chart--tall"
          style={
            {
              '--activity-column-min':
                stats.activityRange === 'month'
                  ? '36px'
                  : stats.activityRange === 'day'
                    ? '38px'
                    : stats.activityRange === 'year'
                      ? '44px'
                      : '42px',
              '--activity-columns': stats.activityByDay.length,
            } as CSSProperties
          }
        >
          {stats.activityByDay.map((day) => (
            <div className="stats-activity-day" key={day.date}>
              <div className="stats-activity-day__track">
                <span
                  style={
                    {
                      '--activity-height': `${Math.max(
                        day.total > 0 ? 7 : 0,
                        Math.round((day.total / derived.maxActivity) * 100),
                      )}%`,
                    } as CSSProperties
                  }
                />
              </div>
              <span>{getActivityDayLabelFn(day.date)}</span>
              <strong>{day.total}</strong>
            </div>
          ))}
        </div>
        <dl className="stats-metric-grid stats-metric-grid--5 stats-metric-grid--compact">
          <StatsMetric label={t('adminStatsDayTotal')} value={derived.activityTotals.total} />
          <StatsMetric label={t('actionAuthLogin')} value={derived.activityTotals.login} />
          <StatsMetric label={t('adminNotes')} value={derived.activityTotals.notes} />
          <StatsMetric label={t('adminAdmins')} value={derived.activityTotals.admin} />
          <StatsMetric label={t('adminLlm')} value={derived.activityTotals.ai} />
        </dl>
      </section>

      <section className="stats-chart-card">
        <header className="stats-chart-card__head">
          <span>{t('adminStatsActivityTable')}</span>
        </header>
        <div className="stats-detail-table-wrap">
          <table className="stats-detail-table">
            <thead>
              <tr>
                <th>{t('adminActivityDate')}</th>
                <th>{t('adminStatsDayTotal')}</th>
                <th>{t('actionAuthLogin')}</th>
                <th>{t('adminNotes')}</th>
                <th>{t('adminAdmins')}</th>
                <th>{t('adminLlm')}</th>
              </tr>
            </thead>
            <tbody>
              {[...stats.activityByDay].reverse().map((day) => (
                <tr key={day.date}>
                  <td>{getActivityDayLabelFn(day.date)}</td>
                  <td>{day.total}</td>
                  <td>{day.login}</td>
                  <td>{day.notes}</td>
                  <td>{day.admin}</td>
                  <td>{day.ai}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="stats-chart-card">
        <header className="stats-chart-card__head">
          <span>{t('adminTopActivityUsers')}</span>
          <strong>{derived.activityTotals.total}</strong>
        </header>
        {stats.topActivityUsers.length > 0 ? (
          <div className="stats-rank-list">
            {stats.topActivityUsers.map((user) => (
              <StatsRankRow
                key={user.username}
                label={user.username}
                value={String(user.eventsTotal)}
                width={`${Math.max(
                  4,
                  Math.round((user.eventsTotal / derived.maxUserActivity) * 100),
                )}%`}
              />
            ))}
          </div>
        ) : (
          <p className="stats-ai-empty">{t('adminAiNoData')}</p>
        )}
      </section>
    </>
  );
}

function StatsStorageTab({ ctx }: { ctx: AdminStatsViewContext }) {
  const { stats, derived, t, getFileTypeLabelFn } = ctx;
  const storageShare = (bytes: number) =>
    stats.attachmentsStorageBytes > 0
      ? `${Math.round((bytes / stats.attachmentsStorageBytes) * 100)}%`
      : '0%';

  return (
    <>
      <section className="stats-chart-card">
        <header className="stats-chart-card__head">
          <span>{t('adminFileMemory')}</span>
          <strong>{formatFileSize(stats.attachmentsStorageBytes)}</strong>
        </header>
        <dl className="stats-metric-grid stats-metric-grid--4">
          <StatsMetric label={t('adminFiles')} value={stats.attachmentsTotal} />
          <StatsMetric
            label={t('adminAverageFile')}
            value={formatFileSize(stats.averageAttachmentBytes)}
          />
          <StatsMetric
            label={t('adminLargestFile')}
            value={formatFileSize(stats.largestAttachmentBytes)}
          />
          <StatsMetric
            label={t('adminNotesWithFiles')}
            value={stats.notesWithAttachmentsTotal}
          />
          <StatsMetric
            label={t('adminDetachedFiles')}
            value={stats.orphanAttachmentsTotal}
          />
          <StatsMetric
            label={t('adminDetachedStorage')}
            value={formatFileSize(stats.orphanAttachmentsBytes)}
          />
        </dl>
      </section>

      <section className="stats-chart-card">
        <header className="stats-chart-card__head">
          <span>{t('adminStatsFileTypes')}</span>
          <strong>{stats.fileTypes.length}</strong>
        </header>
        {stats.fileTypes.length > 0 ? (
          <div className="stats-detail-table-wrap">
            <table className="stats-detail-table">
              <thead>
                <tr>
                  <th>{t('adminStatsFileType')}</th>
                  <th>{t('adminStatsFileCount')}</th>
                  <th>{t('adminStorageUsed')}</th>
                  <th>{t('adminStatsStorageShare')}</th>
                </tr>
              </thead>
              <tbody>
                {stats.fileTypes.map((item) => (
                  <tr key={item.type}>
                    <td>{getFileTypeLabelFn(item.type)}</td>
                    <td>{item.filesTotal}</td>
                    <td>{formatFileSize(item.storageBytes)}</td>
                    <td>{storageShare(item.storageBytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="stats-ai-empty">{t('adminAiNoData')}</p>
        )}
      </section>

      <section className="stats-chart-card">
        <header className="stats-chart-card__head">
          <span>{t('adminTopStorageUsers')}</span>
          <strong>{formatFileSize(stats.attachmentsStorageBytes)}</strong>
        </header>
        {stats.topStorageUsers.length > 0 ? (
          <div className="stats-rank-list">
            {stats.topStorageUsers.map((user) => (
              <StatsRankRow
                key={user.username}
                label={user.username}
                value={`${user.filesTotal} / ${formatFileSize(user.storageBytes)}`}
                width={`${Math.max(
                  4,
                  Math.round((user.storageBytes / derived.maxStorage) * 100),
                )}%`}
              />
            ))}
          </div>
        ) : (
          <p className="stats-ai-empty">{t('adminAiNoData')}</p>
        )}
      </section>
    </>
  );
}

function StatsAiTab({ ctx }: { ctx: AdminStatsViewContext }) {
  const { stats, derived, t, formatDateTime } = ctx;

  return (
    <>
      <section className="stats-chart-card stats-chart-card--ai" aria-labelledby="admin-ai-activity-title">
        <header className="stats-chart-card__head stats-chart-card__head--ai">
          <div className="stats-ai-heading">
            <h2 className="stats-ai-heading__title" id="admin-ai-activity-title">
              {t('adminAiActivity')}
            </h2>
            <p className="stats-ai-heading__period">{t('adminAiActivityPeriod')}</p>
          </div>
          <div className="stats-ai-sync">
            <span className="stats-ai-sync__label">{t('adminAiLastSync')}</span>
            <time className="stats-ai-sync__value" dateTime={stats.aiLastModelsSyncAt ?? undefined}>
              <TooltipText value={formatDateTime(stats.aiLastModelsSyncAt)} />
            </time>
          </div>
        </header>

        <div className="stats-ai-kpis" role="list">
          <article className="stats-ai-kpi" role="listitem">
            <strong>{stats.aiChatsLast24h}</strong>
            <span>{t('adminAiChats24h')}</span>
          </article>
          <article className="stats-ai-kpi" role="listitem">
            <strong>{stats.aiToolExecutionsLast24h}</strong>
            <span>{t('adminAiActions24h')}</span>
          </article>
          <article className="stats-ai-kpi" role="listitem">
            <strong>{stats.aiActiveUsersLast24h}</strong>
            <span>{t('adminAiActiveUsers24h')}</span>
          </article>
        </div>

        <dl className="stats-metric-grid stats-metric-grid--5 stats-metric-grid--compact">
          <StatsMetric label={t('adminAiEnabledUsers')} value={stats.aiEnabledUsersTotal} />
          <StatsMetric label={t('adminAiSelectedModels')} value={stats.aiSelectedModelsTotal} />
          <StatsMetric label={t('adminAiProviders')} value={stats.aiProvidersTotal} />
          <StatsMetric label={t('adminAiActiveModels')} value={stats.aiSyncedModelsTotal} />
          <StatsMetric label={t('adminAiDeprecatedModels')} value={stats.aiDeprecatedModelsTotal} />
        </dl>
      </section>

      <div className="stats-ai-panels stats-ai-panels--full">
        <section className="stats-ai-panel stats-chart-card">
          <header className="stats-chart-card__head">
            <span>{t('adminAiTopModels')}</span>
            <strong>{stats.topAiModels.length}</strong>
          </header>
          {stats.topAiModels.length > 0 ? (
            <div className="stats-rank-list stats-rank-list--ai">
              {stats.topAiModels.map((model) => (
                <StatsRankRow
                  key={model.model}
                  label={model.model}
                  value={String(model.usersTotal)}
                  width={`${Math.max(
                    4,
                    Math.round((model.usersTotal / derived.maxAiModelUsers) * 100),
                  )}%`}
                />
              ))}
            </div>
          ) : (
            <p className="stats-ai-empty">{t('adminAiNoData')}</p>
          )}
        </section>

        <section className="stats-ai-panel stats-chart-card">
          <header className="stats-chart-card__head">
            <span>{t('adminAiMonthlySpend')}</span>
            <strong>
              {formatUsd(derived.aiMonthlySpendTotalUsd)}
              {derived.aiMonthlySpendHasUnknown ? ' + ?' : ''}
            </strong>
          </header>
          {stats.aiMonthlySpendUsers.length > 0 ? (
            <div className="stats-ai-spend stats-ai-spend--full">
              {stats.aiMonthlySpendUsers.map((user) => (
                <article className="stats-ai-spend-user" key={user.userId}>
                  <header>
                    <TooltipText value={user.username} />
                    <strong>
                      {formatUsd(user.knownCostUsd)}
                      {user.hasUnknownCost ? ' + ?' : ''}
                    </strong>
                  </header>
                  <p className="stats-ai-spend-user__meta">
                    {compactTokenCount(user.tokens)} {t('aiTokens')} · {user.requests}{' '}
                    {t('aiUsageRequests').toLowerCase()}
                    {user.hasUnknownCost ? ` · ${t('adminAiSpendUnknown')}` : ''}
                  </p>
                  {user.models.length > 0 ? (
                    <ul className="stats-ai-spend-models">
                      {user.models.map((model) => (
                        <li
                          className="stats-ai-spend-model"
                          key={`${user.userId}-${model.providerName}-${model.model}`}
                        >
                          <TooltipText value={model.model} />
                          <span>
                            {model.costUsd === null ? '?' : formatUsd(model.costUsd)} ·{' '}
                            {compactTokenCount(model.tokens)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <p className="stats-ai-empty">{t('adminAiNoData')}</p>
          )}
        </section>
      </div>
    </>
  );
}
