import { ArrowLeft, Lock, Mail, UserPlus, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { AuthPanelHead } from '../../components/AuthPanelHead';
import { IconButton } from '../../components/IconButton';
import { IntegrationField } from '../../components/IntegrationField';
import { PasswordField } from '../../components/PasswordField';
import { Tooltip } from '../../components/Tooltip';
import type { Translator } from '../../i18n';
import type { RegistrationPendingResponse } from '../../types';
import { isValidUsername, normalizeUsernameInput } from '../../utils/authCredentials';
import type { UserLanguage, UserTheme } from '../../types';

interface RegisterPageProps {
  t: Translator;
  language: UserLanguage;
  theme: UserTheme;
  loginHref: string;
  isSubmitting?: boolean;
  onLanguageChange: (language: UserLanguage) => void;
  onThemeChange: (theme: UserTheme) => void;
  onRegister: (payload: {
    username: string;
    password: string;
    email: string;
    firstName?: string;
    lastName?: string;
  }) => Promise<RegistrationPendingResponse>;
  onValidationError: (message: string) => void;
}

export function RegisterPage({
  t,
  language,
  theme,
  loginHref,
  isSubmitting = false,
  onLanguageChange,
  onThemeChange,
  onRegister,
  onValidationError,
}: RegisterPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  const submit = async () => {
    const normalizedUsername = normalizeUsernameInput(username);
    const normalizedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();

    if (!normalizedEmail || !normalizedUsername || !trimmedPassword) {
      onValidationError(t('registerValidationRequired'));
      return;
    }
    if (!isValidUsername(normalizedUsername)) {
      onValidationError(t('usernameRules'));
      return;
    }

    await onRegister({
      username: normalizedUsername,
      password: trimmedPassword,
      email: normalizedEmail,
      firstName: firstName.trim() || undefined,
      lastName: lastName.trim() || undefined,
    });
  };

  return (
    <main className="auth-stage">
      <section className="auth-panel auth-panel--wide">
        <AuthPanelHead
          title={t('registerTitle')}
          language={language}
          theme={theme}
          t={t}
          onLanguageChange={onLanguageChange}
          onThemeChange={onThemeChange}
        />
        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submit().catch(() => undefined);
          }}
        >
          <div className="auth-form__fields admin-integration-fields">
            <IntegrationField icon={<UserRound size={14} />} label={t('firstName')}>
              <input
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                placeholder={t('firstName')}
                autoComplete="given-name"
              />
            </IntegrationField>
            <IntegrationField icon={<UserRound size={14} />} label={t('lastName')}>
              <input
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                placeholder={t('lastName')}
                autoComplete="family-name"
              />
            </IntegrationField>
            <IntegrationField icon={<Mail size={14} />} label={t('email')} wide>
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t('email')}
                type="email"
                autoComplete="email"
                required
              />
            </IntegrationField>
            <IntegrationField
              icon={<UserRound size={14} />}
              label={t('username')}
              labelTooltip={t('usernameRules')}
              wide
            >
              <input
                value={username}
                onChange={(event) => setUsername(normalizeUsernameInput(event.target.value))}
                placeholder={t('username')}
                autoComplete="username"
                required
              />
            </IntegrationField>
            <PasswordField
              label={t('password')}
              showPasswordLabel={t('showPassword')}
              hidePasswordLabel={t('hidePassword')}
              generateLabel={t('generatePassword')}
              icon={<Lock size={14} aria-hidden />}
              value={password}
              onValueChange={setPassword}
              placeholder={t('password')}
              autoComplete="new-password"
              required
              wide
            />
          </div>
          <div className="auth-form__actions">
            <Tooltip label={t('backToLogin')}>
              <Link className="icon-action" to={loginHref} aria-label={t('backToLogin')}>
                <ArrowLeft size={18} aria-hidden />
              </Link>
            </Tooltip>
            <IconButton
              label={t('registerSubmit')}
              icon={<UserPlus size={18} aria-hidden />}
              variant="primary"
              type="submit"
              disabled={isSubmitting}
              aria-busy={isSubmitting}
            />
          </div>
        </form>
      </section>
    </main>
  );
}
