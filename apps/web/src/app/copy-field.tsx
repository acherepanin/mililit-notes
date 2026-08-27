"use client";

import { mergeAttributes, Node } from "@tiptap/core";
import {
  NodeViewWrapper,
  type NodeViewProps,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import {
  Check,
  Copy,
  KeyRound,
  Link2,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Type,
  UserRound,
} from "lucide-react";
import { useState } from "react";

import {
  AppTooltip,
  SearchableSelect,
  type SearchableSelectOption,
} from "./ui-controls";

export const copyFieldKinds = [
  "text",
  "login",
  "password",
  "credential",
  "token",
  "url",
  "secret",
] as const;

export type CopyFieldKind = (typeof copyFieldKinds)[number];

export const copyFieldLabels: Record<CopyFieldKind, string> = {
  credential: "Учетные данные",
  login: "Логин",
  password: "Пароль",
  secret: "Секрет",
  text: "Текст",
  token: "Токен",
  url: "Ссылка",
};

export function isSecretKind(kind: CopyFieldKind) {
  return ["credential", "password", "secret", "token"].includes(kind);
}

function normalizeKind(value: unknown): CopyFieldKind {
  return copyFieldKinds.includes(value as CopyFieldKind)
    ? (value as CopyFieldKind)
    : "text";
}

const kindIcons = {
  credential: ShieldCheck,
  login: UserRound,
  password: LockKeyhole,
  secret: ShieldCheck,
  text: Type,
  token: KeyRound,
  url: Link2,
} satisfies Record<CopyFieldKind, typeof Type>;

const kindOptions = copyFieldKinds.map((kind) => ({
  icon: kindIcons[kind],
  label: copyFieldLabels[kind],
  value: kind,
})) satisfies SearchableSelectOption<CopyFieldKind>[];

function generatePassword(length = 18) {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*_-+=";
  const random = new Uint32Array(length);
  crypto.getRandomValues(random);
  return Array.from(random, (value) => alphabet[value % alphabet.length]).join(
    "",
  );
}

function toSafeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const href = /^[a-z][a-z\d+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const url = new URL(href);
    return ["http:", "https:", "mailto:", "tel:"].includes(url.protocol)
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function CopyFieldView({
  editor,
  node,
  selected,
  updateAttributes,
}: NodeViewProps) {
  const kind = normalizeKind(node.attrs.kind);
  const label = String(node.attrs.label || copyFieldLabels[kind]);
  const value = String(node.attrs.value || "");
  const secret = isSecretKind(kind);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_200);
  };

  return (
    <NodeViewWrapper
      className={`copy-field ${secret ? "copy-field--secret" : ""} ${kind === "password" ? "copy-field--with-generator" : ""} ${selected ? "ProseMirror-selectednode" : ""}`}
      data-copy-field=""
      data-kind={kind}
      data-label={label}
      data-secret={secret ? "true" : "false"}
      data-value={value}
    >
      <SearchableSelect
        ariaLabel={`Тип поля: ${copyFieldLabels[kind]}`}
        className="copy-field__kind-select"
        disabled={!editor.isEditable}
        onValueChange={(nextKind) =>
          updateAttributes({
            kind: nextKind,
            label:
              !label || Object.values(copyFieldLabels).includes(label)
                ? copyFieldLabels[nextKind]
                : label,
            secret: isSecretKind(nextKind),
          })
        }
        options={kindOptions}
        searchPlaceholder="Найти тип"
        side="top"
        value={kind}
      />
      <input
        aria-label="Название поля"
        autoComplete="off"
        className="copy-field__label"
        maxLength={160}
        onChange={(event) => updateAttributes({ label: event.target.value })}
        placeholder="Название"
        readOnly={!editor.isEditable}
        value={label}
      />
      <input
        aria-label="Значение поля"
        autoComplete="off"
        className={`copy-field__value ${secret ? "copy-field__value--masked" : ""}`}
        maxLength={20_000}
        onChange={(event) => updateAttributes({ value: event.target.value })}
        placeholder="Значение"
        readOnly={!editor.isEditable}
        value={value}
      />
      {kind === "password" && editor.isEditable ? (
        <AppTooltip label="Сгенерировать пароль">
          <button
            aria-label="Сгенерировать пароль"
            className="copy-field__button copy-field__button--generate"
            onClick={() => updateAttributes({ value: generatePassword() })}
            type="button"
          >
            <Sparkles size={15} />
          </button>
        </AppTooltip>
      ) : null}
      <AppTooltip label={copied ? "Скопировано" : "Скопировать значение"}>
        <button
          aria-label={copied ? "Скопировано" : "Скопировать значение"}
          className="copy-field__button"
          onClick={() => void copy()}
          type="button"
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}
        </button>
      </AppTooltip>
    </NodeViewWrapper>
  );
}

export const CopyField = Node.create({
  addAttributes() {
    return {
      kind: {
        default: "text",
        parseHTML: (element) =>
          normalizeKind(element.getAttribute("data-kind")),
        renderHTML: (attributes) => ({
          "data-kind": normalizeKind(attributes.kind),
        }),
      },
      label: {
        default: "Поле",
        parseHTML: (element) => element.getAttribute("data-label") ?? "Поле",
        renderHTML: (attributes) => ({
          "data-label": String(attributes.label),
        }),
      },
      secret: {
        default: false,
        parseHTML: (element) =>
          element.getAttribute("data-secret") === "true" ||
          isSecretKind(normalizeKind(element.getAttribute("data-kind"))),
        renderHTML: (attributes) => ({
          "data-secret": isSecretKind(normalizeKind(attributes.kind))
            ? "true"
            : "false",
        }),
      },
      value: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-value") ?? "",
        renderHTML: (attributes) => ({
          "data-value": String(attributes.value),
        }),
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(CopyFieldView);
  },
  atom: true,
  draggable: true,
  group: "block",
  name: "copyField",
  parseHTML() {
    return [{ tag: "div[data-copy-field]" }];
  },
  renderHTML({ HTMLAttributes, node }) {
    const kind = normalizeKind(node.attrs.kind);
    const secret = isSecretKind(kind);
    const label = String(node.attrs.label || copyFieldLabels[kind]);
    const value = String(node.attrs.value || "");
    const safeUrl = kind === "url" ? toSafeUrl(value) : null;
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-copy-field": "",
        class: `copy-field-static ${secret ? "copy-field-static--secret" : ""}`,
      }),
      ["span", { class: "copy-field-static__kind" }, copyFieldLabels[kind]],
      ["strong", {}, label],
      safeUrl
        ? [
            "a",
            {
              class: "copy-field-static__link",
              href: safeUrl,
              rel: "noreferrer",
              target: "_blank",
            },
            value,
          ]
        : ["code", {}, secret ? "********" : value],
    ];
  },
  renderText({ node }) {
    const kind = normalizeKind(node.attrs.kind);
    const label = String(node.attrs.label || copyFieldLabels[kind]);
    const value = String(node.attrs.value || "");
    return `${label}: ${isSecretKind(kind) ? "[secret hidden]" : value}`;
  },
});
