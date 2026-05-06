import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateAiSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  allowReadSecrets?: boolean;

  @IsOptional()
  @IsBoolean()
  requireActionConfirmation?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  dailyRequestLimit?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(100000000)
  dailyTokenLimit?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  providerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  baseUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  model?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  apiKey?: string;

  @IsOptional()
  @IsBoolean()
  clearApiKey?: boolean;
}
