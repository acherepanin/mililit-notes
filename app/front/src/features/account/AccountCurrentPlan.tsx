import { CalendarDays, TimerReset } from 'lucide-react';

import { IconButton } from '../../components/IconButton';
import type { Translator } from '../../i18n';
import type { SubscriptionPlan, UserLanguage } from '../../types';
import { PlanCardSticker } from '../../components/PlanCardVisual';
import { formatPlanBilling } from '../../utils/subscriptionPricing';
import { SubscriptionTermPicker } from './SubscriptionTermPicker';
import {
  supportsTermSelection,
  type CheckoutTermMonths,
} from '../../utils/subscriptionPricing';

interface AccountCurrentPlanProps {
  language: UserLanguage;
  plan: SubscriptionPlan;
  expiresAt: string | null;
  isHidden?: boolean;
  renewAmountLabel?: string;
  renewTerm?: CheckoutTermMonths;
  showRenew?: boolean;
  t: Translator;
  onRenew?: () => void;
  onRenewTermChange?: (term: CheckoutTermMonths) => void;
}

export function AccountCurrentPlan({
  language,
  plan,
  expiresAt,
  isHidden = false,
  renewAmountLabel,
  renewTerm = 1,
  showRenew = false,
  t,
  onRenew,
  onRenewTermChange,
}: AccountCurrentPlanProps) {
  const locale = language === 'ru' ? 'ru-RU' : 'en-US';
  const expiresLabel = expiresAt
    ? `${t('expiresAt')} ${new Date(expiresAt).toLocaleDateString(locale)}`
    : formatPlanBilling(t, plan.billingPeriod);

  return (
    <div
      className={`account-current-plan plan-card-theme plan-card-theme--${plan.cardColor || 'sky'}`}
    >
      <div className="account-current-plan__body">
        <PlanCardSticker artKey={plan.cardArt} colorKey={plan.cardColor} iconKey={plan.iconKey} />
        <div className="account-current-plan__copy">
          <strong className="account-current-plan__name">{plan.name}</strong>
          <span className="account-current-plan__meta">
            <CalendarDays size={13} aria-hidden />
            {expiresLabel}
          </span>
        </div>
        {showRenew && renewAmountLabel ? (
          <div className="account-current-plan__actions">
            <span className="account-current-plan__price">{renewAmountLabel}</span>
            {supportsTermSelection(plan.billingPeriod) && onRenewTermChange ? (
              <SubscriptionTermPicker
                language={language}
                plan={plan}
                selectedTerm={renewTerm}
                t={t}
                variant="icon"
                onChange={onRenewTermChange}
              />
            ) : null}
            <IconButton
              label={t('subscriptionRenew')}
              icon={<TimerReset aria-hidden />}
              variant="primary"
              onClick={() => onRenew?.()}
            />
          </div>
        ) : null}
        {isHidden ? (
          <span className="account-current-plan__badge account-current-plan__badge--hidden">
            {t('planHiddenBadge')}
          </span>
        ) : null}
      </div>
    </div>
  );
}
