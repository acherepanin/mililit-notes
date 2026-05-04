import { ArrowRight, Languages, Lock, Moon, Sun, UserRound } from 'lucide-react';
import { useState } from 'react';

import { AmbientCubes } from '../../components/AmbientCubes';
import { IconButton } from '../../components/IconButton';
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
}

export function LoginScreen({
  language,
  theme,
  t,
  isLoading,
  onLanguageChange,
  onThemeChange,
  onLogin,
}: LoginScreenProps) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin');

  return (
    <main className="auth-stage">
      <AmbientCubes area="auth" />
      <section className="auth-panel">
        <div className="auth-panel__mark">N</div>
        <h1>{t('loginTitle')}</h1>
        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault();
            onLogin(username, password);
          }}
        >
          <label className="field-shell">
            <UserRound size={16} />
            <input
              name="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder={t('username')}
              autoComplete="username"
            />
          </label>
          <label className="field-shell">
            <Lock size={16} />
            <input
              name="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t('password')}
              type="password"
              autoComplete="current-password"
            />
          </label>
          <div className="auth-form__actions">
            <IconButton
              label={t('language')}
              icon={<Languages size={18} />}
              onClick={() => onLanguageChange(language === 'ru' ? 'en' : 'ru')}
            />
            <IconButton
              label={t('theme')}
              icon={theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}
            />
            <Tooltip label={t('signIn')}>
              <button
                className="auth-submit"
                type="submit"
                aria-label={t('signIn')}
                disabled={isLoading}
              >
                <ArrowRight size={22} />
              </button>
            </Tooltip>
          </div>
        </form>
      </section>
    </main>
  );
}
