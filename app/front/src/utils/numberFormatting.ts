export function compactTokenCount(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
  }

  if (value >= 1_000) {
    return `${Math.ceil(value / 100) / 10}k`;
  }

  return String(value);
}

export function formatUsd(value: number): string {
  if (value === 0) {
    return '$0';
  }

  if (value < 0.01) {
    return `$${value.toFixed(4)}`;
  }

  return `$${value.toFixed(2)}`;
}

export function formatTokenPrice(value: number | null): string {
  return value === null
    ? '?'
    : `$${value
        .toFixed(value < 1 ? 3 : 2)
        .replace(/0+$/, '')
        .replace(/\.$/, '')}`;
}

export function parseDigitsLimit(value: string): number | null {
  const normalized = value.replace(/\D/g, '');
  return normalized ? Number(normalized) : null;
}
