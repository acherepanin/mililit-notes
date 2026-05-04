import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateAiSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

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
