import {
  Calendar,
  CheckCircle2,
  CircleHelp,
  CreditCard,
  HardDrive,
  KeyRound,
  Loader2,
  Mail,
  Save,
  ShoppingCart,
  UserRound,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { authApi, subscriptionApi } from '../../api';
import { IconButton } from '../../components/IconButton';
import { IntegrationField } from '../../components/IntegrationField';
import { PasswordField } from '../../components/PasswordField';
import { Tooltip } from '../../components/Tooltip';
import type { Translator } from '../../i18n';
import type {
  MeUser,
  SubscriptionOrder,
  SubscriptionPlan,
  UserLanguage,
  UserTheme,
} from '../../types';
import type { ToastKind } from '../../components/useToasts';
import {
  SubscriptionPlanCard,
} from '../../components/SubscriptionPlanCard';
import {
  formatPlanBilling,
} from '../../utils/subscriptionPricing';
import { normalizeSubscriptionPlan } from '../../utils/planEntitlements';
import {
  calculateCheckoutAmount,
  canRenewPlan,
  formatCheckoutTermLabel,
  formatPlanPriceCents,
  isPurchasablePlan,
  supportsTermSelection,
  type CheckoutMode,
  type CheckoutTermMonths,
} from '../../utils/subscriptionPricing';
import { useHorizontalWheel } from '../../utils/horizontalWheel';
import { AppRouteShell } from '../app/AppRouteShell';
import { AccountCurrentPlan } from './AccountCurrentPlan';
import { buildSubscriptionFeatureGuide } from './subscriptionFeatureGuide';
import { SubscriptionTermPicker } from './SubscriptionTermPicker';

interface AccountPageProps {
  user: MeUser;
  language: UserLanguage;
  theme: UserTheme;
  t: Translator;
  isAdmin: boolean;
  onRefresh: () => Promise<MeUser>;
  onLanguageChange: (language: UserLanguage) => void;
  onThemeChange: (theme: UserTheme) => void;
  onLogout: () => void;
  pushToast: (kind: ToastKind, message: string) => void;
}

function formatBytes(bytes: number, language: UserLanguage): string {
  const units = language === 'ru' ? ['Б', 'КБ', 'МБ', 'ГБ'] : ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatPlanPrice(cents: number, plan: SubscriptionPlan, language: UserLanguage): string {
  return formatPlanPriceCents(cents, plan.currency, language);
}

export function AccountPage({
  user,
  language,
  theme,
  t,
  isAdmin,
  onRefresh,
  onLanguageChange,
  onThemeChange,
  onLogout,
  pushToast,
}: AccountPageProps) {
  const [email] = useState(user.profile.email ?? '');
  const [firstName, setFirstName] = useState(user.profile.firstName ?? '');
  const [lastName, setLastName] = useState(user.profile.lastName ?? '');
  const [patronymic, setPatronymic] = useState(user.profile.patronymic ?? '');
  const [birthDate, setBirthDate] = useState(user.profile.birthDate ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [pendingOrder, setPendingOrder] = useState<SubscriptionOrder | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [renewTerm, setRenewTerm] = useState<CheckoutTermMonths>(1);
  const [planTerms, setPlanTerms] = useState<Record<number, CheckoutTermMonths>>({});
  const planListRef = useHorizontalWheel<HTMLUListElement>();

  const subscription = user.subscription;
  const entitlements = subscription?.entitlements;
  const storageLimit = entitlements?.files.storageLimitBytes;
  const storageUsed = subscription?.storageUsedBytes ?? 0;
  const activeSubscription = subscription?.subscription ?? null;
  const subscribedPlanId = activeSubscription?.plan.id ?? null;
  const activePlan =
    activeSubscription?.plan ?? plans.find((plan) => plan.slug === 'free') ?? null;
  const displayPlans = useMemo(
    () =>
      [...plans]
        .filter((plan) => !plan.isHidden)
        .sort((left, right) => left.sortOrder - right.sortOrder),
    [plans],
  );
  const canRenew =
    activePlan != null &&
    activeSubscription != null &&
    canRenewPlan(activePlan) &&
    activeSubscription.plan.id === activePlan.id;

  useEffect(() => {
    subscriptionApi
      .listPlans()
      .then((items) => setPlans(items.map(normalizeSubscriptionPlan)))
      .catch(() => pushToast('error', t('loadError')));
  }, [pushToast, t]);

  const getPlanTerm = (plan: SubscriptionPlan): CheckoutTermMonths => planTerms[plan.id] ?? 1;

  const startCheckout = async (
    planId: number,
    mode: CheckoutMode,
    termMonths: CheckoutTermMonths,
  ) => {
    try {
      const order = await subscriptionApi.checkout({ planId, mode, termMonths });
      setPendingOrder(order);
      pushToast('info', t('mockPaymentHint'));
    } catch {
      pushToast('error', t('checkoutError'));
    }
  };

  const confirmCheckout = async () => {
    if (!pendingOrder) {
      return;
    }
    try {
      await subscriptionApi.confirmCheckout(pendingOrder.id);
      setPendingOrder(null);
      await onRefresh();
      pushToast('success', t('subscriptionActivated'));
    } catch {
      pushToast('error', t('checkoutError'));
    }
  };

  const saveProfile = useCallback(async () => {
    setIsSavingProfile(true);
    try {
      await authApi.updateProfile({
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
        patronymic: patronymic.trim() || null,
        birthDate: birthDate || null,
      });
      await onRefresh();
      pushToast('success', t('profileSaved'));
    } catch {
      pushToast('error', t('saveError'));
    } finally {
      setIsSavingProfile(false);
    }
  }, [birthDate, firstName, lastName, onRefresh, patronymic, pushToast, t]);

  const savePassword = useCallback(async () => {
    if (!currentPassword || !newPassword) {
      pushToast('error', t('passwordFillBoth'));
      return;
    }
    setIsSavingPassword(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      pushToast('success', t('passwordChanged'));
    } catch {
      pushToast('error', t('passwordChangeError'));
    } finally {
      setIsSavingPassword(false);
    }
  }, [currentPassword, newPassword, pushToast, t]);

  const pendingOrderPlan = pendingOrder
    ? plans.find((plan) => plan.id === pendingOrder.planId) ?? activePlan
    : null;

  return (
    <AppRouteShell
      t={t}
      language={language}
      theme={theme}
      isAdmin={isAdmin}
      onLanguageChange={onLanguageChange}
      onThemeChange={onThemeChange}
      onLogout={onLogout}
    >
      <section className="account-panel">
        <header className="account-panel__head">
          <h2>{t('accountTitle')}</h2>
          <p className="account-panel__meta">
            {t('username')}: <strong>{user.username}</strong>
          </p>
        </header>

        <div className="account-panel__scroll">
          <section className="ai-settings-group account-panel__section">
            <div className="account-panel__section-head">
              <h3 className="account-panel__section-title">
                <UserRound size={15} aria-hidden />
                {t('accountProfile')}
              </h3>
              <IconButton
                label={t('save')}
                icon={isSavingProfile ? <Loader2 className="boot-spinner" size={16} /> : <Save size={16} />}
                variant="primary"
                disabled={isSavingProfile}
                onClick={() => void saveProfile()}
              />
            </div>
            <form
              className="account-panel__form"
              onSubmit={(event) => {
                event.preventDefault();
                void saveProfile();
              }}
            >
              <div className="account-panel__fields admin-integration-fields">
                <IntegrationField
                  icon={<Mail size={14} />}
                  label={t('email')}
                  labelTooltip={t('emailReadonlyHint')}
                  wide
                >
                  <input type="email" value={email} readOnly autoComplete="email" />
                </IntegrationField>
                <IntegrationField icon={<UserRound size={14} />} label={t('lastName')}>
                  <input
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    autoComplete="family-name"
                  />
                </IntegrationField>
                <IntegrationField icon={<UserRound size={14} />} label={t('firstName')}>
                  <input
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    autoComplete="given-name"
                  />
                </IntegrationField>
                <IntegrationField icon={<UserRound size={14} />} label={t('patronymic')}>
                  <input
                    value={patronymic}
                    onChange={(event) => setPatronymic(event.target.value)}
                    autoComplete="additional-name"
                  />
                </IntegrationField>
                <IntegrationField icon={<Calendar size={14} />} label={t('birthDate')}>
                  <input
                    type="date"
                    value={birthDate}
                    onChange={(event) => setBirthDate(event.target.value)}
                    autoComplete="bday"
                  />
                </IntegrationField>
              </div>
            </form>
          </section>

          <section className="ai-settings-group account-panel__section">
            <div className="account-panel__section-head">
              <h3 className="account-panel__section-title">
                <KeyRound size={15} aria-hidden />
                {t('accountPassword')}
              </h3>
              <IconButton
                label={t('changePassword')}
                icon={
                  isSavingPassword ? (
                    <Loader2 className="boot-spinner" size={16} />
                  ) : (
                    <KeyRound size={16} />
                  )
                }
                variant="primary"
                disabled={isSavingPassword}
                onClick={() => void savePassword()}
              />
            </div>
            <form
              className="account-panel__form"
              onSubmit={(event) => {
                event.preventDefault();
                void savePassword();
              }}
            >
              <div className="account-panel__fields admin-integration-fields">
                <PasswordField
                  label={t('currentPassword')}
                  showPasswordLabel={t('showPassword')}
                  hidePasswordLabel={t('hidePassword')}
                  icon={<KeyRound size={14} />}
                  value={currentPassword}
                  onValueChange={setCurrentPassword}
                  autoComplete="current-password"
                />
                <PasswordField
                  label={t('newPassword')}
                  showPasswordLabel={t('showPassword')}
                  hidePasswordLabel={t('hidePassword')}
                  generateLabel={t('generatePassword')}
                  icon={<KeyRound size={14} />}
                  value={newPassword}
                  onValueChange={setNewPassword}
                  autoComplete="new-password"
                />
              </div>
            </form>
          </section>

          <section className="ai-settings-group account-panel__section account-panel__section--wide account-panel__section--plans">
            <div className="account-panel__section-head account-panel__section-head--subscription">
              <h3 className="account-panel__section-title account-panel__section-title--with-hint">
                <CreditCard size={15} aria-hidden />
                <span className="account-panel__section-title-text">
                  {t('accountSubscription')}
                  <Tooltip label={buildSubscriptionFeatureGuide(t)}>
                    <button
                      className="account-panel__section-hint"
                      type="button"
                      aria-label={t('subscriptionFeaturesHint')}
                    >
                      <CircleHelp size={12} aria-hidden />
                    </button>
                  </Tooltip>
                </span>
              </h3>
            </div>

            <div className="account-panel__subscription-meta">
              {activePlan ? (
                <AccountCurrentPlan
                  language={language}
                  plan={activePlan}
                  expiresAt={activeSubscription?.expiresAt ?? null}
                  isHidden={activePlan.isHidden}
                  showRenew={canRenew}
                  renewTerm={renewTerm}
                  renewAmountLabel={formatPlanPrice(
                    calculateCheckoutAmount(
                      activePlan.priceCents,
                      supportsTermSelection(activePlan.billingPeriod) ? renewTerm : 12,
                      activePlan.billingPeriod,
                    ).amountCents,
                    activePlan,
                    language,
                  )}
                  t={t}
                  onRenewTermChange={setRenewTerm}
                  onRenew={() =>
                    void startCheckout(
                      activePlan.id,
                      'renew',
                      supportsTermSelection(activePlan.billingPeriod) ? renewTerm : 12,
                    )
                  }
                />
              ) : (
                <p className="account-panel__summary">{t('noActivePlan')}</p>
              )}

              {storageLimit != null ? (
                <p className="account-panel__summary account-panel__summary--muted">
                  <HardDrive size={13} aria-hidden />
                  {t('storageUsage')}: {formatBytes(storageUsed, language)} /{' '}
                  {formatBytes(storageLimit, language)}
                </p>
              ) : null}
            </div>

            {displayPlans.length > 0 ? (
              <ul className="subscription-plan-grid account-plan-list" ref={planListRef}>
                {displayPlans.map((plan) => {
                  const term = getPlanTerm(plan);
                  const quote = calculateCheckoutAmount(plan.priceCents, term, plan.billingPeriod);
                  const isCurrentPlan = subscribedPlanId === plan.id;
                  const canPurchase = isPurchasablePlan(plan) && subscribedPlanId !== plan.id;

                  return (
                    <li key={plan.id} aria-current={isCurrentPlan ? 'true' : undefined}>
                      <SubscriptionPlanCard
                        className="account-plan-card"
                        isCurrentPlan={isCurrentPlan}
                        language={language}
                        plan={plan}
                        priceLabel={formatPlanPrice(quote.amountCents, plan, language)}
                        billingLabel={
                          supportsTermSelection(plan.billingPeriod)
                            ? formatCheckoutTermLabel(term, language)
                            : formatPlanBilling(t, plan.billingPeriod)
                        }
                        priceActions={
                          canPurchase ? (
                            <>
                              {supportsTermSelection(plan.billingPeriod) ? (
                                <SubscriptionTermPicker
                                  language={language}
                                  plan={plan}
                                  selectedTerm={term}
                                  t={t}
                                  variant="icon"
                                  onChange={(nextTerm) =>
                                    setPlanTerms((current) => ({ ...current, [plan.id]: nextTerm }))
                                  }
                                />
                              ) : null}
                              <IconButton
                                label={t('buyPlan')}
                                icon={<ShoppingCart aria-hidden />}
                                variant="primary"
                                onClick={() =>
                                  void startCheckout(plan.id, 'purchase', quote.termMonths)
                                }
                              />
                            </>
                          ) : null
                        }
                        t={t}
                      />
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="account-panel__summary">{t('adminNoPlans')}</p>
            )}

            {pendingOrder && pendingOrderPlan ? (
              <div className="account-checkout">
                <p>
                  {pendingOrder.checkoutMode === 'renew'
                    ? t('subscriptionRenewSummary')
                        .replace('{amount}', formatPlanPrice(pendingOrder.amountCents, pendingOrderPlan, language))
                        .replace(
                          '{term}',
                          formatCheckoutTermLabel(
                            pendingOrder.termMonths as CheckoutTermMonths,
                            language,
                          ),
                        )
                    : t('subscriptionCheckoutSummary')
                        .replace('{amount}', formatPlanPrice(pendingOrder.amountCents, pendingOrderPlan, language))
                        .replace(
                          '{term}',
                          formatCheckoutTermLabel(
                            pendingOrder.termMonths as CheckoutTermMonths,
                            language,
                          ),
                        )}
                </p>
                {pendingOrder.discountPercent > 0 ? (
                  <p className="account-checkout__discount">−{pendingOrder.discountPercent}%</p>
                ) : null}
                <p>{t('mockPaymentHint')}</p>
                <IconButton
                  label={t('mockPaymentConfirm')}
                  icon={<CheckCircle2 size={16} />}
                  variant="primary"
                  onClick={() => void confirmCheckout()}
                />
              </div>
            ) : null}
          </section>
        </div>
      </section>
    </AppRouteShell>
  );
}
