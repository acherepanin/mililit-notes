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

import { AdminGuard } from '../auth/admin.guard';
import { type AuthenticatedRequest } from '../auth/auth.guard';
import { AdminService } from './admin.service';
import type { AdminStatsResponse, AdminUserResponse } from './admin.types';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(@Inject(AdminService) private readonly adminService: AdminService) {}

  @Get('users')
  listUsers(): Promise<AdminUserResponse[]> {
    return this.adminService.listUsers();
  }

  @Post('users')
  createUser(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateUserDto,
  ): Promise<AdminUserResponse> {
    return this.adminService.createUser(request.user.id, dto);
  }

  @Patch('users/:id')
  updateUser(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
  ): Promise<AdminUserResponse> {
    return this.adminService.updateUser(request.user.id, id, dto);
  }

  @Delete('users/:id')
  deleteUser(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ id: number }> {
    return this.adminService.deleteUser(request.user.id, id);
  }

  @Get('stats')
  getStats(@Query('range') range?: string): Promise<AdminStatsResponse> {
    return this.adminService.getStats(range);
  }
}
