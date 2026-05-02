# Notes App Documentation

TypeScript-приложение заметок с NestJS backend, React frontend, SQLite, обязательной авторизацией, ролями и админ-панелью.

## Структура

- `app/back` - NestJS backend, REST API, SQLite, авторизация, роли, админские методы, отдача frontend-статики.
- `app/front` - React + Vite frontend, Tiptap-редактор с режимами просмотра/редактирования, секретными copy fields, дерево заметок, админка, RU/EN, светлая/темная темы.
- `app/vm` - Docker Compose, env-файлы и bash-скрипт деплоя на VM по SSH.
- `app/docs` - актуальная документация. Все изображения для документации лежат только в `app/docs/images`.

## Документы

- [functionality.md](./functionality.md) - пользовательский функционал, роли, админка, редактор, hotkeys.
- [api.md](./api.md) - REST API, DTO, ответы, ошибки и cURL-запросы.
- [architecture.md](./architecture.md) - модули, сервисы, таблицы SQLite и потоки данных.
- [deployment.md](./deployment.md) - локальный запуск, production build, Docker, Compose, VM deploy, данные и backup.

## Быстрый локальный запуск

Backend:

```bash
cd app/back
npm install
npm run start:dev
```

Frontend в dev-режиме:

```bash
cd app/front
npm install
npm run dev
```

Адреса:

- backend: `http://localhost:3000`
- API: `http://localhost:3000/api`
- frontend dev server: обычно `http://localhost:5173`

Production-сценарий:

```bash
cd app/back
npm run build:all
npm run start
```

Команда `build:all` сначала собирает frontend в `app/back/public`, затем собирает backend. После запуска NestJS отдает и API, и собранный frontend с одного порта.

## Данные входа по умолчанию

Если таблица `users` пустая, backend создает администратора:

- логин: `admin`
- пароль: `admin`
- роль: `admin`

Значения берутся из `ADMIN_USERNAME` и `ADMIN_PASSWORD`. Для локального запуска они заданы в `app/back/.env`. Новые пользователи, созданные через админку, по умолчанию получают роль `user`.

## Данные и SQLite

- Локальный путь БД задается в `app/back/.env` через `DB_PATH=notes.sqlite`.
- При запуске из `app/back` файл создается как `app/back/notes.sqlite`, если его нет.
- В Docker БД должна лежать вне контейнера в volume/bind mount.
- Backend включает WAL и foreign keys.
- Заметки привязаны к `users.id`; каждый пользователь видит только свои заметки.
- Секретные поля заметок маскируются в визуальном режиме, но сейчас хранятся в `content_html` заметки без шифрования на уровне БД.
- При удалении пользователя через админку его заметки удаляются каскадно.
- История действий остается, но ссылки на удаленного пользователя могут стать `null`.

## Основные команды

Frontend:

```bash
cd app/front
npm run lint
npm run build
```

Backend:

```bash
cd app/back
npm run lint
npm run build
npm run build:front
npm run build:all
```

## Важные правила проекта

- После каждой доработки актуализировать документацию в `app/docs`.
- После каждой доработки собирать frontend и backend.
- Старую и неактуальную информацию из документации удалять.
- Имена файлов документации пишутся нижним регистром, кроме `README.md` и `AGENTS.md`.
- Любые изображения для документации помещать только в `app/docs/images`.
