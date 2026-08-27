import { requestApi } from "./notes-api";

export interface NotificationItem {
  createdAt: string;
  id: number;
  kind: "subscription_purchase" | "subscription_renew";
  payload: Record<string, unknown>;
  readAt: string | null;
}

export interface NotificationPreferences {
  subscriptionEvents: boolean;
}

export const notificationsApi = {
  list() {
    return requestApi<{ items: NotificationItem[]; unreadCount: number }>(
      "/notifications",
    );
  },
  markAllRead() {
    return requestApi<{ updated: number }>("/notifications/read-all", {
      method: "POST",
    });
  },
  markRead(id: number) {
    return requestApi<{ id: number }>(`/notifications/${id}/read`, {
      method: "POST",
    });
  },
  preferences() {
    return requestApi<NotificationPreferences>("/notifications/preferences");
  },
  updatePreferences(preferences: NotificationPreferences) {
    return requestApi<NotificationPreferences>("/notifications/preferences", {
      body: JSON.stringify(preferences),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    });
  },
};
