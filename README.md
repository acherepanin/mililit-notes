# Notes App Documentation

`Notes` - приложение заметок на TypeScript с NestJS backend, React frontend, PostgreSQL (TypeORM), обязательной авторизацией, ролями и админ-панелью.

## Структура

- `app/back` - NestJS backend, REST API, PostgreSQL через TypeORM, авторизация, роли, админские методы, отдача собранного frontend.
- `app/front` - React + Vite frontend, Tiptap editor, дерево заметок, секретные copy fields, админка, RU/EN, светлая/темная темы, favicon и lazy chunks для рабочей области и админки.
- `app/deploy` - Dockerfile, dev/prod Docker Compose, скрипт удалённого деплоя, описание окружений и env-слоёв.
- `app/docs` - актуальная документация.
- `app/docs/images` - все изображения документации и дизайн-референсы.
- `.github/workflows` - CI: сборка и публикация образа в GHCR.

## Документы

- [functionality.md](./app/docs/functionality.md) - функционал приложения, роли, админка, редактор, hotkeys, подписки, личный кабинет.
- [api.md](./app/docs/api.md) - REST API, DTO, ответы, ошибки и cURL-запросы.
- [architecture.md](./app/docs/architecture.md) - backend/frontend модули, схема БД (PostgreSQL/TypeORM), потоки данных, безопасность.
- [deployment.md](./app/docs/deployment.md) - локальный запуск, production build, Docker, Compose, удалённый деплой.
- [app/deploy/README.md](./app/deploy/README.md) - окружения, env-слои, образ, GHCR, прод-деплой.
- [ui.md](./app/docs/ui.md) - UI-компоненты, tooltip/select/modal/toast правила.

## Быстрый Локальный Запуск (Docker)

Полный стек (PostgreSQL + приложение) из каталога `app`:

```bash
docker compose -f deploy/docker-compose.dev.yml up --build
```

- приложение: `http://localhost:3000`
- API: `http://localhost:3000/api`
- PostgreSQL: `localhost:5432`

## Запуск Backend На Хосте

PostgreSQL можно поднять только в Docker (сервис `postgres`), а backend запускать на хосте — он берёт `DB_HOST=localhost` из `app/back/.env`:

```bash
cd app/back
npm install
npm run start:dev   # APP_ENV=dev
```

Frontend в dev-режиме:

```bash
cd app/front
npm install
npm run dev
```

Production-сценарий (один порт для API и SPA):

```bash
cd app/back
npm run build:all
npm run start   # APP_ENV=prod
```

`build:all` сначала собирает frontend в `app/back/public`, затем собирает backend. После запуска NestJS отдает API и собранный frontend с одного порта.

## Конфигурация И Окружения

Используются слоистые env-файлы в `app/back`: базовый `.env` загружается всегда, а `.env.dev` / `.env.prod` (выбираются через `APP_ENV`) переопределяют его. Файлы коммитятся в git и запекаются в образ. Подробности — в [app/deploy/README.md](./app/deploy/README.md).

## База Данных

PostgreSQL с пользователем и базой, создаваемыми контейнером при первом старте:

- пользователь: `admin`
- база: `notes`

TypeORM работает с `DB_SYNCHRONIZE=true`: схема создаётся из сущностей при старте (без миграций).

## Данные Входа По Умолчанию

Если таблица `users` пустая, backend создает администратора из `ADMIN_USERNAME` / `ADMIN_PASSWORD`:

- логин: `admin`
- пароль: `adm136479`
- роль: `admin`

Новые пользователи регистрируются через `/register` и получают тариф `free`.

## Маршруты SPA

- `/login`, `/register` — вход и регистрация
- `/notes` — рабочая зона
- `/account` — личный кабинет и подписки
- `/admin` — админ-панель (role: admin)
- `/share/:token` — публичная ссылка без auth

## Данные И PostgreSQL

- Подключение задаётся переменными `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` в env-файлах `app/back`.
- В Docker данные PostgreSQL хранятся в именованном volume; загруженные файлы — в volume `/app/data`.
- Схема создаётся TypeORM из сущностей при старте (`DB_SYNCHRONIZE=true`).
- Заметки привязаны к `users.id`; каждый пользователь видит только свои заметки.
- Секретные поля заметок маскируются в визуальном режиме, но хранятся в `content_html` заметки без шифрования на уровне БД.
- При удалении пользователя через админку его заметки удаляются каскадно.

## Команды

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
npm run build:front
npm run build:all
```

Деплой (параметры — в `app/deploy/.env`):

```bash
cd app/back
npm run image:push   # собрать и запушить образ в GHCR
npm run image:pull   # спулить образ
npm run deploy       # отправить compose на сервер, спулить, перезапустить, очистить
```

## Правила Проекта

- После каждой доработки актуализировать документацию в `app/docs`.
- После каждой доработки собирать frontend и backend.
- Старую и неактуальную информацию из документации удалять.
- Имена файлов документации пишутся нижним регистром, кроме `README.md` и `AGENTS.md`.
- Любые изображения для документации помещать только в `app/docs/images`.
