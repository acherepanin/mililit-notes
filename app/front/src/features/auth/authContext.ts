import { createContext } from 'react';

import type { MeUser, RegistrationPendingResponse, UserLanguage, UserTheme } from '../../types';

export type AuthContextValue = {
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

export const AuthContext = createContext<AuthContextValue | null>(null);
