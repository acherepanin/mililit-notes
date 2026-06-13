import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { UserRole } from '../auth/auth.types';
import { currentMonthRangeIso } from '../database/db.util';
import { AiUsageLogEntity } from '../database/entities/ai.entity';
import { NoteEntity } from '../database/entities/note.entity';
import { UserEntity } from '../database/entities/user.entity';
import {
  DEFAULT_ADMIN_ENTITLEMENTS,
  type FilesEntitlement,
  type PlanEntitlements,
  type SubscriptionErrorCode,
} from './entitlements.types';
import { SubscriptionsService } from './subscriptions.service';

@Injectable()
export class EntitlementsService {
  constructor(
    @InjectRepository(UserEntity) private readonly usersRepo: Repository<UserEntity>,
    @InjectRepository(NoteEntity) private readonly notesRepo: Repository<NoteEntity>,
    @InjectRepository(AiUsageLogEntity)
    private readonly aiUsageRepo: Repository<AiUsageLogEntity>,
    @Inject(SubscriptionsService) private readonly subscriptionsService: SubscriptionsService,
  ) {}

  async getEffectiveEntitlements(userId: number): Promise<PlanEntitlements> {
    const role = await this.getUserRole(userId);
    if (role === 'admin') {
      return DEFAULT_ADMIN_ENTITLEMENTS;
    }

    return (await this.subscriptionsService.getMeSubscriptionBundle(userId)).entitlements;
  }

  async getDefaultAiModel(userId: number): Promise<string | null> {
    if ((await this.getUserRole(userId)) === 'admin') {
      return null;
    }
    const bundle = await this.subscriptionsService.getMeSubscriptionBundle(userId);
    return bundle.entitlements.ai.defaultModel ?? null;
  }

  async isVersioningEnabled(userId: number): Promise<boolean> {
    if ((await this.getUserRole(userId)) === 'admin') {
      return true;
    }
    return (await this.getEffectiveEntitlements(userId)).versioning.enabled;
  }

  async assertMonthlyAiTokenCapacity(userId: number, additionalTokens: number): Promise<void> {
    if ((await this.getUserRole(userId)) === 'admin') {
      return;
    }
    const limit = (await this.getEffectiveEntitlements(userId)).ai.monthlyTokenLimit;
    if (limit === null || limit === undefined) {
      return;
    }
    const used = await this.getMonthlyTokenUsage(userId);
    if (used + additionalTokens > limit) {
      this.throwSubscriptionError(
        'SUBSCRIPTION_REQUIRED',
        'Monthly AI token limit exceeded for your subscription plan',
      );
    }
  }

  async assertAiAccess(userId: number): Promise<void> {
    const entitlements = await this.getEffectiveEntitlements(userId);
    if (!entitlements.ai.enabled) {
      this.throwSubscriptionError(
        'SUBSCRIPTION_REQUIRED',
        'AI is not available on your subscription plan',
      );
    }
  }

  async assertFilesAccess(userId: number): Promise<void> {
    const entitlements = await this.getEffectiveEntitlements(userId);
    if (!entitlements.files.enabled) {
      this.throwSubscriptionError(
        'SUBSCRIPTION_REQUIRED',
        'File storage is not available on your subscription plan',
      );
    }
  }

  async assertStorageCapacity(userId: number, additionalBytes: number): Promise<void> {
    const entitlements = await this.getEffectiveEntitlements(userId);
    if (!entitlements.files.enabled) {
      this.throwSubscriptionError(
        'SUBSCRIPTION_REQUIRED',
        'File storage is not available on your subscription plan',
      );
    }
    const limit = entitlements.files.storageLimitBytes;
    if (limit === null) {
      return;
    }

    const used = await this.getUserStorageBytes(userId);
    if (used + additionalBytes > limit) {
      this.throwSubscriptionError(
        'STORAGE_LIMIT_EXCEEDED',
        'Storage limit exceeded for your subscription plan',
      );
    }
  }

  async assertWorkspaceAccess(userId: number): Promise<void> {
    if (!(await this.getEffectiveEntitlements(userId)).workspace.enabled) {
      this.throwSubscriptionError(
        'SUBSCRIPTION_REQUIRED',
        'Workspace is not available on your subscription plan',
      );
    }
  }

