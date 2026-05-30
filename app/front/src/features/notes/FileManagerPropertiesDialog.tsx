import { X } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';

import { IconButton } from '../../components/IconButton';
import type { Translator } from '../../i18n';
import type { Attachment, AttachmentFolder } from '../../types';
import { formatFileSize } from '../../utils/files';
import {
  buildFolderLocationPath,
  computeFolderStats,
  type FolderStats,
} from './fileManager.helpers';
import { getFileExtension } from './attachmentsPanel.helpers';

export type FileManagerPropertiesTarget =
  | { type: 'attachment'; attachment: Attachment }
  | { type: 'folder'; folder: AttachmentFolder };

interface FileManagerPropertiesDialogProps {
  target: FileManagerPropertiesTarget | null;
  folders: AttachmentFolder[];
  attachments: Attachment[];
  t: Translator;
  onClose: () => void;
}

function formatDateTime(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(locale);
}

function PropertyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="file-manager-properties__row">
      <span className="file-manager-properties__label">{label}</span>
      <span className="file-manager-properties__value">{value}</span>
    </div>
  );
}

export function FileManagerPropertiesDialog({
  target,
  folders,
  attachments,
  t,
  onClose,
}: FileManagerPropertiesDialogProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const locale = typeof navigator !== 'undefined' ? navigator.language : 'ru-RU';

  const folderStats = useMemo<FolderStats | null>(() => {
    if (!target || target.type !== 'folder') {
      return null;
    }
    return computeFolderStats(target.folder.id, folders, attachments);
  }, [attachments, folders, target]);

  useEffect(() => {
    if (!target) {
      return;
    }

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
  }, [onClose, target]);

  if (!target) {
    return null;
  }

  const title =
    target.type === 'attachment' ? target.attachment.fileName : target.folder.name;

  return createPortal(
    <div className="file-manager-properties-layer" role="presentation">
      <div
        ref={panelRef}
        className="file-manager-properties"
        role="dialog"
        aria-modal="true"
        aria-label={t('properties')}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="file-manager-properties__head">
          <h3>{t('properties')}</h3>
          <IconButton label={t('close')} icon={<X size={16} />} onClick={onClose} />
        </header>
        <div className="file-manager-properties__body">
          <PropertyRow label={t('propertyName')} value={title} />
          {target.type === 'attachment' ? (
            <>
              <PropertyRow
                label={t('propertyType')}
                value={target.attachment.mimeType || t('propertyUnknownType')}
              />
              <PropertyRow
                label={t('propertyExtension')}
                value={getFileExtension(target.attachment.fileName).toUpperCase() || '-'}
              />
              <PropertyRow
                label={t('propertySize')}
                value={formatFileSize(target.attachment.size)}
              />
              <PropertyRow
                label={t('propertyCreated')}
                value={formatDateTime(target.attachment.createdAt, locale)}
              />
              <PropertyRow
                label={t('propertyLocation')}
                value={buildFolderLocationPath(
                  target.attachment.folderId ?? null,
                  folders,
                  t('filesRoot'),
                )}
              />
              <PropertyRow
                label={t('propertyNote')}
                value={
                  target.attachment.noteId
                    ? target.attachment.noteName ?? t('noteLinkMissing')
                    : t('propertyNotAttached')
                }
              />
            </>
          ) : (
            <>
              <PropertyRow
                label={t('propertyLocation')}
                value={buildFolderLocationPath(
                  target.folder.parentId,
                  folders,
                  t('filesRoot'),
                )}
              />
              <PropertyRow
                label={t('propertyCreated')}
                value={formatDateTime(target.folder.createdAt, locale)}
              />
              <PropertyRow
                label={t('propertyDirectFiles')}
                value={String(folderStats?.directFileCount ?? 0)}
              />
              <PropertyRow
                label={t('propertyDirectFolders')}
                value={String(folderStats?.directFolderCount ?? 0)}
              />
              <PropertyRow
                label={t('propertyTotalFiles')}
                value={String(folderStats?.totalFileCount ?? 0)}
              />
              <PropertyRow
                label={t('propertyTotalFolders')}
                value={String(folderStats?.totalFolderCount ?? 0)}
              />
              <PropertyRow
                label={t('propertyTotalSize')}
                value={formatFileSize(folderStats?.totalSize ?? 0)}
              />
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
