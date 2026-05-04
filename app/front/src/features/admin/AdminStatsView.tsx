import { FileX2, Gauge, HardDrive, Link2, UsersRound } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useCallback, useMemo } from 'react';

import { CustomSelect } from '../../components/CustomSelect';
import { TooltipText } from '../../components/TooltipText';
import type { Translator } from '../../i18n';
import type { AdminStats, AdminStatsRange, UserLanguage } from '../../types';
import { formatFileSize } from '../../utils/files';

type StatTone = 'blue' | 'cyan' | 'amber' | 'rose' | 'violet';

interface AdminStatsViewProps {
  stats: AdminStats | null;
  activityRange: AdminStatsRange;
  language: UserLanguage;
  t: Translator;
  onActivityRangeChange: (range: AdminStatsRange) => void;
}

export function AdminStatsView({
  stats,
  activityRange,
  language,
  t,
  onActivityRangeChange,
}: AdminStatsViewProps) {
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
  const statsDerived = useMemo(() => {
    if (!stats) {
      return null;
    }

    const volumeRows = [
      { label: t('adminNotes'), value: stats.notesTotal },
      { label: t('adminEvents'), value: stats.activityTotal },
      { label: t('adminFiles'), value: stats.attachmentsTotal },
      { label: t('adminVersions'), value: stats.noteVersionsTotal },
      { label: t('adminActiveLinks'), value: stats.shareLinksActiveTotal },
    ];
    const maxVolume = Math.max(...volumeRows.map((item) => item.value), 1);
    const maxActivity = Math.max(...stats.activityByDay.map((day) => day.total), 1);
    const maxStorage = Math.max(...stats.topStorageUsers.map((user) => user.storageBytes), 1);
    const maxUserActivity = Math.max(...stats.topActivityUsers.map((user) => user.eventsTotal), 1);

    return {
      maxActivity,
      maxStorage,
      maxUserActivity,
      volumeRows: volumeRows.map((item) => ({
        ...item,
        width: `${Math.max(4, Math.round((item.value / maxVolume) * 100))}%`,
      })),
    };
  }, [stats, t]);
  const getActivityDayLabel = useCallback(
    (date: string) => {
      if (/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(date)) {
        return new Intl.DateTimeFormat(dateLocale, {
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(`${date}:00:00.000Z`));
      }

      if (/^\d{4}-\d{2}$/.test(date)) {
        return new Intl.DateTimeFormat(dateLocale, {
          month: 'short',
        }).format(new Date(`${date}-01T00:00:00.000Z`));
      }

      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return new Intl.DateTimeFormat(dateLocale, {
          day: '2-digit',
          month: '2-digit',
        }).format(new Date(`${date}T00:00:00.000Z`));
      }

      return date;
    },
    [dateLocale],
  );
  const getFileTypeLabel = useCallback(
    (type: string) => {
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
    },
    [t],
  );

  return (
    <div className="stats-view">
      <div className="stats-grid">
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
      {stats && statsDerived ? (
        <div className="stats-analytics">
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
              className="stats-activity-chart"
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
                            Math.round((day.total / statsDerived.maxActivity) * 100),
                          )}%`,
                        } as CSSProperties
                      }
                    />
                  </div>
                  <span>{getActivityDayLabel(day.date)}</span>
                  <strong>{day.total}</strong>
                </div>
              ))}
            </div>
            <div className="stats-density">
              <span>
                {t('actionAuthLogin')}:{' '}
                {stats.activityByDay.reduce((sum, day) => sum + day.login, 0)}
              </span>
              <span>
                {t('adminNotes')}: {stats.activityByDay.reduce((sum, day) => sum + day.notes, 0)}
              </span>
              <span>
                {t('adminAdmins')}: {stats.activityByDay.reduce((sum, day) => sum + day.admin, 0)}
              </span>
            </div>
          </section>
          <section className="stats-chart-card stats-chart-card--wide">
            <header className="stats-chart-card__head">
              <span>{t('adminWorkload')}</span>
              <strong>{t('adminVolume')}</strong>
            </header>
            <div className="stats-bars">
              {statsDerived.volumeRows.map((item) => (
                <label key={item.label}>
                  <span>{item.label}</span>
                  <i>
                    <b style={{ width: item.width }} />
                  </i>
                  <em>{item.value}</em>
                </label>
              ))}
            </div>
          </section>
          <section className="stats-chart-card stats-chart-card--wide">
            <header className="stats-chart-card__head">
              <span>{t('adminFileMemory')}</span>
              <strong>{formatFileSize(stats.attachmentsStorageBytes)}</strong>
            </header>
            <div className="stats-storage-grid">
              <span>
                <b>{formatFileSize(stats.averageAttachmentBytes)}</b>
                {t('adminAverageFile')}
              </span>
              <span>
                <b>{formatFileSize(stats.largestAttachmentBytes)}</b>
                {t('adminLargestFile')}
              </span>
              <span>
                <b>{stats.notesWithAttachmentsTotal}</b>
                {t('adminNotesWithFiles')}
              </span>
              <span>
                <b>{formatFileSize(stats.orphanAttachmentsBytes)}</b>
                {t('adminDetachedStorage')}
              </span>
            </div>
            <div className="stats-file-types">
              {stats.fileTypes.map((item) => (
                <span key={item.type}>
                  {getFileTypeLabel(item.type)}
                  <b>{formatFileSize(item.storageBytes)}</b>
                </span>
              ))}
            </div>
          </section>
          <section className="stats-chart-card stats-chart-card--wide">
            <header className="stats-chart-card__head">
              <span>{t('adminTopStorageUsers')}</span>
              <strong>{t('adminFiles')}</strong>
            </header>
            <div className="stats-rank-list">
              {stats.topStorageUsers.map((user) => (
                <label key={user.username}>
                  <TooltipText value={user.username} />
                  <i>
                    <b
                      style={{
                        width: `${Math.max(
                          4,
                          Math.round((user.storageBytes / statsDerived.maxStorage) * 100),
                        )}%`,
                      }}
                    />
                  </i>
                  <em>
                    {user.filesTotal} / {formatFileSize(user.storageBytes)}
                  </em>
                </label>
              ))}
            </div>
          </section>
          <section className="stats-chart-card stats-chart-card--wide">
            <header className="stats-chart-card__head">
              <span>{t('adminTopActivityUsers')}</span>
              <strong>{t('adminEvents')}</strong>
            </header>
            <div className="stats-rank-list">
              {stats.topActivityUsers.map((user) => (
                <label key={user.username}>
                  <TooltipText value={user.username} />
                  <i>
                    <b
                      style={{
                        width: `${Math.max(
                          4,
                          Math.round((user.eventsTotal / statsDerived.maxUserActivity) * 100),
                        )}%`,
                      }}
                    />
                  </i>
                  <em>{user.eventsTotal}</em>
                </label>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
