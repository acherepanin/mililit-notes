import { Inject, Injectable, Logger } from '@nestjs/common';
import { existsSync, unlinkSync } from 'node:fs';

import { DatabaseService } from './database.service';
import { bindSqlList } from './sql';

@Injectable()
export class AttachmentFilesService {
  private readonly logger = new Logger(AttachmentFilesService.name);

  constructor(@Inject(DatabaseService) private readonly databaseService: DatabaseService) {}

  deleteForUser(userId: number): void {
    const rows = this.databaseService.connection
      .prepare('SELECT storage_path FROM attachments WHERE user_id = @userId')
      .all({ userId }) as Array<{ storage_path: string }>;

    this.deleteFiles(rows);
  }

  deleteByIds(userId: number, attachmentIds: number[]): void {
    if (attachmentIds.length === 0) {
      return;
    }

    const ids = bindSqlList('id', attachmentIds);
    const rows = this.databaseService.connection
      .prepare(
        `SELECT storage_path FROM attachments WHERE id IN (${ids.placeholders}) AND user_id = @userId`,
      )
      .all({ ...ids.params, userId }) as Array<{ storage_path: string }>;

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
