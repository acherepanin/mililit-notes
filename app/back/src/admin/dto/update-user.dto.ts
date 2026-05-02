import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import type { UserRole } from '../../auth/auth.types';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password?: string;

  @IsOptional()
  @IsIn(['user', 'admin'])
  role?: UserRole;
}
