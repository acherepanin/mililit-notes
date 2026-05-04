import { Check, ListFilter } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { TooltipText } from '../../components/TooltipText';

interface ActivityColumnFilterProps {
  label: string;
  emptyLabel: string;
  options: string[];
  selected: string[];
  onClear: () => void;
  onToggle: (value: string) => void;
}

export function ActivityColumnFilter({
  label,
  emptyLabel,
  options,
  selected,
  onClear,
  onToggle,
}: ActivityColumnFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const updatePosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) {
      return;
    }

    const rect = button.getBoundingClientRect();
    const menuWidth = 218;
    setMenuStyle({
      left: Math.min(Math.max(rect.right - menuWidth, 10), window.innerWidth - menuWidth - 10),
      top: rect.bottom + 6,
      width: menuWidth,
      maxHeight: Math.max(140, Math.min(300, window.innerHeight - rect.bottom - 16)),
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

  return (
    <>
      <button
        className={`activity-table__filter ${selected.length > 0 ? 'activity-table__filter--active' : ''}`}
        type="button"
        aria-label={label}
        aria-expanded={isOpen}
        ref={buttonRef}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className="activity-table__filter-icon">
          <ListFilter size={13} />
        </span>
        {selected.length > 0 ? (
          <span className="activity-table__filter-count">{selected.length}</span>
        ) : null}
      </button>
      {isOpen
        ? createPortal(
            <div className="activity-filter-menu" ref={menuRef} style={menuStyle}>
              <div className="activity-filter-menu__head">
                <div>
                  <ListFilter size={13} />
                  <span>{label}</span>
                </div>
                {selected.length > 0 ? (
                  <button type="button" onClick={onClear}>
                    {emptyLabel}
                  </button>
                ) : null}
              </div>
              <div className="activity-filter-menu__options">
                {options.length > 0 ? (
                  options.map((option) => {
                    const isSelected = selectedSet.has(option);

                    return (
                      <button
                        className={
                          isSelected
                            ? 'activity-filter-menu__option activity-filter-menu__option--selected'
                            : 'activity-filter-menu__option'
                        }
                        type="button"
                        key={option}
                        onClick={() => onToggle(option)}
                      >
                        <TooltipText value={option} />
                        {isSelected ? <Check size={13} /> : <i />}
                      </button>
                    );
                  })
                ) : (
                  <span className="activity-filter-menu__empty">{emptyLabel}</span>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
