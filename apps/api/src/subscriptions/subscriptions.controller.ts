import { Body, Controller, Get, Inject, Param, Post } from "@nestjs/common";

import { CurrentPrincipal } from "../auth/auth.decorators.js";
import type { AuthenticatedPrincipal } from "../auth/auth-runtime.service.js";
import { SubscriptionsService } from "./subscriptions.service.js";
import { parseCheckout, parseOrderId } from "./subscriptions.validation.js";

@Controller("subscriptions")
export class SubscriptionsController {
  constructor(
    @Inject(SubscriptionsService)
    private readonly subscriptions: SubscriptionsService,
  ) {}

  @Get()
  getState(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.subscriptions.getState(principal.id);
  }

  @Post("checkout")
  checkout(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: unknown,
  ) {
    return this.subscriptions.checkout(principal.id, parseCheckout(body));
  }

  @Post("checkout/:orderId/confirm")
  confirm(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("orderId") orderId: string,
  ) {
    return this.subscriptions.confirm(principal.id, parseOrderId(orderId));
  }
}
