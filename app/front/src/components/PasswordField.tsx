import { Lock, Sparkles } from 'lucide-react';
import type { InputHTMLAttributes, ReactNode } from 'react';

import { usePasswordVisibility } from '../hooks/usePasswordVisibility';
import { generateSecurePassword } from '../utils/authCredentials';
import { IntegrationField } from './IntegrationField';
import { PasswordInputActions } from './PasswordInputActions';

interface PasswordFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  showPasswordLabel: string;
  hidePasswordLabel: string;
  generateLabel?: string;
  icon?: ReactNode;
  value: string;
  onValueChange: (value: string) => void;
  wide?: boolean;
  hideLabel?: boolean;
  className?: string;
}

export function PasswordField({
  label,
  showPasswordLabel,
  hidePasswordLabel,
  generateLabel,
  icon,
  value,
  onValueChange,
  id,
  wide = false,
  hideLabel = false,
  className = '',
  ...inputProps
}: PasswordFieldProps) {
  const inputId = id ?? `password-${label.replace(/\s+/g, '-').toLowerCase()}`;
  const { visible, toggle, inputType } = usePasswordVisibility();

  return (
    <IntegrationField
      className={className}
      icon={icon ?? <Lock size={14} aria-hidden />}
      label={label}
      wide={wide}
      hideLabel={hideLabel}
      endAction={
        <PasswordInputActions
          visible={visible}
          onToggle={toggle}
          showLabel={showPasswordLabel}
          hideLabel={hidePasswordLabel}
          generateLabel={generateLabel}
          onGenerate={generateLabel ? () => onValueChange(generateSecurePassword()) : undefined}
          generateIcon={<Sparkles size={12} aria-hidden />}
        />
      }
    >
      <input
        id={inputId}
        name={inputProps.name}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        type={inputType}
        aria-label={label}
        {...inputProps}
      />
    </IntegrationField>
  );
}
