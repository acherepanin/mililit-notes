export function withDefaultAuthCallback(
  url: string,
  appOrigin: string,
): string {
  const parsed = new URL(url);
  if (parsed.searchParams.get("callbackURL") === "/") {
    parsed.searchParams.set("callbackURL", appOrigin);
  }
  return parsed.toString();
}
