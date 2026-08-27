import { Controller, Get } from "@nestjs/common";

import { Public } from "./auth/auth.decorators.js";
import { createHealthResponse, type HealthResponse } from "./health.js";

@Public()
@Controller("health")
export class HealthController {
  @Get()
  getHealth(): HealthResponse {
    return createHealthResponse();
  }
}
