import {
  IsArray,
  IsBase64,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class TemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsString()
  contentHtml!: string;

  @IsString()
  contentText!: string;
}

export class CreateNoteFromTemplateDto {
  @IsInt()
  @Min(1)
  templateId!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  parentId?: number | null;
}

export class ImportNotesDto {
  @IsArray()
  notes!: Array<Record<string, unknown>>;

  @IsOptional()
  @IsArray()
  templates?: Array<Record<string, unknown>>;
}

export class UploadAttachmentDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  noteId?: number | null;

  @IsString()
  @MinLength(1)
  @MaxLength(180)
  fileName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  mimeType?: string;

  @IsString()
  @IsBase64()
  contentBase64!: string;
}

export class RenameAttachmentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  fileName!: string;
}

export class AttachAttachmentDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  noteId?: number | null;
}

export class CreateShareLinkDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24 * 30)
  ttlHours?: number;

  @IsOptional()
  @IsBoolean()
  includeSecrets?: boolean;
}
