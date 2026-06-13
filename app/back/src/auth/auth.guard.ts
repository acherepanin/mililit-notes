import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AuthService } from './auth.service';
import type { AuthUser } from './auth.types';
import { IS_PUBLIC_KEY } from './public.decorator';

interface RequestWithHeaders {
  header(name: string): string | undefined;
}

export interface AuthenticatedRequest extends RequestWithHeaders {
  user: AuthUser;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithHeaders>();
    const header = request.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;

    if (!token) {
      throw new UnauthorizedException('Authentication is required');
    }

    const user = await this.authService.verifyToken(token);
    (request as AuthenticatedRequest).user = user;

    return true;
  }
}
