import { ForbiddenException, Inject, Injectable } from '@nestjs/common';

import type { UserRole } from '../auth/auth.types';
import { DatabaseService } from '../infra/database.service';
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
    @Inject(DatabaseService) private readonly databaseService: DatabaseService,
    @Inject(SubscriptionsService) private readonly subscriptionsService: SubscriptionsService,
  ) {}

  getEffectiveEntitlements(userId: number): PlanEntitlements {
    const role = this.getUserRole(userId);
    if (role === 'admin') {
      return DEFAULT_ADMIN_ENTITLEMENTS;
    }

    return this.subscriptionsService.getMeSubscriptionBundle(userId).entitlements;
  }

  getDefaultAiModel(userId: number): string | null {
    if (this.getUserRole(userId) === 'admin') {
      return null;
    }
    const model = this.subscriptionsService.getMeSubscriptionBundle(userId).entitlements.ai
      .defaultModel;
    return model ?? null;
  }

  isVersioningEnabled(userId: number): boolean {
    if (this.getUserRole(userId) === 'admin') {
      return true;
    }
    return this.getEffectiveEntitlements(userId).versioning.enabled;
  }

  assertMonthlyAiTokenCapacity(userId: number, additionalTokens: number): void {
    if (this.getUserRole(userId) === 'admin') {
      return;
    }
    const limit = this.getEffectiveEntitlements(userId).ai.monthlyTokenLimit;
    if (limit === null || limit === undefined) {
      return;
    }
    const used = this.getMonthlyTokenUsage(userId);
    if (used + additionalTokens > limit) {
      this.throwSubscriptionError(
        'SUBSCRIPTION_REQUIRED',
        'Monthly AI token limit exceeded for your subscription plan',
      );
    }
  }

  assertAiAccess(userId: number): void {
    const entitlements = this.getEffectiveEntitlements(userId);
    if (!entitlements.ai.enabled) {
      this.throwSubscriptionError(
        'SUBSCRIPTION_REQUIRED',
        'AI is not available on your subscription plan',
      );
    }
  }

  assertFilesAccess(userId: number): void {
    const entitlements = this.getEffectiveEntitlements(userId);
    if (!entitlements.files.enabled) {
      this.throwSubscriptionError(
        'SUBSCRIPTION_REQUIRED',
        'File storage is not available on your subscription plan',
      );
    }
  }

  assertStorageCapacity(userId: number, additionalBytes: number): void {
    this.assertFilesAccess(userId);
    const entitlements = this.getEffectiveEntitlements(userId);
    const limit = entitlements.files.storageLimitBytes;
    if (limit === null) {
      return;
    }

    const used = this.getUserStorageBytes(userId);
    if (used + additionalBytes > limit) {
      this.throwSubscriptionError(
        'STORAGE_LIMIT_EXCEEDED',
        'Storage limit exceeded for your subscription plan',
      );
    }
  }

  assertWorkspaceAccess(userId: number): void {
    if (!this.getEffectiveEntitlements(userId).workspace.enabled) {
      this.throwSubscriptionError(
        'SUBSCRIPTION_REQUIRED',
        'Workspace is not available on your subscription plan',
      );
    }
  }

  assertNoteCreationAllowed(userId: number): void {
    this.assertWorkspaceAccess(userId);
    const limit = this.getEffectiveEntitlements(userId).workspace.maxNotes;
    if (limit === null) {
      return;
    }

    const count = this.getUserNoteCount(userId);
    if (count >= limit) {
      this.throwSubscriptionError(
        'NOTE_LIMIT_EXCEEDED',
        'Notes limit exceeded for your subscription plan',
      );
    }
  }

  assertNoteContentSize(userId: number, contentBytes: number): void {
    this.assertWorkspaceAccess(userId);
    const limit = this.getEffectiveEntitlements(userId).workspace.maxNoteContentBytes;
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

  assertPublicShareAccess(userId: number): void {
    if (!this.getEffectiveEntitlements(userId).publicShare.enabled) {
      this.throwSubscriptionError(
        'SUBSCRIPTION_REQUIRED',
        'Public sharing is not available on your subscription plan',
      );
    }
  }

  assertTemplatesAccess(userId: number): void {
    if (!this.getEffectiveEntitlements(userId).templates.enabled) {
      this.throwSubscriptionError(
        'SUBSCRIPTION_REQUIRED',
        'Templates are not available on your subscription plan',
      );
    }
  }

  assertVersioningAccess(userId: number): void {
    if (!this.getEffectiveEntitlements(userId).versioning.enabled) {
      this.throwSubscriptionError(
        'SUBSCRIPTION_REQUIRED',
        'Version history is not available on your subscription plan',
      );
    }
  }

  assertExportImportAccess(userId: number): void {
    if (!this.getEffectiveEntitlements(userId).exportImport.enabled) {
      this.throwSubscriptionError(
        'SUBSCRIPTION_REQUIRED',
        'Export and import are not available on your subscription plan',
      );
    }
  }

  getUserStorageBytes(userId: number): number {
    return this.subscriptionsService.getUserStorageBytes(userId);
  }

  getFilesEntitlement(userId: number): FilesEntitlement {
    return this.getEffectiveEntitlements(userId).files;
  }

  private getUserNoteCount(userId: number): number {
    const row = this.databaseService.connection
      .prepare(
        `
          SELECT COUNT(*) as count
          FROM notes
          WHERE user_id = @userId AND deleted_at IS NULL
        `,
      )
      .get({ userId }) as { count: number };
    return row.count;
  }

  private getUserRole(userId: number): UserRole {
    const row = this.databaseService.connection
      .prepare('SELECT role FROM users WHERE id = @userId')
      .get({ userId }) as { role: UserRole } | undefined;
    return row?.role ?? 'user';
  }

  private getMonthlyTokenUsage(userId: number): number {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
    const row = this.databaseService.connection
      .prepare(
        `
          SELECT COALESCE(SUM(input_tokens + output_tokens), 0) as tokens
          FROM ai_usage_logs
          WHERE user_id = @userId
            AND created_at >= @monthStart
            AND created_at < @monthEnd
        `,
      )
      .get({ userId, monthStart, monthEnd }) as { tokens: number };
    return row.tokens;
  }

  private throwSubscriptionError(code: SubscriptionErrorCode, message: string): never {
    throw new ForbiddenException({ statusCode: 403, message, code });
  }
}
