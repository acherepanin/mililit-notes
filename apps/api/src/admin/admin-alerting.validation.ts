import { BadRequestException } from "@nestjs/common";

export const adminAlertNames = [
  "NotesApiHighErrorRatio",
  "NotesTargetDown",
  "NotesWorkerJobFailed",
] as const;

export type AdminAlertName = (typeof adminAlertNames)[number];

export interface AdminSilenceCreateInput {
  alertName: AdminAlertName;
  comment: string;
  durationMinutes: number;
}

const alertNames = new Set<string>(adminAlertNames);
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseAdminSilenceCreate(
  value: unknown,
): AdminSilenceCreateInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestException("body must be an object");
  }
  const body = value as Record<string, unknown>;
  const allowed = new Set(["alertName", "comment", "durationMinutes"]);
  const unknown = Object.keys(body).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new BadRequestException(`Unsupported fields: ${unknown.join(", ")}`);
  }
  if (typeof body.alertName !== "string" || !alertNames.has(body.alertName)) {
    throw new BadRequestException("alertName is not managed by Notes AI");
  }
  if (
    !Number.isSafeInteger(body.durationMinutes) ||
    Number(body.durationMinutes) < 5 ||
    Number(body.durationMinutes) > 1_440
  ) {
    throw new BadRequestException(
      "durationMinutes must be an integer from 5 to 1440",
    );
  }
  if (typeof body.comment !== "string") {
    throw new BadRequestException("comment must be a string");
  }
  const comment = body.comment.trim();
  if (!comment || comment.length > 200 || /[\r\n]/.test(comment)) {
    throw new BadRequestException(
      "comment must contain 1 to 200 characters without line breaks",
    );
  }
  return {
    alertName: body.alertName as AdminAlertName,
    comment,
    durationMinutes: Number(body.durationMinutes),
  };
}

export function parseAdminSilenceId(value: string): string {
  if (!uuid.test(value)) {
    throw new BadRequestException("silenceId must be a UUID");
  }
  return value.toLowerCase();
}
