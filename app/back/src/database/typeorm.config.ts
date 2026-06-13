import type { ConfigService } from '@nestjs/config';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';

import { readPort, readPositiveInteger } from '../config/env';
import { ALL_ENTITIES } from './entities';

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return fallback;
}

// Собирает опции подключения TypeORM из env. Значения по умолчанию рассчитаны
// на локальный Postgres; в Docker/проде переопределяются через env-файлы.
export function buildTypeOrmOptions(configService: ConfigService): TypeOrmModuleOptions {
  return {
    type: 'postgres',
    host: configService.get<string>('DB_HOST')?.trim() || 'localhost',
    port: readPort(configService.get<string>('DB_PORT'), 5432),
    username: configService.get<string>('DB_USER')?.trim() || 'admin',
    password: configService.get<string>('DB_PASSWORD') ?? '',
    database: configService.get<string>('DB_NAME')?.trim() || 'notes',
    entities: [...ALL_ENTITIES],
    // synchronize=true: схема создаётся из сущностей при старте, без миграций.
    synchronize: readBoolean(configService.get<string>('DB_SYNCHRONIZE'), true),
    logging: readBoolean(configService.get<string>('DB_LOGGING'), false),
    // Ждём готовности Postgres при первом старте (порядок запуска в compose).
    retryAttempts: readPositiveInteger(configService.get<string>('DB_RETRY_ATTEMPTS'), 15),
    retryDelay: readPositiveInteger(configService.get<string>('DB_RETRY_DELAY_MS'), 3000),
  };
}
