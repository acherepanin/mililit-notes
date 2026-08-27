import { z } from "zod";

const serviceEnvironmentSchema = z.object({
  HOST: z.string().min(1).default("0.0.0.0"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535),
});

export type ServiceEnvironment = z.infer<typeof serviceEnvironmentSchema>;

export type EnvironmentSource = Readonly<Record<string, string | undefined>>;

export function readServiceEnvironment(
  source: EnvironmentSource,
  defaultPort: number,
): ServiceEnvironment {
  return serviceEnvironmentSchema.parse({
    ...source,
    PORT: source.PORT ?? defaultPort,
  });
}

export * from "./auth.js";
export * from "./correlation.js";
export * from "./integrations.js";
