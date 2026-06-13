import { Body, Controller, Get, Inject, Param, ParseIntPipe, Patch, Post, Query, Req } from '@nestjs/common';

import type { MeSubscriptionBundle } from '../subscriptions/subscriptions.types';
import { type AuthenticatedRequest } from './auth.guard';
import { AuthService } from './auth.service';
import type { MeResponse } from './auth.types';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { Public } from './public.decorator';
import {
  RegistrationService,
  type RegistrationPendingResponse,
  type RegistrationPendingStatus,
} from './registration.service';

@Controller()
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(RegistrationService) private readonly registrationService: RegistrationService,
  ) {}

  @Public()
  @Post('auth/login')
  login(@Body() dto: LoginDto): Promise<{ token: string; user: MeResponse }> {
    return this.authService.login(dto);
  }

  @Public()
  @Post('auth/register')
  register(@Body() dto: RegisterDto): Promise<RegistrationPendingResponse> {
    return this.registrationService.requestRegistration(dto);
  }

  @Public()
  @Get('auth/register/pending/:id')
  getRegistrationPendingStatus(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ status: RegistrationPendingStatus }> {
    return this.registrationService.getPendingStatus(id);
  }

  @Public()
  @Get('auth/verify-email')
  verifyEmail(@Query('token') token: string): Promise<{ ok: true }> {
    return this.registrationService.verifyEmail(token);
  }

  @Get('me')
  getMe(
    @Req() request: AuthenticatedRequest,
  ): Promise<MeResponse & { subscription: MeSubscriptionBundle }> {
    return this.authService.getMe(request.user.id);
  }

  @Patch('me/preferences')
  updatePreferences(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdatePreferencesDto,
  ): Promise<MeResponse & { subscription: MeSubscriptionBundle }> {
    return this.authService.updatePreferences(request.user.id, dto);
  }

  @Patch('me/profile')
  updateProfile(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateProfileDto,
  ): Promise<MeResponse & { subscription: MeSubscriptionBundle }> {
    return this.authService.updateProfile(request.user.id, dto);
  }

  @Patch('me/password')
  changePassword(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ ok: true }> {
    return this.authService.changePassword(request.user.id, dto);
  }
}
