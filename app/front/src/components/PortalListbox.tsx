import { Check } from 'lucide-react';
import { createPortal } from 'react-dom';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type RefObject,
} from 'react';

import { TooltipText } from './TooltipText';

export interface PortalListboxOption<TValue extends string> {
  value: TValue;
  label: string;
}

interface PortalListboxProps<TValue extends string> {
  isOpen: boolean;
  direction: 'up' | 'down';
  menuStyle: CSSProperties;
  listboxId: string;
  label: string;
  menuRef: RefObject<HTMLDivElement | null>;
  value: TValue;
  options: Array<PortalListboxOption<TValue>>;
  menuClassName?: string;
  onSelect: (value: TValue) => void;
  onClose: () => void;
  onFocusAnchor?: () => void;
}

export function PortalListbox<TValue extends string>({
  isOpen,
  direction,
  menuStyle,
  listboxId,
  label,
  menuRef,
  value,
  options,
  menuClassName = '',
  onSelect,
  onClose,
  onFocusAnchor,
}: PortalListboxProps<TValue>) {
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

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

  const selectHighlighted = useCallback(() => {
    const option = options[highlightedIndex];
    if (!option) {
      return;
    }

    onSelect(option.value);
    onClose();
    onFocusAnchor?.();
  }, [highlightedIndex, onClose, onFocusAnchor, onSelect, options]);

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
      onClose();
      onFocusAnchor?.();
    }
  };

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <div
      className={`custom-select__menu custom-select__menu--${direction} ${menuClassName}`.trim()}
      role="listbox"
      id={listboxId}
      aria-label={label}
      ref={menuRef}
      style={menuStyle}
      onKeyDown={onMenuKeyDown}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        const highlighted = index === highlightedIndex;

        return (
          <button
            className={`custom-select__option ${selected ? 'custom-select__option--selected' : ''} ${
              highlighted ? 'custom-select__option--highlighted' : ''
            }`}
            type="button"
            role="option"
            aria-selected={selected}
            key={option.value}
            ref={(element) => {
              optionRefs.current[index] = element;
            }}
            tabIndex={highlighted ? 0 : -1}
            onClick={() => {
              onSelect(option.value);
              onClose();
              onFocusAnchor?.();
            }}
          >
            <TooltipText value={option.label} className="custom-select__option-label" />
            {selected ? <Check size={13} /> : <span />}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
