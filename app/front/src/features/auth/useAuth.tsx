import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { authApi, setApiToken } from '../../api';
import { parseUserTheme } from '../../themes';
import type { MeUser, RegistrationPendingResponse, UserLanguage, UserTheme } from '../../types';

function normalizeUser(user: MeUser): MeUser {
  return {
    ...user,
    language: user.language ?? 'ru',
    theme: parseUserTheme(user.theme),
    profile: user.profile ?? {
      email: null,
      firstName: null,
      lastName: null,
      patronymic: null,
      birthDate: null,
    },
  };
}

const tokenStorageKey = 'notes.auth.token';

type AuthContextValue = {
  token: string | null;
  user: MeUser | null;
  isChecking: boolean;
  login: (username: string, password: string) => Promise<MeUser>;
  register: (payload: {
    username: string;
    password: string;
    email: string;
    firstName?: string;
    lastName?: string;
  }) => Promise<RegistrationPendingResponse>;
  logout: () => void;
  refreshMe: () => Promise<MeUser>;
  updatePreferences: (payload: { language?: UserLanguage; theme?: UserTheme }) => Promise<MeUser>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(tokenStorageKey));
  const [user, setUser] = useState<MeUser | null>(null);
  const [isChecking, setIsChecking] = useState(Boolean(token));

  useEffect(() => {
    setApiToken(token);
    if (token) {
      localStorage.setItem(tokenStorageKey, token);
    } else {
      localStorage.removeItem(tokenStorageKey);
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      setIsChecking(false);
      setUser(null);
      return;
    }

    setIsChecking(true);
    authApi
      .getMe()
      .then((nextUser) => setUser(normalizeUser(nextUser)))
      .catch(() => {
        setToken(null);
        setUser(null);
      })
      .finally(() => setIsChecking(false));
  }, [token]);

  const login = useCallback(async (username: string, password: string) => {
    const response = await authApi.login(username, password);
    setApiToken(response.token);
    setToken(response.token);
    const nextUser = normalizeUser(response.user);
    setUser(nextUser);
    return nextUser;
  }, []);

  const register = useCallback(
    async (payload: {
      username: string;
      password: string;
      email: string;
      firstName?: string;
      lastName?: string;
    }) => authApi.register(payload),
    [],
  );

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setApiToken(null);
  }, []);

  const refreshMe = useCallback(async () => {
    const nextUser = normalizeUser(await authApi.getMe());
    setUser(nextUser);
    return nextUser;
  }, []);

  const updatePreferences = useCallback(
    async (payload: { language?: UserLanguage; theme?: UserTheme }) => {
      const nextUser = normalizeUser(await authApi.updatePreferences(payload));
      setUser(nextUser);
      return nextUser;
    },
    [],
  );

  const value = useMemo(
    () => ({
      token,
      user,
      isChecking,
      login,
      register,
      logout,
      refreshMe,
      updatePreferences,
    }),
    [token, user, isChecking, login, register, logout, refreshMe, updatePreferences],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
