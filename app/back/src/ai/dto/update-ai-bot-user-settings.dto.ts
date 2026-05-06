import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import type { AiBotAccessMode, AiBotPermissions } from '../ai.types';

export class UpdateAiBotPermissionsDto implements Partial<AiBotPermissions> {
  @IsOptional()
  @IsBoolean()
  readNotes?: boolean;

  @IsOptional()
  @IsBoolean()
  writeNotes?: boolean;

  @IsOptional()
  @IsBoolean()
  deleteNotes?: boolean;

  @IsOptional()
  @IsBoolean()
  manageTags?: boolean;

  @IsOptional()
  @IsBoolean()
  useTemplates?: boolean;

  @IsOptional()
  @IsBoolean()
  useVersions?: boolean;

  @IsOptional()
  @IsBoolean()
  listAttachments?: boolean;

  @IsOptional()
  @IsBoolean()
  createShareLinks?: boolean;
}

export class UpdateAiBotUserSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsIn(['read', 'write'])
  accessMode?: AiBotAccessMode;

  @IsOptional()
  @IsBoolean()
  allowSecrets?: boolean;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => UpdateAiBotPermissionsDto)
  permissions?: UpdateAiBotPermissionsDto;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  dailyRequestLimit?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  dailyReadLimit?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  dailyWriteLimit?: number | null;
}
