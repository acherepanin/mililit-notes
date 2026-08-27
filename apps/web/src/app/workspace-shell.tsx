"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Command } from "cmdk";
import {
  Archive,
  Bell,
  Clock3,
  CloudCheck,
  CloudOff,
  CreditCard,
  FilePlus2,
  Files,
  FileText,
  Hash,
  History,
  LayoutTemplate,
  LoaderCircle,
  Menu,
  Mic,
  Minimize2,
  MoreHorizontal,
  Paperclip,
  PanelLeftClose,
  Search,
  Send,
  Settings,
  Share2,
  Sparkles,
  Square,
  Star,
  Tags,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import {
  type ChangeEvent,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from "react";
import { Toaster, toast } from "sonner";

import type { ConstellationActivity } from "./constellation-background";
import { aiApi } from "./ai-api";
import type { CurrentUser } from "./auth-boundary";
import type { FileUploadTask } from "./file-workspace";
import { filesApi, type StoredFile } from "./files-api";
import { notificationsApi, type NotificationItem } from "./notifications-api";
import { NoteEditor, type SaveState } from "./note-editor";
import { NoteTree } from "./note-tree";
import {
  notesApi,
  type NoteRecord,
  type NoteSearchResult,
  type NoteTreeNode,
} from "./notes-api";
import type { ThemeMode } from "./settings-dialog";
import {
  AppIconButton,
  AppTooltip,
  SearchableSelect,
  UiProvider,
} from "./ui-controls";
import {
  type ActiveVoiceSession,
  microphoneErrorMessage,
  openMicrophone,
  speakVoice,
  startRealtimeVoice,
  startRecordedVoice,
  transcribeVoice,
} from "./voice-api";
import type { WorkspaceTool } from "./workspace-tools";

const ConstellationBackground = dynamic(
  () =>
    import("./constellation-background").then(
      (module) => module.ConstellationBackground,
    ),
  { ssr: false },
);

const SettingsDialog = dynamic(
  () => import("./settings-dialog").then((module) => module.SettingsDialog),
  { ssr: false },
);

const FileNavigation = dynamic(
  () => import("./file-workspace").then((module) => module.FileNavigation),
  {
    loading: () => <div className="tree-status">Загрузка файлов…</div>,
    ssr: false,
  },
);

const FileWorkspace = dynamic(
  () => import("./file-workspace").then((module) => module.FileWorkspace),
  {
    loading: () => <div className="document-state">Загрузка файлов…</div>,
    ssr: false,
  },
);

const WorkspaceTools = dynamic(
  () => import("./workspace-tools").then((module) => module.WorkspaceTools),
  { ssr: false },
);

type NavigationMode = "files" | "notes";

interface AiResponseView {
  error: string | null;
  noteId: number | null;
  status: "cancelled" | "completed" | "failed" | "idle" | "streaming";
  text: string;
}

interface AiUploadView {
  key: string;
  name: string;
  noteId: number | null;
}

const emptyAiResponse: AiResponseView = {
  error: null,
  noteId: null,
  status: "idle",
  text: "",
};

function firstNoteId(nodes: NoteTreeNode[]): number | null {
  return nodes[0]?.id ?? null;
}

function notificationCopy(notification: NotificationItem, english: boolean) {
  const planName =
    typeof notification.payload.planName === "string"
      ? notification.payload.planName
      : english
        ? "the selected plan"
        : "выбранный тариф";
  const renewed = notification.kind === "subscription_renew";
  return {
    detail: renewed
      ? english
        ? `${planName} has been renewed.`
        : `Тариф ${planName} продлён.`
      : english
        ? `${planName} is now active.`
        : `Тариф ${planName} активирован.`,
    title: renewed
      ? english
        ? "Subscription renewed"
        : "Подписка продлена"
      : english
        ? "Plan activated"
        : "Тариф активирован",
  };
}

function NoteSearchResults({
  isError,
  isPending,
  onRetry,
  onSelect,
  results,
}: {
  isError: boolean;
  isPending: boolean;
  onRetry(): void;
  onSelect(id: number): void;
  results: NoteSearchResult[];
}) {
  if (isPending) return <div className="tree-status">Поиск по заметкам…</div>;
  if (isError)
    return (
      <div className="tree-status tree-status--error">
        <span>Не удалось выполнить поиск</span>
        <button onClick={onRetry} type="button">
          Повторить
        </button>
      </div>
    );
  if (results.length === 0)
    return (
      <div className="tree-empty">
        <Search size={18} />
        <p>Ничего не найдено</p>
      </div>
    );

  return (
    <div aria-label="Результаты поиска" className="note-search-results">
      {results.map((result) => (
        <button
          key={result.id}
          onClick={() => onSelect(result.id)}
          type="button"
        >
          <span>
            <strong>{result.name}</strong>
            <small>{result.snippet || "Заметка без текста"}</small>
          </span>
          {result.tags.length > 0 ? (
            <i>{result.tags.map((tag) => `#${tag}`).join(" ")}</i>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function BrandMark({ animated = false }: { animated?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`brand-mark ${animated ? "brand-mark--animated" : ""}`}
    >
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

function SaveStatus({
  language,
  state,
}: {
  language: "en" | "ru";
  state: SaveState;
}) {
  const status = {
    conflict: {
      label: language === "en" ? "Save conflict" : "Конфликт сохранения",
      icon: CloudOff,
    },
    error: {
      label: language === "en" ? "Save error" : "Ошибка сохранения",
      icon: CloudOff,
    },
    saved: {
      label:
        language === "en" ? "All changes saved" : "Все изменения сохранены",
      icon: CloudCheck,
    },
    saving: {
      label: language === "en" ? "Saving changes" : "Сохраняем изменения",
      icon: LoaderCircle,
    },
  }[state];
  const Icon = status.icon;
  return (
    <AppTooltip label={status.label} side="bottom">
      <span
        aria-label={status.label}
        className={`sync-state sync-state--${state}`}
        role="status"
      >
        <Icon
          aria-hidden="true"
          className={state === "saving" ? "is-spinning" : undefined}
          size={16}
        />
      </span>
    </AppTooltip>
  );
}

function AiComposer({
  attachments,
  onCancel,
  onAttach,
  onDismissResponse,
  onRemoveAttachment,
  onSend,
  onVoice,
  response,
  sending,
  uploading,
  voiceActive,
}: {
  attachments: StoredFile[];
  onCancel(): void;
  onAttach(): void;
  onDismissResponse(): void;
  onRemoveAttachment(id: number): void;
  onSend(message: string, model: string | null): Promise<string | null>;
  onVoice(): void;
  response: AiResponseView;
  sending: boolean;
  uploading: AiUploadView[];
  voiceActive: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const open = () => {
      setOpen(true);
      window.requestAnimationFrame(() => textareaRef.current?.focus());
    };
    window.addEventListener("notes-open-ai", open);
    return () => window.removeEventListener("notes-open-ai", open);
  }, []);
  const submit = async () => {
    if (!message.trim() && attachments.length === 0) return;
    if ((await onSend(message.trim(), null)) !== null) {
      setMessage("");
    }
  };

  if (!open) {
    return (
      <motion.div
        animate={{ opacity: 1, scale: 1 }}
        className="ai-launch-wrap"
        initial={{ opacity: 0, scale: 0.82 }}
        transition={{ duration: 0.2 }}
      >
        <AppIconButton
          className="ai-launch"
          label="Открыть AI"
          onClick={() => setOpen(true)}
        >
          <span aria-hidden="true" className="ai-launch__spark">
            <Sparkles size={21} />
          </span>
          <i aria-hidden="true" className="ai-launch__particle is-one" />
          <i aria-hidden="true" className="ai-launch__particle is-two" />
          <i aria-hidden="true" className="ai-launch__particle is-three" />
        </AppIconButton>
      </motion.div>
    );
  }

  return (
    <motion.section
      aria-label="AI ассистент"
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className={`ai-dock ${voiceActive ? "is-listening" : ""} ${sending ? "is-thinking" : ""}`}
      initial={{ opacity: 0, scale: 0.96, y: 12 }}
      transition={{ duration: 0.22 }}
    >
      {attachments.length > 0 ? (
        <div className="composer-attachments">
          {attachments.map((file) => (
            <AppTooltip key={file.id} label={file.fileName}>
              <span>
                <Paperclip size={12} />
                <b>{file.fileName}</b>
                <button
                  aria-label={`Убрать ${file.fileName} из контекста`}
                  onClick={() => onRemoveAttachment(file.id)}
                  type="button"
                >
                  <X size={12} />
                </button>
              </span>
            </AppTooltip>
          ))}
          {uploading.map((file) => (
            <AppTooltip key={file.key} label={file.name}>
              <span className="is-uploading">
                <LoaderCircle size={12} />
                <b>{file.name}</b>
              </span>
            </AppTooltip>
          ))}
        </div>
      ) : uploading.length > 0 ? (
        <div className="composer-attachments">
          {uploading.map((file) => (
            <AppTooltip key={file.key} label={file.name}>
              <span className="is-uploading">
                <LoaderCircle size={12} />
                <b>{file.name}</b>
              </span>
            </AppTooltip>
          ))}
        </div>
      ) : null}
      {response.status !== "idle" ? (
        <div
          aria-live="polite"
          className={`ai-dock__response is-${response.status}`}
          role="status"
        >
          <div>
            <Sparkles size={14} />
            <strong>
              {response.status === "streaming"
                ? "AI отвечает"
                : response.status === "completed"
                  ? "Ответ готов"
                  : response.status === "cancelled"
                    ? "Остановлено"
                    : "Ответ прерван"}
            </strong>
            {!sending ? (
              <button
                aria-label="Скрыть ответ"
                onClick={onDismissResponse}
                type="button"
              >
                <X size={13} />
              </button>
            ) : null}
          </div>
          {response.text ? <p>{response.text}</p> : null}
          {response.error ? <small>{response.error}</small> : null}
        </div>
      ) : null}
      <div className="ai-dock__composer">
        <textarea
          aria-label="Сообщение AI ассистенту"
          disabled={sending}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder={
            voiceActive ? "Слушаю…" : "Спросите, продиктуйте или добавьте файлы"
          }
          rows={1}
          ref={textareaRef}
          value={message}
        />
        <div className="ai-dock__actions">
          <div className="ai-dock__primary-actions">
            <AppIconButton label="Добавить файлы" onClick={onAttach}>
              <Paperclip size={17} />
            </AppIconButton>
            <AppIconButton
              active={voiceActive}
              className="ai-dock__voice"
              label={voiceActive ? "Остановить запись" : "Голосовой ввод"}
              onClick={onVoice}
            >
              {voiceActive ? <Square size={15} /> : <Mic size={17} />}
            </AppIconButton>
            <AppIconButton
              className="ai-dock__collapse"
              label="Свернуть AI"
              onClick={() => setOpen(false)}
            >
              <Minimize2 aria-hidden="true" size={14} />
            </AppIconButton>
            <AppTooltip label={sending ? "Остановить ответ" : "Отправить"}>
              <button
                aria-label={sending ? "Остановить ответ" : "Отправить"}
                className={`send-button ${sending ? "is-cancel" : ""}`}
                disabled={
                  !sending &&
                  ((!message.trim() && attachments.length === 0) ||
                    uploading.length > 0)
                }
                onClick={() => (sending ? onCancel() : void submit())}
                type="button"
              >
                {sending ? <Square size={15} /> : <Send size={17} />}
              </button>
            </AppTooltip>
          </div>
        </div>
      </div>
    </motion.section>
  );
}

function CommandPalette({
  onCreate,
  onOpenChange,
  onOpenSettings,
  onSelectMode,
  open,
}: {
  onCreate(): void;
  onOpenChange(open: boolean): void;
  onOpenSettings(): void;
  onSelectMode(mode: NavigationMode): void;
  open: boolean;
}) {
  const run = (action: () => void) => {
    action();
    onOpenChange(false);
  };
  return (
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay command-overlay" />
        <Dialog.Content className="command-dialog">
          <Dialog.Title className="sr-only">Командная палитра</Dialog.Title>
          <Dialog.Description className="sr-only">
            Быстрые действия и переходы
          </Dialog.Description>
          <Command label="Командная палитра">
            <div className="command-input">
              <Search size={18} />
              <Command.Input
                autoFocus
                placeholder="Команда, заметка или файл"
              />
            </div>
            <Command.List>
              <Command.Empty>Ничего не найдено</Command.Empty>
              <Command.Group heading="Создать">
                <Command.Item onSelect={() => run(onCreate)}>
                  <FilePlus2 size={16} />
                  Новая заметка<kbd>N</kbd>
                </Command.Item>
                <Command.Item
                  onSelect={() =>
                    run(() => toast("Выберите файлы для загрузки"))
                  }
                >
                  <Upload size={16} />
                  Загрузить файл<kbd>U</kbd>
                </Command.Item>
              </Command.Group>
              <Command.Group heading="Перейти">
                <Command.Item onSelect={() => run(() => onSelectMode("notes"))}>
                  <FileText size={16} />
                  Заметки
                </Command.Item>
                <Command.Item onSelect={() => run(() => onSelectMode("files"))}>
                  <Files size={16} />
                  Файлы
                </Command.Item>
                <Command.Item onSelect={() => run(onOpenSettings)}>
                  <Settings size={16} />
                  Настройки<kbd>G</kbd>
                </Command.Item>
              </Command.Group>
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function WorkspaceShell({
  currentUser,
  onSignOut,
  onUserChanged,
}: {
  currentUser: CurrentUser;
  onSignOut(): Promise<void>;
  onUserChanged(): Promise<void>;
}) {
  const queryClient = useQueryClient();
  const en = currentUser.language === "en";
  const [activity, setActivity] = useState<ConstellationActivity>("idle");
  const [aiAttachments, setAiAttachments] = useState<StoredFile[]>([]);
  const [aiResponse, setAiResponse] = useState<AiResponseView>(emptyAiResponse);
  const [aiSending, setAiSending] = useState(false);
  const [aiUploads, setAiUploads] = useState<AiUploadView[]>([]);
  const [commandOpen, setCommandOpen] = useState(false);
  const [fileFolderId, setFileFolderId] = useState<number | null>(null);
  const [fileSearch, setFileSearch] = useState("");
  const [fileTasks, setFileTasks] = useState<FileUploadTask[]>([]);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [mode, setMode] = useState<NavigationMode>("notes");
  const [notificationsRequested, setNotificationsRequested] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [settingsSection, setSettingsSection] = useState("account");
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(currentUser.theme);
  const [tool, setTool] = useState<WorkspaceTool | null>(null);
  const [voiceActive, setVoiceActive] = useState(false);
  const aiAbort = useRef<AbortController | null>(null);
  const aiConversations = useRef(new Map<string, number>());
  const fileInput = useRef<HTMLInputElement>(null);
  const voiceAudio = useRef<HTMLAudioElement>(null);
  const voiceSession = useRef<ActiveVoiceSession | null>(null);
  const treeQuery = useQuery({
    queryFn: notesApi.getTree,
    queryKey: ["notes", "tree"],
  });
  const deferredSearch = useDeferredValue(search.trim());
  const tagsQuery = useQuery({
    enabled: mode === "notes",
    queryFn: notesApi.getTags,
    queryKey: ["notes", "tags"],
  });
  const searchQuery = useQuery({
    enabled: mode === "notes" && deferredSearch.length > 0,
    queryFn: () => notesApi.search(deferredSearch),
    queryKey: ["notes", "search", deferredSearch],
  });
  const searchResults = (searchQuery.data ?? []).filter(
    (result) => !selectedTag || result.tags.includes(selectedTag),
  );
  const activeNoteId = selectedId ?? firstNoteId(treeQuery.data ?? []);
  const noteQuery = useQuery({
    enabled: activeNoteId !== null,
    queryFn: () => notesApi.get(activeNoteId as number),
    queryKey: ["notes", activeNoteId],
  });
  const notificationsQuery = useQuery({
    enabled: notificationsRequested,
    queryFn: notificationsApi.list,
    queryKey: ["notifications", "list"],
  });
  const selected = noteQuery.data;
  const visibleAiAttachments = aiAttachments.filter(
    (file) => file.noteId === activeNoteId,
  );
  const visibleAiUploads = aiUploads.filter(
    (file) => file.noteId === activeNoteId,
  );
  const visibleAiResponse =
    aiResponse.noteId === activeNoteId ? aiResponse : emptyAiResponse;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLocaleLowerCase() === "k"
      ) {
        event.preventDefault();
        setCommandOpen((current) => !current);
      }
      if (event.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = currentUser.language;
    const query = window.matchMedia("(prefers-color-scheme: light)");
    const apply = () => {
      root.dataset.theme =
        theme === "system" ? (query.matches ? "light" : "dark") : theme;
    };
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [currentUser.language, theme]);

  useEffect(() => {
    const root = document.documentElement;
    const opacity = Math.min(100, Math.max(35, currentUser.panelOpacity)) / 100;
    root.style.setProperty("--panel-opacity", String(opacity));
    root.style.setProperty(
      "--panel-strong-opacity",
      String(Math.min(1, opacity + 0.06)),
    );
    root.style.setProperty(
      "--editor-content-width",
      `${currentUser.editorContentWidth}px`,
    );
    root.style.setProperty(
      "--editor-page-padding",
      `${currentUser.editorPagePadding}px`,
    );
    root.style.setProperty(
      "--editor-block-spacing",
      `${currentUser.editorBlockSpacing}px`,
    );
  }, [currentUser]);

  useEffect(
    () => () => {
      const active = voiceSession.current;
      voiceSession.current = null;
      if (active) void active.stop();
    },
    [],
  );

  const openSettings = (section = "account") => {
    setSettingsLoaded(true);
    setSettingsSection(section);
    setSettingsOpen(true);
  };

  const createNote = async (parentId: number | null = null) => {
    try {
      const created = await notesApi.create({
        name: "Новая заметка",
        parentId,
      });
      queryClient.setQueryData(["notes", created.id], created);
      await queryClient.invalidateQueries({ queryKey: ["notes", "tree"] });
      setSelectedId(created.id);
      setMode("notes");
      setSidebarOpen(false);
      toast.success("Заметка создана");
    } catch {
      toast.error("Не удалось создать заметку");
    }
  };

  const moveNote = async (input: {
    id: number;
    parentId: number | null;
    position?: number;
    revision: number;
  }) => {
    try {
      const moved = await notesApi.move(input.id, input);
      queryClient.setQueryData(["notes", moved.id], moved);
      await queryClient.invalidateQueries({ queryKey: ["notes", "tree"] });
      toast.success(
        input.parentId === null
          ? "Заметка перемещена на главный уровень"
          : "Заметка перемещена",
      );
    } catch {
      toast.error("Не удалось переместить заметку");
      await queryClient.invalidateQueries({ queryKey: ["notes", "tree"] });
    }
  };

  const saveNote = async (
    draft: Pick<NoteRecord, "contentHtml" | "contentText" | "name">,
    revision: number,
  ) => {
    if (activeNoteId === null) throw new Error("No note selected");
    const updated = await notesApi.update(activeNoteId, { ...draft, revision });
    queryClient.setQueryData(["notes", activeNoteId], updated);
    void queryClient.invalidateQueries({ queryKey: ["notes", "tree"] });
    return updated;
  };

  const reloadNote = async () => {
    if (activeNoteId === null) throw new Error("No note selected");
    const current = await notesApi.get(activeNoteId);
    queryClient.setQueryData(["notes", activeNoteId], current);
    return current;
  };

  const saveConflictCopy = async (
    draft: Pick<NoteRecord, "contentHtml" | "contentText" | "name">,
  ) => {
    const created = await notesApi.create({
      name: `${draft.name} (копия)`,
      parentId: selected?.parentId ?? null,
    });
    const updated = await notesApi.update(created.id, {
      ...draft,
      name: `${draft.name} (копия)`,
      revision: created.revision,
    });
    queryClient.setQueryData(["notes", updated.id], updated);
    await queryClient.invalidateQueries({ queryKey: ["notes", "tree"] });
    setSelectedId(updated.id);
    toast.success("Конфликтная версия сохранена отдельной заметкой");
  };

  const openFiles = () => fileInput.current?.click();
  const uploadFiles = (files: File[], folderId: number | null) => {
    for (const file of files) {
      if (file.size < 1) {
        toast.error(`${file.name}: пустой файл нельзя загрузить`);
        continue;
      }
      const id = crypto.randomUUID();
      const task: FileUploadTask = {
        file,
        id,
        progress: 0,
        state: "uploading",
      };
      setFileTasks((current) => [...current, task]);
      setActivity("files");
      void filesApi
        .upload(file, folderId, null, (progress) =>
          setFileTasks((current) =>
            current.map((item) =>
              item.id === id ? { ...item, progress } : item,
            ),
          ),
        )
        .then(async () => {
          setFileTasks((current) =>
            current.map((item) =>
              item.id === id ? { ...item, progress: 100, state: "done" } : item,
            ),
          );
          await queryClient.invalidateQueries({ queryKey: ["files"] });
          toast.success(`${file.name}: загрузка завершена`);
          window.setTimeout(
            () =>
              setFileTasks((current) =>
                current.filter((item) => item.id !== id),
              ),
            2200,
          );
        })
        .catch((error: unknown) => {
          setFileTasks((current) =>
            current.map((item) =>
              item.id === id
                ? {
                    ...item,
                    error:
                      error instanceof Error
                        ? error.message
                        : "Загрузка прервана",
                    state: "error",
                  }
                : item,
            ),
          );
          toast.error(
            `${file.name}: загрузка прервана, повторный выбор продолжит её`,
          );
        })
        .finally(() => setActivity("idle"));
    }
  };
  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    if (mode === "files") {
      uploadFiles(files, fileFolderId);
      event.target.value = "";
      return;
    }
    const noteId = activeNoteId;
    const pending = files
      .filter((file) => {
        if (file.size > 0) return true;
        toast.error(`${file.name}: пустой файл нельзя добавить`);
        return false;
      })
      .map((file) => ({
        file,
        key: crypto.randomUUID(),
        name: file.name,
        noteId,
      }));
    if (pending.length === 0) {
      event.target.value = "";
      return;
    }
    setAiUploads((current) => [
      ...current,
      ...pending.map(({ key, name }) => ({ key, name, noteId })),
    ]);
    setActivity("files");
    void Promise.allSettled(
      pending.map(async ({ file, key }) => {
        try {
          const stored = await filesApi.upload(file, null, noteId, () => {});
          setAiAttachments((current) => [
            ...current.filter((item) => item.id !== stored.id),
            stored,
          ]);
          toast.success(`${file.name}: добавлен в AI-контекст`);
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : `${file.name}: загрузка прервана`,
          );
        } finally {
          setAiUploads((current) => current.filter((item) => item.key !== key));
        }
      }),
    ).finally(() => setActivity("idle"));
    event.target.value = "";
  };

  const sendMessage = async (message: string, model: string | null) => {
    if (aiSending) return null;
    const activeVoice = voiceSession.current;
    voiceSession.current = null;
    if (activeVoice) void activeVoice.stop();
    const noteId = activeNoteId;
    const attachments = aiAttachments.filter((file) => file.noteId === noteId);
    const conversationKey = `${model ?? currentUser.preferredAiModel ?? "default"}:${noteId ?? "none"}`;
    const abort = new AbortController();
    aiAbort.current = abort;
    setAiSending(true);
    setActivity("thinking");
    setVoiceActive(false);
    setAiResponse({
      error: null,
      noteId,
      status: "streaming",
      text: "",
    });
    let conversationId = aiConversations.current.get(conversationKey) ?? null;
    let assistantMessageId: number | null = null;
    let completedText = "";
    let failed = false;
    try {
      if (conversationId === null) {
        const conversation = await aiApi.createConversation({
          modelRole: "chat",
          title: selected?.name ? `AI: ${selected.name}` : "AI-диалог",
        });
        conversationId = conversation.id;
        aiConversations.current.set(conversationKey, conversation.id);
      }
      await aiApi.streamResponse(
        conversationId,
        {
          context: { fileIds: [], noteIds: noteId === null ? [] : [noteId] },
          parts: [
            ...(message ? [{ text: message, type: "text" as const }] : []),
            ...attachments.map((file) => ({
              fileId: file.id,
              type: (file.detectedMimeType ?? file.mimeType).startsWith(
                "image/",
              )
                ? ("image" as const)
                : ("file" as const),
            })),
          ],
          model,
          promptKey: "notes.assistant",
        },
        ({ data, event }) => {
          if (event === "message.created") {
            const value = Number(data.assistantMessageId);
            if (Number.isSafeInteger(value)) assistantMessageId = value;
          } else if (event === "message.delta") {
            const delta = typeof data.delta === "string" ? data.delta : "";
            completedText += delta;
            setAiResponse((current) => ({
              ...current,
              text: current.text + delta,
            }));
          } else if (event === "tool.confirmation.required") {
            const confirmationId = Number(data.confirmationId);
            const toolName =
              typeof data.toolName === "string" ? data.toolName : "AI-действие";
            if (Number.isSafeInteger(confirmationId)) {
              toast(`AI запрашивает подтверждение: ${toolName}`, {
                action: {
                  label: "Подтвердить",
                  onClick: () => {
                    toast.promise(
                      aiApi
                        .decideToolConfirmation(confirmationId, "approve")
                        .then(async (result) => {
                          await queryClient.invalidateQueries();
                          return result;
                        }),
                      {
                        error: (error) =>
                          error instanceof Error
                            ? error.message
                            : "Не удалось выполнить действие",
                        loading: "Выполняем действие…",
                        success: "Действие выполнено",
                      },
                    );
                  },
                },
                cancel: {
                  label: "Отклонить",
                  onClick: () => {
                    toast.promise(
                      aiApi.decideToolConfirmation(confirmationId, "reject"),
                      {
                        error: (error) =>
                          error instanceof Error
                            ? error.message
                            : "Не удалось отклонить действие",
                        loading: "Отклоняем…",
                        success: "Действие отклонено",
                      },
                    );
                  },
                },
                description:
                  "Проверьте действие перед выполнением. Подтверждение одноразовое и ограничено по времени.",
                duration: Number.POSITIVE_INFINITY,
              });
            }
          } else if (event === "message.completed") {
            completedText =
              typeof data.text === "string" ? data.text : completedText;
            setAiResponse((current) => ({
              ...current,
              status: "completed",
              text: typeof data.text === "string" ? data.text : current.text,
            }));
          } else if (event === "message.failed") {
            failed = true;
            setAiResponse((current) => ({
              ...current,
              error:
                "Провайдер прервал ответ. Текст сохранён, запрос можно повторить.",
              status: "failed",
              text:
                typeof data.partialText === "string"
                  ? data.partialText
                  : current.text,
            }));
          }
        },
        abort.signal,
      );
      if (failed) return null;
      setAiAttachments((current) =>
        current.filter((file) => file.noteId !== noteId),
      );
      toast.success("AI завершил ответ");
      return completedText;
    } catch (error) {
      if (abort.signal.aborted) {
        setAiResponse((current) => ({
          ...current,
          error: "Поток остановлен. Уже полученный текст сохранён.",
          status: "cancelled",
        }));
        return null;
      }
      if (conversationId !== null && assistantMessageId !== null) {
        try {
          const recovered = await aiApi.getMessage(
            conversationId,
            assistantMessageId,
          );
          setAiResponse({
            error:
              recovered.status === "completed"
                ? null
                : "Соединение прервалось. Показано сохранённое состояние ответа.",
            noteId,
            status: recovered.status === "completed" ? "completed" : "failed",
            text: recovered.contentText,
          });
          return recovered.status === "completed"
            ? recovered.contentText
            : null;
        } catch {
          // Use the original transport error below.
        }
      }
      setAiResponse((current) => ({
        ...current,
        error:
          error instanceof Error
            ? error.message
            : "AI временно недоступен. Повторите запрос.",
        status: "failed",
      }));
      return null;
    } finally {
      aiAbort.current = null;
      setAiSending(false);
      setActivity("idle");
    }
  };

  const toggleVoice = async () => {
    const active = voiceSession.current;
    if (active) {
      voiceSession.current = null;
      setVoiceActive(false);
      setActivity("idle");
      if (active.kind === "realtime") {
        active.stop();
        toast("Голосовой диалог остановлен");
        return;
      }
      try {
        const recording = await active.stop();
        toast("Распознаю запись…");
        const transcript = await transcribeVoice(recording);
        const answer = await sendMessage(transcript, null);
        if (answer && voiceAudio.current) {
          try {
            await speakVoice(answer, voiceAudio.current);
          } catch {
            toast.error("Не удалось озвучить ответ. Текст ответа сохранён.");
          }
        }
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Не удалось обработать голосовую запись.",
        );
      }
      return;
    }

    let stream: MediaStream | null = null;
    try {
      stream = await openMicrophone();
      if (!voiceAudio.current) throw new Error("Voice output is unavailable");
      try {
        voiceSession.current = await startRealtimeVoice(
          stream,
          voiceAudio.current,
        );
        toast("Голосовой диалог включён");
      } catch {
        voiceSession.current = startRecordedVoice(stream);
        toast("Realtime недоступен. Идёт запись для распознавания.");
      }
      setVoiceActive(true);
      setActivity("voice");
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      voiceSession.current = null;
      setVoiceActive(false);
      setActivity("idle");
      toast.error(microphoneErrorMessage(error));
    }
  };

  const selectMode = (nextMode: NavigationMode) => {
    setMode(nextMode);
    setActivity(nextMode === "files" ? "files" : "idle");
  };

  return (
    <UiProvider>
      <main className="app-shell">
        <ConstellationBackground
          activity={activity}
          motionEnabled={currentUser.backgroundMotion}
          starfallEnabled={currentUser.starfall}
        />
        <header className="topbar">
          <div className="topbar__brand">
            <AppIconButton
              className="mobile-only"
              label={en ? "Open navigation" : "Открыть навигацию"}
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={19} />
            </AppIconButton>
            <a aria-label="Notes AI" className="brand" href="#workspace">
              <BrandMark animated />
              <strong>Notes AI</strong>
            </a>
          </div>
          <div className="topbar__actions">
            <AppIconButton
              className="command-trigger"
              label={en ? "Search or run" : "Найти или выполнить"}
              onClick={() => setCommandOpen(true)}
            >
              <Search aria-hidden="true" size={18} />
            </AppIconButton>
            <AppIconButton
              label={en ? "Notifications" : "Уведомления"}
              onClick={() => {
                setNotificationsRequested(true);
                if (notificationsRequested) void notificationsQuery.refetch();
              }}
              popoverTarget="notifications-popover"
            >
              <Bell aria-hidden="true" size={18} />
              {(notificationsQuery.data?.unreadCount ?? 0) > 0 ? (
                <span className="notification-badge">
                  {Math.min(99, notificationsQuery.data?.unreadCount ?? 0)}
                </span>
              ) : null}
            </AppIconButton>
            <aside
              className="notifications-popover"
              id="notifications-popover"
              popover="auto"
            >
              <header>
                <strong>{en ? "Notifications" : "Уведомления"}</strong>
                {(notificationsQuery.data?.unreadCount ?? 0) > 0 ? (
                  <button
                    onClick={() =>
                      void notificationsApi.markAllRead().then(() =>
                        queryClient.invalidateQueries({
                          queryKey: ["notifications", "list"],
                        }),
                      )
                    }
                    type="button"
                  >
                    {en ? "Mark all read" : "Прочитать все"}
                  </button>
                ) : null}
              </header>
              {notificationsQuery.isPending && notificationsRequested ? (
                <div className="notifications-popover__status">
                  <LoaderCircle className="is-spinning" size={17} />
                  {en ? "Loading notifications" : "Загружаем уведомления"}
                </div>
              ) : notificationsQuery.isError ? (
                <div className="notifications-popover__status is-error">
                  {en
                    ? "Could not load notifications."
                    : "Не удалось загрузить уведомления."}
                  <button
                    onClick={() => void notificationsQuery.refetch()}
                    type="button"
                  >
                    {en ? "Retry" : "Повторить"}
                  </button>
                </div>
              ) : (notificationsQuery.data?.items.length ?? 0) > 0 ? (
                <div className="notifications-popover__list">
                  {notificationsQuery.data?.items.map((notification) => {
                    const copy = notificationCopy(notification, en);
                    return (
                      <button
                        className={notification.readAt ? "" : "is-unread"}
                        key={notification.id}
                        onClick={() => {
                          void notificationsApi
                            .markRead(notification.id)
                            .then(() =>
                              queryClient.invalidateQueries({
                                queryKey: ["notifications", "list"],
                              }),
                            );
                          openSettings("subscription");
                        }}
                        type="button"
                      >
                        <span>
                          <CreditCard aria-hidden="true" size={16} />
                        </span>
                        <div>
                          <strong>{copy.title}</strong>
                          <small>{copy.detail}</small>
                          <time dateTime={notification.createdAt}>
                            {new Intl.DateTimeFormat(en ? "en" : "ru", {
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                              month: "short",
                            }).format(new Date(notification.createdAt))}
                          </time>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="notifications-popover__empty">
                  <span>
                    <Bell aria-hidden="true" size={18} />
                  </span>
                  <div>
                    <strong>
                      {en ? "No new notifications" : "Новых уведомлений нет"}
                    </strong>
                    <small>
                      {en
                        ? "Important workspace events will appear here."
                        : "Здесь появятся важные события рабочего пространства."}
                    </small>
                  </div>
                </div>
              )}
            </aside>
            <AppIconButton
              label={en ? "Settings" : "Настройки"}
              onClick={() => openSettings()}
            >
              <Settings size={18} />
            </AppIconButton>
            <SaveStatus language={currentUser.language} state={saveState} />
          </div>
        </header>

        <div className="workspace" id="workspace">
          <AnimatePresence>
            {sidebarOpen ? (
              <motion.button
                aria-label="Закрыть навигацию"
                animate={{ opacity: 1 }}
                className="sidebar-scrim"
                exit={{ opacity: 0 }}
                initial={{ opacity: 0 }}
                onClick={() => setSidebarOpen(false)}
                type="button"
              />
            ) : null}
          </AnimatePresence>
          <aside className={`navigation-panel ${sidebarOpen ? "is-open" : ""}`}>
            <div className="navigation-panel__mobile-head">
              <strong>{en ? "Workspace" : "Рабочее пространство"}</strong>
              <AppIconButton
                label={en ? "Close" : "Закрыть"}
                onClick={() => setSidebarOpen(false)}
              >
                <PanelLeftClose size={18} />
              </AppIconButton>
            </div>
            <div
              aria-label="Раздел навигации"
              className="mode-switch"
              role="tablist"
            >
              <button
                aria-selected={mode === "notes"}
                onClick={() => selectMode("notes")}
                role="tab"
                type="button"
              >
                <FileText size={15} />
                {en ? "Notes" : "Заметки"}
              </button>
              <button
                aria-selected={mode === "files"}
                onClick={() => selectMode("files")}
                role="tab"
                type="button"
              >
                <Files size={15} />
                {en ? "Files" : "Файлы"}
              </button>
            </div>
            {mode === "notes" ? (
              <>
                <div className="tree-tools">
                  <label className="tree-search">
                    <Search aria-hidden="true" size={15} />
                    <input
                      aria-label={en ? "Search notes" : "Поиск заметок"}
                      onChange={(event) => {
                        setSearch(event.target.value);
                        if (event.target.value) setFavoritesOnly(false);
                      }}
                      placeholder={en ? "Search" : "Поиск"}
                      type="search"
                      value={search}
                    />
                  </label>
                  <SearchableSelect
                    align="end"
                    ariaLabel={
                      selectedTag
                        ? `Фильтр по тегу: ${selectedTag}`
                        : "Фильтровать по тегу"
                    }
                    className={`tree-tag-filter ${selectedTag ? "is-active" : ""}`}
                    onValueChange={(value) =>
                      setSelectedTag(value === "__all__" ? null : value)
                    }
                    options={[
                      {
                        icon: Tags,
                        label: en ? "All notes" : "Все заметки",
                        value: "__all__",
                      },
                      ...(tagsQuery.data ?? []).map((tag) => ({
                        icon: Hash,
                        label: `#${tag.name}`,
                        value: tag.name,
                      })),
                    ]}
                    value={selectedTag ?? "__all__"}
                  />
                  <AppIconButton
                    active={favoritesOnly}
                    label={
                      favoritesOnly
                        ? en
                          ? "Show all notes"
                          : "Показать все заметки"
                        : en
                          ? "Show favorites"
                          : "Показать избранное"
                    }
                    onClick={() => {
                      setFavoritesOnly((current) => !current);
                      setSearch("");
                    }}
                  >
                    <Star
                      fill={favoritesOnly ? "currentColor" : "none"}
                      size={16}
                    />
                  </AppIconButton>
                  <AppIconButton
                    label={en ? "New note" : "Новая заметка"}
                    onClick={() => void createNote()}
                  >
                    <FilePlus2 size={17} />
                  </AppIconButton>
                  {selectedTag ? (
                    <div className="tree-filter-chip">
                      <Hash aria-hidden="true" size={12} />
                      <span>{selectedTag}</span>
                      <AppTooltip label="Сбросить фильтр">
                        <button
                          aria-label={`Сбросить фильтр ${selectedTag}`}
                          onClick={() => setSelectedTag(null)}
                          type="button"
                        >
                          <X size={12} />
                        </button>
                      </AppTooltip>
                    </div>
                  ) : null}
                </div>
                {search.trim() ? (
                  <NoteSearchResults
                    isError={searchQuery.isError}
                    isPending={
                      searchQuery.isPending || deferredSearch !== search.trim()
                    }
                    onRetry={() => void searchQuery.refetch()}
                    onSelect={(id) => {
                      setSelectedId(id);
                      setSearch("");
                      setSidebarOpen(false);
                    }}
                    results={searchResults}
                  />
                ) : treeQuery.isPending ? (
                  <div className="tree-status">Загрузка заметок…</div>
                ) : treeQuery.isError ? (
                  <div className="tree-status tree-status--error">
                    <span>Не удалось загрузить дерево</span>
                    <button
                      onClick={() => void treeQuery.refetch()}
                      type="button"
                    >
                      Повторить
                    </button>
                  </div>
                ) : treeQuery.data && treeQuery.data.length > 0 ? (
                  <NoteTree
                    favoritesOnly={favoritesOnly}
                    nodes={treeQuery.data}
                    onMove={(input) => void moveNote(input)}
                    onSelect={(id) => {
                      setSelectedId(id);
                      setSidebarOpen(false);
                    }}
                    search={search}
                    selectedId={activeNoteId}
                    tag={selectedTag}
                  />
                ) : (
                  <div className="tree-status tree-status--empty">
                    <FileText size={20} />
                    <span>Здесь появятся ваши заметки</span>
                    <button onClick={() => void createNote()} type="button">
                      Создать первую
                    </button>
                  </div>
                )}
              </>
            ) : (
              <FileNavigation
                folderId={fileFolderId}
                onFolderSelect={(id) => {
                  setFileFolderId(id);
                  setSidebarOpen(false);
                }}
                onUpload={openFiles}
                onUploadFiles={uploadFiles}
                search={fileSearch}
                setSearch={setFileSearch}
              />
            )}
            {mode === "notes" ? (
              <div className="navigation-footer">
                <AppIconButton
                  className="navigation-footer__action"
                  label={en ? "Trash" : "Корзина"}
                  onClick={() => setTool("trash")}
                >
                  <Trash2 aria-hidden="true" size={16} />
                </AppIconButton>
                <AppIconButton
                  className="navigation-footer__action"
                  label={en ? "Import and export" : "Импорт и экспорт"}
                  onClick={() => setTool("transfer")}
                >
                  <Archive aria-hidden="true" size={16} />
                </AppIconButton>
              </div>
            ) : null}
          </aside>

          <section
            className={`document-pane ${mode === "files" ? "document-pane--files" : ""}`}
          >
            {mode === "files" ? (
              <FileWorkspace
                folderId={fileFolderId}
                key={`${fileFolderId ?? "root"}:${fileSearch}`}
                notes={treeQuery.data ?? []}
                onFolderSelect={setFileFolderId}
                onUpload={openFiles}
                onUploadFiles={uploadFiles}
                search={fileSearch}
                tasks={fileTasks}
              />
            ) : (
              <>
                <header className="document-toolbar">
                  <div>
                    <span className="document-updated">
                      <Clock3 size={13} />
                      {selected
                        ? new Intl.DateTimeFormat(en ? "en-US" : "ru-RU", {
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            month: "short",
                          }).format(new Date(selected.updatedAt))
                        : en
                          ? "no note selected"
                          : "нет выбранной заметки"}
                    </span>
                  </div>
                  <div>
                    <AppIconButton
                      active={selected?.isFavorite}
                      label={
                        selected?.isFavorite
                          ? "Убрать из избранного"
                          : "В избранное"
                      }
                      onClick={() => {
                        if (!selected) return;
                        void notesApi
                          .update(selected.id, {
                            isFavorite: !selected.isFavorite,
                            revision: selected.revision,
                          })
                          .then((updated) => {
                            queryClient.setQueryData(
                              ["notes", updated.id],
                              updated,
                            );
                            toast.success(
                              updated.isFavorite
                                ? "Добавлено в избранное"
                                : "Удалено из избранного",
                            );
                            return queryClient.invalidateQueries({
                              queryKey: ["notes", "tree"],
                            });
                          })
                          .catch(() =>
                            toast.error("Не удалось изменить избранное"),
                          );
                      }}
                    >
                      <Star size={17} />
                    </AppIconButton>
                    <AppIconButton
                      label="Поделиться"
                      onClick={() => setTool("share")}
                    >
                      <Share2 size={17} />
                    </AppIconButton>
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger
                        aria-label="Другие действия"
                        className="icon-button"
                        disabled={!selected}
                      >
                        <MoreHorizontal size={18} />
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content
                          align="end"
                          className="dropdown-content"
                          sideOffset={7}
                        >
                          <DropdownMenu.Item
                            className="dropdown-item"
                            onSelect={() => setTool("history")}
                          >
                            <History size={15} />
                            История версий
                          </DropdownMenu.Item>
                          <DropdownMenu.Item
                            className="dropdown-item"
                            onSelect={() => setTool("share")}
                          >
                            <Share2 size={15} />
                            Публичный доступ
                          </DropdownMenu.Item>
                          <DropdownMenu.Item
                            className="dropdown-item"
                            onSelect={() => setTool("tags")}
                          >
                            <Tags size={15} />
                            Теги
                          </DropdownMenu.Item>
                          <DropdownMenu.Item
                            className="dropdown-item"
                            onSelect={() => setTool("templates")}
                          >
                            <LayoutTemplate size={15} />
                            Шаблоны
                          </DropdownMenu.Item>
                          <DropdownMenu.Item
                            className="dropdown-item"
                            onSelect={() => setTool("transfer")}
                          >
                            <Archive size={15} />
                            Импорт и экспорт
                          </DropdownMenu.Item>
                          <DropdownMenu.Separator className="dropdown-separator" />
                          <DropdownMenu.Item
                            className="dropdown-item dropdown-item--danger"
                            onSelect={() => setTool("delete")}
                          >
                            <Trash2 size={15} />
                            Удалить заметку
                          </DropdownMenu.Item>
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                  </div>
                </header>
                {noteQuery.isPending && activeNoteId !== null ? (
                  <div className="document-state">Загрузка заметки…</div>
                ) : noteQuery.isError ? (
                  <div className="document-state document-state--error">
                    <strong>Не удалось открыть заметку</strong>
                    <button
                      onClick={() => void noteQuery.refetch()}
                      type="button"
                    >
                      Повторить
                    </button>
                  </div>
                ) : selected ? (
                  <NoteEditor
                    key={selected.id}
                    note={selected}
                    onReload={reloadNote}
                    onSave={saveNote}
                    onSaveCopy={saveConflictCopy}
                    onSaveStateChange={setSaveState}
                  />
                ) : (
                  <div className="document-state document-state--empty">
                    <FilePlus2 size={24} />
                    <strong>Создайте первую заметку</strong>
                    <span>Текст будет сохраняться автоматически.</span>
                    <button onClick={() => void createNote()} type="button">
                      Новая заметка
                    </button>
                  </div>
                )}
                <AiComposer
                  attachments={visibleAiAttachments}
                  onCancel={() => aiAbort.current?.abort()}
                  onAttach={openFiles}
                  onDismissResponse={() =>
                    setAiResponse({ ...emptyAiResponse, noteId: activeNoteId })
                  }
                  onRemoveAttachment={(id) =>
                    setAiAttachments((current) =>
                      current.filter((file) => file.id !== id),
                    )
                  }
                  onSend={sendMessage}
                  onVoice={toggleVoice}
                  response={visibleAiResponse}
                  sending={aiSending}
                  uploading={visibleAiUploads}
                  voiceActive={voiceActive}
                />
              </>
            )}
          </section>
        </div>

        <nav aria-label="Мобильная навигация" className="mobile-dock">
          <button
            className={mode === "notes" ? "is-active" : ""}
            onClick={() => {
              selectMode("notes");
              setSidebarOpen(true);
            }}
            type="button"
          >
            <FileText size={19} />
            <span>{en ? "Notes" : "Заметки"}</span>
          </button>
          <button
            className={mode === "files" ? "is-active" : ""}
            onClick={() => {
              selectMode("files");
              setSidebarOpen(true);
            }}
            type="button"
          >
            <Files size={19} />
            <span>{en ? "Files" : "Файлы"}</span>
          </button>
          <button
            className="mobile-dock__ai"
            onClick={() => window.dispatchEvent(new Event("notes-open-ai"))}
            type="button"
          >
            <span aria-hidden="true" className="mobile-dock__ai-signal">
              <Sparkles size={19} />
              <i className="is-one" />
              <i className="is-two" />
            </span>
            <span>ИИ</span>
          </button>
          <button onClick={() => openSettings()} type="button">
            <Settings size={19} />
            <span>{en ? "Settings" : "Настройки"}</span>
          </button>
        </nav>

        <input
          className="visually-hidden-input"
          multiple
          onChange={handleFiles}
          ref={fileInput}
          type="file"
        />
        <audio aria-hidden="true" ref={voiceAudio} />
        {settingsLoaded ? (
          <SettingsDialog
            onOpenChange={setSettingsOpen}
            onSignOut={onSignOut}
            onSectionChange={setSettingsSection}
            onThemeChange={setTheme}
            onUserChanged={onUserChanged}
            open={settingsOpen}
            section={settingsSection}
            theme={theme}
            user={currentUser}
          />
        ) : null}
        {tool ? (
          <WorkspaceTools
            active={tool}
            key={`${tool}:${selected?.id ?? "none"}`}
            note={selected}
            onClose={() => setTool(null)}
            onDeleted={(id) => {
              queryClient.removeQueries({ queryKey: ["notes", id] });
              if (activeNoteId === id) setSelectedId(null);
            }}
            onNoteChanged={(note) => {
              queryClient.setQueryData(["notes", note.id], note);
            }}
            onSelectNote={(id) => {
              setSelectedId(id);
              setMode("notes");
              setSidebarOpen(false);
            }}
          />
        ) : null}
        <CommandPalette
          onCreate={createNote}
          onOpenChange={setCommandOpen}
          onOpenSettings={() => openSettings()}
          onSelectMode={selectMode}
          open={commandOpen}
        />
        <Toaster
          closeButton
          position="top-center"
          richColors
          theme={theme === "system" ? "system" : theme}
        />
      </main>
    </UiProvider>
  );
}
