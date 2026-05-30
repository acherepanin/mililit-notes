import {
  Bot,
  BrainCircuit,
  Check,
  CircleStop,
  Eraser,
  FileText,
  History,
  KeyRound,
  LayoutTemplate,
  Link,
  Mic,
  MicOff,
  Paperclip,
  PenLine,
  PlugZap,
  RefreshCcw,
  Save,
  Search,
  Send,
  Settings,
  Share2,
  ShieldCheck,
  Tags,
  Trash2,
  X,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ApiError, aiApi } from '../../api';
import { CustomSelect, type SelectOption } from '../../components/CustomSelect';
import { IconButton } from '../../components/IconButton';
import { Tooltip } from '../../components/Tooltip';
import { TooltipText } from '../../components/TooltipText';
import type { ToastKind } from '../../components/useToasts';
import type { Translator } from '../../i18n';
import type {
  AiChatMessage,
  AiBotLinkCode,
  AiBotProvider,
  AiBotUserSettings,
  AiCurrentNoteContext,
  AiModel,
  AiMonthlyUsage,
  AiSettings,
  AiToolAction,
  UserLanguage,
} from '../../types';
import {
  compactTokenCount,
  formatTokenPrice as formatPrice,
  formatUsd,
} from '../../utils/numberFormatting';
import { savedHintPlaceholder } from '../../utils/formText';
import {
  botProviders,
  createDefaultBotSettings,
  createDraft,
  estimateContextLimit,
  estimateTokens,
  findProviderPreset,
  groupModels,
  mergeBotSettings,
  parseLimit,
  providerPresets,
  scoreTone,
  type AiModelFilter,
  type AiProviderPresetSelectValue,
  type AiSettingsView,
  type BotSettingsPatch,
  type DraftSettings,
} from './aiAssistant.helpers';
import { AiBotAccessMenu, type BotAccessMenuOption } from './AiBotAccessMenu';

interface AiAssistantProps {
  settings: AiSettings | null;
  t: Translator;
  language: UserLanguage;
  isSettingsOpen: boolean;
  openChatSignal: number;
  onSettingsOpenChange: (isOpen: boolean) => void;
  onSettingsChange: (settings: AiSettings) => void;
  currentNote?: AiCurrentNoteContext | null;
  onActionApplied?: (noteId: number | undefined, actionName: string) => void | Promise<void>;
  pushToast: (kind: ToastKind, message: string, ttl?: number) => void;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<{ 0?: { transcript?: string }; isFinal?: boolean }>;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
type AiChatVisualStatus = 'success' | 'error';
type AiDisplayMessage = AiChatMessage & { visualStatus?: AiChatVisualStatus };

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  const target = window as Window &
    typeof globalThis & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };

  return target.SpeechRecognition ?? target.webkitSpeechRecognition ?? null;
}

function toAiHistory(messages: AiDisplayMessage[]): AiChatMessage[] {
  return messages.map((message) => ({ role: message.role, content: message.content }));
}

