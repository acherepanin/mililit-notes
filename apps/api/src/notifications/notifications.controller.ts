import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
} from "@nestjs/common";

import { CurrentPrincipal } from "../auth/auth.decorators.js";
import type { AuthenticatedPrincipal } from "../auth/auth-runtime.service.js";
import { NotificationsService } from "./notifications.service.js";
import {
  parseNotificationId,
  parseNotificationPreferences,
} from "./notifications.validation.js";

@Controller("notifications")
export class NotificationsController {
  constructor(
    @Inject(NotificationsService)
    private readonly notifications: NotificationsService,
  ) {}

  @Get()
  list(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.notifications.list(principal.id);
  }

  @Get("preferences")
  preferences(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.notifications.getPreferences(principal.id);
  }

  @Patch("preferences")
  updatePreferences(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: unknown,
  ) {
    return this.notifications.updatePreferences(
      principal.id,
      parseNotificationPreferences(body),
    );
  }

  @Post("read-all")
  markAllRead(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.notifications.markAllRead(principal.id);
  }

  @Post(":id/read")
  markRead(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id") id: string,
  ) {
    return this.notifications.markRead(principal.id, parseNotificationId(id));
  }
}
