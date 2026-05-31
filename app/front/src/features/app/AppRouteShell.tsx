import { ArrowLeftToLine, LogOut, Menu, NotebookText } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { IconButton } from '../../components/IconButton';
import { Tooltip } from '../../components/Tooltip';
import type { Translator } from '../../i18n';
import type { UserLanguage, UserTheme } from '../../types';
import { SidebarSettingsMenu } from '../notes/SidebarSettingsMenu';

interface AppRouteShellProps {
  children: ReactNode;
  t: Translator;
  language: UserLanguage;
  theme: UserTheme;
  isAdmin: boolean;
  workspaceClassName?: string;
  isSidebarOpen?: boolean;
  onSidebarToggle?: () => void;
  onLanguageChange: (language: UserLanguage) => void;
  onThemeChange: (theme: UserTheme) => void;
  onLogout: () => void;
}

export function AppRouteShell({
  children,
  t,
  language,
  theme,
  isAdmin,
  workspaceClassName = '',
  isSidebarOpen: controlledSidebarOpen,
  onSidebarToggle,
  onLanguageChange,
  onThemeChange,
  onLogout,
}: AppRouteShellProps) {
  const [internalSidebarOpen, setInternalSidebarOpen] = useState(false);
  const isSidebarOpen = controlledSidebarOpen ?? internalSidebarOpen;
  const toggleSidebar =
    onSidebarToggle ?? (() => setInternalSidebarOpen((current) => !current));

  return (
    <main className="app-shell">
      <a className="skip-link" href="#app-main">
        {t('skipToContent')}
      </a>
      <aside className={`sidebar sidebar--route ${isSidebarOpen ? 'sidebar--open' : ''}`}>
        <div className="sidebar__head">
          <div className="brand-lockup">
            <Tooltip label={t('menu')}>
              <span className="icon-action icon-action--plain sidebar__mode-trigger sidebar__mode-trigger--active" aria-hidden>
                <Menu size={15} />
              </span>
            </Tooltip>
            <h1>{t('appName')}</h1>
          </div>
          <IconButton
            label={t('close')}
            icon={<ArrowLeftToLine size={17} />}
            onClick={() => {
              if (onSidebarToggle) {
                if (isSidebarOpen) {
                  onSidebarToggle();
                }
              } else {
                setInternalSidebarOpen(false);
              }
            }}
            className="sidebar__close"
          />
        </div>
        <SidebarSettingsMenu
          language={language}
          theme={theme}
          t={t}
          isAdmin={isAdmin}
          status="idle"
          showNotesManagement={false}
          onLanguageToggle={() => onLanguageChange(language === 'ru' ? 'en' : 'ru')}
          onThemeChange={onThemeChange}
        />
        <div className="sidebar__foot">
          <span className="sidebar__metric">
            <NotebookText size={13} />
            <span>{t('menu')}</span>
          </span>
          <div className="sidebar__foot-actions">
            <IconButton
              label={t('logout')}
              icon={<LogOut size={16} />}
              variant="danger"
              onClick={onLogout}
              className="sidebar__logout"
            />
          </div>
        </div>
      </aside>

      <section className={`workspace workspace--route ${workspaceClassName}`.trim()} id="app-main">
        <header className="route-workspace__toolbar">
          <IconButton
            label={t('menu')}
            icon={<Menu size={17} />}
            onClick={toggleSidebar}
            className="topbar__menu"
          />
        </header>
        {children}
      </section>
    </main>
  );
}
