"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as Tabs from "@radix-ui/react-tabs";
import {
  type UseMutationResult,
  type UseQueryResult,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Bell,
  BellOff,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleUserRound,
  Coins,
  Copy,
  CreditCard,
  Crown,
  Database,
  Files,
  Fingerprint,
  KeyRound,
  Languages,
  Link2,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  NotebookPen,
  PackageCheck,
  Palette,
  RefreshCw,
  Save,
  SearchX,
  ShoppingCart,
  ServerCog,
  Settings2,
  ShieldCheck,
  Trash2,
  UsersRound,
  X,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  adminApi,
  type AdminAlertingState,
  type AdminAlertName,
  type AdminAuditItem,
  type AdminAuditScope,
  type AdminAuditSource,
  type AdminDiagnosticItem,
  type AdminDiagnosticSource,
  type AdminHistoryPage,
  type AdminPlan,
  type AdminPlanState,
  type AdminPlanUpdateInput,
  type AdminRetentionPolicy,
  type AdminRetentionState,
  type DataRetentionPolicyKey,
} from "./admin-api";
import { aiApi } from "./ai-api";
import { filesApi } from "./files-api";
import { notificationsApi } from "./notifications-api";
import {
  type PlanEntitlements,
  type SubscriptionOrder,
  type SubscriptionPlan,
  subscriptionsApi,
} from "./subscriptions-api";
import {
  AppIconButton,
  AppSwitch,
  AppTooltip,
  ConfirmDialog,
  SearchableSelect,
  TooltipText,
} from "./ui-controls";

export type ThemeMode = "dark" | "light" | "system";

const AdminAiSettings = dynamic(
  () => import("./admin-ai-settings").then((module) => module.AdminAiSettings),
  { ssr: false },
);

const IntegrationSettingsPanel = dynamic(
  () =>
    import("./integration-settings").then(
      (module) => module.IntegrationSettings,
    ),
  { ssr: false },
);

interface SettingsDialogProps {
  onOpenChange(open: boolean): void;
  onSectionChange(section: string): void;
  onSignOut(): Promise<void>;
  onThemeChange(theme: ThemeMode): void;
  onUserChanged(): Promise<void>;
  open: boolean;
  section: string;
  theme: ThemeMode;
  user: {
    backgroundMotion: boolean;
    email: string;
    editorBlockSpacing: number;
    editorContentWidth: number;
    editorPagePadding: number;
    language: "en" | "ru";
    name: string;
    panelOpacity: number;
    preferredAiModel: string | null;
    role: "admin" | "user";
    sessionCreatedAt: string;
    starfall: boolean;
    twoFactorEnabled: boolean;
    username: string;
  };
}

interface AuthSession {
  expiresAt: string;
  id: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

interface PasskeyRecord {
  createdAt: string;
  id: string;
  name: string | null;
}

interface TotpSetup {
  backupCodes: string[];
  totpURI: string;
}

class AuthRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AuthRequestError";
  }
}

function betterAuthError(error: {
  message?: string;
  status: number;
}): AuthRequestError {
  return new AuthRequestError(
    error.message || "Не удалось выполнить действие",
    error.status,
  );
}

function totpSecret(uri: string): string {
  try {
    return new URL(uri).searchParams.get("secret") ?? "";
  } catch {
    return "";
  }
}

