import { Body, Controller, Get, Inject, Patch, Post, Req, UseGuards } from '@nestjs/common';

import { AuthGuard, type AuthenticatedRequest } from './auth.guard';
import { AuthService } from './auth.service';
import type { AuthUser } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';

@Controller()
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post('auth/login')
  login(@Body() dto: LoginDto): { token: string; user: AuthUser } {
    return this.authService.login(dto);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  getMe(@Req() request: AuthenticatedRequest): AuthUser {
    return request.user;
  }

  @Patch('me/preferences')
  @UseGuards(AuthGuard)
  updatePreferences(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdatePreferencesDto,
  ): AuthUser {
    return this.authService.updatePreferences(request.user.id, dto);
  }
}
