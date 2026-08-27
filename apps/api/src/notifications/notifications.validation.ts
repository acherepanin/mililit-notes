import { BadRequestException } from "@nestjs/common";

export function parseNotificationPreferences(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestException("Request body must be an object");
  }
  const body = value as Record<string, unknown>;
  if (
    Object.keys(body).some((key) => key !== "subscriptionEvents") ||
    typeof body.subscriptionEvents !== "boolean"
  ) {
    throw new BadRequestException("subscriptionEvents must be a boolean");
  }
  return { subscriptionEvents: body.subscriptionEvents };
}

export function parseNotificationId(value: string): number {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new BadRequestException("Notification id must be a positive integer");
  }
  const id = Number(value);
  if (!Number.isSafeInteger(id)) {
    throw new BadRequestException("Notification id must be a positive integer");
  }
  return id;
}
