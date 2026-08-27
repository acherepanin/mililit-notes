import { All, Controller, Inject, Req, Res } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";

import { Public } from "./auth.decorators.js";
import { AuthRuntimeService } from "./auth-runtime.service.js";
import { toAuthHeaders } from "./auth-request.js";

@Public()
@Controller("auth")
export class AuthController {
  constructor(
    @Inject(AuthRuntimeService)
    private readonly runtime: AuthRuntimeService,
  ) {}

  @All("*")
  async handle(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const url = new URL(request.url, this.runtime.environment.BETTER_AUTH_URL);
    const method = request.method.toUpperCase();
    const body =
      method === "GET" || method === "HEAD" || request.body === undefined
        ? undefined
        : JSON.stringify(request.body);
    const authRequest = new Request(url, {
      ...(body === undefined ? {} : { body }),
      headers: toAuthHeaders(request),
      method,
    });
    const response = await this.runtime.auth.handler(authRequest);
    const setCookies = response.headers.getSetCookie();

    response.headers.forEach((value, key) => {
      if (key !== "set-cookie") {
        reply.header(key, value);
      }
    });
    if (setCookies.length > 0) {
      reply.header("set-cookie", setCookies);
    }

    reply.status(response.status);
    if (response.body === null) {
      await reply.send();
      return;
    }
    await reply.send(await response.text());
  }
}
