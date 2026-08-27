import { describe, expect, it, vi } from "vitest";

import { CorrelationContextService } from "../observability/correlation-context.service.js";
import { AiToolExecutionService } from "./ai-tool-execution.service.js";

describe("AI tool execution correlation", () => {
  it("restores the tool call context while executing deferred work", async () => {
    const correlation = new CorrelationContextService();
    const notes = {
      create: vi.fn(async () => {
        expect(correlation.current()).toBe("tool:deferred-42");
        return { id: 7, name: "Deferred note" };
      }),
    };
    const confirmations = {
      claimForExecution: vi.fn(async () => ({
        arguments: { name: "Deferred note", parentId: null },
        correlationId: "tool:deferred-42",
        toolName: "notes.create",
      })),
      finishExecution: vi.fn(async () => undefined),
    };
    const service = new AiToolExecutionService(
      {} as never,
      notes as never,
      {} as never,
      {} as never,
      {} as never,
      confirmations as never,
      correlation,
    );

    await expect(service.execute(3, 42)).resolves.toEqual({
      id: 7,
      name: "Deferred note",
    });
    expect(correlation.current()).toBeNull();
    expect(confirmations.finishExecution).toHaveBeenCalledWith(3, 42, {
      id: 7,
      name: "Deferred note",
    });
  });
});
