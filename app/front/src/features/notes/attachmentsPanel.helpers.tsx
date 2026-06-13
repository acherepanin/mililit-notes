import {
  File as FileIcon,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileText,
  FileVideo,
} from 'lucide-react';

import type { Attachment } from '../../types';

export type PreviewKind = 'image' | 'pdf' | 'text' | 'video' | 'audio' | 'unsupported';

export interface AttachmentPreview {
  attachment: Attachment;
  kind: PreviewKind;
  text?: string;
  url: string;
}

export interface PreviewFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AttachmentActionMenu {
  id: number;
  x: number;
  y: number;
}

export type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export type PreviewInteraction =
  | { type: 'move'; startX: number; startY: number; frame: PreviewFrame }
  | { type: 'resize'; edge: ResizeEdge; startX: number; startY: number; frame: PreviewFrame };

export const PREVIEW_MIN_WIDTH = 300;
export const PREVIEW_MIN_HEIGHT = 230;
export const PREVIEW_MARGIN = 8;
export const ATTACHMENT_MENU_WIDTH = 166;
export const ATTACHMENT_MENU_HEIGHT = 196;

const TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'json',
  'yaml',
  'yml',
  'env',
  'csv',
  'log',
  'xml',
  'html',
  'css',
  'js',
  'ts',
  'tsx',
  'jsx',
  'sql',
  'sh',
  'ps1',
]);

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function getFileExtension(fileName: string): string {
  const parts = fileName.toLowerCase().split('.');
  return parts.length > 1 ? (parts.at(-1) ?? '') : '';
}

export function getPreviewKind(attachment: Attachment): PreviewKind {
  const extension = getFileExtension(attachment.fileName);
  if (attachment.mimeType.startsWith('image/')) return 'image';
  if (attachment.mimeType === 'application/pdf' || extension === 'pdf') return 'pdf';
  if (attachment.mimeType.startsWith('video/')) return 'video';
  if (attachment.mimeType.startsWith('audio/')) return 'audio';
  if (attachment.mimeType.startsWith('text/') || TEXT_EXTENSIONS.has(extension)) return 'text';
  return 'unsupported';
}

export function getAttachmentIcon(attachment: Attachment) {
  const kind = getPreviewKind(attachment);
  const extension = getFileExtension(attachment.fileName);
  if (kind === 'image') return <FileImage size={26} />;
  if (kind === 'video') return <FileVideo size={26} />;
  if (kind === 'audio') return <FileAudio size={26} />;
  if (kind === 'text') {
    return extension === 'json' || extension === 'xml' ? (
      <FileCode size={26} />
    ) : (
      <FileText size={26} />
    );
  }
  if (extension === 'zip') return <FileArchive size={26} />;
  return <FileIcon size={26} />;
}

export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function clampPreviewFrame(frame: PreviewFrame, bounds: DOMRect | undefined): PreviewFrame {
  if (!bounds) {
    return frame;
  }

  const maxWidth = Math.max(PREVIEW_MIN_WIDTH, bounds.width - PREVIEW_MARGIN * 2);
  const maxHeight = Math.max(PREVIEW_MIN_HEIGHT, bounds.height - PREVIEW_MARGIN * 2);
  const width = Math.min(Math.max(frame.width, PREVIEW_MIN_WIDTH), maxWidth);
  const height = Math.min(Math.max(frame.height, PREVIEW_MIN_HEIGHT), maxHeight);
  const maxX = Math.max(PREVIEW_MARGIN, bounds.width - width - PREVIEW_MARGIN);
  const maxY = Math.max(PREVIEW_MARGIN, bounds.height - height - PREVIEW_MARGIN);

  return {
    x: Math.min(Math.max(frame.x, PREVIEW_MARGIN), maxX),
    y: Math.min(Math.max(frame.y, PREVIEW_MARGIN), maxY),
    width,
    height,
  };
}
