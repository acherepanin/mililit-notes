import {
  BrainCircuit,
  Check,
  KeyRound,
  PlugZap,
  Power,
  RefreshCcw,
  Save,
  Search,
  Send,
  Settings,
  Trash2,
  X,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { ApiError, aiApi } from '../../api';
import { IconButton } from '../../components/IconButton';
import { Tooltip } from '../../components/Tooltip';
import { TooltipText } from '../../components/TooltipText';
import type { ToastKind } from '../../components/useToasts';
import type { Translator } from '../../i18n';
import type {
  AiChatMessage,
  AiCurrentNoteContext,
  AiModel,
  AiModelTier,
  AiSettings,
  AiToolAction,
} from '../../types';

interface AiAssistantProps {
  settings: AiSettings | null;
  t: Translator;
  isSettingsOpen: boolean;
  onSettingsOpenChange: (isOpen: boolean) => void;
  onSettingsChange: (settings: AiSettings) => void;
  currentNote?: AiCurrentNoteContext | null;
  onActionApplied?: (noteId: number | undefined, actionName: string) => void | Promise<void>;
  pushToast: (kind: ToastKind, message: string, ttl?: number) => void;
}

interface DraftSettings {
  enabled: boolean;
  providerName: string;
  baseUrl: string;
  model: string;
  apiKey: string;
}

type AiModelFilter = 'all' | 'paid' | 'free';
type AiModelGroup = { tier: AiModelTier | 'deprecated'; models: AiModel[] };

const modelTierOrder: AiModelTier[] = ['paid', 'free', 'unknown'];

function groupModels(models: AiModel[], query: string, filter: AiModelFilter): AiModelGroup[] {
  const normalizedQuery = query.trim().toLowerCase();
  const visibleModels = models
    .filter((model) => filter === 'all' || model.tier === filter)
    .filter(
      (model) =>
        model.label.toLowerCase().includes(normalizedQuery) ||
        model.id.toLowerCase().includes(normalizedQuery),
    )
    .sort(
      (left, right) =>
        right.sortRank - left.sortRank ||
        right.score - left.score ||
        left.label.localeCompare(right.label),
    );
  const activeModels = visibleModels.filter((model) => !model.isDeprecated);

  const groups: AiModelGroup[] = modelTierOrder
    .map((tier) => ({
      tier,
      models: activeModels.filter((model) => model.tier === tier),
    }))
    .filter((group) => group.models.length > 0);

  if (filter === 'all' && visibleModels.some((model) => model.isDeprecated)) {
    groups.push({
      tier: 'deprecated',
      models: visibleModels.filter((model) => model.isDeprecated),
    });
  }

  return groups;
}

function scoreTone(score: number): 'low' | 'medium' | 'high' {
  if (score >= 75) {
    return 'high';
  }

  if (score >= 50) {
    return 'medium';
  }

  return 'low';
}

function createDraft(settings: AiSettings | null): DraftSettings {
  return {
    enabled: settings?.enabled ?? false,
    providerName: settings?.providerName ?? 'OpenAI-compatible',
    baseUrl: settings?.baseUrl ?? 'https://api.openai.com/v1',
    model: settings?.model ?? '',
    apiKey: '',
  };
}

function estimateContextLimit(model: string | null | undefined): number {
  const normalized = model?.toLowerCase() ?? '';

  if (normalized.includes('4.1')) {
    return 1_000_000;
  }

  if (normalized.includes('5.5') || normalized.includes('5.2') || normalized.includes('5.1')) {
    return 400_000;
  }

  if (normalized.includes('gpt-5') || normalized.includes('gpt-4o') || normalized.includes('o3')) {
    return 128_000;
  }

  if (normalized.includes('3.5')) {
    return 16_000;
  }

  return 128_000;
}

function estimateTokens(value: string): number {
  return Math.ceil(value.length / 4);
}

function compactTokenCount(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
  }

  if (value >= 1_000) {
    return `${Math.ceil(value / 100) / 10}k`;
  }

  return String(value);
}