  async assertNoteCreationAllowed(userId: number): Promise<void> {
    const entitlements = await this.getEffectiveEntitlements(userId);
    if (!entitlements.workspace.enabled) {
      this.throwSubscriptionError(
        'SUBSCRIPTION_REQUIRED',
        'Workspace is not available on your subscription plan',
      );
    }
    const limit = entitlements.workspace.maxNotes;
    if (limit === null) {
      return;
    }

    const count = await this.getUserNoteCount(userId);
    if (count >= limit) {
      this.throwSubscriptionError(
        'NOTE_LIMIT_EXCEEDED',
        'Notes limit exceeded for your subscription plan',
      );
    }
  }

  async assertNoteContentSize(userId: number, contentBytes: number): Promise<void> {
    const entitlements = await this.getEffectiveEntitlements(userId);
    if (!entitlements.workspace.enabled) {
      this.throwSubscriptionError(
        'SUBSCRIPTION_REQUIRED',
        'Workspace is not available on your subscription plan',
      );
    }
    const limit = entitlements.workspace.maxNoteContentBytes;
    if (limit === null) {
      return;
    }

    if (contentBytes > limit) {
      this.throwSubscriptionError(
        'NOTE_SIZE_LIMIT_EXCEEDED',
        'Note size limit exceeded for your subscription plan',
      );
    }
  }

  async assertPublicShareAccess(userId: number): Promise<void> {
    if (!(await this.getEffectiveEntitlements(userId)).publicShare.enabled) {
      this.throwSubscriptionError(
        'SUBSCRIPTION_REQUIRED',
        'Public sharing is not available on your subscription plan',
      );
    }
  }

  async assertTemplatesAccess(userId: number): Promise<void> {
    if (!(await this.getEffectiveEntitlements(userId)).templates.enabled) {
      this.throwSubscriptionError(
        'SUBSCRIPTION_REQUIRED',
        'Templates are not available on your subscription plan',
      );
    }
  }

  async assertVersioningAccess(userId: number): Promise<void> {
    if (!(await this.getEffectiveEntitlements(userId)).versioning.enabled) {
      this.throwSubscriptionError(
        'SUBSCRIPTION_REQUIRED',
        'Version history is not available on your subscription plan',
      );
    }
  }

  async assertExportImportAccess(userId: number): Promise<void> {
    if (!(await this.getEffectiveEntitlements(userId)).exportImport.enabled) {
      this.throwSubscriptionError(
        'SUBSCRIPTION_REQUIRED',
        'Export and import are not available on your subscription plan',
      );
    }
  }

  async getUserStorageBytes(userId: number): Promise<number> {
    return this.subscriptionsService.getUserStorageBytes(userId);
  }

  async getFilesEntitlement(userId: number): Promise<FilesEntitlement> {
    return (await this.getEffectiveEntitlements(userId)).files;
  }

  private async getUserNoteCount(userId: number): Promise<number> {
    return this.notesRepo
      .createQueryBuilder('n')
      .where('n.user_id = :userId', { userId })
      .andWhere('n.deleted_at IS NULL')
      .getCount();
  }

  private async getUserRole(userId: number): Promise<UserRole> {
    const row = await this.usersRepo.findOne({ where: { id: userId }, select: { role: true } });
    return (row?.role as UserRole) ?? 'user';
  }

  private async getMonthlyTokenUsage(userId: number): Promise<number> {
    const { start, end } = currentMonthRangeIso();
    const raw = await this.aiUsageRepo
      .createQueryBuilder('u')
      .select('COALESCE(SUM(u.input_tokens + u.output_tokens), 0)', 'tokens')
      .where('u.user_id = :userId', { userId })
      .andWhere('u.created_at >= :start', { start })
      .andWhere('u.created_at < :end', { end })
      .getRawOne<{ tokens: string }>();
    return Number(raw?.tokens ?? 0);
  }

  private throwSubscriptionError(code: SubscriptionErrorCode, message: string): never {
    throw new ForbiddenException({ statusCode: 403, message, code });
  }
}
