import type { HTMLAttributes } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Tooltip } from './Tooltip';

interface TooltipTextProps extends HTMLAttributes<HTMLSpanElement> {
  value: string;
  focusable?: boolean;
}

export function TooltipText({
  value,
  focusable = false,
  className = '',
  ...props
}: TooltipTextProps) {
  const valueRef = useRef<HTMLSpanElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  const updateTruncation = useCallback(() => {
    const element = valueRef.current;
    setIsTruncated(Boolean(element && element.scrollWidth > element.clientWidth + 1));
  }, []);

  useEffect(() => {
    updateTruncation();

    const element = valueRef.current;
    if (!element) {
      return;
    }

    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateTruncation);
    resizeObserver?.observe(element);
    window.addEventListener('resize', updateTruncation);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateTruncation);
    };
  }, [updateTruncation, value]);

  return (
    <Tooltip label={isTruncated ? value : ''}>
      <span className={`tooltip-text ${className}`} tabIndex={focusable ? 0 : undefined} {...props}>
        <span className="tooltip-text__value" ref={valueRef}>
          {value}
        </span>
      </span>
    </Tooltip>
  );
}
