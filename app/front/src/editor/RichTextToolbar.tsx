import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import {
  Bold,
  BookTemplate,
  Code2,
  Eye,
  FilePenLine,
  Heading1,
  Heading2,
  History,
  Italic,
  KeyRound,
  Link as LinkIcon,
  List,
  ListOrdered,
  Paperclip,
  Quote,
  Redo2,
  Share2,
  Underline as UnderlineIcon,
  Undo2,
} from 'lucide-react';

import { IconButton } from '../components/IconButton';
import { ShortcutHint, type ShortcutItem } from '../components/ShortcutHint';
import type { Translator } from '../i18n';
import { useHorizontalWheel } from '../utils/horizontalWheel';

interface RichTextToolbarProps {
  editor: Editor | null;
  t: Translator;
  isEditing: boolean;
  hasSelectedNote: boolean;
  shortcuts: ShortcutItem[];
  onModeChange: (isEditing: boolean) => void;
  onOpenLink: () => void;
  onInsertDataField: () => void;
  onOpenVersions: () => void;
  onOpenTemplates: () => void;
  onOpenShareLinks: () => void;
  onOpenAttachments: () => void;
}

export function RichTextToolbar({
  editor,
  t,
  isEditing,
  hasSelectedNote,
  shortcuts,
  onModeChange,
  onOpenLink,
  onInsertDataField,
  onOpenVersions,
  onOpenTemplates,
  onOpenShareLinks,
  onOpenAttachments,
}: RichTextToolbarProps) {
  const disabled = !editor || !isEditing;
  const noteActionDisabled = !editor || !hasSelectedNote;
  const toolbarRef = useHorizontalWheel<HTMLDivElement>();
  const formatState =
    useEditorState({
      editor,
      selector: ({ editor: current }) => ({
        bold: current?.isActive('bold') ?? false,
        italic: current?.isActive('italic') ?? false,
        underline: current?.isActive('underline') ?? false,
        heading1: current?.isActive('heading', { level: 1 }) ?? false,
        heading2: current?.isActive('heading', { level: 2 }) ?? false,
        bulletList: current?.isActive('bulletList') ?? false,
        orderedList: current?.isActive('orderedList') ?? false,
        blockquote: current?.isActive('blockquote') ?? false,
        codeBlock: current?.isActive('codeBlock') ?? false,
      }),
    }) ?? {
      bold: false,
      italic: false,
      underline: false,
      heading1: false,
      heading2: false,
      bulletList: false,
      orderedList: false,
      blockquote: false,
      codeBlock: false,
    };

  return (
    <div ref={toolbarRef} className="toolbar" aria-label={t('editorToolbar')}>
      <span className="toolbar__group" role="group" aria-label={t('editorMode')}>
        <IconButton
          label={t('viewMode')}
          icon={<Eye size={16} />}
          variant={!isEditing ? 'active' : 'plain'}
          aria-pressed={!isEditing}
          disabled={!editor}
          onClick={() => onModeChange(false)}
        />
        <IconButton
          label={t('editMode')}
          icon={<FilePenLine size={16} />}
          variant={isEditing ? 'active' : 'plain'}
          aria-pressed={isEditing}
          disabled={!editor}
          onClick={() => onModeChange(true)}
        />
        <ShortcutHint label={t('shortcuts')} items={shortcuts} />
      </span>
      <span className="toolbar__group" role="group" aria-label={t('textFormat')}>
        <IconButton
          label={t('bold')}
          icon={<Bold size={16} />}
          variant={formatState.bold ? 'active' : 'plain'}
          aria-pressed={formatState.bold}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        />
        <IconButton
          label={t('italic')}
          icon={<Italic size={16} />}
          variant={formatState.italic ? 'active' : 'plain'}
          aria-pressed={formatState.italic}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        />
        <IconButton
          label={t('underline')}
          icon={<UnderlineIcon size={16} />}
          variant={formatState.underline ? 'active' : 'plain'}
          aria-pressed={formatState.underline}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
        />
        <IconButton
          label={t('heading1')}
          icon={<Heading1 size={16} />}
          variant={formatState.heading1 ? 'active' : 'plain'}
          aria-pressed={formatState.heading1}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
        />
        <IconButton
          label={t('heading2')}
          icon={<Heading2 size={16} />}
          variant={formatState.heading2 ? 'active' : 'plain'}
          aria-pressed={formatState.heading2}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        />
      </span>
      <span className="toolbar__group" role="group" aria-label={t('blocks')}>
        <IconButton
          label={t('bulletList')}
          icon={<List size={16} />}
          variant={formatState.bulletList ? 'active' : 'plain'}
          aria-pressed={formatState.bulletList}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        />
        <IconButton
          label={t('orderedList')}
          icon={<ListOrdered size={16} />}
          variant={formatState.orderedList ? 'active' : 'plain'}
          aria-pressed={formatState.orderedList}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        />
        <IconButton
          label={t('quote')}
          icon={<Quote size={16} />}
          variant={formatState.blockquote ? 'active' : 'plain'}
          aria-pressed={formatState.blockquote}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        />
        <IconButton
          label={t('codeBlock')}
          icon={<Code2 size={16} />}
          variant={formatState.codeBlock ? 'active' : 'plain'}
          aria-pressed={formatState.codeBlock}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
        />
      </span>
      <span className="toolbar__group" role="group" aria-label={t('inserts')}>
        <IconButton
          label={t('applyLink')}
          icon={<LinkIcon size={16} />}
          disabled={disabled}
          onClick={onOpenLink}
        />
        <IconButton
          label={t('dataField')}
          icon={<KeyRound size={16} />}
          disabled={disabled}
          onClick={onInsertDataField}
        />
      </span>
      <span className="toolbar__group" role="group" aria-label={t('history')}>
        <IconButton
          label={t('undo')}
          icon={<Undo2 size={16} />}
          disabled={disabled}
          onClick={() => editor?.chain().focus().undo().run()}
        />
        <IconButton
          label={t('redo')}
          icon={<Redo2 size={16} />}
          disabled={disabled}
          onClick={() => editor?.chain().focus().redo().run()}
        />
      </span>
      <span className="toolbar__group" role="group" aria-label={t('noteActions')}>
        <IconButton
          label={t('versions')}
          icon={<History size={16} />}
          disabled={noteActionDisabled}
          onClick={onOpenVersions}
        />
        <IconButton
          label={t('templates')}
          icon={<BookTemplate size={16} />}
          disabled={!editor}
          onClick={onOpenTemplates}
        />
        <IconButton
          label={t('shareLinks')}
          icon={<Share2 size={16} />}
          disabled={noteActionDisabled}
          onClick={onOpenShareLinks}
        />
        <IconButton
          label={t('attachments')}
          icon={<Paperclip size={16} />}
          disabled={noteActionDisabled}
          onClick={onOpenAttachments}
        />
      </span>
    </div>
  );
}
