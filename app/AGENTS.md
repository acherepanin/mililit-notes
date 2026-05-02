# AGENTS.md

Файл для разработчиков и coding agents, которые продолжают работу над приложением Notes.

## Назначение Проекта

`Notes` - TypeScript-приложение заметок:

- backend: NestJS, REST API, SQLite, Bearer token auth, роли `user`/`admin`;
- frontend: React + Vite, Tiptap rich editor, дерево заметок, админка, RU/EN, light/dark themes;
- production: frontend собирается в `app/back/public`, backend отдает API и статику;
- deployment: Dockerfile, Docker Compose и SSH deploy-скрипт в `app/vm`.

## Ключевые Директории

- `back` - NestJS backend.
- `front` - React frontend.
- `vm` - Docker Compose, `.env.example`, `.env`, `deploy.sh`.
- `docs` - актуальная документация.
- `docs/images` - единственное место для изображений документации.
- `back/.env` - tracked dev env-файл backend с локальными значениями.

## Документация

Перед изменениями прочитать релевантные документы:

- [docs/README.md](./docs/README.md) - обзор проекта и быстрый старт.
- [docs/functionality.md](./docs/functionality.md) - пользовательский функционал, роли, админка, редактор, hotkeys.
- [docs/api.md](./docs/api.md) - REST API, DTO, ошибки, cURL.
- [docs/architecture.md](./docs/architecture.md) - backend/frontend модули, SQLite-схема, потоки данных.
- [docs/deployment.md](./docs/deployment.md) - локальный запуск, Docker, Compose, VM deploy, backup.

## Команды Проверки

Frontend:

```bash
cd front
npm run lint
npm run build
```

Backend:

```bash
cd back
npm run lint
npm run build
```

Полный production build:

```bash
cd back
npm run build:all
```

## Правила Работы

- После каждой доработки актуализировать документацию в `docs`.
- После каждой доработки запускать сборку frontend и backend: `npm run build` в `front` и `back`.
- Устаревшую информацию из документации удалять, а не оставлять рядом с новой.
- Имена файлов документации писать нижним регистром, кроме `README.md` и `AGENTS.md`.
- Любые изображения для документации класть только в `docs/images`.
- `back/.env` должен оставаться доступным для git; не добавлять его обратно в `.gitignore`.
- Не коммитить реальные production-секреты из `vm/.env`.
- SQLite-файлы (`*.sqlite`, `*.sqlite-wal`, `*.sqlite-shm`) являются runtime-данными, не исходниками.
- После frontend-изменений обязательно билдить frontend, потому что production backend отдает `back/public`.
- API-контракт документировать в `docs/api.md`.
- Изменения пользовательского поведения документировать в `docs/functionality.md`.
- Изменения запуска, Docker или VM deploy документировать в `docs/deployment.md`.
- Изменения модулей, сервисов, схемы БД или потоков данных документировать в `docs/architecture.md`.
- UI должен оставаться компактным, кастомным, локализованным и без нативных `alert`, `prompt`, `confirm`.
- Ошибки на frontend выводить через toast-alerting.
- Все icon buttons должны иметь локализованные labels/tooltips.
- Права доступа проверять на backend. Скрытые кнопки на frontend не считаются защитой.
- Все запросы заметок должны быть scoped по текущему `user_id`.
