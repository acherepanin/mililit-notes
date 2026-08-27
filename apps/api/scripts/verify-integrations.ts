import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  BadRequestException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from "@nestjs/common";
import {
  aiBotPendingActions,
  aiConversations,
  aiMessages,
  aiToolCalls,
  aiToolConfirmations,
  createDatabase,
  createDatabasePool,
  users,
} from "@notes/db";
import { and, eq } from "drizzle-orm";

import { AiPolicyService } from "../src/ai/ai-policy.service.js";
import { ToolConfirmationService } from "../src/ai/tool-confirmation.service.js";
import { AdminHistoryService } from "../src/admin/admin-history.service.js";
import { DatabaseService } from "../src/database/database.service.js";
import { IntegrationPendingActionsService } from "../src/integrations/integration-pending-actions.service.js";
import { IntegrationProcessingService } from "../src/integrations/integration-processing.service.js";
import { CorrelationContextService } from "../src/observability/correlation-context.service.js";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://notes_v2:notes_v2_local_only@localhost:55432/notes_v2";
const pool = createDatabasePool(databaseUrl, { max: 4 });
const database = createDatabase(pool);
const databaseService = { client: database } as unknown as DatabaseService;
const policy = new AiPolicyService();
const correlation = new CorrelationContextService();
const pendingActions = new IntegrationPendingActionsService(databaseService);
const confirmations = new ToolConfirmationService(
  databaseService,
  policy,
  correlation,
);
const linkedUser = {
  accessMode: "write",
  allowAttachments: true,
  allowNoteDelete: true,
  allowNoteRead: true,
  allowNoteWrite: true,
  allowShareLinks: true,
  allowTags: true,
  allowTemplates: true,
  allowVersions: true,
};
let blockUsage = false;
let failExecution = false;
const deliveries: string[] = [];
const settings = {
  async findLinkedUser() {
    return linkedUser;
  },
  async reserveUsage() {
    if (blockUsage) {
      throw new HttpException(
        "Daily bot write limit reached",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return linkedUser;
  },
};
const execution = {
  async execute(currentUserId: number, toolCallId: number) {
    await confirmations.claimForExecution(currentUserId, toolCallId);
    if (failExecution) {
      await confirmations.finishExecution(
        currentUserId,
        toolCallId,
        null,
        "acceptance_failure",
      );
      throw new Error("acceptance_failure");
    }
    const result = { deleted: true };
    await confirmations.finishExecution(currentUserId, toolCallId, result);
    return result;
  },
};
const processing = new IntegrationProcessingService(
  databaseService,
  settings as never,
  {} as never,
  {} as never,
  policy,
  confirmations,
  execution as never,
  pendingActions,
  {} as never,
  {} as never,
  {
    async integrationToolAllowlist(
      _userId: number,
      requested: readonly string[],
    ) {
      return [...requested];
    },
  } as never,
);
const history = new AdminHistoryService(databaseService);
const processingRuntime = processing as unknown as {
  handlePendingAction(
    admin: unknown,
    currentUserId: number,
    message: unknown,
    decision: "approved" | "rejected",
    pendingId: number,
  ): Promise<void>;
  send(admin: unknown, message: unknown, value: string): Promise<void>;
};
processingRuntime.send = async (_admin, _message, value) => {
  deliveries.push(value);
};

const suffix = randomUUID().replaceAll("-", "");
let userId = 0;

async function createFixture(
  messageId: number,
  externalId: string,
  expiresAt = new Date(Date.now() + 10 * 60 * 1_000),
) {
  const call = await confirmations.createToolCall(
    userId,
    messageId,
    "notes.delete",
    { noteId: 1, revision: 1 },
    randomUUID(),
    true,
  );
  assert.ok(call.confirmation);
  const pending = await pendingActions.create({
    actionName: "notes.delete",
    actionPayload: {
      confirmationId: call.confirmation.id,
      toolCallId: call.toolCall.id,
    },
    expiresAt,
    externalId,
    provider: "telegram",
    userId,
  });
  return { pending };
}

async function pendingState(id: number) {
  const [row] = await database
    .select()
    .from(aiBotPendingActions)
    .where(
      and(
        eq(aiBotPendingActions.id, id),
        eq(aiBotPendingActions.userId, userId),
      ),
    )
    .limit(1);
  assert.ok(row);
  return row;
}

function incoming(externalId = "telegram-owner") {
  return {
    chatId: externalId,
    externalId,
    files: [],
    provider: "telegram",
    text: "",
    username: null,
  };
}

function handle(
  pendingId: number,
  decision: "approved" | "rejected",
  externalId = "telegram-owner",
) {
  return processingRuntime.handlePendingAction(
    {},
    userId,
    incoming(externalId),
    decision,
    pendingId,
  );
}

try {
  const [user] = await database
    .insert(users)
    .values({
      email: `integration-${suffix}@notes.test`,
      emailVerified: true,
      name: "Integration verifier",
      username: `integration_${suffix}`,
    })
    .returning({ id: users.id });
  assert.ok(user);
  userId = user.id;

  const [conversation] = await database
    .insert(aiConversations)
    .values({ channel: "telegram", userId })
    .returning({ id: aiConversations.id });
  assert.ok(conversation);
  const [message] = await database
    .insert(aiMessages)
    .values({
      content: [{ text: "verify", type: "text" }],
      contentText: "verify",
      conversationId: conversation.id,
      role: "assistant",
      sequence: 1,
      status: "completed",
      userId,
    })
    .returning({ id: aiMessages.id });
  assert.ok(message);

  const scoped = await createFixture(message.id, "telegram-owner");
  await assert.rejects(
    handle(scoped.pending.id, "approved", "telegram-attacker"),
    NotFoundException,
  );
  assert.equal((await pendingState(scoped.pending.id)).status, "pending");

  blockUsage = true;
  await assert.rejects(handle(scoped.pending.id, "approved"), HttpException);
  const released = await pendingState(scoped.pending.id);
  assert.equal(released.status, "pending");
  assert.equal(released.lastError, "Daily bot write limit reached");
  blockUsage = false;
  await handle(scoped.pending.id, "rejected");
  assert.equal((await pendingState(scoped.pending.id)).status, "rejected");

  const approved = await createFixture(message.id, "telegram-owner");
  const concurrent = await Promise.allSettled([
    handle(approved.pending.id, "approved"),
    handle(approved.pending.id, "approved"),
  ]);
  assert.equal(
    concurrent.filter((item) => item.status === "fulfilled").length,
    1,
  );
  const approvedReplay = await pendingActions.claim(
    userId,
    "telegram",
    "telegram-owner",
    approved.pending.id,
  );
  assert.equal(approvedReplay.kind, "terminal");
  assert.match(
    approvedReplay.responseText,
    /^Действие выполнено: notes\.delete/,
  );

  const toolCorrelation = `phase9-ai-tool-${suffix}`;
  const failed = await correlation.run(toolCorrelation, () =>
    createFixture(message.id, "telegram-owner"),
  );
  failExecution = true;
  await assert.rejects(
    handle(failed.pending.id, "approved"),
    /acceptance_failure/,
  );
  failExecution = false;
  assert.equal((await pendingState(failed.pending.id)).status, "failed");
  const diagnostics = await history.listDiagnostics({
    cursor: null,
    kind: "ai_tool",
    limit: 50,
    userId,
  });
  assert.ok(
    diagnostics.items.some(
      (item) =>
        "correlationId" in item && item.correlationId === toolCorrelation,
    ),
  );

  const expired = await createFixture(
    message.id,
    "telegram-owner",
    new Date(Date.now() - 1_000),
  );
  await assert.rejects(
    handle(expired.pending.id, "approved"),
    BadRequestException,
  );
  assert.equal((await pendingState(expired.pending.id)).status, "expired");

  const toolStates = await database
    .select({
      confirmation: aiToolConfirmations.status,
      tool: aiToolCalls.status,
    })
    .from(aiToolCalls)
    .innerJoin(
      aiToolConfirmations,
      eq(aiToolConfirmations.toolCallId, aiToolCalls.id),
    )
    .where(eq(aiToolCalls.userId, userId));
  assert.ok(
    toolStates.some(
      (state) =>
        state.confirmation === "consumed" && state.tool === "succeeded",
    ),
  );
  assert.ok(
    toolStates.some(
      (state) => state.confirmation === "rejected" && state.tool === "rejected",
    ),
  );
  assert.ok(
    toolStates.some(
      (state) => state.confirmation === "consumed" && state.tool === "failed",
    ),
  );
  assert.equal(
    deliveries.filter((value) => value.includes("выполнено")).length,
    1,
  );

  console.log(
    "Integration verification passed: identity scope, limit recovery, atomic approve, reject, replay, expiry, execution failure, AI diagnostic correlation",
  );
} finally {
  if (userId) await database.delete(users).where(eq(users.id, userId));
  await pool.end();
}
