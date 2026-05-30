import { useCallback, useEffect, useState } from 'react';

import { authApi, setApiToken } from '../../api';
import { parseUserTheme } from '../../themes';
import type { AuthUser, UserLanguage, UserTheme } from '../../types';

function normalizeUser(user: AuthUser): AuthUser {
  return {
    ...user,
    theme: parseUserTheme(user.theme),
  };
}

const tokenStorageKey = 'notes.auth.token';

export function useAuth() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(tokenStorageKey));
  const [user, setUser] = useState<AuthUser | null>(null);
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

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setApiToken(null);
  }, []);

  const updatePreferences = useCallback(
    async (payload: { language?: UserLanguage; theme?: UserTheme }) => {
      const nextUser = normalizeUser(await authApi.updatePreferences(payload));
      setUser(nextUser);
      return nextUser;
    },
    [],
  );

  return {
    token,
    user,
    isChecking,
    login,
    logout,
    updatePreferences,
  };
}
