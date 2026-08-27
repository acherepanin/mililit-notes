import { BadRequestException } from "@nestjs/common";

export const checkoutTerms = [1, 3, 6, 12] as const;
export type CheckoutTerm = (typeof checkoutTerms)[number];

export interface CheckoutInput {
  mode: "purchase" | "renew";
  planId: number;
  termMonths: CheckoutTerm;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestException("body must be an object");
  }
  return value as Record<string, unknown>;
}

export function parseCheckout(value: unknown): CheckoutInput {
  const body = object(value);
  const unknown = Object.keys(body).filter(
    (key) => !new Set(["mode", "planId", "termMonths"]).has(key),
  );
  if (unknown.length > 0) {
    throw new BadRequestException(`Unsupported fields: ${unknown.join(", ")}`);
  }
  if (!Number.isSafeInteger(body.planId) || Number(body.planId) < 1) {
    throw new BadRequestException("planId must be a positive integer");
  }
  const mode = body.mode === "renew" ? "renew" : "purchase";
  const termMonths = body.termMonths ?? 1;
  if (!checkoutTerms.includes(termMonths as CheckoutTerm)) {
    throw new BadRequestException("termMonths must be 1, 3, 6, or 12");
  }
  return {
    mode,
    planId: Number(body.planId),
    termMonths: termMonths as CheckoutTerm,
  };
}

export function parseOrderId(value: string): number {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new BadRequestException("orderId must be a positive integer");
  }
  const result = Number(value);
  if (!Number.isSafeInteger(result)) {
    throw new BadRequestException("orderId is outside the supported range");
  }
  return result;
}

export function checkoutDiscount(termMonths: CheckoutTerm): number {
  return { 1: 0, 3: 3, 6: 6, 12: 9 }[termMonths];
}

export function checkoutAmount(priceCents: number, termMonths: CheckoutTerm) {
  const discountPercent = checkoutDiscount(termMonths);
  return {
    amountCents: Math.round(
      priceCents * termMonths * (1 - discountPercent / 100),
    ),
    discountPercent,
  };
}
