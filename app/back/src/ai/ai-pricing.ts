export interface AiModelPricing {
  inputPricePer1M: number | null;
  cachedInputPricePer1M: number | null;
  outputPricePer1M: number | null;
}

const unknownPricing: AiModelPricing = {
  inputPricePer1M: null,
  cachedInputPricePer1M: null,
  outputPricePer1M: null,
};

const knownOpenAiPricing: Record<string, AiModelPricing> = {
  'gpt-5.5': { inputPricePer1M: 5, cachedInputPricePer1M: 0.5, outputPricePer1M: 30 },
  'gpt-5.4-mini': { inputPricePer1M: 0.75, cachedInputPricePer1M: 0.075, outputPricePer1M: 4.5 },
  'gpt-5.4-nano': { inputPricePer1M: 0.2, cachedInputPricePer1M: 0.02, outputPricePer1M: 1.25 },
  'gpt-5.4': { inputPricePer1M: 2.5, cachedInputPricePer1M: 0.25, outputPricePer1M: 15 },
  'gpt-5-pro': { inputPricePer1M: 15, cachedInputPricePer1M: null, outputPricePer1M: 120 },
  'gpt-5-mini': { inputPricePer1M: 0.25, cachedInputPricePer1M: 0.025, outputPricePer1M: 2 },
  'gpt-5-nano': { inputPricePer1M: 0.05, cachedInputPricePer1M: 0.005, outputPricePer1M: 0.4 },
  'gpt-5': { inputPricePer1M: 1.25, cachedInputPricePer1M: 0.125, outputPricePer1M: 10 },
};

const knownModelIds = Object.keys(knownOpenAiPricing).sort(
  (left, right) => right.length - left.length,
);

export function getAiModelPricing(modelId: string): AiModelPricing {
  const normalized = modelId.trim().toLowerCase().split('/').pop() ?? '';
  const knownModelId = knownModelIds.find(
    (id) => normalized === id || normalized.startsWith(`${id}-`),
  );

  return knownModelId ? knownOpenAiPricing[knownModelId] : unknownPricing;
}

export function calculateAiUsageCostUsd(
  inputTokens: number,
  outputTokens: number,
  pricing: AiModelPricing,
): number | null {
  if (pricing.inputPricePer1M === null || pricing.outputPricePer1M === null) {
    return null;
  }

  return (
    (inputTokens / 1_000_000) * pricing.inputPricePer1M +
    (outputTokens / 1_000_000) * pricing.outputPricePer1M
  );
}
