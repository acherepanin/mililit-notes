import { IconActionMenu } from './IconActionMenu';
import { PLAN_ICON_OPTIONS, resolvePlanIcon, type PlanIconKey } from '../utils/planIcons';

interface PlanIconDropdownProps {
  label: string;
  value: PlanIconKey;
  onChange: (value: PlanIconKey) => void;
}

export function PlanIconDropdown({ label, value, onChange }: PlanIconDropdownProps) {
  return (
    <IconActionMenu
      label={label}
      tooltip={label}
      icon={resolvePlanIcon(value, 16)}
      value={value}
      variant="plain"
      options={PLAN_ICON_OPTIONS.map(({ key, Icon }) => ({
        value: key,
        label: key,
        icon: <Icon size={14} aria-hidden />,
      }))}
      onChange={onChange}
    />
  );
}
