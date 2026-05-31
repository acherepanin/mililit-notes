import { Loader2 } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';

import { ApiError } from './api';
import { ToastHost } from './components/ToastHost';
import { useToasts } from './components/useToasts';
import { AdminApp } from './features/admin/AdminApp';
import { AccountPage } from './features/account/AccountPage';
import { LoginScreen } from './features/auth/LoginScreen';
import { RegisterPage } from './features/auth/RegisterPage';
import { RegistrationPendingScreen } from './features/auth/RegistrationPendingScreen';
import { VerifyEmailPage } from './features/auth/VerifyEmailPage';
import { useAuth } from './features/auth/useAuth';
import { PublicSharePage } from './features/share/PublicSharePage';
import { RequireAdmin } from './routes/RequireAdmin';
import { RequireAuth } from './routes/RequireAuth';
import { createTranslator } from './i18n';
import { parseUserTheme } from './themes';
import type { RegistrationPendingResponse } from './types';
import type { UserLanguage, UserTheme } from './types';
import { resolveLoginErrorMessage } from './utils/authErrors';

const AuthenticatedApp = lazy(() => import('./features/app/AuthenticatedApp'));

const guestLanguageKey = 'notes.guest.language';
const guestThemeKey = 'notes.guest.theme';

function BootScreen() {
  return (
    <main className="auth-stage" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading</span>
      <Loader2 className="boot-spinner" size={28} aria-hidden />
    </main>
  );
}

function PublicShareRoute() {
  const { token = '' } = useParams();
  const language =
    (localStorage.getItem(guestLanguageKey) as UserLanguage | null) ?? 'ru';
  const theme = parseUserTheme(localStorage.getItem(guestThemeKey));
  const t = useMemo(() => createTranslator(language), [language]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dataset.theme = theme;
  }, [language, theme]);

  return <PublicSharePage token={token} t={t} />;
}

function LoginRoute() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toasts = useToasts();
  const [guestLanguage, setGuestLanguage] = useState<UserLanguage>(
    () => (localStorage.getItem(guestLanguageKey) as UserLanguage | null) ?? 'ru',
  );
  const [guestTheme, setGuestTheme] = useState<UserTheme>(() =>
    parseUserTheme(localStorage.getItem(guestThemeKey)),
  );
  const language = auth.user?.language ?? guestLanguage;
  const theme = parseUserTheme(auth.user?.theme, guestTheme);
  const t = useMemo(() => createTranslator(language), [language]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = language;
    localStorage.setItem(guestLanguageKey, language);
    localStorage.setItem(guestThemeKey, theme);
  }, [language, theme]);

  useEffect(() => {
    const state = location.state as { emailConfirmed?: boolean } | null;
    if (state?.emailConfirmed) {
      toasts.pushToast('success', t('emailConfirmed'));
      navigate('/login', { replace: true, state: null });
    }
  }, [location.state, navigate, t, toasts]);

  const login = useCallback(
    async (username: string, password: string) => {
      try {
        await auth.login(username, password);
        await auth.refreshMe();
        navigate('/notes', { replace: true });
      } catch (error) {
        toasts.pushToast('error', resolveLoginErrorMessage(error, t));
      }
    },
    [auth, navigate, t, toasts],
  );

  return (
    <>
      <LoginScreen
        language={language}
        theme={theme}
        t={t}
        isLoading={auth.isChecking}
        onLanguageChange={(next) => {
          setGuestLanguage(next);
          localStorage.setItem(guestLanguageKey, next);
        }}
        onThemeChange={(next) => {
          setGuestTheme(next);
          localStorage.setItem(guestThemeKey, next);
        }}
        onLogin={login}
        registerHref="/register"
      />
      <ToastHost toasts={toasts.toasts} closeLabel={t('close')} onDismiss={toasts.dismiss} />
    </>
  );
}

function RegisterRoute() {
  const auth = useAuth();
  const toasts = useToasts();
  const [pendingRegistration, setPendingRegistration] = useState<RegistrationPendingResponse | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [guestLanguage, setGuestLanguage] = useState<UserLanguage>(
    () => (localStorage.getItem(guestLanguageKey) as UserLanguage | null) ?? 'ru',
  );
  const [guestTheme, setGuestTheme] = useState<UserTheme>(() =>
    parseUserTheme(localStorage.getItem(guestThemeKey)),
  );
  const language = guestLanguage;
  const t = useMemo(() => createTranslator(language), [language]);

  useEffect(() => {
    document.documentElement.dataset.theme = guestTheme;
    document.documentElement.lang = language;
    localStorage.setItem(guestLanguageKey, language);
    localStorage.setItem(guestThemeKey, guestTheme);
  }, [guestTheme, language]);

  const register = useCallback(
    async (payload: {
      username: string;
      password: string;
      email: string;
      firstName?: string;
      lastName?: string;
    }) => {
      setIsSubmitting(true);
      try {
        const pending = await auth.register(payload);
        setPendingRegistration(pending);
        return pending;
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          toasts.pushToast('error', error.message);
        } else {
          toasts.pushToast('error', t('registerError'));
        }
        throw error;
      } finally {
        setIsSubmitting(false);
      }
    },
    [auth, t, toasts],
  );

  if (pendingRegistration) {
    return (
      <>
        <RegistrationPendingScreen
          t={t}
          email={pendingRegistration.email}
          pendingId={pendingRegistration.pendingId}
          onStatusChange={(status) => {
            if (status === 'expired' || status === 'not_found') {
              setPendingRegistration(null);
              toasts.pushToast('error', t('registrationPendingExpired'));
            }
          }}
        />
        <ToastHost toasts={toasts.toasts} closeLabel={t('close')} onDismiss={toasts.dismiss} />
      </>
    );
  }

  return (
    <>
      <RegisterPage
        t={t}
        language={language}
        theme={guestTheme}
        isSubmitting={isSubmitting}
        onLanguageChange={(next) => {
          setGuestLanguage(next);
          localStorage.setItem(guestLanguageKey, next);
        }}
        onThemeChange={(next) => {
          setGuestTheme(next);
          localStorage.setItem(guestThemeKey, next);
        }}
        onRegister={register}
        onValidationError={(message) => toasts.pushToast('error', message)}
        loginHref="/login"
      />
      <ToastHost toasts={toasts.toasts} closeLabel={t('close')} onDismiss={toasts.dismiss} />
    </>
  );
}