function ModelPriceTooltip({ model, t }: { model: AiModel; t: Translator }) {
  return (
    <span className="app-tooltip-rich ai-model-price-tooltip">
      <strong>{t('aiModelPriceTitle')}</strong>
      <span>
        {t('aiModelPriceInput')}: {formatPrice(model.inputPricePer1M)}
      </span>
      <span>
        {t('aiModelPriceCached')}: {formatPrice(model.cachedInputPricePer1M)}
      </span>
      <span>
        {t('aiModelPriceOutput')}: {formatPrice(model.outputPricePer1M)}
      </span>
    </span>
  );
}
export function AiAssistant({
  settings,
  t,
  language,
  isSettingsOpen,
  openChatSignal,
  onSettingsOpenChange,
  onSettingsChange,
  currentNote,
  onActionApplied,
  pushToast,
}: AiAssistantProps) {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [isChatRequestActive, setIsChatRequestActive] = useState(false);
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<AiDisplayMessage[]>([]);
  const [settingsView, setSettingsView] = useState<AiSettingsView>('settings');
  const [monthlyUsage, setMonthlyUsage] = useState<AiMonthlyUsage | null>(null);
  const [isMonthlyUsageLoading, setIsMonthlyUsageLoading] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [modelFilter, setModelFilter] = useState<AiModelFilter>('all');
  const [botSettings, setBotSettings] = useState<AiBotUserSettings[]>([]);
  const [botLinkCodes, setBotLinkCodes] = useState<Partial<Record<AiBotProvider, AiBotLinkCode>>>(
    {},
  );
  const [draft, setDraft] = useState<DraftSettings>(() => createDraft(settings));
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const modelGroups = useMemo(
    () => groupModels(settings?.models ?? [], modelSearch, modelFilter, draft.model),
    [draft.model, modelFilter, modelSearch, settings?.models],
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
  const modelFilterOptions = useMemo<Array<{ value: AiModelFilter; label: string }>>(
    () => [
      { value: 'all', label: t('aiFilterAll') },
      { value: 'paid', label: t('aiFilterPaid') },
      { value: 'free', label: t('aiFilterFree') },
    ],
    [t],
  );
  const botPermissionOptions = useMemo<BotAccessMenuOption[]>(
    () => [
      {
        key: 'readNotes',
        label: t('aiBotPermissionRead'),
        tooltip: t('aiBotPermissionReadTooltip'),
        icon: <FileText size={12} />,
      },
      {
        key: 'writeNotes',
        label: t('aiBotPermissionWrite'),
        tooltip: t('aiBotPermissionWriteTooltip'),
        icon: <PenLine size={12} />,
      },
      {
        key: 'deleteNotes',
        label: t('aiBotPermissionDelete'),
        tooltip: t('aiBotPermissionDeleteTooltip'),
        icon: <Trash2 size={12} />,
      },
      {
        key: 'manageTags',
        label: t('aiBotPermissionTags'),
        tooltip: t('aiBotPermissionTagsTooltip'),
        icon: <Tags size={12} />,
      },
      {
        key: 'useTemplates',
        label: t('aiBotPermissionTemplates'),
        tooltip: t('aiBotPermissionTemplatesTooltip'),
        icon: <LayoutTemplate size={12} />,
      },
      {
        key: 'useVersions',
        label: t('aiBotPermissionVersions'),
        tooltip: t('aiBotPermissionVersionsTooltip'),
        icon: <History size={12} />,
      },
      {
        key: 'listAttachments',
        label: t('aiBotPermissionFiles'),
        tooltip: t('aiBotPermissionFilesTooltip'),
        icon: <Paperclip size={12} />,
      },
      {
        key: 'createShareLinks',
        label: t('aiBotPermissionShare'),
        tooltip: t('aiBotPermissionShareTooltip'),
        icon: <Share2 size={12} />,
      },
    ],
    [t],
  );
  const activePresetId = findProviderPreset(draft.providerName, draft.baseUrl)?.id ?? null;
  const activePresetValue: AiProviderPresetSelectValue = activePresetId ?? 'custom';
  const isCustomProvider = activePresetValue === 'custom';
  const usageMetrics = (() => {
    if (!settings?.usageToday) {
      return [];
    }

    const requestLimit = parseLimit(draft.dailyRequestLimit);
    const tokenLimit = parseLimit(draft.dailyTokenLimit);
    const createMetric = (label: string, used: number, limit: number | null, isToken = false) => ({
      label,
      value: `${isToken ? compactTokenCount(used) : used} / ${
        limit ? (isToken ? compactTokenCount(limit) : limit) : t('aiLimitEmpty')
      }`,
    });

    return [
      createMetric(t('aiDailyRequests'), settings.usageToday.requests, requestLimit),
      createMetric(t('aiDailyTokens'), settings.usageToday.tokens, tokenLimit, true),
    ];
  })();
  const savedCustomProvider = useMemo(
    () =>
      settings?.providers.find(
        (provider) => !findProviderPreset(provider.providerName, provider.baseUrl),
      ) ?? null,
    [settings?.providers],
  );
  const providerPresetOptions = useMemo<Array<SelectOption<AiProviderPresetSelectValue>>>(
    () => [
      ...providerPresets.map((preset) => ({
        value: preset.id,
        label: `${preset.label} · ${preset.hint}`,
      })),
      { value: 'custom', label: `${t('aiProviderCustom')} · URL` },
    ],
    [t],
  );

  const switchProvider = async (providerName: string, baseUrl: string) => {
    setIsBusy(true);
    try {
      const nextSettings = await aiApi.updateSettings({ providerName, baseUrl });
      onSettingsChange(nextSettings);
      setDraft(createDraft(nextSettings));
    } catch {
      pushToast('error', t('aiSaveError'));
    } finally {
      setIsBusy(false);
    }
  };

  const selectProviderPreset = (value: AiProviderPresetSelectValue) => {
    if (value === 'custom') {
      if (savedCustomProvider) {
        void switchProvider(savedCustomProvider.providerName, savedCustomProvider.baseUrl);
        return;
      }

      setDraft((current) => ({
        ...current,
        providerName: activePresetId ? 'Custom' : current.providerName || 'Custom',
        baseUrl: activePresetId ? '' : current.baseUrl,
        model: '',
      }));
      return;
    }

    const preset = providerPresets.find((item) => item.id === value);

    if (!preset) {
      return;
    }

    const savedProvider = settings?.providers.find(
      (provider) => findProviderPreset(provider.providerName, provider.baseUrl)?.id === preset.id,
    );

    void switchProvider(
      savedProvider?.providerName ?? preset.providerName,
      savedProvider?.baseUrl ?? preset.baseUrl,
    );
  };

  const loadBotSettings = useCallback(async () => {
    try {
      setBotSettings(await aiApi.listBotUserSettings());
    } catch {
      pushToast('error', t('aiBotsLoadError'));
    }
  }, [pushToast, t]);

  const loadMonthlyUsage = useCallback(async () => {
    setIsMonthlyUsageLoading(true);
    try {
      setMonthlyUsage(await aiApi.getMonthlyUsage());
    } catch {
      pushToast('error', t('aiUsageLoadError'));
    } finally {
      setIsMonthlyUsageLoading(false);
    }
  }, [pushToast, t]);

  useEffect(() => {
    setDraft(createDraft(settings));
  }, [settings]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, panelMode]);

  useEffect(() => {
    if (panelMode === 'settings' && settingsView === 'usage') {
      void loadMonthlyUsage();
    }
  }, [loadMonthlyUsage, panelMode, settingsView]);

  useEffect(() => {
    if (panelMode !== 'settings') {
      return;
    }

    void loadBotSettings();
  }, [loadBotSettings, panelMode]);

  useEffect(() => {
    if (openChatSignal <= 0) {
      return;
    }

    if (settings?.enabled) {
      onSettingsOpenChange(false);
      setIsChatOpen(true);
    } else {
      onSettingsOpenChange(true);
    }
  }, [onSettingsOpenChange, openChatSignal, settings?.enabled]);

  useEffect(
    () => () => {
      speechRecognitionRef.current?.stop();
    },
    [],
  );

  const closePanel = () => {
    setIsChatOpen(false);
    onSettingsOpenChange(false);
    setSettingsView('settings');
  };

  const saveSettings = async () => {
    try {
      const shouldSyncModels = Boolean(draft.apiKey.trim());
      const nextSettings = await aiApi.updateSettings({
        providerName: draft.providerName,
        baseUrl: draft.baseUrl,
        model: draft.model || null,
        apiKey: draft.apiKey.trim() || undefined,
        allowReadSecrets: draft.allowReadSecrets,
        requireActionConfirmation: draft.requireActionConfirmation,
        dailyRequestLimit: parseLimit(draft.dailyRequestLimit),
        dailyTokenLimit: parseLimit(draft.dailyTokenLimit),
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

  const updateBotSettings = async (provider: AiBotProvider, patch: BotSettingsPatch) => {
    setIsBusy(true);
    try {
      const nextSettings = await aiApi.updateBotUserSettings(provider, {
        enabled: patch.enabled,
        accessMode: patch.accessMode,
        allowSecrets: patch.allowSecrets,
        permissions: patch.permissions,
        dailyRequestLimit:
          patch.dailyRequestLimit === undefined ? undefined : patch.dailyRequestLimit,
        dailyReadLimit: patch.dailyReadLimit === undefined ? undefined : patch.dailyReadLimit,
        dailyWriteLimit: patch.dailyWriteLimit === undefined ? undefined : patch.dailyWriteLimit,
      });
      setBotSettings((current) => {
        const existing = current.find((item) => item.provider === provider);
        const merged = mergeBotSettings(provider, existing, nextSettings, patch);

        return existing
          ? current.map((item) => (item.provider === provider ? merged : item))
          : [...current, merged];
      });
      pushToast('success', t('saved'));
    } catch {
      pushToast('error', t('aiBotsSaveError'));
    } finally {
      setIsBusy(false);
    }
  };

  const createBotLinkCode = async (provider: AiBotProvider) => {
    setIsBusy(true);
    try {
      const code = await aiApi.createBotLinkCode(provider);
      setBotLinkCodes((current) => ({ ...current, [provider]: code }));
      pushToast('success', t('aiBotCodeCreated'));
    } catch {
      pushToast('error', t('aiBotCodeError'));
    } finally {
      setIsBusy(false);
    }
  };

  const copyBotLinkCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      pushToast('success', t('copied'));
    } catch {
      pushToast('error', t('aiBotCodeCopyError'));
    }
  };

  const refreshAiSettings = async () => {
    try {
      onSettingsChange(await aiApi.getSettings());
    } catch {
      // Settings refresh is secondary after a chat response.
    }
  };

  const clearChat = () => {
    setMessages([]);
    setInput('');
  };

  const stopChatRequest = () => {
    chatAbortRef.current?.abort();
  };

  const toggleVoiceInput = () => {
    if (isVoiceListening) {
      speechRecognitionRef.current?.stop();
      setIsVoiceListening(false);
      return;
    }

    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) {
      pushToast('error', t('aiVoiceUnsupported'));
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = language === 'ru' ? 'ru-RU' : 'en-US';
    recognition.onresult = (event) => {
      const text = Array.from(event.results)
        .map((result) => result[0]?.transcript?.trim() ?? '')
        .filter(Boolean)
        .join(' ');

      if (text) {
        setInput((current) => `${current}${current.trim() ? ' ' : ''}${text}`);
      }
    };
    recognition.onerror = () => {
      pushToast('error', t('aiVoiceError'));
      setIsVoiceListening(false);
    };
    recognition.onend = () => setIsVoiceListening(false);
    speechRecognitionRef.current = recognition;
    try {
      setIsVoiceListening(true);
      recognition.start();
    } catch {
      setIsVoiceListening(false);
      pushToast('error', t('aiVoiceError'));
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

    const nextMessages: AiDisplayMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(nextMessages);
    setInput('');
    setIsBusy(true);
    setIsChatRequestActive(true);
    const abortController = new AbortController();
    chatAbortRef.current = abortController;

    try {
      const response = await aiApi.chat(
        text,
        toAiHistory(messages).slice(-12),
        currentNote,
        abortController.signal,
      );
      if (response.executions?.length) {
        for (const execution of response.executions) {
          await onActionApplied?.(execution.noteId, execution.actionName ?? 'ai.action');
        }
        setMessages([
          ...nextMessages,
          {
            role: 'assistant',
            content: response.message.content || t('aiActionCompleted'),
            visualStatus: 'success',
          },
        ]);
        pushToast('success', t('aiActionCompleted'));
      } else {
        setMessages([...nextMessages, { ...response.message, actions: response.actions }]);
      }
      void refreshAiSettings();
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') {
        setMessages((current) => [...current, { role: 'assistant', content: t('aiStopped') }]);
        return;
      }

      const message = caught instanceof ApiError ? caught.message : t('aiChatError');
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: message, visualStatus: 'error' },
      ]);
      pushToast('error', message, 9000);
    } finally {
      if (chatAbortRef.current === abortController) {
        chatAbortRef.current = null;
      }
      setIsChatRequestActive(false);
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
      await onActionApplied?.(response.noteId, action.name);
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: response.message.content || t('aiActionCompleted'),
          visualStatus: 'success',
        },
      ]);
      pushToast('success', t('aiActionCompleted'));
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : t('aiChatError');
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: message, visualStatus: 'error' },
      ]);
      pushToast('error', message, 9000);
    } finally {
      setIsBusy(false);
    }
  };

  const renderMonthlyUsage = () => (
    <div className="ai-usage-panel">
      {isMonthlyUsageLoading && !monthlyUsage ? (
        <p className="ai-chat__empty">{t('aiUsageLoading')}</p>
      ) : monthlyUsage ? (
        <>
          <div className="ai-usage-total">
            <span>{t('aiUsageMonth')}</span>
            <strong>
              {formatUsd(monthlyUsage.knownCostUsd)}
              {monthlyUsage.hasUnknownCost ? ' + ?' : ''}
            </strong>
            <small>
              {compactTokenCount(monthlyUsage.tokens)} {t('aiTokens')} / {monthlyUsage.requests}{' '}
              {t('aiUsageRequests').toLowerCase()}
            </small>
          </div>
          <div className="ai-usage-models">
            {monthlyUsage.models.length > 0 ? (
              monthlyUsage.models.map((item) => (
                <article className="ai-usage-model" key={`${item.providerName}-${item.model}`}>
                  <header>
                    <TooltipText value={item.model} />
                    <strong>{item.costUsd === null ? '?' : formatUsd(item.costUsd)}</strong>
                  </header>
                  <div>
                    <span>
                      {t('aiUsageTokens')}: {compactTokenCount(item.tokens)}
                    </span>
                    <span>
                      {t('aiUsageRequests')}: {item.requests}
                    </span>
                    <span>
                      {t('aiModelPriceInput')}: {formatPrice(item.inputPricePer1M)}
                    </span>
                    <span>
                      {t('aiModelPriceOutput')}: {formatPrice(item.outputPricePer1M)}
                    </span>
                  </div>
                </article>
              ))
            ) : (
              <p className="ai-chat__empty">{t('aiUsageEmpty')}</p>
            )}
          </div>
        </>
      ) : (
        <p className="ai-chat__empty">{t('aiUsageEmpty')}</p>
      )}
    </div>
  );

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
              <TooltipText
                value={
                  panelMode === 'settings'
                    ? settingsView === 'usage'
                      ? t('aiChatTabUsage')
                      : t('aiSettings')
                    : t('aiAssistant')
                }
              />
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
                  label={t('aiClearChat')}
                  icon={<Eraser size={14} />}
                  disabled={messages.length === 0 || isChatRequestActive}
                  onClick={clearChat}
                />
              ) : null}
              {panelMode === 'chat' ? (
                <IconButton
                  label={t('aiSettings')}
                  icon={<Settings size={14} />}
                  onClick={() => onSettingsOpenChange(true)}
                />
              ) : null}
              {panelMode === 'settings' && settingsView === 'settings' ? (
                <IconButton
                  label={t('save')}
                  icon={<Save size={14} />}
                  variant="primary"
                  onClick={() => void saveSettings()}
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
              <IconButton label={t('close')} icon={<X size={14} />} onClick={closePanel} />
            </div>
          </header>

          {panelMode === 'chat' ? (
            <>
              <div className="ai-chat">
                {messages.length === 0 ? (
                  <p className="ai-chat__empty">{t('aiChatEmpty')}</p>
                ) : (
                  messages.map((message, index) =>
                    message.visualStatus ? (
                      <article
                        className={`ai-chat__status ai-chat__status--${message.visualStatus}`}
                        key={index}
                        role="status"
                      >
                        <span className="ai-chat__status-icon" aria-hidden="true">
                          {message.visualStatus === 'success' ? (
                            <Check size={15} />
                          ) : (
                            <X size={15} />
                          )}
                        </span>
                        {message.visualStatus === 'error' ? (
                          <TooltipText value={message.content} className="ai-chat__status-text" />
                        ) : (
                          <span className="sr-only">{message.content}</span>
                        )}
                      </article>
                    ) : (
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
                    ),
                  )
                )}
                {isBusy ? (
                  <p
                    className="ai-chat__thinking"
                    role="status"
                    aria-label={t('aiThinking')}
                    aria-live="polite"
                  >
                    <span className="ai-chat__thinking-dots" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </span>
                  </p>
                ) : null}
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
                  label={isVoiceListening ? t('aiVoiceStop') : t('aiVoiceInput')}
                  icon={isVoiceListening ? <MicOff size={15} /> : <Mic size={15} />}
                  variant={isVoiceListening ? 'active' : 'plain'}
                  disabled={isBusy}
                  onClick={toggleVoiceInput}
                />
                {isChatRequestActive ? (
                  <IconButton
                    label={t('aiStop')}
                    icon={<CircleStop size={15} />}
                    variant="danger"
                    onClick={stopChatRequest}
                  />
                ) : (
                  <IconButton
                    label={t('aiSend')}
                    icon={<Send size={15} />}
                    variant="primary"
                    disabled={isBusy || !input.trim()}
                    onClick={() => void sendMessage()}
                  />
                )}
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

              <div className="ai-settings-switch" aria-label={t('aiSettings')}>
                <button
                  className={`ai-settings-switch__item ${
                    settingsView === 'settings' ? 'ai-settings-switch__item--active' : ''
                  }`}
                  type="button"
                  onClick={() => setSettingsView('settings')}
                >
                  {t('aiSettings')}
                </button>
                <button
                  className={`ai-settings-switch__item ${
                    settingsView === 'usage' ? 'ai-settings-switch__item--active' : ''
                  }`}
                  type="button"
                  onClick={() => setSettingsView('usage')}
                >
                  {t('aiChatTabUsage')}
                </button>
              </div>

              <div className="ai-settings__scroll">
                {settingsView === 'usage' ? (
                  renderMonthlyUsage()
                ) : (
                  <>
                    <section
                      className="ai-settings-group ai-core-settings"
                      aria-label={t('aiSettings')}
                    >
                      <div className="ai-core-settings__main">
                        <label className="ai-field ai-provider-field">
                          <span>{t('aiProviderPreset')}</span>
                          <CustomSelect
                            className="ai-provider-select"
                            label={t('aiProviderPreset')}
                            value={activePresetValue}
                            options={providerPresetOptions}
                            disabled={isBusy}
                            onChange={selectProviderPreset}
                          />
                        </label>

                        <label className="ai-field">
                          <span>{t('aiApiKey')}</span>
                          <div className="ai-input-row ai-key-row">
                            <Tooltip label={t('aiApiKey')}>
                              <KeyRound size={13} />
                            </Tooltip>
                            <input
                              value={draft.apiKey}
                              name="apiKey"
                              type="password"
                              autoComplete="new-password"
                              placeholder={savedHintPlaceholder(
                                t,
                                settings?.apiKeyHint,
                                t('aiApiKeyPlaceholder'),
                              )}
                              onChange={(event) =>
                                setDraft((current) => ({ ...current, apiKey: event.target.value }))
                              }
                            />
                            <IconButton
                              className="ai-key-clear"
                              label={t('delete')}
                              icon={<Trash2 size={13} />}
                              variant="danger"
                              disabled={!settings?.hasApiKey}
                              onClick={() => void clearKey()}
                            />
                          </div>
                        </label>
                      </div>

                      {isCustomProvider ? (
                        <div className="ai-core-settings__custom">
                          <label className="ai-field">
                            <span>{t('aiProvider')}</span>
                            <div className="ai-input-row">
                              <PlugZap size={13} />
                              <input
                                autoComplete="off"
                                value={draft.providerName}
                                placeholder={t('aiProvider')}
                                onChange={(event) =>
                                  setDraft((current) => ({
                                    ...current,
                                    providerName: event.target.value,
                                  }))
                                }
                              />
                            </div>
                          </label>
                          <label className="ai-field">
                            <span>{t('aiBaseUrl')}</span>
                            <div className="ai-input-row">
                              <Link size={13} />
                              <input
                                autoComplete="url"
                                value={draft.baseUrl}
                                placeholder="HTTPS://api.openai.com/v1"
                                onChange={(event) =>
                                  setDraft((current) => ({
                                    ...current,
                                    baseUrl: event.target.value,
                                  }))
                                }
                              />
                            </div>
                          </label>
                        </div>
                      ) : null}

                      <div className="ai-core-settings__policy">
                        <label className="ai-field ai-limit-field">
                          <span>{t('aiDailyRequests')}</span>
                          <div className="ai-input-row">
                            <Tooltip label={t('aiDailyRequests')}>
                              <Send size={13} />
                            </Tooltip>
                            <input
                              autoComplete="off"
                              inputMode="numeric"
                              value={draft.dailyRequestLimit}
                              placeholder={t('aiLimitEmpty')}
                              onChange={(event) =>
                                setDraft((current) => ({
                                  ...current,
                                  dailyRequestLimit: event.target.value.replace(/\D/g, ''),
                                }))
                              }
                            />
                          </div>
                        </label>
                        <label className="ai-field ai-limit-field">
                          <span>{t('aiDailyTokens')}</span>
                          <div className="ai-input-row">
                            <Tooltip label={t('aiDailyTokens')}>
                              <BrainCircuit size={13} />
                            </Tooltip>
                            <input
                              autoComplete="off"
                              inputMode="numeric"
                              value={draft.dailyTokenLimit}
                              placeholder={t('aiLimitEmpty')}
                              onChange={(event) =>
                                setDraft((current) => ({
                                  ...current,
                                  dailyTokenLimit: event.target.value.replace(/\D/g, ''),
                                }))
                              }
                            />
                          </div>
                        </label>

                        <Tooltip
                          label={
                            <span className="app-tooltip-rich">
                              <strong>{t('aiAllowSecrets')}</strong>
                              <span>{t('aiAllowSecretsHint')}</span>
                            </span>
                          }
                        >
                          <button
                            className={`ai-secret-toggle ${
                              draft.allowReadSecrets ? 'ai-secret-toggle--active' : ''
                            }`}
                            type="button"
                            aria-label={t('aiAllowSecrets')}
                            aria-pressed={draft.allowReadSecrets}
                            onClick={() =>
                              setDraft((current) => ({
                                ...current,
                                allowReadSecrets: !current.allowReadSecrets,
                              }))
                            }
                          >
                            <ShieldCheck size={14} />
                          </button>
                        </Tooltip>

                        <Tooltip
                          label={
                            <span className="app-tooltip-rich">
                              <strong>{t('aiRequireActionConfirmation')}</strong>
                              <span>{t('aiRequireActionConfirmationHint')}</span>
                            </span>
                          }
                        >
                          <button
                            className={`ai-secret-toggle ${
                              draft.requireActionConfirmation ? 'ai-secret-toggle--active' : ''
                            }`}
                            type="button"
                            aria-label={t('aiRequireActionConfirmation')}
                            aria-pressed={draft.requireActionConfirmation}
                            onClick={() =>
                              setDraft((current) => ({
                                ...current,
                                requireActionConfirmation: !current.requireActionConfirmation,
                              }))
                            }
                          >
                            <Check size={14} />
                          </button>
                        </Tooltip>

                        {usageMetrics.length ? (
                          <div className="ai-usage-today" aria-label={t('aiUsageToday')}>
                            {usageMetrics.map((metric) => (
                              <div className="ai-usage-meter" key={metric.label}>
                                <small>
                                  <TooltipText value={metric.label} />
                                  <b>{metric.value}</b>
                                </small>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </section>

                    <section className="ai-settings-group ai-bots" aria-label={t('aiBotSettings')}>
                      <div className="ai-settings__model-head">
                        <span>{t('aiBotSettings')}</span>
                      </div>

                      <div className="ai-bot-list">
                        {botProviders.map((provider) => {
                          const bot =
                            botSettings.find((item) => item.provider === provider) ??
                            createDefaultBotSettings(provider);
                          const linkCode = botLinkCodes[provider];
                          const providerLabel = provider === 'telegram' ? 'Telegram' : 'VK';
                          const isLinked = Boolean(bot.linkedExternalId);
                          const botTooltip = `${providerLabel}: ${
                            bot.enabled ? t('aiBotStatusEnabled') : t('aiBotStatusDisabled')
                          }; ${isLinked ? t('aiBotStatusLinked') : t('aiBotStatusNotLinked')}`;

                          return (
                            <article className="ai-bot-item" key={provider}>
                              <Tooltip label={botTooltip} className="ai-bot-item__toggle-tip">
                                <button
                                  className={`ai-bot-item__toggle ${
                                    bot.enabled ? 'ai-bot-item__toggle--active' : ''
                                  } ${isLinked ? 'ai-bot-item__toggle--linked' : 'ai-bot-item__toggle--unlinked'}`}
                                  type="button"
                                  aria-label={botTooltip}
                                  onClick={() =>
                                    void updateBotSettings(provider, { enabled: !bot.enabled })
                                  }
                                >
                                  <Bot size={12} />
                                  <span className="ai-bot-item__provider">
                                    <strong>{providerLabel}</strong>
                                    <span className="ai-bot-item__status" aria-hidden="true" />
                                  </span>
                                </button>
                              </Tooltip>

                              <AiBotAccessMenu
                                bot={bot}
                                disabled={isBusy}
                                options={botPermissionOptions}
                                t={t}
                                onChange={(patch) => void updateBotSettings(provider, patch)}
                              />

                              <button
                                className="ai-bot-item__code"
                                type="button"
                                disabled={isBusy}
                                onClick={() =>
                                  linkCode
                                    ? void copyBotLinkCode(linkCode.code)
                                    : void createBotLinkCode(provider)
                                }
                              >
                                <Tooltip label={linkCode ? t('copy') : t('aiBotLinkCodeTooltip')}>
                                  <KeyRound size={12} />
                                </Tooltip>
                                <span>
                                  {linkCode ? (
                                    <TooltipText value={linkCode.code} />
                                  ) : (
                                    t('aiBotCreateCode')
                                  )}
                                </span>
                              </button>
                            </article>
                          );
                        })}
                      </div>
                    </section>

                    <section className="ai-settings-group ai-model-section">
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
                                  : group.tier === 'selected'
                                    ? t('aiModelsSelected')
                                    : t(
                                        group.tier === 'free'
                                          ? 'aiModelsFree'
                                          : group.tier === 'paid'
                                            ? 'aiModelsPaid'
                                            : 'aiModelsUnknown',
                                      )}
                              </span>
                              {group.models.map((model) => (
                                <Tooltip
                                  label={<ModelPriceTooltip model={model} t={t} />}
                                  className="ai-model-price-anchor"
                                  key={model.id}
                                >
                                  <button
                                    className={`ai-model-item ${
                                      draft.model === model.id ? 'ai-model-item--active' : ''
                                    }`}
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => void selectModel(model.id)}
                                  >
                                    <TooltipText
                                      value={model.label}
                                      className="ai-model-item__name"
                                    />
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
                                </Tooltip>
                              ))}
                            </section>
                          ))
                        ) : (
                          <p className="ai-chat__empty">{t('aiNoModels')}</p>
                        )}
                      </div>
                    </section>
                  </>
                )}
              </div>
            </form>
          )}
        </section>
      ) : null}

      {settings?.enabled ? (
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
      ) : null}
    </div>
  );
}
