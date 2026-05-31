import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Tooltip } from './Tooltip';

export interface IconActionMenuOption<TValue extends string | number> {
  value: TValue;
  label: string;
  hint?: string;
  icon?: ReactNode;
}

interface IconActionMenuProps<TValue extends string | number> {
  label: string;
  tooltip: string;
  icon: ReactNode;
  value: TValue;
  options: Array<IconActionMenuOption<TValue>>;
  active?: boolean;
  variant?: 'plain' | 'primary' | 'danger' | 'active';
  disabled?: boolean;
  onChange: (value: TValue) => void;
}

export function IconActionMenu<TValue extends string | number>({
  label,
  tooltip,
  icon,
  value,
  options,
  active = false,
  variant = 'plain',
  disabled = false,
  onChange,
}: IconActionMenuProps<TValue>) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selected = options.find((option) => option.value === value) ?? options[0];
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  const closeMenu = useCallback(() => {
    setIsOpen(false);
    buttonRef.current?.focus();
  }, []);

  const updatePosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) {
      return;
    }
    const rect = button.getBoundingClientRect();
    const menuWidth = 240;
    const gap = 6;
    const freeBelow = window.innerHeight - rect.bottom - gap;
    const freeAbove = rect.top - gap;
    const openDown = freeBelow >= 120 || freeBelow >= freeAbove;
    const maxHeight = Math.max(
      120,
      Math.min(320, (openDown ? freeBelow : freeAbove) - 8),
    );
    let left = rect.left;
    if (left + menuWidth > window.innerWidth - 10) {
      left = Math.max(10, rect.right - menuWidth);
    }

    setMenuStyle({
      left,
      top: openDown ? rect.bottom + gap : undefined,
      bottom: openDown ? undefined : window.innerHeight - rect.top + gap,
      width: menuWidth,
      maxHeight,
    });
  }, []);

  useLayoutEffect(() => {
    if (isOpen) {
      updatePosition();
    }
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
    optionRefs.current = [];
  }, [isOpen, options, selectedIndex]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    optionRefs.current[highlightedIndex]?.focus();
  }, [highlightedIndex, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('pointerdown', closeOnOutside);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, updatePosition]);

  const selectHighlighted = useCallback(() => {
    const option = options[highlightedIndex];
    if (!option) {
      return;
    }
    onChange(option.value);
    closeMenu();
  }, [closeMenu, highlightedIndex, onChange, options]);

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (options.length === 0) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((current) => (current + 1) % options.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((current) => (current - 1 + options.length) % options.length);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      setHighlightedIndex(0);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      setHighlightedIndex(options.length - 1);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectHighlighted();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
    }
  };

  return (
    <>
      <Tooltip label={selected ? `${tooltip}: ${selected.label}` : tooltip}>
        <button
          ref={buttonRef}
          className={`icon-action icon-action--${active || isOpen ? 'active' : variant} icon-action-menu__trigger`.trim()}
          type="button"
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          disabled={disabled}
          onClick={() => setIsOpen((current) => !current)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setIsOpen(true);
            }
          }}
        >
          {icon}
        </button>
      </Tooltip>
      {isOpen
        ? createPortal(
            <div
              ref={menuRef}
              className="icon-action-menu"
              style={menuStyle}
              role="menu"
              aria-label={label}
              onKeyDown={onMenuKeyDown}
            >
              {options.map((option, index) => {
                const highlighted = index === highlightedIndex;
                const optionLabel = option.hint ? `${option.label}. ${option.hint}` : option.label;

                return (
                  <button
                    key={String(option.value)}
                    ref={(element) => {
                      optionRefs.current[index] = element;
                    }}
                    className={`icon-action-menu__option ${
                      option.value === value ? 'icon-action-menu__option--active' : ''
                    } ${highlighted ? 'icon-action-menu__option--highlighted' : ''} ${
                      option.icon ? '' : 'icon-action-menu__option--solo'
                    }`.trim()}
                    type="button"
                    role="menuitem"
                    aria-label={optionLabel}
                    tabIndex={highlighted ? 0 : -1}
                    onClick={() => {
                      onChange(option.value);
                      closeMenu();
                    }}
                  >
                    {option.icon ? (
                      <span className="icon-action-menu__option-icon">{option.icon}</span>
                    ) : null}
                    <span className="icon-action-menu__option-body">
                      <strong>{option.label}</strong>
                      {option.hint ? <small>{option.hint}</small> : null}
                    </span>
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
