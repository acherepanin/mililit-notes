import { Check, KeyRound, Link2, LockKeyhole, ShieldCheck, Type, UserRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Tooltip } from '../components/Tooltip';
import { TooltipText } from '../components/TooltipText';
import { usePortalMenu } from '../components/usePortalMenu';
import {
  copyFieldKinds,
  getKindLabel,
  type CopyFieldKind,
  type CopyFieldKindLabels,
} from './copyFieldModel';

interface FieldKindMenuProps {
  kind: CopyFieldKind;
  labels: CopyFieldKindLabels;
  disabled: boolean;
  onChange: (kind: CopyFieldKind) => void;
}

function getKindIcon(kind: CopyFieldKind): ReactNode {
  const size = 15;

  switch (kind) {
    case 'login':
      return <UserRound size={size} />;
    case 'password':
      return <LockKeyhole size={size} />;
    case 'credential':
      return <ShieldCheck size={size} />;
    case 'token':
      return <KeyRound size={size} />;
    case 'url':
      return <Link2 size={size} />;
    case 'text':
    default:
      return <Type size={size} />;
  }
}

export function CopyFieldKindMenu({ kind, labels, disabled, onChange }: FieldKindMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const kindOptions = useMemo(
    () =>
      copyFieldKinds.map((value) => ({
        value,
        label: getKindLabel(labels, value),
      })),
    [labels],
  );
  const currentLabel = getKindLabel(labels, kind);
  const { close, direction, menuStyle } = usePortalMenu(isOpen, setIsOpen, buttonRef, menuRef, rootRef, {
    flipThreshold: 190,
    maxHeightCap: 236,
    minWidth: 176,
    matchAnchorWidth: false,
    anchorMaxLeft: window.innerWidth - 178,
  });

  return (
    <span className="copy-field-kind" ref={rootRef}>
      <Tooltip label={currentLabel}>
        <button
          ref={buttonRef}
          className="copy-field-kind__button"
          type="button"
          aria-label={`${labels.fieldKind}: ${currentLabel}`}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          disabled={disabled}
          onClick={() => setIsOpen((current) => !current)}
        >
          {getKindIcon(kind)}
        </button>
      </Tooltip>

      {isOpen
        ? createPortal(
            <div
              className={`copy-field-kind__menu copy-field-kind__menu--${direction}`}
              role="listbox"
              id={listboxId}
              aria-label={labels.fieldKind}
              ref={menuRef}
              style={menuStyle}
            >
              {kindOptions.map((option) => {
                const selected = option.value === kind;

                return (
                  <button
                    className={`copy-field-kind__option ${selected ? 'copy-field-kind__option--selected' : ''}`}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    key={option.value}
                    onClick={() => {
                      onChange(option.value);
                      close();
                      buttonRef.current?.focus();
                    }}
                  >
                    {getKindIcon(option.value)}
                    <TooltipText value={option.label} className="copy-field-kind__option-label" />
                    {selected ? <Check size={13} /> : <span />}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
