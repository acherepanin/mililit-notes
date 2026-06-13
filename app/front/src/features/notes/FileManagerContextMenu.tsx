import {
  ArrowRightLeft,
  ClipboardCopy,
  ClipboardPaste,
  Download,
  ExternalLink,
  Eye,
  FolderInput,
  Info,
  Link2,
  Scissors,
  UploadCloud,
  Pencil,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { TooltipText } from '../../components/TooltipText';
import type { Translator } from '../../i18n';
import type { Attachment, AttachmentFolder } from '../../types';
import { FileManagerAttachPicker } from './FileManagerAttachPicker';
import { FileManagerMovePicker } from './FileManagerMovePicker';
import { getLinkedNotesFromAttachments, type NotePickerOption } from './fileManager.helpers';

export interface FileManagerContextMenuState {
  x: number;
  y: number;
}

function FileManagerMenuSeparator() {
  return <div className="file-manager-menu__separator" role="separator" />;
}

interface FileManagerContextMenuProps {
  menu: FileManagerContextMenuState | null;
  selectedAttachments: Attachment[];
  selectedFolders: AttachmentFolder[];
  allFolders: AttachmentFolder[];
  noteOptions: NotePickerOption[];
  canUpload: boolean;
  isAccountScope: boolean;
  hasClipboard: boolean;
  t: Translator;
  onClose: () => void;
  onOpenPreview: (attachment: Attachment) => void;
  onOpenBrowser: (attachment: Attachment) => void;
  onRenameAttachment: (attachment: Attachment) => void;
  onRenameFolder: (folder: AttachmentFolder) => void;
  onOpenProperties: (target: { type: 'attachment'; attachment: Attachment } | { type: 'folder'; folder: AttachmentFolder }) => void;
  onDownload: (attachmentIds: number[], folderIds: number[]) => void;
  onDeleteAttachments: (ids: number[]) => void;
  onDeleteFolders: (ids: number[]) => void;
  onAttachToNote: (ids: number[], noteId: number | null) => void;
  onMoveItems: (attachmentIds: number[], folderIds: number[], targetFolderId: number | null) => void;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onUpload?: () => void;
  onNewFolder?: () => void;
}

export function FileManagerContextMenu({
  menu,
  selectedAttachments,
  selectedFolders,
  allFolders,
  isAccountScope,
  noteOptions,
  hasClipboard,
  t,
  onClose,
  onOpenPreview,
  onOpenBrowser,
  onRenameAttachment,
  onRenameFolder,
  onOpenProperties,
  onDownload,
  onDeleteAttachments,
  onDeleteFolders,
  onAttachToNote,
  onMoveItems,
  onCut,
  onCopy,
  onPaste,
  canUpload,
  onUpload,
  onNewFolder,
}: FileManagerContextMenuProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const moveButtonRef = useRef<HTMLButtonElement | null>(null);
  const attachButtonRef = useRef<HTMLButtonElement | null>(null);
  const [movePickerAnchor, setMovePickerAnchor] = useState<DOMRect | null>(null);
  const [attachPickerAnchor, setAttachPickerAnchor] = useState<DOMRect | null>(null);
  const primaryAttachment = selectedAttachments[0];
  const primaryFolder = selectedFolders[0];
  const totalSelected = selectedAttachments.length + selectedFolders.length;
  const isMulti = totalSelected > 1;
  const attachmentIds = selectedAttachments.map((attachment) => attachment.id);
  const folderIds = selectedFolders.map((folder) => folder.id);
  const linkedNotes = useMemo(
    () => getLinkedNotesFromAttachments(selectedAttachments, noteOptions, t('noteLinkMissing')),
    [noteOptions, selectedAttachments, t],
  );
  const canDetach =
    isAccountScope && selectedAttachments.some((attachment) => attachment.noteId !== null);
  const showAttachAction =
    isAccountScope && selectedAttachments.length > 0 && noteOptions.length > 0;
  const showMoveAction = isAccountScope && totalSelected > 0;
  const showAttachmentActions = selectedAttachments.length > 0;
  const showFolderActions = selectedFolders.length > 0;
  const showDownloadAction = showAttachmentActions || showFolderActions;
  const canShowProperties = !isMulti && (primaryAttachment || primaryFolder);

  useEffect(() => {
    if (!menu) {
      setMovePickerAnchor(null);
      setAttachPickerAnchor(null);
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        onClose();
        return;
      }
      if (panelRef.current?.contains(target)) {
        return;
      }
      if (target instanceof Element && target.closest('.file-manager-move-picker')) {
        return;
      }
      if (target instanceof Element && target.closest('.file-manager-properties')) {
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
  }, [menu, onClose]);

  if (!menu) {
    return null;
  }

  if (totalSelected === 0) {
    return createPortal(
      <div
        ref={panelRef}
        className="file-manager-menu"
        style={{ left: menu.x, top: menu.y }}
        role="menu"
        onContextMenu={(event) => event.preventDefault()}
      >
        {canUpload && onUpload ? (
          <button type="button" role="menuitem" onClick={onUpload}>
            <UploadCloud size={14} />
            <TooltipText value={t('upload')} className="file-manager-menu__label" />
          </button>
        ) : null}
        {isAccountScope && onNewFolder ? (
          <button type="button" role="menuitem" onClick={onNewFolder}>
            <FolderInput size={14} />
            <TooltipText value={t('newFolder')} className="file-manager-menu__label" />
          </button>
        ) : null}
        {isAccountScope && hasClipboard ? (
          <button type="button" role="menuitem" onClick={onPaste}>
            <ClipboardPaste size={14} />
            <TooltipText value={t('paste')} className="file-manager-menu__label" />
          </button>
        ) : null}
      </div>,
      document.body,
    );
  }

  return createPortal(
    <>
      <div
        ref={panelRef}
        className="file-manager-menu"
        style={{ left: menu.x, top: menu.y }}
        role="menu"
        onContextMenu={(event) => event.preventDefault()}
      >
        {isAccountScope ? (
          <div className="file-manager-menu__group">
            <button type="button" role="menuitem" onClick={onCut}>
              <Scissors size={14} />
              <TooltipText value={t('cut')} className="file-manager-menu__label" />
            </button>
            <button type="button" role="menuitem" onClick={onCopy}>
              <ClipboardCopy size={14} />
              <TooltipText value={t('copy')} className="file-manager-menu__label" />
            </button>
            {hasClipboard ? (
              <button type="button" role="menuitem" onClick={onPaste}>
                <ClipboardPaste size={14} />
                <TooltipText value={t('paste')} className="file-manager-menu__label" />
              </button>
            ) : null}
          </div>
        ) : null}

        {showAttachmentActions && !isMulti && primaryAttachment ? (
          <div className="file-manager-menu__group">
            <button type="button" role="menuitem" onClick={() => onOpenPreview(primaryAttachment)}>
              <Eye size={14} />
              <TooltipText value={t('openPreview')} className="file-manager-menu__label" />
            </button>
            <button type="button" role="menuitem" onClick={() => onOpenBrowser(primaryAttachment)}>
              <ExternalLink size={14} />
              <TooltipText value={t('openInBrowser')} className="file-manager-menu__label" />
            </button>
            <button type="button" role="menuitem" onClick={() => onRenameAttachment(primaryAttachment)}>
              <Pencil size={14} />
              <TooltipText value={t('rename')} className="file-manager-menu__label" />
            </button>
          </div>
        ) : null}

        {showFolderActions && !isMulti && primaryFolder ? (
          <div className="file-manager-menu__group">
            <button type="button" role="menuitem" onClick={() => onRenameFolder(primaryFolder)}>
              <Pencil size={14} />
              <TooltipText value={t('rename')} className="file-manager-menu__label" />
            </button>
          </div>
        ) : null}

        {canShowProperties || showDownloadAction ? (
          <div className="file-manager-menu__group">
            {canShowProperties ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  if (primaryAttachment) {
                    onOpenProperties({ type: 'attachment', attachment: primaryAttachment });
                  } else if (primaryFolder) {
                    onOpenProperties({ type: 'folder', folder: primaryFolder });
                  }
                }}
              >
                <Info size={14} />
                <TooltipText value={t('properties')} className="file-manager-menu__label" />
              </button>
            ) : null}
            {showDownloadAction ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => onDownload(attachmentIds, folderIds)}
              >
                <Download size={14} />
                <TooltipText
                  value={isMulti ? t('downloadSelected') : t('download')}
                  className="file-manager-menu__label"
                />
              </button>
            ) : null}
          </div>
        ) : null}

        {isAccountScope && (showAttachmentActions || canDetach) ? (
          <>
            <FileManagerMenuSeparator />
            <div className="file-manager-menu__group">
              {showAttachmentActions ? (
                <button
                  ref={attachButtonRef}
                  type="button"
                  role="menuitem"
                  className={attachPickerAnchor ? 'file-manager-menu__item--active' : ''}
                  disabled={!showAttachAction}
                  title={!showAttachAction ? t('noNotesAvailable') : undefined}
                  onClick={() => {
                    if (!showAttachAction) return;
                    const rect = attachButtonRef.current?.getBoundingClientRect();
                    if (!rect) return;
                    setAttachPickerAnchor((current) => (current ? null : rect));
                    setMovePickerAnchor(null);
                  }}
                >
                  <Link2 size={14} />
                  <TooltipText value={t('attach')} className="file-manager-menu__label" />
                </button>
              ) : null}
              {canDetach ? (
                <button type="button" role="menuitem" onClick={() => onAttachToNote(attachmentIds, null)}>
                  <Link2 size={14} />
                  <TooltipText value={t('detachFromNote')} className="file-manager-menu__label" />
                </button>
              ) : null}
            </div>
          </>
        ) : null}

        {showMoveAction ? (
          <>
            <FileManagerMenuSeparator />
            <div className="file-manager-menu__group">
              <button
                ref={moveButtonRef}
                type="button"
                role="menuitem"
                className={movePickerAnchor ? 'file-manager-menu__item--active' : ''}
                onClick={() => {
                  const rect = moveButtonRef.current?.getBoundingClientRect();
                  if (!rect) return;
                  setMovePickerAnchor((current) => (current ? null : rect));
                  setAttachPickerAnchor(null);
                }}
              >
                <ArrowRightLeft size={14} />
                <TooltipText value={t('move')} className="file-manager-menu__label" />
              </button>
            </div>
          </>
        ) : null}

        <FileManagerMenuSeparator />
        <div className="file-manager-menu__group file-manager-menu__group--danger">
          <button
            className="file-manager-menu__danger"
            type="button"
            role="menuitem"
            onClick={() => {
              if (folderIds.length) onDeleteFolders(folderIds);
              if (attachmentIds.length) onDeleteAttachments(attachmentIds);
            }}
          >
            <Trash2 size={14} />
            <TooltipText
              value={isMulti ? t('deleteSelected') : t('delete')}
              className="file-manager-menu__label"
            />
          </button>
        </div>

      </div>
      {attachPickerAnchor ? (
        <FileManagerAttachPicker
          anchorRect={attachPickerAnchor}
          linkedNotes={linkedNotes}
          noteOptions={noteOptions}
          t={t}
          onClose={() => setAttachPickerAnchor(null)}
          onSelect={(noteId) => {
            setAttachPickerAnchor(null);
            onAttachToNote(attachmentIds, noteId);
            onClose();
          }}
        />
      ) : null}
      {movePickerAnchor ? (
        <FileManagerMovePicker
          anchorRect={movePickerAnchor}
          folders={allFolders}
          movingFolderIds={folderIds}
          t={t}
          onClose={() => setMovePickerAnchor(null)}
          onSelect={(targetFolderId) => {
            setMovePickerAnchor(null);
            onMoveItems(attachmentIds, folderIds, targetFolderId);
            onClose();
          }}
        />
      ) : null}
    </>,
    document.body,
  );
}
