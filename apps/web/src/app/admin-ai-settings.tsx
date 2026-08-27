"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Check,
  ChevronDown,
  CircleAlert,
  CircleHelp,
  Coins,
  FlaskConical,
  KeyRound,
  LoaderCircle,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  Workflow,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import {
  adminAiApi,
  type AiModelRole,
  type AiModelRoute,
  type AiPromptModelRole,
  type AiProvider,
  type AiProviderModel,
  type AiReasoningEffort,
  type JsonObject,
  type PromptDefinition,
  type PromptEvalState,
} from "./admin-ai-api";
import {
  AppSwitch,
  ConfirmDialog,
  SearchableSelect,
  TooltipText,
} from "./ui-controls";

const modelRoles: Array<{ label: string; value: AiModelRole }> = [
  { label: "Быстрые ответы", value: "fast" },
  { label: "Основной чат", value: "chat" },
  { label: "Сложные рассуждения", value: "reasoning" },
  { label: "Изображения", value: "vision" },
  { label: "Голосовой диалог", value: "voice" },
  { label: "Распознавание речи", value: "transcription" },
  { label: "Синтез речи", value: "speech" },
  { label: "Векторный поиск", value: "embedding" },
];
const promptRoles = modelRoles.slice(0, 5) as Array<{
  label: string;
  value: AiPromptModelRole;
}>;
const reasoningEfforts: AiReasoningEffort[] = [
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
];

interface AdminAiAction {
  run(): Promise<unknown>;
  success: string;
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Не удалось выполнить операцию";
}

function useAdminAiAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ run }: AdminAiAction) => run(),
    onError: (error) => toast.error(errorMessage(error)),
    onSuccess: async (_, input) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-ai"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-ai-evals"] }),
      ]);
      toast.success(input.success);
    },
  });
}

function parseJsonObject(value: string, label: string): JsonObject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${label}: проверьте синтаксис JSON`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} должен быть JSON-объектом`);
  }
  return parsed as JsonObject;
}

function list(value: string) {
  return [
    ...new Set(
      value
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function optionalNumber(value: string): number | null {
  return value.trim() ? Number(value) : null;
}

function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("ru-RU", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(value))
    : "нет данных";
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("ru-RU", { notation: "compact" }).format(value);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    currency: "USD",
    maximumFractionDigits: value < 0.01 ? 4 : 2,
    style: "currency",
  }).format(value);
}

function FieldTitle({ hint, label }: { hint: string; label: string }) {
  return (
    <span className="field-title">
      <span>{label}</span>
      <TooltipText label={hint}>
        <CircleHelp aria-hidden="true" size={13} />
      </TooltipText>
    </span>
  );
}

const reasoningEffortLabels: Record<AiReasoningEffort, string> = {
  high: "Высокий",
  low: "Низкий",
  medium: "Средний",
  none: "Без рассуждений",
  xhigh: "Максимальный",
};

function modelSupportsRole(model: AiProviderModel, role: AiModelRole) {
  if (role === "embedding") return model.capabilities.includes("embedding");
  if (role === "speech") return model.capabilities.includes("speech");
  if (role === "transcription") {
    return model.capabilities.includes("transcription");
  }
  if (role === "voice") return model.capabilities.includes("audio");
  if (role === "vision") return model.capabilities.includes("vision");
  if (role === "reasoning") return model.capabilities.includes("reasoning");
  return model.capabilities.includes("text");
}

function modelPower(model: AiProviderModel) {
  if (model.quality !== "unknown") return model.quality;
  return model.capabilities.includes("reasoning") ? "высокая" : "стандартная";
}

function BusyIcon({
  busy,
  fallback: Icon = Save,
}: {
  busy: boolean;
  fallback?: typeof Save;
}) {
  return busy ? (
    <LoaderCircle aria-hidden="true" className="is-spinning" size={15} />
  ) : (
    <Icon aria-hidden="true" size={15} />
  );
}

