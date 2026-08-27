import { execFileSync } from "node:child_process";
import { readFile, rm } from "node:fs/promises";

import { authMetaPath, authStatePath, userAuthStatePath } from "./global-setup";

export default async function globalTeardown() {
  try {
    const raw = await readFile(authMetaPath, "utf8").catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    });
    if (raw === null) return;
    const { userUsername, username } = JSON.parse(raw) as {
      userUsername: string;
      username: string;
    };
    if (
      !/^playwright_[a-zA-Z0-9_]+$/.test(username) ||
      !/^playwright_user_[a-zA-Z0-9_]+$/.test(userUsername)
    ) {
      throw new Error("Refusing to clean an unexpected Playwright username");
    }
    execFileSync("docker", [
      "exec",
      "notes-v2-postgres-1",
      "psql",
      "-U",
      "notes_v2",
      "-d",
      "notes_v2",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      `DELETE FROM request_error_logs WHERE correlation_id LIKE 'phase9-playwright-error-%'; DELETE FROM ai_prompt_definitions WHERE prompt_key LIKE 'playwright.phase9.%'; DELETE FROM activity_logs WHERE actor_id IN (SELECT id FROM users WHERE username IN ('${username}', '${userUsername}')) OR user_id IN (SELECT id FROM users WHERE username IN ('${username}', '${userUsername}')); DELETE FROM users WHERE username IN ('${username}', '${userUsername}');`,
    ]);
  } finally {
    await Promise.all([
      rm(authMetaPath, { force: true }),
      rm(authStatePath, { force: true }),
      rm(userAuthStatePath, { force: true }),
    ]);
  }
}
