import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateAiBotAdminSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  webhookUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  botToken?: string;

  @IsOptional()
  @IsBoolean()
  clearBotToken?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  accessToken?: string;

  @IsOptional()
  @IsBoolean()
  clearAccessToken?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  secret?: string;

  @IsOptional()
  @IsBoolean()
  clearSecret?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  groupId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  confirmationCode?: string | null;

  @IsOptional()
  @IsBoolean()
  allowSecrets?: boolean;

  @IsOptional()
  @IsBoolean()
  requireConfirmation?: boolean;

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
