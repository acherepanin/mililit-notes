import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  createDatabase,
  createDatabasePool,
  notes as noteRows,
  shareLinks,
  subscriptionPlans,
  userSubscriptions,
  users,
} from "@notes/db";
import { and, eq, inArray, like } from "drizzle-orm";

const apiUrl = process.env.API_URL ?? "http://localhost:3201";
const mailUrl = process.env.MAIL_URL ?? "http://localhost:18025";
const origin = process.env.WEB_ORIGIN ?? "http://localhost:3200";
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for disposable-user cleanup");
}
const cleanupDatabaseUrl = databaseUrl;

interface MailSummary {
  ID: string;
  To: { Address: string }[];
}

interface MailList {
  messages: MailSummary[];
}

interface MailMessage {
  HTML: string;
  Text: string;
}

interface Note {
  contentHtml: string;
  contentText: string;
  id: number;
  name: string;
  parentId: number | null;
  revision: number;
  tags: string[];
}

interface Template {
  contentHtml: string;
  contentText: string;
  id: number;
  isSystem: boolean;
  name: string;
}

interface ShareLink {
  id: number;
  includeSecrets: boolean;
  noteId: number;
  oneTime: boolean;
  url: string;
}

interface ExportPayload {
  formatVersion: number;
  notes: Array<Note & { isFavorite: boolean; isPinned: boolean }>;
  templates: Template[];
}

class Session {
  private readonly cookies = new Map<string, string>();

  async request(path: string, init: RequestInit = {}): Promise<Response> {
    const method = init.method?.toUpperCase() ?? "GET";
    const headers = new Headers(init.headers);
    if (this.cookies.size > 0) {
      headers.set(
        "cookie",
        [...this.cookies].map(([key, value]) => `${key}=${value}`).join("; "),
      );
    }
    if (method !== "GET" && method !== "HEAD") headers.set("origin", origin);
    if (init.body !== undefined)
      headers.set("content-type", "application/json");

    const response = await fetch(`${apiUrl}${path}`, { ...init, headers });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";", 1)[0];
      if (!pair) continue;
      const separator = pair.indexOf("=");
      if (separator < 1) continue;
      this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
    return response;
  }
}

async function json<T>(response: Response, expected = 200): Promise<T> {
  const body = await response.text();
  assert.equal(response.status, expected, body);
  return body ? (JSON.parse(body) as T) : (undefined as T);
}

async function pollVerificationLink(email: string): Promise<string> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const list = (await fetch(`${mailUrl}/api/v1/messages`).then((response) =>
      response.json(),
    )) as MailList;
    const summary = list.messages.find((message) =>
      message.To.some((recipient) => recipient.Address === email),
    );
    if (summary) {
      const message = (await fetch(
        `${mailUrl}/api/v1/message/${encodeURIComponent(summary.ID)}`,
      ).then((response) => response.json())) as MailMessage;
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
  throw new Error("Verification email did not arrive in Mailpit");
}

async function createVerifiedSession(label: string) {
  const suffix = `${Date.now()}_${randomUUID().slice(0, 8)}`;
  const username = `phase5_${label}_${suffix}`;
  const email = `${username}@example.test`;
  const password = `${randomUUID()}Aa1!`;
  const session = new Session();

  await json(
    await session.request("/api/auth/sign-up/email", {
      body: JSON.stringify({
        email,
        name: `Phase 5 ${label}`,
        password,
        username,
      }),
      method: "POST",
    }),
  );
  const verificationLink = await pollVerificationLink(email);
  const verification = await fetch(verificationLink, { redirect: "manual" });
  assert.ok([200, 302].includes(verification.status));
  await json(
    await session.request("/api/auth/sign-in/username", {
      body: JSON.stringify({ password, username }),
      method: "POST",
    }),
  );

  return { session, username };
}

