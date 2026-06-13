# Запуск, Docker И Деплой

## Требования

Локально:

- Node.js 22+;
- npm;
- Docker и Docker Compose (для контейнерного запуска и локального PostgreSQL).

На удалённом сервере:

- Linux-сервер с SSH;
- Docker Engine + Docker Compose plugin;
- доступ пользователя из `REMOTE_USER`;
- доступ к образу в GHCR (`docker compose pull`).

## Окружения И Env-Слои

Конфигурация backend разбита на слои в `app/back`:

| Файл       | Когда загружается | Назначение                                          |
| ---------- | ----------------- | --------------------------------------------------- |
| `.env`     | всегда (база)     | Значения по умолчанию.                              |
| `.env.dev`  | `APP_ENV=dev`     | Переопределения для разработки поверх `.env`.       |
| `.env.prod` | `APP_ENV=prod`    | Переопределения для production; запекаются в образ. |

Приоритет (раньше — сильнее, реальные переменные процесса всегда выигрывают):

```text
process env  >  .env.<APP_ENV>  >  .env
```

`APP_ENV` выбирается npm-скриптами: `npm run start:dev` → `dev`, `npm run start` → `prod`. Env-файлы коммитятся в git и запекаются в production-образ, поэтому продовый compose не передаёт конфигурацию приложению.

## Backend Env

| Переменная                      | Значение по умолчанию   | Описание                                                              |
| ------------------------------- | ----------------------- | --------------------------------------------------------------------- |
| `NODE_ENV`                      | `development`           | Режим                                                                 |
| `PORT`                          | `3000`                  | HTTP-порт backend                                                     |
| `DB_HOST`                       | `localhost`             | Хост PostgreSQL (в compose — `postgres`)                              |
| `DB_PORT`                       | `5432`                  | Порт PostgreSQL                                                       |
| `DB_USER`                       | `admin`                 | Пользователь PostgreSQL                                               |
| `DB_PASSWORD`                   | dev-значение из `.env`  | Пароль PostgreSQL                                                     |
| `DB_NAME`                       | `notes`                 | Имя базы                                                              |
| `DB_SYNCHRONIZE`                | `true`                  | TypeORM создаёт схему из сущностей при старте (без миграций)          |
| `DB_LOGGING`                    | `false`                 | Логирование SQL TypeORM                                               |
| `ADMIN_USERNAME`                | `admin`                 | Логин seed-admin                                                      |
| `ADMIN_PASSWORD`                | dev-значение из `.env`  | Пароль seed-admin                                                     |
| `AUTH_SECRET`                   | dev-secret из `.env`    | HMAC secret для token                                                 |
| `AUTH_TOKEN_TTL_SECONDS`        | `1209600`               | TTL token, 14 дней                                                    |
| `SECRET_ENCRYPTION_KEY`         | dev-secret из `.env`    | Ключ AES-256-GCM для секретных полей данных                           |
| `AI_CREDENTIALS_ENCRYPTION_KEY` | dev-secret из `.env`    | Ключ AES-256-GCM для API-ключей AI providers                          |
| `AI_TRANSCRIPTION_MODEL`        | `whisper-1`             | Модель распознавания голосовых сообщений Telegram/VK                  |
| `UPLOAD_DIR`                    | `uploads`               | Каталог файлов вложений                                               |
| `MAX_UPLOAD_SIZE_MB`            | `25`                    | Максимальный размер одного вложения                                   |
| `ALLOWED_UPLOAD_EXTENSIONS`     | список расширений       | Разрешённые типы файлов для вложений                                  |
| `ALLOW_MOCK_CHECKOUT`           | не задано               | В production mock-оплата доступна только при `true`                   |
| `APP_PUBLIC_URL`                | `http://localhost:3000` | Базовый URL SPA для ссылок подтверждения email                        |
| `SMTP_HOST`                     | не задано               | SMTP-сервер; без него ссылка подтверждения пишется в лог              |
| `SMTP_PORT`                     | `587`                   | Порт SMTP                                                             |
| `SMTP_SECURE`                   | `false`                 | `true` для SMTPS (465)                                                |
| `SMTP_USER` / `SMTP_PASS`       | не задано               | Учётные данные SMTP                                                   |
| `SMTP_FROM`                     | `notes@localhost`       | Адрес отправителя писем                                               |

