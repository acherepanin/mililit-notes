import { fromNodeHeaders } from "better-auth/node";
import type { FastifyRequest } from "fastify";

import type { AuthenticatedPrincipal } from "./auth-runtime.service.js";

export type AuthenticatedRequest = FastifyRequest & {
  principal?: AuthenticatedPrincipal;
};

export function toAuthHeaders(request: FastifyRequest): Headers {
  const headers = fromNodeHeaders(request.headers);
  headers.set("x-forwarded-for", request.ip);
  return headers;
}
