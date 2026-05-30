import { ArrowRight, Languages, Lock, UserRound } from 'lucide-react';
import { useMemo, useState } from 'react';

import { AmbientCubes } from '../../components/AmbientCubes';
import { CustomSelect } from '../../components/CustomSelect';
import { IconButton } from '../../components/IconButton';
import type { Translator } from '../../i18n';
import { createThemeOptions } from '../../themes';
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
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const themeOptions = useMemo(() => createThemeOptions(t), [t]);

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
          <div className="auth-field">
            <span className="auth-field__label" id="login-username-label">
              {t('username')}
            </span>
            <label className="field-shell" htmlFor="login-username">
              <UserRound size={16} aria-hidden />
              <input
                id="login-username"
                name="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder={t('username')}
                autoComplete="username"
                aria-labelledby="login-username-label"
              />
            </label>
          </div>
          <div className="auth-field">
            <span className="auth-field__label" id="login-password-label">
              {t('password')}
            </span>
            <label className="field-shell" htmlFor="login-password">
              <Lock size={16} aria-hidden />
              <input
                id="login-password"
                name="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={t('password')}
                type="password"
                autoComplete="current-password"
                aria-labelledby="login-password-label"
              />
            </label>
          </div>
          <div className="auth-form__actions">
            <IconButton
              label={`${t('language')}: ${language === 'ru' ? 'RU' : 'EN'}`}
              icon={<Languages size={18} />}
              onClick={() => onLanguageChange(language === 'ru' ? 'en' : 'ru')}
            />
            <CustomSelect
              className="auth-theme-select"
              value={theme}
              options={themeOptions}
              label={t('theme')}
              onChange={onThemeChange}
            />
            <button className="auth-submit auth-submit--labeled" type="submit" disabled={isLoading}>
              <span>{t('signIn')}</span>
              <ArrowRight size={18} aria-hidden />
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
