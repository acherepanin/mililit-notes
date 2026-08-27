import { BadRequestException } from "@nestjs/common";

const BILLING_PERIODS = new Set(["lifetime", "month", "year"]);
export interface AdminEntitlementPatch {
  ai?: { enabled?: boolean; monthlyTokenLimit?: number | null };
  exportImport?: { enabled?: boolean };
  files?: { enabled?: boolean; storageLimitBytes?: number | null };
  publicShare?: { enabled?: boolean };
  templates?: { enabled?: boolean };
  versioning?: { enabled?: boolean };
  voice?: { enabled?: boolean };
  workspace?: {
    enabled?: boolean;
    maxNoteContentBytes?: number | null;
    maxNotes?: number | null;
  };
}

export interface AdminPlanUpdateInput {
  billingPeriod?: "lifetime" | "month" | "year";
  currency?: string;
  description?: string | null;
  entitlements?: AdminEntitlementPatch;
  expectedRevision: number;
  isActive?: boolean;
  isHidden?: boolean;
  name?: string;
  priceCents?: number;
  sortOrder?: number;
}

export interface AdminSubscriptionAssignmentInput {
  expectedCurrentSubscriptionId: number | null;
  planId: number;
}

function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestException(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exact(body: Record<string, unknown>, allowed: Set<string>): void {
  const unknown = Object.keys(body).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new BadRequestException(`Unsupported fields: ${unknown.join(", ")}`);
  }
}

function boolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new BadRequestException(`${field} must be a boolean`);
  }
  return value;
}

function nullableInteger(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number | null {
  if (value === null) return null;
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < minimum ||
    Number(value) > maximum
  ) {
    throw new BadRequestException(
      `${field} must be null or an integer from ${minimum} to ${maximum}`,
    );
  }
  return Number(value);
}

function enabledEntitlement(value: unknown, field: string) {
  const input = object(value, field);
  exact(input, new Set(["enabled"]));
  if (input.enabled === undefined) {
    throw new BadRequestException(`${field} must contain a change`);
  }
  return { enabled: boolean(input.enabled, `${field}.enabled`) };
}

function entitlements(value: unknown): AdminEntitlementPatch {
  const body = object(value, "entitlements");
  exact(
    body,
    new Set([
      "ai",
      "exportImport",
      "files",
      "publicShare",
      "templates",
      "versioning",
      "voice",
      "workspace",
    ]),
  );
  if (Object.keys(body).length === 0) {
    throw new BadRequestException("entitlements must contain a change");
  }
  const result: AdminEntitlementPatch = {};
  if (body.ai !== undefined) {
    const input = object(body.ai, "entitlements.ai");
    exact(input, new Set(["enabled", "monthlyTokenLimit"]));
    const next: NonNullable<AdminEntitlementPatch["ai"]> = {};
    if (input.enabled !== undefined)
      next.enabled = boolean(input.enabled, "entitlements.ai.enabled");
    if (input.monthlyTokenLimit !== undefined) {
      next.monthlyTokenLimit = nullableInteger(
        input.monthlyTokenLimit,
        "entitlements.ai.monthlyTokenLimit",
        0,
        2_147_483_647,
      );
    }
    if (Object.keys(next).length === 0)
      throw new BadRequestException("entitlements.ai must contain a change");
    result.ai = next;
  }
  if (body.exportImport !== undefined) {
    result.exportImport = enabledEntitlement(
      body.exportImport,
      "entitlements.exportImport",
    );
  }
  if (body.files !== undefined) {
    const input = object(body.files, "entitlements.files");
    exact(input, new Set(["enabled", "storageLimitBytes"]));
    const next: NonNullable<AdminEntitlementPatch["files"]> = {};
    if (input.enabled !== undefined)
      next.enabled = boolean(input.enabled, "entitlements.files.enabled");
    if (input.storageLimitBytes !== undefined) {
      next.storageLimitBytes = nullableInteger(
        input.storageLimitBytes,
        "entitlements.files.storageLimitBytes",
        0,
        10 * 1024 ** 4,
      );
    }
    if (Object.keys(next).length === 0)
      throw new BadRequestException("entitlements.files must contain a change");
    result.files = next;
  }
  if (body.publicShare !== undefined) {
    result.publicShare = enabledEntitlement(
      body.publicShare,
      "entitlements.publicShare",
    );
  }
  if (body.templates !== undefined) {
    result.templates = enabledEntitlement(
      body.templates,
      "entitlements.templates",
    );
  }
  if (body.versioning !== undefined) {
    result.versioning = enabledEntitlement(
      body.versioning,
      "entitlements.versioning",
    );
  }
  if (body.voice !== undefined) {
    result.voice = enabledEntitlement(body.voice, "entitlements.voice");
  }
  if (body.workspace !== undefined) {
    const input = object(body.workspace, "entitlements.workspace");
    exact(input, new Set(["enabled", "maxNoteContentBytes", "maxNotes"]));
    const next: NonNullable<AdminEntitlementPatch["workspace"]> = {};
    if (input.enabled !== undefined) {
      next.enabled = boolean(input.enabled, "entitlements.workspace.enabled");
    }
    if (input.maxNoteContentBytes !== undefined) {
      next.maxNoteContentBytes = nullableInteger(
        input.maxNoteContentBytes,
        "entitlements.workspace.maxNoteContentBytes",
        0,
        2 * 1024 ** 2,
      );
    }
    if (input.maxNotes !== undefined) {
      next.maxNotes = nullableInteger(
        input.maxNotes,
        "entitlements.workspace.maxNotes",
        0,
        2_147_483_647,
      );
    }
    if (Object.keys(next).length === 0) {
      throw new BadRequestException(
        "entitlements.workspace must contain a change",
      );
    }
    result.workspace = next;
  }
  return result;
}

