import {
  ArrowLeftToLine,
  FilePlus2,
  Languages,
  LogOut,
  Menu,
  Moon,
  NotebookText,
  Search,
  Shield,
  Sun,
} from 'lucide-react';
import { useState } from 'react';

import { AmbientCubes } from '../../components/AmbientCubes';
import { IconButton } from '../../components/IconButton';
import { Tooltip } from '../../components/Tooltip';
import { TooltipText } from '../../components/TooltipText';
import type { Translator } from '../../i18n';
import type { NoteTreeNode, SaveStatus, UserLanguage, UserTheme } from '../../types';
import { NotesTree } from './NotesTree';

interface SidebarSettingsMenuProps {
  language: UserLanguage;
  theme: UserTheme;
  t: Translator;
  activeView: 'notes' | 'admin';
  isAdmin: boolean;
  status: SaveStatus;
  onOpenNotes: () => void;
  onOpenAdmin: () => void;
  onLanguageToggle: () => void;
  onThemeToggle: () => void;
}

function SidebarSettingsMenu({
  language,
  theme,
  t,
  activeView,
  isAdmin,
  status,
  onOpenNotes,
  onOpenAdmin,
  onLanguageToggle,
  onThemeToggle,
}: SidebarSettingsMenuProps) {
  const languageValue = language === 'ru' ? 'RU' : 'EN';
  const themeValue = theme === 'dark' ? t('dark') : t('light');

  return (
    <div className="sidebar-settings-menu" role="menu">
      <div className="sidebar-settings-menu__group" role="group" aria-label={t('menu')}>
        <span className="sidebar-settings-menu__label">{t('menu')}</span>
        <button
          className={`sidebar-settings-menu__item sidebar-settings-menu__item--nav sidebar-settings-menu__item--status-${status} ${
            activeView === 'notes' ? 'sidebar-settings-menu__item--active' : ''
          }`}
          type="button"
          role="menuitem"
          onClick={onOpenNotes}
        >
          <NotebookText size={14} />
          <TooltipText value={t('notes')} className="sidebar-settings-menu__text" />
        </button>
        {isAdmin ? (
          <button
            className={`sidebar-settings-menu__item sidebar-settings-menu__item--nav ${
              activeView === 'admin' ? 'sidebar-settings-menu__item--active' : ''
            }`}
            type="button"
            role="menuitem"
            onClick={onOpenAdmin}
          >
            <Shield size={14} />
            <TooltipText value={t('adminPanel')} className="sidebar-settings-menu__text" />
          </button>
        ) : null}
      </div>
      <div className="sidebar-settings-menu__group" role="group" aria-label={t('settings')}>
        <span className="sidebar-settings-menu__label">{t('settings')}</span>
        <button
          className="sidebar-settings-menu__item"
          type="button"
          role="menuitem"
          onClick={onThemeToggle}
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          <TooltipText value={t('theme')} className="sidebar-settings-menu__text" />
          <strong>
            <TooltipText value={themeValue} className="sidebar-settings-menu__value" />
          </strong>
        </button>
        <button
          className="sidebar-settings-menu__item"
          type="button"
          role="menuitem"
          onClick={onLanguageToggle}
        >
          <Languages size={14} />
          <TooltipText value={t('language')} className="sidebar-settings-menu__text" />
          <strong>
            <TooltipText value={languageValue} className="sidebar-settings-menu__value" />
          </strong>
        </button>
      </div>
    </div>
  );
}

interface SidebarProps {
  tree: NoteTreeNode[];
  query: string;
  totalNotes: number;
  selectedId: number | null;
  expanded: Set<number>;
  draggedId: number | null;
  status: SaveStatus;
  isOpen: boolean;
  language: UserLanguage;
  theme: UserTheme;
  t: Translator;
  onClose: () => void;
  onQueryChange: (query: string) => void;
  onCreateNote: () => void;
  onSelectRoot: () => void;
  onDropRoot: () => void;
  onToggleNode: (id: number) => void;
  onSelectNode: (id: number) => void;
  onRenameNode: (id: number, name: string) => void;
  onDeleteNode: (id: number) => void;
  onDragStart: (id: number | null) => void;
  onDropNode: (parentId: number | null) => void;
  onLanguageToggle: () => void;
  onThemeToggle: () => void;
  isAdmin: boolean;
  activeView: 'notes' | 'admin';
  onOpenNotes: () => void;
  onOpenAdmin: () => void;
  onLogout: () => void;
}

