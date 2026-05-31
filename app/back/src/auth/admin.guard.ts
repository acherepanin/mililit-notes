import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';

import type { AuthenticatedRequest } from './auth.guard';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.user || request.user.role !== 'admin') {
      throw new ForbiddenException('Admin role is required');
    }

    return true;
  }
}
