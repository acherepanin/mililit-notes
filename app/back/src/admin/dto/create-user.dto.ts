import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { USER_THEME_VALUES, type UserLanguage, type UserRole, type UserTheme } from '../../auth/auth.types';

export class CreateUserDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  username!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;

  @IsOptional()
  @IsIn(['user', 'admin'])
  role?: UserRole;

  @IsOptional()
  @IsIn(['ru', 'en'])
  language?: UserLanguage;

  @IsOptional()
  @IsIn([...USER_THEME_VALUES])
  theme?: UserTheme;
}
