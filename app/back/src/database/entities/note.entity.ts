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

import { AttachmentFolderEntity } from './attachment.entity';
import { NOW_TEXT } from './column-helpers';
import { UserEntity } from './user.entity';

@Entity({ name: 'notes' })
@Index('idx_notes_user_parent', ['user_id', 'parent_id'])
@Index('idx_notes_user_deleted', ['user_id', 'deleted_at'])
export class NoteEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  user_id!: number;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', default: '' })
  content_html!: string;

  @Column({ type: 'text', default: '' })
  content_text!: string;

  @Column({ type: 'int', nullable: true })
  parent_id!: number | null;

  @ManyToOne(() => NoteEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'parent_id' })
  parent?: NoteEntity | null;

  @Column({ type: 'int', default: 0 })
  position!: number;

  @Column({ type: 'int', default: 0 })
  is_favorite!: number;

  @Column({ type: 'int', default: 0 })
  is_pinned!: number;

  @Column({ type: 'text', nullable: true })
  deleted_at!: string | null;

  @Column({ type: 'int', nullable: true })
  deleted_by!: number | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'deleted_by' })
  deletedByUser?: UserEntity | null;

  @Column({ type: 'text', nullable: true })
  delete_reason!: string | null;

  @Column({ type: 'int', nullable: true })
  attachment_folder_id!: number | null;

  @ManyToOne(() => AttachmentFolderEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'attachment_folder_id' })
  attachmentFolder?: AttachmentFolderEntity | null;

  @Column({ type: 'text', default: () => NOW_TEXT })
  created_at!: string;

  @Column({ type: 'text', default: () => NOW_TEXT })
  updated_at!: string;
}

@Entity({ name: 'tags' })
@Unique(['user_id', 'name'])
export class TagEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  user_id!: number;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', nullable: true })
  color!: string | null;

  @Column({ type: 'text', default: () => NOW_TEXT })
  created_at!: string;

  @Column({ type: 'text', default: () => NOW_TEXT })
  updated_at!: string;
}

@Entity({ name: 'note_tags' })
@Index('idx_note_tags_tag', ['tag_id', 'note_id'])
export class NoteTagEntity {
  @PrimaryColumn({ type: 'int' })
  note_id!: number;

  @ManyToOne(() => NoteEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'note_id' })
  note?: NoteEntity;

  @PrimaryColumn({ type: 'int' })
  tag_id!: number;

  @ManyToOne(() => TagEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tag_id' })
  tag?: TagEntity;

  @Column({ type: 'text', default: () => NOW_TEXT })
  created_at!: string;
}

@Entity({ name: 'note_versions' })
@Index('idx_note_versions_note', ['note_id', 'created_at', 'id'])
export class NoteVersionEntity {
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

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', default: '' })
  content_html!: string;

  @Column({ type: 'text', default: '' })
  content_text!: string;

  @Column({ type: 'text', default: () => NOW_TEXT })
  created_at!: string;
}

@Entity({ name: 'note_templates' })
export class NoteTemplateEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int', nullable: true })
  user_id!: number | null;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity | null;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', default: '' })
  content_html!: string;

  @Column({ type: 'text', default: '' })
  content_text!: string;

  @Column({ type: 'int', default: 0 })
  is_system!: number;

  @Column({ type: 'text', default: () => NOW_TEXT })
  created_at!: string;

  @Column({ type: 'text', default: () => NOW_TEXT })
  updated_at!: string;
}
