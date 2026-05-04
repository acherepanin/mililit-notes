import {
  ArrowLeftToLine,
  Check,
  ChevronDown,
  Download,
  FilePlus2,
  Languages,
  ListTree,
  LogOut,
  Menu,
  Moon,
  NotebookText,
  Paperclip,
  Search,
  Shield,
  Star,
  Sun,
  Tags,
  Trash2,
  Upload,
} from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { AmbientCubes } from '../../components/AmbientCubes';
import { IconButton } from '../../components/IconButton';
import { Tooltip } from '../../components/Tooltip';
import { TooltipText } from '../../components/TooltipText';
import type { Translator } from '../../i18n';
import type {
  NoteTreeFilter,
  NoteTreeNode,
  SaveStatus,
  UserLanguage,
  UserTheme,
} from '../../types';
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
  onExportJson: () => void;
  onImportJson: (file: File) => void;
  onOpenTrash: () => void;
  onOpenGlobalAttachments: () => void;
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
  onExportJson,
  onImportJson,
  onOpenTrash,
  onOpenGlobalAttachments,
  onLanguageToggle,
  onThemeToggle,
}: SidebarSettingsMenuProps) {
  const languageValue = language === 'ru' ? 'RU' : 'EN';
  const themeValue = theme === 'dark' ? t('dark') : t('light');
  const importInputRef = useRef<HTMLInputElement | null>(null);

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
              onImportJson(file);
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

interface SidebarTagFilterProps {
  tags: string[];
  activeTag: string | null;
  label: string;
  disabled: boolean;
  onSelect: (tag: string) => void;
}

function SidebarTagFilter({ tags, activeTag, label, disabled, onSelect }: SidebarTagFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [direction, setDirection] = useState<'up' | 'down'>('down');
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const updateMenuPosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) {
      return;
    }

    const rect = button.getBoundingClientRect();
    const freeBelow = window.innerHeight - rect.bottom;
    const freeAbove = rect.top;
    const nextDirection = freeBelow >= 180 || freeBelow >= freeAbove ? 'down' : 'up';
    const maxHeight = Math.max(
      118,
      Math.min(246, (nextDirection === 'down' ? freeBelow : freeAbove) - 12),
    );

    setDirection(nextDirection);
    setMenuStyle({
      left: rect.left,
      top: nextDirection === 'down' ? rect.bottom + 5 : undefined,
      bottom: nextDirection === 'up' ? window.innerHeight - rect.top + 5 : undefined,
      width: Math.max(rect.width, 158),
      maxHeight,
    });
  }, []);

  useLayoutEffect(() => {
    if (isOpen) {
      updateMenuPosition();
    }
  }, [isOpen, updateMenuPosition]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);

    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [isOpen, updateMenuPosition]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  return (
    <span className="sidebar-tag-filter" ref={rootRef}>
      <Tooltip label={label}>
        <button
          className={`sidebar-filter-button ${activeTag ? 'sidebar-filter-button--active' : ''}`}
          type="button"
          ref={buttonRef}
          aria-label={label}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          disabled={disabled}
          onClick={() => setIsOpen((current) => !current)}
        >
          <Tags size={13} />
          <span>{tags.length}</span>
          <ChevronDown size={12} className="sidebar-tag-filter__chevron" />
        </button>
      </Tooltip>
      {isOpen
        ? createPortal(
            <div
              className={`custom-select__menu sidebar-tag-filter__menu custom-select__menu--${direction}`}
              role="listbox"
              id={listboxId}
              aria-label={label}
              ref={menuRef}
              style={menuStyle}
            >
              {tags.map((tag) => {
                const selected = activeTag?.toLowerCase() === tag.toLowerCase();

                return (
                  <button
                    className={`custom-select__option ${selected ? 'custom-select__option--selected' : ''}`}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    key={tag}
                    onClick={() => {
                      onSelect(tag);
                      setIsOpen(false);
                      buttonRef.current?.focus();
                    }}
                  >
                    <TooltipText value={tag} className="custom-select__option-label" />
                    {selected ? <Check size={13} /> : <span />}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}

interface SidebarProps {
  tree: NoteTreeNode[];
  pinnedNodes: NoteTreeNode[];
  query: string;
  treeFilter: NoteTreeFilter;
  tags: string[];
  favoriteCount: number;
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
  onFilterChange: (filter: NoteTreeFilter) => void;
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
  onExportJson: () => void;
  onImportJson: (file: File) => void;
  onOpenTrash: () => void;
  onOpenGlobalAttachments: () => void;
  isAdmin: boolean;
  activeView: 'notes' | 'admin';
  onOpenNotes: () => void;
  onOpenAdmin: () => void;
  onLogout: () => void;
}

export function Sidebar({
  tree,
  pinnedNodes,
  query,
  treeFilter,
  tags,
  favoriteCount,
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
  onFilterChange,
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
  onExportJson,
  onImportJson,
  onOpenTrash,
  onOpenGlobalAttachments,
  isAdmin,
  activeView,
  onOpenNotes,
  onOpenAdmin,
  onLogout,
}: SidebarProps) {
  const [isMenuMode, setIsMenuMode] = useState(false);
  const isFilterActive = (filter: NoteTreeFilter) =>
    filter.kind === treeFilter.kind &&
    (filter.kind !== 'tag' || (treeFilter.kind === 'tag' && filter.tag === treeFilter.tag));
  const tagFilterValue = treeFilter.kind === 'tag' ? treeFilter.tag : null;
  const showPinnedShortcuts =
    treeFilter.kind === 'all' && query.trim().length === 0 && pinnedNodes.length > 0;

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
          onExportJson={onExportJson}
          onImportJson={onImportJson}
          onOpenTrash={onOpenTrash}
          onOpenGlobalAttachments={onOpenGlobalAttachments}
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

          <div className="sidebar-quick-filters" aria-label={t('noteFilters')}>
            <Tooltip label={t('allNotes')}>
              <button
                className={`sidebar-filter-button ${
                  isFilterActive({ kind: 'all' }) ? 'sidebar-filter-button--active' : ''
                }`}
                type="button"
                aria-pressed={isFilterActive({ kind: 'all' })}
                onClick={() => onFilterChange({ kind: 'all' })}
              >
                <ListTree size={13} />
                <span>{totalNotes}</span>
              </button>
            </Tooltip>
            <Tooltip label={t('favorite')}>
              <button
                className={`sidebar-filter-button ${
                  isFilterActive({ kind: 'favorite' }) ? 'sidebar-filter-button--active' : ''
                }`}
                type="button"
                aria-pressed={isFilterActive({ kind: 'favorite' })}
                onClick={() => onFilterChange({ kind: 'favorite' })}
              >
                <Star fill={treeFilter.kind === 'favorite' ? 'currentColor' : 'none'} size={13} />
                <span>{favoriteCount}</span>
              </button>
            </Tooltip>
            <SidebarTagFilter
              tags={tags}
              activeTag={tagFilterValue}
              label={t('tags')}
              disabled={tags.length === 0}
              onSelect={(tag) => onFilterChange({ kind: 'tag', tag })}
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
            {tree.length > 0 || showPinnedShortcuts ? (
              <>
                {showPinnedShortcuts ? (
                  <NotesTree
                    nodes={pinnedNodes}
                    selectedId={selectedId}
                    expanded={expanded}
                    draggedId={draggedId}
                    isDraggable={false}
                    onToggle={onToggleNode}
                    onSelect={onSelectNode}
                    onRename={onRenameNode}
                    onDelete={onDeleteNode}
                    onDragStart={onDragStart}
                    onDrop={onDropNode}
                    t={t}
                  />
                ) : null}
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
                ) : null}
              </>
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
  );
}
