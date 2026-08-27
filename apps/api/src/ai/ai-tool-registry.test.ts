import { describe, expect, it } from "vitest";

import {
  AI_TOOL_SPECS,
  internalToolName,
  providerTools,
} from "./ai-tool-registry.js";

describe("AI tool registry", () => {
  it("exposes unique provider-safe names and resolves them back exactly", () => {
    const names = Object.values(AI_TOOL_SPECS).map((spec) => spec.providerName);
    expect(new Set(names).size).toBe(names.length);
    for (const [internalName, spec] of Object.entries(AI_TOOL_SPECS)) {
      expect(spec.providerName).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
      expect(internalToolName(spec.providerName)).toBe(internalName);
    }
  });

  it("sends only explicitly allowed contracts", () => {
    expect(providerTools(["notes.search"])).toEqual([
      expect.objectContaining({ name: "notes_search", strict: true }),
    ]);
  });
});