async function authRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/auth/${path}`, {
    ...init,
    headers: {
      ...(init?.body === undefined
        ? {}
        : { "content-type": "application/json" }),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new AuthRequestError(
      body?.message || "Не удалось выполнить действие",
      response.status,
    );
  }
  return (await response.json()) as T;
}

interface SettingsSection {
  admin?: boolean;
  icon: LucideIcon;
  id: string;
  label: string;
}

const sections: SettingsSection[] = [
  { icon: CircleUserRound, id: "account", label: "Аккаунт" },
  { icon: CreditCard, id: "subscription", label: "Подписка" },
  { icon: Files, id: "files", label: "Файлы" },
  { icon: Bell, id: "notifications", label: "Уведомления" },
  { icon: ShieldCheck, id: "security", label: "Безопасность" },
  { icon: Palette, id: "appearance", label: "Оформление" },
  { icon: Bot, id: "ai", label: "AI" },
  { icon: Link2, id: "integrations", label: "Интеграции" },
  { admin: true, icon: UsersRound, id: "admin-users", label: "Пользователи" },
  {
    admin: true,
    icon: PackageCheck,
    id: "admin-plans",
    label: "Тарифы и квоты",
  },
  { admin: true, icon: Bot, id: "admin-ai", label: "Модели и промпты" },
  { admin: true, icon: ServerCog, id: "admin-system", label: "Инфраструктура" },
  { admin: true, icon: Activity, id: "admin-monitoring", label: "Мониторинг" },
];

function text(language: "en" | "ru", ru: string, en: string) {
  return language === "en" ? en : ru;
}

function SelectMenu({
  disabled = false,
  label,
  onChange,
  options,
  value,
}: {
  disabled?: boolean;
  label: string;
  onChange(value: string): void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <SearchableSelect
      align="end"
      ariaLabel={label}
      className="select-trigger"
      disabled={disabled}
      onValueChange={onChange}
      options={options}
      value={value}
    />
  );
}

function SettingRow({
  children,
  description,
  icon: Icon,
  label,
}: {
  children: React.ReactNode;
  description?: string;
  icon?: LucideIcon;
  label: string;
}) {
  return (
    <div className="setting-row">
      <div className="setting-row__identity">
        {Icon ? <Icon aria-hidden="true" size={17} /> : null}
        <div>
          <p>{label}</p>
          {description ? <span>{description}</span> : null}
        </div>
      </div>
      <div className="setting-row__control">{children}</div>
    </div>
  );
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toLocaleUpperCase("ru") || "U"
  );
}

function AccountSettings({
  onUserChanged,
  user,
}: Pick<SettingsDialogProps, "onUserChanged" | "user">) {
  const en = user.language === "en";
  const [language, setLanguage] = useState(user.language);
  const [name, setName] = useState(user.name);
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = name.trim();
    if (!normalizedName) return;
    setSaving(true);
    try {
      await authRequest("update-user", {
        body: JSON.stringify({ language, name: normalizedName }),
        method: "POST",
      });
      await onUserChanged();
      toast.success(en ? "Profile saved" : "Профиль сохранён");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Не удалось сохранить профиль",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <SettingsPage
      description={
        en ? "Profile and interface language" : "Профиль и язык интерфейса"
      }
      icon={CircleUserRound}
      title={en ? "Account" : "Аккаунт"}
    >
      <div className="profile-line">
        <div aria-hidden="true" className="avatar avatar--large">
          {initials(user.name)}
        </div>
        <div>
          <strong>{user.name}</strong>
          <span>
            {user.role === "admin"
              ? en
                ? "Administrator"
                : "Администратор"
              : en
                ? "User"
                : "Пользователь"}
          </span>
        </div>
      </div>
      <form className="settings-form settings-form--account" onSubmit={submit}>
        <div className="field-grid">
          <label className="field-label field-label--wide">
            <span>{en ? "Display name" : "Отображаемое имя"}</span>
            <input
              maxLength={160}
              name="name"
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
          </label>
          <label className="field-label field-label--wide">
            <span>Email</span>
            <input value={user.email} name="email" readOnly />
          </label>
        </div>
        <SettingRow icon={Languages} label={en ? "Language" : "Язык"}>
          <SelectMenu
            label={en ? "Interface language" : "Язык интерфейса"}
            onChange={(value) => setLanguage(value === "en" ? "en" : "ru")}
            options={[
              { label: en ? "Russian" : "Русский", value: "ru" },
              { label: "English", value: "en" },
            ]}
            value={language}
          />
        </SettingRow>
        <div className="settings-actions">
          <button
            className="button button--primary"
            disabled={saving || !name.trim()}
            type="submit"
          >
            {saving ? (
              <LoaderCircle
                aria-hidden="true"
                className="is-spinning"
                size={16}
              />
            ) : (
              <Check aria-hidden="true" size={16} />
            )}
            {en ? "Save" : "Сохранить"}
          </button>
        </div>
      </form>
    </SettingsPage>
  );
}

function formatBytes(value: number | null | undefined, language: "en" | "ru") {
  if (value === null || value === undefined) {
    return text(language, "Без лимита", "Unlimited");
  }
  if (value >= 1024 ** 3) {
    return `${Math.round(value / 1024 ** 3)} ${language === "en" ? "GB" : "ГБ"}`;
  }
  return `${Math.round(value / 1024 ** 2)} ${language === "en" ? "MB" : "МБ"}`;
}

function formatSubscriptionPrice(
  plan: SubscriptionPlan,
  term: number,
  language: "en" | "ru",
) {
  if (plan.priceCents === 0) return text(language, "Бесплатно", "Free");
  const discount = { 1: 0, 3: 3, 6: 6, 12: 9 }[term] ?? 0;
  const cents =
    plan.billingPeriod === "year"
      ? plan.priceCents
      : Math.round(plan.priceCents * term * (1 - discount / 100));
  return new Intl.NumberFormat(language === "en" ? "en-US" : "ru-RU", {
    currency: plan.currency.toUpperCase(),
    maximumFractionDigits: 0,
    style: "currency",
  }).format(cents / 100);
}

function subscriptionPlanCopy(
  plan: Pick<SubscriptionPlan, "description" | "name" | "slug">,
  language: "en" | "ru",
) {
  if (language === "en") {
    return { description: plan.description, name: plan.name };
  }

  const defaultNames: Record<string, string> = {
    "admin:Administrator": "Администратор",
    "free:Free": "Бесплатный",
    "pro:Pro": "Профессиональный",
  };
  const defaultDescriptions: Record<string, string> = {
    "AI assistant and expanded storage": "AI-помощник и расширенное хранилище",
    "Basic notes and limited storage":
      "Базовые заметки и ограниченное хранилище",
  };

  return {
    description: plan.description
      ? (defaultDescriptions[plan.description] ?? plan.description)
      : plan.description,
    name: defaultNames[`${plan.slug}:${plan.name}`] ?? plan.name,
  };
}

function SubscriptionPlanIcon({ size, slug }: { size: number; slug: string }) {
  if (slug === "free") return <NotebookPen aria-hidden="true" size={size} />;
  if (slug === "pro") return <Sparkles aria-hidden="true" size={size} />;
  if (slug === "admin") return <ShieldCheck aria-hidden="true" size={size} />;
  return <Crown aria-hidden="true" size={size} />;
}

function entitlementLines(value: PlanEntitlements, language: "en" | "ru") {
  const unlimited = text(language, "Без лимита", "Unlimited");
  return [
    {
      detail:
        value.workspace?.maxNotes == null
          ? unlimited
          : value.workspace.maxNotes.toLocaleString(
              language === "en" ? "en-US" : "ru-RU",
            ),
      enabled: value.workspace?.enabled !== false,
      label: text(language, "Заметки", "Notes"),
    },
    {
      detail:
        value.ai?.monthlyTokenLimit == null
          ? unlimited
          : `${value.ai.monthlyTokenLimit.toLocaleString(language === "en" ? "en-US" : "ru-RU")} ${text(language, "токенов", "tokens")}`,
      enabled: value.ai?.enabled !== false,
      label: "AI",
    },
    {
      detail: formatBytes(value.files?.storageLimitBytes, language),
      enabled: value.files?.enabled === true,
      label: text(language, "Файлы", "Files"),
    },
    {
      enabled: value.voice?.enabled !== false,
      label: text(language, "Голосовой ввод", "Voice input"),
    },
    {
      enabled: value.publicShare?.enabled !== false,
      label: text(language, "Публичные ссылки", "Public links"),
    },
    {
      enabled: value.versioning?.enabled !== false,
      label: text(language, "История версий", "Version history"),
    },
    {
      enabled: value.templates?.enabled !== false,
      label: text(language, "Шаблоны", "Templates"),
    },
    {
      enabled: value.exportImport?.enabled !== false,
      label: text(language, "Импорт и экспорт", "Import and export"),
    },
  ];
}

function SubscriptionSettings({ language }: { language: "en" | "ru" }) {
  const queryClient = useQueryClient();
  const [terms, setTerms] = useState<Record<number, number>>({});
  const [pendingOrder, setPendingOrder] = useState<SubscriptionOrder | null>(
    null,
  );
  const state = useQuery({
    queryFn: subscriptionsApi.state,
    queryKey: ["subscriptions"],
  });
  const checkout = useMutation({
    mutationFn: subscriptionsApi.checkout,
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : text(language, "Не удалось оформить подписку", "Checkout failed"),
      ),
    onSuccess: setPendingOrder,
  });
  const confirm = useMutation({
    mutationFn: subscriptionsApi.confirm,
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : text(
              language,
              "Не удалось подтвердить оплату",
              "Could not confirm payment",
            ),
      ),
    onSuccess: async () => {
      setPendingOrder(null);
      await queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      toast.success(
        text(language, "Подписка активирована", "Subscription activated"),
      );
    },
  });
  const current = state.data?.current;
  const currentPlanCopy = current
    ? subscriptionPlanCopy(
        { description: null, name: current.plan.name, slug: current.plan.slug },
        language,
      )
    : null;
  const pendingPlan = pendingOrder
    ? state.data?.plans.find((plan) => plan.id === pendingOrder.planId)
    : null;

  return (
    <SettingsPage
      description={text(
        language,
        "Текущий тариф, привилегии и покупка",
        "Current plan, benefits, and checkout",
      )}
      icon={CreditCard}
      title={text(language, "Подписка", "Subscription")}
    >
      {state.isPending ? (
        <div className="settings-loading">
          <LoaderCircle className="is-spinning" size={17} />
          {text(language, "Загружаем тарифы", "Loading plans")}
        </div>
      ) : null}
      {state.isError ? (
        <div className="admin-feedback admin-feedback--error">
          <AlertTriangle size={17} />
          {text(
            language,
            "Не удалось загрузить подписку",
            "Could not load subscription",
          )}
        </div>
      ) : null}
      {current ? (
        <section className="subscription-current">
          <div className="subscription-current__identity">
            <span className="subscription-current__icon">
              <SubscriptionPlanIcon size={21} slug={current.plan.slug} />
            </span>
            <div>
              <small>{text(language, "Ваш тариф", "Your plan")}</small>
              <strong>{currentPlanCopy?.name}</strong>
              <p>
                {current.expiresAt
                  ? `${text(language, "Действует до", "Valid until")} ${new Intl.DateTimeFormat(language === "en" ? "en-US" : "ru-RU").format(new Date(current.expiresAt))}`
                  : text(
                      language,
                      "Без ограничения по сроку",
                      "No expiration date",
                    )}
              </p>
            </div>
          </div>
          <ul className="subscription-benefits">
            {entitlementLines(current.entitlements, language).map((item) => (
              <li
                className={item.enabled ? "is-enabled" : "is-disabled"}
                key={item.label}
              >
                {item.enabled ? (
                  <Check aria-hidden="true" size={14} />
                ) : (
                  <X aria-hidden="true" size={14} />
                )}
                <span>
                  {item.label}
                  {item.detail ? <small>{item.detail}</small> : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {state.data ? (
        <div className="subscription-plans">
          {state.data.plans.map((plan) => {
            const planCopy = subscriptionPlanCopy(plan, language);
            const term =
              plan.billingPeriod === "year" ? 12 : (terms[plan.id] ?? 1);
            const currentPlan = current?.plan.id === plan.id;
            const purchasable =
              plan.slug !== "free" && plan.billingPeriod !== "lifetime";
            return (
              <article
                className={`subscription-plan ${currentPlan ? "is-current" : ""}`}
                data-tone={plan.slug === "free" ? "free" : "paid"}
                key={plan.id}
              >
                <header>
                  <div className="subscription-plan__heading">
                    <span className="subscription-plan__icon">
                      <SubscriptionPlanIcon size={19} slug={plan.slug} />
                    </span>
                    <div>
                      <strong>{planCopy.name}</strong>
                      <span>
                        {planCopy.description ||
                          text(language, "Тариф Notes AI", "Notes AI plan")}
                      </span>
                    </div>
                  </div>
                  {currentPlan ? (
                    <span className="status status--success">
                      <CheckCircle2 size={13} />
                      {text(language, "Текущий", "Current")}
                    </span>
                  ) : null}
                </header>
                <ul>
                  {entitlementLines(plan.entitlements, language)
                    .filter((item) => item.enabled)
                    .slice(0, 5)
                    .map((item) => (
                      <li key={item.label}>
                        <Check size={13} />
                        <span>{item.label}</span>
                        {item.detail ? <small>{item.detail}</small> : null}
                      </li>
                    ))}
                </ul>
                <footer>
                  <div>
                    <strong>
                      {formatSubscriptionPrice(plan, term, language)}
                    </strong>
                    <small>
                      {plan.billingPeriod === "lifetime"
                        ? text(language, "Навсегда", "Lifetime")
                        : term === 12
                          ? text(language, "За год", "Per year")
                          : `${text(language, "За", "For")} ${term} ${text(language, "мес.", "mo.")}`}
                    </small>
                  </div>
                  {purchasable ? (
                    <div className="subscription-plan__actions">
                      {plan.billingPeriod === "month" ? (
                        <SelectMenu
                          label={text(
                            language,
                            "Срок подписки",
                            "Subscription term",
                          )}
                          onChange={(value) =>
                            setTerms((currentTerms) => ({
                              ...currentTerms,
                              [plan.id]: Number(value),
                            }))
                          }
                          options={[1, 3, 6, 12].map((value) => ({
                            label: `${value} ${text(language, "мес.", "mo.")}`,
                            value: String(value),
                          }))}
                          value={String(term)}
                        />
                      ) : null}
                      <button
                        className="button button--primary"
                        disabled={
                          checkout.isPending || !state.data.checkoutAvailable
                        }
                        onClick={() =>
                          checkout.mutate({
                            mode: currentPlan ? "renew" : "purchase",
                            planId: plan.id,
                            termMonths: term,
                          })
                        }
                        type="button"
                      >
                        <ShoppingCart size={15} />
                        {!state.data.checkoutAvailable
                          ? text(
                              language,
                              "Оплата недоступна",
                              "Checkout unavailable",
                            )
                          : currentPlan
                            ? text(language, "Продлить", "Renew")
                            : text(language, "Купить", "Buy")}
                      </button>
                    </div>
                  ) : null}
                </footer>
              </article>
            );
          })}
        </div>
      ) : null}
      {pendingOrder && pendingPlan ? (
        <div className="subscription-checkout" role="status">
          <div>
            <strong>
              {text(
                language,
                "Заказ готов к оплате",
                "Order ready for payment",
              )}
            </strong>
            <span>
              {formatSubscriptionPrice(
                pendingPlan,
                pendingOrder.termMonths,
                language,
              )}
              {pendingOrder.discountPercent > 0
                ? ` · −${pendingOrder.discountPercent}%`
                : ""}
            </span>
            <small>
              {text(
                language,
                "Тестовый платёж активирует тариф только после подтверждения.",
                "The test payment activates the plan only after confirmation.",
              )}
            </small>
          </div>
          <button
            className="button button--primary"
            disabled={confirm.isPending}
            onClick={() => confirm.mutate(pendingOrder.id)}
            type="button"
          >
            <CheckCircle2 size={15} />
            {text(language, "Подтвердить оплату", "Confirm payment")}
          </button>
        </div>
      ) : null}
    </SettingsPage>
  );
}

function FileSettings({ language }: { language: "en" | "ru" }) {
  const usage = useQuery({
    queryFn: filesApi.getUsage,
    queryKey: ["files", "usage"],
  });
  const usedBytes = usage.data
    ? usage.data.usedBytes + usage.data.reservedBytes
    : 0;
  const percent = usage.data?.limitBytes
    ? Math.min(100, (usedBytes / usage.data.limitBytes) * 100)
    : 0;

  return (
    <SettingsPage
      description={text(
        language,
        "Фактическое использование и лимит хранилища",
        "Actual storage usage and quota",
      )}
      icon={Files}
      title={text(language, "Файлы", "Files")}
    >
      {usage.isPending ? (
        <div className="settings-loading">
          <LoaderCircle className="is-spinning" size={17} />
          {text(language, "Загружаем данные", "Loading usage")}
        </div>
      ) : null}
      {usage.isError ? (
        <div className="admin-feedback admin-feedback--error">
          <AlertTriangle size={17} />
          {text(
            language,
            "Не удалось загрузить использование хранилища",
            "Could not load storage usage",
          )}
          <button onClick={() => void usage.refetch()} type="button">
            {text(language, "Повторить", "Retry")}
          </button>
        </div>
      ) : null}
      {usage.data ? (
        <>
          <div className="storage-meter" data-testid="file-settings-usage">
            <div>
              <strong>{formatBytes(usedBytes, language)}</strong>
              <span>
                {text(language, "из", "of")}{" "}
                {formatBytes(usage.data.limitBytes, language)}
              </span>
            </div>
            {usage.data.limitBytes ? (
              <progress
                aria-label={text(
                  language,
                  "Использование хранилища",
                  "Storage usage",
                )}
                max={100}
                value={percent}
              />
            ) : null}
          </div>
          <SettingRow
            description={text(
              language,
              "Готовые файлы аккаунта",
              "Ready account files",
            )}
            icon={Database}
            label={text(language, "Занято", "Used")}
          >
            <strong>{formatBytes(usage.data.usedBytes, language)}</strong>
          </SettingRow>
          <SettingRow
            description={text(
              language,
              "Незавершённые загрузки временно резервируют место",
              "Incomplete uploads temporarily reserve space",
            )}
            icon={LoaderCircle}
            label={text(language, "Зарезервировано", "Reserved")}
          >
            <strong>{formatBytes(usage.data.reservedBytes, language)}</strong>
          </SettingRow>
          <SettingRow
            description={text(
              language,
              "Определяется текущим тарифом",
              "Defined by the current plan",
            )}
            icon={Crown}
            label={text(language, "Лимит", "Quota")}
          >
            <strong>{formatBytes(usage.data.limitBytes, language)}</strong>
          </SettingRow>
        </>
      ) : null}
    </SettingsPage>
  );
}

function NotificationSettings({ language }: { language: "en" | "ru" }) {
  const queryClient = useQueryClient();
  const preferences = useQuery({
    queryFn: notificationsApi.preferences,
    queryKey: ["notifications", "preferences"],
  });
  const update = useMutation({
    mutationFn: notificationsApi.updatePreferences,
    onError: () =>
      toast.error(
        text(
          language,
          "Не удалось сохранить настройки уведомлений",
          "Could not save notification settings",
        ),
      ),
    onSuccess: (value) => {
      queryClient.setQueryData(["notifications", "preferences"], value);
      toast.success(
        text(language, "Настройки сохранены", "Notification settings saved"),
      );
    },
  });

  return (
    <SettingsPage
      description={text(
        language,
        "События, которые сохраняются в центре уведомлений",
        "Events saved in the notification center",
      )}
      icon={Bell}
      title={text(language, "Уведомления", "Notifications")}
    >
      {preferences.isPending ? (
        <div className="settings-loading">
          <LoaderCircle className="is-spinning" size={17} />
          {text(language, "Загружаем настройки", "Loading settings")}
        </div>
      ) : null}
      {preferences.isError ? (
        <div className="admin-feedback admin-feedback--error">
          <AlertTriangle size={17} />
          {text(
            language,
            "Не удалось загрузить настройки уведомлений",
            "Could not load notification settings",
          )}
          <button onClick={() => void preferences.refetch()} type="button">
            {text(language, "Повторить", "Retry")}
          </button>
        </div>
      ) : null}
      {preferences.data ? (
        <SettingRow
          description={text(
            language,
            "Покупка и продление тарифа появятся под колокольчиком",
            "Plan purchases and renewals appear under the bell",
          )}
          icon={CreditCard}
          label={text(language, "События подписки", "Subscription events")}
        >
          <AppSwitch
            checked={preferences.data.subscriptionEvents}
            disabled={update.isPending}
            label={text(
              language,
              "Сохранять события подписки",
              "Save subscription events",
            )}
            onCheckedChange={(subscriptionEvents) =>
              update.mutate({ subscriptionEvents })
            }
          />
        </SettingRow>
      ) : null}
    </SettingsPage>
  );
}

function SecuritySettings({
  onUserChanged,
  user,
}: Pick<SettingsDialogProps, "onUserChanged" | "user">) {
  const queryClient = useQueryClient();
  const [reauthenticated, setReauthenticated] = useState(false);
  const [passkeyName, setPasskeyName] = useState("");
  const [passkeyToDelete, setPasskeyToDelete] = useState<string | null>(null);
  const [totpSetup, setTotpSetup] = useState<TotpSetup | null>(null);
  const [openedAt] = useState(Date.now);
  const createdAt = new Date(user.sessionCreatedAt).getTime();
  const sessionAgeRequiresReauth =
    !reauthenticated &&
    (!Number.isFinite(createdAt) || openedAt - createdAt >= 240_000);
  const sessions = useQuery({
    enabled: !sessionAgeRequiresReauth,
    queryFn: () => authRequest<AuthSession[]>("list-sessions"),
    queryKey: ["auth", "sessions"],
    retry: (failureCount, error) =>
      !(error instanceof AuthRequestError && error.status === 403) &&
      failureCount < 2,
  });
  const passkeys = useQuery({
    enabled: !sessionAgeRequiresReauth,
    queryFn: () => authRequest<PasskeyRecord[]>("passkey/list-user-passkeys"),
    queryKey: ["auth", "passkeys"],
    retry: (failureCount, error) =>
      !(error instanceof AuthRequestError && error.status === 403) &&
      failureCount < 2,
  });
  const sensitiveRequestWasRejected = [sessions.error, passkeys.error].some(
    (error) => error instanceof AuthRequestError && error.status === 403,
  );
  const reauthRequired =
    !reauthenticated &&
    (sessionAgeRequiresReauth || sensitiveRequestWasRejected);
  const requireReauthentication = (error: Error) => {
    if (error instanceof AuthRequestError && error.status === 403) {
      setReauthenticated(false);
      toast.error("Подтвердите пароль для продолжения");
      return;
    }
    toast.error(error.message);
  };
  const reauthenticate = useMutation({
    mutationFn: (password: string) =>
      authRequest("sign-in/username", {
        body: JSON.stringify({ password, username: user.username }),
        method: "POST",
      }),
    onError: (error: Error) => toast.error(error.message),
    onSuccess: async () => {
      await onUserChanged();
      setReauthenticated(true);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["auth", "sessions"] }),
        queryClient.invalidateQueries({ queryKey: ["auth", "passkeys"] }),
      ]);
      toast.success("Вход подтверждён");
    },
  });
  const revokeOthers = useMutation({
    mutationFn: () =>
      authRequest<{ status: boolean }>("revoke-other-sessions", {
        body: JSON.stringify({}),
        method: "POST",
      }),
    onError: requireReauthentication,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["auth", "sessions"] });
      toast.success("Другие сессии завершены");
    },
  });
  const password = useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      authRequest("change-password", {
        body: JSON.stringify({ ...input, revokeOtherSessions: true }),
        method: "POST",
      }),
    onError: requireReauthentication,
    onSuccess: () => toast.success("Пароль изменён"),
  });
  const enableTotp = useMutation({
    mutationFn: async (currentPassword: string) => {
      const { securityAuthClient } = await import("./security-auth-client");
      const result = await securityAuthClient.twoFactor.enable({
        password: currentPassword,
      });
      if (result.error) throw betterAuthError(result.error);
      return result.data;
    },
    onError: requireReauthentication,
    onSuccess: async (setup) => {
      setTotpSetup(setup);
      await onUserChanged();
      toast.success("Двухфакторная защита включена");
    },
  });
  const verifyTotp = useMutation({
    mutationFn: async (code: string) => {
      const { securityAuthClient } = await import("./security-auth-client");
      const result = await securityAuthClient.twoFactor.verifyTotp({
        code,
        trustDevice: true,
      });
      if (result.error) throw betterAuthError(result.error);
      return result.data;
    },
    onError: requireReauthentication,
    onSuccess: async () => {
      setTotpSetup(null);
      await onUserChanged();
      toast.success("Код подтверждён");
    },
  });
  const disableTotp = useMutation({
    mutationFn: async (currentPassword: string) => {
      const { securityAuthClient } = await import("./security-auth-client");
      const result = await securityAuthClient.twoFactor.disable({
        password: currentPassword,
      });
      if (result.error) throw betterAuthError(result.error);
      return result.data;
    },
    onError: requireReauthentication,
    onSuccess: async () => {
      setTotpSetup(null);
      await onUserChanged();
      toast.success("Двухфакторная защита отключена");
    },
  });
  const addPasskey = useMutation({
    mutationFn: async () => {
      const { securityAuthClient } = await import("./security-auth-client");
      const result = await securityAuthClient.passkey.addPasskey({
        name: passkeyName.trim() || undefined,
      });
      if (result.error) throw betterAuthError(result.error);
      return result.data;
    },
    onError: requireReauthentication,
    onSuccess: async () => {
      setPasskeyName("");
      await queryClient.invalidateQueries({ queryKey: ["auth", "passkeys"] });
      toast.success("Ключ доступа добавлен");
    },
  });
  const deletePasskey = useMutation({
    mutationFn: (id: string) =>
      authRequest<{ status: boolean }>("passkey/delete-passkey", {
        body: JSON.stringify({ id }),
        method: "POST",
      }),
    onError: requireReauthentication,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["auth", "passkeys"] });
      toast.success("Ключ доступа удалён");
    },
  });
  const changePassword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    password.mutate(
      {
        currentPassword: String(data.get("currentPassword") ?? ""),
        newPassword: String(data.get("newPassword") ?? ""),
      },
      { onSuccess: () => form.reset() },
    );
  };
  const changeTotp = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const currentPassword = String(
      new FormData(form).get("currentPassword") ?? "",
    );
    if (user.twoFactorEnabled) {
      disableTotp.mutate(currentPassword, { onSuccess: () => form.reset() });
    } else {
      enableTotp.mutate(currentPassword, { onSuccess: () => form.reset() });
    }
  };
  const confirmTotp = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const code = String(new FormData(form).get("code") ?? "").replace(
      /\s/g,
      "",
    );
    verifyTotp.mutate(code, { onSuccess: () => form.reset() });
  };
  const confirmIdentity = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const password = String(new FormData(form).get("password") ?? "");
    reauthenticate.mutate(password, { onSuccess: () => form.reset() });
  };
  return (
    <SettingsPage
      description="Пароль, сессии и способы входа"
      icon={ShieldCheck}
      title="Безопасность"
    >
      <SettingRow
        description="Включена"
        icon={LockKeyhole}
        label="Проверка email"
      >
        <span className="status status--success">
          <Check size={13} /> Подтверждён
        </span>
      </SettingRow>
      {reauthRequired ? (
        <form className="security-reauth" onSubmit={confirmIdentity}>
          <div>
            <strong>Подтвердите вход</strong>
            <span>
              Для управления паролем и сессиями повторно введите текущий пароль.
            </span>
          </div>
          <label className="field-label">
            <span>Текущий пароль</span>
            <input
              autoComplete="current-password"
              name="password"
              required
              type="password"
            />
          </label>
          <button
            className="button button--primary"
            disabled={reauthenticate.isPending || !user.username}
            type="submit"
          >
            <KeyRound aria-hidden="true" size={15} />
            Подтвердить
          </button>
        </form>
      ) : (
        <>
          <form className="security-password" onSubmit={changePassword}>
            <label className="field-label">
              <span>Текущий пароль</span>
              <input
                autoComplete="current-password"
                name="currentPassword"
                required
                type="password"
              />
            </label>
            <label className="field-label">
              <span>Новый пароль</span>
              <input
                autoComplete="new-password"
                minLength={12}
                name="newPassword"
                required
                type="password"
              />
            </label>
            <button
              className="button button--quiet"
              disabled={password.isPending}
              type="submit"
            >
              <KeyRound aria-hidden="true" size={15} />
              Изменить пароль
            </button>
          </form>
          <div className="settings-subhead">
            <div>
              <strong>Способы входа</strong>
              <span>TOTP и ключи доступа хранятся в защищённом контуре</span>
            </div>
          </div>
          <div className="security-methods">
            <section className="security-method">
              <header>
                <span className="settings-page__icon">
                  <ShieldCheck aria-hidden="true" size={17} />
                </span>
                <div>
                  <strong>Приложение-аутентификатор</strong>
                  <span>Одноразовый код TOTP при каждом новом входе</span>
                </div>
                <span
                  className={
                    user.twoFactorEnabled ? "status status--success" : "status"
                  }
                >
                  {user.twoFactorEnabled ? "Включено" : "Выключено"}
                </span>
              </header>
              {totpSetup ? (
                <div className="totp-setup" data-testid="totp-setup">
                  <p>
                    Добавьте секрет в приложение-аутентификатор и подтвердите
                    первый код. Резервные коды показываются только сейчас.
                  </p>
                  <div className="totp-secret">
                    <code>{totpSecret(totpSetup.totpURI)}</code>
                    <AppIconButton
                      label="Скопировать секрет TOTP"
                      onClick={() =>
                        void navigator.clipboard
                          .writeText(totpSecret(totpSetup.totpURI))
                          .then(() => toast.success("Секрет скопирован"))
                      }
                    >
                      <Copy aria-hidden="true" size={15} />
                    </AppIconButton>
                  </div>
                  <div className="backup-codes">
                    {totpSetup.backupCodes.map((code) => (
                      <code key={code}>{code}</code>
                    ))}
                  </div>
                  <button
                    className="button button--quiet"
                    onClick={() =>
                      void navigator.clipboard
                        .writeText(totpSetup.backupCodes.join("\n"))
                        .then(() => toast.success("Резервные коды скопированы"))
                    }
                    type="button"
                  >
                    <Copy aria-hidden="true" size={15} />
                    Скопировать резервные коды
                  </button>
                  <form
                    className="security-method__form"
                    onSubmit={confirmTotp}
                  >
                    <label className="field-label">
                      <span>Код из приложения</span>
                      <input
                        autoComplete="one-time-code"
                        inputMode="numeric"
                        maxLength={8}
                        name="code"
                        pattern="[0-9]{6,8}"
                        required
                      />
                    </label>
                    <button
                      className="button button--primary"
                      disabled={verifyTotp.isPending}
                      type="submit"
                    >
                      <Check aria-hidden="true" size={15} />
                      Подтвердить код
                    </button>
                  </form>
                </div>
              ) : (
                <form className="security-method__form" onSubmit={changeTotp}>
                  <label className="field-label">
                    <span>Текущий пароль</span>
                    <input
                      autoComplete="current-password"
                      name="currentPassword"
                      required
                      type="password"
                    />
                  </label>
                  <button
                    className={
                      user.twoFactorEnabled
                        ? "button button--danger"
                        : "button button--quiet"
                    }
                    disabled={enableTotp.isPending || disableTotp.isPending}
                    type="submit"
                  >
                    <ShieldCheck aria-hidden="true" size={15} />
                    {user.twoFactorEnabled ? "Отключить TOTP" : "Включить TOTP"}
                  </button>
                </form>
              )}
            </section>
            <section className="security-method">
              <header>
                <span className="settings-page__icon">
                  <Fingerprint aria-hidden="true" size={17} />
                </span>
                <div>
                  <strong>Ключи доступа</strong>
                  <span>Windows Hello, Touch ID или аппаратный ключ</span>
                </div>
                <span className="status">{passkeys.data?.length ?? 0}</span>
              </header>
              <form
                className="security-method__form"
                onSubmit={(event) => {
                  event.preventDefault();
                  addPasskey.mutate();
                }}
              >
                <label className="field-label">
                  <span>Название ключа</span>
                  <input
                    autoComplete="off"
                    maxLength={80}
                    onChange={(event) => setPasskeyName(event.target.value)}
                    placeholder="Например, рабочий ноутбук"
                    value={passkeyName}
                  />
                </label>
                <button
                  className="button button--quiet"
                  disabled={
                    addPasskey.isPending ||
                    typeof PublicKeyCredential === "undefined"
                  }
                  type="submit"
                >
                  <Fingerprint aria-hidden="true" size={15} />
                  Добавить ключ
                </button>
              </form>
              <div className="passkey-list">
                {passkeys.data?.map((passkey) => (
                  <div key={passkey.id}>
                    <span>
                      <strong>{passkey.name || "Ключ доступа"}</strong>
                      <small>
                        {new Intl.DateTimeFormat("ru").format(
                          new Date(passkey.createdAt),
                        )}
                      </small>
                    </span>
                    <AppIconButton
                      label={`Удалить ${passkey.name || "ключ доступа"}`}
                      onClick={() => setPasskeyToDelete(passkey.id)}
                    >
                      <Trash2 aria-hidden="true" size={15} />
                    </AppIconButton>
                  </div>
                ))}
                {passkeys.isPending ? (
                  <span className="settings-loading">Загрузка ключей…</span>
                ) : null}
                {passkeys.isError ? (
                  <span className="settings-feedback settings-feedback--error">
                    Не удалось загрузить ключи доступа
                  </span>
                ) : null}
              </div>
            </section>
          </div>
          <div className="settings-subhead">
            <div>
              <strong>Активные сессии</strong>
              <span>{sessions.data?.length ?? 0} устройств</span>
            </div>
            <button
              className="button button--danger"
              disabled={
                revokeOthers.isPending || (sessions.data?.length ?? 0) < 2
              }
              onClick={() => revokeOthers.mutate()}
              type="button"
            >
              Завершить другие
            </button>
          </div>
          <div className="session-list">
            {sessions.data?.map((session) => (
              <div key={session.id}>
                <span className="session-device">
                  {session.userAgent || "Неизвестное устройство"}
                </span>
                <span>{session.ipAddress || "IP не определён"}</span>
              </div>
            ))}
            {sessions.isPending ? (
              <span className="settings-loading">Загрузка сессий…</span>
            ) : null}
            {sessions.isError ? (
              <span className="settings-feedback settings-feedback--error">
                Не удалось загрузить активные сессии
              </span>
            ) : null}
          </div>
          <ConfirmDialog
            confirmLabel="Удалить"
            description="Этот ключ больше нельзя будет использовать для входа."
            onConfirm={() => {
              if (passkeyToDelete) deletePasskey.mutate(passkeyToDelete);
              setPasskeyToDelete(null);
            }}
            onOpenChange={(open) => {
              if (!open) setPasskeyToDelete(null);
            }}
            open={passkeyToDelete !== null}
            title="Удалить ключ доступа?"
          />
        </>
      )}
    </SettingsPage>
  );
}

function AppearanceSettings({
  onUserChanged,
  onThemeChange,
  theme,
  user,
}: Pick<
  SettingsDialogProps,
  "onThemeChange" | "onUserChanged" | "theme" | "user"
>) {
  const [saving, setSaving] = useState(false);
  const [backgroundMotion, setBackgroundMotion] = useState(
    user.backgroundMotion,
  );
  const [blockSpacing, setBlockSpacing] = useState(user.editorBlockSpacing);
  const [contentWidth, setContentWidth] = useState(user.editorContentWidth);
  const [pagePadding, setPagePadding] = useState(user.editorPagePadding);
  const [panelOpacity, setPanelOpacity] = useState(user.panelOpacity);
  const [starfall, setStarfall] = useState(user.starfall);
  useEffect(() => {
    const root = document.documentElement;
    const applyOpacity = (value: number) => {
      const opacity = Math.min(100, Math.max(35, value)) / 100;
      root.style.setProperty("--panel-opacity", String(opacity));
      root.style.setProperty(
        "--panel-strong-opacity",
        String(Math.min(1, opacity + 0.06)),
      );
    };

    applyOpacity(panelOpacity);
    return () => applyOpacity(user.panelOpacity);
  }, [panelOpacity, user.panelOpacity]);
  const changeTheme = async (mode: ThemeMode) => {
    const previous = theme;
    onThemeChange(mode);
    setSaving(true);
    try {
      await authRequest("update-user", {
        body: JSON.stringify({ theme: mode }),
        method: "POST",
      });
      await onUserChanged();
      toast.success("Тема сохранена");
    } catch (error) {
      onThemeChange(previous);
      toast.error(
        error instanceof Error ? error.message : "Не удалось сохранить тему",
      );
    } finally {
      setSaving(false);
    }
  };
  const savePreferences = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      await authRequest("update-user", {
        body: JSON.stringify({
          backgroundMotion,
          editorBlockSpacing: blockSpacing,
          editorContentWidth: contentWidth,
          editorPagePadding: pagePadding,
          panelOpacity,
          starfall,
        }),
        method: "POST",
      });
      await onUserChanged();
      toast.success("Настройки рабочего пространства сохранены");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Не удалось сохранить настройки оформления",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <SettingsPage
      description="Тема, фон и движение"
      icon={Palette}
      title="Оформление"
    >
      <fieldset className="theme-picker">
        <legend>Тема</legend>
        {(["dark", "light", "system"] as ThemeMode[]).map((mode) => (
          <label key={mode}>
            <input
              checked={theme === mode}
              disabled={saving}
              name="theme"
              onChange={() => void changeTheme(mode)}
              type="radio"
            />
            <span className={`theme-swatch theme-swatch--${mode}`} />
            <span>
              {mode === "dark"
                ? "Тёмная"
                : mode === "light"
                  ? "Светлая"
                  : "Системная"}
            </span>
          </label>
        ))}
      </fieldset>
      <form className="appearance-preferences" onSubmit={savePreferences}>
        <div className="settings-subhead">
          <div>
            <strong>Поверхности и фон</strong>
            <span>Прозрачность и динамика рабочего пространства</span>
          </div>
        </div>
        <SettingRow
          description={`${panelOpacity}%`}
          icon={Palette}
          label="Прозрачность блоков"
        >
          <input
            aria-label="Прозрачность блоков"
            max="100"
            min="35"
            onChange={(event) => setPanelOpacity(Number(event.target.value))}
            type="range"
            value={panelOpacity}
          />
        </SettingRow>
        <SettingRow icon={Activity} label="Фоновые анимации">
          <AppSwitch
            checked={backgroundMotion}
            label="Фоновые анимации"
            onCheckedChange={setBackgroundMotion}
          />
        </SettingRow>
        <SettingRow icon={Activity} label="Звездопад">
          <AppSwitch
            checked={starfall}
            disabled={!backgroundMotion}
            label="Звездопад"
            onCheckedChange={setStarfall}
          />
        </SettingRow>
        <div className="settings-subhead">
          <div>
            <strong>Редактор</strong>
            <span>Ширина текста и компактность заметки</span>
          </div>
        </div>
        <SettingRow
          description={`${contentWidth} px`}
          icon={Settings2}
          label="Ширина текста"
        >
          <input
            aria-label="Ширина текста редактора"
            max="1200"
            min="560"
            onChange={(event) => setContentWidth(Number(event.target.value))}
            step="20"
            type="range"
            value={contentWidth}
          />
        </SettingRow>
        <SettingRow
          description={`${pagePadding} px`}
          icon={Settings2}
          label="Отступы страницы"
        >
          <input
            aria-label="Отступы страницы редактора"
            max="64"
            min="8"
            onChange={(event) => setPagePadding(Number(event.target.value))}
            step="2"
            type="range"
            value={pagePadding}
          />
        </SettingRow>
        <SettingRow
          description={`${blockSpacing} px`}
          icon={Settings2}
          label="Интервал между блоками"
        >
          <input
            aria-label="Интервал между блоками редактора"
            max="32"
            min="4"
            onChange={(event) => setBlockSpacing(Number(event.target.value))}
            step="2"
            type="range"
            value={blockSpacing}
          />
        </SettingRow>
        <div className="settings-actions">
          <button
            className="button button--primary"
            disabled={saving}
            type="submit"
          >
            {saving ? (
              <LoaderCircle
                aria-hidden="true"
                className="is-spinning"
                size={16}
              />
            ) : (
              <Save aria-hidden="true" size={16} />
            )}
            Сохранить настройки
          </button>
        </div>
      </form>
    </SettingsPage>
  );
}

function AiSettings({
  onUserChanged,
  user,
}: Pick<SettingsDialogProps, "onUserChanged" | "user">) {
  const [saving, setSaving] = useState(false);
  const [preferredModel, setPreferredModel] = useState(
    user.preferredAiModel ?? "",
  );
  const models = useQuery({
    queryFn: aiApi.listModels,
    queryKey: ["ai", "models"],
    retry: false,
  });
  const usage = useQuery({
    queryFn: aiApi.usageSummary,
    queryKey: ["ai", "usage-summary"],
    retry: false,
  });
  const totalTokens =
    (usage.data?.inputTokens ?? 0) + (usage.data?.outputTokens ?? 0);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      await authRequest("update-user", {
        body: JSON.stringify({ preferredAiModel: preferredModel || null }),
        method: "POST",
      });
      await onUserChanged();
      toast.success("Глобальная AI-модель сохранена");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Не удалось сохранить AI-настройки",
      );
    } finally {
      setSaving(false);
    }
  };
  const modelOptions = [
    { label: "По маршруту администратора", value: "" },
    ...(preferredModel &&
    !(models.data ?? []).some((model) => model.id === preferredModel)
      ? [{ label: preferredModel, value: preferredModel }]
      : []),
    ...(models.data ?? []).map((model) => ({
      keywords: `${model.providerName} ${model.id} ${model.capabilities.join(" ")}`,
      label: `${model.label} · ${model.providerName}`,
      value: model.id,
    })),
  ];
  return (
    <SettingsPage
      description="Глобальная модель и фактические расходы"
      icon={Bot}
      title="AI"
    >
      <form onSubmit={save}>
        <SettingRow
          description="Используется в чате, пока для сообщения не выбрана другая модель"
          icon={Bot}
          label="Глобальная модель"
        >
          <SearchableSelect
            ariaLabel="Глобальная модель AI"
            disabled={models.isPending}
            onValueChange={setPreferredModel}
            options={modelOptions}
            searchPlaceholder="Найти актуальную модель"
            value={preferredModel}
          />
        </SettingRow>
        {models.isError ? (
          <p className="settings-feedback settings-feedback--error">
            Не удалось получить список моделей. Проверьте провайдера в разделе
            администратора.
          </p>
        ) : null}
        <div className="settings-subhead">
          <div>
            <strong>Использование</strong>
            <span>Накопительная статистика по вашему профилю</span>
          </div>
        </div>
        <div className="monitor-strip monitor-strip--wide ai-usage-strip">
          <div>
            <strong>
              {new Intl.NumberFormat("ru-RU", { notation: "compact" }).format(
                totalTokens,
              )}
            </strong>
            <span>токенов</span>
          </div>
          <div>
            <strong>
              {new Intl.NumberFormat("ru-RU", { notation: "compact" }).format(
                usage.data?.requests ?? 0,
              )}
            </strong>
            <span>запросов</span>
          </div>
          <div>
            <strong>
              {new Intl.NumberFormat("ru-RU", {
                currency: "USD",
                maximumFractionDigits: 4,
                style: "currency",
              }).format(usage.data?.totalCostUsd ?? 0)}
            </strong>
            <span>расходы</span>
          </div>
        </div>
        <p className="settings-note">
          <Coins aria-hidden="true" size={14} /> Стоимость рассчитывается по
          тарифам модели, сохранённым на сервере.
        </p>
        <div className="settings-actions">
          <button
            className="button button--primary"
            disabled={saving}
            type="submit"
          >
            {saving ? (
              <LoaderCircle className="is-spinning" size={16} />
            ) : (
              <Save size={16} />
            )}
            Сохранить
          </button>
        </div>
      </form>
    </SettingsPage>
  );
}

function IntegrationSettings({ isAdmin }: { isAdmin: boolean }) {
  return (
    <SettingsPage
      description="Подключённые каналы и доступ"
      icon={Link2}
      title="Интеграции"
    >
      <IntegrationSettingsPanel isAdmin={isAdmin} />
    </SettingsPage>
  );
}

function useAdminOverview() {
  return useQuery({
    queryFn: adminApi.overview,
    queryKey: ["admin", "overview"],
  });
}

function useAdminPlans() {
  return useQuery({
    queryFn: adminApi.plans,
    queryKey: ["admin", "plans"],
  });
}

function formatAdminDate(value: string | null) {
  if (!value) return "Нет входов";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Неизвестно";
  return new Intl.DateTimeFormat("ru", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function formatAdminBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 Б";
  const units = ["Б", "КБ", "МБ", "ГБ", "ТБ"];
  const unit = Math.min(Math.floor(Math.log(value) / Math.log(1024)), 4);
  return `${new Intl.NumberFormat("ru", { maximumFractionDigits: 1 }).format(
    value / 1024 ** unit,
  )} ${units[unit]}`;
}

async function copyCorrelationId(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success("Correlation ID скопирован");
  } catch {
    toast.error("Не удалось скопировать ID");
  }
}

function AdminRefresh({
  generatedAt,
  loading,
  onRefresh,
}: {
  generatedAt?: string;
  loading: boolean;
  onRefresh(): void;
}) {
  return (
    <div className="admin-refresh">
      <span>
        {generatedAt
          ? `Данные на ${formatAdminDate(generatedAt)}`
          : "Живые данные"}
      </span>
      <button
        className="button button--quiet"
        disabled={loading}
        onClick={onRefresh}
        type="button"
      >
        <RefreshCw
          aria-hidden="true"
          className={loading ? "is-spinning" : ""}
          size={14}
        />
        Обновить
      </button>
    </div>
  );
}

function AdminQueryState({
  error,
  loading,
  onRetry,
}: {
  error?: Error | null;
  loading: boolean;
  onRetry(): void;
}) {
  if (loading) {
    return (
      <div aria-live="polite" className="admin-feedback">
        <LoaderCircle aria-hidden="true" className="is-spinning" size={18} />
        Получаем актуальные данные
      </div>
    );
  }
  if (!error) return null;
  return (
    <div className="admin-feedback admin-feedback--error" role="alert">
      <AlertTriangle aria-hidden="true" size={18} />
      <span>{error.message || "Не удалось загрузить данные"}</span>
      <button className="button button--quiet" onClick={onRetry} type="button">
        Повторить
      </button>
    </div>
  );
}

function AdminUsers() {
  const queryClient = useQueryClient();
  const overview = useAdminOverview();
  const plans = useAdminPlans();
  const assignment = useMutation({
    mutationFn: ({
      currentSubscriptionId,
      planId,
      userId,
    }: {
      currentSubscriptionId: number | null;
      planId: number;
      userId: number;
    }) =>
      adminApi.assignSubscription(userId, {
        expectedCurrentSubscriptionId: currentSubscriptionId,
        planId,
      }),
    onError: (error: Error) => {
      toast.error(error.message);
      void queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "plans"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "audits"] });
      toast.success("Тариф пользователя обновлён");
    },
  });
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().toLocaleLowerCase("ru");
  const users =
    overview.data?.users.items.filter((user) =>
      [user.name, user.email, String(user.id)].some((value) =>
        value.toLocaleLowerCase("ru").includes(normalizedSearch),
      ),
    ) ?? [];
  return (
    <SettingsPage
      admin
      description="Роли, доступ и активность"
      icon={UsersRound}
      title="Пользователи"
    >
      <AdminRefresh
        generatedAt={overview.data?.generatedAt}
        loading={overview.isFetching}
        onRefresh={() => void overview.refetch()}
      />
      <AdminQueryState
        error={overview.error}
        loading={overview.isPending}
        onRetry={() => void overview.refetch()}
      />
      {overview.data ? (
        <>
          <div className="monitor-strip">
            <div>
              <strong>{overview.data.users.total}</strong>
              <span>всего</span>
            </div>
            <div>
              <strong>{overview.data.users.admins}</strong>
              <span>администраторов</span>
            </div>
            <div>
              <strong>{overview.data.users.items.length}</strong>
              <span>последних записей</span>
            </div>
          </div>
          <label className="search-field">
            <UsersRound aria-hidden="true" size={16} />
            <input
              aria-label="Поиск пользователей"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Имя, email или ID"
              type="search"
              value={search}
            />
          </label>
          <div
            className="admin-table admin-table--users"
            role="table"
            aria-label="Пользователи"
          >
            <div className="admin-table__head" role="row">
              <span>Пользователь</span>
              <span>Роль</span>
              <span>Тариф</span>
              <span>Последний вход</span>
            </div>
            {users.map((user) => (
              <div className="admin-table__row" key={user.id} role="row">
                <TooltipText label={user.email}>
                  <strong>{user.name}</strong>
                  <small>
                    #{user.id} · {user.email}
                    {!user.emailVerified ? " · email не подтверждён" : ""}
                  </small>
                </TooltipText>
                <span
                  className={
                    user.role === "admin" ? "status status--admin" : "status"
                  }
                >
                  {user.role === "admin" ? "Администратор" : "Пользователь"}
                </span>
                <SelectMenu
                  disabled={assignment.isPending || plans.isPending}
                  label={`Тариф пользователя ${user.name}`}
                  onChange={(value) => {
                    const planId = Number(value);
                    if (
                      !Number.isSafeInteger(planId) ||
                      planId === user.subscription?.planId
                    )
                      return;
                    assignment.mutate({
                      currentSubscriptionId: user.subscription?.id ?? null,
                      planId,
                      userId: user.id,
                    });
                  }}
                  options={
                    plans.data?.items
                      .filter(
                        (plan) =>
                          plan.isActive ||
                          plan.id === user.subscription?.planId,
                      )
                      .map((plan) => ({
                        label: plan.name,
                        value: String(plan.id),
                      })) ?? [
                      {
                        label: user.subscription?.planName ?? "Не назначен",
                        value: String(user.subscription?.planId ?? 0),
                      },
                    ]
                  }
                  value={String(user.subscription?.planId ?? 0)}
                />
                <time dateTime={user.lastLoginAt ?? undefined}>
                  {formatAdminDate(user.lastLoginAt)}
                </time>
              </div>
            ))}
          </div>
          {users.length === 0 ? (
            <div className="admin-feedback admin-feedback--empty">
              <SearchX aria-hidden="true" size={18} />
              {normalizedSearch
                ? "Совпадений не найдено"
                : "Пользователей пока нет"}
            </div>
          ) : null}
        </>
      ) : null}
    </SettingsPage>
  );
}

function formatPlanPrice(plan: AdminPlan) {
  if (plan.priceCents === 0) return "Бесплатно";
  return new Intl.NumberFormat("ru", {
    currency: plan.currency.toUpperCase(),
    style: "currency",
  }).format(plan.priceCents / 100);
}

function planNumber(
  value: string,
  minimum: number,
  maximum: number,
): number | null | undefined {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : undefined;
}

function AdminPlanEditor({ plan }: { plan: AdminPlan }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(plan.name);
  const [description, setDescription] = useState(plan.description ?? "");
  const [priceCents, setPriceCents] = useState(String(plan.priceCents));
  const [currency, setCurrency] = useState(plan.currency.toUpperCase());
  const [billingPeriod, setBillingPeriod] = useState(plan.billingPeriod);
  const [sortOrder, setSortOrder] = useState(String(plan.sortOrder));
  const [isActive, setIsActive] = useState(plan.isActive);
  const [isHidden, setIsHidden] = useState(plan.isHidden);
  const [filesEnabled, setFilesEnabled] = useState(
    plan.entitlements.files?.enabled === true,
  );
  const [workspaceEnabled, setWorkspaceEnabled] = useState(
    plan.entitlements.workspace?.enabled !== false,
  );
  const [templatesEnabled, setTemplatesEnabled] = useState(
    plan.entitlements.templates?.enabled !== false,
  );
  const [versioningEnabled, setVersioningEnabled] = useState(
    plan.entitlements.versioning?.enabled !== false,
  );
  const [publicShareEnabled, setPublicShareEnabled] = useState(
    plan.entitlements.publicShare?.enabled !== false,
  );
  const [exportImportEnabled, setExportImportEnabled] = useState(
    plan.entitlements.exportImport?.enabled !== false,
  );
  const [aiEnabled, setAiEnabled] = useState(
    plan.entitlements.ai?.enabled !== false,
  );
  const [voiceEnabled, setVoiceEnabled] = useState(
    plan.entitlements.voice?.enabled !== false,
  );
  const [storageMb, setStorageMb] = useState(
    typeof plan.entitlements.files?.storageLimitBytes === "number"
      ? String(plan.entitlements.files.storageLimitBytes / 1024 ** 2)
      : "",
  );
  const [monthlyAiTokens, setMonthlyAiTokens] = useState(
    typeof plan.entitlements.ai?.monthlyTokenLimit === "number"
      ? String(plan.entitlements.ai.monthlyTokenLimit)
      : "",
  );
  const [maxNotes, setMaxNotes] = useState(
    typeof plan.entitlements.workspace?.maxNotes === "number"
      ? String(plan.entitlements.workspace.maxNotes)
      : "",
  );
  const [maxNoteContentKb, setMaxNoteContentKb] = useState(
    typeof plan.entitlements.workspace?.maxNoteContentBytes === "number"
      ? String(plan.entitlements.workspace.maxNoteContentBytes / 1024)
      : "",
  );
  const mutation = useMutation<AdminPlanState, Error, AdminPlanUpdateInput>({
    mutationFn: (input) => adminApi.updatePlan(plan.id, input),
    onError: (error) => {
      toast.error(error.message);
      void queryClient.invalidateQueries({ queryKey: ["admin", "plans"] });
    },
    onSuccess: (state) => {
      queryClient.setQueryData(["admin", "plans"], state);
      void queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "audits"] });
      toast.success("Тариф и квоты сохранены");
    },
  });

  function save() {
    const parsedPrice = planNumber(priceCents, 0, 1_000_000_000);
    const parsedSortOrder = planNumber(sortOrder, -10_000, 10_000);
    const parsedStorageMb = planNumber(storageMb, 0, 10 * 1024 ** 2);
    const parsedMonthlyAiTokens = planNumber(monthlyAiTokens, 0, 2_147_483_647);
    const parsedMaxNotes = planNumber(maxNotes, 0, 2_147_483_647);
    const parsedMaxNoteContentKb = planNumber(maxNoteContentKb, 0, 2048);
    if (
      !name.trim() ||
      parsedPrice === null ||
      parsedPrice === undefined ||
      parsedSortOrder === null ||
      parsedSortOrder === undefined ||
      parsedStorageMb === undefined ||
      parsedMonthlyAiTokens === undefined ||
      parsedMaxNotes === undefined ||
      parsedMaxNoteContentKb === undefined ||
      !/^[a-zA-Z]{3}$/.test(currency)
    ) {
      toast.error("Проверьте название, валюту и числовые лимиты");
      return;
    }
    mutation.mutate({
      billingPeriod,
      currency,
      description: description.trim() || null,
      entitlements: {
        ai: {
          enabled: aiEnabled,
          monthlyTokenLimit: parsedMonthlyAiTokens,
        },
        exportImport: { enabled: exportImportEnabled },
        files: {
          enabled: filesEnabled,
          storageLimitBytes:
            parsedStorageMb === null ? null : parsedStorageMb * 1024 ** 2,
        },
        publicShare: { enabled: publicShareEnabled },
        templates: { enabled: templatesEnabled },
        versioning: { enabled: versioningEnabled },
        voice: { enabled: voiceEnabled },
        workspace: {
          enabled: workspaceEnabled,
          maxNoteContentBytes:
            parsedMaxNoteContentKb === null
              ? null
              : parsedMaxNoteContentKb * 1024,
          maxNotes: parsedMaxNotes,
        },
      },
      expectedRevision: plan.revision,
      isActive,
      isHidden,
      name,
      priceCents: parsedPrice,
      sortOrder: parsedSortOrder,
    });
  }

  const free = plan.slug === "free";
  return (
    <div className="admin-plan__editor">
      <div className="admin-plan__fields">
        <label className="field-label field-label--wide">
          <span>Название</span>
          <input
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
        </label>
        <label className="field-label field-label--wide">
          <span>Описание</span>
          <input
            maxLength={500}
            onChange={(event) => setDescription(event.target.value)}
            value={description}
          />
        </label>
        <label className="field-label">
          <span>Цена, коп.</span>
          <input
            disabled={free}
            inputMode="numeric"
            min={0}
            onChange={(event) => setPriceCents(event.target.value)}
            type="number"
            value={priceCents}
          />
        </label>
        <label className="field-label">
          <span>Валюта</span>
          <input
            maxLength={3}
            onChange={(event) => setCurrency(event.target.value.toUpperCase())}
            value={currency}
          />
        </label>
        <label className="field-label">
          <span>Период</span>
          <SelectMenu
            disabled={free}
            label="Период тарифа"
            onChange={(value) =>
              setBillingPeriod(value as AdminPlan["billingPeriod"])
            }
            options={[
              { label: "Месяц", value: "month" },
              { label: "Год", value: "year" },
              { label: "Бессрочно", value: "lifetime" },
            ]}
            value={billingPeriod}
          />
        </label>
        <label className="field-label">
          <span>Порядок</span>
          <input
            inputMode="numeric"
            max={10_000}
            min={-10_000}
            onChange={(event) => setSortOrder(event.target.value)}
            type="number"
            value={sortOrder}
          />
        </label>
        <label className="field-label">
          <span>Хранилище, МБ</span>
          <input
            inputMode="numeric"
            min={0}
            onChange={(event) => setStorageMb(event.target.value)}
            placeholder="Без лимита"
            type="number"
            value={storageMb}
          />
        </label>
        <label className="field-label">
          <span>AI-токены в месяц</span>
          <input
            inputMode="numeric"
            max={2_147_483_647}
            min={0}
            onChange={(event) => setMonthlyAiTokens(event.target.value)}
            placeholder="Без лимита"
            type="number"
            value={monthlyAiTokens}
          />
        </label>
        <label className="field-label">
          <span>Максимум заметок</span>
          <input
            inputMode="numeric"
            max={2_147_483_647}
            min={0}
            onChange={(event) => setMaxNotes(event.target.value)}
            placeholder="Без лимита"
            type="number"
            value={maxNotes}
          />
        </label>
        <label className="field-label">
          <span>Размер заметки, КБ</span>
          <input
            inputMode="numeric"
            max={2048}
            min={0}
            onChange={(event) => setMaxNoteContentKb(event.target.value)}
            placeholder="Без лимита"
            type="number"
            value={maxNoteContentKb}
          />
        </label>
      </div>
      <div className="admin-plan__switches">
        <SettingRow label="Активен">
          <AppSwitch
            checked={isActive}
            disabled={free}
            label="Тариф активен"
            onCheckedChange={setIsActive}
          />
        </SettingRow>
        <SettingRow label="Скрыт в каталоге">
          <AppSwitch
            checked={isHidden}
            disabled={free}
            label="Скрыть тариф"
            onCheckedChange={setIsHidden}
          />
        </SettingRow>
        <SettingRow label="Файлы">
          <AppSwitch
            checked={filesEnabled}
            label="Доступ к файлам"
            onCheckedChange={setFilesEnabled}
          />
        </SettingRow>
        <SettingRow label="Рабочее пространство">
          <AppSwitch
            checked={workspaceEnabled}
            label="Доступ к заметкам"
            onCheckedChange={setWorkspaceEnabled}
          />
        </SettingRow>
        <SettingRow label="AI">
          <AppSwitch
            checked={aiEnabled}
            label="Доступ к AI"
            onCheckedChange={setAiEnabled}
          />
        </SettingRow>
        <SettingRow label="Голос">
          <AppSwitch
            checked={voiceEnabled}
            label="Голосовой AI"
            onCheckedChange={setVoiceEnabled}
          />
        </SettingRow>
        <SettingRow label="Шаблоны">
          <AppSwitch
            checked={templatesEnabled}
            label="Доступ к шаблонам"
            onCheckedChange={setTemplatesEnabled}
          />
        </SettingRow>
        <SettingRow label="Версии">
          <AppSwitch
            checked={versioningEnabled}
            label="История версий"
            onCheckedChange={setVersioningEnabled}
          />
        </SettingRow>
        <SettingRow label="Публичные ссылки">
          <AppSwitch
            checked={publicShareEnabled}
            label="Создание публичных ссылок"
            onCheckedChange={setPublicShareEnabled}
          />
        </SettingRow>
        <SettingRow label="Импорт и экспорт">
          <AppSwitch
            checked={exportImportEnabled}
            label="Импорт и экспорт"
            onCheckedChange={setExportImportEnabled}
          />
        </SettingRow>
      </div>
      <div className="admin-plan__actions">
        <span>Ревизия {plan.revision}</span>
        <button
          aria-label={`Сохранить тариф ${plan.name}`}
          className="icon-button icon-button--primary"
          disabled={mutation.isPending}
          onClick={save}
          title="Сохранить тариф"
          type="button"
        >
          {mutation.isPending ? (
            <LoaderCircle
              aria-hidden="true"
              className="is-spinning"
              size={16}
            />
          ) : (
            <Save aria-hidden="true" size={16} />
          )}
        </button>
      </div>
    </div>
  );
}

function AdminPlans() {
  const plans = useAdminPlans();
  return (
    <SettingsPage
      admin
      description="Каталог, доступы и ресурсные лимиты"
      icon={PackageCheck}
      title="Тарифы и квоты"
    >
      <AdminRefresh
        loading={plans.isFetching}
        onRefresh={() => void plans.refetch()}
      />
      <AdminQueryState
        error={plans.error}
        loading={plans.isPending}
        onRetry={() => void plans.refetch()}
      />
      {plans.data ? (
        <>
          <div className="monitor-strip">
            <div>
              <strong>{plans.data.items.length}</strong>
              <span>тарифов</span>
            </div>
            <div>
              <strong>
                {plans.data.items.filter((plan) => plan.isActive).length}
              </strong>
              <span>активных</span>
            </div>
            <div>
              <strong>
                {plans.data.items.reduce(
                  (total, plan) => total + plan.subscribers,
                  0,
                )}
              </strong>
              <span>назначений</span>
            </div>
          </div>
          <div className="admin-plans" data-testid="admin-plans">
            {plans.data.items.map((plan) => (
              <details
                className="admin-plan"
                key={`${plan.id}:${plan.revision}`}
              >
                <summary>
                  <span className="admin-plan__identity">
                    <strong>{plan.name}</strong>
                    <small>
                      {plan.slug} · {formatPlanPrice(plan)}
                    </small>
                  </span>
                  <span
                    className={
                      plan.isActive ? "status status--success" : "status"
                    }
                  >
                    {plan.isActive ? "Активен" : "Выключен"}
                  </span>
                  <span className="admin-plan__subscribers">
                    {plan.subscribers} польз.
                  </span>
                  <ChevronDown aria-hidden="true" size={16} />
                </summary>
                <AdminPlanEditor plan={plan} />
              </details>
            ))}
          </div>
        </>
      ) : null}
    </SettingsPage>
  );
}

function AdminAi() {
  return (
    <SettingsPage
      admin
      description="Провайдеры, версии и eval-гейты"
      icon={Bot}
      title="Модели и промпты"
    >
      <AdminAiSettings />
    </SettingsPage>
  );
}

function AdminSystem() {
  const overview = useAdminOverview();
  const labels = {
    "object-storage": "Object Storage",
    postgres: "PostgreSQL",
    redis: "Redis",
    worker: "Worker",
  } as const;
  return (
    <SettingsPage
      admin
      description="Сервисы, хранение и очереди"
      icon={ServerCog}
      title="Инфраструктура"
    >
      <AdminRefresh
        generatedAt={overview.data?.generatedAt}
        loading={overview.isFetching}
        onRefresh={() => void overview.refetch()}
      />
      <AdminQueryState
        error={overview.error}
        loading={overview.isPending}
        onRetry={() => void overview.refetch()}
      />
      {overview.data ? (
        <>
          {overview.data.services.map((service) => (
            <SettingRow
              description={`${service.detail}${
                service.latencyMs === null ? "" : ` · ${service.latencyMs} мс`
              }`}
              icon={service.name === "postgres" ? Database : ServerCog}
              key={service.name}
              label={labels[service.name]}
            >
              <span
                className={
                  service.status === "ok"
                    ? "status status--success"
                    : "status status--danger"
                }
              >
                {service.status === "ok" ? "Работает" : "Нет ответа"}
              </span>
            </SettingRow>
          ))}
          <SettingRow
            description={`${overview.data.storage.trackedFiles} файлов`}
            icon={Database}
            label="Учтено в хранилище"
          >
            <span className="usage-value">
              {formatAdminBytes(overview.data.storage.trackedBytes)}
            </span>
          </SettingRow>
        </>
      ) : null}
    </SettingsPage>
  );
}

const retentionLabels: Record<
  DataRetentionPolicyKey,
  { description: string; label: string }
> = {
  activity_logs: {
    description: "Действия пользователей и администраторов",
    label: "Журнал действий",
  },
  ai_audit_logs: {
    description: "Изменения AI, моделей и промптов",
    label: "AI-аудит",
  },
  ai_bot_webhook_events: {
    description: "Завершённые события Telegram и VK",
    label: "События интеграций",
  },
  request_error_logs: {
    description: "Ошибки HTTP и correlation ID",
    label: "Ошибки запросов",
  },
};

function RetentionPolicyEditor({
  onSave,
  policy,
  saving,
}: {
  onSave(
    policyKey: DataRetentionPolicyKey,
    input: { enabled: boolean; retentionDays: number },
  ): void;
  policy: AdminRetentionPolicy;
  saving: boolean;
}) {
  const [enabled, setEnabled] = useState(policy.enabled);
  const [retentionDays, setRetentionDays] = useState(policy.retentionDays);
  const labels = retentionLabels[policy.policyKey];
  const invalid =
    !Number.isSafeInteger(retentionDays) ||
    retentionDays < 7 ||
    retentionDays > 3650;
  const dirty =
    enabled !== policy.enabled || retentionDays !== policy.retentionDays;
  const state = policy.lastError
    ? policy.lastError === "backlog_remaining"
      ? "Очистка продолжится автоматически"
      : "Последний запуск завершился с ошибкой"
    : policy.lastCompletedAt
      ? `${formatAdminDate(policy.lastCompletedAt)} · удалено ${policy.lastDeletedCount}`
      : "Ожидает первого запуска";
  return (
    <div className="admin-retention__row">
      <div className="admin-retention__identity">
        <strong>{labels.label}</strong>
        <span>{labels.description}</span>
        <small className={policy.lastError ? "is-danger" : ""}>{state}</small>
      </div>
      <label className="toggle">
        <input
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
          type="checkbox"
        />
        <span aria-hidden="true" />
        <span className="sr-only">Включить {labels.label}</span>
      </label>
      <label className="admin-retention__days">
        <span>Дней</span>
        <input
          aria-invalid={invalid}
          max={3650}
          min={7}
          onChange={(event) => setRetentionDays(event.target.valueAsNumber)}
          type="number"
          value={Number.isNaN(retentionDays) ? "" : retentionDays}
        />
      </label>
      <button
        aria-label={`Сохранить ${labels.label}`}
        className="icon-button"
        disabled={!dirty || invalid || saving}
        onClick={() => onSave(policy.policyKey, { enabled, retentionDays })}
        title="Сохранить"
        type="button"
      >
        {saving ? (
          <LoaderCircle aria-hidden="true" className="is-spinning" size={16} />
        ) : (
          <Check aria-hidden="true" size={16} />
        )}
      </button>
    </div>
  );
}

function AdminRetention({
  mutation,
  retention,
}: {
  mutation: UseMutationResult<
    AdminRetentionState,
    Error,
    {
      input: { enabled: boolean; retentionDays: number };
      policyKey: DataRetentionPolicyKey;
    }
  >;
  retention: UseQueryResult<AdminRetentionState, Error>;
}) {
  return (
    <details className="admin-retention">
      <summary>
        <div>
          <strong>Хранение журналов</strong>
          <span>
            {retention.data
              ? `Очистка каждые ${retention.data.scheduleEveryMinutes} мин.`
              : "Политики и автоматическая очистка"}
          </span>
        </div>
        <ChevronDown aria-hidden="true" size={16} />
      </summary>
      <div className="admin-retention__body">
        <AdminQueryState
          error={retention.error}
          loading={retention.isPending}
          onRetry={() => void retention.refetch()}
        />
        {retention.data?.items.map((policy) => (
          <RetentionPolicyEditor
            key={`${policy.policyKey}:${policy.updatedAt}`}
            onSave={(policyKey, input) => mutation.mutate({ input, policyKey })}
            policy={policy}
            saving={
              mutation.isPending &&
              mutation.variables?.policyKey === policy.policyKey
            }
          />
        ))}
      </div>
    </details>
  );
}

const alertLabels: Record<AdminAlertName, string> = {
  NotesApiHighErrorRatio: "Высокая доля ошибок API",
  NotesTargetDown: "Сервис недоступен для мониторинга",
  NotesWorkerJobFailed: "Сбой фоновой задачи",
};

function AdminAlertRow({
  alert,
  mutation,
}: {
  alert: AdminAlertingState["alerts"][number];
  mutation: UseMutationResult<
    AdminAlertingState,
    Error,
    { alertName: AdminAlertName; comment: string; durationMinutes: number }
  >;
}) {
  const [comment, setComment] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const submitting =
    mutation.isPending && mutation.variables?.alertName === alert.alertName;
  const acknowledged = alert.silencedBy.length > 0;
  const context = [alert.job, alert.queue, alert.jobName]
    .filter(Boolean)
    .join(" · ");

  return (
    <details className="admin-alerting__alert">
      <summary>
        <span
          aria-hidden="true"
          className={`admin-alerting__mark admin-alerting__mark--${alert.severity}`}
        />
        <span className="admin-alerting__identity">
          <strong>{alertLabels[alert.alertName]}</strong>
          <small>{context || alert.alertName}</small>
        </span>
        <span className="admin-alerting__state">
          {acknowledged
            ? "Подтверждено"
            : alert.severity === "critical"
              ? "Критично"
              : "Внимание"}
        </span>
        <ChevronDown aria-hidden="true" size={15} />
      </summary>
      <div className="admin-alerting__detail">
        <p>{alert.summary}</p>
        <dl>
          <div>
            <dt>Начало</dt>
            <dd>
              {alert.startsAt ? formatAdminDate(alert.startsAt) : "Нет данных"}
            </dd>
          </div>
          <div>
            <dt>Получатель</dt>
            <dd>{alert.receivers.join(", ") || "Не назначен"}</dd>
          </div>
        </dl>
        <div className="admin-alerting__ack">
          <input
            aria-label={`Комментарий для ${alertLabels[alert.alertName]}`}
            disabled={acknowledged || submitting}
            maxLength={200}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Комментарий к подтверждению"
            value={comment}
          />
          <SelectMenu
            disabled={acknowledged || submitting}
            label="Срок подтверждения"
            onChange={setDurationMinutes}
            options={[
              { label: "15 минут", value: "15" },
              { label: "1 час", value: "60" },
              { label: "4 часа", value: "240" },
              { label: "24 часа", value: "1440" },
            ]}
            value={durationMinutes}
          />
          <button
            className="button button--quiet"
            disabled={acknowledged || submitting || !comment.trim()}
            onClick={() =>
              mutation.mutate({
                alertName: alert.alertName,
                comment: comment.trim(),
                durationMinutes: Number(durationMinutes),
              })
            }
            type="button"
          >
            {submitting ? (
              <LoaderCircle
                aria-hidden="true"
                className="is-spinning"
                size={14}
              />
            ) : (
              <BellOff aria-hidden="true" size={14} />
            )}
            {acknowledged ? "Подтверждено" : "Подтвердить"}
          </button>
        </div>
      </div>
    </details>
  );
}

function AdminAlerting({
  alerting,
  createMutation,
  deleteMutation,
}: {
  alerting: UseQueryResult<AdminAlertingState, Error>;
  createMutation: UseMutationResult<
    AdminAlertingState,
    Error,
    { alertName: AdminAlertName; comment: string; durationMinutes: number }
  >;
  deleteMutation: UseMutationResult<AdminAlertingState, Error, string>;
}) {
  const critical =
    alerting.data?.alerts.filter((alert) => alert.severity === "critical")
      .length ?? 0;
  const warning = (alerting.data?.alerts.length ?? 0) - critical;

  return (
    <details className="admin-alerting">
      <summary>
        <div>
          <strong>Доставка оповещений</strong>
          <span>
            {alerting.data?.configured
              ? `${alerting.data.alerts.length} активных · ${alerting.data.silences.length} подтверждений`
              : "Alertmanager не подключен"}
          </span>
        </div>
        <ChevronDown aria-hidden="true" size={16} />
      </summary>
      <div className="admin-alerting__body">
        <AdminQueryState
          error={alerting.error}
          loading={alerting.isPending}
          onRetry={() => void alerting.refetch()}
        />
        {alerting.data?.configured ? (
          <>
            <div className="admin-alerting__metrics">
              {[
                [critical, "критических"],
                [warning, "предупреждений"],
                [alerting.data.delivery.sent, "доставлено"],
                [alerting.data.delivery.failed, "ошибок доставки"],
              ].map(([value, label]) => (
                <div key={label}>
                  <strong>{value}</strong>
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <div className="admin-alerting__section-head">
              <strong>Активные alerts</strong>
              <span>{alerting.data.alerts.length}</span>
            </div>
            {alerting.data.alerts.length ? (
              <div className="admin-alerting__list" data-testid="admin-alerts">
                {alerting.data.alerts.map((alert) => (
                  <AdminAlertRow
                    alert={alert}
                    key={`${alert.alertName}:${alert.fingerprint ?? alert.startsAt}`}
                    mutation={createMutation}
                  />
                ))}
              </div>
            ) : (
              <div className="admin-feedback admin-feedback--empty">
                <Check aria-hidden="true" size={18} />
                Активных оповещений нет
              </div>
            )}
            <div className="admin-alerting__section-head">
              <strong>Подтверждения</strong>
              <span>{alerting.data.silences.length}</span>
            </div>
            {alerting.data.silences.length ? (
              <div className="admin-alerting__silences">
                {alerting.data.silences.map((silence) => (
                  <div key={silence.id}>
                    <span className="admin-alerting__identity">
                      <strong>{alertLabels[silence.alertName]}</strong>
                      <TooltipText label={silence.comment} />
                    </span>
                    <time dateTime={silence.endsAt ?? undefined}>
                      до{" "}
                      {silence.endsAt
                        ? formatAdminDate(silence.endsAt)
                        : "отмены"}
                    </time>
                    <AppTooltip
                      label={
                        silence.canDelete
                          ? "Удалить подтверждение"
                          : "Управляется вне Notes AI"
                      }
                    >
                      <button
                        aria-label={`Удалить подтверждение ${alertLabels[silence.alertName]}`}
                        className="icon-button"
                        disabled={
                          !silence.canDelete || deleteMutation.isPending
                        }
                        onClick={() => deleteMutation.mutate(silence.id)}
                        type="button"
                      >
                        {deleteMutation.isPending &&
                        deleteMutation.variables === silence.id ? (
                          <LoaderCircle
                            aria-hidden="true"
                            className="is-spinning"
                            size={15}
                          />
                        ) : (
                          <Trash2 aria-hidden="true" size={15} />
                        )}
                      </button>
                    </AppTooltip>
                  </div>
                ))}
              </div>
            ) : (
              <div className="admin-feedback admin-feedback--empty">
                Подтверждений нет
              </div>
            )}
          </>
        ) : alerting.data ? (
          <div className="admin-feedback admin-feedback--empty">
            Доставка оповещений отключена
          </div>
        ) : null}
      </div>
    </details>
  );
}

function AdminMonitoring() {
  const queryClient = useQueryClient();
  const overview = useAdminOverview();
  const retention = useQuery({
    queryFn: adminApi.retention,
    queryKey: ["admin", "retention"],
  });
  const alerting = useQuery({
    queryFn: adminApi.alerting,
    queryKey: ["admin", "alerting"],
  });
  const createSilenceMutation = useMutation({
    mutationFn: adminApi.createSilence,
    onError: (error: Error) => toast.error(error.message),
    onSuccess: (state) => {
      queryClient.setQueryData(["admin", "alerting"], state);
      void queryClient.invalidateQueries({ queryKey: ["admin", "audits"] });
      toast.success("Оповещение подтверждено");
    },
  });
  const deleteSilenceMutation = useMutation({
    mutationFn: adminApi.deleteSilence,
    onError: (error: Error) => toast.error(error.message),
    onSuccess: (state) => {
      queryClient.setQueryData(["admin", "alerting"], state);
      void queryClient.invalidateQueries({ queryKey: ["admin", "audits"] });
      toast.success("Подтверждение удалено");
    },
  });
  const retentionMutation = useMutation({
    mutationFn: ({
      input,
      policyKey,
    }: {
      input: { enabled: boolean; retentionDays: number };
      policyKey: DataRetentionPolicyKey;
    }) => adminApi.updateRetention(policyKey, input),
    onError: (error: Error) => toast.error(error.message),
    onSuccess: (state) => {
      queryClient.setQueryData(["admin", "retention"], state);
      void queryClient.invalidateQueries({ queryKey: ["admin", "audits"] });
      toast.success("Политика хранения сохранена");
    },
  });
  const [historyView, setHistoryView] = useState<"audits" | "diagnostics">(
    "diagnostics",
  );
  const [diagnosticKind, setDiagnosticKind] = useState<
    "all" | AdminDiagnosticSource
  >("all");
  const [auditSource, setAuditSource] = useState<"all" | AdminAuditSource>(
    "all",
  );
  const [auditScope, setAuditScope] = useState<AdminAuditScope>("all");
  const diagnostics = useInfiniteQuery<AdminHistoryPage<AdminDiagnosticItem>>({
    enabled: historyView === "diagnostics",
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      adminApi.diagnostics({
        cursor: pageParam as string | null,
        kind: diagnosticKind,
      }),
    queryKey: ["admin", "diagnostics", diagnosticKind],
  });
  const audits = useInfiniteQuery<AdminHistoryPage<AdminAuditItem>>({
    enabled: historyView === "audits",
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      adminApi.audits({
        cursor: pageParam as string | null,
        scope: auditScope,
        source: auditSource,
      }),
    queryKey: ["admin", "audits", auditSource, auditScope],
  });
  const diagnosticItems =
    diagnostics.data?.pages.flatMap((page) => page.items) ?? [];
  const auditItems = audits.data?.pages.flatMap((page) => page.items) ?? [];
  const failureLabels = {
    ai_tool: "AI-инструмент",
    integration: "Интеграция",
    request: "HTTP-запрос",
  } as const;
  const auditSourceLabels = {
    activity: "Действие в приложении",
    ai: "AI-контур",
  } as const;
  const activeHistory = historyView === "diagnostics" ? diagnostics : audits;

  function refresh() {
    void Promise.all([
      overview.refetch(),
      alerting.refetch(),
      retention.refetch(),
      historyView === "diagnostics" ? diagnostics.refetch() : audits.refetch(),
    ]);
  }

  return (
    <SettingsPage
      admin
      description="Ошибки, аудит и нагрузка"
      icon={Activity}
      title="Мониторинг"
    >
      <AdminRefresh
        generatedAt={overview.data?.generatedAt}
        loading={
          overview.isFetching ||
          alerting.isFetching ||
          retention.isFetching ||
          activeHistory.isFetching
        }
        onRefresh={refresh}
      />
      <AdminQueryState
        error={overview.error}
        loading={overview.isPending}
        onRetry={() => void overview.refetch()}
      />
      {overview.data ? (
        <div className="monitor-strip monitor-strip--wide">
          {[
            [overview.data.metrics.critical24h, "критических"],
            [overview.data.metrics.warnings24h, "предупреждений"],
            [overview.data.metrics.aiFailures24h, "ошибок AI"],
            [overview.data.metrics.integrationFailures24h, "интеграций"],
            [overview.data.metrics.audits24h, "событий аудита"],
            [overview.data.metrics.pendingConfirmations, "ожидают решения"],
          ].map(([value, label]) => (
            <div key={label}>
              <strong>{value}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
      ) : null}
      <AdminAlerting
        alerting={alerting}
        createMutation={createSilenceMutation}
        deleteMutation={deleteSilenceMutation}
      />
      <AdminRetention mutation={retentionMutation} retention={retention} />
      <div className="admin-history__head">
        <div
          aria-label="Тип истории"
          className="admin-history__switch"
          role="group"
        >
          <button
            aria-pressed={historyView === "diagnostics"}
            onClick={() => setHistoryView("diagnostics")}
            type="button"
          >
            Сбои
          </button>
          <button
            aria-pressed={historyView === "audits"}
            onClick={() => setHistoryView("audits")}
            type="button"
          >
            Аудит
          </button>
        </div>
        <div className="admin-history__filters">
          {historyView === "diagnostics" ? (
            <SelectMenu
              label="Источник сбоев"
              onChange={(value) =>
                setDiagnosticKind(value as "all" | AdminDiagnosticSource)
              }
              options={[
                { label: "Все источники", value: "all" },
                { label: "HTTP-запросы", value: "request" },
                { label: "AI-инструменты", value: "ai_tool" },
                { label: "Интеграции", value: "integration" },
              ]}
              value={diagnosticKind}
            />
          ) : (
            <>
              <SelectMenu
                label="Источник аудита"
                onChange={(value) =>
                  setAuditSource(value as "all" | AdminAuditSource)
                }
                options={[
                  { label: "Все журналы", value: "all" },
                  { label: "Приложение", value: "activity" },
                  { label: "AI-контур", value: "ai" },
                ]}
                value={auditSource}
              />
              <SelectMenu
                label="Область аудита"
                onChange={(value) => setAuditScope(value as AdminAuditScope)}
                options={[
                  { label: "Все области", value: "all" },
                  { label: "Заметки", value: "notes" },
                  { label: "Файлы", value: "files" },
                  { label: "Рабочее пространство", value: "workspace" },
                  { label: "Интеграции", value: "integrations" },
                  { label: "AI", value: "ai" },
                ]}
                value={auditScope}
              />
            </>
          )}
        </div>
      </div>
      <AdminQueryState
        error={activeHistory.error}
        loading={activeHistory.isPending}
        onRetry={() => void activeHistory.refetch()}
      />
      {historyView === "diagnostics" && diagnostics.data ? (
        diagnosticItems.length ? (
          <div className="admin-diagnostics" data-testid="diagnostic-history">
            {diagnosticItems.map((failure) => (
              <details className="admin-diagnostic" key={failure.id}>
                <summary>
                  <span
                    aria-hidden="true"
                    className={`admin-diagnostic__mark admin-diagnostic__mark--${failure.source}`}
                  />
                  <span className="admin-diagnostic__title">
                    <strong>{failure.title}</strong>
                    <small>
                      {failureLabels[failure.source]}
                      {failure.userId
                        ? ` · пользователь #${failure.userId}`
                        : ""}
                    </small>
                  </span>
                  <time dateTime={failure.createdAt}>
                    {formatAdminDate(failure.createdAt)}
                  </time>
                  <ChevronDown aria-hidden="true" size={15} />
                </summary>
                <div className="admin-diagnostic__detail">
                  <p>{failure.detail}</p>
                  <div>
                    <TooltipText
                      className="admin-diagnostic__correlation"
                      label={failure.correlationId}
                    />
                    <button
                      className="button button--quiet"
                      onClick={() =>
                        void copyCorrelationId(failure.correlationId)
                      }
                      type="button"
                    >
                      Копировать ID
                    </button>
                  </div>
                </div>
              </details>
            ))}
          </div>
        ) : (
          <div className="admin-feedback admin-feedback--empty">
            <Check aria-hidden="true" size={18} />
            Сбоев по выбранному фильтру нет
          </div>
        )
      ) : null}
      {historyView === "audits" && audits.data ? (
        auditItems.length ? (
          <div className="admin-diagnostics" data-testid="audit-history">
            {auditItems.map((entry) => (
              <details className="admin-diagnostic" key={entry.id}>
                <summary>
                  <span
                    aria-hidden="true"
                    className={`admin-diagnostic__mark admin-diagnostic__mark--audit-${entry.source}`}
                  />
                  <span className="admin-diagnostic__title">
                    <strong>{entry.action}</strong>
                    <small>
                      {auditSourceLabels[entry.source]}
                      {entry.actorId
                        ? ` · пользователь #${entry.actorId}`
                        : " · системное событие"}
                    </small>
                  </span>
                  <time dateTime={entry.createdAt}>
                    {formatAdminDate(entry.createdAt)}
                  </time>
                  <ChevronDown aria-hidden="true" size={15} />
                </summary>
                <div className="admin-diagnostic__detail">
                  <p>{entry.detail ?? "Без дополнительных данных"}</p>
                  <span className="admin-diagnostic__target">
                    {entry.targetType ?? "событие"}
                    {entry.targetId ? ` #${entry.targetId}` : ""}
                  </span>
                </div>
              </details>
            ))}
          </div>
        ) : (
          <div className="admin-feedback admin-feedback--empty">
            <SearchX aria-hidden="true" size={18} />
            Событий по выбранному фильтру нет
          </div>
        )
      ) : null}
      {activeHistory.hasNextPage ? (
        <div className="admin-history__more">
          <button
            className="button button--quiet"
            disabled={activeHistory.isFetchingNextPage}
            onClick={() => void activeHistory.fetchNextPage()}
            type="button"
          >
            {activeHistory.isFetchingNextPage ? (
              <LoaderCircle
                aria-hidden="true"
                className="is-spinning"
                size={14}
              />
            ) : null}
            Показать ещё
          </button>
        </div>
      ) : null}
    </SettingsPage>
  );
}

