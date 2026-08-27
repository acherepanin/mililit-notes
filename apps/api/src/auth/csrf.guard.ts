import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";

import { publicRouteKey } from "./auth.decorators.js";
import { AuthRuntimeService } from "./auth-runtime.service.js";
import { isAllowedMutationOrigin } from "./csrf.js";

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    @Inject(Reflector)
    private readonly reflector: Reflector,
    @Inject(AuthRuntimeService)
    private readonly auth: AuthRuntimeService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(publicRouteKey, targets)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    if (
      !isAllowedMutationOrigin(
        request.method,
        request.headers.origin,
        this.auth.environment.APP_ORIGIN,
      )
    ) {
      throw new ForbiddenException("Invalid request origin");
    }
    return true;
  }
}
