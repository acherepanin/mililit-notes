import { describe, expect, it } from "vitest";

import { checkoutAmount, parseCheckout } from "./subscriptions.validation.js";

describe("subscription checkout validation", () => {
  it("validates terms and applies the legacy long-term discount", () => {
    expect(parseCheckout({ planId: 2, termMonths: 12 })).toEqual({
      mode: "purchase",
      planId: 2,
      termMonths: 12,
    });
    expect(checkoutAmount(1_000, 12)).toEqual({
      amountCents: 10_920,
      discountPercent: 9,
    });
    expect(() => parseCheckout({ planId: 2, termMonths: 2 })).toThrow();
  });
});
