"use client";

import {
  Bot,
  Check,
  Clipboard,
  FlaskConical,
  Link2,
  LoaderCircle,
  LogOut,
  Save,
  Send,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  integrationsApi,
  type AdminIntegration,
  type IntegrationPermissions,
  type IntegrationProvider,
  type UserIntegration,
} from "./integrations-api";
import { AppSwitch, SearchableSelect } from "./ui-controls";

const providers: IntegrationProvider[] = ["telegram", "vk"];

const permissionLabels: Array<[keyof IntegrationPermissions, string]> = [
  ["readNotes", "Читать заметки"],
  ["writeNotes", "Создавать и изменять"],
  ["deleteNotes", "Удалять заметки"],
  ["manageTags", "Управлять тегами"],
  ["useTemplates", "Использовать шаблоны"],
  ["useVersions", "Работать с версиями"],
  ["listAttachments", "Получать и отправлять файлы"],
  ["createShareLinks", "Создавать публичные ссылки"],
];

function providerName(provider: IntegrationProvider) {
  return provider === "telegram" ? "Telegram" : "ВКонтакте";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Не удалось выполнить запрос";
}

function nullableLimit(value: string): number | null {
  return value.trim() ? Number(value) : null;
}

function AdminChannel({
  onSaved,
  provider,
  settings,
}: {
  onSaved(value: AdminIntegration): void;
  provider: IntegrationProvider;
  settings: AdminIntegration;
}) {
  const [form, setForm] = useState({
    accessToken: "",
    allowSecrets: settings.allowSecrets,
    botToken: "",
    confirmationCode: settings.confirmationCode ?? "",
    dailyReadLimit: settings.dailyReadLimit?.toString() ?? "",
    dailyRequestLimit: settings.dailyRequestLimit?.toString() ?? "",
    dailyWriteLimit: settings.dailyWriteLimit?.toString() ?? "",
    enabled: settings.enabled,
    groupId: settings.groupId ?? "",
    requireConfirmation: settings.requireConfirmation,
    secret: "",
    webhookUrl: settings.webhookUrl ?? "",
  });
  const [busy, setBusy] = useState<"save" | "test" | null>(null);

  async function save() {
    setBusy("save");
    try {
      const updated = await integrationsApi.updateAdmin(provider, {
        allowSecrets: form.allowSecrets,
        confirmationCode: form.confirmationCode || null,
        dailyReadLimit: nullableLimit(form.dailyReadLimit),
        dailyRequestLimit: nullableLimit(form.dailyRequestLimit),
        dailyWriteLimit: nullableLimit(form.dailyWriteLimit),
        enabled: form.enabled,
        groupId: form.groupId || null,
        requireConfirmation: form.requireConfirmation,
        webhookUrl: form.webhookUrl || null,
        ...(form.accessToken ? { accessToken: form.accessToken } : {}),
        ...(form.botToken ? { botToken: form.botToken } : {}),
        ...(form.secret ? { secret: form.secret } : {}),
      });
      setForm((current) => ({
        ...current,
        accessToken: "",
        botToken: "",
        secret: "",
      }));
      onSaved(updated);
      toast.success(`${providerName(provider)}: настройки сохранены`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function testConnection() {
    setBusy("test");
    try {
      const result = await integrationsApi.test(provider);
      if (result.status === "ok")
        toast.success(`Подключено: ${result.identity}`);
      else toast.error(result.error ?? "Проверка подключения не пройдена");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <details className="integration-admin">
      <summary>
        <ShieldCheck aria-hidden="true" size={16} />
        Администрирование канала
        <span
          className={
            settings.lastCheckStatus === "ok"
              ? "status status--success"
              : "status"
          }
        >
          {settings.lastCheckStatus === "ok" ? "Проверен" : "Не проверен"}
        </span>
      </summary>
      <div className="integration-admin__body">
        <label className="field-label field-label--wide">
          <span>Webhook URL</span>
          <input
            onChange={(event) =>
              setForm({ ...form, webhookUrl: event.target.value })
            }
            placeholder="https://notes.example/api/integrations/webhooks/..."
            type="url"
            value={form.webhookUrl}
          />
        </label>
        {provider === "telegram" ? (
          <label className="field-label">
            <span>
              Bot token{" "}
              {settings.botTokenHint ? `· ${settings.botTokenHint}` : ""}
            </span>
            <input
              autoComplete="new-password"
              onChange={(event) =>
                setForm({ ...form, botToken: event.target.value })
              }
              placeholder={
                settings.hasBotToken
                  ? "Оставьте пустым, чтобы сохранить"
                  : "Токен BotFather"
              }
              type="password"
              value={form.botToken}
            />
          </label>
        ) : (
          <label className="field-label">
            <span>
              Access token{" "}
              {settings.accessTokenHint ? `· ${settings.accessTokenHint}` : ""}
            </span>
            <input
              autoComplete="new-password"
              onChange={(event) =>
                setForm({ ...form, accessToken: event.target.value })
              }
              placeholder={
                settings.hasAccessToken
                  ? "Оставьте пустым, чтобы сохранить"
                  : "Токен сообщества"
              }
              type="password"
              value={form.accessToken}
            />
          </label>
        )}
        <label className="field-label">
          <span>
            Webhook secret{" "}
            {settings.secretHint ? `· ${settings.secretHint}` : ""}
          </span>
          <input
            autoComplete="new-password"
            onChange={(event) =>
              setForm({ ...form, secret: event.target.value })
            }
            placeholder={
              settings.hasSecret
                ? "Оставьте пустым, чтобы сохранить"
                : "Секрет проверки"
            }
            type="password"
            value={form.secret}
          />
        </label>
        {provider === "vk" ? (
          <>
            <label className="field-label">
              <span>ID сообщества</span>
              <input
                onChange={(event) =>
                  setForm({ ...form, groupId: event.target.value })
                }
                value={form.groupId}
              />
            </label>
            <label className="field-label">
              <span>Строка подтверждения</span>
              <input
                onChange={(event) =>
                  setForm({ ...form, confirmationCode: event.target.value })
                }
                value={form.confirmationCode}
              />
            </label>
          </>
        ) : null}
        <div className="integration-limits field-label--wide">
          <label className="field-label">
            <span>Запросов в день</span>
            <input
              min="1"
              onChange={(event) =>
                setForm({ ...form, dailyRequestLimit: event.target.value })
              }
              placeholder="Без лимита"
              type="number"
              value={form.dailyRequestLimit}
            />
          </label>
          <label className="field-label">
            <span>Чтений в день</span>
            <input
              min="1"
              onChange={(event) =>
                setForm({ ...form, dailyReadLimit: event.target.value })
              }
              placeholder="Без лимита"
              type="number"
              value={form.dailyReadLimit}
            />
          </label>
          <label className="field-label">
            <span>Изменений в день</span>
            <input
              min="1"
              onChange={(event) =>
                setForm({ ...form, dailyWriteLimit: event.target.value })
              }
              placeholder="Без лимита"
              type="number"
              value={form.dailyWriteLimit}
            />
          </label>
        </div>
        <div className="integration-admin__switch">
          <span>Принимать новые события</span>
          <AppSwitch
            checked={form.enabled}
            label={`Включить ${providerName(provider)}`}
            onCheckedChange={(enabled) => setForm({ ...form, enabled })}
          />
        </div>
        <div className="integration-admin__switch">
          <span>Разрешить секретные поля</span>
          <AppSwitch
            checked={form.allowSecrets}
            label="Разрешить секретные поля"
            onCheckedChange={(allowSecrets) =>
              setForm({ ...form, allowSecrets })
            }
          />
        </div>
        <div className="integration-admin__switch">
          <span>Подтверждать изменения</span>
          <AppSwitch
            checked={form.requireConfirmation}
            label="Подтверждать изменения"
            onCheckedChange={(requireConfirmation) =>
              setForm({ ...form, requireConfirmation })
            }
          />
        </div>
        <div className="settings-actions integration-admin__actions">
          <button
            className="button button--quiet"
            disabled={busy !== null}
            onClick={testConnection}
            type="button"
          >
            {busy === "test" ? (
              <LoaderCircle className="is-spinning" size={15} />
            ) : (
              <FlaskConical size={15} />
            )}
            Проверить
          </button>
          <button
            className="button button--primary"
            disabled={busy !== null}
            onClick={save}
            type="button"
          >
            {busy === "save" ? (
              <LoaderCircle className="is-spinning" size={15} />
            ) : (
              <Save size={15} />
            )}
            Сохранить
          </button>
        </div>
      </div>
    </details>
  );
}

function UserChannel({
  admin,
  onAdminChanged,
  onChanged,
  settings,
}: {
  admin?: AdminIntegration;
  onAdminChanged(value: AdminIntegration): void;
  onChanged(value: UserIntegration): void;
  settings: UserIntegration;
}) {
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(
    null,
  );

  async function update(input: Record<string, unknown>) {
    setBusy(true);
    try {
      onChanged(await integrationsApi.updateUser(settings.provider, input));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function createCode() {
    setBusy(true);
    try {
      setCode(await integrationsApi.createLinkCode(settings.provider));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    setBusy(true);
    try {
      onChanged(await integrationsApi.unlink(settings.provider));
      setCode(null);
      toast.success(`${providerName(settings.provider)} отключен`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const Icon = settings.provider === "telegram" ? Send : Link2;
  return (
    <section className="integration-channel">
      <header className="integration-channel__header">
        <span
          className={`integration-channel__icon integration-channel__icon--${settings.provider}`}
        >
          <Icon aria-hidden="true" size={18} />
        </span>
        <div>
          <strong>{providerName(settings.provider)}</strong>
          <span>
            {settings.linkedExternalId
              ? settings.linkedUsername
                ? `@${settings.linkedUsername}`
                : `ID ${settings.linkedExternalId}`
              : "Аккаунт не привязан"}
          </span>
        </div>
        <span
          className={
            settings.linkedExternalId && settings.enabled
              ? "status status--success"
              : "status"
          }
        >
          {settings.linkedExternalId && settings.enabled
            ? "Активен"
            : "Отключен"}
        </span>
      </header>

      {code ? (
        <div className="integration-link-code" role="status">
          <div>
            <span>
              Одноразовый код до{" "}
              {new Date(code.expiresAt).toLocaleTimeString("ru", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <strong>{code.code}</strong>
          </div>
          <button
            aria-label="Скопировать код привязки"
            className="icon-button"
            onClick={() =>
              void navigator.clipboard
                .writeText(code.code)
                .then(() => toast.success("Код скопирован"))
            }
            type="button"
          >
            <Clipboard size={16} />
          </button>
        </div>
      ) : null}

      <div className="integration-channel__commands">
        {settings.linkedExternalId ? (
          <button
            className="button button--danger"
            disabled={busy}
            onClick={unlink}
            type="button"
          >
            <LogOut size={15} />
            Отвязать
          </button>
        ) : (
          <button
            className="button button--primary"
            disabled={busy || !settings.available}
            onClick={createCode}
            type="button"
          >
            {busy ? (
              <LoaderCircle className="is-spinning" size={15} />
            ) : (
              <Bot size={15} />
            )}
            Создать код
          </button>
        )}
        {!settings.available ? (
          <span className="integration-channel__hint">
            Канал выключен администратором
          </span>
        ) : null}
      </div>

      <details className="integration-access">
        <summary>Доступ и ограничения</summary>
        <div className="integration-access__body">
          <label className="integration-select">
            <span>Режим</span>
            <SearchableSelect
              ariaLabel="Режим доступа"
              disabled={busy}
              onValueChange={(accessMode) => void update({ accessMode })}
              options={[
                { label: "Только чтение", value: "read" },
                { label: "Чтение и запись", value: "write" },
              ]}
              value={settings.accessMode}
            />
          </label>
          <div className="integration-toggle-row">
            <span>Канал активен</span>
            <AppSwitch
              checked={settings.enabled}
              label="Канал активен"
              onCheckedChange={(enabled) => void update({ enabled })}
            />
          </div>
          <div className="integration-toggle-row">
            <span>Разрешить секретные поля</span>
            <AppSwitch
              checked={settings.allowSecrets}
              label="Разрешить секретные поля"
              onCheckedChange={(allowSecrets) => void update({ allowSecrets })}
            />
          </div>
          <div className="integration-limits">
            {[
              [
                "dailyRequestLimit",
                "Запросов в день",
                settings.dailyRequestLimit,
              ],
              ["dailyReadLimit", "Чтений в день", settings.dailyReadLimit],
              ["dailyWriteLimit", "Изменений в день", settings.dailyWriteLimit],
            ].map(([key, label, value]) => (
              <label className="field-label" key={String(key)}>
                <span>{label}</span>
                <input
                  defaultValue={value === null ? "" : String(value)}
                  min="1"
                  onBlur={(event) =>
                    void update({
                      [String(key)]: nullableLimit(event.target.value),
                    })
                  }
                  placeholder="По умолчанию"
                  type="number"
                />
              </label>
            ))}
          </div>
          <div className="integration-permissions">
            {permissionLabels.map(([key, label]) => (
              <label key={key}>
                <input
                  checked={settings.permissions[key]}
                  disabled={busy}
                  onChange={(event) =>
                    void update({
                      permissions: { [key]: event.target.checked },
                    })
                  }
                  type="checkbox"
                />
                <Check aria-hidden="true" size={13} />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>
      </details>
      {admin ? (
        <AdminChannel
          onSaved={onAdminChanged}
          provider={settings.provider}
          settings={admin}
        />
      ) : null}
    </section>
  );
}

export function IntegrationSettings({ isAdmin }: { isAdmin: boolean }) {
  const [users, setUsers] = useState<UserIntegration[]>([]);
  const [admins, setAdmins] = useState<AdminIntegration[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void Promise.all([
      integrationsApi.listUser(),
      isAdmin ? integrationsApi.listAdmin() : Promise.resolve([]),
    ])
      .then(([userRows, adminRows]) => {
        if (!active) return;
        setUsers(userRows);
        setAdmins(adminRows);
      })
      .catch((error: unknown) => {
        if (active) toast.error(errorMessage(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isAdmin]);

  if (loading) {
    return (
      <div className="settings-loading">
        <LoaderCircle className="is-spinning" size={18} />
        Загружаем интеграции
      </div>
    );
  }

  return (
    <div className="integration-list">
      {providers.map((provider) => {
        const settings = users.find((item) => item.provider === provider);
        if (!settings) return null;
        return (
          <UserChannel
            admin={admins.find((item) => item.provider === provider)}
            key={provider}
            onAdminChanged={(value) =>
              setAdmins((current) =>
                current.map((item) =>
                  item.provider === provider ? value : item,
                ),
              )
            }
            onChanged={(value) =>
              setUsers((current) =>
                current.map((item) =>
                  item.provider === provider ? value : item,
                ),
              )
            }
            settings={settings}
          />
        );
      })}
    </div>
  );
}
