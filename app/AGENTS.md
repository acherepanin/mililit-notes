# AGENTS.md

Файл для разработчиков и coding agents, которые продолжают работу над приложением Notes.

## Назначение

`Notes` - TypeScript-приложение заметок:

- backend: NestJS, REST API, SQLite, Bearer token auth, роли `user` и `admin`;
- frontend: React + Vite, Tiptap editor, дерево заметок, админ-панель, RU/EN, light/dark themes;
- production: frontend собирается в `app/back/public`, backend отдает API и статические файлы;
- deployment: Dockerfile, Docker Compose и SSH deploy-скрипт находятся в `app/vm`.

## Директории

- `back` - NestJS backend.
- `front` - React frontend.
- `vm` - Docker Compose, env-файлы и deploy-скрипт.
- `docs` - актуальная документация.
- `docs/images` - единственное место для изображений документации.
- `back/.env` - tracked dev env-файл backend с локальными значениями.

## Документация

Перед изменениями читать релевантные документы:

- [docs/README.md](./docs/README.md) - обзор и быстрый старт.
- [docs/functionality.md](./docs/functionality.md) - пользовательский функционал, роли, админка, редактор, hotkeys.
- [docs/api.md](./docs/api.md) - REST API, DTO, ошибки, cURL.
- [docs/architecture.md](./docs/architecture.md) - модули, сервисы, SQLite-схема, frontend-структура.
- [docs/deployment.md](./docs/deployment.md) - локальный запуск, Docker, Compose, VM deploy, backup.

## Проверки

Frontend:

```bash
cd front
npm run format
npm run lint
npm run build
```

Backend:

```bash
cd back
npm run format
npm run lint
npm run build
```

Полная production-сборка:

```bash
cd back
npm run build:all
```

## Правила Работы

- После каждой доработки актуализировать документацию в `docs`.
- После каждой доработки собирать frontend и backend.
- Легаси и неактуальную информацию из документации удалять, а не оставлять рядом с новой.
- Имена файлов документации писать нижним регистром, кроме `README.md`, `AGENTS.md`.
- Любые изображения для документации класть только в `docs/images`.
- `back/.env` должен оставаться доступным для git; не добавлять его обратно в `.gitignore`.
- Не коммитить реальные production-секреты из `vm/.env`.
- SQLite-файлы (`*.sqlite`, `*.sqlite-wal`, `*.sqlite-shm`) являются runtime-данными, а не исходниками.
- Generated/test state вроде `test-results` не хранить в git.
- После frontend-изменений обязательно билдить frontend, потому что production backend отдает `back/public`.
- API-контракт документировать в `docs/api.md`.
- Пользовательское поведение документировать в `docs/functionality.md`.
- Запуск, Docker и VM deploy документировать в `docs/deployment.md`.
- Модули, сервисы, схему БД и потоки данных документировать в `docs/architecture.md`.
- UI должен оставаться компактным, кастомным, локализованным и без native `alert`, `prompt`, `confirm`.
- Ошибки на frontend выводить через toast-alerting.
- Все icon buttons должны иметь локализованные labels/tooltips.
- Права доступа проверять на backend. Скрытые кнопки на frontend не считаются защитой.
- Все запросы заметок должны быть scoped по текущему `user_id`.