function VerifyEmailRoute() {
  const language =
    (localStorage.getItem(guestLanguageKey) as UserLanguage | null) ?? 'ru';
  const t = useMemo(() => createTranslator(language), [language]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return <VerifyEmailPage t={t} />;
}

function AuthenticatedLayout() {
  const auth = useAuth();
  const toasts = useToasts();
  const language = auth.user?.language ?? 'ru';
  const theme = parseUserTheme(auth.user?.theme);
  const t = useMemo(() => createTranslator(language), [language]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = language;
  }, [language, theme]);

  const updateLanguage = useCallback(
    (nextLanguage: UserLanguage) => {
      const nextT = createTranslator(nextLanguage);
      auth
        .updatePreferences({ language: nextLanguage })
        .then(() => toasts.pushToast('success', nextT('preferencesSaved')))
        .catch(() => toasts.pushToast('error', nextT('saveError')));
    },
    [auth, toasts],
  );

  const updateTheme = useCallback(
    (nextTheme: UserTheme) => {
      auth
        .updatePreferences({ theme: nextTheme })
        .then(() => toasts.pushToast('success', t('preferencesSaved')))
        .catch(() => toasts.pushToast('error', t('saveError')));
    },
    [auth, t, toasts],
  );

  const navigate = useNavigate();
  const logout = useCallback(() => {
    auth.logout();
    navigate('/login', { replace: true });
  }, [auth, navigate]);

  const user = auth.user;
  if (!user) {
    return <BootScreen />;
  }

  return (
    <>
      <Suspense fallback={<BootScreen />}>
        <Routes>
          <Route
            path="/notes/*"
            element={
              <AuthenticatedApp
                user={user}
                language={language}
                theme={theme}
                t={t}
                onLanguageChange={updateLanguage}
                onThemeChange={updateTheme}
                onLogout={logout}
                pushToast={toasts.pushToast}
              />
            }
          />
          <Route
            path="/account"
            element={
              <AccountPage
                user={user}
                language={language}
                theme={theme}
                isAdmin={user.role === 'admin'}
                t={t}
                onRefresh={auth.refreshMe}
                onLanguageChange={updateLanguage}
                onThemeChange={updateTheme}
                onLogout={logout}
                pushToast={toasts.pushToast}
              />
            }
          />
          <Route element={<RequireAdmin />}>
            <Route
              path="/admin/*"
              element={
                <AdminApp
                  currentUserId={user.id}
                  language={language}
                  theme={theme}
                  isAdmin={user.role === 'admin'}
                  t={t}
                  onLanguageChange={updateLanguage}
                  onThemeChange={updateTheme}
                  onLogout={logout}
                  onError={(message) => toasts.pushToast('error', message)}
                  onSuccess={(message) => toasts.pushToast('success', message)}
                />
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/notes" replace />} />
        </Routes>
      </Suspense>
      <ToastHost toasts={toasts.toasts} closeLabel={t('close')} onDismiss={toasts.dismiss} />
    </>
  );
}

export function App() {
  const auth = useAuth();

  if (auth.isChecking && auth.token) {
    return <BootScreen />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/share/:token" element={<PublicShareRoute />} />
        <Route
          path="/login"
          element={auth.user ? <Navigate to="/notes" replace /> : <LoginRoute />}
        />
        <Route
          path="/register"
          element={auth.user ? <Navigate to="/notes" replace /> : <RegisterRoute />}
        />
        <Route path="/verify-email" element={<VerifyEmailRoute />} />
        <Route element={<RequireAuth />}>
          <Route path="/" element={<Navigate to="/notes" replace />} />
          <Route path="/*" element={<AuthenticatedLayout />} />
        </Route>
        <Route path="*" element={<Navigate to={auth.user ? '/notes' : '/login'} replace />} />
      </Routes>
    </BrowserRouter>
  );
}
