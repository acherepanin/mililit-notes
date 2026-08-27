import { expect, request, type FullConfig } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

interface MailSummary {
  ID: string;
  To: { Address: string }[];
}

const stateDir = path.resolve("test-results/playwright-auth");
export const authStatePath = path.join(stateDir, "state.json");
export const authMetaPath = path.join(stateDir, "meta.json");
export const userAuthStatePath = path.join(stateDir, "user-state.json");

async function verificationLink(email: string) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const response = await fetch("http://localhost:18025/api/v1/messages");
    const body = (await response.json()) as { messages: MailSummary[] };
    const summary = body.messages.find((message) =>
      message.To.some((recipient) => recipient.Address === email),
    );
    if (summary) {
      const message = (await fetch(
        `http://localhost:18025/api/v1/message/${encodeURIComponent(summary.ID)}`,
      ).then((result) => result.json())) as { HTML: string; Text: string };
      const links =
        `${message.Text}\n${message.HTML}`.match(/https?:\/\/[^\s<>"']+/g) ??
        [];
      const link = links
        .map((value) => value.replaceAll("&amp;", "&"))
        .find((value) => value.includes("/api/auth/verify-email"));
      if (link) return link;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Playwright verification email did not arrive");
}

export default async function globalSetup(config: FullConfig) {
  const baseURL = String(config.projects[0]?.use.baseURL);
  const suffix = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const username = `playwright_${suffix}`;
  const email = `${username}@example.test`;
  const password = `${crypto.randomUUID()}Aa1!`;
  const context = await request.newContext({ baseURL });

  const signUp = await context.post("/api/auth/sign-up/email", {
    data: { email, name: "Playwright Audit", password, username },
    headers: { origin: baseURL },
  });
  expect(signUp.ok(), await signUp.text()).toBe(true);
  const verify = await context.get(await verificationLink(email));
  expect([200, 302]).toContain(verify.status());
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
    `UPDATE users SET role = 'admin' WHERE username = '${username}';`,
  ]);
  const signIn = await context.post("/api/auth/sign-in/username", {
    data: { password, username },
    headers: { origin: baseURL },
  });
  expect(signIn.ok(), await signIn.text()).toBe(true);

  const created = await context.post("/api/notes", {
    data: { name: "Проверка редактора", parentId: null },
    headers: { origin: baseURL },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const note = (await created.json()) as { id: number; revision: number };
  const seeded = await context.patch(`/api/notes/${note.id}`, {
    data: {
      contentHtml:
        '<h2>Живая заметка</h2><p>Текст из PostgreSQL.</p><div data-copy-field="" data-label="API token" data-value="playwright-secret" data-kind="token" data-secret="true"></div>',
      contentText:
        "Живая заметка\nТекст из PostgreSQL.\nAPI token: [secret hidden]",
      revision: note.revision,
    },
    headers: { origin: baseURL },
  });
  expect(seeded.ok(), await seeded.text()).toBe(true);

  await mkdir(stateDir, { recursive: true });
  await context.storageState({ path: authStatePath });
  const userContext = await request.newContext({ baseURL });
  const userSuffix = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const userUsername = `playwright_user_${userSuffix}`;
  const userEmail = `${userUsername}@example.test`;
  const userPassword = `${crypto.randomUUID()}Aa1!`;
  const userSignUp = await userContext.post("/api/auth/sign-up/email", {
    data: {
      email: userEmail,
      name: "Playwright User",
      password: userPassword,
      username: userUsername,
    },
    headers: { origin: baseURL },
  });
  expect(userSignUp.ok(), await userSignUp.text()).toBe(true);
  const userVerify = await userContext.get(await verificationLink(userEmail));
  expect([200, 302]).toContain(userVerify.status());
  const userSignIn = await userContext.post("/api/auth/sign-in/username", {
    data: { password: userPassword, username: userUsername },
    headers: { origin: baseURL },
  });
  expect(userSignIn.ok(), await userSignIn.text()).toBe(true);
  await userContext.storageState({ path: userAuthStatePath });
  await userContext.dispose();
  await writeFile(
    authMetaPath,
    JSON.stringify({ password, userUsername, username }),
    "utf8",
  );
  await context.dispose();
}
