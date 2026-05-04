import { Download, ExternalLink, Eye, FileArchive, Link2, Pencil, Trash2, X } from 'lucide-react';
import type { PointerEvent as ReactPointerEvent } from 'react';

import { IconButton } from '../../components/IconButton';
import { TooltipText } from '../../components/TooltipText';
import type { Translator } from '../../i18n';
import type { Attachment } from '../../types';
import type {
  AttachmentActionMenu,
  AttachmentPreview,
  PreviewFrame,
  ResizeEdge,
} from './attachmentsPanel.helpers';

const RESIZE_EDGES: ResizeEdge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

interface AttachmentPreviewOverlayProps {
  frame: PreviewFrame | null;
  preview: AttachmentPreview | null;
  t: Translator;
  onClose: () => void;
  onDownload: (attachment: Attachment) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onResizeStart: (edge: ResizeEdge, event: ReactPointerEvent<HTMLSpanElement>) => void;
}

export function AttachmentPreviewOverlay({
  frame,
  preview,
  t,
  onClose,
  onDownload,
  onPointerDown,
  onResizeStart,
}: AttachmentPreviewOverlayProps) {
  if (!preview) {
    return null;
  }

  return (
    <aside
      className="attachment-preview attachment-preview--floating"
      draggable={false}
      style={
        frame
          ? {
              left: frame.x,
              top: frame.y,
              width: frame.width,
              height: frame.height,
            }
          : undefined
      }
      onDragStart={(event) => event.preventDefault()}
      onPointerDown={onPointerDown}
    >
      <div className="attachment-preview__head">
        <TooltipText value={preview.attachment.fileName} className="attachment-preview__title" />
        <div className="attachment-preview__actions">
          <IconButton
            label={t('download')}
            icon={<Download size={15} />}
            onClick={() => onDownload(preview.attachment)}
          />
          <IconButton label={t('close')} icon={<X size={15} />} onClick={onClose} />
        </div>
      </div>
      <div className="attachment-preview__body">
        {preview.kind === 'image' ? (
          <img className="attachment-preview__media" src={preview.url} alt="" draggable={false} />
        ) : preview.kind === 'video' ? (
          <video
            className="attachment-preview__media"
            src={preview.url}
            controls
            draggable={false}
          />
        ) : preview.kind === 'audio' ? (
          <audio className="attachment-preview__audio" src={preview.url} controls />
        ) : preview.kind === 'text' ? (
          <pre className="attachment-preview__text">{preview.text}</pre>
        ) : preview.kind === 'pdf' ? (
          <iframe
            className="attachment-preview__frame"
            src={preview.url}
            title={preview.attachment.fileName}
          />
        ) : (
          <div className="attachment-preview__unsupported">
            <FileArchive size={26} />
            <strong>{t('previewUnavailable')}</strong>
            <span>{t('unsupportedPreview')}</span>
            <IconButton
              label={t('download')}
              icon={<Download size={16} />}
              onClick={() => onDownload(preview.attachment)}
            />
          </div>
        )}
      </div>
      {RESIZE_EDGES.map((edge) => (
        <span
          aria-hidden="true"
          className={`attachment-preview__resize attachment-preview__resize--${edge}`}
          key={edge}
          onPointerDown={(event) => onResizeStart(edge, event)}
        />
      ))}
    </aside>
  );
}

interface AttachmentActionMenuOverlayProps {
  attachment: Attachment | null | undefined;
  isAccountScope: boolean;
  menu: AttachmentActionMenu | null;
  selectedNoteId: number | null;
  t: Translator;
  onAttachToggle: (attachment: Attachment) => void;
  onDelete: (attachment: Attachment) => void;
  onDownload: (attachment: Attachment) => void;
  onOpenBrowser: (attachment: Attachment) => void;
  onOpenPreview: (attachment: Attachment) => void;
  onRename: (attachment: Attachment) => void;
}

export function AttachmentActionMenuOverlay({
  attachment,
  isAccountScope,
  menu,
  selectedNoteId,
  t,
  onAttachToggle,
  onDelete,
  onDownload,
  onOpenBrowser,
  onOpenPreview,
  onRename,
}: AttachmentActionMenuOverlayProps) {
  if (!menu || !attachment) {
    return null;
  }

  return (
    <div
      className="attachment-tile__menu attachment-tile__menu--floating"
      style={{ left: menu.x, top: menu.y }}
      onClick={(event) => event.stopPropagation()}
    >
      <button type="button" onClick={() => onOpenPreview(attachment)}>
        <Eye size={14} />
        <TooltipText value={t('openPreview')} className="attachment-tile__menu-label" />
      </button>
      <button type="button" onClick={() => onOpenBrowser(attachment)}>
        <ExternalLink size={14} />
        <TooltipText value={t('openInBrowser')} className="attachment-tile__menu-label" />
      </button>
      <button type="button" onClick={() => onRename(attachment)}>
        <Pencil size={14} />
        <TooltipText value={t('rename')} className="attachment-tile__menu-label" />
      </button>
      <button type="button" onClick={() => onDownload(attachment)}>
        <Download size={14} />
        <TooltipText value={t('download')} className="attachment-tile__menu-label" />
      </button>
      {isAccountScope && (attachment.noteId || selectedNoteId) ? (
        <button type="button" onClick={() => onAttachToggle(attachment)}>
          <Link2 size={14} />
          <TooltipText
            value={attachment.noteId ? t('detachFromNote') : t('attachToNote')}
            className="attachment-tile__menu-label"
          />
        </button>
      ) : null}
      <button
        className="attachment-tile__menu-danger"
        type="button"
        onClick={() => onDelete(attachment)}
      >
        <Trash2 size={14} />
        <TooltipText value={t('delete')} className="attachment-tile__menu-label" />
      </button>
    </div>
  );
}
