# Notes App Documentation

`Notes` - приложение заметок на TypeScript с NestJS backend, React frontend, SQLite, обязательной авторизацией, ролями и админ-панелью.

## Структура

- `app/back` - NestJS backend, REST API, SQLite, авторизация, роли, админские методы, отдача собранного frontend.
- `app/front` - React + Vite frontend, Tiptap editor, дерево заметок, секретные copy fields, админка, RU/EN, светлая/темная темы, favicon и lazy chunks для рабочей области и админки.
- `app/vm` - Docker Compose, env-файлы и bash deploy-скрипт для VM.
- `app/docs` - актуальная документация.
- `app/docs/images` - все изображения документации и дизайн-референсы.

## Документы

- [functionality.md](./functionality.md) - функционал приложения, роли, админка, редактор, hotkeys.
- [api.md](./api.md) - REST API, DTO, ответы, ошибки и cURL-запросы.
- [architecture.md](./architecture.md) - backend/frontend модули, SQLite-схема и потоки данных.
- [deployment.md](./deployment.md) - локальный запуск, production build, Docker, Compose, VM deploy, backup.

## Быстрый Локальный Запуск

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

`build:all` сначала собирает frontend в `app/back/public`, затем собирает backend. После запуска NestJS отдает API и собранный frontend с одного порта.

## Данные Входа По Умолчанию

Если таблица `users` пустая, backend создает администратора:

- логин: `admin`
- пароль: `admin`
- роль: `admin`

Значения берутся из `ADMIN_USERNAME` и `ADMIN_PASSWORD`. Для локального запуска они заданы в `app/back/.env`. Новые пользователи, созданные через админку, по умолчанию получают роль `user`.

## Данные И SQLite

- Локальный путь БД задается в `app/back/.env` через `DB_PATH=notes.sqlite`.
- При запуске из `app/back` файл создается как `app/back/notes.sqlite`, если его нет.
- В Docker БД должна лежать вне контейнера в volume/bind mount.
- Backend включает WAL и foreign keys.
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

## Правила Проекта

- После каждой доработки актуализировать документацию в `app/docs`.
- После каждой доработки собирать frontend и backend.
- Старую и неактуальную информацию из документации удалять.
- Имена файлов документации пишутся нижним регистром, кроме `README.md` и `AGENTS.md`.
- Любые изображения для документации помещать только в `app/docs/images`.
