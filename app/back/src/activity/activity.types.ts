export type ActivityAction =
  | 'auth.login'
  | 'notes.create'
  | 'notes.update'
  | 'notes.move'
  | 'notes.delete'
  | 'ai.settings.update'
  | 'ai.chat'
  | 'ai.tool.execute'
  | 'admin.user.create'
  | 'admin.user.update'
  | 'admin.user.delete';

export interface ActivityRecord {
  id: number;
  actor_id: number | null;
  actor_username: string | null;
  user_id: number | null;
  user_username: string | null;
  action: ActivityAction;
  target_type: string;
  target_id: number | null;
  details: string;
  created_at: string;
}

export interface ActivityResponse {
  id: number;
  actorId: number | null;
  actorUsername: string | null;
  userId: number | null;
  userUsername: string | null;
  action: ActivityAction;
  targetType: string;
  targetId: number | null;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface RecordActivityParams {
  actorId: number | null;
  userId: number | null;
  action: ActivityAction;
  targetType: string;
  targetId: number | null;
  details?: Record<string, unknown>;
}
