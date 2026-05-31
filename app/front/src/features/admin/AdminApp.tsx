import { lazy, Suspense, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { DeleteConfirmationProvider } from '../../components/DeleteConfirmationProvider';
import { EmptyState } from '../../components/EmptyState';
import type { Translator } from '../../i18n';
import type { UserLanguage, UserTheme } from '../../types';
import { AppRouteShell } from '../app/AppRouteShell';

const AdminPanel = lazy(() =>
  import('./AdminPanel').then((module) => ({ default: module.AdminPanel })),
);

interface AdminAppProps {
  currentUserId: number;
  language: UserLanguage;
  theme: UserTheme;
  isAdmin: boolean;
  t: Translator;
  onLanguageChange: (language: UserLanguage) => void;
  onThemeChange: (theme: UserTheme) => void;
  onLogout: () => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

export function AdminApp({
  currentUserId,
  language,
  theme,
  isAdmin,
  t,
  onLanguageChange,
  onThemeChange,
  onLogout,
  onError,
  onSuccess,
}: AdminAppProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <AppRouteShell
      t={t}
      language={language}
      theme={theme}
      isAdmin={isAdmin}
      workspaceClassName="workspace--admin"
      isSidebarOpen={isSidebarOpen}
      onSidebarToggle={() => setIsSidebarOpen((current) => !current)}
      onLanguageChange={onLanguageChange}
      onThemeChange={onThemeChange}
      onLogout={onLogout}
    >
      <Suspense fallback={<EmptyState title={t('loading')} tone="plain" className="empty-editor" />}>
        <DeleteConfirmationProvider t={t}>
          <Routes>
            <Route index element={<Navigate to="users" replace />} />
            <Route
              path=":tab"
              element={
                <AdminPanel
                  currentUserId={currentUserId}
                  t={t}
                  language={language}
                  onOpenSidebar={() => setIsSidebarOpen((current) => !current)}
                  onError={onError}
                  onSuccess={onSuccess}
                />
              }
            />
            <Route path="*" element={<Navigate to="users" replace />} />
          </Routes>
        </DeleteConfirmationProvider>
      </Suspense>
    </AppRouteShell>
  );
}
