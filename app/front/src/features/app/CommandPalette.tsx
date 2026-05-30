import { Search, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { IconButton } from '../../components/IconButton';
import { TooltipText } from '../../components/TooltipText';
import { useFocusTrap } from '../../components/useFocusTrap';
import type { Translator } from '../../i18n';

export interface CommandPaletteItem {
  id: string;
  label: string;
  description: string;
  shortcut?: string;
  icon: ReactNode;
  disabled?: boolean;
  run: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  t: Translator;
  commands: CommandPaletteItem[];
  onClose: () => void;
}

export function CommandPalette({ isOpen, t, commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const visibleCommands = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return commands;
    }

    return commands.filter((command) =>
      [command.label, command.description, command.shortcut ?? '']
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [commands, query]);

  useFocusTrap(isOpen, panelRef);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setActiveIndex(0);
      return;
    }

    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [isOpen]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, visibleCommands.length]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [isOpen, onClose]);

  const runActiveCommand = () => {
    const command = visibleCommands[activeIndex];
    if (!command || command.disabled) {
      return;
    }

    command.run();
    onClose();
  };

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <div className="command-palette-layer" role="presentation" onMouseDown={onClose}>
      <section
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label={t('commandPalette')}
        ref={panelRef}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="command-palette__head">
          <div className="command-palette__search">
            <Search size={15} aria-hidden />
            <input
              ref={inputRef}
              value={query}
              autoComplete="off"
              placeholder={t('commandPaletteSearch')}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (visibleCommands.length === 0) {
                  return;
                }

                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setActiveIndex((current) => (current + 1) % visibleCommands.length);
                  return;
                }

                if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setActiveIndex(
                    (current) => (current - 1 + visibleCommands.length) % visibleCommands.length,
                  );
                  return;
                }

                if (event.key === 'Enter') {
                  event.preventDefault();
                  runActiveCommand();
                }
              }}
            />
          </div>
          <IconButton label={t('close')} icon={<X size={15} />} onClick={onClose} />
        </header>

        <div className="command-palette__list" role="listbox" aria-label={t('commandPalette')}>
          {visibleCommands.map((command, index) => (
            <button
              className={`command-palette__item ${
                index === activeIndex ? 'command-palette__item--active' : ''
              }`}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              key={command.id}
              disabled={command.disabled}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => {
                command.run();
                onClose();
              }}
            >
              <span className="command-palette__icon">{command.icon}</span>
              <span className="command-palette__text">
                <TooltipText value={command.label} className="command-palette__title" />
                <TooltipText value={command.description} className="command-palette__desc" />
              </span>
              {command.shortcut ? <kbd>{command.shortcut}</kbd> : <span />}
            </button>
          ))}

          {visibleCommands.length === 0 ? (
            <div className="command-palette__empty">{t('commandPaletteEmpty')}</div>
          ) : null}
        </div>
      </section>
    </div>,
    document.body,
  );
}
