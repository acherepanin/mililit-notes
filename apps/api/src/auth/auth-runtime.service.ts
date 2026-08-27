import { randomUUID } from "node:crypto";

import {
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { redisStorage } from "@better-auth/redis-storage";
import { passkey } from "@better-auth/passkey";
import { type AuthEmailJob, readAuthEnvironment } from "@notes/config";
import {
  betterAuthSchema,
  createDatabase,
  createDatabasePool,
} from "@notes/db";
import { Queue } from "bullmq";
import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { twoFactor, username } from "better-auth/plugins";
import { Redis } from "ioredis";

import {
  hashPassword,
  isLegacyPasswordHash,
  verifyPassword,
} from "./password.js";
import { withDefaultAuthCallback } from "./auth-email-url.js";
import { CorrelationContextService } from "../observability/correlation-context.service.js";

export type AuthenticatedRole = "admin" | "user";

export interface AuthenticatedPrincipal {
  id: number;
  role: AuthenticatedRole;
}

interface AuthHandler {
  api: {
    getSession(input: { headers: Headers }): Promise<{
      user: { id: string; role?: unknown };
    } | null>;
  };
  handler(request: Request): Promise<Response>;
}

@Injectable()
export class AuthRuntimeService implements OnModuleDestroy, OnModuleInit {
  constructor(
    @Inject(CorrelationContextService)
    private readonly correlation: CorrelationContextService,
  ) {}

  readonly environment = readAuthEnvironment(process.env);

  private readonly databasePool = createDatabasePool(
    this.environment.DATABASE_URL,
    { max: 8 },
  );
  private readonly database = createDatabase(this.databasePool);
  private readonly redis = new Redis(this.environment.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: null,
  });
  private readonly emailQueue = new Queue<AuthEmailJob>("auth-email", {
    connection: this.redis,
    prefix: "notes",
  });

  readonly auth: AuthHandler = betterAuth({
    advanced: {
      database: {
        generateId: ({ model }) => (model === "user" ? false : randomUUID()),
      },
      ipAddress: {
        ipAddressHeaders: ["x-forwarded-for"],
      },
      useSecureCookies:
        new URL(this.environment.APP_ORIGIN).protocol === "https:",
    },
    basePath: "/api/auth",
    baseURL: this.environment.BETTER_AUTH_URL,
    database: drizzleAdapter(this.database, {
      provider: "pg",
      schema: betterAuthSchema,
    }),
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await this.databasePool.query(
              `update users
                  set email = $2, updated_at = now()
                where id = $1 and email is null`,
              [user.id, user.email],
            );
          },
        },
      },
    },
    emailAndPassword: {
      autoSignIn: false,
      enabled: true,
      maxPasswordLength: 128,
      minPasswordLength: 12,
      password: {
        hash: hashPassword,
        verify: verifyPassword,
      },
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ url, user }) => {
        await this.enqueueEmail({
          kind: "password-reset",
          recipient: user.email,
          url,
        });
      },
    },
    emailVerification: {
      autoSignInAfterVerification: false,
      sendOnSignUp: true,
      sendVerificationEmail: async ({ url, user }) => {
        await this.enqueueEmail({
          kind: "verification",
          recipient: user.email,
          url: withDefaultAuthCallback(url, this.environment.APP_ORIGIN),
        });
      },
    },
    hooks: {
      after: createAuthMiddleware(async (context) => {
        if (
          context.path !== "/sign-in/username" &&
          context.path !== "/sign-in/email"
        ) {
          return;
        }

        const userId = context.context.newSession?.user.id;
        const password = context.body?.password;
        if (!userId || typeof password !== "string") {
          return;
        }

        await this.rehashLegacyPassword(userId, password);
      }),
    },
    plugins: [
      username({
        maxUsernameLength: 64,
        minUsernameLength: 3,
        usernameValidator: (value) => /^[a-zA-Z0-9._-]+$/.test(value),
      }),
      twoFactor({
        issuer: "Notes AI",
      }),
      passkey({
        origin: this.environment.WEBAUTHN_ORIGIN,
        rpID: this.environment.WEBAUTHN_RP_ID,
        rpName: "Notes AI",
      }),
    ],
    rateLimit: {
      enabled: true,
      max: 100,
      storage: "secondary-storage",
      window: 60,
    },
    secret: this.environment.BETTER_AUTH_SECRET,
    secondaryStorage: redisStorage({
      client: this.redis,
      keyPrefix: "notes:auth:",
    }),
    session: {
      expiresIn: 60 * 60 * 24 * 14,
      freshAge: 60 * 5,
      storeSessionInDatabase: true,
      updateAge: 60 * 60 * 24,
    },
    trustedOrigins: [this.environment.APP_ORIGIN],
    user: {
      additionalFields: {
        emailIsPlaceholder: {
          defaultValue: false,
          input: false,
          required: true,
          type: "boolean",
        },
        language: {
          defaultValue: "ru",
          input: true,
          required: true,
          type: ["ru", "en"],
        },
        backgroundMotion: {
          defaultValue: true,
          input: true,
          required: true,
          type: "boolean",
        },
        editorBlockSpacing: {
          defaultValue: 12,
          input: true,
          required: true,
          type: "number",
        },
        editorContentWidth: {
          defaultValue: 920,
          input: true,
          required: true,
          type: "number",
        },
        editorPagePadding: {
          defaultValue: 24,
          input: true,
          required: true,
          type: "number",
        },
        panelOpacity: {
          defaultValue: 78,
          input: true,
          required: true,
          type: "number",
        },
        preferredAiModel: {
          input: true,
          required: false,
          type: "string",
        },
        role: {
          defaultValue: "user",
          input: false,
          required: true,
          type: ["user", "admin"],
        },
        starfall: {
          defaultValue: true,
          input: true,
          required: true,
          type: "boolean",
        },
        theme: {
          defaultValue: "system",
          input: true,
          required: true,
          type: ["dark", "light", "system"],
        },
      },
    },
  });

  async onModuleInit(): Promise<void> {
    await Promise.all([this.redis.ping(), this.emailQueue.waitUntilReady()]);
  }

  async onModuleDestroy(): Promise<void> {
    await this.emailQueue.close();
    await this.redis.quit();
    await this.databasePool.end();
  }

  async resolveSession(
    headers: Headers,
  ): Promise<AuthenticatedPrincipal | null> {
    const session = await this.auth.api.getSession({ headers });
    if (!session) {
      return null;
    }

    const id = Number(session.user.id);
    const role = session.user.role;
    if (
      !Number.isSafeInteger(id) ||
      id <= 0 ||
      (role !== "admin" && role !== "user")
    ) {
      return null;
    }

    return { id, role };
  }

  private async enqueueEmail(
    job: Omit<AuthEmailJob, "correlationId">,
  ): Promise<void> {
    const correlatedJob: AuthEmailJob = {
      ...job,
      correlationId: this.correlation.getOrCreate(),
    };
    await this.emailQueue.add(job.kind, correlatedJob, {
      attempts: 5,
      backoff: { delay: 2_000, type: "exponential" },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 1_000 },
    });
  }

  private async rehashLegacyPassword(
    userId: string,
    password: string,
  ): Promise<void> {
    const numericUserId = Number(userId);
    if (!Number.isSafeInteger(numericUserId) || numericUserId <= 0) {
      return;
    }

    const account = await this.databasePool.query<{ password: string | null }>(
      `select password
         from auth_accounts
        where user_id = $1 and provider_id = 'credential'`,
      [numericUserId],
    );
    const legacyHash = account.rows[0]?.password ?? null;
    if (!isLegacyPasswordHash(legacyHash)) {
      return;
    }

    const passwordHash = await hashPassword(password);
    const client = await this.databasePool.connect();
    try {
      await client.query("begin");
      const updated = await client.query(
        `update auth_accounts
            set password = $2, updated_at = now()
          where user_id = $1
            and provider_id = 'credential'
            and password = $3`,
        [numericUserId, passwordHash, legacyHash],
      );
      if ((updated.rowCount ?? 0) === 1) {
        await client.query(
          `update users
              set password_hash = $2, last_login_at = now(), updated_at = now()
            where id = $1`,
          [numericUserId, passwordHash],
        );
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}
