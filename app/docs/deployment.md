# Запуск, Docker И Деплой

## Требования

Локально:

- Node.js 22+;
- npm;
- Docker и Docker Compose для контейнерного запуска.

На VM:

- Linux-сервер с SSH;
- Docker Engine;
- Docker Compose plugin;
- доступ пользователя из `REMOTE_USER`;
- доступ к Docker image, если используется `docker compose pull`.

## Backend Env

Локальный backend читает `app/back/.env`. Файл намеренно доступен для git и содержит dev-настройки.

| Переменная                      | Значение по умолчанию | Описание                                                                                             |
| ------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                      | `development`         | Режим                                                                                                |
| `PORT`                          | `3000`                | HTTP-порт backend                                                                                    |
| `DB_PATH`                       | `notes.sqlite`        | SQLite-файл относительно `app/back`, если запуск идет из `app/back`                                  |
| `ADMIN_USERNAME`                | `admin`               | Логин seed-admin                                                                                     |
| `ADMIN_PASSWORD`                | `admin`               | Пароль seed-admin                                                                                    |
| `AUTH_SECRET`                   | dev-secret из `.env`  | HMAC secret для token                                                                                |
| `AUTH_TOKEN_TTL_SECONDS`        | `1209600`             | TTL token, 14 дней                                                                                   |
| `SECRET_ENCRYPTION_KEY`         | dev-secret из `.env`  | Ключ AES-256-GCM для секретных полей данных                                                          |
| `AI_CREDENTIALS_ENCRYPTION_KEY` | dev-secret из `.env`  | Ключ AES-256-GCM для API-ключей AI providers                                                         |
| `AI_TRANSCRIPTION_MODEL`        | `whisper-1`           | Модель распознавания голосовых сообщений Telegram/VK через OpenAI-compatible `/audio/transcriptions` |
| `UPLOAD_DIR`                    | `uploads`             | Каталог файлов вложений                                                                              |
| `MAX_UPLOAD_SIZE_MB`            | `25`                  | Максимальный размер одного вложения                                                                  |
| `ALLOWED_UPLOAD_EXTENSIONS`     | список расширений     | Разрешенные типы файлов для вложений                                                                 |
| `ALLOW_MOCK_CHECKOUT`           | не задано             | В production mock-оплата подписок доступна только при `true`                                         |
| `APP_PUBLIC_URL`                | `http://localhost:3000` | Базовый URL SPA для ссылок подтверждения email                                                     |
| `SMTP_HOST`                     | не задано             | SMTP-сервер; без него ссылка подтверждения пишется в лог                                           |
| `SMTP_PORT`                     | `587`                 | Порт SMTP                                                                                            |
| `SMTP_SECURE`                   | `false`               | `true` для SMTPS (465)                                                                               |
| `SMTP_USER`                     | не задано             | Логин SMTP                                                                                           |
| `SMTP_PASS`                     | не задано             | Пароль SMTP                                                                                          |
| `SMTP_FROM`                     | `notes@localhost`     | Адрес отправителя писем                                                                              |

Для production задайте сильный `AUTH_SECRET`, `SECRET_ENCRYPTION_KEY`, `AI_CREDENTIALS_ENCRYPTION_KEY`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` до первого запуска с пустой БД. Backend не стартует в `NODE_ENV=production`, если `AUTH_SECRET` не задан или совпадает с dev-значением по умолчанию. Для Telegram/VK webhook secret обязателен при включённом боте.

## Локальный Dev-Запуск

Backend:

```bash
cd app/back
npm install
npm run start:dev
```

Frontend:

```bash
cd app/front
npm install
npm run dev
```

Адреса:

- frontend dev server: обычно `http://localhost:5173`;
- backend: `http://localhost:3000`;
- API: `http://localhost:3000/api`.

Vite проксирует `/api` на backend.

## Production Build Без Docker

Собрать frontend в `app/back/public`:

```bash
cd app/front
npm run build
```

Или из backend:

```bash
cd app/back
npm run build:front
```

Собрать backend:

```bash
cd app/back
npm run build
```

Собрать все:

```bash
cd app/back
npm run build:all
```

Запустить:

```bash
cd app/back
npm run start
```

Открыть:

```text
http://localhost:3000
```

Если файла БД нет, он создается автоматически:

```text
app/back/notes.sqlite
```

Переопределить путь БД:

```bash
DB_PATH=/absolute/path/notes.sqlite npm run start
```

PowerShell:

```powershell
$env:DB_PATH="C:\data\notes.sqlite"
npm run start
```

## Dockerfile

Файл: `app/back/Dockerfile`

Особенности:

- multi-stage build;
- отдельные слои для backend dependencies, frontend dependencies, build и runtime;
- BuildKit cache mounts ускоряют повторные `npm ci`;
- frontend собирается до runtime stage;
- backend runtime использует production dependencies через `npm ci --omit=dev`;
- runtime stage основан на `node:22-bookworm-slim`;
- контейнер запускается от non-root пользователя `notes`;
- SQLite путь внутри контейнера: `/app/data/notes.sqlite`;
- `/app/data` должен быть volume или bind mount;
- есть Docker `HEALTHCHECK` на `/api/health`.

