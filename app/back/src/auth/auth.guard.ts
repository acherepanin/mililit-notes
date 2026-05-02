import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { AuthService } from './auth.service';
import type { AuthUser } from './auth.types';

interface RequestWithHeaders {
  header(name: string): string | undefined;
}

export interface AuthenticatedRequest extends RequestWithHeaders {
  user: AuthUser;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithHeaders>();
    const header = request.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;

    if (!token) {
      throw new UnauthorizedException('Authentication is required');
    }

    const user = this.authService.verifyToken(token);
    (request as AuthenticatedRequest).user = user;

    return true;
  }
}
