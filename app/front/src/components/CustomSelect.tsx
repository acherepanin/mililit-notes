import { ChevronDown } from 'lucide-react';
import { useId, useMemo, useRef, useState } from 'react';

import { PortalListbox } from './PortalListbox';
import { TooltipText } from './TooltipText';
import { usePortalMenu } from './usePortalMenu';

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
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? options[0],
    [options, value],
  );
  const { close, direction, menuStyle } = usePortalMenu(
    isOpen,
    setIsOpen,
    buttonRef,
    menuRef,
    rootRef,
  );

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

      <PortalListbox
        isOpen={isOpen}
        direction={direction}
        menuStyle={menuStyle}
        listboxId={listboxId}
        label={label}
        menuRef={menuRef}
        value={value}
        options={options}
        onSelect={onChange}
        onClose={close}
        onFocusAnchor={() => buttonRef.current?.focus()}
      />
    </div>
  );
}
