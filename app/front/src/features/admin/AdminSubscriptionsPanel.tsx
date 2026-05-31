import {
  Coins,
  Pencil,
  Plus,
  Save,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { adminApi, aiApi, ApiError } from '../../api';
import { CustomSelect } from '../../components/CustomSelect';
import { useConfirmDelete } from '../../components/DeleteConfirmationProvider';
import { EmptyState } from '../../components/EmptyState';
import { IconButton } from '../../components/IconButton';
import { IntegrationField } from '../../components/IntegrationField';
import { PlanEditorFeatureIcons } from '../../components/PlanEditorFeatureIcons';
import { PlanCardArtPicker, PlanCardColorPicker, PlanCardShell } from '../../components/PlanCardVisual';
import { PlanIconDropdown } from '../../components/PlanIconDropdown';
import {
  formatPlanBilling,
  formatPlanPriceCents,
} from '../../utils/subscriptionPricing';
import {
  SubscriptionPlanCard,
} from '../../components/SubscriptionPlanCard';
import type { Translator } from '../../i18n';
import type {
  BillingPeriod,
  SubscriptionPlan,
  UserLanguage,
} from '../../types';
import { emptyEntitlements, normalizeEntitlements, normalizeSubscriptionPlan } from '../../utils/planEntitlements';
import { useHorizontalWheel } from '../../utils/horizontalWheel';
import { createUniquePlanSlug } from '../../utils/planSlug';
import { isPlanIconKey, type PlanIconKey } from '../../utils/planIcons';
import {
  getPlanCardArt,
  getPlanCardColor,
  type PlanCardArtKey,
  type PlanCardColorKey,
} from '../../utils/planCardTheme';

interface AdminSubscriptionsPanelProps {
  language: UserLanguage;
  t: Translator;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

const emptyPlanDraft = () => ({
  slug: '',
  name: '',
  description: '',
  priceRubles: 0,
  currency: 'rub',
  billingPeriod: 'month' as BillingPeriod,
  entitlements: emptyEntitlements(),
  iconKey: 'package' as PlanIconKey,
  cardColor: 'sky' as PlanCardColorKey,
  cardArt: 'bubbles' as PlanCardArtKey,
  isActive: true,
  isHidden: false,
  sortOrder: 0,
});

type PlanDraft = ReturnType<typeof emptyPlanDraft>;

function centsToRubles(cents: number): number {
  return cents / 100;
}

function rublesToCents(rubles: number): number {
  return Math.max(0, Math.round(rubles * 100));
}

function planFeatureScore(plan: SubscriptionPlan): number {
  let score = 0;
  const { entitlements } = plan;
  if (entitlements.workspace.enabled) {
    score += 50;
  }
  if (entitlements.publicShare.enabled) {
    score += 20;
  }
  if (entitlements.templates.enabled) {
    score += 10;
  }
  if (entitlements.versioning.enabled) {
    score += 20;
  }
  if (entitlements.commands.enabled) {
    score += 10;
  }
  if (entitlements.exportImport.enabled) {
    score += 15;
  }
  if (entitlements.ai.enabled) {
    score += 1000;
  }
  if (entitlements.files.enabled) {
    score += 100;
  }
  if (entitlements.ai.monthlyTokenLimit) {
    score += Math.min(entitlements.ai.monthlyTokenLimit / 1000, 500);
  }
  if (entitlements.files.storageLimitBytes) {
    score += entitlements.files.storageLimitBytes / 1024 ** 3;
  }
  return score;
}

function sortPlans(plans: SubscriptionPlan[]): SubscriptionPlan[] {
  return [...plans].sort((left, right) => {
    const priceDiff = left.priceCents - right.priceCents;
    if (priceDiff !== 0) {
      return priceDiff;
    }
    return planFeatureScore(right) - planFeatureScore(left);
  });
}

function planToDraft(plan: SubscriptionPlan): PlanDraft {
  return {
    slug: plan.slug,
    name: plan.name,
    description: plan.description ?? '',
    priceRubles: centsToRubles(plan.priceCents),
    currency: plan.currency,
    billingPeriod: plan.billingPeriod,
    entitlements: normalizeEntitlements(plan.entitlements),
    iconKey: isPlanIconKey(plan.iconKey) ? plan.iconKey : 'package',
    cardColor: getPlanCardColor(plan.cardColor).key,
    cardArt: getPlanCardArt(plan.cardArt),
    isActive: plan.isActive,
    isHidden: plan.isHidden,
    sortOrder: plan.sortOrder,
  };
}

interface PlanEditorProps {
  draft: PlanDraft;
  editingId: number | null;
  isFreePlan: boolean;
  language: UserLanguage;
  modelOptions: Array<{ value: string; label: string }>;
  t: Translator;
  onChange: (patch: Partial<PlanDraft> | ((current: PlanDraft) => PlanDraft)) => void;
  onDelete?: () => void;
  onSave: () => void;
  onCancel: () => void;
}

function PlanEditorSection({ children }: { children: ReactNode }) {
  return <section className="ai-settings-group admin-plan-editor-section">{children}</section>;
}

function PlanEditor({
  draft,
  editingId,
  isFreePlan,
  language,
  modelOptions,
  t,
  onChange,
  onDelete,
  onSave,
  onCancel,
}: PlanEditorProps) {
  return (
    <PlanCardShell
      artKey={draft.cardArt}
      className="admin-plan-editor-card"
      colorKey={draft.cardColor}
    >
      <div className="admin-plan-tile__editor">
        <div className="admin-plan-tile__editor-head">
          <strong>{editingId ? t('adminEditPlan') : t('adminCreatePlan')}</strong>
          <div className="admin-plan-tile__editor-actions">
            <IconButton label={t('save')} icon={<Save size={15} />} variant="primary" onClick={onSave} />
            <IconButton label={t('cancel')} icon={<X size={15} />} onClick={onCancel} />
          </div>
        </div>
        <div className="admin-plan-tile__editor-scroll">
          <div className="admin-plan-tile__form admin-plan-tile__form--stack">
            <PlanEditorSection>
              <div className="admin-integration-field admin-integration-field--wide">
                <span className="admin-integration-field__label">{t('planName')}</span>
                <div className="admin-plan-tile__name-row">
                  <PlanIconDropdown
                    label={t('planIcon')}
                    value={draft.iconKey}
                    onChange={(iconKey) => onChange({ iconKey })}
                  />
                  <div className="admin-integration-input admin-integration-input--solo admin-plan-tile__control">
                    <input
                      value={draft.name}
                      onChange={(event) => onChange({ name: event.target.value })}
                      placeholder={t('planNamePlaceholder')}
                    />
                  </div>
                </div>
                <div className="admin-integration-input admin-integration-input--solo admin-plan-tile__control admin-plan-tile__description">
                  <input
                    className="admin-plan-tile__control-input"
                    value={draft.description}
                    onChange={(event) => onChange({ description: event.target.value })}
                    placeholder={t('planDescriptionPlaceholder')}
                    aria-label={t('planDescription')}
                  />
                </div>
              </div>
              <PlanCardColorPicker
                label={t('planCardColor')}
                language={language}
                value={draft.cardColor}
                onChange={(cardColor) => onChange({ cardColor })}
              />
              <PlanCardArtPicker
                artKey={draft.cardArt}
                colorKey={draft.cardColor}
                label={t('planCardArt')}
                language={language}
                onChange={(cardArt) => onChange({ cardArt })}
              />
            </PlanEditorSection>

            <PlanEditorSection>
              <IntegrationField icon={<Coins size={13} />} label={t('planPriceRubles')} wide>
                <input
                  className="admin-plan-tile__control-input"
                  type="number"
                  min={0}
                  step={1}
                  value={draft.priceRubles}
                  onChange={(event) => onChange({ priceRubles: Number(event.target.value) })}
                  placeholder={t('planPriceRublesPlaceholder')}
                />
              </IntegrationField>
              <div className="admin-integration-field admin-integration-field--wide">
                <span className="admin-integration-field__label">{t('planBilling')}</span>
                <CustomSelect
                  className="admin-plan-tile__control"
                  value={draft.billingPeriod}
                  options={[
                    { value: 'month' as const, label: t('billingMonth') },
                    { value: 'year' as const, label: t('billingYear') },
                    { value: 'lifetime' as const, label: t('billingLifetime') },
                  ]}
                  label={t('planBilling')}
                  onChange={(value) => onChange({ billingPeriod: value })}
                />
              </div>
            </PlanEditorSection>

            <PlanEditorSection>
              <PlanEditorFeatureIcons
                draft={draft}
                editingId={editingId}
                isFreePlan={isFreePlan}
                modelOptions={modelOptions}
                t={t}
                onChange={(patch) => onChange(patch)}
                onDelete={onDelete}
              />
            </PlanEditorSection>
          </div>
        </div>
      </div>
    </PlanCardShell>
  );
}

export function AdminSubscriptionsPanel({
  language,
  t,
  onError,
  onSuccess,
}: AdminSubscriptionsPanelProps) {
  const confirmDelete = useConfirmDelete();
  const trackRef = useHorizontalWheel<HTMLDivElement>();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [draft, setDraft] = useState<PlanDraft>(emptyPlanDraft());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [modelOptions, setModelOptions] = useState<Array<{ value: string; label: string }>>([]);

  const sortedPlans = useMemo(() => sortPlans(plans), [plans]);

  const loadPlans = useCallback(async () => {
    setIsLoading(true);
    try {
      setPlans((await adminApi.listSubscriptionPlans()).map(normalizeSubscriptionPlan));
    } catch {
      onError(t('adminLoadError'));
    } finally {
      setIsLoading(false);
    }
  }, [onError, t]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  useEffect(() => {
    aiApi
      .getSettings()
      .then((settings) =>
        setModelOptions(
          settings.models
            .filter((model) => !model.isDeprecated)
            .map((model) => ({ value: model.id, label: model.label || model.id })),
        ),
      )
      .catch(() => setModelOptions([]));
  }, []);

  const resetEditor = () => {
    setEditingId(null);
    setIsCreating(false);
    setDraft(emptyPlanDraft());
  };

  const startCreate = () => {
    setEditingId(null);
    setIsCreating(true);
    setDraft(emptyPlanDraft());
    queueMicrotask(() => {
      const track = trackRef.current;
      if (!track) {
        return;
      }
      if (window.matchMedia('(max-width: 1120px)').matches) {
        track.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        track.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  };

  const startEdit = (plan: SubscriptionPlan) => {
    setIsCreating(false);
    setEditingId(plan.id);
    setDraft(planToDraft(plan));
  };

  const updateDraft = (patch: Partial<PlanDraft> | ((current: PlanDraft) => PlanDraft)) => {
    setDraft((current) => (typeof patch === 'function' ? patch(current) : { ...current, ...patch }));
  };

  const savePlan = async () => {
    const name = draft.name.trim();
    if (!name) {
      onError(t('adminPlanFillNameRequired'));
      return;
    }
    const slug = editingId
      ? draft.slug
      : createUniquePlanSlug(
          name,
          sortedPlans.map((plan) => plan.slug),
        );
    const nextPriceCents = rublesToCents(draft.priceRubles);
    const sortOrder = sortedPlans.filter((plan) => plan.priceCents <= nextPriceCents).length;
    const payload = {
      slug: slug,
      name: name,
      description: draft.description.trim() || undefined,
      priceCents: nextPriceCents,
      currency: 'rub',
      billingPeriod: draft.billingPeriod,
      entitlements: draft.entitlements,
      iconKey: draft.iconKey,
      cardColor: draft.cardColor,
      cardArt: draft.cardArt,
      isActive: draft.isActive,
      isHidden: draft.isHidden,
      sortOrder,
    };
    try {
      if (editingId) {
        await adminApi.updateSubscriptionPlan(editingId, payload);
      } else {
        await adminApi.createSubscriptionPlan(payload);
      }
      onSuccess(t('adminPlanSaved'));
      resetEditor();
      await loadPlans();
    } catch {
      onError(t('adminSaveError'));
    }
  };

  const requestRemovePlan = async (id: number) => {
    const target = plans.find((plan) => plan.id === id);
    if (target?.slug === 'free') {
      onError(t('planFreeProtected'));
      return;
    }

    const confirmed = await confirmDelete({
      title: t('delete'),
      description: t('deletePlanQuestion'),
    });
    if (!confirmed) {
      return;
    }

    try {
      await adminApi.deleteSubscriptionPlan(id);
      onSuccess(t('adminPlanDeleted'));
      if (editingId === id) {
        resetEditor();
      }
      await loadPlans();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'PLAN_HAS_SUBSCRIBERS') {
        onError(t('adminPlanDeleteHasSubscribers'));
      } else {
        onError(t('adminPlanDeleteError'));
      }
    }
  };

  if (isLoading) {
    return (
      <div className="admin-subscriptions">
        <EmptyState title={t('loading')} tone="plain" />
      </div>
    );
  }

  return (
    <div className="admin-subscriptions">
      <div className="subscription-plan-grid admin-subscriptions__grid" ref={trackRef}>
        {isCreating ? (
          <article className="admin-plan-tile admin-plan-tile--editing">
            <PlanEditor
              draft={draft}
              editingId={null}
              isFreePlan={false}
              language={language}
              modelOptions={modelOptions}
              t={t}
              onChange={updateDraft}
              onSave={() => void savePlan()}
              onCancel={resetEditor}
            />
          </article>
        ) : (
          <button type="button" className="admin-plan-tile admin-plan-tile--add" onClick={startCreate}>
            <Plus size={20} aria-hidden />
          </button>
        )}
        {sortedPlans.map((plan) => {
          const isEditing = editingId === plan.id;
          const isFreePlan = plan.slug === 'free';
          return (
            <article
              key={plan.id}
              className={`admin-plan-tile ${isEditing ? 'admin-plan-tile--editing' : ''}`.trim()}
            >
              {isEditing ? (
                <PlanEditor
                  draft={draft}
                  editingId={editingId}
                  isFreePlan={isFreePlan}
                  language={language}
                  modelOptions={modelOptions}
                  t={t}
                  onChange={updateDraft}
                  onDelete={() => void requestRemovePlan(plan.id)}
                  onSave={() => void savePlan()}
                  onCancel={resetEditor}
                />
              ) : (
                <SubscriptionPlanCard
                  className="admin-plan-tile__card"
                  language={language}
                  plan={plan}
                  priceLabel={formatPlanPriceCents(plan.priceCents, plan.currency, language)}
                  billingLabel={formatPlanBilling(t, plan.billingPeriod)}
                  t={t}
                  adminActions={
                    <IconButton
                      label={t('edit')}
                      icon={<Pencil size={15} />}
                      variant="plain"
                      onClick={() => startEdit(plan)}
                    />
                  }
                />
              )}
            </article>
          );
        })}
      </div>
      {sortedPlans.length === 0 && !isCreating ? (
        <EmptyState title={t('adminNoPlans')} tone="plain" />
      ) : null}
    </div>
  );
}
