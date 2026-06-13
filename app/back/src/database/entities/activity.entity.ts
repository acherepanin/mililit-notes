import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import { NOW_TEXT } from './column-helpers';
import { UserEntity } from './user.entity';

@Entity({ name: 'activity_logs' })
@Index('idx_activity_created', ['created_at', 'id'])
@Index('idx_activity_user', ['user_id', 'created_at'])
@Index('idx_activity_actor', ['actor_id', 'created_at'])
@Index('idx_activity_action_created', ['action', 'created_at', 'id'])
export class ActivityLogEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int', nullable: true })
  actor_id!: number | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actor_id' })
  actor?: UserEntity | null;

  @Column({ type: 'int', nullable: true })
  user_id!: number | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity | null;

  @Column({ type: 'text' })
  action!: string;

  @Column({ type: 'text' })
  target_type!: string;

  @Column({ type: 'int', nullable: true })
  target_id!: number | null;

  @Column({ type: 'text', default: '{}' })
  details!: string;

  @Column({ type: 'text', default: () => NOW_TEXT })
  created_at!: string;
}

@Entity({ name: 'request_error_logs' })
@Index('idx_request_errors_created', ['created_at', 'id'])
@Index('idx_request_errors_status', ['status_code', 'created_at'])
export class RequestErrorLogEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int', nullable: true })
  user_id!: number | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity | null;

  @Column({ type: 'text' })
  method!: string;

  @Column({ type: 'text' })
  path!: string;

  @Column({ type: 'int' })
  status_code!: number;

  @Column({ type: 'text', nullable: true })
  message!: string | null;

  @Column({ type: 'text', nullable: true })
  error_name!: string | null;

  @Column({ type: 'text', default: '{}' })
  error_body!: string;

  @Column({ type: 'int', default: 0 })
  duration_ms!: number;

  @Column({ type: 'text', default: () => NOW_TEXT })
  created_at!: string;
}
