import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { hashFile, isWithinRoot, resolveLegacyFile } from "./file-migration.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { force: true, recursive: true })),
  );
});

describe("legacy file migration helpers", () => {
  it("maps a container path to the flat legacy upload volume and hashes it", async () => {
    const root = await mkdtemp(join(tmpdir(), "notes-files-"));
    temporaryDirectories.push(root);
    const file = join(root, "fixture.txt");
    await writeFile(file, "notes\n", "utf8");

    await expect(
      resolveLegacyFile(root, "/app/uploads/fixture.txt"),
    ).resolves.toBe(await realpath(file));
    await expect(hashFile(file)).resolves.toBe(
      "444e0fffbd825e9610ff5b199485707a0c895339ae80c15cc8a8aee41b106fda",
    );
  });

  it("rejects paths outside the configured upload root", () => {
    const root = resolve("uploads");
    expect(isWithinRoot(root, resolve(root, "file.txt"))).toBe(true);
    expect(isWithinRoot(root, resolve(root, "..", "secret.txt"))).toBe(false);
  });
});
