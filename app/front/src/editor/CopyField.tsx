import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { Check, Clipboard, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Tooltip } from '../components/Tooltip';
import { CopyFieldKindMenu } from './CopyFieldKindMenu';
import { copyFieldKinds, getKindLabel, type CopyFieldKind } from './copyFieldModel';

type CopyFieldAttrs = {
  label?: string;
  value?: string;
  kind?: CopyFieldKind;
  secret?: boolean;
};

export interface CopyFieldLabels {
  defaultLabel: string;
  copiedLabel: string;
  fieldLabel: string;
  fieldValue: string;
  fieldLabelPlaceholder: string;
  fieldValuePlaceholder: string;
  fieldKind: string;
  fieldKindText: string;
  fieldKindLogin: string;
  fieldKindPassword: string;
  fieldKindCredential: string;
  fieldKindToken: string;
  fieldKindUrl: string;
  generatePassword: string;
  copy: string;
}

function isSecretKind(kind: CopyFieldKind): boolean {
  return kind === 'password' || kind === 'credential' || kind === 'token';
}

function normalizeKind(value: string | null | undefined): CopyFieldKind {
  return copyFieldKinds.includes(value as CopyFieldKind) ? (value as CopyFieldKind) : 'text';
}

function maskSecret(value: string): string {
  const length = Math.max(8, Math.min(24, value.length || 8));
  return '*'.repeat(length);
}

function generatePassword(length = 18): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*_-+=';
  const required = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%^&*_-+='];
  const random = new Uint32Array(length);
  crypto.getRandomValues(random);
  const chars = Array.from(random, (value) => alphabet[value % alphabet.length]);

  required.forEach((group, index) => {
    chars[index] = group[random[index] % group.length];
  });

  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swapRandom = new Uint32Array(1);
    crypto.getRandomValues(swapRandom);
    const swapIndex = swapRandom[0] % (index + 1);
    [chars[index], chars[swapIndex]] = [chars[swapIndex], chars[index]];
  }

  return chars.join('');
}

function createCopyFieldView(labels: CopyFieldLabels) {
  return function CopyFieldView({ editor, node, selected, updateAttributes }: NodeViewProps) {
    const attrs = node.attrs as CopyFieldAttrs;
    const [copied, setCopied] = useState(false);
    const [isEditable, setIsEditable] = useState(() => editor.isEditable);
    const label = attrs.label ?? '';
    const value = attrs.value ?? '';
    const kind = normalizeKind(attrs.kind);
    const secret = attrs.secret ?? isSecretKind(kind);
    const displayedValue = !isEditable && secret ? maskSecret(value) : value;

    useEffect(() => {
      const refresh = () => setIsEditable(editor.isEditable);

      refresh();
      editor.on('transaction', refresh);
      window.addEventListener('notes-editor-editable-change', refresh);

      return () => {
        editor.off('transaction', refresh);
        window.removeEventListener('notes-editor-editable-change', refresh);
      };
    }, [editor]);

    const copyValue = async () => {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 900);
    };

    const generateValue = () => {
      updateAttributes({ value: generatePassword(), kind: 'password', secret: true });
    };

    const canGeneratePassword = isEditable && kind === 'password';

    return (
      <NodeViewWrapper
        className={`copy-field ${secret ? 'copy-field--secret' : ''} ${canGeneratePassword ? 'copy-field--with-generator' : ''} ${
          selected ? 'copy-field--selected' : ''
        }`}
      >
        <CopyFieldKindMenu
          kind={kind}
          labels={labels}
          disabled={!isEditable}
          onChange={(nextKind) => updateAttributes({ kind: nextKind, secret: isSecretKind(nextKind) })}
        />
        <input
          className="copy-field__label"
          aria-label={labels.fieldLabel}
          value={label}
          placeholder={labels.fieldLabelPlaceholder}
          readOnly={!isEditable}
          onChange={(event) => updateAttributes({ label: event.target.value })}
        />
        <input
          className="copy-field__value"
          aria-label={labels.fieldValue}
          value={displayedValue}
          placeholder={labels.fieldValuePlaceholder}
          readOnly={!isEditable}
          type={isEditable && secret ? 'password' : 'text'}
          onChange={(event) => updateAttributes({ value: event.target.value })}
        />
        {canGeneratePassword ? (
          <Tooltip label={labels.generatePassword}>
            <button className="copy-field__button copy-field__button--generate" type="button" onClick={generateValue} aria-label={labels.generatePassword}>
              <Sparkles size={15} />
            </button>
          </Tooltip>
        ) : null}
        <Tooltip label={copied ? labels.copiedLabel : labels.copy}>
          <button className="copy-field__button" type="button" onClick={copyValue} aria-label={copied ? labels.copiedLabel : labels.copy}>
            {copied ? <Check size={16} /> : <Clipboard size={16} />}
          </button>
        </Tooltip>
      </NodeViewWrapper>
    );
  };
}

export function createCopyField(labels: CopyFieldLabels) {
  return Node.create({
    name: 'copyField',
    group: 'block',
    atom: true,
    draggable: true,

    addAttributes() {
      return {
        label: {
          default: labels.defaultLabel,
          parseHTML: (element) => element.getAttribute('data-label'),
          renderHTML: (attributes) => ({
            'data-label': attributes.label as string,
          }),
        },
        value: {
          default: '',
          parseHTML: (element) => element.getAttribute('data-value'),
          renderHTML: (attributes) => ({
            'data-value': attributes.value as string,
          }),
        },
        kind: {
          default: 'text',
          parseHTML: (element) => normalizeKind(element.getAttribute('data-kind')),
          renderHTML: (attributes) => ({
            'data-kind': normalizeKind(attributes.kind as string | undefined),
          }),
        },
        secret: {
          default: false,
          parseHTML: (element) => element.getAttribute('data-secret') === 'true',
          renderHTML: (attributes) => ({
            'data-secret': attributes.secret ? 'true' : 'false',
          }),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'div[data-copy-field]' }];
    },

    renderHTML({ HTMLAttributes }) {
      const label = HTMLAttributes['data-label'] as string | undefined;
      const value = HTMLAttributes['data-value'] as string | undefined;
      const kind = normalizeKind(HTMLAttributes['data-kind'] as string | undefined);
      const secret = HTMLAttributes['data-secret'] === 'true' || isSecretKind(kind);

      return [
        'div',
        mergeAttributes(HTMLAttributes, {
          'data-copy-field': '',
          class: `copy-field-static ${secret ? 'copy-field-static--secret' : ''}`,
        }),
        ['span', { class: 'copy-field-static__kind' }, getKindLabel(labels, kind)],
        ['strong', {}, label ?? labels.defaultLabel],
        ['code', {}, secret ? maskSecret(value ?? '') : (value ?? '')],
      ];
    },

    addNodeView() {
      return ReactNodeViewRenderer(createCopyFieldView(labels));
    },
  });
}
