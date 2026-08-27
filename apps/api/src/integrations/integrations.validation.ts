import { BadRequestException } from "@nestjs/common";

import type {
  IntegrationPermissions,
  IntegrationProvider,
  UpdateAdminIntegrationInput,
  UpdateUserIntegrationInput,
} from "./integrations.types.js";

const permissionNames = new Set<keyof IntegrationPermissions>([
  "createShareLinks",
  "deleteNotes",
  "listAttachments",
  "manageTags",
  "readNotes",
  "useTemplates",
  "useVersions",
  "writeNotes",
]);

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestException("body must be an object");
  }
  return value as Record<string, unknown>;
}

function optionalBoolean(value: unknown, name: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new BadRequestException(`${name} must be a boolean`);
  }
  return value;
}

function optionalLimit(
  value: unknown,
  name: string,
): number | null | undefined {
  if (value === undefined || value === null) return value;
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < 1 ||
    Number(value) > 1_000_000
  ) {
    throw new BadRequestException(
      `${name} must be null or an integer from 1 to 1000000`,
    );
  }
  return Number(value);
}

function optionalString(
  value: unknown,
  name: string,
  max: number,
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new BadRequestException(
      `${name} must contain 1 to ${max} characters`,
    );
  }
  return value.trim();
}

function nullableString(
  value: unknown,
  name: string,
  max: number,
): string | null | undefined {
  if (value === undefined || value === null) return value;
  return optionalString(value, name, max) ?? null;
}

function rejectUnknown(
  body: Record<string, unknown>,
  allowed: Set<string>,
): void {
  const unknown = Object.keys(body).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new BadRequestException(`Unsupported fields: ${unknown.join(", ")}`);
  }
}

export function parseIntegrationProvider(value: string): IntegrationProvider {
  if (value === "telegram" || value === "vk") return value;
  throw new BadRequestException("Unsupported integration provider");
}

export function parseUserIntegration(
  value: unknown,
): UpdateUserIntegrationInput {
  const body = record(value);
  rejectUnknown(
    body,
    new Set([
      "accessMode",
      "allowSecrets",
      "dailyReadLimit",
      "dailyRequestLimit",
      "dailyWriteLimit",
      "enabled",
      "permissions",
    ]),
  );
  let permissions: Partial<IntegrationPermissions> | undefined;
  if (body.permissions !== undefined) {
    const input = record(body.permissions);
    rejectUnknown(input, new Set(permissionNames));
    permissions = {};
    for (const [name, enabled] of Object.entries(input)) {
      const parsed = optionalBoolean(enabled, `permissions.${name}`);
      if (parsed !== undefined) {
        permissions[name as keyof IntegrationPermissions] = parsed;
      }
    }
  }
  const accessMode = body.accessMode;
  if (
    accessMode !== undefined &&
    accessMode !== "read" &&
    accessMode !== "write"
  ) {
    throw new BadRequestException("accessMode must be read or write");
  }
  const result: UpdateUserIntegrationInput = {};
  if (accessMode !== undefined) result.accessMode = accessMode;
  const allowSecrets = optionalBoolean(body.allowSecrets, "allowSecrets");
  if (allowSecrets !== undefined) result.allowSecrets = allowSecrets;
  const dailyReadLimit = optionalLimit(body.dailyReadLimit, "dailyReadLimit");
  if (dailyReadLimit !== undefined) result.dailyReadLimit = dailyReadLimit;
  const dailyRequestLimit = optionalLimit(
    body.dailyRequestLimit,
    "dailyRequestLimit",
  );
  if (dailyRequestLimit !== undefined)
    result.dailyRequestLimit = dailyRequestLimit;
  const dailyWriteLimit = optionalLimit(
    body.dailyWriteLimit,
    "dailyWriteLimit",
  );
  if (dailyWriteLimit !== undefined) result.dailyWriteLimit = dailyWriteLimit;
  const enabled = optionalBoolean(body.enabled, "enabled");
  if (enabled !== undefined) result.enabled = enabled;
  if (permissions !== undefined) result.permissions = permissions;
  return result;
}

export function parseAdminIntegration(
  value: unknown,
): UpdateAdminIntegrationInput {
  const body = record(value);
  rejectUnknown(
    body,
    new Set([
      "accessToken",
      "allowSecrets",
      "botToken",
      "clearAccessToken",
      "clearBotToken",
      "clearSecret",
      "confirmationCode",
      "dailyReadLimit",
      "dailyRequestLimit",
      "dailyWriteLimit",
      "enabled",
      "groupId",
      "requireConfirmation",
      "secret",
      "webhookUrl",
    ]),
  );
  const webhookUrl = nullableString(body.webhookUrl, "webhookUrl", 2048);
  if (webhookUrl) {
    let parsed: URL;
    try {
      parsed = new URL(webhookUrl);
    } catch {
      throw new BadRequestException("webhookUrl must be a valid URL");
    }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
      throw new BadRequestException(
        "webhookUrl must use HTTPS without credentials",
      );
    }
  }
  const result: UpdateAdminIntegrationInput = {};
  const accessToken = optionalString(body.accessToken, "accessToken", 4096);
  if (accessToken !== undefined) result.accessToken = accessToken;
  const allowSecrets = optionalBoolean(body.allowSecrets, "allowSecrets");
  if (allowSecrets !== undefined) result.allowSecrets = allowSecrets;
  const botToken = optionalString(body.botToken, "botToken", 4096);
  if (botToken !== undefined) result.botToken = botToken;
  for (const field of [
    "clearAccessToken",
    "clearBotToken",
    "clearSecret",
    "enabled",
    "requireConfirmation",
  ] as const) {
    const parsed = optionalBoolean(body[field], field);
    if (parsed !== undefined) result[field] = parsed;
  }
  const confirmationCode = nullableString(
    body.confirmationCode,
    "confirmationCode",
    256,
  );
  if (confirmationCode !== undefined)
    result.confirmationCode = confirmationCode;
  const dailyReadLimit = optionalLimit(body.dailyReadLimit, "dailyReadLimit");
  if (dailyReadLimit !== undefined) result.dailyReadLimit = dailyReadLimit;
  const dailyRequestLimit = optionalLimit(
    body.dailyRequestLimit,
    "dailyRequestLimit",
  );
  if (dailyRequestLimit !== undefined)
    result.dailyRequestLimit = dailyRequestLimit;
  const dailyWriteLimit = optionalLimit(
    body.dailyWriteLimit,
    "dailyWriteLimit",
  );
  if (dailyWriteLimit !== undefined) result.dailyWriteLimit = dailyWriteLimit;
  const groupId = nullableString(body.groupId, "groupId", 64);
  if (groupId !== undefined) result.groupId = groupId;
  const secret = optionalString(body.secret, "secret", 4096);
  if (secret !== undefined) result.secret = secret;
  if (webhookUrl !== undefined) result.webhookUrl = webhookUrl;
  return result;
}
