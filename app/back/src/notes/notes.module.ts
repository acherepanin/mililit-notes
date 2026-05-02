import { Module } from '@nestjs/common';

import { ActivityModule } from '../activity/activity.module';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../infra/database.module';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';

@Module({
  imports: [ActivityModule, AuthModule, DatabaseModule],
  controllers: [NotesController],
  providers: [NotesService],
})
export class NotesModule {}