export function Sidebar({
  tree,
  query,
  totalNotes,
  selectedId,
  expanded,
  draggedId,
  status,
  isOpen,
  language,
  theme,
  t,
  onClose,
  onQueryChange,
  onCreateNote,
  onSelectRoot,
  onDropRoot,
  onToggleNode,
  onSelectNode,
  onRenameNode,
  onDeleteNode,
  onDragStart,
  onDropNode,
  onLanguageToggle,
  onThemeToggle,
  isAdmin,
  activeView,
  onOpenNotes,
  onOpenAdmin,
  onLogout,
}: SidebarProps) {
  const [isMenuMode, setIsMenuMode] = useState(false);

  return (
    <aside className={`sidebar ${isOpen ? 'sidebar--open' : ''}`}>
      <AmbientCubes area="sidebar" />
      <div className="sidebar__head">
        <div className="brand-lockup">
          <Tooltip label={isMenuMode ? t('notesTree') : t('menu')}>
            <button
              className={`icon-action icon-action--plain sidebar__mode-trigger sidebar__mode-trigger--status-${status} ${
                isMenuMode ? 'sidebar__mode-trigger--active' : ''
              }`}
              type="button"
              aria-label={isMenuMode ? t('notesTree') : t('menu')}
              aria-pressed={isMenuMode}
              onClick={() => setIsMenuMode((current) => !current)}
            >
              {isMenuMode ? <NotebookText size={15} /> : <Menu size={15} />}
            </button>
          </Tooltip>
          <h1>{t('appName')}</h1>
        </div>
        <IconButton
          label={t('close')}
          icon={<ArrowLeftToLine size={17} />}
          onClick={onClose}
          className="sidebar__close"
        />
      </div>

      {isMenuMode ? (
        <SidebarSettingsMenu
          language={language}
          theme={theme}
          t={t}
          activeView={activeView}
          isAdmin={isAdmin}
          status={status}
          onOpenNotes={onOpenNotes}
          onOpenAdmin={onOpenAdmin}
          onLanguageToggle={onLanguageToggle}
          onThemeToggle={onThemeToggle}
        />
      ) : (
        <>
          <div className="sidebar__search-row">
            <label className="search-box">
              <Search size={15} />
              <input
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder={t('search')}
              />
            </label>
            <IconButton
              label={t('createNote')}
              icon={<FilePlus2 size={16} />}
              variant="primary"
              onClick={onCreateNote}
            />
          </div>

          <nav
            className={`tree-panel ${draggedId ? 'tree-panel--root-drop' : ''}`}
            aria-label={t('notesTree')}
            onClick={(event) => {
              const target = event.target as HTMLElement;
              if (!target.closest('.tree__row')) {
                onSelectRoot();
              }
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              onDropRoot();
            }}
          >
            {tree.length > 0 ? (
              <NotesTree
                nodes={tree}
                selectedId={selectedId}
                expanded={expanded}
                draggedId={draggedId}
                onToggle={onToggleNode}
                onSelect={onSelectNode}
                onRename={onRenameNode}
                onDelete={onDeleteNode}
                onDragStart={onDragStart}
                onDrop={onDropNode}
                t={t}
              />
            ) : (
              <div className="empty-state">{t('emptyTree')}</div>
            )}
          </nav>
        </>
      )}

      <div className="sidebar__foot">
        <span className="sidebar__metric">
          <NotebookText size={13} />
          <span>{totalNotes}</span>
        </span>
        <IconButton
          label={t('logout')}
          icon={<LogOut size={16} />}
          variant="danger"
          onClick={onLogout}
          className="sidebar__logout"
        />
      </div>
    </aside>
  );
}
