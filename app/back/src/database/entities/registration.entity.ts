import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { NOW_TEXT } from './column-helpers';

@Entity({ name: 'pending_registrations' })
@Index('idx_pending_registrations_expires', ['expires_at'])
export class PendingRegistrationEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'text' })
  username!: string;

  @Column({ type: 'text' })
  password_hash!: string;

  @Column({ type: 'text' })
  email!: string;

  @Column({ type: 'text', nullable: true })
  first_name!: string | null;

  @Column({ type: 'text', nullable: true })
  last_name!: string | null;

  @Index({ unique: true })
  @Column({ type: 'text' })
  token_hash!: string;

  @Column({ type: 'text' })
  expires_at!: string;

  @Column({ type: 'text', nullable: true })
  verified_at!: string | null;

  @Column({ type: 'text', default: () => NOW_TEXT })
  created_at!: string;
}
