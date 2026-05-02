import { Menu, Save, Trash2 } from 'lucide-react';

import { IconButton } from '../../components/IconButton';
import { ShortcutHint, type ShortcutItem } from '../../components/ShortcutHint';
import type { Translator } from '../../i18n';
import type { Note, NoteDraft, UserLanguage } from '../../types';

interface TopbarProps {
  selectedNote: Note | null;
  draft: NoteDraft;
  t: Translator;
  language: UserLanguage;
  shortcuts: ShortcutItem[];
  isEditing: boolean;
  onOpenSidebar: () => void;
  onDraftNameChange: (name: string) => void;
  onSave: () => void;
  onDelete: () => void;
}

export function Topbar({
  selectedNote,
  draft,
  t,
  language,
  shortcuts,
  isEditing,
  onOpenSidebar,
  onDraftNameChange,
  onSave,
  onDelete,
}: TopbarProps) {
  const dateLocale = language === 'ru' ? 'ru-RU' : 'en-US';

  return (
    <header className="topbar">
      <div className="title-block">
        <input
          className="title-input"
          value={draft.name}
          placeholder=""
          onChange={(event) => onDraftNameChange(event.target.value)}
          disabled={!selectedNote || !isEditing}
        />
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
        <ShortcutHint label={t('shortcuts')} items={shortcuts} />
        <IconButton
          label={t('save')}
          icon={<Save size={16} />}
          variant="primary"
          onClick={onSave}
          disabled={!selectedNote || !isEditing}
        />
        <IconButton
          label={t('delete')}
          icon={<Trash2 size={16} />}
          variant="danger"
          onClick={onDelete}
          disabled={!selectedNote}
        />
      </div>
    </header>
  );
}
