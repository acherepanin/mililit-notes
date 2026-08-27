"use client";

import {
  Fingerprint,
  KeyRound,
  LoaderCircle,
  MailCheck,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import dynamic from "next/dynamic";
import { type FormEvent, type ReactNode, useState } from "react";

import { authClient } from "./auth-client";

const ConstellationBackground = dynamic(
  () =>
    import("./constellation-background").then(
      (module) => module.ConstellationBackground,
    ),
  { ssr: false },
);

export interface CurrentUser {
  backgroundMotion: boolean;
  email: string;
  editorBlockSpacing: number;
  editorContentWidth: number;
  editorPagePadding: number;
  id: string;
  language: "en" | "ru";
  name: string;
  panelOpacity: number;
  preferredAiModel: string | null;
  role: "admin" | "user";
  sessionCreatedAt: string;
  starfall: boolean;
  theme: "dark" | "light" | "system";
  twoFactorEnabled: boolean;
  username: string;
}

function readRole(value: unknown): CurrentUser["role"] {
  return value === "admin" ? "admin" : "user";
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function AuthScreen({ onAuthenticated }: { onAuthenticated(): void }) {
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"login" | "register" | "totp" | "verify">(
    "login",
  );
  const [pending, setPending] = useState(false);

  const signInWithPasskey = async () => {
    setError("");
    setPending(true);
    const { securityAuthClient } = await import("./security-auth-client");
    const result = await securityAuthClient.signIn.passkey();
    setPending(false);
    if (result.error) {
      setError(result.error.message || "Не удалось войти с ключом доступа.");
      return;
    }
    onAuthenticated();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setPending(true);
    const data = new FormData(event.currentTarget);
    if (mode === "totp") {
      const code = String(data.get("code") ?? "").replace(/\s/g, "");
      const result = await authClient.twoFactor.verifyTotp({
        code,
        trustDevice: true,
      });
      setPending(false);
      if (result.error) {
        setError(result.error.message || "Проверьте одноразовый код.");
        return;
      }
      onAuthenticated();
      return;
    }
    const username = String(data.get("username") ?? "").trim();
    const password = String(data.get("password") ?? "");

    if (mode === "login") {
      const result = await authClient.signIn.username({ password, username });
      setPending(false);
      if (result.error) {
        setError(
          result.error.code === "EMAIL_NOT_VERIFIED"
            ? "Подтвердите адрес электронной почты перед входом."
            : "Проверьте логин и пароль или повторите попытку позже.",
        );
        return;
      }
      if (result.data && "twoFactorRedirect" in result.data) {
        setMode("totp");
        return;
      }
      onAuthenticated();
      return;
    }

    const email = String(data.get("email") ?? "").trim();
    const name = String(data.get("name") ?? "").trim();
    const result = await authClient.signUp.email({
      email,
      name,
      password,
      username,
    });
    setPending(false);
    if (result.error) {
      setError(
        result.error.code === "USERNAME_IS_ALREADY_TAKEN"
          ? "Этот логин уже занят. Выберите другой."
          : "Не удалось создать аккаунт. Проверьте данные и повторите попытку.",
      );
      return;
    }
    setMode("verify");
  };

  return (
    <main className="auth-shell">
      <ConstellationBackground activity="idle" />
      <div className="auth-brand">
        <span className="auth-brand__mark">
          <Sparkles aria-hidden="true" size={20} />
        </span>
        <span>
          <strong>Notes AI</strong>
          <small>Knowledge Observatory</small>
        </span>
      </div>
      <section aria-labelledby="auth-title" className="auth-panel">
        {mode === "verify" ? (
          <div className="auth-verify">
            <span>
              <MailCheck aria-hidden="true" size={24} />
            </span>
            <h1 id="auth-title">Подтвердите почту</h1>
            <p>
              Мы отправили ссылку подтверждения. После перехода по ней вернитесь
              ко входу.
            </p>
            <button
              className="auth-primary"
              onClick={() => setMode("login")}
              type="button"
            >
              Вернуться ко входу
            </button>
          </div>
        ) : (
          <>
            <header className="auth-panel__head">
              <span>
                {mode === "totp" ? (
                  <ShieldCheck aria-hidden="true" size={18} />
                ) : (
                  <KeyRound aria-hidden="true" size={18} />
                )}
              </span>
              <div>
                <h1 id="auth-title">
                  {mode === "totp"
                    ? "Подтвердите вход"
                    : mode === "login"
                      ? "Вход в пространство"
                      : "Создать пространство"}
                </h1>
                <p>
                  {mode === "totp"
                    ? "Введите код из приложения-аутентификатора."
                    : mode === "login"
                      ? "Заметки, файлы и AI остаются в одном контексте."
                      : "Начните с защищённого рабочего пространства."}
                </p>
              </div>
            </header>
            {mode !== "totp" ? (
              <div
                aria-label="Режим авторизации"
                className="auth-mode"
                role="tablist"
              >
                <button
                  aria-selected={mode === "login"}
                  onClick={() => setMode("login")}
                  role="tab"
                  type="button"
                >
                  Войти
                </button>
                <button
                  aria-selected={mode === "register"}
                  onClick={() => setMode("register")}
                  role="tab"
                  type="button"
                >
                  Регистрация
                </button>
              </div>
            ) : null}
            <form className="auth-form" onSubmit={submit}>
              {mode === "totp" ? (
                <label>
                  <span>Одноразовый код</span>
                  <input
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    maxLength={8}
                    name="code"
                    pattern="[0-9]{6,8}"
                    required
                  />
                </label>
              ) : null}
              {mode === "register" ? (
                <>
                  <label>
                    <span>Имя</span>
                    <input autoComplete="name" name="name" required />
                  </label>
                  <label>
                    <span>Электронная почта</span>
                    <input
                      autoComplete="email"
                      name="email"
                      required
                      type="email"
                    />
                  </label>
                </>
              ) : null}
              {mode !== "totp" ? (
                <label>
                  <span>Логин</span>
                  <input
                    autoComplete="username"
                    minLength={3}
                    name="username"
                    pattern="[A-Za-z0-9._-]+"
                    required
                  />
                </label>
              ) : null}
              {mode !== "totp" ? (
                <label>
                  <span>Пароль</span>
                  <input
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                    minLength={mode === "login" ? undefined : 12}
                    name="password"
                    required
                    type="password"
                  />
                </label>
              ) : null}
              {error ? (
                <p className="auth-error" role="alert">
                  {error}
                </p>
              ) : null}
              <button className="auth-primary" disabled={pending} type="submit">
                {pending ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="is-spinning"
                    size={17}
                  />
                ) : null}
                {mode === "totp"
                  ? "Подтвердить"
                  : mode === "login"
                    ? "Войти"
                    : "Создать аккаунт"}
              </button>
              {mode === "login" ? (
                <button
                  className="auth-secondary"
                  disabled={pending}
                  onClick={() => void signInWithPasskey()}
                  type="button"
                >
                  <Fingerprint aria-hidden="true" size={17} />
                  Войти с ключом доступа
                </button>
              ) : null}
              {mode === "totp" ? (
                <button
                  className="auth-secondary"
                  onClick={() => {
                    setError("");
                    setMode("login");
                  }}
                  type="button"
                >
                  Вернуться
                </button>
              ) : null}
            </form>
          </>
        )}
      </section>
    </main>
  );
}

export function AuthBoundary({
  children,
}: {
  children(
    user: CurrentUser,
    signOut: () => Promise<void>,
    refreshUser: () => Promise<void>,
  ): ReactNode;
}) {
  const session = authClient.useSession();

  if (session.isPending) {
    return (
      <main className="auth-shell auth-shell--loading">
        <ConstellationBackground activity="idle" />
        <LoaderCircle
          aria-label="Загрузка сессии"
          className="is-spinning"
          size={24}
        />
      </main>
    );
  }
  if (!session.data) {
    return <AuthScreen onAuthenticated={() => void session.refetch()} />;
  }

  const rawUser = session.data.user as typeof session.data.user & {
    backgroundMotion?: unknown;
    editorBlockSpacing?: unknown;
    editorContentWidth?: unknown;
    editorPagePadding?: unknown;
    language?: unknown;
    panelOpacity?: unknown;
    preferredAiModel?: unknown;
    role?: unknown;
    starfall?: unknown;
    theme?: unknown;
    twoFactorEnabled?: unknown;
    username?: unknown;
  };
  const user: CurrentUser = {
    backgroundMotion: rawUser.backgroundMotion !== false,
    email: rawUser.email,
    editorBlockSpacing: readNumber(rawUser.editorBlockSpacing, 12),
    editorContentWidth: readNumber(rawUser.editorContentWidth, 920),
    editorPagePadding: readNumber(rawUser.editorPagePadding, 24),
    id: rawUser.id,
    language: rawUser.language === "en" ? "en" : "ru",
    name: rawUser.name,
    panelOpacity: readNumber(rawUser.panelOpacity, 78),
    preferredAiModel:
      typeof rawUser.preferredAiModel === "string"
        ? rawUser.preferredAiModel
        : null,
    role: readRole(rawUser.role),
    sessionCreatedAt: new Date(session.data.session.createdAt).toISOString(),
    starfall: rawUser.starfall !== false,
    theme:
      rawUser.theme === "dark" || rawUser.theme === "light"
        ? rawUser.theme
        : "system",
    twoFactorEnabled: rawUser.twoFactorEnabled === true,
    username: typeof rawUser.username === "string" ? rawUser.username : "",
  };
  const signOut = async () => {
    await authClient.signOut();
    await session.refetch();
  };

  return children(user, signOut, async () => {
    await session.refetch();
  });
}
