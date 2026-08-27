import { Module } from "@nestjs/common";

import { AdminAlertingService } from "./admin-alerting.service.js";
import { AdminBillingService } from "./admin-billing.service.js";
import { AdminHistoryService } from "./admin-history.service.js";
import { AdminOverviewService } from "./admin-overview.service.js";
import { AdminRetentionService } from "./admin-retention.service.js";
import { AdminController } from "./admin.controller.js";

@Module({
  controllers: [AdminController],
  providers: [
    AdminAlertingService,
    AdminBillingService,
    AdminHistoryService,
    AdminOverviewService,
    AdminRetentionService,
  ],
})
export class AdminModule {}
