import { describe, expect, it } from "vitest";

import { createHealthResponse } from "./health.js";

describe("createHealthResponse", () => {
  it("returns a stable service contract", () => {
    expect(
      createHealthResponse(new Date("2026-08-04T00:00:00.000Z")),
    ).toMatchObject({
      service: "api",
      status: "ok",
      time: "2026-08-04T00:00:00.000Z",
    });
  });
});