Сборка image из `app`:

```bash
cd app
docker build -f back/Dockerfile -t notes-app:local .
```

Запуск:

```bash
docker run --rm -p 3000:3000 \
  -e AUTH_SECRET="change-me" \
  -e SECRET_ENCRYPTION_KEY="change-me-too" \
  -e ADMIN_USERNAME="admin" \
  -e ADMIN_PASSWORD="admin" \
  -v "$PWD/data:/app/data" \
  notes-app:local
```

Проверка:

```bash
curl -s http://localhost:3000/api/health
```

## Docker Compose

Файл: `app/vm/docker-compose.yml`

Сервис `notes`:

- image из `APP_IMAGE`, по умолчанию `notes-app:latest`;
- build context `..`, Dockerfile `back/Dockerfile`;
- порт `${APP_PORT:-3000}:3000`;
- `DB_PATH=/app/data/notes.sqlite`;
- bind mount `${NOTES_DATA_DIR:-./data}:/app/data`;
- restart policy `unless-stopped`;
- healthcheck `/api/health`.

Локальный запуск compose:

```bash
cd app/vm
cp .env.example .env
docker compose --env-file .env up --build -d
```

Логи:

```bash
docker compose --env-file .env logs -f notes
```

Остановка:

```bash
docker compose --env-file .env down
```

Очистка неиспользуемых images:

```bash
docker image prune -f
```

## VM Env

Файлы:

- `app/vm/.env.example` - шаблон;
- `app/vm/.env` - рабочий env для локального deploy-скрипта.

Переменные:

| Переменная             | Описание                               |
| ---------------------- | -------------------------------------- |
| `COMPOSE_PROJECT_NAME` | Имя compose-проекта                    |
| `APP_IMAGE`            | Docker image для VM                    |
| `APP_PORT`             | Внешний порт                           |
| `NOTES_DATA_DIR`       | Директория данных на VM                |
| `REMOTE_HOST`          | Host/IP VM                             |
| `REMOTE_PORT`          | SSH-порт                               |
| `REMOTE_USER`          | SSH-пользователь                       |
| `REMOTE_HOME`          | Домашняя директория пользователя на VM |
| `REMOTE_DOCKER_DIR`    | Директория на VM для `.env` и compose  |
| `REMOTE_SSH_KEY`       | Локальный путь к SSH private key       |

Не коммитьте реальные production-секреты.

## Деплой На VM

Скрипт: `app/vm/deploy.sh`

Что делает:

1. Проверяет `app/vm/.env`.
2. Загружает переменные.
3. Проверяет `REMOTE_HOST`, `REMOTE_USER`, `REMOTE_HOME`.
4. Вычисляет defaults:
   - `REMOTE_PORT=22`;
   - `REMOTE_DOCKER_DIR=${REMOTE_HOME}/docker`;
   - `NOTES_DATA_DIR=${REMOTE_DOCKER_DIR}/notes-data`.
5. Создает на сервере `REMOTE_DOCKER_DIR` и `NOTES_DATA_DIR`.
6. Копирует `.env` и `docker-compose.yml` в `REMOTE_DOCKER_DIR`.
7. На сервере выполняет:
   - `docker compose --env-file .env pull`;
   - `docker compose --env-file .env up -d --remove-orphans`;
   - `docker image prune -f`.

Запуск:

```bash
cd app/vm
bash deploy.sh
```

Команды на VM вручную:

```bash
cd ~/docker
docker compose --env-file .env pull
docker compose --env-file .env up -d --remove-orphans
docker compose --env-file .env ps
docker compose --env-file .env logs -f notes
docker image prune -f
```

Rollback зависит от стратегии тегов. Используйте immutable tags:

```bash
APP_IMAGE=registry.example.com/notes-app:2026-05-02-1200
```

Для отката поменяйте `APP_IMAGE` в `.env` и выполните:

```bash
docker compose --env-file .env pull
docker compose --env-file .env up -d --remove-orphans
```

## Проверки Перед Деплоем

Frontend:

```bash
cd app/front
npm run format
npm run lint
npm run build
```

Backend:

```bash
cd app/back
npm run format
npm run lint
npm run build
```

Compose config:

```bash
cd app/vm
docker compose --env-file .env config
```

Health:

```bash
curl -s http://localhost:3000/api/health
```

## Данные И Backup

SQLite работает в WAL-режиме. Рядом с основным файлом могут появляться:

- `notes.sqlite`;
- `notes.sqlite-wal`;
- `notes.sqlite-shm`.

Это runtime-данные, а не исходники. В `app/back/.gitignore` они исключены как `*.sqlite`, `*.sqlite-wal`, `*.sqlite-shm`.

Для backup копируйте все связанные файлы или делайте SQLite backup при остановленном приложении.

Безопасный ручной backup на VM:

```bash
cd ~/docker
docker compose --env-file .env stop notes
tar -czf notes-data-backup-$(date +%Y%m%d-%H%M%S).tar.gz notes-data
docker compose --env-file .env up -d
```

Если SQLite-файл удален и backup отсутствует, данные восстановить нельзя. При следующем старте backend создаст пустую БД и seed-admin.
