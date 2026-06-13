import { ActivityLogEntity, RequestErrorLogEntity } from './activity.entity';
import {
  AiAuditLogEntity,
  AiModelCatalogEntity,
  AiNoteEmbeddingEntity,
  AiProviderModelEntity,
  AiProviderSettingsEntity,
  AiUsageLogEntity,
  AiUserSettingsEntity,
} from './ai.entity';
import {
  AiBotAdminSettingsEntity,
  AiBotLinkCodeEntity,
  AiBotPendingActionEntity,
  AiBotUsageLogEntity,
  AiBotUserSettingsEntity,
} from './ai-bot.entity';
import { AttachmentEntity, AttachmentFolderEntity } from './attachment.entity';
import {
  NoteEntity,
  NoteTagEntity,
  NoteTemplateEntity,
  NoteVersionEntity,
  TagEntity,
} from './note.entity';
import { PendingRegistrationEntity } from './registration.entity';
import { ShareLinkAccessLogEntity, ShareLinkEntity } from './share.entity';
import {
  SubscriptionOrderEntity,
  SubscriptionPlanEntity,
  UserSubscriptionEntity,
} from './subscription.entity';
import { UserEntity } from './user.entity';

export * from './activity.entity';
export * from './ai.entity';
export * from './ai-bot.entity';
export * from './attachment.entity';
export * from './note.entity';
export * from './registration.entity';
export * from './share.entity';
export * from './subscription.entity';
export * from './user.entity';

export const ALL_ENTITIES = [
  UserEntity,
  NoteEntity,
  TagEntity,
  NoteTagEntity,
  NoteVersionEntity,
  NoteTemplateEntity,
  AttachmentEntity,
  AttachmentFolderEntity,
  ShareLinkEntity,
  ShareLinkAccessLogEntity,
  ActivityLogEntity,
  RequestErrorLogEntity,
  AiUserSettingsEntity,
  AiProviderSettingsEntity,
  AiProviderModelEntity,
  AiModelCatalogEntity,
  AiAuditLogEntity,
  AiUsageLogEntity,
  AiNoteEmbeddingEntity,
  AiBotAdminSettingsEntity,
  AiBotUserSettingsEntity,
  AiBotLinkCodeEntity,
  AiBotPendingActionEntity,
  AiBotUsageLogEntity,
  SubscriptionPlanEntity,
  UserSubscriptionEntity,
  SubscriptionOrderEntity,
  PendingRegistrationEntity,
] as const;