export function AiAssistant({
  settings,
  t,
  isSettingsOpen,
  onSettingsOpenChange,
  onSettingsChange,
  currentNote,
  onActionApplied,
  pushToast,
}: AiAssistantProps) {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [modelSearch, setModelSearch] = useState('');
  const [modelFilter, setModelFilter] = useState<AiModelFilter>('all');
  const [draft, setDraft] = useState<DraftSettings>(() => createDraft(settings));
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const modelGroups = useMemo(
    () => groupModels(settings?.models ?? [], modelSearch, modelFilter),
    [modelFilter, modelSearch, settings?.models],
  );
  const contextStats = useMemo(() => {
    const model = settings?.model ?? null;
    const modelLabel = settings?.models.find((item) => item.id === model)?.label ?? model ?? 'none';
    const limit = estimateContextLimit(model);
    const currentNoteText = currentNote
      ? [currentNote.name, currentNote.contentText, currentNote.contentHtml].join('\n')
      : '';
    const chatText = [...messages.slice(-12), { role: 'user' as const, content: input }]
      .map((message) => message.content)
      .join('\n');
    const used = Math.min(
      limit,
      estimateTokens(currentNoteText) + estimateTokens(chatText) + 4_500,
    );

    return {
      model: model || 'none',
      modelLabel,
      used,
      limit,
      remaining: Math.max(0, limit - used),
      percent: Math.min(100, Math.max(1, Math.round((used / limit) * 100))),
    };
  }, [currentNote, input, messages, settings?.model, settings?.models]);
  const contextTooltip = `${contextStats.model}: ${compactTokenCount(contextStats.used)} / ${compactTokenCount(contextStats.limit)}, ${compactTokenCount(contextStats.remaining)} ${t('aiContextLeft')}`;
  const panelMode = isSettingsOpen ? 'settings' : isChatOpen && settings?.enabled ? 'chat' : null;
  const modelFilterOptions: Array<{ value: AiModelFilter; label: string }> = [
    { value: 'all', label: t('aiFilterAll') },
    { value: 'paid', label: t('aiFilterPaid') },
    { value: 'free', label: t('aiFilterFree') },
  ];

  useEffect(() => {
    setDraft(createDraft(settings));
  }, [settings]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, panelMode]);

  const closePanel = () => {
    setIsChatOpen(false);
    onSettingsOpenChange(false);
  };

  const saveSettings = async () => {
    try {
      const shouldSyncModels = Boolean(draft.apiKey.trim());
      const nextSettings = await aiApi.updateSettings({
        enabled: draft.enabled,
        providerName: draft.providerName,
        baseUrl: draft.baseUrl,
        model: draft.model || null,
        apiKey: draft.apiKey.trim() || undefined,
      });
      pushToast('success', t('aiSaved'));

      if (shouldSyncModels) {
        try {
          const syncedSettings = await aiApi.syncModels();
          onSettingsChange(syncedSettings);
          setDraft(createDraft(syncedSettings));
          pushToast('success', t('aiModelsSynced'));
          return;
        } catch {
          pushToast('error', t('aiConnectionError'));
        }
      }

      onSettingsChange(nextSettings);
      setDraft(createDraft(nextSettings));
    } catch {
      pushToast('error', t('aiSaveError'));
    }
  };

  const clearKey = async () => {
    try {
      const nextSettings = await aiApi.updateSettings({ clearApiKey: true });
      onSettingsChange(nextSettings);
      pushToast('success', t('saved'));
    } catch {
      pushToast('error', t('aiSaveError'));
    }
  };

  const selectModel = async (modelId: string) => {
    setDraft((current) => ({ ...current, model: modelId }));

    if (!settings?.hasApiKey) {
      return;
    }

    setIsBusy(true);
    try {
      const nextSettings = await aiApi.updateSettings({ model: modelId });
      onSettingsChange(nextSettings);
      setDraft(createDraft(nextSettings));
      pushToast('success', t('saved'));
    } catch {
      pushToast('error', t('aiSaveError'));
    } finally {
      setIsBusy(false);
    }
  };

  const syncModels = async () => {
    setIsBusy(true);
    try {
      const nextSettings = await aiApi.syncModels();
      onSettingsChange(nextSettings);
      pushToast('success', t('aiModelsSynced'));
    } catch {
      pushToast('error', t('aiConnectionError'));
    } finally {
      setIsBusy(false);
    }
  };

  const testConnection = async () => {
    setIsBusy(true);
    try {
      await aiApi.testConnection();
      const nextSettings = await aiApi.getSettings();
      onSettingsChange(nextSettings);
      pushToast('success', t('aiConnectionOk'));
    } catch {
      pushToast('error', t('aiConnectionError'));
    } finally {
      setIsBusy(false);
    }
  };

  const sendMessage = async () => {
    const text = input.trim();

    if (!text || isBusy) {
      return;
    }

    if (!settings?.enabled || !settings.hasApiKey || !settings.model) {
      onSettingsOpenChange(true);
      pushToast('error', t('aiNeedSettings'));
      return;
    }

    const nextMessages: AiChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(nextMessages);
    setInput('');
    setIsBusy(true);

    try {
      const response = await aiApi.chat(text, messages.slice(-12), currentNote);
      setMessages([...nextMessages, { ...response.message, actions: response.actions }]);
    } catch (caught) {
      pushToast('error', caught instanceof ApiError ? caught.message : t('aiChatError'), 9000);
    } finally {
      setIsBusy(false);
    }
  };

  const executeAction = async (action: AiToolAction) => {
    if (isBusy) {
      return;
    }

    setIsBusy(true);

    try {
      const response = await aiApi.executeAction(action);
      setMessages((current) => [...current, response.message]);
      await onActionApplied?.(response.noteId, action.name);
      pushToast('success', t('aiActionCompleted'));
    } catch (caught) {
      pushToast('error', caught instanceof ApiError ? caught.message : t('aiChatError'), 9000);
    } finally {
      setIsBusy(false);
    }
  };

  if (!settings && !isSettingsOpen) {
    return null;
  }

  return (
    <div
      className={`ai-assistant ${panelMode ? 'ai-assistant--open' : ''} ${
        panelMode ? `ai-assistant--${panelMode}` : ''
      }`}
      aria-live="polite"
    >
      {panelMode ? (
        <section className={`ai-panel ai-panel--${panelMode}`} aria-label={t('aiAssistant')}>
          <header className="ai-panel__head">
            <span className="ai-panel__title">
              {panelMode === 'settings' ? <Settings size={15} /> : <BrainCircuit size={15} />}
              <TooltipText value={panelMode === 'settings' ? t('aiSettings') : t('aiAssistant')} />
            </span>
            {panelMode === 'chat' ? (
              <Tooltip label={contextTooltip} className="ai-panel__meta-wrap">
                <span
                  className="ai-panel__meta"
                  aria-label={`${t('aiContext')}: ${contextStats.modelLabel}`}
                >
                  <span className="ai-panel__model">{contextStats.model}</span>
                  <i>
                    <b style={{ width: `${contextStats.percent}%` }} />
                  </i>
                  <span className="ai-panel__context">
                    {compactTokenCount(contextStats.used)} / {compactTokenCount(contextStats.limit)}
                  </span>
                </span>
              </Tooltip>
            ) : null}
            <div className="ai-panel__actions">
              {panelMode === 'chat' ? (
                <IconButton
                  label={t('aiSettings')}
                  icon={<Settings size={14} />}
                  onClick={() => onSettingsOpenChange(true)}
                />
              ) : null}
              {panelMode === 'settings' && settings?.enabled ? (
                <IconButton
                  label={t('aiAssistant')}
                  icon={<BrainCircuit size={14} />}
                  onClick={() => {
                    onSettingsOpenChange(false);
                    setIsChatOpen(true);
                  }}
                />
              ) : null}
              {panelMode === 'settings' ? (
                <IconButton
                  label={t('save')}
                  icon={<Save size={14} />}
                  variant="primary"
                  onClick={() => void saveSettings()}
                />
              ) : null}
              <IconButton label={t('close')} icon={<X size={14} />} onClick={closePanel} />
            </div>
          </header>

          {panelMode === 'chat' ? (
            <>
              <div className="ai-chat">
                {messages.length === 0 ? (
                  <p className="ai-chat__empty">{t('aiChatEmpty')}</p>
                ) : (
                  messages.map((message, index) => (
                    <article
                      className={`ai-chat__message ai-chat__message--${message.role}`}
                      key={index}
                    >
                      <span>{message.content}</span>
                      {message.actions?.length ? (
                        <div className="ai-tool-actions">
                          {message.actions.map((action, actionIndex) => (
                            <button
                              className={`ai-tool-action ${
                                action.destructive ? 'ai-tool-action--danger' : ''
                              }`}
                              type="button"
                              key={`${action.name}-${actionIndex}`}
                              disabled={isBusy}
                              onClick={() => void executeAction(action)}
                            >
                              <Check size={13} />
                              <span>
                                <TooltipText value={action.title} />
                                <small>{action.description}</small>
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  ))
                )}
                {isBusy ? <p className="ai-chat__thinking">{t('aiThinking')}</p> : null}
                <div ref={chatBottomRef} />
              </div>
              <div className="ai-chat__composer">
                <textarea
                  value={input}
                  rows={2}
                  placeholder={t('aiChatPlaceholder')}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void sendMessage();
                    }
                  }}
                />
                <IconButton
                  label={t('aiSend')}
                  icon={<Send size={15} />}
                  variant="primary"
                  disabled={isBusy || !input.trim()}
                  onClick={() => void sendMessage()}
                />
              </div>
            </>
          ) : (
            <form
              className="ai-settings"
              onSubmit={(event) => {
                event.preventDefault();
                void saveSettings();
              }}
            >
              <input
                className="sr-only"
                name="username"
                value={draft.providerName}
                autoComplete="username"
                tabIndex={-1}
                readOnly
              />
              <button
                className={`ai-toggle ${draft.enabled ? 'ai-toggle--active' : ''}`}
                type="button"
                aria-pressed={draft.enabled}
                onClick={() => setDraft((current) => ({ ...current, enabled: !current.enabled }))}
              >
                <Power size={15} />
                <span>{t('aiAssistant')}</span>
                <strong>{draft.enabled ? t('aiEnabledShort') : t('aiDisabledShort')}</strong>
              </button>

              <label className="ai-field">
                <span>{t('aiProvider')}</span>
                <input
                  autoComplete="off"
                  value={draft.providerName}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, providerName: event.target.value }))
                  }
                />
              </label>
              <label className="ai-field">
                <span>{t('aiBaseUrl')}</span>
                <input
                  autoComplete="url"
                  value={draft.baseUrl}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, baseUrl: event.target.value }))
                  }
                />
              </label>
              <label className="ai-field ai-field--wide">
                <span>{t('aiApiKey')}</span>
                <div className="ai-key-row">
                  <KeyRound size={15} />
                  <input
                    value={draft.apiKey}
                    name="apiKey"
                    type="password"
                    autoComplete="new-password"
                    placeholder={settings?.apiKeyHint ?? t('aiApiKeyPlaceholder')}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, apiKey: event.target.value }))
                    }
                  />
                  <IconButton
                    label={t('delete')}
                    icon={<Trash2 size={13} />}
                    variant="danger"
                    disabled={!settings?.hasApiKey}
                    onClick={() => void clearKey()}
                  />
                </div>
              </label>

              <div className="ai-settings__model-head">
                <span>{t('aiModel')}</span>
                <div className="ai-panel__actions">
                  <IconButton
                    label={t('aiSyncModels')}
                    icon={<RefreshCcw size={14} />}
                    disabled={isBusy || !settings?.hasApiKey}
                    onClick={() => void syncModels()}
                  />
                  <IconButton
                    label={t('aiCheckConnection')}
                    icon={<PlugZap size={14} />}
                    disabled={isBusy || !settings?.hasApiKey}
                    onClick={() => void testConnection()}
                  />
                </div>
              </div>

              <div className="ai-model-tools">
                <label className="ai-model-search">
                  <Search size={13} />
                  <input
                    autoComplete="off"
                    value={modelSearch}
                    placeholder={t('aiModelSearch')}
                    aria-label={t('aiModelSearch')}
                    onChange={(event) => setModelSearch(event.target.value)}
                  />
                </label>
                <div className="ai-model-filter" aria-label={t('aiModelFilter')}>
                  {modelFilterOptions.map((option) => (
                    <button
                      className={`ai-model-filter__item ${
                        modelFilter === option.value ? 'ai-model-filter__item--active' : ''
                      }`}
                      type="button"
                      key={option.value}
                      onClick={() => setModelFilter(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="ai-model-list">
                {modelGroups.length > 0 ? (
                  modelGroups.map((group, groupIndex) => (
                    <section className="ai-model-group" key={`${group.tier}-${groupIndex}`}>
                      <span className="ai-model-group__title">
                        {group.tier === 'deprecated'
                          ? t('aiModelsDeprecated')
                          : t(
                              group.tier === 'free'
                                ? 'aiModelsFree'
                                : group.tier === 'paid'
                                  ? 'aiModelsPaid'
                                  : 'aiModelsUnknown',
                            )}
                      </span>
                      {group.models.map((model) => (
                        <button
                          className={`ai-model-item ${
                            draft.model === model.id ? 'ai-model-item--active' : ''
                          }`}
                          type="button"
                          key={model.id}
                          disabled={isBusy}
                          onClick={() => void selectModel(model.id)}
                        >
                          <TooltipText value={model.label} className="ai-model-item__name" />
                          <span
                            className={`ai-model-rating ai-model-rating--${scoreTone(model.score)}`}
                            aria-label={t('aiModelRating')}
                          >
                            <span
                              className="ai-model-rating__bar"
                              style={{ '--ai-score': `${model.score}%` } as CSSProperties}
                            >
                              <span />
                            </span>
                          </span>
                          {draft.model === model.id ? <Check size={13} /> : <span />}
                        </button>
                      ))}
                    </section>
                  ))
                ) : (
                  <p className="ai-chat__empty">{t('aiNoModels')}</p>
                )}
              </div>
            </form>
          )}
        </section>
      ) : null}

      {settings?.enabled ? (
        <div className="ai-assistant__orb">
          <span className="ai-assistant__particle ai-assistant__particle--a" />
          <span className="ai-assistant__particle ai-assistant__particle--b" />
          <span className="ai-assistant__particle ai-assistant__particle--c" />
          <span className="ai-assistant__particle ai-assistant__particle--d" />
          <IconButton
            label={t('aiAssistant')}
            icon={<BrainCircuit size={20} />}
            variant="primary"
            className={`ai-assistant__fab ${panelMode ? 'ai-assistant__fab--active' : ''}`}
            onClick={() => {
              if (isSettingsOpen) {
                onSettingsOpenChange(false);
                setIsChatOpen(true);
                return;
              }

              setIsChatOpen((current) => !current);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
