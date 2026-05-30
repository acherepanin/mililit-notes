import type { ReactNode } from 'react';

import { TooltipText } from './TooltipText';

interface SettingsMenuItemProps {
  icon: ReactNode;
  label: string;
  value?: string;
  active?: boolean;
  className?: string;
  ariaPressed?: boolean;
  onClick: () => void;
}

export function SettingsMenuItem({
  icon,
  label,
  value,
  active = false,
  className = '',
  ariaPressed,
  onClick,
}: SettingsMenuItemProps) {
  return (
    <button
      className={`sidebar-settings-menu__item ${active ? 'sidebar-settings-menu__item--active' : ''} ${className}`.trim()}
      type="button"
      role="menuitem"
      aria-pressed={ariaPressed}
      onClick={onClick}
    >
      {icon}
      <TooltipText value={label} className="sidebar-settings-menu__text" />
      {value ? (
        <strong>
          <TooltipText value={value} className="sidebar-settings-menu__value" />
        </strong>
      ) : null}
    </button>
  );
}
