"use client";

import DOMPurify from "dompurify";
import {
  Check,
  Clock3,
  Copy,
  FileText,
  LoaderCircle,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ConstellationBackground } from "../../constellation-background";

interface PublicShareData {
  expiresAt: string;
  note: {
    contentHtml: string;
    contentText: string;
    id: number;
    name: string;
    updatedAt: string;
  };
}

function prepareHtml(html: string) {
  const safe = DOMPurify.sanitize(html);
  const document = new DOMParser().parseFromString(safe, "text/html");
  document
    .querySelectorAll<HTMLElement>("[data-copy-field]")
    .forEach((field) => {
      const value = field.dataset.value ?? "";
      const kind = field.dataset.kind ?? "text";
      const secret = ["credential", "password", "secret", "token"].includes(
        kind,
      );
      const code = field.querySelector("code");
      if (code) {
        code.textContent =
          secret && value !== "[secret hidden]" ? "********" : value;
      }
      const button = document.createElement("button");
      button.setAttribute("aria-label", "Скопировать значение");
      button.dataset.copyAction = "true";
      button.textContent = "Скопировать";
      field.append(button);
    });
  return document.body.innerHTML;
}

export function PublicShare({ token }: { token: string }) {
  const [data, setData] = useState<PublicShareData | null>(null);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/share/${encodeURIComponent(token)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Share unavailable");
        setData((await response.json()) as PublicShareData);
      })
      .catch((requestError: unknown) => {
        if (!(
          requestError instanceof DOMException &&
          requestError.name === "AbortError"
        )) {
          setError(true);
        }
      });
    return () => controller.abort();
  }, [token]);

  const html = useMemo(
    () => (data ? prepareHtml(data.note.contentHtml) : ""),
    [data],
  );

  return (
    <main className="public-share">
      <ConstellationBackground activity="idle" />
      <header className="public-share__rail">
        <Link aria-label="Notes AI" className="brand" href="/">
          <span className="public-share__mark">
            <Sparkles aria-hidden="true" size={16} />
          </span>
          <strong>Notes AI</strong>
        </Link>
        {data ? (
          <span>
            <Clock3 aria-hidden="true" size={13} />
            Доступ до{" "}
            {new Intl.DateTimeFormat("ru", {
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              month: "short",
            }).format(new Date(data.expiresAt))}
          </span>
        ) : null}
      </header>
      <section className="public-share__surface">
        {!data && !error ? (
          <div className="public-share__state">
            <LoaderCircle className="is-spinning" size={22} />
            <span>Открываем заметку…</span>
          </div>
        ) : error ? (
          <div className="public-share__state">
            <FileText size={24} />
            <h1>Ссылка недоступна</h1>
            <p>
              Срок действия истек, ссылка отозвана или уже была использована.
            </p>
          </div>
        ) : data ? (
          <article className="public-share__note">
            <header>
              <span>Публичная заметка</span>
              <h1>{data.note.name}</h1>
              <time dateTime={data.note.updatedAt}>
                Обновлена{" "}
                {new Intl.DateTimeFormat("ru", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                }).format(new Date(data.note.updatedAt))}
              </time>
            </header>
            {html ? (
              <div
                className="public-share__content"
                dangerouslySetInnerHTML={{ __html: html }}
                onClick={(event) => {
                  const button = (
                    event.target as HTMLElement
                  ).closest<HTMLElement>("[data-copy-action]");
                  const field =
                    button?.closest<HTMLElement>("[data-copy-field]");
                  if (!button || !field) return;
                  void navigator.clipboard
                    .writeText(field.dataset.value ?? "")
                    .then(() => {
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 1_200);
                    });
                }}
              />
            ) : (
              <p className="public-share__plain">{data.note.contentText}</p>
            )}
            <span aria-live="polite" className="public-share__copied">
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? "Скопировано" : "Поля можно копировать"}
            </span>
          </article>
        ) : null}
      </section>
    </main>
  );
}
