import type { ReactNode } from 'react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}

function hasVisibleLabel(label: ReactNode): boolean {
  if (label === null || label === undefined || label === false) {
    return false;
  }
  if (typeof label === 'string') {
    return label.trim().length > 0;
  }
  return true;
}

export function Tooltip({ label, children, className = '' }: TooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const tooltipId = useId();
  const canShow = hasVisibleLabel(label);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const open = useCallback(() => {
    if (canShow) {
      setIsOpen(true);
    }
  }, [canShow]);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor || !anchor.isConnected) {
      close();
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const tooltip = tooltipRef.current;
    const tooltipWidth = tooltip?.offsetWidth ?? 0;
    const tooltipHeight = tooltip?.offsetHeight ?? 0;
    const placement = rect.top >= tooltipHeight + 16 ? 'up' : 'down';
    const top = placement === 'up' ? rect.top - 8 : rect.bottom + 8;
    const centeredLeft = rect.left + rect.width / 2;
    const minLeft = 16 + tooltipWidth / 2;
    const maxLeft = window.innerWidth - 16 - tooltipWidth / 2;

    setStyle({
      left: Math.min(Math.max(centeredLeft, minLeft), Math.max(minLeft, maxLeft)),
      top,
      transform: placement === 'up' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
    });
  }, [close]);

  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }

    updatePosition();
    const frame = window.requestAnimationFrame(updatePosition);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, updatePosition]);

  useEffect(
    () => () => {
      close();
    },
    [close],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        close();
        return;
      }
      if (anchorRef.current?.contains(target) || tooltipRef.current?.contains(target)) {
        return;
      }
      close();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
      }
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [close, isOpen]);

  return (
    <span
      className={`app-tooltip-anchor ${className}`}
      ref={anchorRef}
      aria-describedby={isOpen ? tooltipId : undefined}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          close();
        }
      }}
      onFocus={(event) => {
        if (!canShow) {
          return;
        }
        if (event.target instanceof HTMLElement && event.target.matches(':focus-visible')) {
          open();
        }
      }}
      onPointerEnter={open}
      onPointerLeave={close}
      onPointerDown={close}
      onPointerCancel={close}
    >
      {children}
      {isOpen
        ? createPortal(
            <span
              className="app-tooltip"
              id={tooltipId}
              ref={tooltipRef}
              role="tooltip"
              style={style}
            >
              {label}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}
