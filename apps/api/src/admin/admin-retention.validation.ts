import { BadRequestException } from "@nestjs/common";
import {
  dataRetentionPolicyKeys,
  type DataRetentionPolicyKey,
} from "@notes/db";

export interface RetentionPolicyUpdateInput {
  enabled?: boolean;
  retentionDays?: number;
}

const policyKeys = new Set<string>(dataRetentionPolicyKeys);

export function parseRetentionPolicyKey(value: string): DataRetentionPolicyKey {
  if (!policyKeys.has(value)) {
    throw new BadRequestException("retention policy is invalid");
  }
  return value as DataRetentionPolicyKey;
}

export function parseRetentionPolicyUpdate(
  value: unknown,
): RetentionPolicyUpdateInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestException("body must be an object");
  }
  const body = value as Record<string, unknown>;
  const unknown = Object.keys(body).filter(
    (key) => key !== "enabled" && key !== "retentionDays",
  );
  if (unknown.length > 0) {
    throw new BadRequestException(`Unsupported fields: ${unknown.join(", ")}`);
  }
  const result: RetentionPolicyUpdateInput = {};
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") {
      throw new BadRequestException("enabled must be a boolean");
    }
    result.enabled = body.enabled;
  }
  if (body.retentionDays !== undefined) {
    if (
      !Number.isSafeInteger(body.retentionDays) ||
      Number(body.retentionDays) < 7 ||
      Number(body.retentionDays) > 3650
    ) {
      throw new BadRequestException(
        "retentionDays must be an integer from 7 to 3650",
      );
    }
    result.retentionDays = Number(body.retentionDays);
  }
  if (Object.keys(result).length === 0) {
    throw new BadRequestException("At least one retention change is required");
  }
  return result;
}
