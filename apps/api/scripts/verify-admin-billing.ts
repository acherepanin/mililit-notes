import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  PayloadTooLargeException,
} from "@nestjs/common";
import {
  activityLogs,
  createDatabase,
  createDatabasePool,
  notes,
  subscriptionPlans,
  userSubscriptions,
  users,
} from "@notes/db";
import { and, eq, inArray } from "drizzle-orm";

import { AdminBillingService } from "../src/admin/admin-billing.service.js";
import type { DatabaseService } from "../src/database/database.service.js";
import { EntitlementsService } from "../src/entitlements/entitlements.service.js";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://notes_v2:notes_v2_local_only@127.0.0.1:55432/notes_v2";
const pool = createDatabasePool(databaseUrl, { max: 4 });
const database = createDatabase(pool);
const service = new AdminBillingService({
  client: database,
} as unknown as DatabaseService);
const entitlements = new EntitlementsService({
  client: database,
} as unknown as DatabaseService);
const suffix = randomUUID();
let actorId = 0;
let targetUserId = 0;
let entitlementUserId = 0;
let planId = 0;

try {
  const [actor] = await database
    .insert(users)
    .values({
      email: `phase9-billing-actor-${suffix}@example.test`,
      emailVerified: true,
      name: "Billing verifier actor",
      role: "admin",
      username: `phase9_billing_actor_${suffix}`,
    })
    .returning({ id: users.id });
  const [target] = await database
    .insert(users)
    .values({
      email: `phase9-billing-user-${suffix}@example.test`,
      emailVerified: true,
      name: "Billing verifier user",
      username: `phase9_billing_user_${suffix}`,
    })
    .returning({ id: users.id });
  const [plan] = await database
    .insert(subscriptionPlans)
    .values({
      billingPeriod: "month",
      currency: "rub",
      entitlements: {
        ai: { enabled: true, monthlyTokenLimit: 1_000 },
        commands: { enabled: true },
        files: { enabled: true, storageLimitBytes: 10 * 1024 ** 2 },
        workspace: { enabled: true, maxNotes: 10 },
      },
      name: "Billing verifier",
      priceCents: 100,
      slug: `phase9-billing-${suffix}`,
    })
    .returning({
      id: subscriptionPlans.id,
      revision: subscriptionPlans.revision,
    });
  assert.ok(actor && target && plan);
  actorId = actor.id;
  targetUserId = target.id;
  planId = plan.id;

  const concurrentUpdates = await Promise.allSettled([
    service.updatePlan(actorId, planId, {
      expectedRevision: plan.revision,
      name: "Billing verifier A",
    }),
    service.updatePlan(actorId, planId, {
      expectedRevision: plan.revision,
      name: "Billing verifier B",
    }),
  ]);
  assert.equal(
    concurrentUpdates.filter((result) => result.status === "fulfilled").length,
    1,
  );
  const rejectedUpdate = concurrentUpdates.find(
    (result) => result.status === "rejected",
  );
  assert.ok(
    rejectedUpdate?.status === "rejected" &&
      rejectedUpdate.reason instanceof ConflictException,
  );
  const [afterConcurrentUpdate] = await database
    .select({ revision: subscriptionPlans.revision })
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.id, planId))
    .limit(1);
  assert.ok(afterConcurrentUpdate);
  await service.updatePlan(actorId, planId, {
    entitlements: {
      ai: { enabled: true, monthlyTokenLimit: 0 },
      exportImport: { enabled: false },
      files: { enabled: true, storageLimitBytes: 20 * 1024 ** 2 },
      publicShare: { enabled: false },
      templates: { enabled: false },
      versioning: { enabled: false },
      voice: { enabled: false },
      workspace: {
        enabled: true,
        maxNoteContentBytes: 4,
        maxNotes: 1,
      },
    },
    expectedRevision: afterConcurrentUpdate.revision,
  });
  const [quotaPlan] = await database
    .select({ entitlements: subscriptionPlans.entitlements })
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.id, planId))
    .limit(1);
  assert.deepEqual(quotaPlan?.entitlements, {
    ai: { enabled: true, monthlyTokenLimit: 0 },
    commands: { enabled: true },
    exportImport: { enabled: false },
    files: { enabled: true, storageLimitBytes: 20 * 1024 ** 2 },
    publicShare: { enabled: false },
    templates: { enabled: false },
    versioning: { enabled: false },
    voice: { enabled: false },
    workspace: {
      enabled: true,
      maxNoteContentBytes: 4,
      maxNotes: 1,
    },
  });

  const [entitlementUser] = await database
    .insert(users)
    .values({
      email: `phase9-entitlement-user-${suffix}@example.test`,
      emailVerified: true,
      name: "Entitlement verifier user",
      username: `phase9_entitlement_user_${suffix}`,
    })
    .returning({ id: users.id });
  assert.ok(entitlementUser);
  entitlementUserId = entitlementUser.id;
  await database.insert(userSubscriptions).values({
    planId,
    source: "verification",
    startedAt: new Date(),
    status: "active",
    userId: entitlementUserId,
  });
  const effective = await entitlements.getEffective(entitlementUserId);
  assert.equal(effective.plan.id, planId);
  assert.throws(
    () => entitlements.assertNoteContentSize(effective, "аб", "в"),
    PayloadTooLargeException,
  );
  await assert.rejects(
    entitlements.assertFileStorage(entitlementUserId, 20 * 1024 ** 2 + 1),
    PayloadTooLargeException,
  );
  await assert.rejects(
    entitlements.assertAiUsage(entitlementUserId, 1),
    (error: unknown) =>
      error instanceof HttpException && error.getStatus() === 429,
  );
  await Promise.all(
    [
      entitlements.assertVoiceEnabled(entitlementUserId),
      entitlements.assertTemplatesEnabled(entitlementUserId),
      entitlements.assertVersioningEnabled(entitlementUserId),
      entitlements.assertPublicShareEnabled(entitlementUserId),
      entitlements.assertExportImportEnabled(entitlementUserId),
    ].map((check) => assert.rejects(check, ForbiddenException)),
  );
  assert.deepEqual(
    await entitlements.integrationToolAllowlist(entitlementUserId, [
      "notes.read",
      "attachments.list",
      "templates.list",
      "versions.list",
      "shareLinks.create",
    ]),
    ["notes.read", "attachments.list"],
  );

  const createQuotaNote = (name: string) =>
    database.transaction(async (tx) => {
      await entitlements.lockUserQuota(entitlementUserId, tx);
      const current = await entitlements.assertCanCreateNotes(
        entitlementUserId,
        1,
        tx,
      );
      entitlements.assertNoteContentSize(current, "", "");
      await tx.insert(notes).values({ name, userId: entitlementUserId });
    });
  const concurrentNotes = await Promise.allSettled([
    createQuotaNote("Quota note A"),
    createQuotaNote("Quota note B"),
  ]);
  assert.equal(
    concurrentNotes.filter((result) => result.status === "fulfilled").length,
    1,
  );
  const rejectedNote = concurrentNotes.find(
    (result) => result.status === "rejected",
  );
  assert.ok(
    rejectedNote?.status === "rejected" &&
      rejectedNote.reason instanceof HttpException &&
      rejectedNote.reason.getStatus() === 429,
  );

  const [free] = await database
    .select({ id: subscriptionPlans.id, revision: subscriptionPlans.revision })
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.slug, "free"))
    .limit(1);
  assert.ok(free);
  await assert.rejects(
    service.updatePlan(actorId, free.id, {
      expectedRevision: free.revision,
      priceCents: 1,
    }),
    BadRequestException,
  );

  const concurrentAssignments = await Promise.allSettled([
    service.assignSubscription(actorId, targetUserId, {
      expectedCurrentSubscriptionId: null,
      planId,
    }),
    service.assignSubscription(actorId, targetUserId, {
      expectedCurrentSubscriptionId: null,
      planId: free.id,
    }),
  ]);
  assert.equal(
    concurrentAssignments.filter((result) => result.status === "fulfilled")
      .length,
    1,
  );
  const rejectedAssignment = concurrentAssignments.find(
    (result) => result.status === "rejected",
  );
  assert.ok(
    rejectedAssignment?.status === "rejected" &&
      rejectedAssignment.reason instanceof ConflictException,
  );

  const active = await database
    .select({ id: userSubscriptions.id })
    .from(userSubscriptions)
    .where(
      and(
        eq(userSubscriptions.userId, targetUserId),
        eq(userSubscriptions.status, "active"),
      ),
    );
  assert.equal(active.length, 1);
  const audits = await database
    .select({ action: activityLogs.action })
    .from(activityLogs)
    .where(eq(activityLogs.actorId, actorId));
  assert.deepEqual(
    new Set(audits.map((entry) => entry.action)),
    new Set(["admin.plan.update", "admin.subscription.assign"]),
  );

  console.log(
    "Admin billing verification passed: optimistic plan update, allowlisted entitlements, unknown-field preservation, quota rejection and concurrency, free fallback policy, serialized assignment, audit",
  );
} finally {
  if (actorId || targetUserId || entitlementUserId) {
    await database.delete(activityLogs).where(
      inArray(
        activityLogs.actorId,
        [actorId, targetUserId, entitlementUserId].filter((id) => id > 0),
      ),
    );
  }
  if (targetUserId || actorId || entitlementUserId) {
    await database.delete(users).where(
      inArray(
        users.id,
        [targetUserId, actorId, entitlementUserId].filter((id) => id > 0),
      ),
    );
  }
  if (planId) {
    await database
      .delete(subscriptionPlans)
      .where(eq(subscriptionPlans.id, planId));
  }
  await pool.end();
}
