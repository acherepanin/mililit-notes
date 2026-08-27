import { describe, expect, it } from "vitest";

import { createWorkerHealthResponse } from "./health.js";

describe("createWorkerHealthResponse", () => {
  it("returns a stable service contract", () => {
    expect(
      createWorkerHealthResponse(new Date("2026-08-04T00:00:00.000Z")),
    ).toMatchObject({
      service: "worker",
      status: "ok",
      time: "2026-08-04T00:00:00.000Z",
    });
  });
});
