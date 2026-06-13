import { LogIn, Lock, UserPlus, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { AuthPanelHead } from '../../components/AuthPanelHead';
import { IconButton } from '../../components/IconButton';
import { IntegrationField } from '../../components/IntegrationField';
import { PasswordField } from '../../components/PasswordField';
import { Tooltip } from '../../components/Tooltip';
import type { Translator } from '../../i18n';
import type { UserLanguage, UserTheme } from '../../types';

interface LoginScreenProps {
  language: UserLanguage;
  theme: UserTheme;
  t: Translator;
  isLoading: boolean;
  onLanguageChange: (language: UserLanguage) => void;
  onThemeChange: (theme: UserTheme) => void;
  onLogin: (username: string, password: string) => void;
  registerHref?: string;
}

export function LoginScreen({
  language,
  theme,
  t,
  isLoading,
  onLanguageChange,
  onThemeChange,
  onLogin,
  registerHref,
}: LoginScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  return (
    <main className="auth-stage">
      <section className="auth-panel">
        <AuthPanelHead
          title={t('loginTitle')}
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
            onLogin(username, password);
          }}
        >
          <div className="auth-form__fields admin-integration-fields">
            <IntegrationField icon={<UserRound size={14} />} label={t('username')} wide>
              <input
                id="login-username"
                name="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder={t('username')}
                autoComplete="username"
              />
            </IntegrationField>
            <PasswordField
              label={t('password')}
              showPasswordLabel={t('showPassword')}
              hidePasswordLabel={t('hidePassword')}
              icon={<Lock size={14} aria-hidden />}
              value={password}
              onValueChange={setPassword}
              id="login-password"
              name="password"
              placeholder={t('password')}
              autoComplete="current-password"
              wide
            />
          </div>
          <div className="auth-form__actions">
            {registerHref ? (
              <Tooltip label={t('registerLink')}>
                <Link className="icon-action" to={registerHref} aria-label={t('registerLink')}>
                  <UserPlus size={18} aria-hidden />
                </Link>
              </Tooltip>
            ) : null}
            <IconButton
              label={t('signIn')}
              icon={<LogIn size={18} aria-hidden />}
              variant="primary"
              type="submit"
              disabled={isLoading}
              aria-busy={isLoading}
            />
          </div>
        </form>
      </section>
    </main>
  );
}
