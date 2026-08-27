"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";
import { type ReactNode, useId, useMemo, useState } from "react";

export function UiProvider({ children }: { children: ReactNode }) {
  return <Tooltip.Provider delayDuration={350}>{children}</Tooltip.Provider>;
}

export function AppTooltip({
  children,
  label,
  side = "top",
}: {
  children: ReactNode;
  label: string;
  side?: "bottom" | "left" | "right" | "top";
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip-content" side={side} sideOffset={7}>
          {label}
          <Tooltip.Arrow className="tooltip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function TooltipText({
  children,
  className = "",
  label,
}: {
  children?: ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <AppTooltip label={label}>
      <span className={className}>{children ?? label}</span>
    </AppTooltip>
  );
}

export function ConfirmDialog({
  confirmLabel = "Подтвердить",
  description,
  onConfirm,
  onOpenChange,
  open,
  title,
}: {
  confirmLabel?: string;
  description: string;
  onConfirm(): void;
  onOpenChange(open: boolean): void;
  open: boolean;
  title: string;
}) {
  return (
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay confirm-dialog-overlay" />
        <Dialog.Content className="workspace-dialog workspace-dialog--confirm confirm-dialog-content">
          <header className="workspace-dialog__head">
            <span className="workspace-dialog__icon workspace-dialog__icon--danger">
              <AlertTriangle aria-hidden="true" size={18} />
            </span>
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>{description}</Dialog.Description>
            </div>
            <Dialog.Close aria-label="Закрыть" className="icon-button">
              <X aria-hidden="true" size={17} />
            </Dialog.Close>
          </header>
          <footer className="workspace-dialog__actions">
            <Dialog.Close className="button" type="button">
              Отмена
            </Dialog.Close>
            <button
              className="button button--danger"
              onClick={onConfirm}
              type="button"
            >
              {confirmLabel}
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function AppIconButton({
  active = false,
  children,
  className = "",
  disabled = false,
  label,
  onClick,
  popoverTarget,
}: {
  active?: boolean;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  label: string;
  onClick?(): void;
  popoverTarget?: string;
}) {
  return (
    <AppTooltip label={label}>
      <button
        aria-label={label}
        className={`icon-button ${active ? "is-active" : ""} ${className}`}
        disabled={disabled}
        onClick={onClick}
        popoverTarget={popoverTarget}
        type="button"
      >
        {children}
      </button>
    </AppTooltip>
  );
}

export function AppSwitch({
  checked,
  defaultChecked = false,
  disabled = false,
  label,
  onCheckedChange,
}: {
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  label: string;
  onCheckedChange?(checked: boolean): void;
}) {
  return (
    <label className="toggle">
      <input
        checked={checked}
        defaultChecked={checked === undefined ? defaultChecked : undefined}
        disabled={disabled}
        onChange={(event) => onCheckedChange?.(event.target.checked)}
        type="checkbox"
      />
      <span aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </label>
  );
}

export interface SearchableSelectOption<T extends string> {
  disabled?: boolean;
  icon?: LucideIcon;
  keywords?: string;
  label: string;
  value: T;
}

export function SearchableSelect<T extends string>({
  align = "start",
  ariaLabel,
  className = "",
  disabled = false,
  emptyLabel = "Ничего не найдено",
  name,
  onValueChange,
  options,
  searchPlaceholder = "Поиск",
  side = "bottom",
  value,
}: {
  align?: "center" | "end" | "start";
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  emptyLabel?: string;
  name?: string;
  onValueChange(value: T): void;
  options: SearchableSelectOption<T>[];
  searchPlaceholder?: string;
  side?: "bottom" | "top";
  value: T;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchId = useId();
  const selected = options.find((option) => option.value === value);
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ru");
    if (!query) return options;
    return options.filter((option) =>
      `${option.label} ${option.keywords ?? ""}`
        .toLocaleLowerCase("ru")
        .includes(query),
    );
  }, [options, search]);
  const SelectedIcon = selected?.icon;

  return (
    <DropdownMenu.Root
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setSearch("");
      }}
      open={open}
    >
      {name ? <input name={name} type="hidden" value={value} /> : null}
      <DropdownMenu.Trigger
        aria-label={ariaLabel}
        className={`searchable-select__trigger ${className}`}
        disabled={disabled}
        type="button"
      >
        {SelectedIcon ? <SelectedIcon aria-hidden="true" size={15} /> : null}
        <span>{selected?.label ?? ariaLabel}</span>
        <ChevronDown aria-hidden="true" size={14} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          className="dropdown-content searchable-select__content"
          side={side}
          sideOffset={7}
        >
          <label className="searchable-select__search" htmlFor={searchId}>
            <Search aria-hidden="true" size={14} />
            <input
              autoComplete="off"
              autoFocus
              id={searchId}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
              placeholder={searchPlaceholder}
              value={search}
            />
          </label>
          <DropdownMenu.RadioGroup
            onValueChange={(nextValue) => {
              onValueChange(nextValue as T);
              setOpen(false);
            }}
            value={value}
          >
            {filtered.map((option) => {
              const Icon = option.icon;
              return (
                <DropdownMenu.RadioItem
                  className="dropdown-item searchable-select__option"
                  disabled={option.disabled}
                  key={option.value}
                  value={option.value}
                >
                  {Icon ? <Icon aria-hidden="true" size={15} /> : <span />}
                  <span>{option.label}</span>
                  <DropdownMenu.ItemIndicator>
                    <Check aria-hidden="true" size={14} />
                  </DropdownMenu.ItemIndicator>
                </DropdownMenu.RadioItem>
              );
            })}
          </DropdownMenu.RadioGroup>
          {filtered.length === 0 ? (
            <div className="searchable-select__empty">{emptyLabel}</div>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
