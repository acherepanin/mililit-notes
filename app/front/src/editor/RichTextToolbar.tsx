import type { Editor } from '@tiptap/react';
import {
  Bold,
  Code2,
  Clipboard,
  Eye,
  FilePenLine,
  Heading1,
  Heading2,
  Italic,
  KeyRound,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Underline as UnderlineIcon,
  Undo2,
} from 'lucide-react';

import { IconButton } from '../components/IconButton';
import type { Translator } from '../i18n';

interface RichTextToolbarProps {
  editor: Editor | null;
  t: Translator;
  isEditing: boolean;
  onModeChange: (isEditing: boolean) => void;
  onOpenLink: () => void;
  onInsertCopyField: () => void;
  onInsertSecretField: () => void;
}

export function RichTextToolbar({
  editor,
  t,
  isEditing,
  onModeChange,
  onOpenLink,
  onInsertCopyField,
  onInsertSecretField,
}: RichTextToolbarProps) {
  const disabled = !editor || !isEditing;

  return (
    <div className="toolbar" aria-label={t('editorToolbar')}>
      <span className="toolbar__group" role="group" aria-label={t('editorMode')}>
        <IconButton
          label={t('viewMode')}
          icon={<Eye size={16} />}
          variant={!isEditing ? 'active' : 'plain'}
          disabled={!editor}
          onClick={() => onModeChange(false)}
        />
        <IconButton
          label={t('editMode')}
          icon={<FilePenLine size={16} />}
          variant={isEditing ? 'active' : 'plain'}
          disabled={!editor}
          onClick={() => onModeChange(true)}
        />
      </span>
      <span className="toolbar__group" role="group" aria-label={t('textFormat')}>
        <IconButton
          label={t('bold')}
          icon={<Bold size={16} />}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        />
        <IconButton
          label={t('italic')}
          icon={<Italic size={16} />}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        />
        <IconButton
          label={t('underline')}
          icon={<UnderlineIcon size={16} />}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
        />
        <IconButton
          label={t('heading1')}
          icon={<Heading1 size={16} />}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
        />
        <IconButton
          label={t('heading2')}
          icon={<Heading2 size={16} />}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        />
      </span>
      <span className="toolbar__group" role="group" aria-label={t('blocks')}>
        <IconButton
          label={t('bulletList')}
          icon={<List size={16} />}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        />
        <IconButton
          label={t('orderedList')}
          icon={<ListOrdered size={16} />}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        />
        <IconButton
          label={t('quote')}
          icon={<Quote size={16} />}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        />
        <IconButton
          label={t('codeBlock')}
          icon={<Code2 size={16} />}
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
          label={t('copyField')}
          icon={<Clipboard size={16} />}
          disabled={disabled}
          onClick={onInsertCopyField}
        />
        <IconButton
          label={t('credentialField')}
          icon={<KeyRound size={16} />}
          disabled={disabled}
          onClick={onInsertSecretField}
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
    </div>
  );
}
