import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ALL_ENTITIES } from '../database/entities';
import { AttachmentFilesService } from './attachment-files.service';
import { DatabaseSeederService } from './database-seeder.service';

@Module({
  imports: [TypeOrmModule.forFeature([...ALL_ENTITIES])],
  providers: [AttachmentFilesService, DatabaseSeederService],
  exports: [AttachmentFilesService, TypeOrmModule],
})
export class DatabaseModule {}
