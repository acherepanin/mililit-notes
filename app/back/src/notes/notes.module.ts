import { Module } from '@nestjs/common';

import { ActivityModule } from '../activity/activity.module';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../infra/database.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { NoteVersionsService } from './note-versions.service';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';
import { SecretFieldCryptoService } from './secret-field-crypto.service';
import { TagsService } from './tags.service';

@Module({
  imports: [ActivityModule, AuthModule, DatabaseModule, SubscriptionsModule],
  controllers: [NotesController],
  providers: [NotesService, SecretFieldCryptoService, TagsService, NoteVersionsService],
  exports: [NotesService, SecretFieldCryptoService, TagsService, NoteVersionsService],
})
export class NotesModule {}
