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
import { NoteEntity } from './note.entity';
import { UserEntity } from './user.entity';

@Entity({ name: 'ai_user_settings' })
export class AiUserSettingsEntity {
  @PrimaryColumn({ type: 'int' })
  user_id!: number;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'int', default: 0 })
  enabled!: number;

  @Column({ type: 'int', default: 0 })
  allow_read_secrets!: number;

  @Column({ type: 'int', default: 1 })
  require_action_confirmation!: number;

  @Column({ type: 'int', nullable: true })
  daily_request_limit!: number | null;

  @Column({ type: 'int', nullable: true })
  daily_token_limit!: number | null;

  @Column({ type: 'text', default: 'OpenAI-compatible' })
  provider_name!: string;

  @Column({ type: 'text', default: 'https://api.openai.com/v1' })
  base_url!: string;

  @Column({ type: 'text', nullable: true })
  model!: string | null;

  @Column({ type: 'text', nullable: true })
  api_key_encrypted!: string | null;

  @Column({ type: 'text', nullable: true })
  api_key_hint!: string | null;

  @Column({ type: 'text', nullable: true })
  api_key_updated_at!: string | null;

  @Column({ type: 'text', nullable: true })
  last_connection_check_at!: string | null;

  @Column({ type: 'text', nullable: true })
  last_connection_check_status!: string | null;

  @Column({ type: 'text', nullable: true })
  last_models_sync_at!: string | null;

  @Column({ type: 'text', nullable: true })
  models_sync_status!: string | null;

  @Column({ type: 'text', nullable: true })
  models_sync_error!: string | null;

  @Column({ type: 'text', default: () => NOW_TEXT })
  created_at!: string;

  @Column({ type: 'text', default: () => NOW_TEXT })
  updated_at!: string;
}

@Entity({ name: 'ai_provider_settings' })
@Unique(['user_id', 'provider_name', 'base_url'])
export class AiProviderSettingsEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  user_id!: number;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'text' })
  provider_name!: string;

  @Column({ type: 'text' })
  base_url!: string;

  @Column({ type: 'text', nullable: true })
  model!: string | null;

  @Column({ type: 'text', nullable: true })
  api_key_encrypted!: string | null;

  @Column({ type: 'text', nullable: true })
  api_key_hint!: string | null;

  @Column({ type: 'text', nullable: true })
  api_key_updated_at!: string | null;

  @Column({ type: 'text', nullable: true })
  last_connection_check_at!: string | null;

  @Column({ type: 'text', nullable: true })
  last_connection_check_status!: string | null;

  @Column({ type: 'text', nullable: true })
  last_models_sync_at!: string | null;

  @Column({ type: 'text', nullable: true })
  models_sync_status!: string | null;

  @Column({ type: 'text', nullable: true })
  models_sync_error!: string | null;

  @Column({ type: 'text', default: () => NOW_TEXT })
  created_at!: string;

  @Column({ type: 'text', default: () => NOW_TEXT })
  updated_at!: string;
}

@Entity({ name: 'ai_provider_models' })
@Unique(['user_id', 'provider_name', 'model_id'])
export class AiProviderModelEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  user_id!: number;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'text' })
  provider_name!: string;

  @Column({ type: 'text' })
  model_id!: string;

  @Column({ type: 'text' })
  label!: string;

  @Column({ type: 'text', default: 'unknown' })
  tier!: string;

  @Column({ type: 'text', default: 'unknown' })
  quality!: string;

  @Column({ type: 'text', default: 'unknown' })
  speed!: string;

  @Column({ type: 'text', default: 'unknown' })
  cost!: string;

  @Column({ type: 'double precision', nullable: true })
  input_price_per_1m!: number | null;

  @Column({ type: 'double precision', nullable: true })
  cached_input_price_per_1m!: number | null;

  @Column({ type: 'double precision', nullable: true })
  output_price_per_1m!: number | null;

  @Column({ type: 'text', default: '[]' })
  capabilities!: string;

  @Column({ type: 'int', default: 0 })
  is_deprecated!: number;

  @Column({ type: 'int', nullable: true })
  provider_created_at!: number | null;

  @Column({ type: 'text' })
  last_seen_at!: string;

  @Column({ type: 'text', default: () => NOW_TEXT })
  created_at!: string;

  @Column({ type: 'text', default: () => NOW_TEXT })
  updated_at!: string;
}

