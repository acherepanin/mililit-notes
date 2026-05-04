import { KeyRound, Shield, UserPlus, UsersRound } from 'lucide-react';

import { CustomSelect, type SelectOption } from '../../components/CustomSelect';
import { IconButton } from '../../components/IconButton';
import { Modal } from '../../components/Modal';
import type { Translator } from '../../i18n';
import type { CreateAdminUserPayload, UserRole } from '../../types';

interface AdminCreateUserModalProps {
  form: CreateAdminUserPayload;
  isOpen: boolean;
  roleOptions: Array<SelectOption<UserRole>>;
  t: Translator;
  onClose: () => void;
  onFormChange: (patch: Partial<CreateAdminUserPayload>) => void;
  onSubmit: () => void;
}

export function AdminCreateUserModal({
  form,
  isOpen,
  roleOptions,
  t,
  onClose,
  onFormChange,
  onSubmit,
}: AdminCreateUserModalProps) {
  return (
    <Modal isOpen={isOpen} title={t('adminCreateUser')} closeLabel={t('close')} onClose={onClose}>
      <form
        className="modal-form admin-create-modal"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <label className="field-shell">
          <UsersRound size={15} />
          <input
            value={form.username}
            onChange={(event) => onFormChange({ username: event.target.value })}
            placeholder={t('username')}
            aria-label={t('username')}
            autoComplete="username"
          />
        </label>
        <label className="field-shell">
          <KeyRound size={15} />
          <input
            autoComplete="new-password"
            value={form.password}
            onChange={(event) => onFormChange({ password: event.target.value })}
            placeholder={t('password')}
            type="password"
            aria-label={t('password')}
          />
        </label>
        <label className="admin-create-modal__role">
          <Shield size={15} />
          <CustomSelect
            label={t('role')}
            value={form.role ?? 'user'}
            options={roleOptions}
            onChange={(nextRole) => onFormChange({ role: nextRole })}
          />
        </label>
        <div className="modal-actions">
          <IconButton
            label={t('adminCreateUser')}
            icon={<UserPlus size={16} />}
            variant="primary"
            onClick={onSubmit}
          />
        </div>
      </form>
    </Modal>
  );
}
