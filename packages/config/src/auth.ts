import { z } from "zod";

import type { EnvironmentSource } from "./index.js";

const connectionUrl = z.url();

const authEnvironmentSchema = z.object({
  APP_ORIGIN: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  DATABASE_URL: connectionUrl.refine(
    (value) =>
      value.startsWith("postgres://") || value.startsWith("postgresql://"),
    "DATABASE_URL must use postgres:// or postgresql://",
  ),
  REDIS_URL: connectionUrl.refine(
    (value) => value.startsWith("redis://") || value.startsWith("rediss://"),
    "REDIS_URL must use redis:// or rediss://",
  ),
  WEBAUTHN_ORIGIN: z.url(),
  WEBAUTHN_RP_ID: z.string().min(1),
});

const smtpEnvironmentSchema = z
  .object({
    SMTP_FROM: z.string().min(3),
    SMTP_HOST: z.string().min(1),
    SMTP_PASS: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65_535),
    SMTP_SECURE: z
      .enum(["true", "false"])
      .transform((value) => value === "true"),
    SMTP_USER: z.string().optional(),
  })
  .superRefine((value, context) => {
    if (Boolean(value.SMTP_USER) !== Boolean(value.SMTP_PASS)) {
      context.addIssue({
        code: "custom",
        message: "SMTP_USER and SMTP_PASS must be configured together",
      });
    }
  });

export interface AuthEmailJob {
  correlationId: string;
  kind: "password-reset" | "verification";
  recipient: string;
  url: string;
}

export type AuthEnvironment = z.infer<typeof authEnvironmentSchema>;
export type SmtpEnvironment = z.infer<typeof smtpEnvironmentSchema>;

export function readAuthEnvironment(
  source: EnvironmentSource,
): AuthEnvironment {
  const appOrigin = source.APP_ORIGIN ?? "http://localhost:3200";
  const authUrl = source.BETTER_AUTH_URL ?? "http://localhost:3201";

  return authEnvironmentSchema.parse({
    ...source,
    APP_ORIGIN: appOrigin,
    BETTER_AUTH_URL: authUrl,
    WEBAUTHN_ORIGIN: source.WEBAUTHN_ORIGIN ?? appOrigin,
    WEBAUTHN_RP_ID: source.WEBAUTHN_RP_ID ?? new URL(appOrigin).hostname,
  });
}

export function readSmtpEnvironment(
  source: EnvironmentSource,
): SmtpEnvironment {
  return smtpEnvironmentSchema.parse({
    ...source,
    SMTP_FROM: source.SMTP_FROM ?? "Notes AI <no-reply@notes.local>",
    SMTP_PORT: source.SMTP_PORT ?? "1025",
    SMTP_SECURE: source.SMTP_SECURE ?? "false",
  });
}
