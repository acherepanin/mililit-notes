import { Check, ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { TooltipText } from './TooltipText';

export interface SelectOption<TValue extends string> {
  value: TValue;
  label: string;
}

interface CustomSelectProps<TValue extends string> {
  value: TValue;
  options: Array<SelectOption<TValue>>;
  label: string;
  disabled?: boolean;
  className?: string;
  onChange: (value: TValue) => void;
}

export function CustomSelect<TValue extends string>({
  value,
  options,
  label,
  disabled = false,
  className = '',
  onChange,
}: CustomSelectProps<TValue>) {
  const [isOpen, setIsOpen] = useState(false);
  const [direction, setDirection] = useState<'up' | 'down'>('down');
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? options[0],
    [options, value],
  );

  const updateMenuPosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) {
      return;
    }

    const rect = button.getBoundingClientRect();
    const freeBelow = window.innerHeight - rect.bottom;
    const freeAbove = rect.top;
    const nextDirection = freeBelow >= 232 || freeBelow >= freeAbove ? 'down' : 'up';
    const maxHeight = Math.max(
      120,
      Math.min(260, (nextDirection === 'down' ? freeBelow : freeAbove) - 12),
    );

    setDirection(nextDirection);
    setMenuStyle({
      left: rect.left,
      top: nextDirection === 'down' ? rect.bottom + 5 : undefined,
      bottom: nextDirection === 'up' ? window.innerHeight - rect.top + 5 : undefined,
      width: rect.width,
      maxHeight,
    });
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }

    updateMenuPosition();
  }, [isOpen, updateMenuPosition]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);

    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [isOpen, updateMenuPosition]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target as Node;
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

    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  return (
    <div className={`custom-select custom-select--${direction} ${className}`} ref={rootRef}>
      <button
        ref={buttonRef}
        className="custom-select__button"
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        disabled={disabled}
        onClick={() => setIsOpen((current) => !current)}
      >
        <TooltipText value={selectedOption?.label ?? ''} className="custom-select__value" />
        <ChevronDown size={14} className="custom-select__chevron" />
      </button>

      {isOpen
        ? createPortal(
            <div
              className={`custom-select__menu custom-select__menu--${direction}`}
              role="listbox"
              id={listboxId}
              aria-label={label}
              ref={menuRef}
              style={menuStyle}
            >
              {options.map((option) => {
                const selected = option.value === value;

                return (
                  <button
                    className={`custom-select__option ${selected ? 'custom-select__option--selected' : ''}`}
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
                    <TooltipText value={option.label} className="custom-select__option-label" />
                    {selected ? <Check size={13} /> : <span />}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
