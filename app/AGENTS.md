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

- [README.md](../README.md) - обзор и быстрый старт.
- [docs/functionality.md](./docs/functionality.md) - пользовательский функционал, роли, админка, редактор, hotkeys.
- [docs/api.md](./docs/api.md) - REST API, DTO, ошибки, cURL.
- [docs/architecture.md](./docs/architecture.md) - модули, сервисы, SQLite-схема, frontend-структура.
- [docs/ui.md](./docs/ui.md) - UI-компоненты, tooltip/select/modal/toast правила, запрет native UI там, где есть кастомные компоненты.
- [docs/deployment.md](./docs/deployment.md) - локальный запуск, Docker, Compose, VM deploy, backup, переменные окружения и production hardening.
- [docs/bot_setup.md](./docs/bot_setup.md) - настройка Telegram/VK ботов и привязка аккаунтов.

## Проверки

После **каждой** правки кода выполнять два обязательных шага перед завершением задачи.

### 1. Актуализировать документацию

Обновлять релевантные документы в `docs`, `README.md` и при необходимости `AGENTS.md`. Не оставлять устаревшие описания API, UI, схемы БД, deploy и поведения.

| Что изменилось | Куда писать |
|---|---|
| REST API, DTO, ошибки | `docs/api.md` |
| Пользовательский функционал, роли, сценарии | `docs/functionality.md` |
| Модули, сервисы, БД, потоки данных, безопасность | `docs/architecture.md` |
| UI-компоненты, tooltip/select/modal/toast | `docs/ui.md` |
| Запуск, Docker, env, deploy | `docs/deployment.md` |
| Telegram/VK боты | `docs/bot_setup.md` |
| Обзор проекта, быстрый старт | `README.md` |
| Правила для agents | `AGENTS.md` |

Легаси и неактуальную информацию удалять, а не дописывать рядом с новой. Если функционал убран — убрать упоминания из docs и из developer prompt Notes AI.

### 2. Собрать frontend и backend

```bash
cd back
npm run build:all
```

`build:all` сначала собирает frontend в `back/public`, затем компилирует backend. Не ограничиваться отдельными `npm run build` в `front` или `back`, если задача затрагивает проект в целом. Не завершать задачу, пока сборка не прошла успешно.

Дополнительно по необходимости:

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

## Правила Работы

- После каждой правки: актуализировать документацию (см. таблицу выше) и выполнить `cd back && npm run build:all`.
- После любого добавления, удаления или изменения функционала проверять стартовый prompt Notes AI и при необходимости актуализировать его. В prompt должны подробно отражаться актуальные API, UI-возможности, правила работы с данными, доступные tool-calls и ограничения, к которым бот должен иметь доступ. Удаленный или легаси-функционал из prompt убирать, чтобы бот не опирался на несуществующие возможности.
- Имена файлов документации писать нижним регистром, кроме `README.md`, `AGENTS.md`.
- Любые изображения для документации класть только в `docs/images`.
- `back/.env` должен оставаться доступным для git; не добавлять его обратно в `.gitignore`.
- Не коммитить реальные production-секреты из `vm/.env`.
- SQLite-файлы (`*.sqlite`, `*.sqlite-wal`, `*.sqlite-shm`) являются runtime-данными, а не исходниками.
- Generated/test state вроде `test-results` не хранить в git.
- UI должен оставаться компактным, кастомным, локализованным и без native `alert`, `prompt`, `confirm`.
- Ошибки на frontend выводить через toast-alerting.
- Все icon buttons должны иметь локализованные labels/tooltips.
- Все JSX `<input>`, кроме `type="file"`, должны иметь явный `autoComplete`; реальные username/password формы должны иметь стабильные `name`, а password/API key поля должны быть внутри настоящего `form` со скрытым username через `.sr-only`, если видимого username нет. Frontend `npm run lint` включает `lint:dom` и должен ловить такие нарушения.
- Права доступа проверять на backend. Скрытые кнопки на frontend не считаются защитой.
- Все запросы заметок должны быть scoped по текущему `user_id`.
- В production обязателен сильный `AUTH_SECRET`; mock checkout подписок отключён без `ALLOW_MOCK_CHECKOUT=true`.
- Публичные share-ссылки не должны утекать секреты в `contentText` при `includeSecrets=false`.
