import { describe, expect, it } from "vitest";

import { readServiceEnvironment } from "./index.js";

describe("readServiceEnvironment", () => {
  it("uses the service default and validates explicit ports", () => {
    expect(readServiceEnvironment({}, 3001).PORT).toBe(3001);
    expect(readServiceEnvironment({ PORT: "3101" }, 3001).PORT).toBe(3101);
  });
});
