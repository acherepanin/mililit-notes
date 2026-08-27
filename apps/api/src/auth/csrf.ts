const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

export function isAllowedMutationOrigin(
  method: string,
  origin: string | string[] | undefined,
  appOrigin: string,
): boolean {
  return safeMethods.has(method.toUpperCase()) || origin === appOrigin;
}
