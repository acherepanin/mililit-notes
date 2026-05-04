import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { Tooltip } from './Tooltip';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  icon: ReactNode;
  variant?: 'plain' | 'primary' | 'danger' | 'active';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, variant = 'plain', className = '', ...props },
  ref,
) {
  return (
    <Tooltip label={label}>
      <button
        ref={ref}
        className={`icon-action icon-action--${variant} ${className}`}
        type="button"
        aria-label={label}
        {...props}
      >
        {icon}
      </button>
    </Tooltip>
  );
});
