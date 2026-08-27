import { describe, expect, it } from "vitest";

import { evaluatePromptRun, promptEvalSuiteHash } from "./prompt-eval.js";

const cases = [
  {
    caseKey: "grounded.answer",
    expected: { schema: "answer" },
    id: 1,
    input: { question: "Summarize" },
    revision: 2,
    thresholds: {
      maxCostUsd: 0.1,
      maxLatencyMs: 5_000,
      minQuality: 0.8,
      requireAuthorization: true,
      requireSchema: true,
    },
  },
];

describe("prompt eval gate", () => {
  it("passes only a complete result within every threshold", () => {
    expect(
      evaluatePromptRun(cases, [
        {
          authorizationPassed: true,
          caseId: 1,
          costUsd: 0.02,
          error: null,
          latencyMs: 1_200,
          quality: 0.9,
          schemaValid: true,
        },
      ]),
    ).toMatchObject({
      status: "passed",
      summary: { caseCount: 1, failedCaseIds: [], passedCount: 1 },
    });
  });

  it("fails missing, unauthorized, slow, costly, or low-quality results", () => {
    const failed = evaluatePromptRun(cases, [
      {
        authorizationPassed: false,
        caseId: 1,
        costUsd: 0.2,
        error: null,
        latencyMs: 6_000,
        quality: 0.5,
        schemaValid: false,
      },
    ]);
    expect(failed.status).toBe("failed");
    expect(failed.results[0]?.failures).toEqual([
      "quality",
      "schema",
      "authorization",
      "latency",
      "cost",
    ]);
    expect(evaluatePromptRun(cases, []).status).toBe("failed");
  });

  it("changes the suite hash when a case revision changes", () => {
    expect(promptEvalSuiteHash(cases)).not.toBe(
      promptEvalSuiteHash([{ ...cases[0]!, revision: 3 }]),
    );
  });
});
