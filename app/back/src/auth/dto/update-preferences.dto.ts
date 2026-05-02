import { IsIn, IsOptional } from 'class-validator';

import type { UserLanguage, UserTheme } from '../auth.types';

export class UpdatePreferencesDto {
  @IsOptional()
  @IsIn(['ru', 'en'])
  language?: UserLanguage;

  @IsOptional()
  @IsIn(['light', 'dark'])
  theme?: UserTheme;
}
