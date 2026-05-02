import { useCallback, useEffect, useState } from 'react';

import { authApi, setApiToken } from '../../api';
import type { AuthUser, UserLanguage, UserTheme } from '../../types';

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
      .then(setUser)
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
    setUser(response.user);
    return response.user;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setApiToken(null);
  }, []);

  const updatePreferences = useCallback(async (payload: { language?: UserLanguage; theme?: UserTheme }) => {
    const nextUser = await authApi.updatePreferences(payload);
    setUser(nextUser);
    return nextUser;
  }, []);

  return {
    token,
    user,
    isChecking,
    login,
    logout,
    updatePreferences,
  };
}
