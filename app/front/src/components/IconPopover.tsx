import type { CSSProperties, ReactNode } from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Tooltip } from './Tooltip';

interface IconPopoverProps {
  active?: boolean;
  children: ReactNode;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onDisableWhenClosed?: () => void;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  panelClassName?: string;
  tooltip: string;
  variant?: 'plain' | 'primary' | 'danger' | 'active';
}

export function IconPopover({
  active = false,
  children,
  disabled = false,
  icon,
  label,
  onDisableWhenClosed,
  onOpenChange,
  open,
  panelClassName = '',
  tooltip,
  variant = 'plain',
}: IconPopoverProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const singleClickTimerRef = useRef<number | null>(null);
  const isOpen = open ?? internalOpen;

  const setOpen = useCallback(
    (next: boolean) => {
      if (open === undefined) {
        setInternalOpen(next);
      }
      onOpenChange?.(next);
    },
    [onOpenChange, open],
  );

  useEffect(() => {
    return () => {
      if (singleClickTimerRef.current !== null) {
        window.clearTimeout(singleClickTimerRef.current);
      }
    };
  }, []);

  const handleClick = useCallback(() => {
    if (disabled) {
      return;
    }

    if (isOpen) {
      setOpen(false);
      return;
    }

    if (onDisableWhenClosed) {
      singleClickTimerRef.current = window.setTimeout(() => {
        singleClickTimerRef.current = null;
        onDisableWhenClosed();
      }, 220);
      return;
    }

    setOpen(true);
  }, [disabled, isOpen, onDisableWhenClosed, setOpen]);

  const handleDoubleClick = useCallback(() => {
    if (disabled || !onDisableWhenClosed || isOpen) {
      return;
    }

    if (singleClickTimerRef.current !== null) {
      window.clearTimeout(singleClickTimerRef.current);
      singleClickTimerRef.current = null;
    }

    setOpen(true);
  }, [disabled, isOpen, onDisableWhenClosed, setOpen]);

  const updatePosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) {
      return;
    }
    const rect = button.getBoundingClientRect();
    const panelWidth = 248;
    const left = Math.min(Math.max(rect.left, 10), window.innerWidth - panelWidth - 10);
    const openUp = rect.bottom + 220 > window.innerHeight;
    setPanelStyle({
      left,
      top: openUp ? rect.top - 8 : rect.bottom + 6,
      width: panelWidth,
      maxHeight: Math.max(160, Math.min(320, window.innerHeight - 24)),
      transform: openUp ? 'translateY(-100%)' : undefined,
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
      if (!buttonRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setOpen(false);
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
  }, [isOpen, setOpen, updatePosition]);

  return (
    <>
      <Tooltip label={tooltip}>
        <button
          ref={buttonRef}
          className={`icon-action icon-action--${active || isOpen ? 'active' : variant}`.trim()}
          type="button"
          aria-label={label}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          disabled={disabled}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
        >
          {icon}
        </button>
      </Tooltip>
      {isOpen
        ? createPortal(
            <div
              ref={panelRef}
              className={`icon-popover-panel ${panelClassName}`.trim()}
              style={panelStyle}
              role="dialog"
              aria-label={label}
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