function SettingsPage({
  admin,
  children,
  description,
  icon: Icon,
  title,
}: {
  admin?: boolean;
  children: React.ReactNode;
  description: string;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <div className="settings-page">
      <header className="settings-page__header">
        <span
          className={
            admin
              ? "settings-page__icon settings-page__icon--admin"
              : "settings-page__icon"
          }
        >
          <Icon aria-hidden="true" size={19} />
        </span>
        <div>
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description>{description}</Dialog.Description>
        </div>
      </header>
      <div className="settings-page__body">{children}</div>
    </div>
  );
}

export function SettingsDialog({
  onOpenChange,
  onSectionChange,
  onSignOut,
  onThemeChange,
  onUserChanged,
  open,
  section,
  theme,
  user,
}: SettingsDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const englishLabels: Record<string, string> = {
    account: "Account",
    ai: "AI",
    appearance: "Appearance",
    files: "Files",
    integrations: "Integrations",
    notifications: "Notifications",
    security: "Security",
    subscription: "Subscription",
  };
  const visibleSections = sections
    .filter((section) => !section.admin || user.role === "admin")
    .map((section) => ({
      ...section,
      label:
        user.language === "en" && englishLabels[section.id]
          ? englishLabels[section.id]
          : section.label,
    }));
  return (
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      <AnimatePresence>
        {open ? (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                animate={{ opacity: 1 }}
                className="dialog-overlay settings-overlay"
                exit={{ opacity: 0 }}
                initial={{ opacity: 0 }}
              />
            </Dialog.Overlay>
            <Dialog.Content
              asChild
              onOpenAutoFocus={(event) => {
                event.preventDefault();
                window.requestAnimationFrame(() => {
                  dialogRef.current
                    ?.querySelector<HTMLElement>(
                      '[role="tab"][data-state="active"]',
                    )
                    ?.focus();
                });
              }}
            >
              <motion.div
                animate={{ opacity: 1, scale: 1 }}
                className="settings-dialog"
                exit={{ opacity: 0, scale: 0.98 }}
                initial={{ opacity: 0, scale: 0.98 }}
                ref={dialogRef}
                transition={{ duration: 0.18 }}
              >
                <Tabs.Root
                  className="settings-layout"
                  onValueChange={onSectionChange}
                  orientation="vertical"
                  value={section}
                >
                  <aside className="settings-navigation">
                    <div className="settings-navigation__title">
                      <span>
                        <Settings2 size={17} />
                        {text(user.language, "Настройки", "Settings")}
                      </span>
                      <div className="settings-navigation__actions">
                        <AppIconButton
                          className="mobile-only"
                          label="Выйти"
                          onClick={() => void onSignOut()}
                        >
                          <LogOut aria-hidden="true" size={17} />
                        </AppIconButton>
                      </div>
                    </div>
                    <Tabs.List
                      aria-label={text(
                        user.language,
                        "Разделы настроек",
                        "Settings sections",
                      )}
                      className="settings-tabs"
                    >
                      {visibleSections.map((section, index) => {
                        const Icon = section.icon;
                        return (
                          <div key={section.id}>
                            {section.admin &&
                            !visibleSections[index - 1]?.admin ? (
                              <p className="settings-tabs__group">
                                Администрирование
                              </p>
                            ) : null}
                            <Tabs.Trigger
                              className="settings-tab"
                              value={section.id}
                            >
                              <Icon aria-hidden="true" size={16} />
                              <span>{section.label}</span>
                            </Tabs.Trigger>
                          </div>
                        );
                      })}
                    </Tabs.List>
                    <div className="settings-user">
                      <div className="avatar">{initials(user.name)}</div>
                      <div className="settings-user__identity">
                        <strong>{user.name}</strong>
                        <span>{user.role === "admin" ? "admin" : "user"}</span>
                      </div>
                      <AppIconButton
                        className="settings-user__signout"
                        label="Выйти"
                        onClick={() => void onSignOut()}
                      >
                        <LogOut aria-hidden="true" size={16} />
                      </AppIconButton>
                    </div>
                  </aside>
                  <main className="settings-content">
                    <Tabs.Content value="account">
                      <AccountSettings
                        onUserChanged={onUserChanged}
                        user={user}
                      />
                    </Tabs.Content>
                    <Tabs.Content value="subscription">
                      <SubscriptionSettings language={user.language} />
                    </Tabs.Content>
                    <Tabs.Content value="files">
                      <FileSettings language={user.language} />
                    </Tabs.Content>
                    <Tabs.Content value="notifications">
                      <NotificationSettings language={user.language} />
                    </Tabs.Content>
                    <Tabs.Content value="security">
                      <SecuritySettings
                        onUserChanged={onUserChanged}
                        user={user}
                      />
                    </Tabs.Content>
                    <Tabs.Content value="appearance">
                      <AppearanceSettings
                        onThemeChange={onThemeChange}
                        onUserChanged={onUserChanged}
                        theme={theme}
                        user={user}
                      />
                    </Tabs.Content>
                    <Tabs.Content value="ai">
                      <AiSettings onUserChanged={onUserChanged} user={user} />
                    </Tabs.Content>
                    <Tabs.Content value="integrations">
                      <IntegrationSettings isAdmin={user.role === "admin"} />
                    </Tabs.Content>
                    {user.role === "admin" ? (
                      <>
                        <Tabs.Content value="admin-users">
                          <AdminUsers />
                        </Tabs.Content>
                        <Tabs.Content value="admin-plans">
                          <AdminPlans />
                        </Tabs.Content>
                        <Tabs.Content value="admin-ai">
                          <AdminAi />
                        </Tabs.Content>
                        <Tabs.Content value="admin-system">
                          <AdminSystem />
                        </Tabs.Content>
                        <Tabs.Content value="admin-monitoring">
                          <AdminMonitoring />
                        </Tabs.Content>
                      </>
                    ) : null}
                  </main>
                </Tabs.Root>
                <Dialog.Close
                  aria-label={text(
                    user.language,
                    "Закрыть настройки",
                    "Close settings",
                  )}
                  className="icon-button settings-close"
                >
                  <X aria-hidden="true" size={18} />
                </Dialog.Close>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}
