"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Link2, Trash2, X } from "lucide-react";
import type { FormEvent } from "react";

interface EditorLinkDialogProps {
  editing: boolean;
  error: string;
  hasSelection: boolean;
  onApply(event: FormEvent<HTMLFormElement>): void;
  onOpenChange(open: boolean): void;
  onRemove(): void;
  onTextChange(value: string): void;
  onUrlChange(value: string): void;
  open: boolean;
  text: string;
  url: string;
}

export function EditorLinkDialog({
  editing,
  error,
  hasSelection,
  onApply,
  onOpenChange,
  onRemove,
  onTextChange,
  onUrlChange,
  open,
  text,
  url,
}: EditorLinkDialogProps) {
  return (
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="workspace-dialog editor-link-dialog">
          <header className="workspace-dialog__head">
            <span className="workspace-dialog__icon editor-link-dialog__icon">
              <Link2 aria-hidden="true" size={18} />
            </span>
            <div>
              <Dialog.Title>
                {editing ? "Изменить ссылку" : "Добавить ссылку"}
              </Dialog.Title>
              <Dialog.Description>
                {hasSelection
                  ? "Адрес будет применён к выделенному тексту"
                  : "Укажите подпись и адрес перехода"}
              </Dialog.Description>
            </div>
            <Dialog.Close aria-label="Закрыть" className="icon-button">
              <X aria-hidden="true" size={17} />
            </Dialog.Close>
          </header>
          <form className="workspace-form editor-link-form" onSubmit={onApply}>
            {hasSelection ? (
              <div className="editor-link-selection">
                <span>Выделенный текст</span>
                <strong title={text}>{text}</strong>
              </div>
            ) : (
              <label>
                <span>Текст ссылки</span>
                <input
                  autoComplete="off"
                  autoFocus
                  maxLength={500}
                  onChange={(event) => onTextChange(event.target.value)}
                  required
                  value={text}
                />
              </label>
            )}
            <label>
              <span>Адрес ссылки</span>
              <input
                aria-describedby={error ? "editor-link-error" : undefined}
                aria-invalid={Boolean(error)}
                autoComplete="url"
                autoFocus={hasSelection}
                onChange={(event) => onUrlChange(event.target.value)}
                placeholder="https://example.com"
                required
                type="url"
                value={url}
              />
            </label>
            {error ? (
              <p
                className="editor-link-error"
                id="editor-link-error"
                role="alert"
              >
                {error}
              </p>
            ) : null}
            <footer className="editor-link-dialog__footer">
              {editing ? (
                <button
                  className="button button--danger"
                  onClick={onRemove}
                  type="button"
                >
                  <Trash2 aria-hidden="true" size={14} />
                  Удалить
                </button>
              ) : (
                <span />
              )}
              <div className="workspace-dialog__actions">
                <Dialog.Close className="button" type="button">
                  Отмена
                </Dialog.Close>
                <button className="button button--primary" type="submit">
                  <Link2 aria-hidden="true" size={14} />
                  {editing ? "Сохранить" : "Применить"}
                </button>
              </div>
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
