import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import {
  parseAdminSilenceCreate,
  parseAdminSilenceId,
} from "./admin-alerting.validation.js";

describe("admin alerting validation", () => {
  it("accepts a bounded Notes alert silence", () => {
    expect(
      parseAdminSilenceCreate({
        alertName: "NotesWorkerJobFailed",
        comment: "  Incident is being investigated  ",
        durationMinutes: 30,
      }),
    ).toEqual({
      alertName: "NotesWorkerJobFailed",
      comment: "Incident is being investigated",
      durationMinutes: 30,
    });
    expect(parseAdminSilenceId("A4D09FC4-417A-4C2B-9F97-94FA88AF1EA8")).toBe(
      "a4d09fc4-417a-4c2b-9f97-94fa88af1ea8",
    );
  });

  it("rejects arbitrary matchers, alert names, ranges, and comments", () => {
    expect(() =>
      parseAdminSilenceCreate({
        alertName: "HostDown",
        comment: "test",
        durationMinutes: 30,
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      parseAdminSilenceCreate({
        alertName: "NotesTargetDown",
        comment: "test",
        durationMinutes: 30,
        matchers: [],
      }),
    ).toThrow("Unsupported fields");
    expect(() =>
      parseAdminSilenceCreate({
        alertName: "NotesTargetDown",
        comment: "line one\nline two",
        durationMinutes: 4,
      }),
    ).toThrow(BadRequestException);
    expect(() => parseAdminSilenceId("not-a-uuid")).toThrow(
      BadRequestException,
    );
  });
});
