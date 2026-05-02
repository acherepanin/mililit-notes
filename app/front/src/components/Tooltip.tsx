import type { ReactNode } from 'react';
import { useCallback, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  label: string;
  children: ReactNode;
  className?: string;
}

export function Tooltip({ label, children, className = '' }: TooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tooltipId = useId();

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) {
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const top = rect.top > 56 ? rect.top - 8 : rect.bottom + 8;
    const placement = rect.top > 56 ? 'up' : 'down';

    setStyle({
      left: Math.min(Math.max(rect.left + rect.width / 2, 16), window.innerWidth - 16),
      top,
      transform: placement === 'up' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
    });
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, updatePosition]);

  return (
    <span
      className={`app-tooltip-anchor ${className}`}
      ref={anchorRef}
      aria-describedby={isOpen ? tooltipId : undefined}
      onBlur={() => setIsOpen(false)}
      onFocus={() => setIsOpen(Boolean(label))}
      onPointerEnter={() => setIsOpen(Boolean(label))}
      onPointerLeave={() => setIsOpen(false)}
    >
      {children}
      {isOpen
        ? createPortal(
            <span className="app-tooltip" id={tooltipId} role="tooltip" style={style}>
              {label}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}
