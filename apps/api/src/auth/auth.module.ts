import { Module } from "@nestjs/common";

import { AuthController } from "./auth.controller.js";
import { AuthRuntimeService } from "./auth-runtime.service.js";
import { AccessPolicyService } from "./access-policy.service.js";

@Module({
  controllers: [AuthController],
  exports: [AccessPolicyService, AuthRuntimeService],
  providers: [AccessPolicyService, AuthRuntimeService],
})
export class AuthModule {}
