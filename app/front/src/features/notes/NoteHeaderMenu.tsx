import {
  Check,
  MoreHorizontal,
  Pencil,
  Pin,
  Plus,
  Save,
  Search,
  Star,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { IconButton } from '../../components/IconButton';
import { TooltipText } from '../../components/TooltipText';
import type { Translator } from '../../i18n';
import type { Note, Tag as GlobalTag } from '../../types';

interface NoteHeaderMenuProps {
  note: Note | null;
  tags: GlobalTag[];
  t: Translator;
  isEditing: boolean;
  onSave: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
  onTogglePinned: () => void;
  onTagsChange: (tags: string[]) => void;
  onCreateTag: (name: string) => Promise<void>;
  onUpdateTag: (tag: GlobalTag, name: string) => Promise<void>;
  onDeleteTag: (tag: GlobalTag) => Promise<void>;
}

export function NoteHeaderMenu({
  note,
  tags,
  t,
  isEditing,
  onSave,
  onDelete,
  onToggleFavorite,
  onTogglePinned,
  onTagsChange,
  onCreateTag,
  onUpdateTag,
  onDeleteTag,
}: NoteHeaderMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingTagId, setEditingTagId] = useState<number | 'new' | null>(null);
  const [tagDraft, setTagDraft] = useState('');
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const tagListRef = useRef<HTMLDivElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const panelId = useId();
  const noteTags = note?.tags ?? [];
  const normalizedTagQuery = searchQuery.trim().toLowerCase();
  const sortedTags = useMemo(
    () => [...tags].sort((left, right) => left.name.localeCompare(right.name)),
    [tags],
  );
  const visibleTags = useMemo(
    () =>
      normalizedTagQuery
        ? sortedTags.filter((tag) => tag.name.toLowerCase().includes(normalizedTagQuery))
        : sortedTags,
    [normalizedTagQuery, sortedTags],
  );

  const updatePosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) {
      return;
    }

    const rect = button.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 20);
    const left = Math.min(Math.max(rect.right - width, 10), window.innerWidth - width - 10);
    const freeBelow = window.innerHeight - rect.bottom;
    const freeAbove = rect.top;
    const direction = freeBelow >= 420 || freeBelow >= freeAbove ? 'down' : 'up';
    const maxHeight = Math.max(
      280,
      Math.min(520, (direction === 'down' ? freeBelow : freeAbove) - 12),
    );

    setPanelStyle({
      left,
      top: direction === 'down' ? rect.bottom + 7 : undefined,
      bottom: direction === 'up' ? window.innerHeight - rect.top + 7 : undefined,
      width,
      maxHeight,
    });
  }, []);

  useLayoutEffect(() => {
    if (isOpen) {
      updatePosition();
    }
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !panelRef.current?.contains(target)) {
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

  const toggleTag = (tagName: string) => {
    if (!note) {
      return;
    }

    const hasTag = noteTags.some(
      (currentTag) => currentTag.toLowerCase() === tagName.toLowerCase(),
    );
    onTagsChange(
      hasTag ? noteTags.filter((currentTag) => currentTag !== tagName) : [...noteTags, tagName],
    );
  };

  const startCreateTag = () => {
    setSearchQuery('');
    setIsCreatingTag(true);
    setEditingTagId('new');
    setTagDraft('');
    window.requestAnimationFrame(() => {
      if (tagListRef.current) {
        tagListRef.current.scrollTop = 0;
      }
      tagInputRef.current?.focus();
    });
  };

  const startEditTag = (tag: GlobalTag) => {
    setIsCreatingTag(false);
    setEditingTagId(tag.id);
    setTagDraft(tag.name);
  };

  const cancelTagEditing = () => {
    setEditingTagId(null);
    setTagDraft('');
    setIsCreatingTag(false);
  };

  const commitTagEditing = () => {
    const nextName = tagDraft.trim().toLowerCase();

    if (editingTagId === 'new') {
      if (!nextName) {
        cancelTagEditing();
        return;
      }

      onCreateTag(nextName)
        .then(() => cancelTagEditing())
        .catch(() => undefined);
      return;
    }

    const tag = tags.find((currentTag) => currentTag.id === editingTagId);
    if (!tag) {
      cancelTagEditing();
      return;
    }

    if (!nextName || nextName === tag.name) {
      cancelTagEditing();
      return;
    }

    onUpdateTag(tag, nextName)
      .then(() => cancelTagEditing())
      .catch(() => undefined);
  };

  useEffect(() => {
    if (editingTagId !== null) {
      tagInputRef.current?.focus();
      tagInputRef.current?.select();
    }
  }, [editingTagId]);

  const renderTagRow = (tag: GlobalTag | null) => {
    const isNew = tag === null;
    const rowId = isNew ? 'new' : tag.id;
    const isRowEditing = editingTagId === rowId;
    const tagName = tag?.name ?? '';
    const selected =
      !isNew && noteTags.some((noteTag) => noteTag.toLowerCase() === tagName.toLowerCase());

    return (
      <div
        className={`note-header-menu__tag-row ${selected ? 'note-header-menu__tag-row--selected' : ''} ${
          isRowEditing ? 'note-header-menu__tag-row--editing' : ''
        }`}
        key={isNew ? 'new-tag' : tag.id}
        role={!isRowEditing && !isNew ? 'button' : undefined}
        tabIndex={!isRowEditing && !isNew ? 0 : undefined}
        onClick={() => {
          if (!isRowEditing && !isNew) {
            toggleTag(tagName);
          }
        }}
        onKeyDown={(event) => {
          if (isRowEditing || isNew) {
            return;
          }

          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggleTag(tagName);
          }
        }}
      >
        <Tag size={13} className="note-header-menu__tag-icon" />
        {isRowEditing ? (
          <input
            className="note-header-menu__tag-edit"
            ref={tagInputRef}
            autoComplete="off"
            value={tagDraft}
            onBlur={commitTagEditing}
            onChange={(event) => setTagDraft(event.target.value.toLowerCase())}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.currentTarget.blur();
              }

              if (event.key === 'Escape') {
                cancelTagEditing();
              }
            }}
            aria-label={t('addTag')}
          />
        ) : (
          <span className="note-header-menu__tag-choice">
            <TooltipText value={tagName} className="note-header-menu__tag-name" />
            {selected ? <Check size={13} /> : <span />}
          </span>
        )}
        <div
          className="note-header-menu__tag-actions"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {isRowEditing ? (
            <IconButton
              label={t('save')}
              icon={<Save size={13} />}
              variant="primary"
              onMouseDown={(event) => event.preventDefault()}
              onClick={commitTagEditing}
            />
          ) : (
            <IconButton
              label={t('editName')}
              icon={<Pencil size={13} />}
              disabled={isNew}
              onClick={() => tag && startEditTag(tag)}
            />
          )}
          <IconButton
            label={t('removeTag')}
            icon={<X size={13} />}
            variant="danger"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (isNew) {
                cancelTagEditing();
                return;
              }

              if (!tag) {
                return;
              }

              void onDeleteTag(tag).catch(() => undefined);
            }}
          />
        </div>
      </div>
    );
  };

  return (
    <span className="note-header-menu" ref={rootRef}>
      <IconButton
        label={t('noteActions')}
        icon={<MoreHorizontal size={16} />}
        ref={buttonRef}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen((current) => !current)}
      />

      {isOpen
        ? createPortal(
            <div
              className="note-header-menu__panel"
              id={panelId}
              ref={panelRef}
              role="dialog"
              aria-label={t('noteActions')}
              style={panelStyle}
            >
              <div className="note-header-menu__actions" role="group" aria-label={t('noteActions')}>
                <span className="note-header-menu__action-side">
                  <IconButton
                    label={t('favorite')}
                    icon={<Star fill={note?.isFavorite ? 'currentColor' : 'none'} size={15} />}
                    variant={note?.isFavorite ? 'active' : 'plain'}
                    disabled={!note}
                    aria-pressed={Boolean(note?.isFavorite)}
                    onClick={onToggleFavorite}
                  />
                  <IconButton
                    label={t('pinned')}
                    icon={<Pin fill={note?.isPinned ? 'currentColor' : 'none'} size={15} />}
                    variant={note?.isPinned ? 'active' : 'plain'}
                    disabled={!note}
                    aria-pressed={Boolean(note?.isPinned)}
                    onClick={onTogglePinned}
                  />
                </span>
                <span className="note-header-menu__action-side note-header-menu__action-side--right">
                  <IconButton
                    label={t('save')}
                    icon={<Save size={15} />}
                    variant="primary"
                    disabled={!note || !isEditing}
                    onClick={onSave}
                  />
                  <IconButton
                    label={t('delete')}
                    icon={<Trash2 size={15} />}
                    variant="danger"
                    disabled={!note}
                    onClick={onDelete}
                  />
                </span>
              </div>

              <div className="note-header-menu__tag-form">
                <label className="note-header-menu__tag-input">
                  <Search size={13} />
                  <input
                    autoComplete="off"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value.toLowerCase())}
                    placeholder={t('search')}
                  />
                </label>
                <IconButton
                  label={t('addTag')}
                  icon={<Plus size={15} />}
                  variant="primary"
                  disabled={isCreatingTag}
                  onClick={startCreateTag}
                />
              </div>

              <div className="note-header-menu__tag-list" aria-label={t('tags')} ref={tagListRef}>
                {isCreatingTag ? renderTagRow(null) : null}
                {visibleTags.length > 0
                  ? visibleTags.map((tag) => renderTagRow(tag))
                  : !isCreatingTag && (
                      <div className="note-header-menu__empty">{t('emptyTree')}</div>
                    )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
