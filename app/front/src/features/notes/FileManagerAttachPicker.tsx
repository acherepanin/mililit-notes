import { BookOpen, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { TooltipText } from '../../components/TooltipText';
import type { Translator } from '../../i18n';
import type { NotePickerOption } from './fileManager.helpers';

interface FileManagerAttachPickerProps {
  anchorRect: DOMRect;
  linkedNotes: NotePickerOption[];
  noteOptions: NotePickerOption[];
  t: Translator;
  onClose: () => void;
  onSelect: (noteId: number) => void;
}

export function FileManagerAttachPicker({
  anchorRect,
  linkedNotes,
  noteOptions,
  t,
  onClose,
  onSelect,
}: FileManagerAttachPickerProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState('');
  const linkedIds = useMemo(() => new Set(linkedNotes.map((note) => note.id)), [linkedNotes]);
  const otherOptions = useMemo(
    () => noteOptions.filter((option) => !linkedIds.has(option.id)),
    [linkedIds, noteOptions],
  );
  const filteredLinked = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return linkedNotes;
    }
    return linkedNotes.filter(
      (option) =>
        option.name.toLowerCase().includes(normalized) ||
        option.path.toLowerCase().includes(normalized),
    );
  }, [linkedNotes, query]);
  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return otherOptions;
    }
    return otherOptions.filter(
      (option) =>
        option.name.toLowerCase().includes(normalized) ||
        option.path.toLowerCase().includes(normalized),
    );
  }, [otherOptions, query]);

  const style = useMemo(() => {
    const width = 280;
    const maxHeight = 320;
    let left = anchorRect.right + 6;
    let top = anchorRect.top;
    if (left + width > window.innerWidth - 12) {
      left = Math.max(12, anchorRect.left - width - 6);
    }
    if (top + maxHeight > window.innerHeight - 12) {
      top = Math.max(12, window.innerHeight - maxHeight - 12);
    }
    return { left, top, width, maxHeight };
  }, [anchorRect]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (panelRef.current?.contains(event.target as Node)) {
        return;
      }
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const renderOption = (option: NotePickerOption, isCurrent = false) => (
    <button
      key={`${isCurrent ? 'linked' : 'note'}-${option.id}`}
      type="button"
      className={`file-manager-move-picker__option ${
        isCurrent ? 'file-manager-move-picker__option--current' : ''
      }`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={() => onSelect(option.id)}
    >
      <BookOpen size={14} aria-hidden />
      <span className="file-manager-move-picker__option-text">
        <TooltipText value={option.name} className="file-manager-move-picker__name" />
        <TooltipText value={option.path} className="file-manager-move-picker__path" />
      </span>
    </button>
  );

  return createPortal(
    <div
      ref={panelRef}
      className="file-manager-move-picker"
      style={style}
      role="dialog"
      aria-label={t('attach')}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <label className="file-manager-move-picker__search">
        <Search size={14} aria-hidden />
        <input
          autoFocus
          autoComplete="off"
          value={query}
          placeholder={t('searchNotes')}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="file-manager-move-picker__list" role="listbox">
        {filteredLinked.map((option) => renderOption(option, true))}
        {filteredOptions.map((option) => renderOption(option))}
        {filteredLinked.length === 0 && filteredOptions.length === 0 ? (
          <div className="file-manager-move-picker__empty">{t('noFilesFound')}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
