import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

import { NOW_TEXT } from './column-helpers';
import { UserEntity } from './user.entity';

@Entity({ name: 'ai_bot_admin_settings' })
export class AiBotAdminSettingsEntity {
  @PrimaryColumn({ type: 'text' })
  provider!: string;

  @Column({ type: 'int', default: 0 })
  enabled!: number;

  @Column({ type: 'text', nullable: true })
  webhook_url!: string | null;

  @Column({ type: 'text', nullable: true })
  bot_token_encrypted!: string | null;

  @Column({ type: 'text', nullable: true })
  access_token_encrypted!: string | null;

  @Column({ type: 'text', nullable: true })
  secret_encrypted!: string | null;

  @Column({ type: 'text', nullable: true })
  group_id!: string | null;

  @Column({ type: 'text', nullable: true })
  confirmation_code!: string | null;

  @Column({ type: 'int', default: 0 })
  allow_secrets!: number;

  @Column({ type: 'int', default: 1 })
  require_confirmation!: number;

  @Column({ type: 'int', nullable: true })
  daily_request_limit!: number | null;

  @Column({ type: 'int', nullable: true })
  daily_read_limit!: number | null;

  @Column({ type: 'int', nullable: true })
  daily_write_limit!: number | null;

  @Column({ type: 'text', nullable: true })
  last_check_at!: string | null;

  @Column({ type: 'text', nullable: true })
  last_check_status!: string | null;

  @Column({ type: 'text', nullable: true })
  last_check_error!: string | null;

  @Column({ type: 'text', default: () => NOW_TEXT })
  created_at!: string;

  @Column({ type: 'text', default: () => NOW_TEXT })
  updated_at!: string;
}

@Entity({ name: 'ai_bot_user_settings' })
@Unique(['user_id', 'provider'])
@Index('idx_ai_bot_user_settings_provider', ['provider', 'linked_external_id'])
export class AiBotUserSettingsEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  user_id!: number;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'text' })
  provider!: string;

  @Column({ type: 'int', default: 0 })
  enabled!: number;

  @Column({ type: 'text', default: 'read' })
  access_mode!: string;

  @Column({ type: 'int', default: 0 })
  allow_secrets!: number;

  @Column({ type: 'int', default: 1 })
  allow_note_read!: number;

  @Column({ type: 'int', default: 0 })
  allow_note_write!: number;

  @Column({ type: 'int', default: 0 })
  allow_note_delete!: number;

  @Column({ type: 'int', default: 0 })
  allow_tags!: number;

  @Column({ type: 'int', default: 0 })
  allow_templates!: number;

  @Column({ type: 'int', default: 0 })
  allow_versions!: number;

  @Column({ type: 'int', default: 0 })
  allow_attachments!: number;

  @Column({ type: 'int', default: 0 })
  allow_share_links!: number;

  @Column({ type: 'int', nullable: true })
  daily_request_limit!: number | null;

  @Column({ type: 'int', nullable: true })
  daily_read_limit!: number | null;

  @Column({ type: 'int', nullable: true })
  daily_write_limit!: number | null;

  @Column({ type: 'text', nullable: true })
  linked_external_id!: string | null;

  @Column({ type: 'text', nullable: true })
  linked_username!: string | null;

  @Column({ type: 'text', nullable: true })
  linked_at!: string | null;

  @Column({ type: 'text', default: () => NOW_TEXT })
  created_at!: string;

  @Column({ type: 'text', default: () => NOW_TEXT })
  updated_at!: string;
}

@Entity({ name: 'ai_bot_link_codes' })
@Index('idx_ai_bot_link_codes_user', ['user_id', 'provider', 'expires_at'])
export class AiBotLinkCodeEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  user_id!: number;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'text' })
  provider!: string;

  @Column({ type: 'text' })
  code_hash!: string;

  @Column({ type: 'text' })
  expires_at!: string;

  @Column({ type: 'text', default: () => NOW_TEXT })
  created_at!: string;
}

@Entity({ name: 'ai_bot_pending_actions' })
@Index('idx_ai_bot_pending_actions_user', [
  'user_id',
  'provider',
  'external_id',
  'expires_at',
  'id',
])
export class AiBotPendingActionEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  user_id!: number;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'text' })
  provider!: string;

  @Column({ type: 'text' })
  external_id!: string;

  @Column({ type: 'text' })
  action_name!: string;

  @Column({ type: 'text' })
  action_payload!: string;

  @Column({ type: 'text' })
  expires_at!: string;

  @Column({ type: 'text', default: () => NOW_TEXT })
  created_at!: string;
}

@Entity({ name: 'ai_bot_usage_logs' })
@Index('idx_ai_bot_usage_logs_user', ['user_id', 'provider', 'kind', 'created_at', 'id'])
@Index('idx_ai_bot_usage_logs_created', ['created_at', 'provider', 'kind'])
export class AiBotUsageLogEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  user_id!: number;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'text' })
  provider!: string;

  @Column({ type: 'text' })
  kind!: string;

  @Column({ type: 'text', nullable: true })
  action_name!: string | null;

  @Column({ type: 'int', default: 1 })
  usage_count!: number;

  @Column({ type: 'text', default: () => NOW_TEXT })
  created_at!: string;
}
