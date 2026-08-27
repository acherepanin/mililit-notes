"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Clock3,
  Copy,
  Download,
  FileJson,
  History,
  Link2,
  LoaderCircle,
  Pencil,
  RotateCcw,
  Share2,
  Tags,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { type FormEvent, useRef, useState } from "react";
import { toast } from "sonner";

import { notesApi, type NoteRecord, workspaceApi } from "./notes-api";
import { AppTooltip, SearchableSelect } from "./ui-controls";

export type WorkspaceTool =
  "delete" | "history" | "share" | "tags" | "templates" | "transfer" | "trash";

interface WorkspaceToolsProps {
  active: WorkspaceTool | null;
  note: NoteRecord | undefined;
  onClose(): void;
  onDeleted(id: number): void;
  onNoteChanged(note: NoteRecord): void;
  onSelectNote(id: number): void;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}

export function WorkspaceTools({
  active,
  note,
  onClose,
  onDeleted,
  onNoteChanged,
  onSelectNote,
}: WorkspaceToolsProps) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [createdUrl, setCreatedUrl] = useState("");
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(
    null,
  );
  const [editingTemplateName, setEditingTemplateName] = useState("");
  const [newTag, setNewTag] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>(note?.tags ?? []);
  const [templateName, setTemplateName] = useState("");
  const [ttlHours, setTtlHours] = useState("24");
  const [trashConfirmId, setTrashConfirmId] = useState<number | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const versions = useQuery({
    enabled: active === "history" && Boolean(note),
    queryFn: () => notesApi.getVersions(note!.id),
    queryKey: ["notes", note?.id, "versions"],
  });
  const templates = useQuery({
    enabled: active === "templates",
    queryFn: workspaceApi.listTemplates,
    queryKey: ["templates"],
  });
  const shares = useQuery({
    enabled: active === "share" && Boolean(note),
    queryFn: () => workspaceApi.listShares(note!.id),
    queryKey: ["notes", note?.id, "shares"],
  });
  const trash = useQuery({
    enabled: active === "trash",
    queryFn: notesApi.getTrash,
    queryKey: ["notes", "trash"],
  });
  const tags = useQuery({
    enabled: active === "tags",
    queryFn: notesApi.getTags,
    queryKey: ["notes", "tags"],
  });

  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    try {
      await operation();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Операция не выполнена",
      );
    } finally {
      setBusy(false);
    }
  };

  const refreshTree = () =>
    queryClient.invalidateQueries({ queryKey: ["notes", "tree"] });

  const content = (() => {
    if (active === "history" && note) {
      return {
        description:
          "Предыдущие состояния заметки можно открыть и восстановить.",
        icon: History,
        title: "История версий",
        view: versions.isPending ? (
          <div className="workspace-empty">Загрузка истории…</div>
        ) : versions.data?.length ? (
          <div className="workspace-list">
            {versions.data.map((version) => (
              <article className="workspace-list__item" key={version.id}>
                <div>
                  <strong>{version.name}</strong>
                  <span>{formatDate(version.createdAt)}</span>
                  <p>{version.contentText.slice(0, 240) || "Пустая версия"}</p>
                </div>
                <button
                  className="button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const restored = await notesApi.restoreVersion(
                        note.id,
                        version.id,
                        note.revision,
                      );
                      onNoteChanged(restored);
                      await refreshTree();
                      toast.success("Версия восстановлена");
                      onClose();
                    })
                  }
                  type="button"
                >
                  <RotateCcw size={14} />
                  Восстановить
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="workspace-empty">Предыдущих версий пока нет.</div>
        ),
      };
    }

    if (active === "templates") {
      return {
        description:
          "Создавайте заметки из готовой структуры или сохраните текущую.",
        icon: FileJson,
        title: "Шаблоны",
        view: (
          <>
            {note ? (
              <form
                className="workspace-inline-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(async () => {
                    await workspaceApi.createTemplate({
                      contentHtml: note.contentHtml,
                      contentText: note.contentText,
                      name: templateName.trim() || note.name,
                    });
                    setTemplateName("");
                    await templates.refetch();
                    toast.success("Шаблон сохранен");
                  });
                }}
              >
                <input
                  aria-label="Название шаблона"
                  autoComplete="off"
                  maxLength={160}
                  onChange={(event) => setTemplateName(event.target.value)}
                  placeholder={note.name}
                  value={templateName}
                />
                <button
                  className="button button--primary"
                  disabled={busy}
                  type="submit"
                >
                  Сохранить текущую
                </button>
              </form>
            ) : null}
            <div className="workspace-list">
              {templates.data?.map((template) => (
                <div className="workspace-list__item" key={template.id}>
                  {editingTemplateId === template.id ? (
                    <form
                      className="template-edit-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void run(async () => {
                          await workspaceApi.updateTemplate(template.id, {
                            contentHtml: template.contentHtml,
                            contentText: template.contentText,
                            name: editingTemplateName.trim() || template.name,
                          });
                          setEditingTemplateId(null);
                          await templates.refetch();
                          toast.success("Шаблон обновлен");
                        });
                      }}
                    >
                      <input
                        aria-label={`Новое название шаблона ${template.name}`}
                        autoComplete="off"
                        autoFocus
                        maxLength={160}
                        onChange={(event) =>
                          setEditingTemplateName(event.target.value)
                        }
                        value={editingTemplateName}
                      />
                      <button
                        className="button button--primary"
                        disabled={busy}
                        type="submit"
                      >
                        Сохранить
                      </button>
                      <button
                        className="button"
                        onClick={() => setEditingTemplateId(null)}
                        type="button"
                      >
                        Отмена
                      </button>
                    </form>
                  ) : (
                    <div>
                      <strong>{template.name}</strong>
                      <span>{template.isSystem ? "Системный" : "Личный"}</span>
                    </div>
                  )}
                  <div className="workspace-list__actions">
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const created = await workspaceApi.createFromTemplate(
                            template.id,
                            note?.parentId ?? null,
                          );
                          queryClient.setQueryData(
                            ["notes", created.id],
                            created,
                          );
                          await refreshTree();
                          onSelectNote(created.id);
                          toast.success("Заметка создана из шаблона");
                          onClose();
                        })
                      }
                      type="button"
                    >
                      Использовать
                    </button>
                    {!template.isSystem ? (
                      <>
                        <AppTooltip label="Переименовать">
                          <button
                            aria-label={`Переименовать шаблон ${template.name}`}
                            className="icon-button"
                            disabled={busy}
                            onClick={() => {
                              setEditingTemplateId(template.id);
                              setEditingTemplateName(template.name);
                            }}
                            type="button"
                          >
                            <Pencil size={15} />
                          </button>
                        </AppTooltip>
                        {note ? (
                          <AppTooltip label="Обновить из текущей заметки">
                            <button
                              aria-label={`Обновить шаблон ${template.name} из текущей заметки`}
                              className="icon-button"
                              disabled={busy}
                              onClick={() =>
                                void run(async () => {
                                  await workspaceApi.updateTemplate(
                                    template.id,
                                    {
                                      contentHtml: note.contentHtml,
                                      contentText: note.contentText,
                                      name: template.name,
                                    },
                                  );
                                  await templates.refetch();
                                  toast.success(
                                    "Содержимое шаблона обновлено из заметки",
                                  );
                                })
                              }
                              type="button"
                            >
                              <RotateCcw size={15} />
                            </button>
                          </AppTooltip>
                        ) : null}
                        <button
                          aria-label={`Удалить шаблон ${template.name}`}
                          className="icon-button icon-button--danger"
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              await workspaceApi.removeTemplate(template.id);
                              await templates.refetch();
                            })
                          }
                          type="button"
                        >
                          <Trash2 size={15} />
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
              {!templates.isPending && !templates.data?.length ? (
                <div className="workspace-empty">Шаблонов пока нет.</div>
              ) : null}
            </div>
          </>
        ),
      };
    }

    if (active === "share" && note) {
      return {
        description:
          "Ссылка открывает только эту заметку и автоматически истекает.",
        icon: Share2,
        title: "Публичный доступ",
        view: (
          <>
            <form
              className="workspace-form workspace-form--share"
              onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                void run(async () => {
                  const created = await workspaceApi.createShare(note.id, {
                    includeSecrets: data.get("includeSecrets") === "on",
                    oneTime: data.get("oneTime") === "on",
                    ttlHours: Number(data.get("ttlHours")),
                  });
                  const url = new URL(created.url, window.location.origin).href;
                  setCreatedUrl(url);
                  await shares.refetch();
                  await navigator.clipboard.writeText(url);
                  toast.success("Ссылка создана и скопирована");
                });
              }}
            >
              <label>
                <span>Срок действия</span>
                <SearchableSelect
                  ariaLabel="Срок действия"
                  name="ttlHours"
                  onValueChange={setTtlHours}
                  options={[
                    { label: "1 час", value: "1" },
                    { label: "1 день", value: "24" },
                    { label: "7 дней", value: "168" },
                    { label: "30 дней", value: "720" },
                  ]}
                  value={ttlHours}
                />
              </label>
              <label className="workspace-check">
                <input name="oneTime" type="checkbox" />
                <span>Одно открытие</span>
              </label>
              <label className="workspace-check workspace-check--warning">
                <input name="includeSecrets" type="checkbox" />
                <span>Показывать секретные поля</span>
              </label>
              <button className="button button--primary" disabled={busy}>
                <Link2 size={14} />
                Создать ссылку
              </button>
            </form>
            {createdUrl ? (
              <div className="workspace-copy-row">
                <input
                  aria-label="Новая публичная ссылка"
                  readOnly
                  value={createdUrl}
                />
                <button
                  aria-label="Скопировать ссылку"
                  className="icon-button"
                  onClick={() => void navigator.clipboard.writeText(createdUrl)}
                  type="button"
                >
                  <Copy size={15} />
                </button>
              </div>
            ) : null}
            <div className="workspace-list">
              {shares.data?.map((share) => (
                <div className="workspace-list__item" key={share.id}>
                  <div>
                    <strong>
                      {share.oneTime ? "Одноразовая" : "Многоразовая"} ссылка
                    </strong>
                    <span>
                      До {formatDate(share.expiresAt)} · открытий{" "}
                      {share.accessCount}
                      {share.revokedAt ? " · отозвана" : ""}
                    </span>
                  </div>
                  {!share.revokedAt ? (
                    <button
                      className="button button--danger"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await workspaceApi.revokeShare(share.id);
                          await shares.refetch();
                        })
                      }
                      type="button"
                    >
                      Отозвать
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </>
        ),
      };
    }

    if (active === "transfer") {
      return {
        description:
          "JSON сохраняет дерево, теги, содержимое и личные шаблоны.",
        icon: FileJson,
        title: "Импорт и экспорт",
        view: (
          <div className="transfer-actions">
            <button
              className="transfer-action"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const data = await workspaceApi.exportJson();
                  const url = URL.createObjectURL(
                    new Blob([JSON.stringify(data, null, 2)], {
                      type: "application/json",
                    }),
                  );
                  const link = document.createElement("a");
                  link.download = `notes-${new Date().toISOString().slice(0, 10)}.json`;
                  link.href = url;
                  link.click();
                  URL.revokeObjectURL(url);
                  toast.success("Экспорт подготовлен");
                })
              }
              type="button"
            >
              <Download size={20} />
              <strong>Экспортировать JSON</strong>
              <span>Скачать переносимую резервную копию.</span>
            </button>
            <button
              className="transfer-action"
              disabled={busy}
              onClick={() => importInput.current?.click()}
              type="button"
            >
              <Upload size={20} />
              <strong>Импортировать JSON</strong>
              <span>Добавить данные без замены существующих.</span>
            </button>
            <input
              accept="application/json,.json"
              className="visually-hidden-input"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                void run(async () => {
                  if (file.size > 10_000_000)
                    throw new Error("Файл больше 10 МБ");
                  const result = await workspaceApi.importJson(
                    JSON.parse(await file.text()) as unknown,
                  );
                  await refreshTree();
                  await queryClient.invalidateQueries({
                    queryKey: ["templates"],
                  });
                  toast.success(
                    `Импортировано заметок: ${result.importedNotes}, шаблонов: ${result.importedTemplates}`,
                  );
                  onClose();
                });
              }}
              ref={importInput}
              type="file"
            />
          </div>
        ),
      };
    }

    if (active === "tags" && note) {
      return {
        description: "Теги помогают фильтровать и связывать заметки.",
        icon: Tags,
        title: "Теги заметки",
        view: (
          <form
            className="workspace-form"
            onSubmit={(event) => {
              event.preventDefault();
              const additions = newTag
                .split(",")
                .map((value) => value.trim().toLocaleLowerCase("ru"))
                .filter(Boolean);
              void run(async () => {
                const updated = await notesApi.setTags(note.id, note.revision, [
                  ...new Set([...selectedTags, ...additions]),
                ]);
                onNoteChanged(updated);
                await Promise.all([refreshTree(), tags.refetch()]);
                toast.success("Теги обновлены");
                onClose();
              });
            }}
          >
            <div className="tag-picker">
              {tags.data?.map((tag) => (
                <label className="tag-option" key={tag.id}>
                  <input
                    checked={selectedTags.includes(tag.name)}
                    onChange={(event) =>
                      setSelectedTags((current) =>
                        event.target.checked
                          ? [...new Set([...current, tag.name])]
                          : current.filter((value) => value !== tag.name),
                      )
                    }
                    type="checkbox"
                  />
                  <span>{tag.name}</span>
                </label>
              ))}
              {!tags.data?.length ? (
                <span>Сохраненных тегов пока нет.</span>
              ) : null}
            </div>
            <label>
              <span>Новые теги через запятую</span>
              <input
                maxLength={300}
                onChange={(event) => setNewTag(event.target.value)}
                placeholder="работа, идеи"
                value={newTag}
              />
            </label>
            <footer className="workspace-dialog__actions">
              <button className="button button--primary" disabled={busy}>
                Сохранить
              </button>
            </footer>
          </form>
        ),
      };
    }

    if (active === "trash") {
      return {
        description: "Восстановите заметку или удалите ее безвозвратно.",
        icon: Trash2,
        title: "Корзина",
        view: trash.data?.length ? (
          <div className="workspace-list">
            {trash.data.map((item) => (
              <div className="workspace-list__item" key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <span>
                    {item.deletedAt ? formatDate(item.deletedAt) : "Удалена"}
                  </span>
                </div>
                <div className="workspace-list__actions">
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const restored = await notesApi.restore(
                          item.id,
                          item.revision,
                        );
                        queryClient.setQueryData(["notes", item.id], restored);
                        await Promise.all([refreshTree(), trash.refetch()]);
                        onSelectNote(item.id);
                        toast.success("Заметка восстановлена");
                        onClose();
                      })
                    }
                    type="button"
                  >
                    Восстановить
                  </button>
                  {trashConfirmId === item.id ? (
                    <button
                      className="button button--danger"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await notesApi.removePermanently(
                            item.id,
                            item.revision,
                          );
                          await trash.refetch();
                          toast.success("Заметка удалена безвозвратно");
                        })
                      }
                      type="button"
                    >
                      Подтвердить
                    </button>
                  ) : (
                    <button
                      aria-label={`Удалить ${item.name} безвозвратно`}
                      className="icon-button icon-button--danger"
                      onClick={() => setTrashConfirmId(item.id)}
                      type="button"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="workspace-empty">Корзина пуста.</div>
        ),
      };
    }

    if (active === "delete" && note) {
      return {
        description: "Заметку можно будет восстановить из корзины.",
        icon: Trash2,
        title: `Удалить «${note.name}»?`,
        view: (
          <footer className="workspace-dialog__actions">
            <button className="button" onClick={onClose} type="button">
              Отмена
            </button>
            <button
              className="button button--danger"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await notesApi.remove(note.id, note.revision);
                  onDeleted(note.id);
                  await Promise.all([
                    refreshTree(),
                    queryClient.invalidateQueries({
                      queryKey: ["notes", "trash"],
                    }),
                  ]);
                  toast.success("Заметка перемещена в корзину");
                  onClose();
                })
              }
              type="button"
            >
              Удалить
            </button>
          </footer>
        ),
      };
    }

    return null;
  })();

  const Icon = content?.icon ?? Clock3;
  return (
    <Dialog.Root
      onOpenChange={(open) => !open && onClose()}
      open={active !== null}
    >
      {content ? (
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="workspace-dialog">
            <header className="workspace-dialog__head">
              <span className="workspace-dialog__icon">
                <Icon aria-hidden="true" size={18} />
              </span>
              <div>
                <Dialog.Title>{content.title}</Dialog.Title>
                <Dialog.Description>{content.description}</Dialog.Description>
              </div>
              <Dialog.Close aria-label="Закрыть" className="icon-button">
                <X size={17} />
              </Dialog.Close>
            </header>
            <div className="workspace-dialog__body">{content.view}</div>
            {busy ? (
              <span className="workspace-dialog__busy" role="status">
                <LoaderCircle className="is-spinning" size={14} />
                Выполняется…
              </span>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      ) : null}
    </Dialog.Root>
  );
}