Для production задайте сильные `AUTH_SECRET`, `SECRET_ENCRYPTION_KEY`, `AI_CREDENTIALS_ENCRYPTION_KEY`, `ADMIN_PASSWORD` и `DB_PASSWORD` в `.env.prod` до первого запуска с пустой БД. Backend не стартует в `NODE_ENV=production`, если `AUTH_SECRET` не задан или совпадает с dev-значением по умолчанию.

## Локальный Запуск В Docker

Полный стек (PostgreSQL + приложение) из каталога `app`:

```bash
docker compose -f deploy/docker-compose.dev.yml up --build
```

- приложение: `http://localhost:3000`;
- API: `http://localhost:3000/api`;
- PostgreSQL: `localhost:5432`.

Логи и остановка:

```bash
docker compose -f deploy/docker-compose.dev.yml logs -f notes
docker compose -f deploy/docker-compose.dev.yml down
```

## Локальный Dev-Запуск На Хосте

PostgreSQL поднимается в Docker (сервис `postgres` слушает `localhost:5432`), backend и frontend — на хосте:

```bash
cd app/back
npm install
npm run start:dev   # APP_ENV=dev, DB_HOST=localhost
```

```bash
cd app/front
npm install
npm run dev
```

Vite проксирует `/api` на backend. Адреса: frontend dev server обычно `http://localhost:5173`, backend `http://localhost:3000`.

## Production Build Без Docker

```bash
cd app/back
npm run build:all   # frontend в app/back/public + backend
npm run start       # APP_ENV=prod
```

Открыть: `http://localhost:3000`. Требуется доступный PostgreSQL по настройкам из `.env.prod`.

## Dockerfile

Файл: `app/deploy/Dockerfile` (build context — каталог `app`).

Особенности:

- multi-stage build (frontend build, backend build, prod-deps, runtime);
- BuildKit cache mounts ускоряют повторные `npm ci`;
- runtime на `node:22-bookworm-slim`, запуск от non-root пользователя `notes`;
- env-файлы (`.env`, `.env.prod`) и собранный SPA копируются в образ;
- `APP_ENV=prod` задан в образе, поэтому контейнер сам читает `.env.prod`;
- `/app/data` (вложения) — volume;
- Docker `HEALTHCHECK` на `/api/health`.

Сборка образа:

```bash
cd app
docker build -f deploy/Dockerfile -t notes-app:local .
```

## Публикация В GHCR

`.github/workflows/publish-image.yml` собирает и публикует образ в `ghcr.io/<owner>/<repo>` на push в `main`/`master` и теги `v*`. Используется встроенный `GITHUB_TOKEN` (дополнительные секреты не нужны).

## Production Compose

Файл: `app/deploy/docker-compose.yml`. Намеренно минимальный: приложению не передаётся никакая конфигурация (всё запечено в образ). Только контейнер PostgreSQL получает данные для создания роли `admin` и базы `notes` — они должны совпадать с `.env.prod`.

```bash
docker compose up -d
```

`image:` в `docker-compose.yml` и `IMAGE` в `app/deploy/.env` держите синхронными.

## Образ И Удалённый Деплой

Скрипт: `app/deploy/deploy.sh` (команды `push` / `pull` / `deploy`). Параметры — в `app/deploy/.env` (образ и SSH-доступ).

npm-команды из `app/back`:

```bash
npm run image:push   # собрать и запушить образ в GHCR
npm run image:pull   # спулить образ
npm run deploy       # отправить compose на сервер, спулить, перезапустить, очистить
```

`deploy` копирует `docker-compose.yml` на сервер, выполняет `docker compose pull` + `up -d --remove-orphans`, затем удаляет остановленные контейнеры, висячие образы и кеш сборки (`docker container/image/builder prune -f`).

## Проверки Перед Деплоем

```bash
cd app/front && npm run lint && npm run build
cd app/back  && npm run lint && npm run typecheck && npm run build
```

Health:

```bash
curl -s http://localhost:3000/api/health
```

## Данные И Backup

Данные PostgreSQL хранятся в именованном Docker volume (`notes-db`), загруженные файлы — в volume `notes-uploads` (`/app/data`).

Backup базы:

```bash
docker exec notes-postgres-1 pg_dump -U admin -d notes > notes-backup-$(date +%Y%m%d-%H%M%S).sql
```

Восстановление:

```bash
cat notes-backup.sql | docker exec -i notes-postgres-1 psql -U admin -d notes
```

При пустой БД backend при старте создаёт схему (TypeORM) и seed-admin.
