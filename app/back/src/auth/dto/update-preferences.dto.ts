import { IsIn, IsOptional } from 'class-validator';

import { USER_THEME_VALUES, type UserLanguage, type UserTheme } from '../auth.types';

export class UpdatePreferencesDto {
  @IsOptional()
  @IsIn(['ru', 'en'])
  language?: UserLanguage;

  @IsOptional()
  @IsIn([...USER_THEME_VALUES])
  theme?: UserTheme;
}
