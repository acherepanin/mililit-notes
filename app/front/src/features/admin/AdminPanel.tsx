import {
  BarChart3,
  Bot,
  CreditCard,
  Menu,
  Radar,
  RefreshCw,
  Search,
  UserPlus,
  UsersRound,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, Navigate, useParams } from 'react-router-dom';

import { adminApi } from '../../api';
import { useConfirmDelete } from '../../components/deleteConfirmation';
import { EmptyState } from '../../components/EmptyState';
import { IconButton } from '../../components/IconButton';
import type { Translator } from '../../i18n';
import type {
  AdminStats,
  AdminStatsRange,
  AdminUser,
  CreateAdminUserPayload,
  SubscriptionPlan,
  UpdateAdminUserPayload,
  UserLanguage,
} from '../../types';
import { useHorizontalWheel } from '../../utils/horizontalWheel';
import { AdminCreateUserModal } from './AdminCreateUserModal';
import { AdminIntegrationsPanel } from './AdminIntegrationsPanel';
import { AdminMonitoringView } from './AdminMonitoringView';
import { AdminStatsView } from './AdminStatsView';
import { AdminSubscriptionsPanel } from './AdminSubscriptionsPanel';
import { AdminUserCard } from './AdminUserCard';
import { ADMIN_REFRESH_TABS, parseAdminTab } from './adminTabs';

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
  email: '',
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
  const confirmDelete = useConfirmDelete();
  const { tab: tabParam } = useParams<{ tab: string }>();
  const tab = parseAdminTab(tabParam);
  const tabsRef = useHorizontalWheel<HTMLDivElement>();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [activityRange, setActivityRange] = useState<AdminStatsRange>('week');
  const [monitoringReloadKey, setMonitoringReloadKey] = useState(0);
  const [createForm, setCreateForm] = useState<CreateAdminUserPayload>(emptyCreateForm);
  const [drafts, setDrafts] = useState<Record<number, UpdateAdminUserPayload>>({});
  const [userSearch, setUserSearch] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const roleOptions = useMemo(
    () => [
      { value: 'user' as const, label: t('roleUser') },
      { value: 'admin' as const, label: t('roleAdmin') },
    ],
    [t],
  );
  const [reloadKey, setReloadKey] = useState(0);
  // Перезагрузка данных админки: триггерит эффект ниже, увеличивая ключ.
  const reloadAdminData = () => setReloadKey((current) => current + 1);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    void (async () => {
      try {
        const [nextUsers, nextStats, nextPlans] = await Promise.all([
          adminApi.listUsers(),
          adminApi.getStats(activityRange),
          adminApi.listSubscriptionPlans(),
        ]);
        if (cancelled) return;
        setUsers(nextUsers);
        setPlans(nextPlans);
        setStats(nextStats);
        setDrafts(
          Object.fromEntries(
            nextUsers.map((user) => [user.id, { role: user.role, password: '' }]),
          ),
        );
      } catch {
        if (!cancelled) onError(t('adminLoadError'));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activityRange, reloadKey, onError, t]);

  const createUser = () => {
    if (!createForm.username.trim() || !createForm.email.trim() || !createForm.password.trim()) {
      onError(t('adminFillUser'));
      return;
    }

    adminApi
      .createUser({
        ...createForm,
        username: createForm.username.trim().toLowerCase(),
        email: createForm.email.trim().toLowerCase(),
      })
      .then(() => {
        setCreateForm(emptyCreateForm);
        setIsCreateOpen(false);
        onSuccess(t('adminUserSaved'));
        reloadAdminData();
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
        reloadAdminData();
      })
      .catch(() => onError(t('adminSaveError')));
  };

  const deleteUser = async (userId: number) => {
    const targetUser = users.find((item) => item.id === userId);
    const confirmed = await confirmDelete({
      title: t('delete'),
      description: targetUser
        ? `${t('deleteUserQuestion')} (${targetUser.username})`
        : t('deleteUserQuestion'),
    });
    if (!confirmed) {
      return;
    }

    adminApi
      .deleteUser(userId)
      .then(() => {
        onSuccess(t('adminUserDeleted'));
        reloadAdminData();
      })
      .catch(() => onError(t('adminDeleteError')));
  };
  const visibleUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();

    if (!query) {
      return users;
    }

    return users.filter((user) => user.username.toLowerCase().includes(query));
  }, [userSearch, users]);
  const changeCreateForm = useCallback((patch: Partial<CreateAdminUserPayload>) => {
    setCreateForm((current) => ({ ...current, ...patch }));
  }, []);
  const changeUserDraft = useCallback((userId: number, patch: UpdateAdminUserPayload) => {
    setDrafts((current) => ({ ...current, [userId]: { ...current[userId], ...patch } }));
  }, []);

  if (!tab) {
    return <Navigate to="/admin/users" replace />;
  }

  const showRefresh = ADMIN_REFRESH_TABS.has(tab);

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
          {showRefresh ? (
            <IconButton
              label={t('refresh')}
              icon={<RefreshCw size={16} />}
              onClick={() => {
                if (tab === 'monitoring') {
                  setMonitoringReloadKey((current) => current + 1);
                  return;
                }
                reloadAdminData();
              }}
              disabled={isLoading}
            />
          ) : null}
        </div>
      </header>

      <div ref={tabsRef} className="admin-tabs">
        <NavLink
          className={({ isActive }) =>
            isActive ? 'admin-tabs__item admin-tabs__item--active' : 'admin-tabs__item'
          }
          to="/admin/users"
        >
          <UsersRound size={15} /> {t('adminUsers')}
        </NavLink>
        <NavLink
          className={({ isActive }) =>
            isActive ? 'admin-tabs__item admin-tabs__item--active' : 'admin-tabs__item'
          }
          to="/admin/monitoring"
        >
          <Radar size={15} /> {t('adminMonitoring')}
        </NavLink>
        <NavLink
          className={({ isActive }) =>
            isActive ? 'admin-tabs__item admin-tabs__item--active' : 'admin-tabs__item'
          }
          to="/admin/stats"
        >
          <BarChart3 size={15} /> {t('adminStats')}
        </NavLink>
        <NavLink
          className={({ isActive }) =>
            isActive ? 'admin-tabs__item admin-tabs__item--active' : 'admin-tabs__item'
          }
          to="/admin/integrations"
        >
          <Bot size={15} /> {t('adminIntegrations')}
        </NavLink>
        <NavLink
          className={({ isActive }) =>
            isActive ? 'admin-tabs__item admin-tabs__item--active' : 'admin-tabs__item'
          }
          to="/admin/subscriptions"
        >
          <CreditCard size={15} /> {t('adminSubscriptions')}
        </NavLink>
      </div>

      {tab === 'users' ? (
        <div className="admin-users-view">
          <div className="admin-users-toolbar">
            <label className="admin-search-field">
              <Search size={15} />
              <input
                autoComplete="off"
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
                plans={plans}
                t={t}
                user={user}
                onDelete={deleteUser}
                onDraftChange={changeUserDraft}
                onPlanAssigned={(userId, planId) => {
                  setUsers((current) =>
                    current.map((item) => {
                      if (item.id !== userId) {
                        return item;
                      }
                      const plan = plans.find((entry) => entry.id === planId);
                      return {
                        ...item,
                        subscriptionPlanId: planId,
                        subscriptionPlanName: plan?.name ?? item.subscriptionPlanName,
                        subscriptionPlanIconKey: plan?.iconKey ?? item.subscriptionPlanIconKey,
                      };
                    }),
                  );
                  onSuccess(t('adminPlanAssigned'));
                }}
                onPlanError={() => onError(t('adminSaveError'))}
                onSave={updateUser}
              />
            ))}
            {visibleUsers.length === 0 ? (
              <EmptyState tone="plain" title={t('adminNoUsers')} />
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

      {tab === 'monitoring' ? (
        <AdminMonitoringView language={language} reloadKey={monitoringReloadKey} t={t} />
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

      {tab === 'integrations' ? (
        <AdminIntegrationsPanel t={t} onError={onError} onSuccess={onSuccess} />
      ) : null}

      {tab === 'subscriptions' ? (
        <AdminSubscriptionsPanel
          language={language}
          t={t}
          onError={onError}
          onSuccess={onSuccess}
        />
      ) : null}
    </section>
  );
}
