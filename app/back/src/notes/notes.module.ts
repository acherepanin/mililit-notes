import { Module } from '@nestjs/common';

import { ActivityModule } from '../activity/activity.module';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../infra/database.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';
import { SecretFieldCryptoService } from './secret-field-crypto.service';

@Module({
  imports: [ActivityModule, AuthModule, DatabaseModule, SubscriptionsModule],
  controllers: [NotesController],
  providers: [NotesService, SecretFieldCryptoService],
  exports: [NotesService, SecretFieldCryptoService],
})
export class NotesModule {}
