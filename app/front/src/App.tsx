import { Loader2 } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';

import { ToastHost } from './components/ToastHost';
import { useToasts } from './components/useToasts';
import { LoginScreen } from './features/auth/LoginScreen';
import { useAuth } from './features/auth/useAuth';
import { createTranslator } from './i18n';
import type { UserLanguage, UserTheme } from './types';

const AuthenticatedApp = lazy(() => import('./features/app/AuthenticatedApp'));

const guestLanguageKey = 'notes.guest.language';
const guestThemeKey = 'notes.guest.theme';

function BootScreen() {
  return (
    <main className="auth-stage">
      <Loader2 className="boot-spinner" size={28} />
    </main>
  );
}

export function App() {
  const auth = useAuth();
  const toasts = useToasts();
  const [guestLanguage, setGuestLanguage] = useState<UserLanguage>(
    () => (localStorage.getItem(guestLanguageKey) as UserLanguage) || 'ru',
  );
  const [guestTheme, setGuestTheme] = useState<UserTheme>(
    () => (localStorage.getItem(guestThemeKey) as UserTheme) || 'dark',
  );
  const language = auth.user?.language ?? guestLanguage;
  const theme = auth.user?.theme ?? guestTheme;
  const t = useMemo(() => createTranslator(language), [language]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = language;
  }, [language, theme]);

  useEffect(() => {
    localStorage.setItem(guestLanguageKey, guestLanguage);
  }, [guestLanguage]);

  useEffect(() => {
    localStorage.setItem(guestThemeKey, guestTheme);
  }, [guestTheme]);

  const updateLanguage = useCallback(
    (nextLanguage: UserLanguage) => {
      if (!auth.user) {
        setGuestLanguage(nextLanguage);
        return;
      }

      auth
        .updatePreferences({ language: nextLanguage })
        .then(() => toasts.pushToast('success', t('preferencesSaved')))
        .catch(() => toasts.pushToast('error', t('saveError')));
    },
    [auth, t, toasts],
  );

  const updateTheme = useCallback(
    (nextTheme: UserTheme) => {
      if (!auth.user) {
        setGuestTheme(nextTheme);
        return;
      }

      auth
        .updatePreferences({ theme: nextTheme })
        .then(() => toasts.pushToast('success', t('preferencesSaved')))
        .catch(() => toasts.pushToast('error', t('saveError')));
    },
    [auth, t, toasts],
  );

  const login = useCallback(
    (username: string, password: string) => {
      auth
        .login(username, password)
        .then((user) => {
          toasts.pushToast('success', user.username);
        })
        .catch(() => toasts.pushToast('error', t('loginError')));
    },
    [auth, t, toasts],
  );

  if (auth.isChecking) {
    return <BootScreen />;
  }

  if (!auth.user) {
    return (
      <>
        <LoginScreen
          language={language}
          theme={theme}
          t={t}
          isLoading={auth.isChecking}
          onLanguageChange={updateLanguage}
          onThemeChange={updateTheme}
          onLogin={login}
        />
        <ToastHost toasts={toasts.toasts} closeLabel={t('close')} onDismiss={toasts.dismiss} />
      </>
    );
  }

  return (
    <>
      <Suspense fallback={<BootScreen />}>
        <AuthenticatedApp
          user={auth.user}
          language={language}
          theme={theme}
          t={t}
          onLanguageChange={updateLanguage}
          onThemeChange={updateTheme}
          onLogout={auth.logout}
          pushToast={toasts.pushToast}
        />
      </Suspense>
      <ToastHost toasts={toasts.toasts} closeLabel={t('close')} onDismiss={toasts.dismiss} />
    </>
  );
}
