import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import { NOW_TEXT } from './column-helpers';
import { UserEntity } from './user.entity';

@Entity({ name: 'subscription_plans' })
export class SubscriptionPlanEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({ type: 'text' })
  slug!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'int', default: 0 })
  price_cents!: number;

  @Column({ type: 'text', default: 'rub' })
  currency!: string;

  @Column({ type: 'text', default: 'month' })
  billing_period!: string;

  @Column({ type: 'text' })
  entitlements_json!: string;

  @Column({ type: 'int', default: 1 })
  is_active!: number;

  @Column({ type: 'int', default: 0 })
  sort_order!: number;

  @Column({ type: 'text', default: 'package' })
  icon_key!: string;

  @Column({ type: 'text', default: 'sky' })
  card_color!: string;

  @Column({ type: 'text', default: 'bubbles' })
  card_art!: string;

  @Column({ type: 'int', default: 0 })
  is_hidden!: number;

  @Column({ type: 'text', default: () => NOW_TEXT })
  created_at!: string;

  @Column({ type: 'text', default: () => NOW_TEXT })
  updated_at!: string;
}

@Entity({ name: 'user_subscriptions' })
@Index('idx_user_subscriptions_user_status', ['user_id', 'status'])
export class UserSubscriptionEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  user_id!: number;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'int' })
  plan_id!: number;

  @ManyToOne(() => SubscriptionPlanEntity)
  @JoinColumn({ name: 'plan_id' })
  plan?: SubscriptionPlanEntity;

  @Column({ type: 'text', default: 'active' })
  status!: string;

  @Column({ type: 'text' })
  started_at!: string;

  @Column({ type: 'text', nullable: true })
  expires_at!: string | null;

  @Column({ type: 'text', nullable: true })
  cancelled_at!: string | null;

  @Column({ type: 'text', default: 'migration' })
  source!: string;

  @Column({ type: 'text', default: () => NOW_TEXT })
  created_at!: string;

  @Column({ type: 'text', default: () => NOW_TEXT })
  updated_at!: string;
}

@Entity({ name: 'subscription_orders' })
export class SubscriptionOrderEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  user_id!: number;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'int' })
  plan_id!: number;

  @ManyToOne(() => SubscriptionPlanEntity)
  @JoinColumn({ name: 'plan_id' })
  plan?: SubscriptionPlanEntity;

  @Column({ type: 'text', default: 'pending' })
  status!: string;

  @Column({ type: 'int' })
  amount_cents!: number;

  @Column({ type: 'text', default: 'rub' })
  currency!: string;

  @Column({ type: 'text', default: 'mock' })
  payment_provider!: string;

  @Column({ type: 'text', nullable: true })
  payment_external_id!: string | null;

  @Column({ type: 'text', nullable: true })
  paid_at!: string | null;

  @Column({ type: 'int', default: 1 })
  term_months!: number;

  @Column({ type: 'text', default: 'purchase' })
  checkout_mode!: string;

  @Column({ type: 'int', default: 0 })
  discount_percent!: number;

  @Column({ type: 'text', default: () => NOW_TEXT })
  created_at!: string;

  @Column({ type: 'text', default: () => NOW_TEXT })
  updated_at!: string;
}
