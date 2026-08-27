import {
  isCorrelationId,
  type AuthEmailJob,
  type SmtpEnvironment,
} from "@notes/config";
import { Worker } from "bullmq";
import nodemailer, { type Transporter } from "nodemailer";

import { parseRedisConnection } from "./queue.js";
import type { WorkerMetrics } from "./metrics.js";

export interface AuthEmailRuntime {
  close(): Promise<void>;
  ready(): Promise<void>;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '"': "&quot;",
        "&": "&amp;",
        "'": "&#39;",
        "<": "&lt;",
        ">": "&gt;",
      })[character] ?? character,
  );
}

export function createAuthEmailMessage(job: AuthEmailJob): {
  html: string;
  subject: string;
  text: string;
} {
  const url = new URL(job.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Auth email URL must use http:// or https://");
  }

  const isVerification = job.kind === "verification";
  const subject = isVerification
    ? "Confirm your Notes AI email"
    : "Reset your Notes AI password";
  const action = isVerification ? "confirm your email" : "reset your password";
  const safeUrl = escapeHtml(url.toString());

  return {
    html: `<p>Use the link below to ${action}.</p><p><a href="${safeUrl}">${subject}</a></p><p>If you did not request this, ignore this email.</p>`,
    subject,
    text: `Use this link to ${action}:\n\n${url.toString()}\n\nIf you did not request this, ignore this email.`,
  };
}

function isAuthEmailJob(value: unknown): value is AuthEmailJob {
  if (!value || typeof value !== "object") {
    return false;
  }
  const job = value as Partial<AuthEmailJob>;
  return (
    (job.kind === "verification" || job.kind === "password-reset") &&
    isCorrelationId(job.correlationId) &&
    typeof job.recipient === "string" &&
    job.recipient.length > 3 &&
    typeof job.url === "string"
  );
}

export function createAuthEmailRuntime(
  redisUrl: string,
  smtp: SmtpEnvironment,
  metrics: WorkerMetrics,
): AuthEmailRuntime {
  const transporter: Transporter = nodemailer.createTransport({
    auth:
      smtp.SMTP_USER && smtp.SMTP_PASS
        ? { pass: smtp.SMTP_PASS, user: smtp.SMTP_USER }
        : undefined,
    host: smtp.SMTP_HOST,
    port: smtp.SMTP_PORT,
    secure: smtp.SMTP_SECURE,
  });
  const worker = new Worker<AuthEmailJob>(
    "auth-email",
    async (job) =>
      metrics.measureJob("auth-email", job.data?.kind, async () => {
        if (!isAuthEmailJob(job.data)) {
          throw new Error("Invalid auth email job");
        }
        const message = createAuthEmailMessage(job.data);
        await transporter.sendMail({
          ...message,
          from: smtp.SMTP_FROM,
          headers: { "X-Notes-Correlation-Id": job.data.correlationId },
          to: job.data.recipient,
        });
      }),
    {
      concurrency: 4,
      connection: parseRedisConnection(redisUrl),
      prefix: "notes",
    },
  );

  return {
    async close() {
      await worker.close();
      transporter.close();
    },
    async ready() {
      await Promise.all([worker.waitUntilReady(), transporter.verify()]);
    },
  };
}
