import type {
  JsonObject,
  PromptEvalResultInput,
  PromptEvalThresholds,
} from "./ai.types.js";
import { canonicalJsonSha256 } from "./canonical-json.js";

export interface PromptEvalCaseRow {
  caseKey: string;
  expected: JsonObject;
  id: number;
  input: JsonObject;
  revision: number;
  thresholds: JsonObject;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function thresholds(value: JsonObject): PromptEvalThresholds {
  return {
    maxCostUsd: numberOr(value.maxCostUsd, 1),
    maxLatencyMs: numberOr(value.maxLatencyMs, 30_000),
    minQuality: numberOr(value.minQuality, 0.8),
    requireAuthorization:
      typeof value.requireAuthorization === "boolean"
        ? value.requireAuthorization
        : true,
    requireSchema:
      typeof value.requireSchema === "boolean" ? value.requireSchema : true,
  };
}

export function promptEvalSuiteHash(cases: PromptEvalCaseRow[]): string {
  return canonicalJsonSha256(
    cases
      .toSorted((left, right) => left.id - right.id)
      .map(({ caseKey, expected, id, input, revision, thresholds }) => ({
        caseKey,
        expected,
        id,
        input,
        revision,
        thresholds,
      })),
  );
}

export function evaluatePromptRun(
  cases: PromptEvalCaseRow[],
  results: PromptEvalResultInput[],
) {
  const resultsByCase = new Map(
    results.map((result) => [result.caseId, result]),
  );
  const evaluated = cases.map((evalCase) => {
    const result = resultsByCase.get(evalCase.id);
    const gate = thresholds(evalCase.thresholds);
    const failures: string[] = [];
    if (!result) {
      failures.push("missing_result");
    } else {
      if (result.error) failures.push("evaluator_error");
      if (result.quality < gate.minQuality) failures.push("quality");
      if (gate.requireSchema && !result.schemaValid) failures.push("schema");
      if (gate.requireAuthorization && !result.authorizationPassed) {
        failures.push("authorization");
      }
      if (result.latencyMs > gate.maxLatencyMs) failures.push("latency");
      if (result.costUsd > gate.maxCostUsd) failures.push("cost");
    }
    return {
      caseId: evalCase.id,
      failures,
      passed: failures.length === 0,
      ...(result ?? {}),
    };
  });
  const knownIds = new Set(cases.map((evalCase) => evalCase.id));
  const unexpectedCaseIds = results
    .map((result) => result.caseId)
    .filter((caseId) => !knownIds.has(caseId));
  const measured = results.filter((result) => knownIds.has(result.caseId));
  const failedCaseIds = evaluated
    .filter((result) => !result.passed)
    .map((result) => result.caseId);
  const passed =
    cases.length > 0 &&
    failedCaseIds.length === 0 &&
    unexpectedCaseIds.length === 0;
  return {
    metrics: {
      averageQuality:
        measured.length === 0
          ? 0
          : measured.reduce((sum, result) => sum + result.quality, 0) /
            measured.length,
      maxLatencyMs: Math.max(0, ...measured.map((result) => result.latencyMs)),
      totalCostUsd: measured.reduce((sum, result) => sum + result.costUsd, 0),
    },
    results: evaluated,
    status: passed ? ("passed" as const) : ("failed" as const),
    summary: {
      caseCount: cases.length,
      failedCaseIds,
      passedCount: evaluated.filter((result) => result.passed).length,
      unexpectedCaseIds,
    },
  };
}
