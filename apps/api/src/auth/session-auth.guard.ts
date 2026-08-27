import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { publicRouteKey, rolesKey } from "./auth.decorators.js";
import {
  type AuthenticatedRole,
  AuthRuntimeService,
} from "./auth-runtime.service.js";
import { type AuthenticatedRequest, toAuthHeaders } from "./auth-request.js";

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector)
    private readonly reflector: Reflector,
    @Inject(AuthRuntimeService)
    private readonly auth: AuthRuntimeService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(publicRouteKey, targets)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal = await this.auth.resolveSession(toAuthHeaders(request));
    if (!principal) {
      throw new UnauthorizedException();
    }

    const roles = this.reflector.getAllAndOverride<AuthenticatedRole[]>(
      rolesKey,
      targets,
    );
    if (roles && !roles.includes(principal.role)) {
      throw new ForbiddenException();
    }

    request.principal = principal;
    return true;
  }
}
