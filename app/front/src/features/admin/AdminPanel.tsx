import {
  ArrowUpDown,
  BarChart3,
  History,
  Menu,
  RefreshCw,
  Search,
  UserPlus,
  UsersRound,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { adminApi } from '../../api';
import { IconButton } from '../../components/IconButton';
import { TooltipText } from '../../components/TooltipText';
import type { Translator } from '../../i18n';
import type {
  ActivityLog,
  AdminStats,
  AdminStatsRange,
  AdminUser,
  CreateAdminUserPayload,
  UpdateAdminUserPayload,
  UserLanguage,
} from '../../types';
import { useHorizontalWheel } from '../../utils/horizontalWheel';
import { ActivityColumnFilter } from './ActivityColumnFilter';
import {
  emptyActivityFilters,
  type ActivityFilterKey,
  type ActivityFilters,
  type ActivitySort,
} from './adminFilters';
import { AdminCreateUserModal } from './AdminCreateUserModal';
import { AdminStatsView } from './AdminStatsView';
import { AdminUserCard } from './AdminUserCard';

type AdminTab = 'users' | 'activity' | 'stats';

interface AdminPanelProps {
  currentUserId: number;
  t: Translator;
  language: UserLanguage;
  onOpenSidebar: () => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

const emptyCreateForm: CreateAdminUserPayload = {
  username: '',
  password: '',
  role: 'user',
};

export function AdminPanel({
  currentUserId,
  t,
  language,
  onOpenSidebar,
  onError,
  onSuccess,
}: AdminPanelProps) {
  const [tab, setTab] = useState<AdminTab>('users');
  const tabsRef = useHorizontalWheel<HTMLDivElement>();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [activity, setActivity] = useState<ActivityLog[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [activityRange, setActivityRange] = useState<AdminStatsRange>('week');
  const [createForm, setCreateForm] = useState<CreateAdminUserPayload>(emptyCreateForm);
  const [drafts, setDrafts] = useState<Record<number, UpdateAdminUserPayload>>({});
  const [userSearch, setUserSearch] = useState('');
  const [activitySearch, setActivitySearch] = useState('');
  const [activitySort, setActivitySort] = useState<ActivitySort>('newest');
  const [activityFilters, setActivityFilters] = useState<ActivityFilters>(emptyActivityFilters);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const dateLocale = language === 'ru' ? 'ru-RU' : 'en-US';
  const roleOptions = useMemo(
    () => [
      { value: 'user' as const, label: t('roleUser') },
      { value: 'admin' as const, label: t('roleAdmin') },
    ],
    [t],
  );
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
        case 'admin.user.create':
          return t('actionAdminUserCreate');
        case 'admin.user.update':
          return t('actionAdminUserUpdate');
        case 'admin.user.delete':
          return t('actionAdminUserDelete');
        default:
          return action;
      }
    },
    [t],
  );

  const loadAdminData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [nextUsers, nextActivity, nextStats] = await Promise.all([
        adminApi.listUsers(),
        adminApi.listActivity(),
        adminApi.getStats(activityRange),
      ]);
      setUsers(nextUsers);
      setActivity(nextActivity);
      setStats(nextStats);
      setDrafts(
        Object.fromEntries(
          nextUsers.map((user) => [
            user.id,
            {
              role: user.role,
              password: '',
            },
          ]),
        ),
      );
    } catch {
      onError(t('adminLoadError'));
    } finally {
      setIsLoading(false);
    }
  }, [activityRange, onError, t]);

  useEffect(() => {
    void loadAdminData();
  }, [loadAdminData]);

  const createUser = () => {
    if (!createForm.username.trim() || !createForm.password.trim()) {
      onError(t('adminFillUser'));
      return;
    }

    adminApi
      .createUser(createForm)
      .then(() => {
        setCreateForm(emptyCreateForm);
        setIsCreateOpen(false);
        onSuccess(t('adminUserSaved'));
        return loadAdminData();
      })
      .catch(() => onError(t('adminSaveError')));
  };

  const updateUser = (userId: number) => {
    const draft = drafts[userId];
    const user = users.find((currentUser) => currentUser.id === userId);
    if (!draft || !user) {
      return;
    }

    const payload: UpdateAdminUserPayload = {
      role: draft.role ?? user.role,
      ...(draft.password?.trim() ? { password: draft.password.trim() } : {}),
    };

    adminApi
      .updateUser(userId, payload)
      .then(() => {
        onSuccess(t('adminUserSaved'));
        return loadAdminData();
      })
      .catch(() => onError(t('adminSaveError')));
  };

  const deleteUser = (userId: number) => {
    adminApi
      .deleteUser(userId)
      .then(() => {
        onSuccess(t('adminUserDeleted'));
        return loadAdminData();
      })
      .catch(() => onError(t('adminDeleteError')));
  };
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

  const visibleUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();

    if (!query) {
      return users;
    }

    return users.filter((user) => user.username.toLowerCase().includes(query));
  }, [userSearch, users]);
  const activityRows = useMemo(() => {
    const query = activitySearch.trim().toLowerCase();
    const matchesFilter = (key: ActivityFilterKey, value: string) =>
      activityFilters[key].length === 0 || activityFilters[key].includes(value);
    const filtered = activity.filter((item) => {
      const user = item.userUsername ?? item.actorUsername ?? t('adminUnknownUser');
      const action = getActivityActionLabel(item.action);
      const actor = item.actorUsername ?? '-';
      const target = `${item.targetType}${item.targetId ? ` #${item.targetId}` : ''}`;

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

      const values = [user, action, actor, target];

      return values.join(' ').toLowerCase().includes(query);
    });
    return [...filtered].sort((left, right) => {
      const result = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();

      return activitySort === 'newest' ? -result : result;
    });
  }, [activity, activityFilters, activitySearch, activitySort, getActivityActionLabel, t]);
  const activityFilterOptions = useMemo(() => {
    const unique = (values: string[]) =>
      Array.from(new Set(values)).sort((left, right) => left.localeCompare(right, language));

    return {
      user: unique(
        activity.map((item) => item.userUsername ?? item.actorUsername ?? t('adminUnknownUser')),
      ),
      action: unique(activity.map((item) => getActivityActionLabel(item.action))),
      actor: unique(activity.map((item) => item.actorUsername ?? '-')),
      target: unique(
        activity.map((item) => `${item.targetType}${item.targetId ? ` #${item.targetId}` : ''}`),
      ),
    };
  }, [activity, getActivityActionLabel, language, t]);
  const changeCreateForm = useCallback((patch: Partial<CreateAdminUserPayload>) => {
    setCreateForm((current) => ({ ...current, ...patch }));
  }, []);
  const changeUserDraft = useCallback((userId: number, patch: UpdateAdminUserPayload) => {
    setDrafts((current) => ({ ...current, [userId]: { ...current[userId], ...patch } }));
  }, []);

  return (
    <section className="admin-panel">
      <header className="admin-panel__head">
        <div className="admin-panel__title-row">
          <h2>{t('adminPanel')}</h2>
        </div>
        <div className="admin-panel__actions">
          <IconButton
            label={t('menu')}
            icon={<Menu size={17} />}
            onClick={onOpenSidebar}
            className="admin-panel__menu"
          />
          <IconButton
            label={t('refresh')}
            icon={<RefreshCw size={16} />}
            onClick={() => void loadAdminData()}
            disabled={isLoading}
          />
        </div>
      </header>

      <div ref={tabsRef} className="admin-tabs">
        <button
          className={
            tab === 'users' ? 'admin-tabs__item admin-tabs__item--active' : 'admin-tabs__item'
          }
          onClick={() => setTab('users')}
        >
          <UsersRound size={15} /> {t('adminUsers')}
        </button>
        <button
          className={
            tab === 'activity' ? 'admin-tabs__item admin-tabs__item--active' : 'admin-tabs__item'
          }
          onClick={() => setTab('activity')}
        >
          <History size={15} /> {t('adminActivity')}
        </button>
        <button
          className={
            tab === 'stats' ? 'admin-tabs__item admin-tabs__item--active' : 'admin-tabs__item'
          }
          onClick={() => setTab('stats')}
        >
          <BarChart3 size={15} /> {t('adminStats')}
        </button>
      </div>

      {tab === 'users' ? (
        <div className="admin-users-view">
          <div className="admin-users-toolbar">
            <label className="admin-search-field">
              <Search size={15} />
              <input
                value={userSearch}
                onChange={(event) => setUserSearch(event.target.value)}
                placeholder={t('search')}
                aria-label={t('adminSearchUsers')}
              />
            </label>
            <IconButton
              label={t('adminCreateUser')}
              icon={<UserPlus size={16} />}
              variant="primary"
              onClick={() => setIsCreateOpen(true)}
            />
          </div>

          <div className="admin-user-list">
            {visibleUsers.map((user) => (
              <AdminUserCard
                currentUserId={currentUserId}
                draft={drafts[user.id] ?? {}}
                key={user.id}
                roleOptions={roleOptions}
                t={t}
                user={user}
                onDelete={deleteUser}
                onDraftChange={changeUserDraft}
                onSave={updateUser}
              />
            ))}
            {visibleUsers.length === 0 ? (
              <div className="empty-state">{t('adminNoUsers')}</div>
            ) : null}
          </div>
        </div>
      ) : null}

      <AdminCreateUserModal
        form={createForm}
        isOpen={isCreateOpen}
        roleOptions={roleOptions}
        t={t}
        onClose={() => setIsCreateOpen(false)}
        onFormChange={changeCreateForm}
        onSubmit={createUser}
      />

      {tab === 'activity' ? (
        <div className="admin-activity-view">
          <div className="admin-filter-bar admin-filter-bar--activity">
            <label className="admin-search-field">
              <Search size={15} />
              <input
                value={activitySearch}
                onChange={(event) => setActivitySearch(event.target.value)}
                placeholder={t('search')}
                aria-label={t('adminSearchActivity')}
              />
            </label>
          </div>

          <div className="activity-table-wrap">
            <table className="activity-table">
              <thead>
                <tr>
                  <th>
                    <div className="activity-table__head-cell">
                      <span>{t('adminActivityUser')}</span>
                      <ActivityColumnFilter
                        label={t('adminActivityUser')}
                        emptyLabel={t('adminClearFilter')}
                        options={activityFilterOptions.user}
                        selected={activityFilters.user}
                        onClear={() => clearActivityFilter('user')}
                        onToggle={(value) => toggleActivityFilter('user', value)}
                      />
                    </div>
                  </th>
                  <th>
                    <div className="activity-table__head-cell">
                      <span>{t('adminActivityDate')}</span>
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
                    </div>
                  </th>
                  <th>
                    <div className="activity-table__head-cell">
                      <span>{t('adminActivityAction')}</span>
                      <ActivityColumnFilter
                        label={t('adminActivityAction')}
                        emptyLabel={t('adminClearFilter')}
                        options={activityFilterOptions.action}
                        selected={activityFilters.action}
                        onClear={() => clearActivityFilter('action')}
                        onToggle={(value) => toggleActivityFilter('action', value)}
                      />
                    </div>
                  </th>
                  <th>
                    <div className="activity-table__head-cell">
                      <span>{t('adminActivityActor')}</span>
                      <ActivityColumnFilter
                        label={t('adminActivityActor')}
                        emptyLabel={t('adminClearFilter')}
                        options={activityFilterOptions.actor}
                        selected={activityFilters.actor}
                        onClear={() => clearActivityFilter('actor')}
                        onToggle={(value) => toggleActivityFilter('actor', value)}
                      />
                    </div>
                  </th>
                  <th>
                    <div className="activity-table__head-cell">
                      <span>{t('adminActivityTarget')}</span>
                      <ActivityColumnFilter
                        label={t('adminActivityTarget')}
                        emptyLabel={t('adminClearFilter')}
                        options={activityFilterOptions.target}
                        selected={activityFilters.target}
                        onClear={() => clearActivityFilter('target')}
                        onToggle={(value) => toggleActivityFilter('target', value)}
                      />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {activityRows.map((item) => (
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
                  </tr>
                ))}
              </tbody>
            </table>
            {activityRows.length === 0 ? (
              <div className="empty-state">{t('adminNoActivity')}</div>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === 'stats' ? (
        <AdminStatsView
          activityRange={activityRange}
          language={language}
          stats={stats}
          t={t}
          onActivityRangeChange={setActivityRange}
        />
      ) : null}
    </section>
  );
}
