import { Global, Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";

import { CorrelationContextService } from "./correlation-context.service.js";
import { MetricsController } from "./metrics.controller.js";
import { MetricsService } from "./metrics.service.js";
import { RequestObservabilityInterceptor } from "./request-observability.interceptor.js";

@Global()
@Module({
  controllers: [MetricsController],
  exports: [CorrelationContextService, MetricsService],
  providers: [
    CorrelationContextService,
    MetricsService,
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestObservabilityInterceptor,
    },
  ],
})
export class ObservabilityModule {}
