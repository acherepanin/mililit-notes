import { Check, KeyRound, Link2, LockKeyhole, ShieldCheck, Type, UserRound } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Tooltip } from '../components/Tooltip';
import { TooltipText } from '../components/TooltipText';
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
  const [direction, setDirection] = useState<'up' | 'down'>('down');
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
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

  const updateMenuPosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) {
      return;
    }

    const rect = button.getBoundingClientRect();
    const freeBelow = window.innerHeight - rect.bottom;
    const freeAbove = rect.top;
    const nextDirection = freeBelow >= 190 || freeBelow >= freeAbove ? 'down' : 'up';
    const maxHeight = Math.max(
      120,
      Math.min(236, (nextDirection === 'down' ? freeBelow : freeAbove) - 10),
    );

    setDirection(nextDirection);
    setMenuStyle({
      left: Math.min(rect.left, window.innerWidth - 178),
      top: nextDirection === 'down' ? rect.bottom + 5 : undefined,
      bottom: nextDirection === 'up' ? window.innerHeight - rect.top + 5 : undefined,
      width: 176,
      maxHeight,
    });
  }, []);

  useLayoutEffect(() => {
    if (isOpen) {
      updateMenuPosition();
    }
  }, [isOpen, updateMenuPosition]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target as globalThis.Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };

    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen, updateMenuPosition]);

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
                      setIsOpen(false);
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
