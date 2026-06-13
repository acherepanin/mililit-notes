import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import { NOW_TEXT } from './column-helpers';
import { NoteEntity } from './note.entity';
import { UserEntity } from './user.entity';

@Entity({ name: 'share_links' })
@Index('idx_share_links_note', ['note_id', 'created_at'])
@Index('idx_share_links_active', ['revoked_at', 'expires_at'])
export class ShareLinkEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  note_id!: number;

  @ManyToOne(() => NoteEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'note_id' })
  note?: NoteEntity;

  @Column({ type: 'int' })
  user_id!: number;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Index({ unique: true })
  @Column({ type: 'text' })
  token_hash!: string;

  @Column({ type: 'text', nullable: true })
  public_url!: string | null;

  @Column({ type: 'text' })
  expires_at!: string;

  @Column({ type: 'int', default: 0 })
  include_secrets!: number;

  @Column({ type: 'int', nullable: true })
  max_access_count!: number | null;

  @Column({ type: 'int', default: 0 })
  access_count!: number;

  @Column({ type: 'text', nullable: true })
  revoked_at!: string | null;

  @Column({ type: 'text', default: () => NOW_TEXT })
  created_at!: string;

  @Column({ type: 'text', nullable: true })
  last_accessed_at!: string | null;
}

@Entity({ name: 'share_link_access_logs' })
export class ShareLinkAccessLogEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  share_link_id!: number;

  @ManyToOne(() => ShareLinkEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'share_link_id' })
  shareLink?: ShareLinkEntity;

  @Column({ type: 'text', default: () => NOW_TEXT })
  accessed_at!: string;

  @Column({ type: 'text', nullable: true })
  user_agent!: string | null;

  @Column({ type: 'text', nullable: true })
  ip_address!: string | null;
}
