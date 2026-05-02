import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { Tooltip } from './Tooltip';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  icon: ReactNode;
  variant?: 'plain' | 'primary' | 'danger' | 'active';
}

export function IconButton({ label, icon, variant = 'plain', className = '', ...props }: IconButtonProps) {
  return (
    <Tooltip label={label}>
      <button className={`icon-action icon-action--${variant} ${className}`} type="button" aria-label={label} {...props}>
        {icon}
      </button>
    </Tooltip>
  );
}
