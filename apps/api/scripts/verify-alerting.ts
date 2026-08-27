import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  activityLogs,
  createDatabase,
  createDatabasePool,
  users,
} from "@notes/db";
import { and, eq, inArray } from "drizzle-orm";

import { AdminAlertingService } from "../src/admin/admin-alerting.service.js";
import type { DatabaseService } from "../src/database/database.service.js";

const alertmanagerUrl =
  process.env.ALERTMANAGER_URL ?? "http://127.0.0.1:19093";
const prometheusUrl = process.env.PROMETHEUS_URL ?? "http://127.0.0.1:19090";
const mailpitUrl = process.env.MAILPIT_URL ?? "http://127.0.0.1:18025";
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://notes_v2:notes_v2_local_only@127.0.0.1:55432/notes_v2";

process.env.ALERTMANAGER_URL = alertmanagerUrl;
process.env.PROMETHEUS_URL = prometheusUrl;

const pool = createDatabasePool(databaseUrl, { max: 2 });
const database = createDatabase(pool);
const service = new AdminAlertingService({
  client: database,
} as unknown as DatabaseService);
const suffix = randomUUID();
const jobName = `phase9-alerting-${suffix}`;
const alertLabels = {
  alertname: "NotesWorkerJobFailed",
  job: "notes-worker",
  job_name: jobName,
  queue: "verification",
  severity: "warning",
};
let actorId = 0;
let alertPosted = false;
let silenceId: string | null = null;
let initialMailIds = new Set<string>();

interface MailpitMessage {
  ID: string;
  Subject: string;
}

async function responseJson<Value>(
  url: string,
  init?: RequestInit,
): Promise<Value> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(response.ok, true, `${url} returned ${response.status}`);
  return (await response.json()) as Value;
}

async function messages(): Promise<MailpitMessage[]> {
  const body = await responseJson<{ messages: MailpitMessage[] }>(
    `${mailpitUrl}/api/v1/messages`,
  );
  return body.messages;
}

async function postAlert(endsAt: Date): Promise<void> {
  const response = await fetch(`${alertmanagerUrl}/api/v2/alerts`, {
    body: JSON.stringify([
      {
        annotations: { summary: `Alerting verification ${suffix}` },
        endsAt: endsAt.toISOString(),
        labels: alertLabels,
        startsAt: new Date(Date.now() - 1_000).toISOString(),
      },
    ]),
    headers: { "content-type": "application/json" },
    method: "POST",
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(
    response.ok,
    true,
    `alert submission returned ${response.status}`,
  );
}

async function waitFor(
  description: string,
  condition: () => Promise<boolean>,
  timeoutMs = 45_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function removeNewMail(): Promise<void> {
  const ids = (await messages())
    .map((message) => message.ID)
    .filter((id) => !initialMailIds.has(id));
  if (!ids.length) return;
  const response = await fetch(`${mailpitUrl}/api/v1/messages`, {
    body: JSON.stringify({ IDs: ids }),
    headers: { "content-type": "application/json" },
    method: "DELETE",
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(response.ok, true, `mail cleanup returned ${response.status}`);
}

try {
  initialMailIds = new Set((await messages()).map((message) => message.ID));
  const [actor] = await database
    .insert(users)
    .values({
      email: `phase9-alerting-${suffix}@example.test`,
      emailVerified: true,
      name: "Alerting verifier",
      role: "admin",
      username: `phase9_alerting_${suffix}`,
    })
    .returning({ id: users.id });
  assert.ok(actor);
  actorId = actor.id;

  const initialState = await service.getState();
  assert.equal(initialState.configured, true);
  await postAlert(new Date(Date.now() + 5 * 60 * 1_000));
  alertPosted = true;

  await waitFor("synthetic alert", async () => {
    const state = await service.getState();
    return state.alerts.some((alert) => alert.jobName === jobName);
  });
  await waitFor("Alertmanager email", async () =>
    (await messages()).some(
      (message) =>
        !initialMailIds.has(message.ID) &&
        message.Subject.includes("NotesWorkerJobFailed"),
    ),
  );
  await waitFor("notification delivery metric", async () => {
    const state = await service.getState();
    return state.delivery.sent > initialState.delivery.sent;
  });

  const created = await service.createSilence(actorId, {
    alertName: "NotesWorkerJobFailed",
    comment: `Alerting verification ${suffix}`,
    durationMinutes: 5,
  });
  const silence = created.silences.find((item) =>
    item.comment.includes(suffix),
  );
  assert.ok(silence);
  silenceId = silence.id;
  assert.equal(silence.canDelete, true);

  const deleted = await service.deleteSilence(actorId, silenceId);
  assert.equal(
    deleted.silences.some((item) => item.id === silenceId),
    false,
  );
  silenceId = null;
  const audits = await database
    .select({ action: activityLogs.action })
    .from(activityLogs)
    .where(
      and(
        eq(activityLogs.actorId, actorId),
        inArray(activityLogs.action, [
          "admin.alert_silence.create",
          "admin.alert_silence.delete",
        ]),
      ),
    );
  assert.deepEqual(
    new Set(audits.map((entry) => entry.action)),
    new Set(["admin.alert_silence.create", "admin.alert_silence.delete"]),
  );

  await postAlert(new Date());
  await waitFor("resolved synthetic alert", async () => {
    const state = await service.getState();
    return !state.alerts.some((alert) => alert.jobName === jobName);
  });
  await waitFor("resolved email", async () =>
    (await messages()).some(
      (message) =>
        !initialMailIds.has(message.ID) &&
        message.Subject.includes("RESOLVED") &&
        message.Subject.includes("NotesWorkerJobFailed"),
    ),
  );
  await removeNewMail();
  alertPosted = false;

  console.log(
    "Alerting verification passed: alert, Mailpit delivery, metrics, silence lifecycle, audit, cleanup",
  );
} finally {
  if (silenceId) {
    await fetch(`${alertmanagerUrl}/api/v2/silence/${silenceId}`, {
      method: "DELETE",
    }).catch(() => undefined);
  }
  if (alertPosted) {
    await postAlert(new Date()).catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 16_000));
  }
  await removeNewMail().catch(() => undefined);
  if (actorId) {
    await database
      .delete(activityLogs)
      .where(eq(activityLogs.actorId, actorId));
    await database.delete(users).where(eq(users.id, actorId));
  }
  await pool.end();
}
