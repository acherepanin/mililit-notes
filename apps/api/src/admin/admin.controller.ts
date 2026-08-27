import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";

import { CurrentPrincipal, Roles } from "../auth/auth.decorators.js";
import type { AuthenticatedPrincipal } from "../auth/auth-runtime.service.js";
import { AdminAlertingService } from "./admin-alerting.service.js";
import {
  parseAdminSilenceCreate,
  parseAdminSilenceId,
} from "./admin-alerting.validation.js";
import { AdminBillingService } from "./admin-billing.service.js";
import {
  parseAdminId,
  parseAdminPlanUpdate,
  parseAdminSubscriptionAssignment,
} from "./admin-billing.validation.js";
import { AdminHistoryService } from "./admin-history.service.js";
import {
  parseAdminAuditList,
  parseAdminDiagnosticList,
} from "./admin-history.validation.js";
import { AdminOverviewService } from "./admin-overview.service.js";
import { AdminRetentionService } from "./admin-retention.service.js";
import {
  parseRetentionPolicyKey,
  parseRetentionPolicyUpdate,
} from "./admin-retention.validation.js";

@Roles("admin")
@Controller("admin")
export class AdminController {
  constructor(
    @Inject(AdminOverviewService)
    private readonly overview: AdminOverviewService,
    @Inject(AdminHistoryService)
    private readonly history: AdminHistoryService,
    @Inject(AdminRetentionService)
    private readonly retention: AdminRetentionService,
    @Inject(AdminBillingService)
    private readonly billing: AdminBillingService,
    @Inject(AdminAlertingService)
    private readonly alerting: AdminAlertingService,
  ) {}

  @Get("alerting")
  getAlerting() {
    return this.alerting.getState();
  }

  @Post("alerting/silences")
  createSilence(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: unknown,
  ) {
    return this.alerting.createSilence(
      principal.id,
      parseAdminSilenceCreate(body),
    );
  }

  @Delete("alerting/silences/:silenceId")
  deleteSilence(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("silenceId") silenceId: string,
  ) {
    return this.alerting.deleteSilence(
      principal.id,
      parseAdminSilenceId(silenceId),
    );
  }

  @Get("audits")
  getAudits(
    @Query("cursor") cursor: unknown,
    @Query("limit") limit: unknown,
    @Query("source") source: unknown,
    @Query("scope") scope: unknown,
    @Query("userId") userId: unknown,
  ) {
    return this.history.listAudits(
      parseAdminAuditList(cursor, limit, source, scope, userId),
    );
  }

  @Get("diagnostics")
  getDiagnostics(
    @Query("cursor") cursor: unknown,
    @Query("limit") limit: unknown,
    @Query("kind") kind: unknown,
    @Query("userId") userId: unknown,
  ) {
    return this.history.listDiagnostics(
      parseAdminDiagnosticList(cursor, limit, kind, userId),
    );
  }

  @Get("overview")
  getOverview() {
    return this.overview.getOverview();
  }

  @Get("plans")
  getPlans() {
    return this.billing.listPlans();
  }

  @Put("plans/:planId")
  updatePlan(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("planId") planId: string,
    @Body() body: unknown,
  ) {
    return this.billing.updatePlan(
      principal.id,
      parseAdminId(planId, "planId"),
      parseAdminPlanUpdate(body),
    );
  }

  @Put("users/:userId/subscription")
  assignSubscription(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("userId") userId: string,
    @Body() body: unknown,
  ) {
    return this.billing.assignSubscription(
      principal.id,
      parseAdminId(userId, "userId"),
      parseAdminSubscriptionAssignment(body),
    );
  }

  @Get("retention")
  getRetention() {
    return this.retention.list();
  }

  @Put("retention/:policyKey")
  updateRetention(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("policyKey") policyKey: string,
    @Body() body: unknown,
  ) {
    return this.retention.update(
      principal.id,
      parseRetentionPolicyKey(policyKey),
      parseRetentionPolicyUpdate(body),
    );
  }
}
