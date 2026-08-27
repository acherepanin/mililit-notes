"use client";

import { getMarkRange } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import TextAlign from "@tiptap/extension-text-align";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Braces,
  Heading1,
  Heading2,
  Italic,
  KeyRound,
  Link as LinkIcon,
  List,
  ListChecks,
  ListOrdered,
  Quote,
  Redo2,
  RotateCcw,
  Strikethrough,
  Underline,
  Undo2,
} from "lucide-react";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { ApiError } from "./client-providers";
import { CodeBlockWithTools, selectCurrentCodeBlockText } from "./code-block";
import { CopyField, copyFieldLabels } from "./copy-field";
import { EditorLinkDialog } from "./editor-link-dialog";
import type { NoteRecord } from "./notes-api";
import { AppTooltip } from "./ui-controls";

interface Draft {
  contentHtml: string;
  contentText: string;
  name: string;
}

interface LinkSelection {
  editing: boolean;
  from: number;
  to: number;
}

export type SaveState = "conflict" | "error" | "saved" | "saving";

function sameDraft(left: Draft, right: Draft) {
  return (
    left.name === right.name &&
    left.contentHtml === right.contentHtml &&
    left.contentText === right.contentText
  );
}

export function NoteEditor({
  note,
  onReload,
  onSave,
  onSaveCopy,
  onSaveStateChange,
}: {
  note: NoteRecord;
  onReload(): Promise<NoteRecord>;
  onSave(draft: Draft, revision: number): Promise<NoteRecord>;
  onSaveCopy(draft: Draft): Promise<void>;
  onSaveStateChange?(state: SaveState): void;
}) {
  const initialDraft: Draft = {
    contentHtml: note.contentHtml,
    contentText: note.contentText,
    name: note.name,
  };
  const [name, setName] = useState(note.name);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkEditing, setLinkEditing] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [linkHasSelection, setLinkHasSelection] = useState(false);
  const [linkText, setLinkText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const linkSelectionRef = useRef<LinkSelection>({
    editing: false,
    from: 0,
    to: 0,
  });
  const latestRef = useRef(initialDraft);
  const savedRef = useRef(initialDraft);
  const revisionRef = useRef(note.revision);
  const savingRef = useRef(false);
  const blockedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(
    () => onSaveStateChange?.(saveState),
    [onSaveStateChange, saveState],
  );
  // Queued writes require stable identity; React Compiler cannot preserve this recursive callback.
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const flush = useCallback(async () => {
    if (savingRef.current || blockedRef.current) return;
    const draft = latestRef.current;
    if (sameDraft(draft, savedRef.current)) {
      setSaveState("saved");
      return;
    }
    savingRef.current = true;
    setSaveState("saving");
    try {
      const updated = await onSave(draft, revisionRef.current);
      revisionRef.current = updated.revision;
      savedRef.current = draft;
      setSaveState("saved");
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        blockedRef.current = true;
        setSaveState("conflict");
      } else {
        setSaveState("error");
      }
    } finally {
      savingRef.current = false;
      if (
        !blockedRef.current &&
        !sameDraft(latestRef.current, savedRef.current)
      ) {
        timerRef.current = setTimeout(() => void flush(), 0);
      }
    }
  }, [onSave]);

  const schedule = useCallback(() => {
    clearTimeout(timerRef.current);
    if (blockedRef.current) return;
    setSaveState("saving");
    timerRef.current = setTimeout(() => void flush(), 700);
  }, [flush]);

  const editor = useEditor({
    content: note.contentHtml,
    editorProps: {
      attributes: {
        "aria-label": "Текст заметки",
        class: "note-editor__content",
        role: "textbox",
      },
      handleKeyDown: (view, event) =>
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        (event.code === "KeyA" || event.key.toLocaleLowerCase() === "a")
          ? selectCurrentCodeBlockText(view)
          : false,
    },
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        heading: { levels: [1, 2, 3] },
        link: {
          HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
          autolink: true,
          openOnClick: false,
        },
      }),
      CodeBlockWithTools,
      CopyField,
      TaskList,
      TaskItem.configure({ nested: true }),
      TextAlign.configure({
        alignments: ["left", "center", "right"],
        types: ["heading", "paragraph"],
      }),
      Placeholder.configure({ placeholder: "Начните писать или вызовите AI…" }),
    ],
    immediatelyRender: false,
    onUpdate: ({ editor: instance }) => {
      latestRef.current = {
        contentHtml: instance.getHTML() === "<p></p>" ? "" : instance.getHTML(),
        contentText: instance.getText({ blockSeparator: "\n" }),
        name: latestRef.current.name,
      };
      schedule();
    },
  });

  const formatState = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      blockquote: current?.isActive("blockquote") ?? false,
      bold: current?.isActive("bold") ?? false,
      bulletList: current?.isActive("bulletList") ?? false,
      codeBlock: current?.isActive("codeBlock") ?? false,
      heading1: current?.isActive("heading", { level: 1 }) ?? false,
      heading2: current?.isActive("heading", { level: 2 }) ?? false,
      italic: current?.isActive("italic") ?? false,
      link: current?.isActive("link") ?? false,
      orderedList: current?.isActive("orderedList") ?? false,
      strike: current?.isActive("strike") ?? false,
      taskList: current?.isActive("taskList") ?? false,
      textAlign: current?.isActive({ textAlign: "center" })
        ? "center"
        : current?.isActive({ textAlign: "right" })
          ? "right"
          : "left",
      underline: current?.isActive("underline") ?? false,
    }),
  });

  const reset = useCallback(
    (record: NoteRecord) => {
      const draft = {
        contentHtml: record.contentHtml,
        contentText: record.contentText,
        name: record.name,
      };
      clearTimeout(timerRef.current);
      latestRef.current = draft;
      savedRef.current = draft;
      revisionRef.current = record.revision;
      blockedRef.current = false;
      setName(record.name);
      setSaveState("saved");
      editor?.commands.setContent(record.contentHtml, { emitUpdate: false });
    },
    [editor],
  );

  useEffect(
    () => () => {
      clearTimeout(timerRef.current);
      if (
        !blockedRef.current &&
        !sameDraft(latestRef.current, savedRef.current)
      ) {
        void flush();
      }
    },
    [flush],
  );

  if (!editor) return <div className="editor-loading">Загрузка редактора…</div>;

  const insertCopyField = () => {
    editor
      .chain()
      .focus()
      .insertContent({
        attrs: {
          kind: "text",
          label: copyFieldLabels.text,
          value: "",
        },
        type: "copyField",
      })
      .run();
  };

  const openLink = () => {
    const selection = editor.state.selection;
    const editing = editor.isActive("link");
    const markRange = editing
      ? getMarkRange(selection.$from, editor.schema.marks.link)
      : undefined;
    const from = markRange?.from ?? selection.from;
    const to = markRange?.to ?? selection.to;
    linkSelectionRef.current = { editing, from, to };
    setLinkEditing(editing);
    setLinkError("");
    setLinkHasSelection(from !== to);
    setLinkText(editor.state.doc.textBetween(from, to));
    setLinkUrl(String(editor.getAttributes("link").href ?? ""));
    setLinkOpen(true);
  };

  const applyLink = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const href = linkUrl.trim();
    let parsed: URL;
    try {
      parsed = new URL(href);
    } catch {
      setLinkError("Укажите полный адрес, например https://example.com");
      return;
    }
    if (!["http:", "https:", "mailto:"].includes(parsed.protocol)) {
      setLinkError("Поддерживаются только ссылки http, https и mailto");
      return;
    }
    const selection = linkSelectionRef.current;
    const chain = editor
      .chain()
      .focus()
      .setTextSelection({ from: selection.from, to: selection.to });
    if (selection.from === selection.to && linkText.trim()) {
      chain
        .insertContent({
          marks: [{ attrs: { href: parsed.href }, type: "link" }],
          text: linkText.trim(),
          type: "text",
        })
        .run();
    } else {
      chain.setLink({ href: parsed.href }).run();
    }
    setLinkOpen(false);
  };

  const removeLink = () => {
    const selection = linkSelectionRef.current;
    editor
      .chain()
      .focus()
      .setTextSelection({ from: selection.from, to: selection.to })
      .unsetLink()
      .run();
    setLinkOpen(false);
  };

  const tools = [
    {
      active: formatState?.bold ?? false,
      icon: Bold,
      label: "Полужирный",
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      active: formatState?.italic ?? false,
      icon: Italic,
      label: "Курсив",
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      active: formatState?.underline ?? false,
      icon: Underline,
      label: "Подчёркнутый",
      run: () => editor.chain().focus().toggleUnderline().run(),
    },
    {
      active: formatState?.strike ?? false,
      icon: Strikethrough,
      label: "Зачёркнутый",
      run: () => editor.chain().focus().toggleStrike().run(),
    },
    {
      active: formatState?.heading1 ?? false,
      icon: Heading1,
      label: "Заголовок 1",
      run: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      active: formatState?.heading2 ?? false,
      icon: Heading2,
      label: "Заголовок",
      run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      active: formatState?.bulletList ?? false,
      icon: List,
      label: "Маркированный список",
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      active: formatState?.orderedList ?? false,
      icon: ListOrdered,
      label: "Нумерованный список",
      run: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      active: formatState?.taskList ?? false,
      icon: ListChecks,
      label: "Список задач",
      run: () => editor.chain().focus().toggleTaskList().run(),
    },
    {
      active: formatState?.blockquote ?? false,
      icon: Quote,
      label: "Цитата",
      run: () => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      active: formatState?.codeBlock ?? false,
      icon: Braces,
      label: "Блок кода",
      run: () => editor.chain().focus().toggleCodeBlock().run(),
    },
    {
      active: formatState?.textAlign === "left",
      icon: AlignLeft,
      label: "Выровнять по левому краю",
      run: () => editor.chain().focus().setTextAlign("left").run(),
    },
    {
      active: formatState?.textAlign === "center",
      icon: AlignCenter,
      label: "Выровнять по центру",
      run: () => editor.chain().focus().setTextAlign("center").run(),
    },
    {
      active: formatState?.textAlign === "right",
      icon: AlignRight,
      label: "Выровнять по правому краю",
      run: () => editor.chain().focus().setTextAlign("right").run(),
    },
  ];

  return (
    <div className="note-editor">
      <div
        aria-label="Форматирование"
        className="editor-toolbar"
        role="toolbar"
      >
        {[tools.slice(0, 6), tools.slice(6, 11), tools.slice(11)].map(
          (group, groupIndex) => (
            <span className="editor-toolbar__group" key={groupIndex}>
              {group.map(({ active, icon: Icon, label, run }) => (
                <AppTooltip key={label} label={label}>
                  <button
                    aria-label={label}
                    aria-pressed={active}
                    onClick={run}
                    type="button"
                  >
                    <Icon size={16} />
                  </button>
                </AppTooltip>
              ))}
            </span>
          ),
        )}
        <span className="editor-toolbar__group">
          <AppTooltip label="Добавить ссылку">
            <button
              aria-label="Добавить ссылку"
              aria-pressed={formatState?.link ?? false}
              onMouseDown={(event) => event.preventDefault()}
              onClick={openLink}
              type="button"
            >
              <LinkIcon size={16} />
            </button>
          </AppTooltip>
          <AppTooltip label="Добавить поле данных">
            <button
              aria-label="Добавить поле данных"
              onClick={insertCopyField}
              type="button"
            >
              <KeyRound size={16} />
            </button>
          </AppTooltip>
        </span>
        <span className="editor-toolbar__group">
          <AppTooltip label="Отменить">
            <button
              aria-label="Отменить"
              disabled={!editor.can().undo()}
              onClick={() => editor.chain().focus().undo().run()}
              type="button"
            >
              <Undo2 size={16} />
            </button>
          </AppTooltip>
          <AppTooltip label="Повторить">
            <button
              aria-label="Повторить"
              disabled={!editor.can().redo()}
              onClick={() => editor.chain().focus().redo().run()}
              type="button"
            >
              <Redo2 size={16} />
            </button>
          </AppTooltip>
        </span>
      </div>
      <div className="document-scroll">
        <article className="note-document note-document--editor">
          <textarea
            aria-label="Название заметки"
            className="note-title-input"
            maxLength={160}
            onChange={(event) => {
              setName(event.target.value);
              latestRef.current = {
                ...latestRef.current,
                name: event.target.value.trim() || "Без названия",
              };
              schedule();
            }}
            rows={1}
            value={name}
          />
          <EditorContent editor={editor} />
        </article>
      </div>
      {saveState === "conflict" ? (
        <div className="editor-recovery" role="alert">
          <div>
            <strong>Заметка изменилась в другом окне</strong>
            <span>
              Ваш текст сохранён локально в этом окне. Выберите безопасное
              продолжение.
            </span>
          </div>
          <button
            onClick={() => void onSaveCopy(latestRef.current)}
            type="button"
          >
            Сохранить копию
          </button>
          <button onClick={() => void onReload().then(reset)} type="button">
            <RotateCcw size={14} />
            Загрузить серверную
          </button>
        </div>
      ) : null}
      {saveState === "error" ? (
        <div className="editor-recovery" role="alert">
          <strong>Не удалось сохранить изменения</strong>
          <button onClick={() => void flush()} type="button">
            Повторить
          </button>
        </div>
      ) : null}
      <EditorLinkDialog
        editing={linkEditing}
        error={linkError}
        hasSelection={linkHasSelection}
        onApply={applyLink}
        onOpenChange={(open) => {
          setLinkOpen(open);
          if (!open) setLinkError("");
        }}
        onRemove={removeLink}
        onTextChange={setLinkText}
        onUrlChange={(value) => {
          setLinkUrl(value);
          setLinkError("");
        }}
        open={linkOpen}
        text={linkText}
        url={linkUrl}
      />
    </div>
  );
}
