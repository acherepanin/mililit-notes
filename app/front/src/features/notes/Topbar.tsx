import { Menu, Pin, Star, Tag } from 'lucide-react';

import { IconButton } from '../../components/IconButton';
import { Tooltip } from '../../components/Tooltip';
import type { Translator } from '../../i18n';
import type { Note, NoteDraft, Tag as GlobalTag, UserLanguage } from '../../types';
import { NoteHeaderMenu } from './NoteHeaderMenu';

interface TopbarProps {
  selectedNote: Note | null;
  draft: NoteDraft;
  tags: GlobalTag[];
  t: Translator;
  language: UserLanguage;
  isEditing: boolean;
  onOpenSidebar: () => void;
  onDraftNameChange: (name: string) => void;
  onSave: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
  onTogglePinned: () => void;
  onTagsChange: (tags: string[]) => void;
  onCreateTag: (name: string) => Promise<void>;
  onUpdateTag: (tag: GlobalTag, name: string) => Promise<void>;
  onDeleteTag: (tag: GlobalTag) => Promise<void>;
}

export function Topbar({
  selectedNote,
  draft,
  tags,
  t,
  language,
  isEditing,
  onOpenSidebar,
  onDraftNameChange,
  onSave,
  onDelete,
  onToggleFavorite,
  onTogglePinned,
  onTagsChange,
  onCreateTag,
  onUpdateTag,
  onDeleteTag,
}: TopbarProps) {
  const dateLocale = language === 'ru' ? 'ru-RU' : 'en-US';
  const noteTags = selectedNote?.tags ?? [];
  const hasTitleIndicators = Boolean(
    selectedNote?.isFavorite || selectedNote?.isPinned || noteTags.length > 0,
  );

  return (
    <header className="topbar">
      <div className="title-block">
        <div className={`title-line ${hasTitleIndicators ? 'title-line--with-indicators' : ''}`}>
          {hasTitleIndicators ? (
            <span className="title-indicators">
              {selectedNote?.isFavorite ? (
                <Tooltip label={t('favorite')}>
                  <span className="title-indicator">
                    <Star fill="currentColor" size={13} />
                  </span>
                </Tooltip>
              ) : null}
              {selectedNote?.isPinned ? (
                <Tooltip label={t('pinned')}>
                  <span className="title-indicator">
                    <Pin fill="currentColor" size={13} />
                  </span>
                </Tooltip>
              ) : null}
              {noteTags.length > 0 ? (
                <Tooltip label={noteTags.join(', ')}>
                  <span className="title-indicator">
                    <Tag size={13} />
                  </span>
                </Tooltip>
              ) : null}
            </span>
          ) : null}
          <input
            className="title-input"
            autoComplete="off"
            value={draft.name}
            placeholder=""
            onChange={(event) => onDraftNameChange(event.target.value)}
            disabled={!selectedNote || !isEditing}
          />
        </div>
        <span className="title-meta">
          {selectedNote
            ? `${t('updated')} ${new Date(selectedNote.updatedAt).toLocaleString(dateLocale)}`
            : ''}
        </span>
      </div>
      <div className="topbar__actions">
        <IconButton
          label={t('menu')}
          icon={<Menu size={17} />}
          onClick={onOpenSidebar}
          className="topbar__menu"
        />
        <NoteHeaderMenu
          note={selectedNote}
          tags={tags}
          t={t}
          isEditing={isEditing}
          onSave={onSave}
          onDelete={onDelete}
          onToggleFavorite={onToggleFavorite}
          onTogglePinned={onTogglePinned}
          onTagsChange={onTagsChange}
          onCreateTag={onCreateTag}
          onUpdateTag={onUpdateTag}
          onDeleteTag={onDeleteTag}
        />
      </div>
    </header>
  );
}
