import { Activity, ArrowDownUp, BarChart3, Check, History, KeyRound, ListFilter, Menu, NotebookText, RefreshCw, Save, Search, Shield, Trash2, UserPlus, UsersRound, Zap } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { adminApi } from '../../api';
import { CustomSelect } from '../../components/CustomSelect';
import { IconButton } from '../../components/IconButton';
import { Modal } from '../../components/Modal';
import { TooltipText } from '../../components/TooltipText';
import type { Translator } from '../../i18n';
import type { ActivityLog, AdminStats, AdminUser, CreateAdminUserPayload, UpdateAdminUserPayload, UserLanguage, UserRole } from '../../types';

type AdminTab = 'users' | 'activity' | 'stats';
type ActivitySort = 'newest' | 'oldest';
type ActivityFilterKey = 'user' | 'action' | 'actor' | 'target';
type ActivityFilters = Record<ActivityFilterKey, string[]>;

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

const emptyActivityFilters: ActivityFilters = {
  user: [],
  action: [],
  actor: [],
  target: [],
};

interface ActivityColumnFilterProps {
  label: string;
  emptyLabel: string;
  options: string[];
  selected: string[];
  onClear: () => void;
  onToggle: (value: string) => void;
}

function ActivityColumnFilter({ label, emptyLabel, options, selected, onClear, onToggle }: ActivityColumnFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const updatePosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) {
      return;
    }

    const rect = button.getBoundingClientRect();
    const menuWidth = 218;
    setMenuStyle({
      left: Math.min(Math.max(rect.right - menuWidth, 10), window.innerWidth - menuWidth - 10),
      top: rect.bottom + 6,
      width: menuWidth,
      maxHeight: Math.max(140, Math.min(300, window.innerHeight - rect.bottom - 16)),
    });
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }

    updatePosition();
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', closeOnOutside);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, updatePosition]);

  return (
    <>
      <button
        className={`activity-table__filter ${selected.length > 0 ? 'activity-table__filter--active' : ''}`}
        type="button"
        aria-label={label}
        aria-expanded={isOpen}
        ref={buttonRef}
        onClick={() => setIsOpen((current) => !current)}
      >
        <ListFilter size={13} />
        {selected.length > 0 ? <span>{selected.length}</span> : null}
      </button>
      {isOpen
        ? createPortal(
            <div className="activity-filter-menu" ref={menuRef} style={menuStyle}>
              <div className="activity-filter-menu__head">
                <div>
                  <ListFilter size={13} />
                  <span>{label}</span>
                </div>
                {selected.length > 0 ? (
                  <button type="button" onClick={onClear}>
                    {emptyLabel}
                  </button>
                ) : null}
              </div>
              <div className="activity-filter-menu__options">
                {options.length > 0 ? (
                  options.map((option) => {
                    const isSelected = selectedSet.has(option);

                    return (
                      <button
                        className={isSelected ? 'activity-filter-menu__option activity-filter-menu__option--selected' : 'activity-filter-menu__option'}
                        type="button"
                        key={option}
                        onClick={() => onToggle(option)}
                      >
                        <TooltipText value={option} />
                        {isSelected ? <Check size={13} /> : <i />}
                      </button>
                    );
                  })
                ) : (
                  <span className="activity-filter-menu__empty">{emptyLabel}</span>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export function AdminPanel({ currentUserId, t, language, onOpenSidebar, onError, onSuccess }: AdminPanelProps) {
  const [tab, setTab] = useState<AdminTab>('users');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [activity, setActivity] = useState<ActivityLog[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
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
        adminApi.getStats(),
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
  }, [onError, t]);

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
      const nextSelected = selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value];

      return { ...current, [key]: nextSelected };
    });
  };
  const clearActivityFilter = (key: ActivityFilterKey) => {
    setActivityFilters((current) => ({ ...current, [key]: [] }));
  };

  const statItems = useMemo(
    () =>
      stats
        ? [
            { icon: <UsersRound size={17} />, label: t('adminUsers'), tone: 'blue', value: stats.usersTotal },
            { icon: <Shield size={17} />, label: t('adminAdmins'), tone: 'violet', value: stats.adminsTotal },
            { icon: <NotebookText size={17} />, label: t('adminNotes'), tone: 'cyan', value: stats.notesTotal },
            { icon: <Activity size={17} />, label: t('adminEvents'), tone: 'amber', value: stats.activityTotal },
            { icon: <Zap size={17} />, label: t('adminActiveToday'), tone: 'rose', value: stats.activeUsersToday },
          ]
        : [],
    [stats, t],
  );
  const visibleUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();

    if (!query) {
      return users;
    }

    return users.filter((user) => user.username.toLowerCase().includes(query));
  }, [userSearch, users]);
  const activityRows = useMemo(() => {
    const query = activitySearch.trim().toLowerCase();
    const matchesFilter = (key: ActivityFilterKey, value: string) => activityFilters[key].length === 0 || activityFilters[key].includes(value);
    const filtered = activity.filter((item) => {
      const user = item.userUsername ?? item.actorUsername ?? t('adminUnknownUser');
      const action = getActivityActionLabel(item.action);
      const actor = item.actorUsername ?? '-';
      const target = `${item.targetType}${item.targetId ? ` #${item.targetId}` : ''}`;

      if (!matchesFilter('user', user) || !matchesFilter('action', action) || !matchesFilter('actor', actor) || !matchesFilter('target', target)) {
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
    const unique = (values: string[]) => Array.from(new Set(values)).sort((left, right) => left.localeCompare(right, language));

    return {
      user: unique(activity.map((item) => item.userUsername ?? item.actorUsername ?? t('adminUnknownUser'))),
      action: unique(activity.map((item) => getActivityActionLabel(item.action))),
      actor: unique(activity.map((item) => item.actorUsername ?? '-')),
      target: unique(activity.map((item) => `${item.targetType}${item.targetId ? ` #${item.targetId}` : ''}`)),
    };
  }, [activity, getActivityActionLabel, language, t]);
  const statsDerived = useMemo(() => {
    if (!stats) {
      return null;
    }

    const usersTotal = Math.max(stats.usersTotal, 1);
    const maxVolume = Math.max(stats.notesTotal, stats.activityTotal, 1);

    return {
      adminPercent: Math.round((stats.adminsTotal / usersTotal) * 100),
      activePercent: Math.round((stats.activeUsersToday / usersTotal) * 100),
      notesPerUser: stats.usersTotal > 0 ? (stats.notesTotal / stats.usersTotal).toFixed(1) : '0',
      eventsPerUser: stats.usersTotal > 0 ? (stats.activityTotal / stats.usersTotal).toFixed(1) : '0',
      notesWidth: `${Math.max(4, Math.round((stats.notesTotal / maxVolume) * 100))}%`,
      eventsWidth: `${Math.max(4, Math.round((stats.activityTotal / maxVolume) * 100))}%`,
    };
  }, [stats]);
  const getInitial = (username: string) => username.trim().slice(0, 1).toUpperCase() || 'U';

  return (
    <section className="admin-panel">
      <header className="admin-panel__head">
        <div className="admin-panel__title-row">
          <h2>{t('adminPanel')}</h2>
        </div>
        <div className="admin-panel__actions">
          <IconButton label={t('menu')} icon={<Menu size={17} />} onClick={onOpenSidebar} className="admin-panel__menu" />
          <IconButton label={t('refresh')} icon={<RefreshCw size={16} />} onClick={() => void loadAdminData()} disabled={isLoading} />
        </div>
      </header>

      <div className="admin-tabs">
        <button className={tab === 'users' ? 'admin-tabs__item admin-tabs__item--active' : 'admin-tabs__item'} onClick={() => setTab('users')}>
          <UsersRound size={15} /> {t('adminUsers')}
        </button>
        <button className={tab === 'activity' ? 'admin-tabs__item admin-tabs__item--active' : 'admin-tabs__item'} onClick={() => setTab('activity')}>
          <History size={15} /> {t('adminActivity')}
        </button>
        <button className={tab === 'stats' ? 'admin-tabs__item admin-tabs__item--active' : 'admin-tabs__item'} onClick={() => setTab('stats')}>
          <BarChart3 size={15} /> {t('adminStats')}
        </button>
      </div>

      {tab === 'users' ? (
        <div className="admin-users-view">
          <div className="admin-users-toolbar">
            <label className="admin-search-field">
              <Search size={15} />
              <input value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder={t('search')} aria-label={t('adminSearchUsers')} />
            </label>
            <IconButton label={t('adminCreateUser')} icon={<UserPlus size={16} />} variant="primary" onClick={() => setIsCreateOpen(true)} />
          </div>

          <div className="admin-user-list">
            {visibleUsers.map((user) => {
              const draft = drafts[user.id] ?? {};
              return (
                <article className={`admin-user-card ${user.id === currentUserId ? 'admin-user-card--self' : ''}`} key={user.id}>
                  <div className="admin-user-card__profile">
                    <span className="admin-user-card__avatar">{getInitial(user.username)}</span>
                    <div className="admin-user-card__identity">
                      <TooltipText value={user.username} className="admin-user-card__name-static" />
                    </div>
                  </div>

                  <div className="admin-user-card__edit-group">
                    <label className="admin-user-card__role-field">
                      <Shield size={14} />
                      <CustomSelect
                        className="admin-user-card__role"
                        label={t('role')}
                        value={(draft.role ?? user.role) as UserRole}
                        options={roleOptions}
                        onChange={(nextRole) => setDrafts((current) => ({ ...current, [user.id]: { ...current[user.id], role: nextRole } }))}
                      />
                    </label>

                    <label className="admin-user-card__password">
                      <KeyRound size={14} />
                      <input
                        value={draft.password ?? ''}
                        onChange={(event) => setDrafts((current) => ({ ...current, [user.id]: { ...current[user.id], password: event.target.value } }))}
                        placeholder={t('adminNewPassword')}
                        type="password"
                        aria-label={t('adminNewPassword')}
                      />
                    </label>
                  </div>

                  <div className="admin-user-card__actions">
                    <IconButton label={t('save')} icon={<Save size={16} />} variant="primary" onClick={() => updateUser(user.id)} />
                    <IconButton
                      label={t('delete')}
                      icon={<Trash2 size={16} />}
                      variant="danger"
                      onClick={() => deleteUser(user.id)}
                      disabled={user.id === currentUserId}
                    />
                  </div>
                </article>
              );
            })}
            {visibleUsers.length === 0 ? <div className="empty-state">{t('adminNoUsers')}</div> : null}
          </div>
        </div>
      ) : null}

      <Modal isOpen={isCreateOpen} title={t('adminCreateUser')} closeLabel={t('close')} onClose={() => setIsCreateOpen(false)}>
        <div className="modal-form admin-create-modal">
          <label className="field-shell">
            <UsersRound size={15} />
            <input
              value={createForm.username}
              onChange={(event) => setCreateForm((current) => ({ ...current, username: event.target.value }))}
              placeholder={t('username')}
              aria-label={t('username')}
            />
          </label>
          <label className="field-shell">
            <KeyRound size={15} />
            <input
              value={createForm.password}
              onChange={(event) => setCreateForm((current) => ({ ...current, password: event.target.value }))}
              placeholder={t('password')}
              type="password"
              aria-label={t('password')}
            />
          </label>
          <label className="admin-create-modal__role">
            <Shield size={15} />
            <CustomSelect label={t('role')} value={createForm.role ?? 'user'} options={roleOptions} onChange={(nextRole) => setCreateForm((current) => ({ ...current, role: nextRole }))} />
          </label>
          <div className="modal-actions">
            <IconButton label={t('adminCreateUser')} icon={<UserPlus size={16} />} variant="primary" onClick={createUser} />
          </div>
        </div>
      </Modal>

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
                        aria-label={activitySort === 'newest' ? t('adminSortNewest') : t('adminSortOldest')}
                        onClick={() => setActivitySort((current) => (current === 'newest' ? 'oldest' : 'newest'))}
                      >
                        <ArrowDownUp size={13} />
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
                      <TooltipText value={item.userUsername ?? item.actorUsername ?? t('adminUnknownUser')} />
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
                      <TooltipText value={`${item.targetType}${item.targetId ? ` #${item.targetId}` : ''}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {activityRows.length === 0 ? <div className="empty-state">{t('adminNoActivity')}</div> : null}
          </div>
        </div>
      ) : null}

      {tab === 'stats' ? (
        <div className="stats-view">
          <div className="stats-grid">
            {statItems.map(({ icon, label, tone, value }) => (
              <div className={`stat-tile stat-tile--${tone}`} key={label}>
                <div className="stat-tile__head">
                  <span className="stat-tile__icon">{icon}</span>
                  <span className="stat-tile__label">{label}</span>
                </div>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          {stats && statsDerived ? (
            <div className="stats-analytics">
              <section className="stats-chart-card">
                <div>
                  <span>{t('adminRoleShare')}</span>
                  <strong>{statsDerived.adminPercent}%</strong>
                </div>
                <div className="stats-donut" style={{ '--chart-value': `${statsDerived.adminPercent}%` } as CSSProperties}>
                  <span>{stats.adminsTotal}/{stats.usersTotal}</span>
                </div>
              </section>
              <section className="stats-chart-card">
                <div>
                  <span>{t('adminActiveShare')}</span>
                  <strong>{statsDerived.activePercent}%</strong>
                </div>
                <div className="stats-bar">
                  <span style={{ width: `${Math.max(4, statsDerived.activePercent)}%` }} />
                </div>
              </section>
              <section className="stats-chart-card stats-chart-card--wide">
                <div>
                  <span>{t('adminWorkload')}</span>
                  <strong>{t('adminVolume')}</strong>
                </div>
                <div className="stats-bars">
                  <label>
                    <span>{t('adminNotes')}</span>
                    <i>
                      <b style={{ width: statsDerived.notesWidth }} />
                    </i>
                    <em>{stats.notesTotal}</em>
                  </label>
                  <label>
                    <span>{t('adminEvents')}</span>
                    <i>
                      <b style={{ width: statsDerived.eventsWidth }} />
                    </i>
                    <em>{stats.activityTotal}</em>
                  </label>
                </div>
                <div className="stats-density">
                  <span>{t('adminNotesPerUser')}: {statsDerived.notesPerUser}</span>
                  <span>{t('adminEventsPerUser')}: {statsDerived.eventsPerUser}</span>
                </div>
              </section>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
