import type { ReactNode } from 'react';
import { CircleHelp } from 'lucide-react';

import type { Translator } from '../i18n';
import type { BillingPeriod, SubscriptionPlan, UserLanguage } from '../types';
import { buildPlanFeatureItems } from '../utils/planFeatureLines';
import { PlanFeatureIndicator } from './PlanFeatureIndicator';
import { PlanCardShell, PlanCardSticker } from './PlanCardVisual';
import { Tooltip } from './Tooltip';
import { TooltipText } from './TooltipText';

interface SubscriptionPlanCardProps {
  adminActions?: ReactNode;
  billingLabel: string;
  className?: string;
  footer?: ReactNode;
  isCurrentPlan?: boolean;
  language?: UserLanguage;
  plan: SubscriptionPlan;
  priceActions?: ReactNode;
  priceLabel: string;
  termPicker?: ReactNode;
  t: Translator;
}

export function SubscriptionPlanCard({
  adminActions,
  billingLabel,
  className = '',
  footer,
  isCurrentPlan = false,
  language = 'ru',
  plan,
  priceActions,
  priceLabel,
  termPicker,
  t,
}: SubscriptionPlanCardProps) {
  const featureItems = buildPlanFeatureItems(plan, t, language);
  const description = plan.description?.trim() ?? '';

  return (
    <PlanCardShell
      artKey={plan.cardArt}
      className={`subscription-plan-card ${!plan.isActive ? 'subscription-plan-card--inactive' : ''} ${isCurrentPlan ? 'subscription-plan-card--current' : ''} ${className}`.trim()}
      colorKey={plan.cardColor}
    >
      {adminActions ? (
        <div className="subscription-plan-card__admin-actions">{adminActions}</div>
      ) : null}
      {isCurrentPlan ? null : (
        <>
          {plan.isHidden ? (
            <span className="subscription-plan-card__badge subscription-plan-card__badge--hidden">
              {t('planHiddenBadge')}
            </span>
          ) : null}
          {!plan.isActive ? (
            <span className="subscription-plan-card__badge">{t('planInactive')}</span>
          ) : null}
        </>
      )}
      <div className="subscription-plan-card__content">
        <div className="subscription-plan-card__top">
          <PlanCardSticker artKey={plan.cardArt} colorKey={plan.cardColor} iconKey={plan.iconKey} />
          <div className="subscription-plan-card__heading">
            <TooltipText
              className="subscription-plan-card__name"
              focusable
              value={plan.name}
            />
            {description && !isCurrentPlan ? (
              <Tooltip label={description}>
                <button
                  className="subscription-plan-card__desc-hint"
                  type="button"
                  aria-label={description}
                >
                  <CircleHelp size={11} aria-hidden />
                </button>
              </Tooltip>
            ) : null}
          </div>
        </div>
        <ul className="plan-feature-list">
          {featureItems.map((item) => {
            const Icon = item.icon;
            return (
              <li
                key={item.id}
                className={`plan-feature-list__item plan-feature-list__item--${item.tone}`}
              >
                <span className="plan-feature-list__icon">
                  <Icon size={13} aria-hidden />
                </span>
                <span className="plan-feature-list__body">
                  <TooltipText
                    className="plan-feature-list__label"
                    focusable
                    value={item.label}
                  />
                  {item.details?.map((line) => (
                    <TooltipText
                      key={line}
                      className="plan-feature-list__detail"
                      focusable
                      value={line}
                    />
                  ))}
                  {!item.details?.length && item.detail ? (
                    <TooltipText
                      className="plan-feature-list__detail"
                      focusable
                      value={item.detail}
                    />
                  ) : null}
                </span>
                <span className="plan-feature-list__indicator">
                  <PlanFeatureIndicator tone={item.tone} />
                </span>
              </li>
            );
          })}
        </ul>
        <div className="subscription-plan-card__price-row">
          <div className="subscription-plan-card__price">
            <span>{priceLabel}</span>
            <small>{billingLabel}</small>
          </div>
          {priceActions ? (
            <div className="subscription-plan-card__price-actions">{priceActions}</div>
          ) : termPicker ? (
            <div className="subscription-plan-card__price-actions">{termPicker}</div>
          ) : null}
        </div>
      </div>
      {footer ? <div className="subscription-plan-card__footer">{footer}</div> : null}
    </PlanCardShell>
  );
}
