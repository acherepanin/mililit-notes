import {
  BrainCircuit,
  Download,
  Languages,
  NotebookText,
  Paperclip,
  Shield,
  Trash2,
  Upload,
  UserRound,
} from 'lucide-react';
import { useRef } from 'react';
import { NavLink } from 'react-router-dom';

import { SettingsMenuItem } from '../../components/SettingsMenuItem';
import { TooltipText } from '../../components/TooltipText';
import type { Translator } from '../../i18n';
import type { SaveStatus, UserLanguage, UserTheme } from '../../types';
import { SidebarThemePicker } from './SidebarThemePicker';

export interface SidebarSettingsMenuProps {
  language: UserLanguage;
  theme: UserTheme;
  t: Translator;
  isAdmin: boolean;
  status: SaveStatus;
  showNotesManagement?: boolean;
  onExportJson?: () => void;
  onImportJson?: (file: File) => void;
  onOpenTrash?: () => void;
  onOpenGlobalAttachments?: () => void;
  onLanguageToggle: () => void;
  onThemeChange: (theme: UserTheme) => void;
  aiEnabled?: boolean;
  onAiToggle?: () => void;
}

function navItemClass(isActive: boolean, status: SaveStatus) {
  return `sidebar-settings-menu__item sidebar-settings-menu__item--nav sidebar-settings-menu__item--status-${status} ${
    isActive ? 'sidebar-settings-menu__item--active' : ''
  }`;
}

export function SidebarSettingsMenu({
  language,
  theme,
  t,
  isAdmin,
  status,
  showNotesManagement = true,
  onExportJson,
  onImportJson,
  onOpenTrash,
  onOpenGlobalAttachments,
  onLanguageToggle,
  onThemeChange,
  aiEnabled = false,
  onAiToggle,
}: SidebarSettingsMenuProps) {
  const languageValue = language === 'ru' ? 'RU' : 'EN';
  const importInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="sidebar-settings-menu" role="menu">
      <div className="sidebar-settings-menu__group" role="group" aria-label={t('menu')}>
        <span className="sidebar-settings-menu__label">{t('menu')}</span>
        <NavLink
          className={({ isActive }) => navItemClass(isActive, status)}
          to="/notes"
          role="menuitem"
        >
          <NotebookText size={14} />
          <TooltipText value={t('notes')} className="sidebar-settings-menu__text" />
        </NavLink>
        <NavLink
          className={({ isActive }) => navItemClass(isActive, status)}
          to="/account"
          role="menuitem"
        >
          <UserRound size={14} />
          <TooltipText value={t('accountTitle')} className="sidebar-settings-menu__text" />
        </NavLink>
        {isAdmin ? (
          <NavLink
            className={({ isActive }) => navItemClass(isActive, status)}
            to="/admin"
            role="menuitem"
          >
            <Shield size={14} />
            <TooltipText value={t('adminPanel')} className="sidebar-settings-menu__text" />
          </NavLink>
        ) : null}
      </div>
      {showNotesManagement ? (
        <div className="sidebar-settings-menu__group" role="group" aria-label={t('notesManagement')}>
          <span className="sidebar-settings-menu__label">{t('notesManagement')}</span>
          <input
            className="sidebar-file-input"
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file) {
                onImportJson?.(file);
              }
            }}
          />
          <button
            className="sidebar-settings-menu__item"
            type="button"
            role="menuitem"
            onClick={onOpenTrash}
          >
            <Trash2 size={14} />
            <TooltipText value={t('trash')} className="sidebar-settings-menu__text" />
          </button>
          <button
            className="sidebar-settings-menu__item"
            type="button"
            role="menuitem"
            onClick={onOpenGlobalAttachments}
          >
            <Paperclip size={14} />
            <TooltipText value={t('accountFiles')} className="sidebar-settings-menu__text" />
          </button>
          <button
            className="sidebar-settings-menu__item"
            type="button"
            role="menuitem"
            onClick={onExportJson}
          >
            <Download size={14} />
            <TooltipText value={t('exportJson')} className="sidebar-settings-menu__text" />
          </button>
          <button
            className="sidebar-settings-menu__item"
            type="button"
            role="menuitem"
            onClick={() => importInputRef.current?.click()}
          >
            <Upload size={14} />
            <TooltipText value={t('importJson')} className="sidebar-settings-menu__text" />
          </button>
        </div>
      ) : null}
      <div className="sidebar-settings-menu__group" role="group" aria-label={t('settings')}>
        <span className="sidebar-settings-menu__label">{t('settings')}</span>
        {onAiToggle ? (
          <SettingsMenuItem
            icon={<BrainCircuit size={14} />}
            label={t('aiAssistant')}
            value={aiEnabled ? t('aiEnabledShort') : t('aiDisabledShort')}
            active={aiEnabled}
            ariaPressed={aiEnabled}
            onClick={onAiToggle}
          />
        ) : null}
        <SidebarThemePicker theme={theme} t={t} onThemeChange={onThemeChange} />
        <SettingsMenuItem
          icon={<Languages size={14} />}
          label={t('language')}
          value={languageValue}
          onClick={onLanguageToggle}
        />
      </div>
    </div>
  );
}
