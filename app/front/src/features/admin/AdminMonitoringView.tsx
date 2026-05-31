import {
  Activity,
  AlertTriangle,
  ArrowUpDown,
  ChevronRight,
  CreditCard,
  Gauge,
  Search,
} from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import { adminApi } from '../../api';
import { CustomSelect } from '../../components/CustomSelect';
import { EmptyState } from '../../components/EmptyState';
import { TooltipText } from '../../components/TooltipText';
import type { Translator } from '../../i18n';
import type {
  ActivityLog,
  MonitoringPerformance,
  MonitoringRange,
  RequestErrorLog,
  SubscriptionLog,
  UserLanguage,
} from '../../types';
import { formatUsd } from '../../utils/numberFormatting';
import { ActivityColumnFilter } from './ActivityColumnFilter';
import {
  emptyActivityFilters,
  type ActivityFilterKey,
  type ActivityFilters,
  type ActivitySort,
} from './adminFilters';

type MonitoringSubTab = 'actions' | 'subscriptions' | 'errors' | 'performance';

interface AdminMonitoringViewProps {
  language: UserLanguage;
  reloadKey: number;
  t: Translator;
}

function formatMoney(cents: number, currency: string): string {
  const amount = cents / 100;
  if (currency.toUpperCase() === 'USD') {
    return formatUsd(amount);
  }

  return `${amount.toFixed(2)} ${currency.toUpperCase()}`;
}

