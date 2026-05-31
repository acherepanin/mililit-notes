import { CreditCard, Save, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';

import { adminApi } from '../../api';
import { IconActionMenu } from '../../components/IconActionMenu';
import { IconButton } from '../../components/IconButton';
import { PasswordField } from '../../components/PasswordField';
import { TooltipText } from '../../components/TooltipText';
import type { Translator } from '../../i18n';
import type { AdminUser, SubscriptionPlan, UpdateAdminUserPayload, UserRole } from '../../types';
import { resolvePlanIcon } from '../../utils/planIcons';

interface AdminUserCardProps {
  currentUserId: number;
  draft: UpdateAdminUserPayload;
  plans: SubscriptionPlan[];
  t: Translator;
  user: AdminUser;
  onDelete: (userId: number) => void;
  onDraftChange: (userId: number, patch: UpdateAdminUserPayload) => void;
  onPlanAssigned: (userId: number, planId: number) => void;
  onPlanError: () => void;
  onSave: (userId: number) => void;
}

export function AdminUserCard({
  currentUserId,
  draft,
  plans,
  t,
  user,
  onDelete,
  onDraftChange,
  onPlanAssigned,
  onPlanError,
  onSave,
}: AdminUserCardProps) {
  const isCurrentUser = user.id === currentUserId;
  const role = (draft.role ?? user.role) as UserRole;
  const [assignedPlanId, setAssignedPlanId] = useState<number | null>(user.subscriptionPlanId);

  useEffect(() => {
    setAssignedPlanId(user.subscriptionPlanId);
  }, [user.id, user.subscriptionPlanId]);

  const selectedPlan = assignedPlanId
    ? plans.find((plan) => plan.id === assignedPlanId)
    : null;

  const roleOptions = [
    {
      value: 'user' as const,
      label: t('roleUser'),
      hint: t('roleUserHint'),
      icon: <UserRound size={14} aria-hidden />,
    },
    {
      value: 'admin' as const,
      label: t('roleAdmin'),
      hint: t('roleAdminHint'),
      icon: <ShieldCheck size={14} aria-hidden />,
    },
  ];

  const planOptions = plans.map((plan) => ({
    value: plan.id,
    label: plan.isHidden ? `${plan.name} (${t('planHiddenBadge')})` : plan.name,
    hint: plan.isHidden
      ? t('planHiddenAssignHint')
      : (plan.description ?? plan.slug),
    icon: resolvePlanIcon(plan.iconKey, 14),
  }));

  const assignPlan = (nextPlanId: number) => {
    if (!nextPlanId || nextPlanId === assignedPlanId) {
      return;
    }
    adminApi
      .assignUserSubscription(user.id, nextPlanId)
      .then(() => {
        setAssignedPlanId(nextPlanId);
        onPlanAssigned(user.id, nextPlanId);
      })
      .catch(() => onPlanError());
  };

  return (
    <article className={`admin-user-card ${isCurrentUser ? 'admin-user-card--self' : ''}`}>
      <div className="admin-user-card__profile">
        <span
          className={`admin-user-card__role-icon ${role === 'admin' ? 'admin-user-card__role-icon--admin' : ''}`.trim()}
          aria-hidden
        >
          {role === 'admin' ? <ShieldCheck size={15} /> : <UserRound size={15} />}
        </span>
        <TooltipText value={user.username} className="admin-user-card__name" />
      </div>

      <form
        className="admin-user-card__edit-group"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(user.id);
        }}
      >
        <input
          autoComplete="username"
          className="admin-user-card__hidden-username"
          name={`username-${user.id}`}
          readOnly
          tabIndex={-1}
          type="text"
          value={user.username}
        />
        <PasswordField
          hideLabel
          className="admin-user-card__password-field"
          label={t('adminNewPassword')}
          showPasswordLabel={t('showPassword')}
          hidePasswordLabel={t('hidePassword')}
          generateLabel={t('generatePassword')}
          value={draft.password ?? ''}
          onValueChange={(password) => onDraftChange(user.id, { password })}
          name={`new-password-${user.id}`}
          placeholder={t('adminNewPassword')}
          autoComplete="new-password"
        />
      </form>

      <div className="admin-user-card__pickers">
        <IconActionMenu
          label={t('role')}
          tooltip={t('role')}
          icon={role === 'admin' ? <ShieldCheck size={16} /> : <UserRound size={16} />}
          value={role}
          options={roleOptions}
          variant={role === 'admin' ? 'primary' : 'plain'}
          onChange={(nextRole) => onDraftChange(user.id, { role: nextRole })}
        />
        <IconActionMenu
          label={t('adminAssignPlan')}
          tooltip={t('currentPlan')}
          icon={
            selectedPlan ? (
              resolvePlanIcon(selectedPlan.iconKey, 16)
            ) : (
              <CreditCard size={16} aria-hidden />
            )
          }
          value={assignedPlanId ?? 0}
          options={planOptions}
          disabled={planOptions.length === 0}
          variant={assignedPlanId ? 'active' : 'plain'}
          onChange={(nextPlanId) => assignPlan(nextPlanId)}
        />
      </div>

      <div className="admin-user-card__actions">
        <IconButton
          label={t('save')}
          icon={<Save size={16} />}
          variant="primary"
          onClick={() => onSave(user.id)}
        />
        <IconButton
          label={t('delete')}
          icon={<Trash2 size={16} />}
          variant="danger"
          onClick={() => onDelete(user.id)}
          disabled={isCurrentUser}
        />
      </div>
    </article>
  );
}
