import type { ReactNode } from 'react';
import { CircleHelp } from 'lucide-react';

import { Tooltip } from './Tooltip';

interface IntegrationFieldLabelProps {
  label: string;
  labelTooltip?: string;
}

export function IntegrationFieldLabel({ label, labelTooltip }: IntegrationFieldLabelProps) {
  return (
    <span className="admin-integration-field__label">
      {label}
      {labelTooltip ? (
        <Tooltip label={labelTooltip}>
          <CircleHelp size={12} />
        </Tooltip>
      ) : null}
    </span>
  );
}

interface IntegrationFieldProps {
  children: ReactNode;
  className?: string;
  endAction?: ReactNode;
  hideLabel?: boolean;
  icon: ReactNode;
  label: string;
  labelTooltip?: string;
  tooltip?: string;
  wide?: boolean;
}

export function IntegrationField({
  children,
  className = '',
  endAction,
  hideLabel = false,
  icon,
  label,
  labelTooltip,
  tooltip = label,
  wide = false,
}: IntegrationFieldProps) {
  return (
    <div
      className={`admin-integration-field ${wide ? 'admin-integration-field--wide' : ''} ${hideLabel ? 'admin-integration-field--compact' : ''} ${className}`.trim()}
    >
      {hideLabel ? (
        <span className="sr-only">{label}</span>
      ) : (
        <IntegrationFieldLabel label={label} labelTooltip={labelTooltip} />
      )}
      <div
        className={`admin-integration-input ${
          endAction ? 'admin-integration-input--with-action' : ''
        }`.trim()}
      >
        <Tooltip label={tooltip}>{icon}</Tooltip>
        {children}
        {endAction}
      </div>
    </div>
  );
}

interface IntegrationToggleProps {
  active: boolean;
  compact?: boolean;
  icon: ReactNode;
  label: string;
  status: string;
  tooltip: string;
  onClick: () => void;
}

export function IntegrationToggle({
  active,
  compact = false,
  icon,
  label,
  status,
  tooltip,
  onClick,
}: IntegrationToggleProps) {
  return (
    <button
      className={`admin-integration-toggle ${active ? 'admin-integration-toggle--active' : ''} ${
        compact ? 'admin-integration-toggle--compact' : ''
      }`.trim()}
      type="button"
      onClick={onClick}
    >
      <Tooltip label={tooltip}>{icon}</Tooltip>
      <Tooltip label={tooltip}>
        <span>
          <strong>{label}</strong>
          <small>{status}</small>
        </span>
      </Tooltip>
    </button>
  );
}