function ProviderForm({ provider }: { provider?: AiProvider }) {
  const action = useAdminAiAction();
  const syncAction = useAdminAiAction();
  const [providerName, setProviderName] = useState(
    provider?.providerName ?? "OpenAI",
  );
  const [baseUrl, setBaseUrl] = useState(
    provider?.baseUrl ?? "https://api.openai.com/v1",
  );
  const [model, setModel] = useState(provider?.model ?? "");
  const [apiKey, setApiKey] = useState("");
  const [clearApiKey, setClearApiKey] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const models = useQuery({
    enabled: Boolean(provider),
    queryFn: () => adminAiApi.listProviderModels(provider!.id),
    queryKey: ["admin-ai", "provider-models", provider?.id],
    retry: false,
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const disclosure = event.currentTarget.closest("details");
    const input = {
      baseUrl,
      model: model.trim() || null,
      providerName,
      ...(apiKey ? { apiKey } : {}),
      ...(clearApiKey ? { clearApiKey: true as const } : {}),
    };
    action.mutate(
      {
        run: () =>
          provider
            ? adminAiApi.updateProvider(provider.id, input)
            : adminAiApi.createProvider(input),
        success: provider ? "Провайдер обновлён" : "Провайдер добавлен",
      },
      {
        onSuccess: () => {
          setApiKey("");
          setClearApiKey(false);
          if (!provider && disclosure) disclosure.open = false;
        },
      },
    );
  }

  function remove() {
    if (!provider) return;
    action.mutate(
      {
        run: () => adminAiApi.deleteProvider(provider.id),
        success: "Провайдер удалён",
      },
      { onSuccess: () => setDeleteOpen(false) },
    );
  }

  return (
    <form className="admin-ai-form" onSubmit={submit}>
      <label className="field-label">
        <FieldTitle
          hint="Отображаемое имя подключения, например OpenAI или корпоративный шлюз."
          label="Название"
        />
        <input
          maxLength={80}
          onChange={(event) => setProviderName(event.target.value)}
          required
          value={providerName}
        />
      </label>
      <label className="field-label field-label--wide">
        <FieldTitle
          hint="Базовый HTTPS-адрес OpenAI-совместимого API без пути /models."
          label="Адрес API"
        />
        <input
          maxLength={500}
          onChange={(event) => setBaseUrl(event.target.value)}
          required
          type="url"
          value={baseUrl}
        />
      </label>
      <label className="field-label">
        <FieldTitle
          hint="Модель провайдера по умолчанию. Маршрут конкретной задачи может её переопределить."
          label="Модель по умолчанию"
        />
        {provider && (models.data?.length ?? 0) > 0 ? (
          <SearchableSelect
            ariaLabel="Модель провайдера по умолчанию"
            onValueChange={setModel}
            options={[
              { label: "Не выбрана", value: "" },
              ...(models.data ?? []).map((item) => ({
                keywords: `${item.id} ${item.capabilities.join(" ")}`,
                label: `${item.label} · мощность ${modelPower(item)}`,
                value: item.id,
              })),
            ]}
            searchPlaceholder="Найти модель"
            value={model}
          />
        ) : (
          <input
            maxLength={200}
            onChange={(event) => setModel(event.target.value)}
            placeholder={
              provider
                ? "Сначала обновите список моделей"
                : "После сохранения выберите из списка"
            }
            value={model}
          />
        )}
      </label>
      <label className="field-label">
        <FieldTitle
          hint="Секрет шифруется на сервере и никогда не возвращается в браузер."
          label={`Ключ API${provider?.apiKeyHint ? ` · ${provider.apiKeyHint}` : ""}`}
        />
        <input
          autoComplete="new-password"
          disabled={clearApiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={
            provider?.hasApiKey ? "Оставьте пустым, чтобы сохранить" : "sk-…"
          }
          type="password"
          value={apiKey}
        />
      </label>
      {provider?.hasApiKey ? (
        <div className="admin-ai-switch field-label--wide">
          <FieldTitle
            hint="Удаляет зашифрованный ключ с сервера. После этого запросы провайдера перестанут работать."
            label="Удалить сохранённый ключ при сохранении"
          />
          <AppSwitch
            checked={clearApiKey}
            label="Удалить API key"
            onCheckedChange={(checked) => {
              setClearApiKey(checked);
              if (checked) setApiKey("");
            }}
          />
        </div>
      ) : null}
      <div className="settings-actions admin-ai-form__actions">
        {provider ? (
          <button
            className="button button--quiet"
            disabled={!provider.hasApiKey || syncAction.isPending}
            onClick={() =>
              syncAction.mutate({
                run: () => adminAiApi.syncProviderModels(provider.id),
                success: "Список моделей обновлён",
              })
            }
            type="button"
          >
            <BusyIcon busy={syncAction.isPending} fallback={RefreshCw} />
            Обновить модели
          </button>
        ) : null}
        {provider ? (
          <button
            className="button button--danger"
            disabled={action.isPending}
            onClick={() => setDeleteOpen(true)}
            type="button"
          >
            <Trash2 aria-hidden="true" size={15} />
            Удалить
          </button>
        ) : null}
        <button
          className="button button--primary"
          disabled={action.isPending}
          type="submit"
        >
          <BusyIcon busy={action.isPending} />
          Сохранить
        </button>
      </div>
      <ConfirmDialog
        confirmLabel="Удалить"
        description={`Провайдер «${provider?.providerName ?? ""}» и его настройки маршрутизации будут удалены.`}
        onConfirm={remove}
        onOpenChange={setDeleteOpen}
        open={deleteOpen}
        title="Удалить AI-провайдер?"
      />
    </form>
  );
}

function Providers({ providers }: { providers: AiProvider[] }) {
  return (
    <section className="admin-ai-section" aria-labelledby="ai-providers-title">
      <div className="settings-subhead">
        <div>
          <strong id="ai-providers-title">Провайдеры</strong>
          <span>Ключи зашифрованы и доступны только для записи</span>
        </div>
        <KeyRound aria-hidden="true" size={17} />
      </div>
      {providers.map((provider) => (
        <details
          className="admin-ai-disclosure admin-ai-provider"
          key={provider.id}
        >
          <summary>
            <span className="admin-ai-summary">
              <strong>{provider.providerName}</strong>
              <TooltipText label={provider.baseUrl} />
            </span>
            <span
              className={
                provider.hasApiKey ? "status status--success" : "status"
              }
            >
              {provider.hasApiKey ? "Ключ задан" : "Без ключа"}
            </span>
            <ChevronDown aria-hidden="true" size={15} />
          </summary>
          <div className="admin-ai-disclosure__body">
            <p className="admin-ai-meta">
              Обновлён {formatDate(provider.updatedAt)}
              {provider.lastConnectionCheckStatus
                ? ` · проверка: ${provider.lastConnectionCheckStatus}`
                : " · автоматическая проверка пока не выполнялась"}
            </p>
            <ProviderForm provider={provider} />
          </div>
        </details>
      ))}
      {providers.length === 0 ? (
        <div className="admin-feedback admin-feedback--empty">
          <CircleAlert aria-hidden="true" size={18} />
          Добавьте провайдера, чтобы настроить маршруты моделей
        </div>
      ) : null}
      <details className="admin-ai-disclosure admin-ai-create-provider">
        <summary>
          <Plus aria-hidden="true" size={16} />
          Добавить провайдера
          <ChevronDown aria-hidden="true" size={15} />
        </summary>
        <div className="admin-ai-disclosure__body">
          <ProviderForm />
        </div>
      </details>
    </section>
  );
}

function RouteEditor({
  providers,
  role,
  route,
}: {
  providers: AiProvider[];
  role: (typeof modelRoles)[number];
  route?: AiModelRoute;
}) {
  const action = useAdminAiAction();
  const [providerSettingId, setProviderSettingId] = useState(
    route?.providerSettingId?.toString() ?? "",
  );
  const [model, setModel] = useState(route?.model ?? "");
  const [reasoningEffort, setReasoningEffort] = useState<AiReasoningEffort>(
    route?.reasoningEffort ?? "none",
  );
  const [temperature, setTemperature] = useState(
    route?.temperature?.toString() ?? "",
  );
  const [maxOutputTokens, setMaxOutputTokens] = useState(
    route?.maxOutputTokens?.toString() ?? "",
  );
  const [fallbackModels, setFallbackModels] = useState(
    route?.fallbackModels.join(", ") ?? "",
  );
  const [enabled, setEnabled] = useState(route?.enabled ?? true);
  const selectedProviderId = providerSettingId
    ? Number(providerSettingId)
    : null;
  const providerModels = useQuery({
    enabled: selectedProviderId !== null,
    queryFn: () => adminAiApi.listProviderModels(selectedProviderId!),
    queryKey: ["admin-ai", "provider-models", selectedProviderId],
    retry: false,
  });
  const relevantModels = (providerModels.data ?? []).filter((item) =>
    modelSupportsRole(item, role.value),
  );
  const selectedModel = providerModels.data?.find((item) => item.id === model);
  const hasReasoning =
    selectedModel?.capabilities.includes("reasoning") ?? false;
  const supportsGeneration = !["embedding", "speech", "transcription"].includes(
    role.value,
  );
  const supportsFallbacks = ["chat", "fast", "reasoning", "vision"].includes(
    role.value,
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    action.mutate({
      run: () =>
        adminAiApi.putModelRoute(role.value, {
          enabled,
          fallbackModels: list(fallbackModels),
          maxOutputTokens: optionalNumber(maxOutputTokens),
          model,
          providerSettingId: providerSettingId
            ? Number(providerSettingId)
            : null,
          reasoningEffort,
          temperature: optionalNumber(temperature),
        }),
      success: `Маршрут «${role.label}» сохранён`,
    });
  }

  const provider = providers.find(
    (item) => item.id === route?.providerSettingId,
  );
  return (
    <details className="admin-ai-disclosure admin-ai-route">
      <summary>
        <span className="admin-ai-summary">
          <strong>{role.label}</strong>
          <small>
            {route
              ? `${provider?.providerName ?? "Без провайдера"} · ${route.model}`
              : role.value}
          </small>
        </span>
        <span className={route?.enabled ? "status status--success" : "status"}>
          {route ? (route.enabled ? "Включён" : "Выключен") : "Не настроен"}
        </span>
        <ChevronDown aria-hidden="true" size={15} />
      </summary>
      <div className="admin-ai-disclosure__body">
        <form className="admin-ai-form" onSubmit={submit}>
          <label className="field-label">
            <FieldTitle
              hint="Подключение, ключ и адрес API, через которые выполняется эта задача."
              label="Провайдер"
            />
            <SearchableSelect
              ariaLabel="Провайдер"
              onValueChange={(value) => {
                if (value !== providerSettingId) setModel("");
                setProviderSettingId(value);
              }}
              options={[
                { label: "Не выбран", value: "" },
                ...providers.map((item) => ({
                  label: item.providerName,
                  value: String(item.id),
                })),
              ]}
              value={providerSettingId}
            />
          </label>
          <label className="field-label">
            <FieldTitle
              hint="Актуальные модели получены напрямую из API выбранного провайдера."
              label="Модель"
            />
            <SearchableSelect
              ariaLabel="Модель маршрута"
              disabled={!selectedProviderId || providerModels.isPending}
              emptyLabel="Нет подходящих моделей. Обновите список у провайдера."
              onValueChange={setModel}
              options={[
                ...(model && !relevantModels.some((item) => item.id === model)
                  ? [{ label: model, value: model }]
                  : []),
                ...relevantModels.map((item) => ({
                  keywords: `${item.id} ${item.capabilities.join(" ")}`,
                  label: `${item.label} · мощность ${modelPower(item)}`,
                  value: item.id,
                })),
              ]}
              searchPlaceholder="Найти актуальную модель"
              value={model}
            />
          </label>
          {hasReasoning ? (
            <label className="field-label">
              <FieldTitle
                hint="Глубина внутренних рассуждений модели. Высокие уровни обычно медленнее и дороже."
                label="Уровень рассуждений"
              />
              <SearchableSelect<AiReasoningEffort>
                ariaLabel="Уровень рассуждений"
                onValueChange={setReasoningEffort}
                options={reasoningEfforts.map((effort) => ({
                  label: reasoningEffortLabels[effort],
                  value: effort,
                }))}
                value={reasoningEffort}
              />
            </label>
          ) : null}
          {supportsGeneration && !hasReasoning ? (
            <label className="field-label">
              <FieldTitle
                hint="Степень вариативности ответа: 0 — стабильнее, 2 — разнообразнее. Пустое поле использует настройку провайдера."
                label="Вариативность"
              />
              <input
                max="2"
                min="0"
                onChange={(event) => setTemperature(event.target.value)}
                placeholder="По умолчанию"
                step="0.1"
                type="number"
                value={temperature}
              />
            </label>
          ) : null}
          {supportsGeneration ? (
            <label className="field-label">
              <FieldTitle
                hint="Жёсткий предел длины ответа. Пустое поле оставляет лимит модели по умолчанию."
                label="Максимум токенов ответа"
              />
              <input
                min="1"
                onChange={(event) => setMaxOutputTokens(event.target.value)}
                placeholder="По умолчанию"
                type="number"
                value={maxOutputTokens}
              />
            </label>
          ) : null}
          {supportsFallbacks ? (
            <label className="field-label field-label--wide">
              <FieldTitle
                hint="Модели вызываются по порядку, если основная временно недоступна."
                label="Резервные модели"
              />
              <input
                onChange={(event) => setFallbackModels(event.target.value)}
                placeholder="gpt-5.3, gpt-5.2"
                value={fallbackModels}
              />
            </label>
          ) : null}
          <div className="admin-ai-switch field-label--wide">
            <FieldTitle
              hint="Выключенный маршрут не используется приложением и интеграциями."
              label="Использовать маршрут"
            />
            <AppSwitch
              checked={enabled}
              label={`Включить ${role.label}`}
              onCheckedChange={setEnabled}
            />
          </div>
          <div className="settings-actions admin-ai-form__actions">
            <button
              className="button button--primary"
              disabled={action.isPending || !model || !providerSettingId}
              type="submit"
            >
              <BusyIcon busy={action.isPending} />
              Сохранить маршрут
            </button>
          </div>
        </form>
      </div>
    </details>
  );
}

function Routes({
  providers,
  routes,
}: {
  providers: AiProvider[];
  routes: AiModelRoute[];
}) {
  return (
    <section className="admin-ai-section" aria-labelledby="ai-routes-title">
      <div className="settings-subhead">
        <div>
          <strong id="ai-routes-title">Маршруты моделей</strong>
          <span>Отдельная модель и лимиты для каждой AI-задачи</span>
        </div>
        <Workflow aria-hidden="true" size={17} />
      </div>
      {modelRoles.map((role) => {
        const route = routes.find((item) => item.role === role.value);
        return (
          <RouteEditor
            key={`${role.value}-${route?.updatedAt ?? "new"}`}
            providers={providers}
            role={role}
            route={route}
          />
        );
      })}
    </section>
  );
}

function PromptDefinitionForm() {
  const action = useAdminAiAction();
  const [name, setName] = useState("");
  const [promptKey, setPromptKey] = useState("");
  const [description, setDescription] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const disclosure = event.currentTarget.closest("details");
    action.mutate(
      {
        run: () =>
          adminAiApi.createPrompt({
            description: description.trim() || null,
            name,
            promptKey,
            securityPolicyKey: "notes-ai-v1",
          }),
        success: "Промпт создан",
      },
      {
        onSuccess: () => {
          setName("");
          setPromptKey("");
          setDescription("");
          if (disclosure) disclosure.open = false;
        },
      },
    );
  }

  return (
    <form className="admin-ai-form" onSubmit={submit}>
      <label className="field-label">
        <FieldTitle
          hint="Понятное человеку имя сценария, например «Помощник по заметкам»."
          label="Название"
        />
        <input
          maxLength={160}
          onChange={(event) => setName(event.target.value)}
          required
          value={name}
        />
      </label>
      <label className="field-label">
        <FieldTitle
          hint="Стабильный технический идентификатор. После интеграции его не следует менять."
          label="Ключ"
        />
        <input
          maxLength={80}
          onChange={(event) => setPromptKey(event.target.value)}
          pattern="[a-z][a-z0-9._-]{2,79}"
          placeholder="notes.assistant"
          required
          value={promptKey}
        />
      </label>
      <label className="field-label field-label--wide">
        <FieldTitle
          hint="Кратко укажите назначение промпта и место его использования."
          label="Описание"
        />
        <input
          maxLength={2000}
          onChange={(event) => setDescription(event.target.value)}
          value={description}
        />
      </label>
      <label className="field-label field-label--wide">
        <FieldTitle
          hint="Серверная политика ограничивает доступ модели к данным и инструментам."
          label="Политика безопасности"
        />
        <input readOnly value="notes-ai-v1" />
      </label>
      <div className="settings-actions admin-ai-form__actions">
        <button
          className="button button--primary"
          disabled={action.isPending}
          type="submit"
        >
          <BusyIcon busy={action.isPending} fallback={Plus} />
          Создать промпт
        </button>
      </div>
    </form>
  );
}

function PromptVersionForm({ definitionId }: { definitionId: number }) {
  const action = useAdminAiAction();
  const [content, setContent] = useState("");
  const [changeSummary, setChangeSummary] = useState("");
  const [modelRole, setModelRole] = useState<AiPromptModelRole>("chat");
  const [reasoningEffort, setReasoningEffort] =
    useState<AiReasoningEffort>("none");
  const [retryLimit, setRetryLimit] = useState("0");
  const [toolAllowlist, setToolAllowlist] = useState("");
  const [inputSchema, setInputSchema] = useState("{}");
  const [outputSchema, setOutputSchema] = useState("{}");
  const [approvalPolicy, setApprovalPolicy] = useState("{}");
  const [stopConditions, setStopConditions] = useState("{}");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const disclosure = event.currentTarget.closest("details");
    try {
      const input = {
        approvalPolicy: parseJsonObject(
          approvalPolicy,
          "Политика подтверждений",
        ),
        changeSummary: changeSummary.trim() || null,
        content,
        inputSchema: parseJsonObject(inputSchema, "Входная схема"),
        modelRole,
        outputSchema: parseJsonObject(outputSchema, "Выходная схема"),
        reasoningEffort,
        retryLimit: Number(retryLimit),
        stopConditions: parseJsonObject(stopConditions, "Условия остановки"),
        toolAllowlist: list(toolAllowlist),
      };
      action.mutate(
        {
          run: () => adminAiApi.createVersion(definitionId, input),
          success: "Черновик версии создан",
        },
        {
          onSuccess: () => {
            setContent("");
            setChangeSummary("");
            if (disclosure) disclosure.open = false;
          },
        },
      );
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <form className="admin-ai-form admin-ai-form--prompt" onSubmit={submit}>
      <label className="field-label field-label--wide">
        <FieldTitle
          hint="Инструкция задаёт роль, ограничения, формат ответа и критерии завершения задачи."
          label="Системный промпт"
        />
        <textarea
          maxLength={200000}
          onChange={(event) => setContent(event.target.value)}
          required
          rows={8}
          placeholder="Ты помогаешь работать с заметками. Отвечай кратко, не раскрывай секреты и запрашивай подтверждение перед изменениями."
          value={content}
        />
      </label>
      <label className="field-label">
        <FieldTitle
          hint="Выбирает глобальный маршрут модели, через который выполняется промпт."
          label="Роль модели"
        />
        <SearchableSelect<AiPromptModelRole>
          ariaLabel="Роль модели"
          onValueChange={setModelRole}
          options={promptRoles}
          value={modelRole}
        />
      </label>
      <label className="field-label">
        <FieldTitle
          hint="Глубина рассуждений для моделей, которые поддерживают эту возможность."
          label="Уровень рассуждений"
        />
        <SearchableSelect<AiReasoningEffort>
          ariaLabel="Reasoning effort"
          onValueChange={setReasoningEffort}
          options={reasoningEfforts.map((effort) => ({
            label: reasoningEffortLabels[effort],
            value: effort,
          }))}
          value={reasoningEffort}
        />
      </label>
      <label className="field-label">
        <FieldTitle
          hint="Сколько раз сервер повторит запрос после временной ошибки провайдера."
          label="Повторные попытки"
        />
        <input
          max="5"
          min="0"
          onChange={(event) => setRetryLimit(event.target.value)}
          required
          type="number"
          value={retryLimit}
        />
      </label>
      <label className="field-label">
        <FieldTitle
          hint="Список серверных инструментов через запятую. Пустой список запрещает вызовы."
          label="Разрешённые инструменты"
        />
        <input
          onChange={(event) => setToolAllowlist(event.target.value)}
          placeholder="notes.read, notes.search"
          value={toolAllowlist}
        />
      </label>
      {[
        {
          hint: "Описывает допустимую структуру входных данных.",
          label: "Входная JSON Schema",
          setter: setInputSchema,
          value: inputSchema,
        },
        {
          hint: "Проверяет структуру ответа перед использованием приложением.",
          label: "Выходная JSON Schema",
          setter: setOutputSchema,
          value: outputSchema,
        },
        {
          hint: "Указывает действия, для которых обязательно подтверждение пользователя.",
          label: "Политика подтверждений",
          setter: setApprovalPolicy,
          value: approvalPolicy,
        },
        {
          hint: "Ограничивает цикл агента по условиям, ошибкам или числу шагов.",
          label: "Условия остановки",
          setter: setStopConditions,
          value: stopConditions,
        },
      ].map(({ hint, label, setter, value }) => (
        <label className="field-label" key={label}>
          <FieldTitle hint={hint} label={label} />
          <textarea
            className="admin-ai-json"
            onChange={(event) => setter(event.target.value)}
            rows={4}
            value={value}
          />
        </label>
      ))}
      <label className="field-label field-label--wide">
        <FieldTitle
          hint="Краткая запись для истории версий и проверки перед активацией."
          label="Что изменилось"
        />
        <input
          maxLength={1000}
          onChange={(event) => setChangeSummary(event.target.value)}
          value={changeSummary}
        />
      </label>
      <div className="settings-actions admin-ai-form__actions">
        <button
          className="button button--primary"
          disabled={action.isPending}
          type="submit"
        >
          <BusyIcon busy={action.isPending} fallback={Sparkles} />
          Создать черновик
        </button>
      </div>
    </form>
  );
}

function EvalCaseForm({ definitionId }: { definitionId: number }) {
  const action = useAdminAiAction();
  const [name, setName] = useState("");
  const [caseKey, setCaseKey] = useState("");
  const [input, setInput] = useState("{}");
  const [expected, setExpected] = useState("{}");
  const [minQuality, setMinQuality] = useState("0.8");
  const [maxLatencyMs, setMaxLatencyMs] = useState("30000");
  const [maxCostUsd, setMaxCostUsd] = useState("1");
  const [requireAuthorization, setRequireAuthorization] = useState(true);
  const [requireSchema, setRequireSchema] = useState(true);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const disclosure = event.currentTarget.closest("details");
    try {
      action.mutate(
        {
          run: () =>
            adminAiApi.createEvalCase(definitionId, {
              caseKey,
              expected: parseJsonObject(expected, "Ожидаемый результат"),
              input: parseJsonObject(input, "Вход eval"),
              name,
              thresholds: {
                maxCostUsd: Number(maxCostUsd),
                maxLatencyMs: Number(maxLatencyMs),
                minQuality: Number(minQuality),
                requireAuthorization,
                requireSchema,
              },
            }),
          success: "Eval-кейс сохранён новой ревизией",
        },
        {
          onSuccess: () => {
            setName("");
            setCaseKey("");
            if (disclosure) disclosure.open = false;
          },
        },
      );
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <form className="admin-ai-form" onSubmit={submit}>
      <label className="field-label">
        <FieldTitle
          hint="Понятное имя проверочного сценария, например «Создание краткого резюме»."
          label="Название"
        />
        <input
          maxLength={160}
          onChange={(event) => setName(event.target.value)}
          required
          value={name}
        />
      </label>
      <label className="field-label">
        <FieldTitle
          hint="Стабильный технический ключ eval-кейса для истории прогонов."
          label="Ключ кейса"
        />
        <input
          maxLength={80}
          onChange={(event) => setCaseKey(event.target.value)}
          pattern="[a-z][a-z0-9._-]{2,79}"
          required
          value={caseKey}
        />
      </label>
      <label className="field-label">
        <FieldTitle
          hint='Пример входа: {"note":"Текст заметки","task":"summary"}.'
          label="Вход · JSON"
        />
        <textarea
          className="admin-ai-json"
          onChange={(event) => setInput(event.target.value)}
          rows={5}
          value={input}
        />
      </label>
      <label className="field-label">
        <FieldTitle
          hint='Минимально ожидаемый результат, например {"contains":["итог"]}.'
          label="Ожидаемый результат · JSON"
        />
        <textarea
          className="admin-ai-json"
          onChange={(event) => setExpected(event.target.value)}
          rows={5}
          value={expected}
        />
      </label>
      <label className="field-label">
        <FieldTitle
          hint="Нижняя граница оценки от 0 до 1. Прогон ниже неё считается неуспешным."
          label="Минимальное качество"
        />
        <input
          max="1"
          min="0"
          onChange={(event) => setMinQuality(event.target.value)}
          required
          step="0.01"
          type="number"
          value={minQuality}
        />
      </label>
      <label className="field-label">
        <FieldTitle
          hint="Максимально допустимое время полного ответа модели в миллисекундах."
          label="Максимальная задержка, мс"
        />
        <input
          min="1"
          onChange={(event) => setMaxLatencyMs(event.target.value)}
          required
          type="number"
          value={maxLatencyMs}
        />
      </label>
      <label className="field-label">
        <FieldTitle
          hint="Предельная стоимость одного прогона по тарифам модели."
          label="Максимальная стоимость, USD"
        />
        <input
          min="0"
          onChange={(event) => setMaxCostUsd(event.target.value)}
          required
          step="0.0001"
          type="number"
          value={maxCostUsd}
        />
      </label>
      <div className="admin-ai-switch">
        <FieldTitle
          hint="Eval завершится ошибкой, если модель обошла требуемое подтверждение или доступ."
          label="Проверять авторизацию"
        />
        <AppSwitch
          checked={requireAuthorization}
          label="Проверять авторизацию"
          onCheckedChange={setRequireAuthorization}
        />
      </div>
      <div className="admin-ai-switch">
        <FieldTitle
          hint="Ответ должен соответствовать выходной JSON Schema версии промпта."
          label="Проверять схему"
        />
        <AppSwitch
          checked={requireSchema}
          label="Проверять схему"
          onCheckedChange={setRequireSchema}
        />
      </div>
      <div className="settings-actions admin-ai-form__actions">
        <button
          className="button button--primary"
          disabled={action.isPending}
          type="submit"
        >
          <BusyIcon busy={action.isPending} fallback={FlaskConical} />
          Сохранить кейс
        </button>
      </div>
    </form>
  );
}

interface EvalResultForm {
  authorizationPassed: boolean;
  costUsd: string;
  error: string;
  latencyMs: string;
  quality: string;
  schemaValid: boolean;
}

function EvalRunForm({
  definition,
  state,
}: {
  definition: PromptDefinition;
  state: PromptEvalState;
}) {
  const enabledCases = state.cases.filter((item) => item.enabled);
  const action = useAdminAiAction();
  const [version, setVersion] = useState(
    definition.versions[0]?.version.toString() ?? "",
  );
  const [evaluator, setEvaluator] = useState("manual-admin");
  const [results, setResults] = useState<Record<number, EvalResultForm>>(() =>
    Object.fromEntries(
      enabledCases.map((item) => [
        item.id,
        {
          authorizationPassed: false,
          costUsd: "",
          error: "",
          latencyMs: "",
          quality: "",
          schemaValid: false,
        },
      ]),
    ),
  );

  function update(caseId: number, patch: Partial<EvalResultForm>) {
    setResults((current) => ({
      ...current,
      [caseId]: { ...current[caseId]!, ...patch },
    }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    action.mutate({
      run: () =>
        adminAiApi.recordEvalRun(definition.id, Number(version), {
          evaluator,
          results: enabledCases.map((item) => ({
            authorizationPassed: results[item.id]!.authorizationPassed,
            caseId: item.id,
            costUsd: Number(results[item.id]!.costUsd),
            error: results[item.id]!.error.trim() || null,
            latencyMs: Number(results[item.id]!.latencyMs),
            quality: Number(results[item.id]!.quality),
            schemaValid: results[item.id]!.schemaValid,
          })),
        }),
      success: "Результат eval записан",
    });
  }

  if (definition.versions.length === 0 || enabledCases.length === 0)
    return null;
  return (
    <form className="admin-ai-eval-run" onSubmit={submit}>
      <div className="admin-ai-form admin-ai-form--compact">
        <label className="field-label">
          <FieldTitle
            hint="Версия промпта, которую проверяет этот прогон."
            label="Версия"
          />
          <SearchableSelect
            ariaLabel="Версия"
            onValueChange={setVersion}
            options={definition.versions.map((item) => ({
              label: `v${item.version} · ${item.status}`,
              value: String(item.version),
            }))}
            value={version}
          />
        </label>
        <label className="field-label">
          <FieldTitle
            hint="Имя автоматической системы или специалиста, который выставил оценки."
            label="Исполнитель eval"
          />
          <input
            maxLength={100}
            onChange={(event) => setEvaluator(event.target.value)}
            required
            value={evaluator}
          />
        </label>
      </div>
      <div className="admin-ai-eval-results">
        {enabledCases.map((item) => {
          const result = results[item.id]!;
          return (
            <fieldset key={item.id}>
              <legend>
                {item.name} · r{item.revision}
              </legend>
              <label className="field-label">
                <FieldTitle
                  hint="Оценка корректности ответа от 0 до 1."
                  label="Качество 0–1"
                />
                <input
                  max="1"
                  min="0"
                  onChange={(event) =>
                    update(item.id, { quality: event.target.value })
                  }
                  required
                  step="0.01"
                  type="number"
                  value={result.quality}
                />
              </label>
              <label className="field-label">
                <FieldTitle
                  hint="Измеренное время полного ответа."
                  label="Задержка, мс"
                />
                <input
                  min="0"
                  onChange={(event) =>
                    update(item.id, { latencyMs: event.target.value })
                  }
                  required
                  type="number"
                  value={result.latencyMs}
                />
              </label>
              <label className="field-label">
                <FieldTitle
                  hint="Фактическая стоимость токенов этого кейса."
                  label="Стоимость, USD"
                />
                <input
                  min="0"
                  onChange={(event) =>
                    update(item.id, { costUsd: event.target.value })
                  }
                  required
                  step="0.0001"
                  type="number"
                  value={result.costUsd}
                />
              </label>
              <label className="field-label field-label--wide">
                <FieldTitle
                  hint="Код или текст ошибки, если кейс не удалось выполнить."
                  label="Ошибка исполнителя"
                />
                <input
                  onChange={(event) =>
                    update(item.id, { error: event.target.value })
                  }
                  value={result.error}
                />
              </label>
              <div className="admin-ai-switch">
                <FieldTitle
                  hint="Все проверки доступа и подтверждения были соблюдены."
                  label="Авторизация пройдена"
                />
                <AppSwitch
                  checked={result.authorizationPassed}
                  label={`${item.name}: авторизация пройдена`}
                  onCheckedChange={(checked) =>
                    update(item.id, { authorizationPassed: checked })
                  }
                />
              </div>
              <div className="admin-ai-switch">
                <FieldTitle
                  hint="Ответ соответствует выходной JSON Schema."
                  label="Схема валидна"
                />
                <AppSwitch
                  checked={result.schemaValid}
                  label={`${item.name}: схема валидна`}
                  onCheckedChange={(checked) =>
                    update(item.id, { schemaValid: checked })
                  }
                />
              </div>
            </fieldset>
          );
        })}
      </div>
      <div className="settings-actions admin-ai-form__actions">
        <button
          className="button button--primary"
          disabled={action.isPending}
          type="submit"
        >
          <BusyIcon busy={action.isPending} fallback={FlaskConical} />
          Записать eval
        </button>
      </div>
    </form>
  );
}

function PromptPanel({ definition }: { definition: PromptDefinition }) {
  const [open, setOpen] = useState(false);
  const action = useAdminAiAction();
  const evals = useQuery({
    enabled: open,
    queryFn: () => adminAiApi.listEvalState(definition.id),
    queryKey: ["admin-ai-evals", definition.id],
  });

  function transition(version: number, target: "activate" | "review") {
    action.mutate({
      run: () =>
        target === "review"
          ? adminAiApi.reviewVersion(definition.id, version)
          : adminAiApi.activateVersion(definition.id, version),
      success:
        target === "review"
          ? `Версия v${version} отправлена на review`
          : `Версия v${version} активирована`,
    });
  }

  const active = definition.versions.find((item) => item.status === "active");
  return (
    <details
      className="admin-ai-disclosure admin-ai-prompt"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <span className="admin-ai-summary">
          <strong>{definition.name}</strong>
          <small>
            {definition.promptKey} · {definition.versions.length} версий
          </small>
        </span>
        <span className={active ? "status status--success" : "status"}>
          {active ? `Активна v${active.version}` : "Нет активной версии"}
        </span>
        <ChevronDown aria-hidden="true" size={15} />
      </summary>
      <div className="admin-ai-disclosure__body">
        {definition.description ? (
          <p className="admin-ai-description">{definition.description}</p>
        ) : null}
        <div
          className="admin-ai-versions"
          aria-label={`Версии ${definition.name}`}
        >
          {definition.versions.map((version) => (
            <div className="admin-ai-version" key={version.id}>
              <div>
                <strong>v{version.version}</strong>
                <span className={`status status--prompt-${version.status}`}>
                  {version.status}
                </span>
                <small>
                  {version.modelRole} · {version.reasoningEffort} ·{" "}
                  {formatDate(version.createdAt)}
                </small>
              </div>
              <div className="admin-ai-version__actions">
                {version.status === "draft" ? (
                  <button
                    className="button button--quiet"
                    disabled={action.isPending}
                    onClick={() => transition(version.version, "review")}
                    type="button"
                  >
                    На review
                  </button>
                ) : null}
                {version.status === "review" ? (
                  <button
                    className="button button--primary"
                    disabled={action.isPending}
                    onClick={() => transition(version.version, "activate")}
                    type="button"
                  >
                    Активировать
                  </button>
                ) : null}
              </div>
              <details className="admin-ai-version__content">
                <summary>Содержимое и ограничения</summary>
                <pre>{version.content}</pre>
                <dl>
                  <div>
                    <dt>Инструменты</dt>
                    <dd>{version.toolAllowlist.join(", ") || "нет"}</dd>
                  </div>
                  <div>
                    <dt>Повторы</dt>
                    <dd>{version.retryLimit}</dd>
                  </div>
                  <div>
                    <dt>Изменения</dt>
                    <dd>{version.changeSummary || "не указаны"}</dd>
                  </div>
                </dl>
              </details>
            </div>
          ))}
          {definition.versions.length === 0 ? (
            <div className="admin-feedback admin-feedback--empty">
              Версий пока нет
            </div>
          ) : null}
        </div>
        <details className="admin-ai-nested-disclosure">
          <summary>
            <Plus aria-hidden="true" size={15} />
            Новая версия
            <ChevronDown aria-hidden="true" size={14} />
          </summary>
          <PromptVersionForm definitionId={definition.id} />
        </details>
        <details className="admin-ai-nested-disclosure">
          <summary>
            <FlaskConical aria-hidden="true" size={15} />
            Eval-гейты
            <ChevronDown aria-hidden="true" size={14} />
          </summary>
          {evals.isPending ? (
            <div className="admin-feedback">
              <LoaderCircle className="is-spinning" size={17} />
              Загружаем eval-данные
            </div>
          ) : evals.error ? (
            <div className="admin-feedback admin-feedback--error" role="alert">
              {errorMessage(evals.error)}
            </div>
          ) : evals.data ? (
            <div className="admin-ai-evals">
              <div className="monitor-strip">
                <div>
                  <strong>
                    {evals.data.cases.filter((item) => item.enabled).length}
                  </strong>
                  <span>активных кейсов</span>
                </div>
                <div>
                  <strong>
                    {
                      evals.data.runs.filter((item) => item.status === "passed")
                        .length
                    }
                  </strong>
                  <span>успешных прогонов</span>
                </div>
                <div>
                  <strong>{evals.data.runs.length}</strong>
                  <span>всего прогонов</span>
                </div>
              </div>
              {evals.data.runs.slice(0, 5).map((run) => (
                <div className="admin-ai-run" key={run.id}>
                  <span
                    className={
                      run.status === "passed"
                        ? "status status--success"
                        : "status status--danger"
                    }
                  >
                    {run.status}
                  </span>
                  <strong>
                    v{run.version ?? "?"} · {run.evaluator}
                  </strong>
                  <time dateTime={run.completedAt}>
                    {formatDate(run.completedAt)}
                  </time>
                </div>
              ))}
              <details className="admin-ai-nested-disclosure">
                <summary>
                  <Plus aria-hidden="true" size={15} />
                  Новый eval-кейс
                  <ChevronDown aria-hidden="true" size={14} />
                </summary>
                <EvalCaseForm definitionId={definition.id} />
              </details>
              <EvalRunForm
                definition={definition}
                key={`${definition.versions.length}-${evals.data.cases
                  .filter((item) => item.enabled)
                  .map((item) => item.id)
                  .join("-")}`}
                state={evals.data}
              />
            </div>
          ) : null}
        </details>
      </div>
    </details>
  );
}

function Prompts({ prompts }: { prompts: PromptDefinition[] }) {
  return (
    <section className="admin-ai-section" aria-labelledby="ai-prompts-title">
      <div className="settings-subhead">
        <div>
          <strong id="ai-prompts-title">Промпты и eval</strong>
          <span>
            Версии проходят review и серверный eval-гейт перед активацией
          </span>
        </div>
        <Bot aria-hidden="true" size={17} />
      </div>
      <div className="admin-ai-guide">
        <CircleHelp aria-hidden="true" size={16} />
        <div>
          <strong>Как это работает</strong>
          <span>
            Промпт хранит версионную инструкцию. Eval запускает одинаковые
            примеры на новой версии и не даёт активировать её, если нарушены
            пороги качества, скорости, стоимости или доступа.
          </span>
          <small>
            Пример: вход «сделай резюме заметки» → ожидаемый структурированный
            ответ → проверка качества не ниже 0,8 и стоимости не выше $0,05.
          </small>
        </div>
      </div>
      {prompts.map((definition) => (
        <PromptPanel definition={definition} key={definition.id} />
      ))}
      {prompts.length === 0 ? (
        <div className="admin-feedback admin-feedback--empty">
          <Sparkles aria-hidden="true" size={18} />
          Создайте первый управляемый промпт
        </div>
      ) : null}
      <details className="admin-ai-disclosure admin-ai-create-prompt">
        <summary>
          <Plus aria-hidden="true" size={16} />
          Новый промпт
          <ChevronDown aria-hidden="true" size={15} />
        </summary>
        <div className="admin-ai-disclosure__body">
          <PromptDefinitionForm />
        </div>
      </details>
    </section>
  );
}

export function AdminAiSettings() {
  const configuration = useQuery({
    queryFn: async () => {
      const [providers, routes, prompts, usage] = await Promise.all([
        adminAiApi.listProviders(),
        adminAiApi.listModelRoutes(),
        adminAiApi.listPrompts(),
        adminAiApi.usageSummary(),
      ]);
      return { prompts, providers, routes, usage };
    },
    queryKey: ["admin-ai"],
  });

  if (configuration.isPending) {
    return (
      <div className="admin-feedback">
        <LoaderCircle className="is-spinning" size={18} />
        Загружаем AI-конфигурацию
      </div>
    );
  }
  if (configuration.error || !configuration.data) {
    return (
      <div className="admin-feedback admin-feedback--error" role="alert">
        <CircleAlert aria-hidden="true" size={18} />
        <span>{errorMessage(configuration.error)}</span>
        <button
          className="button button--quiet"
          onClick={() => void configuration.refetch()}
          type="button"
        >
          Повторить
        </button>
      </div>
    );
  }

  const { prompts, providers, routes, usage } = configuration.data;
  return (
    <div className="admin-ai">
      <div className="admin-refresh">
        <span>
          {configuration.isFetching
            ? "Обновляем конфигурацию"
            : "Данные из рабочего API"}
        </span>
        <button
          aria-label="Обновить AI-конфигурацию"
          className="icon-button"
          disabled={configuration.isFetching}
          onClick={() => void configuration.refetch()}
          type="button"
        >
          <RefreshCw
            aria-hidden="true"
            className={configuration.isFetching ? "is-spinning" : undefined}
            size={16}
          />
        </button>
      </div>
      <div className="monitor-strip monitor-strip--wide">
        <div>
          <strong>{providers.length}</strong>
          <span>провайдеров</span>
        </div>
        <div>
          <strong>{routes.filter((item) => item.enabled).length}</strong>
          <span>маршрутов включено</span>
        </div>
        <div>
          <strong>
            {formatInteger(usage.inputTokens + usage.outputTokens)}
          </strong>
          <span>токенов израсходовано</span>
        </div>
        <div>
          <strong>{formatMoney(usage.totalCostUsd)}</strong>
          <span>расходы AI</span>
        </div>
      </div>
      <p className="admin-ai-usage-note">
        <Coins aria-hidden="true" size={14} />
        {formatInteger(usage.requests)} запросов ·{" "}
        {formatInteger(usage.cachedInputTokens)} кэшированных токенов
      </p>
      <Providers providers={providers} />
      <Routes providers={providers} routes={routes} />
      <Prompts prompts={prompts} />
      <p className="admin-ai-footnote">
        <Check aria-hidden="true" size={14} />
        API-ключи, доступы инструментов и активация проверяются на сервере.
      </p>
    </div>
  );
}
