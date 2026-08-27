import { Module } from "@nestjs/common";

import { EntitlementsService } from "./entitlements.service.js";

@Module({
  exports: [EntitlementsService],
  providers: [EntitlementsService],
})
export class EntitlementsModule {}
