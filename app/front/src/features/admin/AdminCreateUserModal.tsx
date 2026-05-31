import { Mail, ShieldCheck, UserPlus, UserRound } from 'lucide-react';

import { CustomSelect, type SelectOption } from '../../components/CustomSelect';
import { IconButton } from '../../components/IconButton';
import { IntegrationField } from '../../components/IntegrationField';
import { Modal } from '../../components/Modal';
import { PasswordField } from '../../components/PasswordField';
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
        <div className="admin-create-modal__fields admin-integration-fields">
          <IntegrationField icon={<UserRound size={14} />} label={t('username')} wide>
            <input
              name="username"
              value={form.username}
              onChange={(event) => onFormChange({ username: event.target.value })}
              placeholder={t('username')}
              aria-label={t('username')}
              autoComplete="username"
              required
            />
          </IntegrationField>
          <IntegrationField icon={<Mail size={14} />} label={t('email')} wide>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={(event) => onFormChange({ email: event.target.value })}
              placeholder={t('email')}
              aria-label={t('email')}
              autoComplete="email"
              required
            />
          </IntegrationField>
          <PasswordField
            label={t('password')}
            showPasswordLabel={t('showPassword')}
            hidePasswordLabel={t('hidePassword')}
            generateLabel={t('generatePassword')}
            value={form.password}
            onValueChange={(password) => onFormChange({ password })}
            name="password"
            placeholder={t('password')}
            autoComplete="new-password"
            required
            wide
          />
          <IntegrationField icon={<ShieldCheck size={14} />} label={t('role')} wide>
            <CustomSelect
              className="admin-create-modal__role-select"
              label={t('role')}
              value={form.role ?? 'user'}
              options={roleOptions}
              onChange={(nextRole) => onFormChange({ role: nextRole })}
            />
          </IntegrationField>
        </div>
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
