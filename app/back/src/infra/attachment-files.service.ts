import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { existsSync, unlinkSync } from 'node:fs';
import { In, Repository } from 'typeorm';

import { AttachmentEntity } from '../database/entities/attachment.entity';

/**
 * Removes attachment files from disk. The database rows themselves are removed
 * via cascade (user delete) or by the workspace service; this service only
 * deals with the filesystem side-effects.
 */
@Injectable()
export class AttachmentFilesService {
  private readonly logger = new Logger(AttachmentFilesService.name);

  constructor(
    @InjectRepository(AttachmentEntity)
    private readonly attachmentsRepo: Repository<AttachmentEntity>,
  ) {}

  async deleteForUser(userId: number): Promise<void> {
    const rows = await this.attachmentsRepo.find({
      where: { user_id: userId },
      select: { storage_path: true },
    });
    this.deleteFiles(rows);
  }

  async deleteByIds(userId: number, attachmentIds: number[]): Promise<void> {
    if (attachmentIds.length === 0) {
      return;
    }
    const rows = await this.attachmentsRepo.find({
      where: { id: In(attachmentIds), user_id: userId },
      select: { storage_path: true },
    });
    this.deleteFiles(rows);
  }

  private deleteFiles(rows: Array<{ storage_path: string }>): void {
    for (const row of rows) {
      try {
        if (!existsSync(row.storage_path)) {
          continue;
        }
        unlinkSync(row.storage_path);
      } catch (caught) {
        this.logger.warn(
          `Could not delete attachment file ${row.storage_path}: ${(caught as Error).message}`,
        );
      }
    }
  }
}
