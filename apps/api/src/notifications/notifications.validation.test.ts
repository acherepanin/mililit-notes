import { describe, expect, it } from "vitest";

import {
  parseNotificationId,
  parseNotificationPreferences,
} from "./notifications.validation.js";

describe("notification validation", () => {
  it("accepts the allowlisted preference", () => {
    expect(parseNotificationPreferences({ subscriptionEvents: false })).toEqual(
      { subscriptionEvents: false },
    );
  });

  it("rejects mass assignment and invalid ids", () => {
    expect(() =>
      parseNotificationPreferences({ admin: true, subscriptionEvents: true }),
    ).toThrow();
    expect(() => parseNotificationId("0")).toThrow();
  });
});
