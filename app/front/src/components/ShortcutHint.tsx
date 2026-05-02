import { Keyboard } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { IconButton } from './IconButton';

export interface ShortcutItem {
  keys: string[];
  label: string;
}

interface ShortcutHintProps {
  label: string;
  items: ShortcutItem[];
}

export function ShortcutHint({ label, items }: ShortcutHintProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const openPanel = useCallback(() => {
    clearCloseTimer();
    setIsOpen(true);
  }, [clearCloseTimer]);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => setIsOpen(false), 90);
  }, [clearCloseTimer]);

  const updatePosition = useCallback(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    const rect = root.getBoundingClientRect();
    const width = Math.min(360, window.innerWidth - 24);
    const left = Math.min(Math.max(rect.right - width, 12), window.innerWidth - width - 12);
    const spaceBelow = window.innerHeight - rect.bottom - 14;
    const maxHeight = Math.max(220, Math.min(540, spaceBelow));

    setPanelStyle({
      left,
      top: rect.bottom + 8,
      width,
      maxHeight,
    });
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }

    updatePosition();
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, updatePosition]);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  return (
    <div className="shortcut-hint" ref={rootRef} onBlur={scheduleClose} onFocus={openPanel} onPointerEnter={openPanel} onPointerLeave={scheduleClose}>
      <IconButton label={label} icon={<Keyboard size={16} />} onClick={() => setIsOpen((current) => !current)} />
      {isOpen
        ? createPortal(
            <div className="shortcut-hint__panel" role="tooltip" style={panelStyle} onPointerEnter={openPanel} onPointerLeave={scheduleClose}>
              {items.map((item) => (
                <div className="shortcut-hint__row" key={`${item.label}-${item.keys.join('-')}`}>
                  <span>{item.label}</span>
                  <span className="shortcut-hint__keys">
                    {item.keys.map((key) => (
                      <kbd key={key}>{key}</kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
