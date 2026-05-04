import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'node:path';

import { AdminModule } from './admin/admin.module';
import { AiModule } from './ai/ai.module';
import { HealthController } from './health.controller';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './infra/database.module';
import { NotesModule } from './notes/notes.module';
import { WorkspaceModule } from './workspace/workspace.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'public'),
      exclude: ['/api/{*path}'],
    }),
    AuthModule,
    AdminModule,
    AiModule,
    DatabaseModule,
    NotesModule,
    WorkspaceModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
