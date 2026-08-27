"use client";

import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TextSelection, type EditorState } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type Editor,
  type ReactNodeViewProps,
} from "@tiptap/react";
import bash from "highlight.js/lib/languages/bash";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import dart from "highlight.js/lib/languages/dart";
import diff from "highlight.js/lib/languages/diff";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import go from "highlight.js/lib/languages/go";
import graphql from "highlight.js/lib/languages/graphql";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import kotlin from "highlight.js/lib/languages/kotlin";
import markdown from "highlight.js/lib/languages/markdown";
import nginx from "highlight.js/lib/languages/nginx";
import php from "highlight.js/lib/languages/php";
import plaintext from "highlight.js/lib/languages/plaintext";
import python from "highlight.js/lib/languages/python";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import scss from "highlight.js/lib/languages/scss";
import shell from "highlight.js/lib/languages/shell";
import sql from "highlight.js/lib/languages/sql";
import swift from "highlight.js/lib/languages/swift";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { Braces } from "lucide-react";
import { createLowlight } from "lowlight";
import { type KeyboardEvent, useMemo } from "react";

import { AppIconButton, SearchableSelect } from "./ui-controls";

const AUTO_LANGUAGE = "auto";
const languages = [
  [AUTO_LANGUAGE, "Автоопределение"],
  ["plaintext", "Обычный текст"],
  ["json", "JSON"],
  ["javascript", "JavaScript"],
  ["typescript", "TypeScript"],
  ["xml", "HTML / XML"],
  ["css", "CSS"],
  ["scss", "SCSS"],
  ["bash", "Bash"],
  ["shell", "Shell"],
  ["markdown", "Markdown"],
  ["yaml", "YAML"],
  ["sql", "SQL"],
  ["python", "Python"],
  ["java", "Java"],
  ["csharp", "C#"],
  ["cpp", "C++"],
  ["go", "Go"],
  ["rust", "Rust"],
  ["php", "PHP"],
  ["ruby", "Ruby"],
  ["kotlin", "Kotlin"],
  ["swift", "Swift"],
  ["dart", "Dart"],
  ["dockerfile", "Dockerfile"],
  ["nginx", "Nginx"],
  ["graphql", "GraphQL"],
  ["ini", "INI"],
  ["diff", "Diff"],
] as const;
type CodeLanguage = (typeof languages)[number][0];
const knownLanguages = new Set<string>(languages.map(([value]) => value));

const lowlight = createLowlight({
  bash,
  cpp,
  csharp,
  css,
  dart,
  diff,
  dockerfile,
  go,
  graphql,
  ini,
  java,
  javascript,
  json,
  kotlin,
  markdown,
  nginx,
  php,
  plaintext,
  python,
  ruby,
  rust,
  scss,
  shell,
  sql,
  swift,
  typescript,
  xml,
  yaml,
});

interface CodeRange {
  from: number;
  node: ProseMirrorNode;
  position: number;
  to: number;
}

function codeRangeAt(state: EditorState, position: number): CodeRange | null {
  const node = state.doc.nodeAt(position);
  return node?.type.name === "codeBlock"
    ? {
        from: position + 1,
        node,
        position,
        to: position + node.nodeSize - 1,
      }
    : null;
}

function activeCodeRange(state: EditorState): CodeRange | null {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === "codeBlock") {
      return codeRangeAt(state, $from.before(depth));
    }
  }
  return null;
}

function isSelectAll(
  event: Pick<KeyboardEvent, "altKey" | "code" | "ctrlKey" | "key" | "metaKey">,
) {
  return (
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    (event.code === "KeyA" || event.key.toLocaleLowerCase() === "a")
  );
}

export function selectCurrentCodeBlockText(view: EditorView): boolean {
  const range = activeCodeRange(view.state);
  if (!range) return false;
  view.dispatch(
    view.state.tr.setSelection(
      TextSelection.create(view.state.doc, range.from, range.to),
    ),
  );
  return true;
}

function formatCode(value: string, language: string): string {
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return normalized;
  if (
    language === "json" ||
    (language === AUTO_LANGUAGE && /^[\[{]/.test(normalized))
  ) {
    try {
      return JSON.stringify(JSON.parse(normalized), null, 2);
    } catch {
      if (language === "json") return normalized;
    }
  }
  if (language === "sql") {
    return normalized
      .replace(/\s+/g, " ")
      .replace(
        /\b(select|from|where|and|or|join|left join|right join|inner join|group by|order by|limit|values|set)\b/gi,
        (match) => `\n${match.toUpperCase()}`,
      )
      .replace(/\n+/g, "\n")
      .trim();
  }
  return normalized
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");
}

function formatAt(editor: Editor, position: number | undefined): boolean {
  if (typeof position !== "number") return false;
  const range = codeRangeAt(editor.state, position);
  if (!range) return false;
  const language = String(range.node.attrs.language ?? AUTO_LANGUAGE);
  const formatted = formatCode(range.node.textContent, language);
  if (formatted !== range.node.textContent) {
    editor.view.dispatch(
      editor.state.tr.insertText(formatted, range.from, range.to),
    );
  }
  editor.view.focus();
  return true;
}

function CodeBlockView({
  editor,
  getPos,
  node,
  updateAttributes,
}: ReactNodeViewProps) {
  const rawLanguage = String(node.attrs.language ?? AUTO_LANGUAGE);
  const language: CodeLanguage = knownLanguages.has(rawLanguage)
    ? (rawLanguage as CodeLanguage)
    : AUTO_LANGUAGE;
  const lines = useMemo(
    () =>
      Array.from(
        { length: Math.max(1, node.textContent.split("\n").length) },
        (_, index) => index + 1,
      ),
    [node.textContent],
  );
  const selectCodeOnly = (event: KeyboardEvent<HTMLElement>) => {
    if (
      !isSelectAll(event) ||
      (event.target instanceof Element &&
        event.target.closest(".code-block__toolbar"))
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    selectCurrentCodeBlockText(editor.view);
  };
  return (
    <NodeViewWrapper
      className="code-block"
      data-language={language}
      onKeyDownCapture={selectCodeOnly}
    >
      <div className="code-block__toolbar" contentEditable={false}>
        <SearchableSelect<CodeLanguage>
          ariaLabel="Язык блока кода"
          className="code-block__language"
          onValueChange={(value) =>
            updateAttributes({
              language: value === AUTO_LANGUAGE ? null : value,
            })
          }
          options={languages.map(([value, label]) => ({ label, value }))}
          searchPlaceholder="Найти язык"
          side="bottom"
          value={language}
        />
        <AppIconButton
          label="Форматировать код"
          onClick={() => formatAt(editor, getPos())}
        >
          <Braces aria-hidden="true" size={15} />
        </AppIconButton>
      </div>
      <pre>
        <span
          aria-hidden="true"
          className="code-block__lines"
          contentEditable={false}
        >
          {lines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </span>
        <NodeViewContent className="code-block__content" />
      </pre>
    </NodeViewWrapper>
  );
}

export const CodeBlockWithTools = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
}).configure({ defaultLanguage: null, lowlight });