function formatBucketLabel(iso: string, range: MonitoringRange, locale: string): string {
  const date = new Date(iso);

  if (range === 'hour' || range === 'day') {
    return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  }

  if (range === 'week') {
    return date.toLocaleDateString(locale, { weekday: 'short', day: 'numeric' });
  }

  return date.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

function formatDetails(details: Record<string, unknown> | null): string {
  if (!details || Object.keys(details).length === 0) {
    return '—';
  }

  try {
    return JSON.stringify(details, null, 2);
  } catch {
    return '—';
  }
}

function MonitoringDetailsCell({ value }: { value: Record<string, unknown> | null }) {
  const text = formatDetails(value);
  if (text === '—') {
    return <span className="monitoring-details-cell monitoring-details-cell--empty">—</span>;
  }

  const preview = text.replace(/\s+/g, ' ').slice(0, 64);

  return (
    <details className="monitoring-details-cell">
      <summary>
        <span className="monitoring-details-cell__preview">{preview}</span>
        <ChevronRight size={12} aria-hidden className="monitoring-details-cell__chevron" />
      </summary>
      <pre>{text}</pre>
    </details>
  );
}

function MonitoringStatusBadge({ statusCode }: { statusCode: number }) {
  const tone =
    statusCode >= 500 ? 'danger' : statusCode >= 400 ? 'warning' : 'neutral';

  return (
    <span className={`monitoring-pill monitoring-pill--${tone}`}>{statusCode}</span>
  );
}

function MonitoringMethodBadge({ method }: { method: string }) {
  return <span className="monitoring-pill monitoring-pill--method">{method}</span>;
}

function MonitoringSourceBadge({
  source,
  t,
}: {
  source: string;
  t: Translator;
}) {
  const label =
    source === 'checkout'
      ? t('monitoringSourceCheckout')
      : source === 'admin_grant'
        ? t('monitoringSourceAdminGrant')
        : source === 'migration'
          ? t('monitoringSourceMigration')
          : source;

  return <span className="monitoring-pill monitoring-pill--source">{label}</span>;
}

function MonitoringTableHeader({ label }: { label: string }) {
  return (
    <th scope="col">
      <TooltipText className="activity-table__head-label" value={label} />
    </th>
  );
}

function MonitoringFilterHeader({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <th scope="col">
      <div className="activity-table__head-cell">
        <TooltipText className="activity-table__head-label-wrap" value={label} />
        {children}
      </div>
    </th>
  );
}

function MonitoringTableShell({
  children,
  empty,
  isEmpty,
  isLoading = false,
}: {
  children: ReactNode;
  empty: ReactNode;
  isEmpty: boolean;
  isLoading?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scrollbarSize, setScrollbarSize] = useState(0);

  useLayoutEffect(() => {
    const node = wrapRef.current;
    if (!node) {
      return;
    }

    const measure = () => {
      setScrollbarSize(Math.max(0, node.offsetWidth - node.clientWidth));
    };

    measure();

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(node);

    const table = node.querySelector('.activity-table--monitoring');
    if (table instanceof HTMLElement) {
      resizeObserver.observe(table);
    }

    return () => resizeObserver.disconnect();
  }, [children, isEmpty, isLoading]);

  return (
    <div className="monitoring-table-shell">
      <div
        ref={wrapRef}
        className="activity-table-wrap activity-table-wrap--monitoring"
        aria-busy={isLoading}
        style={{ '--monitoring-scrollbar-size': `${scrollbarSize}px` } as CSSProperties}
      >
        {isEmpty ? <div className="monitoring-table-placeholder">{empty}</div> : children}
      </div>
    </div>
  );
}

export function AdminMonitoringView({ language, reloadKey, t }: AdminMonitoringViewProps) {
  const [subTab, setSubTab] = useState<MonitoringSubTab>('actions');
  const [actions, setActions] = useState<ActivityLog[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionLog[]>([]);
  const [errors, setErrors] = useState<RequestErrorLog[]>([]);
  const [performance, setPerformance] = useState<MonitoringPerformance | null>(null);
  const [performanceRange, setPerformanceRange] = useState<MonitoringRange>('day');
  const [search, setSearch] = useState('');
  const [activitySort, setActivitySort] = useState<ActivitySort>('newest');
  const [activityFilters, setActivityFilters] = useState<ActivityFilters>(emptyActivityFilters);
  const [isLoading, setIsLoading] = useState(false);
  const dateLocale = language === 'ru' ? 'ru-RU' : 'en-US';

  const getActivityActionLabel = useCallback(
    (action: string) => {
      switch (action) {
        case 'auth.login':
          return t('actionAuthLogin');
        case 'notes.create':
          return t('actionNoteCreate');
        case 'notes.update':
          return t('actionNoteUpdate');
        case 'notes.move':
          return t('actionNoteMove');
        case 'notes.delete':
          return t('actionNoteDelete');
        case 'notes.delete_all':
          return t('actionNoteDeleteAll');
        case 'ai.settings.update':
          return t('actionAiSettingsUpdate');
        case 'ai.chat':
          return t('actionAiChat');
        case 'ai.tool.execute':
          return t('actionAiToolExecute');
        case 'ai.bot.settings.update':
          return t('actionAiBotSettingsUpdate');
        case 'ai.bot.connection.check':
          return t('actionAiBotConnectionCheck');
        case 'ai.bot.message':
          return t('actionAiBotMessage');
        case 'admin.user.create':
          return t('actionAdminUserCreate');
        case 'admin.user.update':
          return t('actionAdminUserUpdate');
        case 'admin.user.delete':
          return t('actionAdminUserDelete');
        case 'subscription.purchase':
          return t('actionSubscriptionPurchase');
        case 'subscription.renew':
          return t('actionSubscriptionRenew');
        case 'subscription.admin_assign':
          return t('actionSubscriptionAdminAssign');
        default:
          return action;
      }
    },
    [t],
  );

  const loadActions = useCallback(async () => {
    setIsLoading(true);
    try {
      setActions(await adminApi.listMonitoringActions());
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadSubscriptions = useCallback(async () => {
    setIsLoading(true);
    try {
      setSubscriptions(await adminApi.listMonitoringSubscriptions());
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadErrors = useCallback(async () => {
    setIsLoading(true);
    try {
      setErrors(await adminApi.listMonitoringErrors());
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadPerformance = useCallback(async () => {
    setIsLoading(true);
    try {
      setPerformance(await adminApi.getMonitoringPerformance(performanceRange));
    } finally {
      setIsLoading(false);
    }
  }, [performanceRange]);

  useEffect(() => {
    if (subTab === 'actions') {
      void loadActions();
      return;
    }

    if (subTab === 'subscriptions') {
      void loadSubscriptions();
      return;
    }

    if (subTab === 'errors') {
      void loadErrors();
      return;
    }

    void loadPerformance();
  }, [subTab, reloadKey, loadActions, loadSubscriptions, loadErrors, loadPerformance]);

  const toggleActivityFilter = (key: ActivityFilterKey, value: string) => {
    setActivityFilters((current) => {
      const selected = current[key];
      const nextSelected = selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value];

      return { ...current, [key]: nextSelected };
    });
  };

  const clearActivityFilter = (key: ActivityFilterKey) => {
    setActivityFilters((current) => ({ ...current, [key]: [] }));
  };

  const actionRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matchesFilter = (key: ActivityFilterKey, value: string) =>
      activityFilters[key].length === 0 || activityFilters[key].includes(value);

    const filtered = actions.filter((item) => {
      const user = item.userUsername ?? item.actorUsername ?? t('adminUnknownUser');
      const action = getActivityActionLabel(item.action);
      const actor = item.actorUsername ?? '-';
      const target = `${item.targetType}${item.targetId ? ` #${item.targetId}` : ''}`;
      const details = formatDetails(item.details);

      if (
        !matchesFilter('user', user) ||
        !matchesFilter('action', action) ||
        !matchesFilter('actor', actor) ||
        !matchesFilter('target', target)
      ) {
        return false;
      }

      if (!query) {
        return true;
      }

      return [user, action, actor, target, details].join(' ').toLowerCase().includes(query);
    });

    return [...filtered].sort((left, right) => {
      const result = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      return activitySort === 'newest' ? -result : result;
    });
  }, [actions, activityFilters, activitySort, getActivityActionLabel, search, t]);

  const actionFilterOptions = useMemo(() => {
    const unique = (values: string[]) =>
      Array.from(new Set(values)).sort((left, right) => left.localeCompare(right, language));

    return {
      user: unique(
        actions.map((item) => item.userUsername ?? item.actorUsername ?? t('adminUnknownUser')),
      ),
      action: unique(actions.map((item) => getActivityActionLabel(item.action))),
      actor: unique(actions.map((item) => item.actorUsername ?? '-')),
      target: unique(
        actions.map((item) => `${item.targetType}${item.targetId ? ` #${item.targetId}` : ''}`),
      ),
    };
  }, [actions, getActivityActionLabel, language, t]);

  const subscriptionRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return subscriptions;
    }

    return subscriptions.filter((item) =>
      [
        item.username,
        item.planName,
        item.status,
        item.source,
        item.checkoutMode ?? '',
        formatMoney(item.amountCents, item.currency),
      ]
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  }, [search, subscriptions]);

  const errorRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return errors;
    }

    return errors.filter((item) =>
      [
        item.username ?? '',
        item.method,
        item.path,
        String(item.statusCode),
        item.message ?? '',
        item.errorName ?? '',
        formatDetails(item.errorBody),
      ]
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  }, [errors, search]);

  const performanceRangeOptions = useMemo(
    () => [
      { value: 'hour' as const, label: t('monitoringRangeHour') },
      { value: 'day' as const, label: t('monitoringRangeDay') },
      { value: 'week' as const, label: t('monitoringRangeWeek') },
      { value: 'month' as const, label: t('monitoringRangeMonth') },
    ],
    [t],
  );

  const maxBucketCount = useMemo(() => {
    if (!performance) {
      return 1;
    }

    return Math.max(...performance.buckets.map((bucket) => bucket.count), 1);
  }, [performance]);

  const subTabs: Array<{ id: MonitoringSubTab; label: string; icon: ReactNode }> = [
    { id: 'actions', label: t('monitoringTabActions'), icon: <Activity size={14} /> },
    { id: 'subscriptions', label: t('monitoringTabSubscriptions'), icon: <CreditCard size={14} /> },
    { id: 'errors', label: t('monitoringTabErrors'), icon: <AlertTriangle size={14} /> },
    { id: 'performance', label: t('monitoringTabPerformance'), icon: <Gauge size={14} /> },
  ];

  return (
    <div className="admin-monitoring-view">
      <div
        className="monitoring-subtabs stats-subtabs"
        role="tablist"
        aria-label={t('adminMonitoring')}
      >
        {subTabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={subTab === item.id}
            className={`stats-subtabs__item ${
              subTab === item.id ? 'stats-subtabs__item--active' : ''
            }`.trim()}
            onClick={() => {
              setSubTab(item.id);
              setSearch('');
            }}
          >
            <span aria-hidden>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      <div className="monitoring-panel" role="tabpanel">
        {subTab !== 'performance' ? (
          <div className="monitoring-toolbar">
            <label className="admin-search-field monitoring-search">
              <Search size={15} />
              <input
                autoComplete="off"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('search')}
                aria-label={t('monitoringSearch')}
              />
            </label>
          </div>
        ) : (
          <div className="monitoring-toolbar monitoring-toolbar--performance">
            <CustomSelect
              className="stats-range-select monitoring-toolbar__range"
              label={t('monitoringPerformanceRange')}
              value={performanceRange}
              options={performanceRangeOptions}
              onChange={(nextRange) => setPerformanceRange(nextRange)}
            />
          </div>
        )}

        {subTab === 'actions' ? (
          <MonitoringTableShell
            isEmpty={actionRows.length === 0}
            isLoading={isLoading}
            empty={
              <EmptyState
                tone="plain"
                title={isLoading ? t('loading') : t('monitoringNoActions')}
              />
            }
          >
            <table className="activity-table activity-table--monitoring activity-table--monitoring-actions">
            <thead>
              <tr>
                <MonitoringFilterHeader label={t('adminActivityUser')}>
                  <ActivityColumnFilter
                    label={t('adminActivityUser')}
                    emptyLabel={t('adminClearFilter')}
                    options={actionFilterOptions.user}
                    selected={activityFilters.user}
                    onClear={() => clearActivityFilter('user')}
                    onToggle={(value) => toggleActivityFilter('user', value)}
                  />
                </MonitoringFilterHeader>
                <MonitoringFilterHeader label={t('adminActivityDate')}>
                  <button
                    className="activity-table__sort"
                    type="button"
                    aria-label={
                      activitySort === 'newest' ? t('adminSortNewest') : t('adminSortOldest')
                    }
                    onClick={() =>
                      setActivitySort((current) => (current === 'newest' ? 'oldest' : 'newest'))
                    }
                  >
                    <span className="activity-table__sort-icon">
                      <ArrowUpDown size={13} />
                    </span>
                  </button>
                </MonitoringFilterHeader>
                <MonitoringFilterHeader label={t('adminActivityAction')}>
                  <ActivityColumnFilter
                    label={t('adminActivityAction')}
                    emptyLabel={t('adminClearFilter')}
                    options={actionFilterOptions.action}
                    selected={activityFilters.action}
                    onClear={() => clearActivityFilter('action')}
                    onToggle={(value) => toggleActivityFilter('action', value)}
                  />
                </MonitoringFilterHeader>
                <MonitoringFilterHeader label={t('adminActivityActor')}>
                  <ActivityColumnFilter
                    label={t('adminActivityActor')}
                    emptyLabel={t('adminClearFilter')}
                    options={actionFilterOptions.actor}
                    selected={activityFilters.actor}
                    onClear={() => clearActivityFilter('actor')}
                    onToggle={(value) => toggleActivityFilter('actor', value)}
                  />
                </MonitoringFilterHeader>
                <MonitoringFilterHeader label={t('adminActivityTarget')}>
                  <ActivityColumnFilter
                    label={t('adminActivityTarget')}
                    emptyLabel={t('adminClearFilter')}
                    options={actionFilterOptions.target}
                    selected={activityFilters.target}
                    onClear={() => clearActivityFilter('target')}
                    onToggle={(value) => toggleActivityFilter('target', value)}
                  />
                </MonitoringFilterHeader>
                <MonitoringTableHeader label={t('monitoringDetails')} />
              </tr>
            </thead>
            <tbody>
              {actionRows.map((item) => (
                <tr key={item.id}>
                  <td>
                    <TooltipText
                      value={item.userUsername ?? item.actorUsername ?? t('adminUnknownUser')}
                    />
                  </td>
                  <td>
                    <TooltipText value={new Date(item.createdAt).toLocaleString(dateLocale)} />
                  </td>
                  <td>
                    <TooltipText value={getActivityActionLabel(item.action)} />
                  </td>
                  <td>
                    <TooltipText value={item.actorUsername ?? '-'} />
                  </td>
                  <td>
                    <TooltipText
                      value={`${item.targetType}${item.targetId ? ` #${item.targetId}` : ''}`}
                    />
                  </td>
                  <td>
                    <MonitoringDetailsCell value={item.details} />
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </MonitoringTableShell>
        ) : null}

        {subTab === 'subscriptions' ? (
          <MonitoringTableShell
            isEmpty={subscriptionRows.length === 0}
            isLoading={isLoading}
            empty={
              <EmptyState
                tone="plain"
                title={isLoading ? t('loading') : t('monitoringNoSubscriptions')}
              />
            }
          >
            <table className="activity-table activity-table--monitoring activity-table--monitoring-subscriptions">
            <thead>
              <tr>
                <MonitoringTableHeader label={t('adminActivityUser')} />
                <MonitoringTableHeader label={t('adminActivityDate')} />
                <MonitoringTableHeader label={t('monitoringPlan')} />
                <MonitoringTableHeader label={t('monitoringAmount')} />
                <MonitoringTableHeader label={t('monitoringTerm')} />
                <MonitoringTableHeader label={t('monitoringExpiresAt')} />
                <MonitoringTableHeader label={t('monitoringTotalSpent')} />
                <MonitoringTableHeader label={t('monitoringLastPurchase')} />
                <MonitoringTableHeader label={t('monitoringSource')} />
              </tr>
            </thead>
            <tbody>
              {subscriptionRows.map((item) => (
                <tr key={`${item.source}-${item.id}`}>
                  <td>
                    <TooltipText value={item.username} />
                  </td>
                  <td>
                    <TooltipText
                      value={new Date(item.paidAt ?? item.createdAt).toLocaleString(dateLocale)}
                    />
                  </td>
                  <td>
                    <TooltipText value={item.planName} />
                  </td>
                  <td>
                    <TooltipText value={formatMoney(item.amountCents, item.currency)} />
                  </td>
                  <td>
                    <TooltipText
                      value={
                        item.termMonths
                          ? t('monitoringTermMonths').replace('{count}', String(item.termMonths))
                          : '—'
                      }
                    />
                  </td>
                  <td>
                    <TooltipText
                      value={
                        item.expiresAt
                          ? new Date(item.expiresAt).toLocaleString(dateLocale)
                          : t('monitoringLifetime')
                      }
                    />
                  </td>
                  <td>
                    <TooltipText value={formatMoney(item.totalSpentCents, item.currency)} />
                  </td>
                  <td>
                    <TooltipText
                      value={
                        item.lastPurchaseAt
                          ? new Date(item.lastPurchaseAt).toLocaleString(dateLocale)
                          : '—'
                      }
                    />
                  </td>
                  <td>
                    <MonitoringSourceBadge source={item.source} t={t} />
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </MonitoringTableShell>
        ) : null}

        {subTab === 'errors' ? (
          <MonitoringTableShell
            isEmpty={errorRows.length === 0}
            isLoading={isLoading}
            empty={
              <EmptyState
                tone="plain"
                title={isLoading ? t('loading') : t('monitoringNoErrors')}
              />
            }
          >
            <table className="activity-table activity-table--monitoring activity-table--monitoring-errors">
            <thead>
              <tr>
                <MonitoringTableHeader label={t('adminActivityDate')} />
                <MonitoringTableHeader label={t('adminActivityUser')} />
                <MonitoringTableHeader label={t('monitoringMethod')} />
                <MonitoringTableHeader label={t('monitoringPath')} />
                <MonitoringTableHeader label={t('monitoringStatus')} />
                <MonitoringTableHeader label={t('monitoringDuration')} />
                <MonitoringTableHeader label={t('monitoringErrorMessage')} />
                <MonitoringTableHeader label={t('monitoringDetails')} />
              </tr>
            </thead>
            <tbody>
              {errorRows.map((item) => (
                <tr key={item.id}>
                  <td>
                    <TooltipText value={new Date(item.createdAt).toLocaleString(dateLocale)} />
                  </td>
                  <td>
                    <TooltipText value={item.username ?? t('adminUnknownUser')} />
                  </td>
                  <td>
                    <MonitoringMethodBadge method={item.method} />
                  </td>
                  <td>
                    <TooltipText value={item.path} className="monitoring-path-cell" />
                  </td>
                  <td>
                    <MonitoringStatusBadge statusCode={item.statusCode} />
                  </td>
                  <td>
                    <TooltipText value={`${item.durationMs} ms`} />
                  </td>
                  <td>
                    <TooltipText value={item.message ?? item.errorName ?? '—'} />
                  </td>
                  <td>
                    <MonitoringDetailsCell value={item.errorBody} />
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </MonitoringTableShell>
        ) : null}

        {subTab === 'performance' ? (
          <div className="monitoring-performance">
            <div className="monitoring-performance__scroll">
              {performance ? (
                <>
                  <dl className="stats-metric-grid stats-metric-grid--4 monitoring-performance__metrics">
                <div className="stats-metric">
                  <dt>{t('monitoringRequestCount')}</dt>
                  <dd>{performance.requestCount}</dd>
                </div>
                <div className="stats-metric">
                  <dt>{t('monitoringAvgDuration')}</dt>
                  <dd>{performance.avgDurationMs} ms</dd>
                </div>
                <div className="stats-metric">
                  <dt>{t('monitoringMaxDuration')}</dt>
                  <dd>{performance.maxDurationMs} ms</dd>
                </div>
                <div className="stats-metric">
                  <dt>{t('monitoringErrorCount')}</dt>
                  <dd>{performance.errorCount}</dd>
                </div>
                <div className="stats-metric">
                  <dt>{t('monitoringMemoryRss')}</dt>
                  <dd>{performance.process.memoryRssMb} MB</dd>
                </div>
                <div className="stats-metric">
                  <dt>{t('monitoringMemoryHeap')}</dt>
                  <dd>{performance.process.memoryHeapUsedMb} MB</dd>
                </div>
                <div className="stats-metric">
                  <dt>{t('monitoringSystemMemory')}</dt>
                  <dd>
                    {performance.system.freeMemoryMb} / {performance.system.totalMemoryMb} MB
                  </dd>
                </div>
                <div className="stats-metric">
                  <dt>{t('monitoringLoadAvg')}</dt>
                  <dd>
                    {performance.system.loadAvg1} / {performance.system.loadAvg5} /{' '}
                    {performance.system.loadAvg15}
                  </dd>
                </div>
              </dl>

              <section className="stats-chart-card monitoring-performance-chart">
                <header className="stats-chart-card__head">
                  <span>{t('monitoringRequestsOverTime')}</span>
                  <strong>{t('monitoringRequestCount')}</strong>
                </header>
                <div className="stats-bars stats-bars--spacious monitoring-performance-chart__bars">
                  {performance.buckets.map((bucket) => (
                    <div className="stats-bars__row" key={bucket.label}>
                      <span title={new Date(bucket.label).toLocaleString(dateLocale)}>
                        {formatBucketLabel(bucket.label, performanceRange, dateLocale)}
                      </span>
                      <i aria-hidden="true">
                        <b
                          style={{
                            width: `${Math.max(6, Math.round((bucket.count / maxBucketCount) * 100))}%`,
                          }}
                        />
                      </i>
                      <em>{bucket.count}</em>
                    </div>
                  ))}
                </div>
              </section>

              <section className="stats-chart-card monitoring-performance-chart">
                <header className="stats-chart-card__head">
                  <span>{t('monitoringAvgDurationOverTime')}</span>
                  <strong>{t('monitoringAvgDuration')}</strong>
                </header>
                <div className="stats-bars stats-bars--spacious monitoring-performance-chart__bars">
                  {performance.buckets.map((bucket) => {
                    const width = performance.maxDurationMs
                      ? Math.max(6, Math.round((bucket.avgDurationMs / performance.maxDurationMs) * 100))
                      : 0;

                    return (
                      <div className="stats-bars__row" key={`${bucket.label}-duration`}>
                        <span title={new Date(bucket.label).toLocaleString(dateLocale)}>
                          {formatBucketLabel(bucket.label, performanceRange, dateLocale)}
                        </span>
                        <i aria-hidden="true">
                          <b style={{ width: `${width}%` }} />
                        </i>
                        <em>{bucket.avgDurationMs} ms</em>
                      </div>
                    );
                  })}
                </div>
              </section>
                </>
              ) : (
                <EmptyState
                  tone="plain"
                  title={isLoading ? t('loading') : t('monitoringNoPerformance')}
                />
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
