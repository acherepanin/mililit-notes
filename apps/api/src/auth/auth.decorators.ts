import {
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";

import type {
  AuthenticatedPrincipal,
  AuthenticatedRole,
} from "./auth-runtime.service.js";
import type { AuthenticatedRequest } from "./auth-request.js";

export const publicRouteKey = "notes:public-route";
export const rolesKey = "notes:roles";

export const Public = () => SetMetadata(publicRouteKey, true);
export const Roles = (...roles: AuthenticatedRole[]) =>
  SetMetadata(rolesKey, roles);

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedPrincipal => {
    const principal = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>().principal;
    if (!principal) {
      throw new UnauthorizedException();
    }
    return principal;
  },
);
