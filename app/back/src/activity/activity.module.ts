import { Module } from '@nestjs/common';

import { DatabaseModule } from '../infra/database.module';
import { ActivityService } from './activity.service';

@Module({
  imports: [DatabaseModule],
  providers: [ActivityService],
  exports: [ActivityService],
})
export class ActivityModule {}
