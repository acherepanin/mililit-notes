import { FolderInput, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { TooltipText } from '../../components/TooltipText';
import type { Translator } from '../../i18n';
import { buildFolderPickerOptions, type FolderPickerOption } from './fileManager.helpers';
import type { AttachmentFolder } from '../../types';

interface FileManagerMovePickerProps {
  anchorRect: DOMRect;
  folders: AttachmentFolder[];
  movingFolderIds: number[];
  t: Translator;
  onClose: () => void;
  onSelect: (folderId: number | null) => void;
}

export function FileManagerMovePicker({
  anchorRect,
  folders,
  movingFolderIds,
  t,
  onClose,
  onSelect,
}: FileManagerMovePickerProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState('');
  const options = useMemo(
    () => buildFolderPickerOptions(folders, movingFolderIds, t('filesRoot')),
    [folders, movingFolderIds, t],
  );
  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter(
      (option) =>
        option.name.toLowerCase().includes(normalized) ||
        option.path.toLowerCase().includes(normalized),
    );
  }, [options, query]);

  const style = useMemo(() => {
    const width = 260;
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

  return createPortal(
    <div
      ref={panelRef}
      className="file-manager-move-picker"
      style={style}
      role="dialog"
      aria-label={t('move')}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <label className="file-manager-move-picker__search">
        <Search size={14} aria-hidden />
        <input
          autoFocus
          autoComplete="off"
          value={query}
          placeholder={t('searchFolders')}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="file-manager-move-picker__list" role="listbox">
        <button
          type="button"
          className="file-manager-move-picker__option file-manager-move-picker__option--root"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => onSelect(null)}
        >
          <FolderInput size={14} aria-hidden />
          <span>{t('filesRoot')}</span>
        </button>
        {filteredOptions.map((option: FolderPickerOption) => (
          <button
            key={option.id}
            type="button"
            className="file-manager-move-picker__option"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onSelect(option.id)}
          >
            <FolderInput size={14} aria-hidden />
            <span className="file-manager-move-picker__option-text">
              <TooltipText value={option.name} className="file-manager-move-picker__name" />
              <TooltipText value={option.path} className="file-manager-move-picker__path" />
            </span>
          </button>
        ))}
        {filteredOptions.length === 0 && query.trim() ? (
          <div className="file-manager-move-picker__empty">{t('noFilesFound')}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
