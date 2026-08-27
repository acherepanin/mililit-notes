import { Module } from "@nestjs/common";

import { EntitlementsModule } from "../entitlements/entitlements.module.js";
import { SubscriptionsController } from "./subscriptions.controller.js";
import { SubscriptionsService } from "./subscriptions.service.js";

@Module({
  controllers: [SubscriptionsController],
  imports: [EntitlementsModule],
  providers: [SubscriptionsService],
})
export class SubscriptionsModule {}
