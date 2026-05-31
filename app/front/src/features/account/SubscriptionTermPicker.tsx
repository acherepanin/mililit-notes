import { CalendarDays } from 'lucide-react';

import { CustomSelect } from '../../components/CustomSelect';
import { IconActionMenu } from '../../components/IconActionMenu';
import type { PortalMenuConfig } from '../../components/usePortalMenu';
import type { Translator } from '../../i18n';
import type { SubscriptionPlan, UserLanguage } from '../../types';
import {
  CHECKOUT_TERM_MONTHS,
  formatCheckoutTermLabel,
  supportsTermSelection,
  type CheckoutTermMonths,
} from '../../utils/subscriptionPricing';

const termMenuConfig: PortalMenuConfig = {
  minWidth: 168,
  matchAnchorWidth: false,
  flipThreshold: 160,
  maxHeightCap: 240,
};

interface SubscriptionTermPickerProps {
  className?: string;
  language: UserLanguage;
  plan: SubscriptionPlan;
  selectedTerm: CheckoutTermMonths;
  t: Translator;
  variant?: 'icon' | 'select';
  onChange: (term: CheckoutTermMonths) => void;
}

export function SubscriptionTermPicker({
  className = '',
  language,
  plan,
  selectedTerm,
  t,
  variant = 'icon',
  onChange,
}: SubscriptionTermPickerProps) {
  if (!supportsTermSelection(plan.billingPeriod)) {
    return null;
  }

  const options = CHECKOUT_TERM_MONTHS.map((termMonths) => ({
    value: termMonths,
    label: formatCheckoutTermLabel(termMonths, language),
  }));

  if (variant === 'select') {
    return (
      <CustomSelect
        className={`subscription-term-select ${className}`.trim()}
        label={t('subscriptionTermLabel')}
        value={String(selectedTerm)}
        options={options.map((option) => ({
          value: String(option.value),
          label: option.label,
        }))}
        menuConfig={termMenuConfig}
        onChange={(value) => onChange(Number(value) as CheckoutTermMonths)}
      />
    );
  }

  return (
    <div className={className || undefined}>
      <IconActionMenu
        label={t('subscriptionTermLabel')}
        tooltip={`${t('subscriptionTermLabel')}: ${formatCheckoutTermLabel(selectedTerm, language)}`}
        icon={<CalendarDays aria-hidden />}
        value={selectedTerm}
        options={options}
        onChange={onChange}
      />
    </div>
  );
}
