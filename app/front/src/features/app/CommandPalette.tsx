import { Search, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { IconButton } from '../../components/IconButton';
import { TooltipText } from '../../components/TooltipText';
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
  const inputRef = useRef<HTMLInputElement | null>(null);
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

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      return;
    }

    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [isOpen]);

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
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="command-palette__head">
          <div className="command-palette__search">
            <Search size={15} />
            <input
              ref={inputRef}
              value={query}
              autoComplete="off"
              placeholder={t('commandPaletteSearch')}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <IconButton label={t('close')} icon={<X size={15} />} onClick={onClose} />
        </header>

        <div className="command-palette__list">
          {visibleCommands.map((command) => (
            <button
              className="command-palette__item"
              type="button"
              key={command.id}
              disabled={command.disabled}
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
            <div className="command-palette__empty">{t('emptyTree')}</div>
          ) : null}
        </div>
      </section>
    </div>,
    document.body,
  );
}
