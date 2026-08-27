import { ForbiddenException, Injectable } from "@nestjs/common";

import type { AuthenticatedPrincipal } from "./auth-runtime.service.js";

@Injectable()
export class AccessPolicyService {
  assertAdmin(principal: AuthenticatedPrincipal): void {
    if (principal.role !== "admin") {
      throw new ForbiddenException();
    }
  }

  assertOwnerOrAdmin(principal: AuthenticatedPrincipal, ownerId: number): void {
    if (principal.role !== "admin" && principal.id !== ownerId) {
      throw new ForbiddenException();
    }
  }
}
