import {
  ArrowLeftToLine,
  ChevronDown,
  FilePlus2,
  ListTree,
  LogOut,
  Menu,
  NotebookText,
  Search,
  Star,
  Tags,
  Trash2,
} from 'lucide-react';
import { useId, useMemo, useRef, useState, type MouseEvent } from 'react';

import { EmptyState } from '../../components/EmptyState';
import { IconButton } from '../../components/IconButton';
import { PortalListbox } from '../../components/PortalListbox';
import { Tooltip } from '../../components/Tooltip';
import { usePortalMenu } from '../../components/usePortalMenu';
import type { Translator } from '../../i18n';
import type { NoteTreeFilter, NoteTreeNode, SaveStatus, UserLanguage, UserTheme } from '../../types';
import { flattenTreeInOrder } from '../../utils/tree';
import { NotesTree } from './NotesTree';
import { SidebarSettingsMenu } from './SidebarSettingsMenu';

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
          isAdmin={isAdmin}
          status={status}
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
