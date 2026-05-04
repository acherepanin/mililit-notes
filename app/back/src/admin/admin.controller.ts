import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import type { ActivityResponse } from '../activity/activity.types';
import { AdminGuard } from '../auth/admin.guard';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { AdminService } from './admin.service';
import type { AdminStatsResponse, AdminUserResponse } from './admin.types';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('admin')
@UseGuards(AuthGuard, AdminGuard)
export class AdminController {
  constructor(@Inject(AdminService) private readonly adminService: AdminService) {}

  @Get('users')
  listUsers(): AdminUserResponse[] {
    return this.adminService.listUsers();
  }

  @Post('users')
  createUser(@Req() request: AuthenticatedRequest, @Body() dto: CreateUserDto): AdminUserResponse {
    return this.adminService.createUser(request.user.id, dto);
  }

  @Patch('users/:id')
  updateUser(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
  ): AdminUserResponse {
    return this.adminService.updateUser(request.user.id, id, dto);
  }

  @Delete('users/:id')
  deleteUser(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): { id: number } {
    return this.adminService.deleteUser(request.user.id, id);
  }

  @Get('activity')
  listActivity(@Query('limit') limit?: string): ActivityResponse[] {
    return this.adminService.listActivity(limit ? Number(limit) : undefined);
  }

  @Get('stats')
  getStats(@Query('range') range?: string): AdminStatsResponse {
    return this.adminService.getStats(range);
  }
}
