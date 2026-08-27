import { Controller, Get, Inject, Res } from "@nestjs/common";
import type { FastifyReply } from "fastify";

import { Public } from "../auth/auth.decorators.js";
import { MetricsService } from "./metrics.service.js";

@Public()
@Controller("metrics")
export class MetricsController {
  constructor(
    @Inject(MetricsService) private readonly metrics: MetricsService,
  ) {}

  @Get()
  async getMetrics(
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<string> {
    reply.header("content-type", this.metrics.contentType);
    return this.metrics.render();
  }
}
