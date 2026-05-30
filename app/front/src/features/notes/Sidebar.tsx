import {
  ArrowLeftToLine,
  BrainCircuit,
  ChevronDown,
  Download,
  FilePlus2,
  Languages,
  ListTree,
  LogOut,
  Menu,
  NotebookText,
  Paperclip,
  Search,
  Shield,
  Star,
  Tags,
  Trash2,
  Upload,
} from 'lucide-react';
import { useId, useMemo, useRef, useState, type MouseEvent } from 'react';

import { EmptyState } from '../../components/EmptyState';
import { IconButton } from '../../components/IconButton';
import { PortalListbox } from '../../components/PortalListbox';
import { SettingsMenuItem } from '../../components/SettingsMenuItem';
import { Tooltip } from '../../components/Tooltip';
import { TooltipText } from '../../components/TooltipText';
import { usePortalMenu } from '../../components/usePortalMenu';
import type { Translator } from '../../i18n';
import type { NoteTreeFilter, NoteTreeNode, SaveStatus, UserLanguage, UserTheme } from '../../types';
import { flattenTreeInOrder } from '../../utils/tree';
import { NotesTree } from './NotesTree';
import { SidebarThemePicker } from './SidebarThemePicker';

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
  onThemeChange: (theme: UserTheme) => void;
  aiEnabled: boolean;
  onAiToggle: () => void;
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
  onThemeChange,
  aiEnabled,
  onAiToggle,
}: SidebarSettingsMenuProps) {
  const languageValue = language === 'ru' ? 'RU' : 'EN';
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
        <SettingsMenuItem
          icon={<BrainCircuit size={14} />}
          label={t('aiAssistant')}
          value={aiEnabled ? t('aiEnabledShort') : t('aiDisabledShort')}
          active={aiEnabled}
          ariaPressed={aiEnabled}
          onClick={onAiToggle}
        />
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

interface SidebarTagFilterProps {
  tags: string[];
  activeTag: string | null;
  label: string;
  disabled: boolean;
  onSelect: (tag: string) => void;
}

function SidebarTagFilter({ tags, activeTag, label, disabled, onSelect }: SidebarTagFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const tagOptions = useMemo(
    () => tags.map((tag) => ({ value: tag, label: tag })),
    [tags],
  );
  const { close, direction, menuStyle } = usePortalMenu(isOpen, setIsOpen, buttonRef, menuRef, rootRef, {
    flipThreshold: 180,
    maxHeightCap: 246,
    minWidth: 158,
  });

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
      <PortalListbox
        isOpen={isOpen}
        direction={direction}
        menuStyle={menuStyle}
        listboxId={listboxId}
        label={label}
        menuRef={menuRef}
        value={activeTag ?? tagOptions[0]?.value ?? ''}
        options={tagOptions}
        menuClassName="sidebar-tag-filter__menu"
        onSelect={onSelect}
        onClose={close}
        onFocusAnchor={() => buttonRef.current?.focus()}
      />
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
  selectedNoteIds: Set<number>;
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
  onSelectNoteItem: (
    id: number,
    flatOrder: number[],
    event: Pick<MouseEvent, 'shiftKey' | 'ctrlKey' | 'metaKey'>,
  ) => void;
  onRenameNode: (id: number, name: string) => void;
  onDeleteNode: (id: number) => void;
  onDeleteSelectedNotes: () => void;
  onDragStart: (id: number | null) => void;
  onDropNode: (parentId: number | null) => void;
  onLanguageToggle: () => void;
  onThemeChange: (theme: UserTheme) => void;
  onExportJson: () => void;
  onImportJson: (file: File) => void;
  onOpenTrash: () => void;
  onOpenGlobalAttachments: () => void;
  aiEnabled: boolean;
  onAiToggle: () => void;
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
  selectedNoteIds,
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
  onSelectNoteItem,
  onRenameNode,
  onDeleteNode,
  onDeleteSelectedNotes,
  onDragStart,
  onDropNode,
  onLanguageToggle,
  onThemeChange,
  onExportJson,
  onImportJson,
  onOpenTrash,
  onOpenGlobalAttachments,
  aiEnabled,
  onAiToggle,
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
  const treeFlatOrder = useMemo(() => {
    const order: number[] = [];
    const seen = new Set<number>();
    const appendUnique = (ids: number[]) => {
      for (const id of ids) {
        if (seen.has(id)) {
          continue;
        }
        seen.add(id);
        order.push(id);
      }
    };
    if (showPinnedShortcuts) {
      appendUnique(flattenTreeInOrder(pinnedNodes));
    }
    appendUnique(flattenTreeInOrder(tree));
    return order;
  }, [pinnedNodes, showPinnedShortcuts, tree]);
  const selectedNotesCount = selectedNoteIds.size;

  return (
    <aside className={`sidebar ${isOpen ? 'sidebar--open' : ''}`}>
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
          onThemeChange={onThemeChange}
          aiEnabled={aiEnabled}
          onAiToggle={onAiToggle}
        />
      ) : (
        <>
          <div className="sidebar__search-row">
            <label className="search-box">
              <Search size={15} />
              <input
                autoComplete="off"
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
            aria-multiselectable="true"
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
                    selectedIds={selectedNoteIds}
                    expanded={expanded}
                    draggedId={draggedId}
                    isDraggable={false}
                    onToggle={onToggleNode}
                    onSelect={(id, event) => onSelectNoteItem(id, treeFlatOrder, event)}
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
                    selectedIds={selectedNoteIds}
                    expanded={expanded}
                    draggedId={draggedId}
                    onToggle={onToggleNode}
                    onSelect={(id, event) => onSelectNoteItem(id, treeFlatOrder, event)}
                    onRename={onRenameNode}
                    onDelete={onDeleteNode}
                    onDragStart={onDragStart}
                    onDrop={onDropNode}
                    t={t}
                  />
                ) : null}
              </>
            ) : (
              <EmptyState
                title={t('emptyTree')}
                hint={t('emptyTreeHint')}
                actionLabel={t('createNote')}
                onAction={onCreateNote}
              />
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
          {selectedNotesCount > 1 && !isMenuMode ? (
            <IconButton
              label={t('deleteSelected')}
              icon={<Trash2 size={16} />}
              variant="danger"
              onClick={onDeleteSelectedNotes}
              className="sidebar__bulk-delete"
            />
          ) : null}
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
