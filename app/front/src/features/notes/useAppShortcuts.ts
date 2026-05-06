import type { Editor } from '@tiptap/react';
import { useEffect, useMemo } from 'react';

import type { Translator } from '../../i18n';
import type { UserLanguage, UserTheme } from '../../types';

export interface ShortcutItem {
  keys: string[];
  label: string;
}

interface UseAppShortcutsParams {
  activeModal: boolean;
  editor: Editor | null;
  isAuthenticated: boolean;
  isEditorEditing: boolean;
  language: UserLanguage;
  theme: UserTheme;
  selectedId: number | null;
  createDefaultNote: (parentId: number | null) => void;
  formatEditorCode: () => void;
  insertDataField: () => void;
  openLinkModal: () => void;
  openTemplatesModal: () => void;
  saveEditorContent: () => void;
  setMobileTreeOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  toggleCodeBlock: () => void;
  updateLanguage: (language: UserLanguage) => void;
  updateTheme: (theme: UserTheme) => void;
}

export function useShortcutItems(t: Translator): ShortcutItem[] {
  return useMemo(
    () => [
      { keys: ['Ctrl', 'S'], label: t('shortcutSave') },
      { keys: ['Ctrl', 'Shift', 'P'], label: t('commandPalette') },
      { keys: ['Ctrl', 'P'], label: t('templates') },
      { keys: ['Ctrl', 'Alt', 'N'], label: t('shortcutNewFocused') },
      { keys: ['Ctrl', '/'], label: t('shortcutSearch') },
      { keys: ['Ctrl', 'K'], label: t('shortcutLink') },
      { keys: ['Ctrl', 'Alt', 'F'], label: t('shortcutFormatCode') },
      { keys: ['Ctrl', 'Alt', '`'], label: t('shortcutCodeBlock') },
      { keys: ['Ctrl', 'Alt', 'C'], label: t('shortcutDataField') },
      { keys: ['Ctrl', 'Alt', 'T'], label: t('shortcutTheme') },
      { keys: ['Ctrl', 'Alt', 'G'], label: t('shortcutLanguage') },
      { keys: ['Ctrl', '\\'], label: t('shortcutSidebar') },
      { keys: ['Ctrl', 'B'], label: t('shortcutBold') },
      { keys: ['Ctrl', 'I'], label: t('shortcutItalic') },
      { keys: ['Ctrl', 'U'], label: t('shortcutUnderline') },
      { keys: ['Ctrl', 'Z'], label: t('shortcutUndo') },
      { keys: ['Ctrl', 'Y'], label: t('shortcutRedo') },
    ],
    [t],
  );
}

export function useAppShortcuts({
  activeModal,
  editor,
  isAuthenticated,
  isEditorEditing,
  language,
  theme,
  selectedId,
  createDefaultNote,
  formatEditorCode,
  insertDataField,
  openLinkModal,
  openTemplatesModal,
  saveEditorContent,
  setMobileTreeOpen,
  toggleCodeBlock,
  updateLanguage,
  updateTheme,
}: UseAppShortcutsParams): void {
  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      const primary = event.ctrlKey || event.metaKey;
      const code = event.code;

      if (!primary || !isAuthenticated) {
        return;
      }

      if (code === 'KeyS') {
        event.preventDefault();
        if (isEditorEditing) {
          saveEditorContent();
        }
        return;
      }

      if (activeModal) {
        return;
      }

      if (code === 'KeyP' && !event.altKey && !event.shiftKey) {
        event.preventDefault();
        openTemplatesModal();
        return;
      }

      if (!event.altKey && isEditorEditing) {
        const editorCommands: Partial<Record<string, () => void>> = {
          KeyB: () => editor?.chain().focus().toggleBold().run(),
          KeyI: () => editor?.chain().focus().toggleItalic().run(),
          KeyU: () => editor?.chain().focus().toggleUnderline().run(),
          KeyZ: () => editor?.chain().focus().undo().run(),
          KeyY: () => editor?.chain().focus().redo().run(),
        };
        const command = editorCommands[code];

        if (command) {
          event.preventDefault();
          command();
          return;
        }
      }

      if (event.altKey && code === 'KeyN') {
        event.preventDefault();
        createDefaultNote(selectedId);
        return;
      }

      if (code === 'Slash') {
        event.preventDefault();
        setMobileTreeOpen(true);
        document.querySelector<HTMLInputElement>('.search-box input')?.focus();
        return;
      }

      if (code === 'KeyK') {
        event.preventDefault();
        if (isEditorEditing) {
          openLinkModal();
        }
        return;
      }

      if (event.altKey && code === 'KeyF') {
        event.preventDefault();
        if (isEditorEditing) {
          formatEditorCode();
        }
        return;
      }

      if (event.altKey && event.code === 'Backquote') {
        event.preventDefault();
        if (isEditorEditing) {
          toggleCodeBlock();
        }
        return;
      }

      if (event.altKey && code === 'KeyC') {
        event.preventDefault();
        if (isEditorEditing) {
          insertDataField();
        }
        return;
      }

      if (event.altKey && code === 'KeyT') {
        event.preventDefault();
        updateTheme(theme === 'dark' ? 'light' : 'dark');
        return;
      }

      if (event.altKey && code === 'KeyG') {
        event.preventDefault();
        updateLanguage(language === 'ru' ? 'en' : 'ru');
        return;
      }

      if (code === 'Backslash') {
        event.preventDefault();
        setMobileTreeOpen(true);
      }
    };

    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, [
    activeModal,
    createDefaultNote,
    editor,
    formatEditorCode,
    insertDataField,
    isAuthenticated,
    isEditorEditing,
    language,
    openLinkModal,
    openTemplatesModal,
    saveEditorContent,
    selectedId,
    setMobileTreeOpen,
    theme,
    toggleCodeBlock,
    updateLanguage,
    updateTheme,
  ]);
}
