import { Eye, EyeOff } from 'lucide-react';
import type { ReactNode } from 'react';

import { Tooltip } from './Tooltip';

interface PasswordVisibilityToggleProps {
  visible: boolean;
  onToggle: () => void;
  showLabel: string;
  hideLabel: string;
  className?: string;
}

export function PasswordVisibilityToggle({
  visible,
  onToggle,
  showLabel,
  hideLabel,
  className = '',
}: PasswordVisibilityToggleProps) {
  const label = visible ? hideLabel : showLabel;

  return (
    <Tooltip label={label}>
      <button
        type="button"
        className={`admin-integration-field-action ${className}`.trim()}
        aria-label={label}
        aria-pressed={visible}
        onClick={onToggle}
      >
        {visible ? <EyeOff size={12} aria-hidden /> : <Eye size={12} aria-hidden />}
      </button>
    </Tooltip>
  );
}

interface PasswordInputActionsProps {
  visible: boolean;
  onToggle: () => void;
  showLabel: string;
  hideLabel: string;
  generateLabel?: string;
  onGenerate?: () => void;
  generateIcon?: ReactNode;
}

export function PasswordInputActions({
  visible,
  onToggle,
  showLabel,
  hideLabel,
  generateLabel,
  onGenerate,
  generateIcon,
}: PasswordInputActionsProps) {
  return (
    <div className="admin-integration-input__actions">
      <PasswordVisibilityToggle
        visible={visible}
        onToggle={onToggle}
        showLabel={showLabel}
        hideLabel={hideLabel}
      />
      {generateLabel && onGenerate ? (
        <Tooltip label={generateLabel}>
          <button
            className="admin-integration-field-action"
            type="button"
            aria-label={generateLabel}
            onClick={onGenerate}
          >
            {generateIcon}
          </button>
        </Tooltip>
      ) : null}
    </div>
  );
}
