export function readPositiveInteger(value: string | number | undefined, fallback: number): number {
  const parsed = Number(value);

  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  return fallback;
}

export function readPort(value: string | number | undefined, fallback: number): number {
  const port = readPositiveInteger(value, fallback);

  return port <= 65535 ? port : fallback;
}
