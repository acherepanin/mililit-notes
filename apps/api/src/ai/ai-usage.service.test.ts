import { describe, expect, it, vi } from "vitest";

import { AiUsageService, calculateUsageCosts } from "./ai-usage.service.js";

describe("AI usage costs", () => {
  it("separates cached input and rounds provider-metadata usage", () => {
    expect(
      calculateUsageCosts(
        {
          cachedInputTokens: 200,
          inputTokens: 1_000,
          outputTokens: 100,
          reasoningTokens: 40,
          toolCallCount: 1,
        },
        {
          cachedInputPricePer1m: 0.5,
          inputPricePer1m: 2,
          outputPricePer1m: 8,
        },
      ),
    ).toEqual({
      cachedInputCost: 0.0001,
      inputCost: 0.0016,
      outputCost: 0.0008,
      totalCost: 0.0025,
    });
  });

  it("uses zero cost when no reviewed price is available", () => {
    expect(
      calculateUsageCosts(
        {
          cachedInputTokens: 0,
          inputTokens: 10,
          outputTokens: 5,
          reasoningTokens: 0,
          toolCallCount: 0,
        },
        {
          cachedInputPricePer1m: null,
          inputPricePer1m: null,
          outputPricePer1m: null,
        },
      ).totalCost,
    ).toBe(0);
  });

  it("rejects a reservation that would exceed the daily token budget", async () => {
    const insert = vi.fn();
    const assertAiUsage = vi.fn();
    let selectCall = 0;
    const transaction = vi.fn(async (callback: (tx: object) => unknown) =>
      callback({
        execute: vi.fn(),
        insert,
        select: vi.fn(() => {
          selectCall += 1;
          if (selectCall === 1) {
            return {
              from: () => ({
                where: () => ({
                  limit: async () => [
                    {
                      dailyRequestLimit: null,
                      dailyTokenLimit: 100,
                      enabled: true,
                    },
                  ],
                }),
              }),
            };
          }
          return {
            from: () => ({
              where: async () => [{ requests: 1, tokens: 90 }],
            }),
          };
        }),
      }),
    );
    const service = new AiUsageService(
      { client: { transaction } } as never,
      { assertAiUsage } as never,
    );

    await expect(
      service.reserve({
        conversationId: 1,
        estimatedInputTokens: 5,
        maxOutputTokens: 10,
        messageId: 2,
        model: "gpt-test",
        promptVersionId: null,
        providerName: "Test",
        userId: 1,
      }),
    ).rejects.toMatchObject({ status: 429 });
    expect(assertAiUsage).toHaveBeenCalledWith(1, 15, expect.anything());
    expect(insert).not.toHaveBeenCalled();
  });
});