async function run(): Promise<void> {
  const usernames: string[] = [];
  let planId = 0;
  const pool = createDatabasePool(cleanupDatabaseUrl);
  const database = createDatabase(pool);

  try {
    await database.delete(users).where(like(users.username, "phase5_%"));
    await database
      .delete(subscriptionPlans)
      .where(like(subscriptionPlans.slug, "phase5-http-%"));
    const owner = await createVerifiedSession("owner");
    const outsider = await createVerifiedSession("outsider");
    usernames.push(owner.username, outsider.username);
    const [ownerRow] = await database
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, owner.username))
      .limit(1);
    assert.ok(ownerRow);
    const [outsiderRow] = await database
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, outsider.username))
      .limit(1);
    assert.ok(outsiderRow);
    const [plan] = await database
      .insert(subscriptionPlans)
      .values({
        billingPeriod: "lifetime",
        entitlements: {
          ai: { enabled: true },
          exportImport: { enabled: true },
          files: { enabled: true, storageLimitBytes: null },
          publicShare: { enabled: true },
          templates: { enabled: true },
          versioning: { enabled: true },
          voice: { enabled: true },
          workspace: { enabled: true },
        },
        isHidden: true,
        name: "Notes HTTP verifier",
        slug: `phase5-http-${randomUUID()}`,
      })
      .returning({ id: subscriptionPlans.id });
    assert.ok(plan);
    planId = plan.id;
    await database.insert(userSubscriptions).values(
      [ownerRow.id, outsiderRow.id].map((userId) => ({
        planId,
        source: "verification",
        startedAt: new Date(),
        status: "active",
        userId,
      })),
    );

    const root = await json<Note>(
      await owner.session.request("/api/notes", {
        body: JSON.stringify({ name: "HTTP parity root", parentId: null }),
        method: "POST",
      }),
      201,
    );
    let child = await json<Note>(
      await owner.session.request("/api/notes", {
        body: JSON.stringify({ name: "HTTP parity child", parentId: root.id }),
        method: "POST",
      }),
      201,
    );

    const contentHtml =
      "<h2>Round trip</h2><p>Unique searchable text</p><ul><li>One</li></ul>";
    const contentText = "Round trip\nUnique searchable text\nOne";
    let current = await json<Note>(
      await owner.session.request(`/api/notes/${root.id}`, {
        body: JSON.stringify({
          contentHtml,
          contentText,
          revision: root.revision,
        }),
        method: "PATCH",
      }),
    );
    assert.equal(current.contentHtml, contentHtml);
    assert.equal(current.contentText, contentText);

    await json(
      await owner.session.request(`/api/notes/${root.id}`, {
        body: JSON.stringify({ name: "Stale write", revision: root.revision }),
        method: "PATCH",
      }),
      409,
    );

    const tag = await json<{ id: number; name: string }>(
      await owner.session.request("/api/notes/tags", {
        body: JSON.stringify({ name: "Parity" }),
        method: "POST",
      }),
      201,
    );
    current = await json<Note>(
      await owner.session.request(`/api/notes/${root.id}/tags`, {
        body: JSON.stringify({ revision: current.revision, tags: [tag.name] }),
        method: "PATCH",
      }),
    );
    assert.deepEqual(current.tags, ["parity"]);

    const secret = `phase5-secret-${randomUUID()}`;
    const secretHtml = `${contentHtml}<div data-copy-field="true" data-kind="token" data-value="${secret}"></div>`;
    current = await json<Note>(
      await owner.session.request(`/api/notes/${root.id}`, {
        body: JSON.stringify({
          contentHtml: secretHtml,
          contentText: `${contentText}\ntoken: ${secret}`,
          revision: current.revision,
        }),
        method: "PATCH",
      }),
    );
    assert.equal(current.contentHtml, secretHtml);
    const [storedNote] = await database
      .select({ contentHtml: noteRows.contentHtml })
      .from(noteRows)
      .where(and(eq(noteRows.id, root.id), eq(noteRows.userId, ownerRow.id)))
      .limit(1);
    assert.ok(storedNote);
    assert.ok(storedNote.contentHtml.includes("enc:v2:"));
    assert.ok(!storedNote.contentHtml.includes(secret));

    const search = await json<{ id: number }[]>(
      await owner.session.request("/api/notes/search?q=searchable"),
    );
    assert.ok(search.some((result) => result.id === root.id));
    const versions = await json<{ contentHtml: string; id: number }[]>(
      await owner.session.request(`/api/notes/${root.id}/versions`),
    );
    assert.ok(versions.some((version) => version.contentHtml === ""));

    await json(await outsider.session.request(`/api/notes/${root.id}`), 404);
    await json(
      await outsider.session.request(`/api/notes/${root.id}`, {
        body: JSON.stringify({ name: "Forbidden", revision: current.revision }),
        method: "PATCH",
      }),
      404,
    );

    child = await json<Note>(
      await owner.session.request(`/api/notes/${child.id}/move`, {
        body: JSON.stringify({
          parentId: null,
          position: 0,
          revision: child.revision,
        }),
        method: "PATCH",
      }),
    );
    assert.equal(child.parentId, null);
    child = await json<Note>(
      await owner.session.request(`/api/notes/${child.id}/move`, {
        body: JSON.stringify({ parentId: root.id, revision: child.revision }),
        method: "PATCH",
      }),
    );
    assert.equal(child.parentId, root.id);

    child = await json<Note>(
      await owner.session.request(`/api/notes/${child.id}`, {
        body: JSON.stringify({ revision: child.revision }),
        method: "DELETE",
      }),
    );
    const trash = await json<Note[]>(
      await owner.session.request("/api/notes/trash"),
    );
    assert.ok(trash.some((note) => note.id === child.id));
    child = await json<Note>(
      await owner.session.request(`/api/notes/${child.id}/restore`, {
        body: JSON.stringify({ revision: child.revision }),
        method: "POST",
      }),
      201,
    );
    assert.equal(child.parentId, root.id);

    const tree = await json<{ children: { id: number }[]; id: number }[]>(
      await owner.session.request("/api/notes/tree"),
    );
    assert.ok(
      tree.some(
        (note) =>
          note.id === root.id &&
          note.children.some((item) => item.id === child.id),
      ),
    );

    const template = await json<Template>(
      await owner.session.request("/api/templates", {
        body: JSON.stringify({
          contentHtml: secretHtml,
          contentText: `token: ${secret}`,
          name: "Parity template",
        }),
        method: "POST",
      }),
      201,
    );
    assert.equal(template.contentHtml, secretHtml);
    const templates = await json<Template[]>(
      await owner.session.request("/api/templates"),
    );
    assert.ok(templates.some((item) => item.id === template.id));
    await json(
      await outsider.session.request(`/api/templates/${template.id}`, {
        body: JSON.stringify({
          contentHtml: "",
          contentText: "",
          name: "Cross-user write",
        }),
        method: "PATCH",
      }),
      404,
    );
    const templatedNote = await json<Note>(
      await owner.session.request("/api/notes/from-template", {
        body: JSON.stringify({ parentId: root.id, templateId: template.id }),
        method: "POST",
      }),
      201,
    );
    assert.equal(templatedNote.contentHtml, secretHtml);

    const exported = await json<ExportPayload>(
      await owner.session.request("/api/export/json"),
    );
    assert.equal(exported.formatVersion, 1);
    assert.equal(
      exported.notes.find((note) => note.id === root.id)?.contentHtml,
      secretHtml,
    );
    assert.ok(exported.templates.some((item) => item.name === template.name));
    const imported = await json<{
      importedNotes: number;
      importedTemplates: number;
    }>(
      await outsider.session.request("/api/import/json", {
        body: JSON.stringify(exported),
        method: "POST",
      }),
      201,
    );
    assert.equal(imported.importedNotes, exported.notes.length);
    assert.equal(imported.importedTemplates, exported.templates.length);
    const outsiderTree = await json<
      Array<{ children: Array<{ name: string }>; name: string }>
    >(await outsider.session.request("/api/notes/tree"));
    assert.ok(
      outsiderTree.some(
        (note) =>
          note.name === root.name &&
          note.children.some((item) => item.name === child.name),
      ),
    );

    const redactedLink = await json<ShareLink>(
      await owner.session.request(`/api/notes/${root.id}/share-links`, {
        body: JSON.stringify({
          includeSecrets: false,
          oneTime: false,
          ttlHours: 24,
        }),
        method: "POST",
      }),
      201,
    );
    const redactedShare = await json<{
      note: { contentHtml: string; contentText: string };
    }>(await fetch(`${apiUrl}/api${redactedLink.url}`));
    assert.ok(!redactedShare.note.contentHtml.includes(secret));
    assert.ok(!redactedShare.note.contentText.includes(secret));
    assert.ok(redactedShare.note.contentHtml.includes("[secret hidden]"));

    const secretLink = await json<ShareLink>(
      await owner.session.request(`/api/notes/${root.id}/share-links`, {
        body: JSON.stringify({
          includeSecrets: true,
          oneTime: false,
          ttlHours: 24,
        }),
        method: "POST",
      }),
      201,
    );
    const secretShare = await json<{
      note: { contentHtml: string };
    }>(await fetch(`${apiUrl}/api${secretLink.url}`));
    assert.ok(secretShare.note.contentHtml.includes(secret));
    await json(
      await outsider.session.request(`/api/notes/${root.id}/share-links`),
      404,
    );

    const expiredLink = await json<ShareLink>(
      await owner.session.request(`/api/notes/${root.id}/share-links`, {
        body: JSON.stringify({ ttlHours: 1 }),
        method: "POST",
      }),
      201,
    );
    await database
      .update(shareLinks)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(
        and(
          eq(shareLinks.id, expiredLink.id),
          eq(shareLinks.userId, ownerRow.id),
        ),
      );
    await json(await fetch(`${apiUrl}/api${expiredLink.url}`), 404);

    const oneTimeLink = await json<ShareLink>(
      await owner.session.request(`/api/notes/${root.id}/share-links`, {
        body: JSON.stringify({ oneTime: true, ttlHours: 24 }),
        method: "POST",
      }),
      201,
    );
    const concurrent = await Promise.all([
      fetch(`${apiUrl}/api${oneTimeLink.url}`),
      fetch(`${apiUrl}/api${oneTimeLink.url}`),
    ]);
    assert.deepEqual(
      concurrent.map((response) => response.status).sort(),
      [200, 404],
    );

    await json(
      await owner.session.request(`/api/share-links/${secretLink.id}`, {
        method: "DELETE",
      }),
    );
    await json(await fetch(`${apiUrl}/api${secretLink.url}`), 404);
    await json(
      await owner.session.request(`/api/templates/${template.id}`, {
        method: "DELETE",
      }),
    );
    await json(
      await owner.session.request(`/api/notes/tags/${tag.id}`, {
        method: "DELETE",
      }),
    );

    console.log(
      "Notes HTTP acceptance passed: owner isolation, CRUD, hierarchy, tags, versions, templates, encrypted fields, JSON round-trip, share redaction/revocation/expiry and one-time concurrency.",
    );
  } finally {
    if (usernames.length > 0) {
      await database.delete(users).where(inArray(users.username, usernames));
    }
    if (planId > 0) {
      await database
        .delete(subscriptionPlans)
        .where(eq(subscriptionPlans.id, planId));
    }
    await pool.end();
  }
}

await run();