export function parseAdminId(value: string, field: string): number {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new BadRequestException(`${field} must be a positive integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > 2_147_483_647) {
    throw new BadRequestException(`${field} is outside the supported range`);
  }
  return parsed;
}

export function parseAdminPlanUpdate(value: unknown): AdminPlanUpdateInput {
  const body = object(value, "body");
  exact(
    body,
    new Set([
      "billingPeriod",
      "currency",
      "description",
      "entitlements",
      "expectedRevision",
      "isActive",
      "isHidden",
      "name",
      "priceCents",
      "sortOrder",
    ]),
  );
  if (body.expectedRevision === undefined) {
    throw new BadRequestException("expectedRevision is required");
  }
  const expectedRevision = nullableInteger(
    body.expectedRevision,
    "expectedRevision",
    1,
    2_147_483_647,
  );
  if (expectedRevision === null)
    throw new BadRequestException("expectedRevision cannot be null");
  const result: AdminPlanUpdateInput = { expectedRevision };
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim())
      throw new BadRequestException("name must be a non-empty string");
    if (body.name.trim().length > 80)
      throw new BadRequestException("name exceeds 80 characters");
    result.name = body.name.trim();
  }
  if (body.description !== undefined) {
    if (body.description !== null && typeof body.description !== "string")
      throw new BadRequestException("description must be a string or null");
    const description = body.description?.trim() || null;
    if (description && description.length > 500)
      throw new BadRequestException("description exceeds 500 characters");
    result.description = description;
  }
  if (body.priceCents !== undefined) {
    result.priceCents = nullableInteger(
      body.priceCents,
      "priceCents",
      0,
      1_000_000_000,
    )!;
  }
  if (body.currency !== undefined) {
    if (
      typeof body.currency !== "string" ||
      !/^[a-zA-Z]{3}$/.test(body.currency)
    )
      throw new BadRequestException("currency must be a three-letter code");
    result.currency = body.currency.toLowerCase();
  }
  if (body.billingPeriod !== undefined) {
    if (
      typeof body.billingPeriod !== "string" ||
      !BILLING_PERIODS.has(body.billingPeriod)
    ) {
      throw new BadRequestException("billingPeriod is invalid");
    }
    result.billingPeriod = body.billingPeriod as "lifetime" | "month" | "year";
  }
  if (body.isActive !== undefined)
    result.isActive = boolean(body.isActive, "isActive");
  if (body.isHidden !== undefined)
    result.isHidden = boolean(body.isHidden, "isHidden");
  if (body.sortOrder !== undefined) {
    result.sortOrder = nullableInteger(
      body.sortOrder,
      "sortOrder",
      -10_000,
      10_000,
    )!;
  }
  if (body.entitlements !== undefined)
    result.entitlements = entitlements(body.entitlements);
  if (Object.keys(result).length === 1) {
    throw new BadRequestException("At least one plan change is required");
  }
  return result;
}

export function parseAdminSubscriptionAssignment(
  value: unknown,
): AdminSubscriptionAssignmentInput {
  const body = object(value, "body");
  exact(body, new Set(["expectedCurrentSubscriptionId", "planId"]));
  if (body.planId === undefined)
    throw new BadRequestException("planId is required");
  const planId = nullableInteger(body.planId, "planId", 1, 2_147_483_647);
  if (planId === null) throw new BadRequestException("planId cannot be null");
  if (body.expectedCurrentSubscriptionId === undefined) {
    throw new BadRequestException("expectedCurrentSubscriptionId is required");
  }
  const expectedCurrentSubscriptionId = nullableInteger(
    body.expectedCurrentSubscriptionId,
    "expectedCurrentSubscriptionId",
    1,
    2_147_483_647,
  );
  return { expectedCurrentSubscriptionId, planId };
}
