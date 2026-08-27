import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { realpath } from "node:fs/promises";
import { basename, relative, resolve, sep } from "node:path";

export function isWithinRoot(root: string, path: string): boolean {
  const child = relative(root, path);
  return child === "" || (!child.startsWith(`..${sep}`) && child !== "..");
}

export async function resolveLegacyFile(
  root: string,
  storedPath: string,
): Promise<string> {
  const candidates = [resolve(storedPath), resolve(root, basename(storedPath))];
  const canonicalRoot = await realpath(root);

  for (const candidate of candidates) {
    try {
      const canonicalCandidate = await realpath(candidate);
      if (isWithinRoot(canonicalRoot, canonicalCandidate)) {
        return canonicalCandidate;
      }
    } catch {
      // Try the next deterministic legacy path mapping.
    }
  }

  throw new Error(
    "legacy file is missing or resolves outside LEGACY_UPLOADS_ROOT",
  );
}

export async function hashFile(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}