@Entity({ name: 'ai_model_catalog' })
export class AiModelCatalogEntity {
  @PrimaryColumn({ type: 'text' })
  model_id!: string;

  @Column({ type: 'text', nullable: true })
  label!: string | null;

  @Column({ type: 'text', default: 'unknown' })
  tier!: string;

  @Column({ type: 'text', default: 'unknown' })
  quality!: string;

  @Column({ type: 'text', default: 'unknown' })
  speed!: string;

  @Column({ type: 'text', default: 'unknown' })
  cost!: string;

  @Column({ type: 'int', default: 50 })
  score!: number;

  @Column({ type: 'int', default: 50 })
  speed_score!: number;

  @Column({ type: 'int', default: 50 })
  value_score!: number;

  @Column({ type: 'int', default: 0 })
  sort_rank!: number;

  @Column({ type: 'double precision', nullable: true })
  input_price_per_1m!: number | null;

  @Column({ type: 'double precision', nullable: true })
  cached_input_price_per_1m!: number | null;

  @Column({ type: 'double precision', nullable: true })
  output_price_per_1m!: number | null;

  @Column({ type: 'text', default: '[]' })
  capabilities!: string;

  @Column({ type: 'int', default: 0 })
  is_deprecated!: number;

  @Column({ type: 'text', default: 'builtin' })
  source!: string;

  @Column({ type: 'text', default: () => NOW_TEXT })
  last_seen_at!: string;

  @Column({ type: 'text', default: () => NOW_TEXT })
  created_at!: string;

  @Column({ type: 'text', default: () => NOW_TEXT })
  updated_at!: string;
}

@Entity({ name: 'ai_audit_logs' })
@Index('idx_ai_audit_logs_user', ['user_id', 'created_at', 'id'])
export class AiAuditLogEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  user_id!: number;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'text' })
  action!: string;

  @Column({ type: 'text', nullable: true })
  target_type!: string | null;

  @Column({ type: 'int', nullable: true })
  target_id!: number | null;

  @Column({ type: 'text', default: '{}' })
  details!: string;

  @Column({ type: 'text', default: () => NOW_TEXT })
  created_at!: string;
}

@Entity({ name: 'ai_usage_logs' })
@Index('idx_ai_usage_logs_user', ['user_id', 'created_at', 'id'])
@Index('idx_ai_usage_logs_created_user', ['created_at', 'user_id', 'provider_name', 'model'])
export class AiUsageLogEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  user_id!: number;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'text' })
  provider_name!: string;

  @Column({ type: 'text' })
  model!: string;

  @Column({ type: 'int', default: 0 })
  input_tokens!: number;

  @Column({ type: 'int', default: 0 })
  output_tokens!: number;

  @Column({ type: 'text', default: () => NOW_TEXT })
  created_at!: string;
}

@Entity({ name: 'ai_note_embeddings' })
@Unique(['user_id', 'note_id', 'provider_name', 'base_url', 'model'])
export class AiNoteEmbeddingEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  user_id!: number;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'int' })
  note_id!: number;

  @ManyToOne(() => NoteEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'note_id' })
  note?: NoteEntity;

  @Column({ type: 'text' })
  provider_name!: string;

  @Column({ type: 'text' })
  base_url!: string;

  @Column({ type: 'text' })
  model!: string;

  @Column({ type: 'text' })
  content_hash!: string;

  @Column({ type: 'text' })
  vector_json!: string;

  @Column({ type: 'text', default: () => NOW_TEXT })
  created_at!: string;

  @Column({ type: 'text', default: () => NOW_TEXT })
  updated_at!: string;
}
