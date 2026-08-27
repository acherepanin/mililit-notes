import { Module } from "@nestjs/common";

import { EntitlementsModule } from "../entitlements/entitlements.module.js";
import { NotesController } from "./notes.controller.js";
import { NotesService } from "./notes.service.js";
import { SecretFieldCryptoService } from "./secret-field-crypto.service.js";

@Module({
  controllers: [NotesController],
  imports: [EntitlementsModule],
  exports: [NotesService, SecretFieldCryptoService],
  providers: [NotesService, SecretFieldCryptoService],
})
export class NotesModule {}
