import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { NOW_TEXT } from './column-helpers';

@Entity({ name: 'users' })
export class UserEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({ type: 'text' })
  username!: string;

  @Column({ type: 'text' })
  password_hash!: string;

  @Column({ type: 'text', default: 'user' })
  role!: string;

  @Column({ type: 'text', default: 'ru' })
  language!: string;

  @Column({ type: 'text', default: 'dark' })
  theme!: string;

  @Column({ type: 'text', nullable: true })
  email!: string | null;

  @Column({ type: 'text', nullable: true })
  first_name!: string | null;

  @Column({ type: 'text', nullable: true })
  last_name!: string | null;

  @Column({ type: 'text', nullable: true })
  patronymic!: string | null;

  @Column({ type: 'text', nullable: true })
  birth_date!: string | null;

  @Column({ type: 'text', nullable: true })
  last_login_at!: string | null;

  @Column({ type: 'text', default: () => NOW_TEXT })
  created_at!: string;

  @Column({ type: 'text', default: () => NOW_TEXT })
  updated_at!: string;
}
