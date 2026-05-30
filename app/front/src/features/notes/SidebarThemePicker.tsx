import { Palette } from 'lucide-react';
import { useId, useRef, useState } from 'react';

import { PortalListbox } from '../../components/PortalListbox';
import { TooltipText } from '../../components/TooltipText';
import { usePortalMenu } from '../../components/usePortalMenu';
import type { Translator } from '../../i18n';
import { createThemeOptions, getThemeLabel } from '../../themes';
import type { UserTheme } from '../../types';

interface SidebarThemePickerProps {
  theme: UserTheme;
  t: Translator;
  onThemeChange: (theme: UserTheme) => void;
}

export function SidebarThemePicker({ theme, t, onThemeChange }: SidebarThemePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const themeOptions = createThemeOptions(t);
  const { close, direction, menuStyle } = usePortalMenu(isOpen, setIsOpen, buttonRef, menuRef, rootRef, {
    flipThreshold: 220,
    maxHeightCap: 280,
    minWidth: 168,
  });

  return (
    <span className="sidebar-settings-theme-picker" ref={rootRef}>
      <button
        className={`sidebar-settings-menu__item ${isOpen ? 'sidebar-settings-menu__item--active' : ''}`}
        type="button"
        role="menuitem"
        ref={buttonRef}
        aria-label={t('theme')}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        onClick={() => setIsOpen((current) => !current)}
      >
        <Palette size={14} />
        <TooltipText value={t('theme')} className="sidebar-settings-menu__text" />
        <strong>
          <TooltipText value={getThemeLabel(t, theme)} className="sidebar-settings-menu__value" />
        </strong>
      </button>
      <PortalListbox
        isOpen={isOpen}
        direction={direction}
        menuStyle={menuStyle}
        listboxId={listboxId}
        label={t('theme')}
        menuRef={menuRef}
        value={theme}
        options={themeOptions}
        menuClassName="sidebar-settings-theme-picker__menu"
        onSelect={onThemeChange}
        onClose={close}
        onFocusAnchor={() => buttonRef.current?.focus()}
      />
    </span>
  );
}
