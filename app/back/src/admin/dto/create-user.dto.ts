import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { USER_THEME_VALUES, type UserLanguage, type UserRole, type UserTheme } from '../../auth/auth.types';

export class CreateUserDto {
  @IsString()
  @MinLength(2)
  @MaxLength(32)
  username!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(8)
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
