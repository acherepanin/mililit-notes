import { KeyRound, Save, Shield, Trash2 } from 'lucide-react';

import { CustomSelect, type SelectOption } from '../../components/CustomSelect';
import { IconButton } from '../../components/IconButton';
import { TooltipText } from '../../components/TooltipText';
import type { Translator } from '../../i18n';
import type { AdminUser, UpdateAdminUserPayload, UserRole } from '../../types';

interface AdminUserCardProps {
  currentUserId: number;
  draft: UpdateAdminUserPayload;
  roleOptions: Array<SelectOption<UserRole>>;
  t: Translator;
  user: AdminUser;
  onDelete: (userId: number) => void;
  onDraftChange: (userId: number, patch: UpdateAdminUserPayload) => void;
  onSave: (userId: number) => void;
}

const getInitial = (username: string) => username.trim().slice(0, 1).toUpperCase() || 'U';

export function AdminUserCard({
  currentUserId,
  draft,
  roleOptions,
  t,
  user,
  onDelete,
  onDraftChange,
  onSave,
}: AdminUserCardProps) {
  const isCurrentUser = user.id === currentUserId;

  return (
    <article className={`admin-user-card ${isCurrentUser ? 'admin-user-card--self' : ''}`}>
      <div className="admin-user-card__profile">
        <span className="admin-user-card__avatar">{getInitial(user.username)}</span>
        <div className="admin-user-card__identity">
          <TooltipText value={user.username} className="admin-user-card__name-static" />
        </div>
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
        <label className="admin-user-card__role-field">
          <Shield size={14} />
          <CustomSelect
            className="admin-user-card__role"
            label={t('role')}
            value={(draft.role ?? user.role) as UserRole}
            options={roleOptions}
            onChange={(nextRole) => onDraftChange(user.id, { role: nextRole })}
          />
        </label>

        <label className="admin-user-card__password">
          <KeyRound size={14} />
          <input
            autoComplete="new-password"
            name={`new-password-${user.id}`}
            value={draft.password ?? ''}
            onChange={(event) => onDraftChange(user.id, { password: event.target.value })}
            placeholder={t('adminNewPassword')}
            type="password"
            aria-label={t('adminNewPassword')}
          />
        </label>
      </form>

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
