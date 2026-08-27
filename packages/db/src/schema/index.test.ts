import { describe, expect, it } from "vitest";

import { expectedTableNames } from "./index.js";

describe("database schema inventory", () => {
  it("covers every application table exactly once", () => {
    expect(expectedTableNames).toHaveLength(47);
    expect(new Set(expectedTableNames).size).toBe(expectedTableNames.length);
  });
});
