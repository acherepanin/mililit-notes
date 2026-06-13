import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import { NOW_TEXT } from './column-helpers';
import { NoteEntity } from './note.entity';
import { UserEntity } from './user.entity';

@Entity({ name: 'attachment_folders' })
@Index('idx_attachment_folders_user', ['user_id', 'parent_id', 'position'])
export class AttachmentFolderEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  user_id!: number;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'int', nullable: true })
  parent_id!: number | null;

  @ManyToOne(() => AttachmentFolderEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'parent_id' })
  parent?: AttachmentFolderEntity | null;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'int', default: 0 })
  position!: number;

  @Column({ type: 'text', default: () => NOW_TEXT })
  created_at!: string;
}

@Entity({ name: 'attachments' })
@Index('idx_attachments_note', ['note_id', 'created_at'])
@Index('idx_attachments_user', ['user_id', 'created_at'])
@Index('idx_attachments_folder', ['user_id', 'folder_id', 'created_at'])
export class AttachmentEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int', nullable: true })
  note_id!: number | null;

  @ManyToOne(() => NoteEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'note_id' })
  note?: NoteEntity | null;

  @Column({ type: 'int' })
  user_id!: number;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'text' })
  file_name!: string;

  @Column({ type: 'text', default: 'application/octet-stream' })
  mime_type!: string;

  @Column({ type: 'int' })
  size!: number;

  @Column({ type: 'text' })
  storage_path!: string;

  @Column({ type: 'int', nullable: true })
  folder_id!: number | null;

  @ManyToOne(() => AttachmentFolderEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'folder_id' })
  folder?: AttachmentFolderEntity | null;

  @Column({ type: 'text', default: () => NOW_TEXT })
  created_at!: string;
}
