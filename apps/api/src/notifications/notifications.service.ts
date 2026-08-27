import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  activityLogs,
  notificationPreferences,
  userNotifications,
} from "@notes/db";
import { and, count, desc, eq, isNull } from "drizzle-orm";

import { DatabaseService } from "../database/database.service.js";

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async list(userId: number) {
    const [items, unread] = await Promise.all([
      this.database.client
        .select({
          createdAt: userNotifications.createdAt,
          id: userNotifications.id,
          kind: userNotifications.kind,
          payload: userNotifications.payload,
          readAt: userNotifications.readAt,
        })
        .from(userNotifications)
        .where(eq(userNotifications.userId, userId))
        .orderBy(desc(userNotifications.createdAt), desc(userNotifications.id))
        .limit(20),
      this.database.client
        .select({ value: count() })
        .from(userNotifications)
        .where(
          and(
            eq(userNotifications.userId, userId),
            isNull(userNotifications.readAt),
          ),
        ),
    ]);
    return {
      items: items.map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
        readAt: item.readAt?.toISOString() ?? null,
      })),
      unreadCount: unread[0]?.value ?? 0,
    };
  }

  async getPreferences(userId: number) {
    const [preferences] = await this.database.client
      .select({
        subscriptionEvents: notificationPreferences.subscriptionEvents,
      })
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId))
      .limit(1);
    return preferences ?? { subscriptionEvents: true };
  }

  async updatePreferences(
    userId: number,
    input: { subscriptionEvents: boolean },
  ) {
    return this.database.client.transaction(async (tx) => {
      const [preferences] = await tx
        .insert(notificationPreferences)
        .values({ ...input, userId })
        .onConflictDoUpdate({
          set: { ...input, updatedAt: new Date() },
          target: notificationPreferences.userId,
        })
        .returning({
          subscriptionEvents: notificationPreferences.subscriptionEvents,
        });
      await tx.insert(activityLogs).values({
        action: "notifications.preferences_update",
        actorId: userId,
        details: input,
        targetType: "notification_preferences",
        userId,
      });
      return preferences;
    });
  }

  async markRead(userId: number, id: number) {
    const [updated] = await this.database.client
      .update(userNotifications)
      .set({ readAt: new Date() })
      .where(
        and(eq(userNotifications.id, id), eq(userNotifications.userId, userId)),
      )
      .returning({ id: userNotifications.id });
    if (!updated) throw new NotFoundException("Notification was not found");
    return updated;
  }

  async markAllRead(userId: number) {
    const updated = await this.database.client
      .update(userNotifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(userNotifications.userId, userId),
          isNull(userNotifications.readAt),
        ),
      )
      .returning({ id: userNotifications.id });
    return { updated: updated.length };
  }
}
