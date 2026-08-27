"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  File,
  FileArchive,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Folder,
  FolderOpen,
  FolderPlus,
  Grid2X2,
  HardDrive,
  Link2,
  List,
  MoreHorizontal,
  Pencil,
  Search,
  Trash2,
  Unlink,
  Upload,
  X,
} from "lucide-react";
import {
  type DragEvent,
  type FormEvent,
  type ReactNode,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";

import {
  archiveUrl,
  type FileFolder,
  filesApi,
  type StoredFile,
} from "./files-api";
import type { NoteTreeNode } from "./notes-api";
import {
  AppTooltip,
  ConfirmDialog,
  SearchableSelect,
  TooltipText,
} from "./ui-controls";

export interface FileUploadTask {
  error?: string;
  file: globalThis.File;
  id: string;
  progress: number;
  state: "done" | "error" | "uploading";
}

interface FileWorkspaceProps {
  folderId: number | null;
  notes: NoteTreeNode[];
  onFolderSelect(id: number | null): void;
  onUpload(): void;
  onUploadFiles(files: globalThis.File[], folderId: number | null): void;
  search: string;
  tasks: FileUploadTask[];
}

const FILE_DRAG_TYPE = "application/x-notes-files";
const FOLDER_DRAG_TYPE = "application/x-notes-folder";

function formatBytes(value: number | null) {
  if (value === null) return "без лимита";
  const units = ["Б", "КБ", "МБ", "ГБ", "ТБ"];
  let amount = value;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${new Intl.NumberFormat("ru", {
    maximumFractionDigits: amount < 10 && unit > 0 ? 1 : 0,
  }).format(amount)} ${units[unit]}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function flattenNotes(
  nodes: NoteTreeNode[],
  depth = 0,
): Array<{ depth: number; id: number; name: string }> {
  return nodes.flatMap((note) => [
    { depth, id: note.id, name: note.name },
    ...flattenNotes(note.children, depth + 1),
  ]);
}

function descendantsOf(folders: FileFolder[], parentId: number | null) {
  return folders
    .filter((folder) => folder.parentId === parentId)
    .sort(
      (left, right) =>
        left.position - right.position || left.name.localeCompare(right.name),
    );
}

function folderPath(folders: FileFolder[], id: number | null) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const path: FileFolder[] = [];
  let current = id === null ? undefined : byId.get(id);
  while (current) {
    path.unshift(current);
    current =
      current.parentId === null ? undefined : byId.get(current.parentId);
  }
  return path;
}

function fileIcon(file: StoredFile) {
  const mime = file.detectedMimeType ?? file.mimeType;
  if (mime.startsWith("image/")) return FileImage;
  if (mime.startsWith("audio/")) return FileAudio;
  if (mime.startsWith("video/")) return FileVideo;
  if (mime.startsWith("text/") || mime === "application/pdf") return FileText;
  if (/(zip|rar|7z|tar|gzip)/i.test(mime)) return FileArchive;
  return File;
}

function canPreview(file: StoredFile) {
  const mime = file.detectedMimeType ?? file.mimeType;
  return (
    mime.startsWith("image/") ||
    mime.startsWith("text/") ||
    mime === "application/pdf" ||
    mime === "application/json"
  );
}

function draggedFileIds(event: DragEvent) {
  const raw = event.dataTransfer.getData(FILE_DRAG_TYPE);
  if (!raw) return [];
  try {
    const values = JSON.parse(raw) as unknown;
    return Array.isArray(values)
      ? values.filter(
          (value): value is number => Number.isSafeInteger(value) && value > 0,
        )
      : [];
  } catch {
    return [];
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Операция не выполнена";
}

function IconTool({
  children,
  label,
  onClick,
  pressed,
}: {
  children: ReactNode;
  label: string;
  onClick(): void;
  pressed?: boolean;
}) {
  return (
    <AppTooltip label={label}>
      <button
        aria-label={label}
        aria-pressed={pressed}
        className={`icon-button ${pressed ? "is-active" : ""}`}
        onClick={onClick}
        type="button"
      >
        {children}
      </button>
    </AppTooltip>
  );
}

function FolderTreeRows({
  currentId,
  depth = 0,
  folders,
  onDrop,
  onSelect,
  open,
  parentId = null,
  toggle,
}: {
  currentId: number | null;
  depth?: number;
  folders: FileFolder[];
  onDrop(event: DragEvent, folderId: number | null): void;
  onSelect(id: number | null): void;
  open: Set<number>;
  parentId?: number | null;
  toggle(id: number): void;
}) {
  return descendantsOf(folders, parentId).map((folder) => {
    const children = descendantsOf(folders, folder.id);
    const expanded = open.has(folder.id);
    return (
      <div className="file-tree-node" key={folder.id}>
        <button
          aria-current={currentId === folder.id ? "page" : undefined}
          className={`file-tree-row ${currentId === folder.id ? "is-selected" : ""}`}
          draggable
          onClick={() => {
            onSelect(folder.id);
            toggle(folder.id);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData(FOLDER_DRAG_TYPE, String(folder.id));
          }}
          onDrop={(event) => onDrop(event, folder.id)}
          style={{ paddingInlineStart: 7 + depth * 16 }}
          type="button"
        >
          <span className="file-tree-chevron">
            {children.length ? (
              expanded ? (
                <ChevronDown size={13} />
              ) : (
                <ChevronRight size={13} />
              )
            ) : (
              <i />
            )}
          </span>
          {expanded ? <FolderOpen size={15} /> : <Folder size={15} />}
          <span>{folder.name}</span>
        </button>
        {expanded ? (
          <FolderTreeRows
            currentId={currentId}
            depth={depth + 1}
            folders={folders}
            onDrop={onDrop}
            onSelect={onSelect}
            open={open}
            parentId={folder.id}
            toggle={toggle}
          />
        ) : null}
      </div>
    );
  });
}

export function FileNavigation({
  folderId,
  onFolderSelect,
  onUpload,
  onUploadFiles,
  search,
  setSearch,
}: {
  folderId: number | null;
  onFolderSelect(id: number | null): void;
  onUpload(): void;
  onUploadFiles(files: globalThis.File[], folderId: number | null): void;
  search: string;
  setSearch(value: string): void;
}) {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [open, setOpen] = useState<Set<number>>(() => new Set());
  const folders = useQuery({
    queryFn: filesApi.listFolders,
    queryKey: ["files", "folders"],
  });
  const usage = useQuery({
    queryFn: filesApi.getUsage,
    queryKey: ["files", "usage"],
  });

  const drop = async (event: DragEvent, targetId: number | null) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer.files.length) {
      onUploadFiles(Array.from(event.dataTransfer.files), targetId);
      return;
    }
    const fileIds = draggedFileIds(event);
    const movedFolder = Number(event.dataTransfer.getData(FOLDER_DRAG_TYPE));
    try {
      if (fileIds.length) {
        await Promise.all(
          fileIds.map((id) => filesApi.patchFile(id, { folderId: targetId })),
        );
      } else if (Number.isSafeInteger(movedFolder) && movedFolder > 0) {
        await filesApi.moveFolder(movedFolder, targetId);
      } else {
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["files"] });
      toast.success("Объекты перемещены");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const createFolder = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const folder = await filesApi.createFolder(folderName, folderId);
      setFolderName("");
      setCreating(false);
      setOpen((current) => new Set(current).add(folder.parentId ?? folder.id));
      await queryClient.invalidateQueries({ queryKey: ["files", "folders"] });
      onFolderSelect(folder.id);
      toast.success("Папка создана");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const used = usage.data ? usage.data.usedBytes + usage.data.reservedBytes : 0;
  const percent = usage.data?.limitBytes
    ? Math.min(100, (used / usage.data.limitBytes) * 100)
    : 0;

  return (
    <>
      <div className="tree-tools file-tree-tools">
        <label className="tree-search">
          <Search aria-hidden="true" size={15} />
          <input
            aria-label="Поиск файлов"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Файлы"
            type="search"
            value={search}
          />
        </label>
        <IconTool
          label="Новая папка"
          onClick={() => setCreating((value) => !value)}
        >
          <FolderPlus size={17} />
        </IconTool>
        <IconTool label="Загрузить файлы" onClick={onUpload}>
          <Upload size={17} />
        </IconTool>
        {creating ? (
          <form
            className="file-tree-create"
            onSubmit={(event) => void createFolder(event)}
          >
            <input
              aria-label="Название новой папки"
              autoFocus
              maxLength={160}
              onChange={(event) => setFolderName(event.target.value)}
              placeholder="Название папки"
              required
              value={folderName}
            />
            <button
              aria-label="Создать папку"
              disabled={!folderName.trim()}
              type="submit"
            >
              <Check size={14} />
            </button>
            <button
              aria-label="Отмена"
              onClick={() => setCreating(false)}
              type="button"
            >
              <X size={14} />
            </button>
          </form>
        ) : null}
      </div>
      <nav
        aria-label="Дерево файлов"
        className="tree-scroll file-navigation-tree"
      >
        <div className="file-summary">
          <span>
            {usage.isPending
              ? "Расчёт хранилища…"
              : `${formatBytes(used)} из ${formatBytes(usage.data?.limitBytes ?? null)}`}
          </span>
          <i aria-hidden="true">
            <b style={{ width: `${percent}%` }} />
          </i>
        </div>
        <button
          aria-current={folderId === null ? "page" : undefined}
          className={`file-tree-row file-tree-root ${folderId === null ? "is-selected" : ""}`}
          onClick={() => onFolderSelect(null)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => void drop(event, null)}
          type="button"
        >
          <HardDrive size={15} />
          <span>Все файлы</span>
        </button>
        {folders.isPending ? (
          <div className="tree-status">Загрузка папок…</div>
        ) : null}
        {folders.isError ? (
          <div className="tree-status tree-status--error">
            Не удалось загрузить папки
          </div>
        ) : null}
        {folders.data ? (
          <FolderTreeRows
            currentId={folderId}
            folders={folders.data}
            onDrop={(event, targetId) => void drop(event, targetId)}
            onSelect={onFolderSelect}
            open={open}
            toggle={(id) =>
              setOpen((current) => {
                const next = new Set(current);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })
            }
          />
        ) : null}
      </nav>
    </>
  );
}

function NameDialog({
  currentName,
  description,
  onClose,
  onSave,
  open,
  title,
}: {
  currentName: string;
  description: string;
  onClose(): void;
  onSave(name: string): Promise<void>;
  open: boolean;
  title: string;
}) {
  const [name, setName] = useState(currentName);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog.Root onOpenChange={(value) => !value && onClose()} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="workspace-dialog workspace-dialog--compact file-name-dialog">
          <div className="workspace-dialog__head">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>{description}</Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Закрыть">
              <X size={17} />
            </Dialog.Close>
          </div>
          <form
            className="workspace-dialog__body workspace-form"
            onSubmit={(event) => {
              event.preventDefault();
              setBusy(true);
              void onSave(name).finally(() => setBusy(false));
            }}
          >
            <label>
              Название
              <input
                aria-label="Название"
                autoFocus
                maxLength={255}
                onChange={(event) => setName(event.target.value)}
                required
                value={name}
              />
            </label>
            <div className="workspace-dialog__actions">
              <Dialog.Close className="button button--quiet" type="button">
                Отмена
              </Dialog.Close>
              <button
                className="button button--primary"
                disabled={busy || !name.trim()}
                type="submit"
              >
                {busy ? "Сохранение…" : "Сохранить"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PreviewDialog({
  file,
  onClose,
  url,
}: {
  file: StoredFile | null;
  onClose(): void;
  url: string | null;
}) {
  const mime = file ? (file.detectedMimeType ?? file.mimeType) : "";
  return (
    <Dialog.Root
      onOpenChange={(value) => !value && onClose()}
      open={file !== null}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="file-preview-dialog">
          <div className="file-preview-head">
            <div>
              <Dialog.Title>{file?.fileName}</Dialog.Title>
              <Dialog.Description>
                {file ? `${formatBytes(file.sizeBytes)} · ${mime}` : ""}
              </Dialog.Description>
            </div>
            <Dialog.Close aria-label="Закрыть просмотр" className="icon-button">
              <X size={18} />
            </Dialog.Close>
          </div>
          <div className="file-preview-body">
            {!url ? (
              <div className="document-state">Подготовка просмотра…</div>
            ) : mime.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt={file?.fileName ?? "Предпросмотр"} src={url} />
            ) : (
              <iframe
                src={url}
                title={`Просмотр ${file?.fileName ?? "файла"}`}
              />
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function FileWorkspace({
  folderId,
  notes,
  onFolderSelect,
  onUpload,
  onUploadFiles,
  search,
  tasks,
}: FileWorkspaceProps) {
  const queryClient = useQueryClient();
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [rename, setRename] = useState<{
    id: number;
    kind: "file" | "folder";
    name: string;
  } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [preview, setPreview] = useState<{
    file: StoredFile;
    url: string | null;
  } | null>(null);
  const [moveTarget, setMoveTarget] = useState("");
  const [noteTarget, setNoteTarget] = useState("");
  const [dropActive, setDropActive] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<
    | { ids: number[]; kind: "files" }
    | { id: number; kind: "folder"; name: string }
    | null
  >(null);

  const folders = useQuery({
    queryFn: filesApi.listFolders,
    queryKey: ["files", "folders"],
  });
  const files = useQuery({
    queryFn: () => filesApi.listFiles(folderId, search.trim()),
    queryKey: ["files", "list", folderId, search.trim()],
  });
  const usage = useQuery({
    queryFn: filesApi.getUsage,
    queryKey: ["files", "usage"],
  });
  const noteOptions = useMemo(() => flattenNotes(notes), [notes]);
  const path = folderPath(folders.data ?? [], folderId);
  const childFolders = search.trim()
    ? []
    : descendantsOf(folders.data ?? [], folderId);
  const visibleFiles = files.data ?? [];
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["files"] });
  };

  const run = async (operation: () => Promise<unknown>, success: string) => {
    try {
      await operation();
      await refresh();
      toast.success(success);
      return true;
    } catch (error) {
      toast.error(errorMessage(error));
      return false;
    }
  };

  const openFile = async (file: StoredFile, inline: boolean) => {
    try {
      if (inline) setPreview({ file, url: null });
      const signed = await filesApi.getSignedUrl(file.id, inline);
      if (inline) setPreview({ file, url: signed.url });
      else window.location.assign(signed.url);
    } catch (error) {
      setPreview(null);
      toast.error(errorMessage(error));
    }
  };

  const moveFiles = async (ids: number[], target: number | null) => {
    if (!ids.length) return;
    if (
      await run(
        () =>
          Promise.all(
            ids.map((id) => filesApi.patchFile(id, { folderId: target })),
          ),
        ids.length === 1
          ? "Файл перемещён"
          : `Перемещено файлов: ${ids.length}`,
      )
    ) {
      setSelected(new Set());
    }
  };

  const drop = (event: DragEvent, target: number | null) => {
    event.preventDefault();
    event.stopPropagation();
    setDropActive(false);
    if (event.dataTransfer.files.length) {
      onUploadFiles(Array.from(event.dataTransfer.files), target);
      return;
    }
    const ids = draggedFileIds(event);
    if (ids.length) void moveFiles(ids, target);
  };

  const removeFiles = (ids: number[]) => {
    if (ids.length) setDeleteTarget({ ids, kind: "files" });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.kind === "folder") {
      await run(() => filesApi.deleteFolder(deleteTarget.id), "Папка удалена");
    } else if (
      await run(
        () => Promise.all(deleteTarget.ids.map(filesApi.deleteFile)),
        deleteTarget.ids.length === 1
          ? "Файл удалён"
          : `Удалено файлов: ${deleteTarget.ids.length}`,
      )
    ) {
      setSelected(new Set());
    }
    setDeleteTarget(null);
  };

  const bindFiles = async (ids: number[], noteId: number | null) => {
    if (!ids.length) return;
    if (
      await run(
        () => Promise.all(ids.map((id) => filesApi.patchFile(id, { noteId }))),
        noteId === null
          ? "Связь с блокнотом удалена"
          : "Файлы привязаны к блокноту",
      )
    ) {
      setSelected(new Set());
    }
  };

  const usageTotal = usage.data
    ? usage.data.usedBytes + usage.data.reservedBytes
    : 0;
  const allSelected =
    visibleFiles.length > 0 && selected.size === visibleFiles.length;

  return (
    <div
      className={`file-workspace ${dropActive ? "is-drop-active" : ""}`}
      onDragEnter={(event) => {
        event.preventDefault();
        setDropActive(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDropActive(false);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => drop(event, folderId)}
    >
      <header className="file-workspace-toolbar">
        <div className="file-breadcrumbs" aria-label="Путь к папке">
          <button onClick={() => onFolderSelect(null)} type="button">
            <HardDrive size={14} />
            Файлы
          </button>
          {path.map((folder) => (
            <span key={folder.id}>
              <ChevronRight size={13} />
              <button onClick={() => onFolderSelect(folder.id)} type="button">
                {folder.name}
              </button>
            </span>
          ))}
        </div>
        <div className="file-toolbar-actions">
          <span className="file-usage-compact">{formatBytes(usageTotal)}</span>
          <IconTool label="Новая папка" onClick={() => setCreateOpen(true)}>
            <FolderPlus size={17} />
          </IconTool>
          <button
            className="button button--primary file-upload-button"
            onClick={onUpload}
            type="button"
          >
            <Upload size={15} />
            Загрузить
          </button>
          <div className="view-switch" role="group" aria-label="Вид файлов">
            <IconTool
              label="Плитка"
              onClick={() => setView("grid")}
              pressed={view === "grid"}
            >
              <Grid2X2 size={16} />
            </IconTool>
            <IconTool
              label="Список"
              onClick={() => setView("list")}
              pressed={view === "list"}
            >
              <List size={17} />
            </IconTool>
          </div>
        </div>
      </header>

      {selected.size ? (
        <div
          className="file-selection-bar"
          role="region"
          aria-label="Действия с выбранными файлами"
        >
          <strong>Выбрано: {selected.size}</strong>
          <label>
            <span>Папка</span>
            <SearchableSelect
              ariaLabel="Папка для перемещения"
              onValueChange={setMoveTarget}
              options={[
                { label: "Выберите", value: "" },
                { label: "Корень", value: "root" },
                ...(folders.data ?? []).map((folder) => ({
                  label: folder.name,
                  value: String(folder.id),
                })),
              ]}
              value={moveTarget}
            />
          </label>
          <button
            disabled={!moveTarget}
            onClick={() =>
              void moveFiles(
                [...selected],
                moveTarget === "root" ? null : Number(moveTarget),
              )
            }
            type="button"
          >
            Переместить
          </button>
          <label>
            <span>Блокнот</span>
            <SearchableSelect
              ariaLabel="Блокнот для привязки"
              onValueChange={setNoteTarget}
              options={[
                { label: "Выберите", value: "" },
                { label: "Без блокнота", value: "unlink" },
                ...noteOptions.map((note) => ({
                  label: `${"— ".repeat(note.depth)}${note.name}`,
                  value: String(note.id),
                })),
              ]}
              value={noteTarget}
            />
          </label>
          <button
            disabled={!noteTarget}
            onClick={() =>
              void bindFiles(
                [...selected],
                noteTarget === "unlink" ? null : Number(noteTarget),
              )
            }
            type="button"
          >
            Применить
          </button>
          <button
            onClick={() =>
              window.location.assign(archiveUrl({ fileIds: [...selected] }))
            }
            type="button"
          >
            <Archive size={14} /> ZIP
          </button>
          <button
            className="is-danger"
            onClick={() => void removeFiles([...selected])}
            type="button"
          >
            <Trash2 size={14} /> Удалить
          </button>
          <button
            aria-label="Снять выбор"
            className="icon-button"
            onClick={() => setSelected(new Set())}
            type="button"
          >
            <X size={16} />
          </button>
        </div>
      ) : null}

      {tasks.length ? (
        <div className="upload-queue" aria-label="Загрузки" aria-live="polite">
          {tasks.map((task) => (
            <div
              className={`upload-task upload-task--${task.state}`}
              key={task.id}
            >
              <span>
                <Upload size={13} />
                {task.file.name}
              </span>
              <i>
                <b style={{ transform: `scaleX(${task.progress / 100})` }} />
              </i>
              <small>
                {task.state === "error"
                  ? task.error
                  : task.state === "done"
                    ? "Готово"
                    : `${Math.round(task.progress)}%`}
              </small>
            </div>
          ))}
        </div>
      ) : null}

      <div className="file-workspace-scroll">
        {dropActive ? (
          <div className="file-drop-overlay">
            <Upload size={28} />
            <strong>Отпустите файлы для загрузки</strong>
          </div>
        ) : null}
        {files.isPending || folders.isPending ? (
          <div className="document-state">Загрузка файлов…</div>
        ) : null}
        {files.isError || folders.isError ? (
          <div className="document-state document-state--error">
            <strong>Не удалось открыть хранилище</strong>
            <button onClick={() => void refresh()} type="button">
              Повторить
            </button>
          </div>
        ) : null}
        {!files.isPending &&
        !folders.isPending &&
        !files.isError &&
        !folders.isError ? (
          childFolders.length || visibleFiles.length ? (
            <div className={`file-collection file-collection--${view}`}>
              {view === "list" ? (
                <div className="file-list-head">
                  <input
                    aria-label={
                      allSelected
                        ? "Снять выбор со всех файлов"
                        : "Выбрать все файлы"
                    }
                    checked={allSelected}
                    onChange={() =>
                      setSelected(
                        allSelected
                          ? new Set()
                          : new Set(visibleFiles.map((file) => file.id)),
                      )
                    }
                    type="checkbox"
                  />
                  <span>Название</span>
                  <span>Блокнот</span>
                  <span>Изменён</span>
                  <span>Размер</span>
                  <i />
                </div>
              ) : null}
              {childFolders.map((folder) => (
                <article
                  className="file-item file-item--folder"
                  draggable
                  key={`folder-${folder.id}`}
                  onDragOver={(event) => event.preventDefault()}
                  onDragStart={(event) =>
                    event.dataTransfer.setData(
                      FOLDER_DRAG_TYPE,
                      String(folder.id),
                    )
                  }
                  onDrop={(event) => drop(event, folder.id)}
                >
                  <button
                    className="file-item-main"
                    onClick={() => onFolderSelect(folder.id)}
                    type="button"
                  >
                    <span className="file-glyph">
                      <Folder size={view === "grid" ? 30 : 18} />
                    </span>
                    <span className="file-item-name">
                      <AppTooltip label={folder.name}>
                        <strong>{folder.name}</strong>
                      </AppTooltip>
                      <small>Папка</small>
                    </span>
                  </button>
                  <span className="file-item-spacer" />
                  <span className="file-item-meta">—</span>
                  <span className="file-item-meta">—</span>
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger
                      aria-label={`Действия с папкой ${folder.name}`}
                      className="icon-button"
                    >
                      <MoreHorizontal size={17} />
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content
                        align="end"
                        className="dropdown-content"
                        sideOffset={6}
                      >
                        <DropdownMenu.Item
                          className="dropdown-item"
                          onSelect={() =>
                            setRename({
                              id: folder.id,
                              kind: "folder",
                              name: folder.name,
                            })
                          }
                        >
                          <Pencil size={14} />
                          Переименовать
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                          className="dropdown-item"
                          onSelect={() =>
                            window.location.assign(
                              archiveUrl({ folderIds: [folder.id] }),
                            )
                          }
                        >
                          <Archive size={14} />
                          Скачать ZIP
                        </DropdownMenu.Item>
                        <DropdownMenu.Separator className="dropdown-separator" />
                        <DropdownMenu.Item
                          className="dropdown-item dropdown-item--danger"
                          onSelect={() =>
                            setDeleteTarget({
                              id: folder.id,
                              kind: "folder",
                              name: folder.name,
                            })
                          }
                        >
                          <Trash2 size={14} />
                          Удалить
                        </DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                </article>
              ))}
              {visibleFiles.map((file) => {
                const Glyph = fileIcon(file);
                const checked = selected.has(file.id);
                return (
                  <article
                    className={`file-item ${checked ? "is-selected" : ""}`}
                    draggable
                    key={file.id}
                    onDragStart={(event) => {
                      const ids = checked ? [...selected] : [file.id];
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData(
                        FILE_DRAG_TYPE,
                        JSON.stringify(ids),
                      );
                    }}
                  >
                    <label className="file-select">
                      <input
                        aria-label={`Выбрать ${file.fileName}`}
                        checked={checked}
                        onChange={() =>
                          setSelected((current) => {
                            const next = new Set(current);
                            if (next.has(file.id)) next.delete(file.id);
                            else next.add(file.id);
                            return next;
                          })
                        }
                        type="checkbox"
                      />
                    </label>
                    <button
                      className="file-item-main"
                      onDoubleClick={() =>
                        void openFile(file, canPreview(file))
                      }
                      onClick={() =>
                        setSelected((current) => new Set(current).add(file.id))
                      }
                      type="button"
                    >
                      <span className="file-glyph">
                        <Glyph size={view === "grid" ? 30 : 18} />
                      </span>
                      <span className="file-item-name">
                        <AppTooltip label={file.fileName}>
                          <strong>{file.fileName}</strong>
                        </AppTooltip>
                        <small>{file.detectedMimeType ?? file.mimeType}</small>
                      </span>
                    </button>
                    <TooltipText
                      className="file-item-note"
                      label={file.noteName ?? "Без блокнота"}
                    />
                    <span className="file-item-meta">
                      {formatDate(file.updatedAt)}
                    </span>
                    <span className="file-item-meta">
                      {formatBytes(file.sizeBytes)}
                    </span>
                    {file.duplicateOfIds.length ? (
                      <AppTooltip label="Есть дубликат">
                        <span className="duplicate-mark">
                          <Copy size={12} />
                          {file.duplicateOfIds.length}
                        </span>
                      </AppTooltip>
                    ) : null}
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger
                        aria-label={`Действия с файлом ${file.fileName}`}
                        className="icon-button"
                      >
                        <MoreHorizontal size={17} />
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content
                          align="end"
                          className="dropdown-content file-menu"
                          sideOffset={6}
                        >
                          {canPreview(file) ? (
                            <DropdownMenu.Item
                              className="dropdown-item"
                              onSelect={() => void openFile(file, true)}
                            >
                              <Search size={14} />
                              Предпросмотр
                            </DropdownMenu.Item>
                          ) : null}
                          <DropdownMenu.Item
                            className="dropdown-item"
                            onSelect={() => void openFile(file, false)}
                          >
                            <Download size={14} />
                            Скачать
                          </DropdownMenu.Item>
                          <DropdownMenu.Item
                            className="dropdown-item"
                            onSelect={() =>
                              setRename({
                                id: file.id,
                                kind: "file",
                                name: file.fileName,
                              })
                            }
                          >
                            <Pencil size={14} />
                            Переименовать
                          </DropdownMenu.Item>
                          <DropdownMenu.Item
                            className="dropdown-item"
                            onSelect={() =>
                              void run(
                                () => filesApi.duplicateFile(file.id, folderId),
                                "Копия создана",
                              )
                            }
                          >
                            <Copy size={14} />
                            Создать копию
                          </DropdownMenu.Item>
                          <DropdownMenu.Sub>
                            <DropdownMenu.SubTrigger className="dropdown-item">
                              <Link2 size={14} />
                              Привязать к блокноту
                              <ChevronRight size={13} />
                            </DropdownMenu.SubTrigger>
                            <DropdownMenu.Portal>
                              <DropdownMenu.SubContent
                                className="dropdown-content file-note-menu"
                                sideOffset={4}
                              >
                                {noteOptions.map((note) => (
                                  <DropdownMenu.Item
                                    className="dropdown-item"
                                    key={note.id}
                                    onSelect={() =>
                                      void bindFiles([file.id], note.id)
                                    }
                                    style={{
                                      paddingInlineStart: 8 + note.depth * 10,
                                    }}
                                  >
                                    {note.name}
                                  </DropdownMenu.Item>
                                ))}
                                {!noteOptions.length ? (
                                  <DropdownMenu.Item
                                    className="dropdown-item"
                                    disabled
                                  >
                                    Нет блокнотов
                                  </DropdownMenu.Item>
                                ) : null}
                              </DropdownMenu.SubContent>
                            </DropdownMenu.Portal>
                          </DropdownMenu.Sub>
                          {file.noteId ? (
                            <DropdownMenu.Item
                              className="dropdown-item"
                              onSelect={() => void bindFiles([file.id], null)}
                            >
                              <Unlink size={14} />
                              Отвязать
                            </DropdownMenu.Item>
                          ) : null}
                          <DropdownMenu.Separator className="dropdown-separator" />
                          <DropdownMenu.Item
                            className="dropdown-item dropdown-item--danger"
                            onSelect={() => removeFiles([file.id])}
                          >
                            <Trash2 size={14} />
                            Удалить
                          </DropdownMenu.Item>
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="file-empty-state">
              <span>
                <Upload size={25} />
              </span>
              <strong>
                {search.trim() ? "Файлы не найдены" : "Здесь пока нет файлов"}
              </strong>
              <p>
                {search.trim()
                  ? "Измените запрос или откройте другую папку."
                  : "Перетащите файлы сюда или выберите их на устройстве."}
              </p>
              {!search.trim() ? (
                <button
                  className="button button--primary"
                  onClick={onUpload}
                  type="button"
                >
                  <Upload size={15} />
                  Загрузить файлы
                </button>
              ) : null}
            </div>
          )
        ) : null}
      </div>

      {createOpen ? (
        <NameDialog
          currentName=""
          description={`Папка будет создана в ${path.at(-1)?.name ?? "корне хранилища"}.`}
          onClose={() => setCreateOpen(false)}
          onSave={async (name) => {
            if (
              await run(
                () => filesApi.createFolder(name, folderId),
                "Папка создана",
              )
            )
              setCreateOpen(false);
          }}
          open
          title="Новая папка"
        />
      ) : null}
      {rename ? (
        <NameDialog
          currentName={rename.name}
          description={
            rename.kind === "folder"
              ? "Измените название папки."
              : "Расширение можно изменить вместе с названием."
          }
          onClose={() => setRename(null)}
          onSave={async (name) => {
            const ok = await run(
              () =>
                rename.kind === "folder"
                  ? filesApi.renameFolder(rename.id, name)
                  : filesApi.patchFile(rename.id, { fileName: name }),
              "Название изменено",
            );
            if (ok) setRename(null);
          }}
          open
          title="Переименовать"
        />
      ) : null}
      <PreviewDialog
        file={preview?.file ?? null}
        onClose={() => setPreview(null)}
        url={preview?.url ?? null}
      />
      <ConfirmDialog
        confirmLabel="Удалить"
        description={
          deleteTarget?.kind === "folder"
            ? `Папка «${deleteTarget.name}» и все файлы внутри будут удалены без возможности восстановления.`
            : `Будет удалено файлов: ${deleteTarget?.ids.length ?? 0}. Это действие нельзя отменить.`
        }
        onConfirm={() => void confirmDelete()}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        open={deleteTarget !== null}
        title={
          deleteTarget?.kind === "folder" ? "Удалить папку?" : "Удалить файлы?"
        }
      />
    </div>
  );
}
