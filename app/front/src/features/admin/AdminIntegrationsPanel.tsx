import {
  Bot,
  CheckCircle2,
  CircleHelp,
  KeyRound,
  Link,
  PlugZap,
  Save,
  ShieldCheck,
  WandSparkles,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { aiApi } from '../../api';
import { IconButton } from '../../components/IconButton';
import { PasswordInputActions } from '../../components/PasswordInputActions';
import { Tooltip } from '../../components/Tooltip';
import { TooltipText } from '../../components/TooltipText';
import { usePasswordVisibility } from '../../hooks/usePasswordVisibility';
import type { Translator } from '../../i18n';
import type {
  AiBotAdminSettings,
  AiBotProvider,
  UpdateAiBotAdminSettingsPayload,
} from '../../types';
import { savedHintPlaceholder } from '../../utils/formText';
import { parseDigitsLimit } from '../../utils/numberFormatting';

interface AdminIntegrationsPanelProps {
  t: Translator;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

interface BotDraft {
  enabled: boolean;
  webhookUrl: string;
  botToken: string;
  accessToken: string;
  secret: string;
  groupId: string;
  confirmationCode: string;
  allowSecrets: boolean;
  requireConfirmation: boolean;
  dailyRequestLimit: string;
  dailyReadLimit: string;
  dailyWriteLimit: string;
}

const providers: AiBotProvider[] = ['telegram', 'vk'];
const telegramWebhookPath = '/api/ai/bots/telegram/webhook';
const vkWebhookPath = '/api/ai/bots/vk/webhook';
const secretChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

interface AdminIntegrationToggleProps {
  active: boolean;
  icon: ReactNode;
  label: string;
  status: string;
  tooltip: string;
  onClick: () => void;
}

function AdminIntegrationToggle({
  active,
  icon,
  label,
  status,
  tooltip,
  onClick,
}: AdminIntegrationToggleProps) {
  return (
    <button
      className={`admin-integration-toggle ${active ? 'admin-integration-toggle--active' : ''}`}
      type="button"
      onClick={onClick}
    >
      <Tooltip label={tooltip}>{icon}</Tooltip>
      <span>
        <strong>{label}</strong>
        <small>{status}</small>
      </span>
    </button>
  );
}

interface AdminIntegrationFieldProps {
  children: ReactNode;
  endAction?: ReactNode;
  icon: ReactNode;
  label: string;
  labelTooltip?: string;
  tooltip?: string;
  wide?: boolean;
}

function AdminIntegrationField({
  children,
  endAction,
  icon,
  label,
  labelTooltip,
  tooltip = label,
  wide = false,
}: AdminIntegrationFieldProps) {
  return (
    <div
      className={`admin-integration-field ${wide ? 'admin-integration-field--wide' : ''}`.trim()}
    >
      <span className="admin-integration-field__label">
        {label}
        {labelTooltip ? (
          <Tooltip label={labelTooltip}>
            <CircleHelp size={12} />
          </Tooltip>
        ) : null}
      </span>
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

function BotSetupTooltip({ provider, t }: { provider: AiBotProvider; t: Translator }) {
  const steps =
    provider === 'telegram'
      ? [
          t('adminTelegramSetupStep1'),
          t('adminTelegramSetupStep2'),
          t('adminTelegramSetupStep3'),
          t('adminTelegramSetupStep4'),
          t('adminTelegramSetupStep5'),
        ]
      : [
          t('adminVkSetupStep1'),
          t('adminVkSetupStep2'),
          t('adminVkSetupStep3'),
          t('adminVkSetupStep4'),
          t('adminVkSetupStep5'),
        ];

  return (
    <span className="app-tooltip-rich admin-bot-setup-tooltip">
      <strong>
        {t(provider === 'telegram' ? 'adminTelegramSetupTitle' : 'adminVkSetupTitle')}
      </strong>
      {steps.map((step, index) => (
        <span key={step}>
          {index + 1}. {step}
        </span>
      ))}
    </span>
  );
}

function createDraft(settings: AiBotAdminSettings | undefined): BotDraft {
  return {
    enabled: settings?.enabled ?? false,
    webhookUrl: settings?.webhookUrl ?? '',
    botToken: '',
    accessToken: '',
    secret: '',
    groupId: settings?.groupId ?? '',
    confirmationCode: settings?.confirmationCode ?? '',
    allowSecrets: settings?.allowSecrets ?? false,
    requireConfirmation: settings?.requireConfirmation ?? true,
    dailyRequestLimit: settings?.dailyRequestLimit ? String(settings.dailyRequestLimit) : '',
    dailyReadLimit: settings?.dailyReadLimit ? String(settings.dailyReadLimit) : '',
    dailyWriteLimit: settings?.dailyWriteLimit ? String(settings.dailyWriteLimit) : '',
  };
}

function getWebhookPath(provider: AiBotProvider): string {
  return provider === 'telegram' ? telegramWebhookPath : vkWebhookPath;
}

function createCurrentWebhookUrl(provider: AiBotProvider): string {
  return `${window.location.origin}${getWebhookPath(provider)}`;
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function generateWebhookSecret(length = 40): string {
  const values = new Uint32Array(length);
  window.crypto.getRandomValues(values);
  return Array.from(values, (value) => secretChars[value % secretChars.length]).join('');
}

export function AdminIntegrationsPanel({ t, onError, onSuccess }: AdminIntegrationsPanelProps) {
  const [settings, setSettings] = useState<AiBotAdminSettings[]>([]);
  const [drafts, setDrafts] = useState<Record<AiBotProvider, BotDraft>>({
    telegram: createDraft(undefined),
    vk: createDraft(undefined),
  });
  const [activeProvider, setActiveProvider] = useState<AiBotProvider>('telegram');
  const [isLoading, setIsLoading] = useState(false);
  const activeSettings = useMemo(
    () => settings.find((item) => item.provider === activeProvider),
    [activeProvider, settings],
  );
  const draft = drafts[activeProvider];
  const telegramSecretVisibility = usePasswordVisibility();
  const telegramTokenVisibility = usePasswordVisibility();
  const vkSecretVisibility = usePasswordVisibility();
  const vkTokenVisibility = usePasswordVisibility();

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const nextSettings = await aiApi.listBotAdminSettings();
      setSettings(nextSettings);
      setDrafts({
        telegram: createDraft(nextSettings.find((item) => item.provider === 'telegram')),
        vk: createDraft(nextSettings.find((item) => item.provider === 'vk')),
      });
    } catch {
      onError(t('adminIntegrationsLoadError'));
    } finally {
      setIsLoading(false);
    }
  }, [onError, t]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const updateDraft = (patch: Partial<BotDraft>) => {
    setDrafts((current) => ({
      ...current,
      [activeProvider]: { ...current[activeProvider], ...patch },
    }));
  };

  const validateWebhookUrl = () => {
    const webhookUrl = draft.webhookUrl.trim();
    if (webhookUrl && !isHttpsUrl(webhookUrl)) {
      onError(t('adminBotWebhookHttpsError'));
      return null;
    }
    return webhookUrl;
  };

  const saveSettings = async () => {
    const webhookUrl = validateWebhookUrl();
    if (webhookUrl === null) {
      return;
    }
    const payload: UpdateAiBotAdminSettingsPayload = {
      enabled: draft.enabled,
      webhookUrl: webhookUrl || null,
      allowSecrets: draft.allowSecrets,
      requireConfirmation: draft.requireConfirmation,
      dailyRequestLimit: parseDigitsLimit(draft.dailyRequestLimit),
      dailyReadLimit: parseDigitsLimit(draft.dailyReadLimit),
      dailyWriteLimit: parseDigitsLimit(draft.dailyWriteLimit),
      ...(activeProvider === 'telegram'
        ? {
            botToken: draft.botToken.trim() || undefined,
            secret: draft.secret.trim() || undefined,
          }
        : {
            accessToken: draft.accessToken.trim() || undefined,
            secret: draft.secret.trim() || undefined,
            groupId: draft.groupId.trim() || null,
            confirmationCode: draft.confirmationCode.trim() || null,
          }),
    };

    try {
      await aiApi.updateBotAdminSettings(activeProvider, payload);
      onSuccess(t('adminIntegrationsSaved'));
      await loadSettings();
    } catch {
      onError(t('adminIntegrationsSaveError'));
    }
  };

  const testConnection = async () => {
    if (validateWebhookUrl() === null) {
      return;
    }
    try {
      await aiApi.testBotAdminConnection(activeProvider);
      onSuccess(t('adminIntegrationsConnectionOk'));
      await loadSettings();
    } catch {
      onError(t('adminIntegrationsConnectionError'));
    }
  };

  return (
    <div className="admin-integrations-view">
      <div className="admin-integration-provider-tabs">
        {providers.map((provider) => (
          <button
            className={`admin-integration-provider-tabs__item ${
              activeProvider === provider ? 'admin-integration-provider-tabs__item--active' : ''
            }`}
            type="button"
            key={provider}
            onClick={() => setActiveProvider(provider)}
          >
            <Tooltip label={t(provider === 'telegram' ? 'adminTelegram' : 'adminVk')}>
              <Bot size={15} />
            </Tooltip>
            {t(provider === 'telegram' ? 'adminTelegram' : 'adminVk')}
          </button>
        ))}
      </div>

      <form
        className="admin-integration-card"
        onSubmit={(event) => {
          event.preventDefault();
          void saveSettings();
        }}
      >
        <input
          className="sr-only"
          name="username"
          value={activeProvider}
          autoComplete="username"
          tabIndex={-1}
          readOnly
        />
        <header className="admin-integration-card__head">
          <div>
            <h3 className="admin-integration-card__title">
              <Tooltip label={<BotSetupTooltip provider={activeProvider} t={t} />}>
                <CircleHelp className="admin-integration-card__help-icon" size={16} />
              </Tooltip>
              <span>{t(activeProvider === 'telegram' ? 'adminTelegram' : 'adminVk')}</span>
            </h3>
            <p>{t('adminBotGlobalSettings')}</p>
          </div>
          <div className="admin-panel__actions">
            <IconButton
              label={t('aiCheckConnection')}
              icon={<PlugZap size={15} />}
              disabled={isLoading}
              onClick={() => void testConnection()}
            />
            <IconButton
              label={t('save')}
              icon={<Save size={15} />}
              variant="primary"
              disabled={isLoading}
              onClick={() => void saveSettings()}
            />
          </div>
        </header>

        <div className="admin-integration-grid">
          <AdminIntegrationToggle
            active={draft.enabled}
            icon={<CheckCircle2 size={15} />}
            label={t('adminBotEnabled')}
            status={draft.enabled ? t('aiEnabledShort') : t('aiDisabledShort')}
            tooltip={t('adminBotEnabledTooltip')}
            onClick={() => updateDraft({ enabled: !draft.enabled })}
          />
          <AdminIntegrationToggle
            active={draft.requireConfirmation}
            icon={<ShieldCheck size={15} />}
            label={t('adminBotRequireConfirmation')}
            status={draft.requireConfirmation ? t('aiEnabledShort') : t('aiDisabledShort')}
            tooltip={t('adminBotRequireConfirmationTooltip')}
            onClick={() => updateDraft({ requireConfirmation: !draft.requireConfirmation })}
          />
          <AdminIntegrationToggle
            active={draft.allowSecrets}
            icon={<KeyRound size={15} />}
            label={t('adminBotAllowSecrets')}
            status={draft.allowSecrets ? t('aiEnabledShort') : t('aiDisabledShort')}
            tooltip={t('adminBotAllowSecretsTooltip')}
            onClick={() => updateDraft({ allowSecrets: !draft.allowSecrets })}
          />
        </div>

        <div className="admin-integration-fields">
          <AdminIntegrationField
            wide
            endAction={
              <Tooltip label={t('adminBotWebhookAutofill')}>
                <button
                  className="admin-integration-field-action"
                  type="button"
                  onClick={() =>
                    updateDraft({ webhookUrl: createCurrentWebhookUrl(activeProvider) })
                  }
                >
                  <WandSparkles size={14} />
                </button>
              </Tooltip>
            }
            icon={<Link size={14} />}
            label={
              activeProvider === 'telegram' ? t('adminBotWebhookUrl') : t('adminVkCallbackUrl')
            }
            labelTooltip={t('adminBotWebhookUrlTooltip')}
          >
            <input
              autoComplete="url"
              value={draft.webhookUrl}
              placeholder={`${window.location.origin}${getWebhookPath(activeProvider)}`}
              onChange={(event) => updateDraft({ webhookUrl: event.target.value })}
            />
          </AdminIntegrationField>

          {activeProvider === 'telegram' ? (
            <>
              <AdminIntegrationField
                wide
                endAction={
                  <PasswordInputActions
                    visible={telegramSecretVisibility.visible}
                    onToggle={telegramSecretVisibility.toggle}
                    showLabel={t('showPassword')}
                    hideLabel={t('hidePassword')}
                    generateLabel={t('adminBotGenerateSecret')}
                    onGenerate={() => updateDraft({ secret: generateWebhookSecret() })}
                    generateIcon={<WandSparkles size={12} aria-hidden />}
                  />
                }
                icon={<ShieldCheck size={14} />}
                label={t('adminTelegramSecret')}
              >
                <input
                  autoComplete="new-password"
                  value={draft.secret}
                  placeholder={savedHintPlaceholder(
                    t,
                    activeSettings?.secretHint,
                    t('aiApiKeyPlaceholder'),
                  )}
                  type={telegramSecretVisibility.inputType}
                  onChange={(event) => updateDraft({ secret: event.target.value })}
                />
              </AdminIntegrationField>
              <AdminIntegrationField
                wide
                endAction={
                  <PasswordInputActions
                    visible={telegramTokenVisibility.visible}
                    onToggle={telegramTokenVisibility.toggle}
                    showLabel={t('showPassword')}
                    hideLabel={t('hidePassword')}
                  />
                }
                icon={<KeyRound size={14} />}
                label={t('adminBotToken')}
              >
                <input
                  autoComplete="new-password"
                  value={draft.botToken}
                  placeholder={savedHintPlaceholder(
                    t,
                    activeSettings?.botTokenHint,
                    t('aiApiKeyPlaceholder'),
                  )}
                  type={telegramTokenVisibility.inputType}
                  onChange={(event) => updateDraft({ botToken: event.target.value })}
                />
              </AdminIntegrationField>
            </>
          ) : (
            <>
              <AdminIntegrationField
                wide
                endAction={
                  <PasswordInputActions
                    visible={vkSecretVisibility.visible}
                    onToggle={vkSecretVisibility.toggle}
                    showLabel={t('showPassword')}
                    hideLabel={t('hidePassword')}
                    generateLabel={t('adminBotGenerateSecret')}
                    onGenerate={() => updateDraft({ secret: generateWebhookSecret() })}
                    generateIcon={<WandSparkles size={12} aria-hidden />}
                  />
                }
                icon={<ShieldCheck size={14} />}
                label={t('adminBotSecret')}
              >
                <input
                  autoComplete="new-password"
                  value={draft.secret}
                  placeholder={savedHintPlaceholder(
                    t,
                    activeSettings?.secretHint,
                    t('aiApiKeyPlaceholder'),
                  )}
                  type={vkSecretVisibility.inputType}
                  onChange={(event) => updateDraft({ secret: event.target.value })}
                />
              </AdminIntegrationField>
              <AdminIntegrationField
                wide
                endAction={
                  <PasswordInputActions
                    visible={vkTokenVisibility.visible}
                    onToggle={vkTokenVisibility.toggle}
                    showLabel={t('showPassword')}
                    hideLabel={t('hidePassword')}
                  />
                }
                icon={<KeyRound size={14} />}
                label={t('adminVkAccessToken')}
              >
                <input
                  autoComplete="new-password"
                  value={draft.accessToken}
                  placeholder={savedHintPlaceholder(
                    t,
                    activeSettings?.accessTokenHint,
                    t('aiApiKeyPlaceholder'),
                  )}
                  type={vkTokenVisibility.inputType}
                  onChange={(event) => updateDraft({ accessToken: event.target.value })}
                />
              </AdminIntegrationField>
              <AdminIntegrationField icon={<Bot size={14} />} label={t('adminVkGroupId')}>
                <input
                  autoComplete="off"
                  value={draft.groupId}
                  onChange={(event) => updateDraft({ groupId: event.target.value })}
                />
              </AdminIntegrationField>
              <AdminIntegrationField
                icon={<CheckCircle2 size={14} />}
                label={t('adminVkConfirmationCode')}
              >
                <input
                  autoComplete="off"
                  value={draft.confirmationCode}
                  onChange={(event) => updateDraft({ confirmationCode: event.target.value })}
                />
              </AdminIntegrationField>
            </>
          )}

          <AdminIntegrationField icon={<PlugZap size={14} />} label={t('adminBotDailyLimit')}>
            <input
              autoComplete="off"
              inputMode="numeric"
              value={draft.dailyRequestLimit}
              placeholder={t('aiLimitEmpty')}
              onChange={(event) =>
                updateDraft({ dailyRequestLimit: event.target.value.replace(/\D/g, '') })
              }
            />
          </AdminIntegrationField>
          <AdminIntegrationField icon={<Link size={14} />} label={t('adminBotDailyReadLimit')}>
            <input
              autoComplete="off"
              inputMode="numeric"
              value={draft.dailyReadLimit}
              placeholder={t('aiLimitEmpty')}
              onChange={(event) =>
                updateDraft({ dailyReadLimit: event.target.value.replace(/\D/g, '') })
              }
            />
          </AdminIntegrationField>
          <AdminIntegrationField icon={<Save size={14} />} label={t('adminBotDailyWriteLimit')}>
            <input
              autoComplete="off"
              inputMode="numeric"
              value={draft.dailyWriteLimit}
              placeholder={t('aiLimitEmpty')}
              onChange={(event) =>
                updateDraft({ dailyWriteLimit: event.target.value.replace(/\D/g, '') })
              }
            />
          </AdminIntegrationField>
        </div>

        <div className="admin-integration-status">
          <span className="admin-integration-status__label">{t('adminBotLastCheck')}</span>
          <TooltipText
            value={
              activeSettings?.lastCheckAt
                ? `${activeSettings.lastCheckStatus ?? '-'} · ${new Date(
                    activeSettings.lastCheckAt,
                  ).toLocaleString()}`
                : '-'
            }
          />
          {activeSettings?.lastCheckError ? <small>{activeSettings.lastCheckError}</small> : null}
        </div>
      </form>
    </div>
  );
}
