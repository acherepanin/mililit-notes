import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { nowIso } from '../database/db.util';
import { AttachmentFolderEntity } from '../database/entities/attachment.entity';
import type { AttachmentFolderDto, MoveAttachmentFolderParentDto } from './dto/workspace.dto';
import type { AttachmentFolderResponse } from './workspace.types';
import { sanitizeFolderName } from './workspace.util';

/**
 * Owns the attachment folder hierarchy: CRUD, uniqueness rules, positioning and
 * subtree traversal. Attachment files within folders are handled by
 * AttachmentsService, which composes this service.
 */
@Injectable()
export class AttachmentFoldersService {
  constructor(
    @InjectRepository(AttachmentFolderEntity)
    private readonly foldersRepo: Repository<AttachmentFolderEntity>,
  ) {}

  async listAttachmentFolders(userId: number): Promise<AttachmentFolderResponse[]> {
    const rows = await this.foldersRepo
      .createQueryBuilder('f')
      .where('f.user_id = :userId', { userId })
      .orderBy('(f.parent_id IS NOT NULL)', 'ASC')
      .addOrderBy('f.position', 'ASC')
      .addOrderBy('lower(f.name)', 'ASC')
      .getMany();
    return rows.map((row) => this.mapAttachmentFolder(row));
  }

  async createAttachmentFolder(
    userId: number,
    dto: AttachmentFolderDto,
  ): Promise<AttachmentFolderResponse> {
    const parentId = dto.parentId ?? null;
    if (parentId !== null) {
      await this.requireAttachmentFolder(userId, parentId);
    }
    const name = sanitizeFolderName(dto.name);
    await this.assertUniqueFolderName(userId, parentId, name);
    const position = await this.nextFolderPosition(userId, parentId);
    const created = await this.foldersRepo.save(
      this.foldersRepo.create({
        user_id: userId,
        parent_id: parentId,
        name,
        position,
        created_at: nowIso(),
      }),
    );
    return this.mapAttachmentFolder(created);
  }

  async renameAttachmentFolder(
    userId: number,
    id: number,
    dto: AttachmentFolderDto,
  ): Promise<AttachmentFolderResponse> {
    const folder = await this.requireAttachmentFolder(userId, id);
    const name = sanitizeFolderName(dto.name);
    await this.assertUniqueFolderName(userId, folder.parent_id ?? null, name, id);
    await this.foldersRepo.update({ id, user_id: userId }, { name });
    return this.getAttachmentFolder(userId, id);
  }

  async moveAttachmentFolder(
    userId: number,
    id: number,
    dto: MoveAttachmentFolderParentDto,
  ): Promise<AttachmentFolderResponse> {
    const parentId = dto.parentId ?? null;
    if (parentId === id) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'A folder cannot be moved into itself',
        code: 'FOLDER_SELF_MOVE',
      });
    }
    const folder = await this.requireAttachmentFolder(userId, id);
    if (parentId !== null) {
      await this.requireAttachmentFolder(userId, parentId);
      if (await this.isFolderDescendant(userId, id, parentId)) {
        throw new BadRequestException({
          statusCode: 400,
          message: 'A folder cannot be moved into its subfolder',
          code: 'FOLDER_SUBFOLDER_MOVE',
        });
      }
    }
    await this.assertUniqueFolderName(userId, parentId, folder.name, id);
    await this.foldersRepo.update({ id, user_id: userId }, { parent_id: parentId });
    return this.getAttachmentFolder(userId, id);
  }

  /** Removes the folder row; descendants cascade via the parent_id FK. */
  async deleteFolderRow(userId: number, id: number): Promise<void> {
    await this.foldersRepo.delete({ id, user_id: userId });
  }

  async getAttachmentFolder(userId: number, id: number): Promise<AttachmentFolderResponse> {
    return this.mapAttachmentFolder(await this.requireAttachmentFolder(userId, id));
  }

  async requireAttachmentFolder(userId: number, id: number): Promise<AttachmentFolderEntity> {
    const row = await this.foldersRepo.findOne({ where: { id, user_id: userId } });
    if (!row) {
      throw new NotFoundException(`Folder ${id} was not found`);
    }
    return row;
  }

  async collectDescendantFolderIds(userId: number, rootId: number): Promise<number[]> {
    const rows = (await this.foldersRepo.query(
      `
        WITH RECURSIVE subtree(id) AS (
          SELECT id FROM attachment_folders WHERE id = $1 AND user_id = $2
          UNION ALL
          SELECT f.id FROM attachment_folders f
          INNER JOIN subtree s ON f.parent_id = s.id
          WHERE f.user_id = $2
        )
        SELECT id FROM subtree
      `,
      [rootId, userId],
    )) as Array<{ id: number }>;
    return rows.map((row) => Number(row.id));
  }

  async findFolderByParentAndName(
    userId: number,
    parentId: number | null,
    name: string,
    excludeId?: number,
  ): Promise<AttachmentFolderEntity | null> {
    const qb = this.foldersRepo
      .createQueryBuilder('f')
      .where('f.user_id = :userId', { userId })
      .andWhere('lower(f.name) = lower(:name)', { name });
    if (parentId === null) {
      qb.andWhere('f.parent_id IS NULL');
    } else {
      qb.andWhere('f.parent_id = :parentId', { parentId });
    }
    if (excludeId !== undefined) {
      qb.andWhere('f.id != :excludeId', { excludeId });
    }
    return qb.getOne();
  }

  async setNoteFolderName(userId: number, parentId: number | null, name: string): Promise<number> {
    const existing = await this.findFolderByParentAndName(userId, parentId, name);
    if (existing) {
      return existing.id;
    }
    const created = await this.createAttachmentFolder(userId, { name, parentId: parentId ?? undefined });
    return created.id;
  }

  mapAttachmentFolder(row: AttachmentFolderEntity): AttachmentFolderResponse {
    return {
      id: row.id,
      parentId: row.parent_id,
      name: row.name,
      position: row.position,
      createdAt: row.created_at,
    };
  }

  private async nextFolderPosition(userId: number, parentId: number | null): Promise<number> {
    const qb = this.foldersRepo
      .createQueryBuilder('f')
      .select('COALESCE(MAX(f.position), -1)', 'maxPosition')
      .where('f.user_id = :userId', { userId });
    if (parentId === null) {
      qb.andWhere('f.parent_id IS NULL');
    } else {
      qb.andWhere('f.parent_id = :parentId', { parentId });
    }
    const row = await qb.getRawOne<{ maxPosition: number | string }>();
    return Number(row?.maxPosition ?? -1) + 1;
  }

  private async isFolderDescendant(
    userId: number,
    ancestorId: number,
    candidateId: number,
  ): Promise<boolean> {
    let currentId: number | null = candidateId;
    while (currentId !== null) {
      if (currentId === ancestorId) {
        return true;
      }
      const row = await this.foldersRepo.findOne({
        where: { id: currentId, user_id: userId },
        select: { parent_id: true },
      });
      currentId = row?.parent_id ?? null;
    }
    return false;
  }

  private async assertUniqueFolderName(
    userId: number,
    parentId: number | null,
    name: string,
    excludeId?: number,
  ): Promise<void> {
    if (await this.findFolderByParentAndName(userId, parentId, name, excludeId)) {
      throw new ConflictException({
        statusCode: 409,
        message: 'A folder with this name already exists in this location',
        code: 'FOLDER_NAME_TAKEN',
      });
    }
  }
}
