import {
  type ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";

import { publicRouteKey, rolesKey } from "./auth.decorators.js";
import type { AuthRuntimeService } from "./auth-runtime.service.js";
import type { AuthenticatedRequest } from "./auth-request.js";
import { SessionAuthGuard } from "./session-auth.guard.js";

function createContext(request: Partial<FastifyRequest>): ExecutionContext {
  return {
    getClass: () => class TestController {},
    getHandler: () => () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe("SessionAuthGuard", () => {
  it("rejects missing sessions", async () => {
    const reflector = {
      getAllAndOverride: vi.fn(() => undefined),
    } as unknown as Reflector;
    const auth = {
      resolveSession: vi.fn(async () => null),
    } as unknown as AuthRuntimeService;
    const guard = new SessionAuthGuard(reflector, auth);

    await expect(
      guard.canActivate(
        createContext({ headers: {}, ip: "127.0.0.1" } as FastifyRequest),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("attaches an allowed principal and rejects a mismatched role", async () => {
    const request = {
      headers: {},
      ip: "127.0.0.1",
    } as AuthenticatedRequest;
    const auth = {
      resolveSession: vi.fn(async () => ({ id: 7, role: "user" as const })),
    } as unknown as AuthRuntimeService;
    const reflector = {
      getAllAndOverride: vi.fn((key: string) =>
        key === publicRouteKey ? undefined : ["user"],
      ),
    } as unknown as Reflector;
    const guard = new SessionAuthGuard(reflector, auth);

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(request.principal).toEqual({ id: 7, role: "user" });

    const adminReflector = {
      getAllAndOverride: vi.fn((key: string) =>
        key === rolesKey ? ["admin"] : undefined,
      ),
    } as unknown as Reflector;
    await expect(
      new SessionAuthGuard(adminReflector, auth).canActivate(
        createContext(request),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
