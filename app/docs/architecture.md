# Архитектура

## Общая Схема

Приложение разделено на два TypeScript-проекта:

- `app/back` - NestJS backend, SQLite, REST API, auth, роли, админские операции, отдача frontend-статики.
- `app/front` - React + Vite SPA, Tiptap editor, дерево заметок, админ-панель, темы и локализация.

Production-поток:

1. `app/front` собирается в `app/back/public`.
2. `app/back` компилируется в `app/back/dist`.
3. NestJS отдает `/api/*` и статический frontend с одного порта.

## Backend

### Модули

- `AppModule` - подключает `ConfigModule`, `ServeStaticModule`, `AuthModule`, `AdminModule`, `DatabaseModule`, `NotesModule`, `HealthController`.
- `DatabaseModule` - singleton `DatabaseService`.
- `AuthModule` - login, token verification, текущий пользователь, preferences.
- `NotesModule` - CRUD и move заметок текущего пользователя.
- `AdminModule` - пользователи, статистика, история действий.
- `ActivityModule` - запись и чтение audit-событий.

### Конфигурация

`ConfigModule.forRoot({ isGlobal: true })` читает `.env`.

Ключевые env:

- `PORT`
- `DB_PATH`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `AUTH_SECRET`
- `AUTH_TOKEN_TTL_SECONDS`

Парсинг чисел выполняется через `src/config/env.ts`.

### HTTP Boundary

`main.ts` настраивает:

- global prefix `api`;
- CORS;
- global `ValidationPipe` с `whitelist`, `forbidNonWhitelisted`, `transform`;
- порт из `PORT`.

Controllers остаются thin: принимают DTO, получают пользователя из `AuthGuard`, вызывают сервисы.

### Auth

Auth token - простой HMAC-подписанный token формата:

```text
base64urlPayload.signature
```

Логика подписи и чтения вынесена в `src/auth/token.ts`:

- `createSignedToken(payload, secret)`;
- `readSignedToken(token, secret)`;
- runtime-проверка payload перед использованием.

`AuthService` отвечает за:

- login;
- обновление `last_login_at`;
- запись `auth.login` в activity;
- получение актуального пользователя из БД при каждом request;
- обновление `language` и `theme`.

`AuthGuard` проверяет Bearer token и кладет `request.user`.
`AdminGuard` проверяет `request.user.role === 'admin'`.

### SQLite

`DatabaseService`:

- создает директорию для `DB_PATH`;
- открывает `better-sqlite3`;
- включает `journal_mode = WAL`;
- включает `foreign_keys = ON`;
- выполняет idempotent schema migration;
- создает seed-admin, если таблица `users` пустая;
- создает welcome note, если таблица `notes` пустая.

## SQLite Схема

### `users`

| Поле | Тип | Описание |
| --- | --- | --- |
| `id` | `INTEGER PRIMARY KEY AUTOINCREMENT` | ID |
| `username` | `TEXT NOT NULL UNIQUE` | Логин |
| `password_hash` | `TEXT NOT NULL` | PBKDF2 hash |
| `role` | `TEXT NOT NULL DEFAULT 'user'` | `user` или `admin` |
| `language` | `TEXT NOT NULL DEFAULT 'ru'` | `ru` или `en` |
| `theme` | `TEXT NOT NULL DEFAULT 'dark'` | `light` или `dark` |
| `last_login_at` | `TEXT` | Последний вход |
| `created_at` | `TEXT NOT NULL` | Создание |
| `updated_at` | `TEXT NOT NULL` | Обновление |

### `notes`

| Поле | Тип | Описание |
| --- | --- | --- |
| `id` | `INTEGER PRIMARY KEY AUTOINCREMENT` | ID |
| `user_id` | `INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE` | Владелец |
| `name` | `TEXT NOT NULL` | Название |
| `content_html` | `TEXT NOT NULL DEFAULT ''` | HTML редактора |
| `content_text` | `TEXT NOT NULL DEFAULT ''` | Plain text |
| `parent_id` | `INTEGER REFERENCES notes(id) ON DELETE CASCADE` | Родительская заметка |
| `position` | `INTEGER NOT NULL DEFAULT 0` | Позиция |
| `created_at` | `TEXT NOT NULL` | Создание |
| `updated_at` | `TEXT NOT NULL` | Обновление |

Индексы:

- `idx_notes_user_parent`
- `idx_notes_position`

### `activity_logs`

| Поле | Тип | Описание |
| --- | --- | --- |
| `id` | `INTEGER PRIMARY KEY AUTOINCREMENT` | ID |
| `actor_id` | `INTEGER REFERENCES users(id) ON DELETE SET NULL` | Кто сделал |
| `user_id` | `INTEGER REFERENCES users(id) ON DELETE SET NULL` | Кого касается |
| `action` | `TEXT NOT NULL` | Код действия |
| `target_type` | `TEXT NOT NULL` | Тип цели |
| `target_id` | `INTEGER` | ID цели |
| `details` | `TEXT NOT NULL DEFAULT '{}'` | JSON details |
| `created_at` | `TEXT NOT NULL` | Время |

Индексы:

- `idx_activity_created`
- `idx_activity_user`

## Backend Services

### `NotesService`

Отвечает за заметки текущего пользователя:

- `getTree(userId)`;
- `getById(userId, id)`;
- `create(userId, dto)`;
- `update(userId, id, dto)`;
- `move(userId, id, dto)`;
- `delete(userId, id)`.

Все операции проверяют ownership через `user_id`. Move запрещает перенос в самого себя и в потомка.

### `AdminService`

Отвечает за:

- список пользователей с `notesCount`;
- создание пользователя;
- изменение роли и пароля;
- удаление пользователя;
- статистику;
- историю действий.

Backend не дает удалить собственный admin-аккаунт и не дает оставить систему без единого admin.

### `ActivityService`

Записывает важные события:

- `auth.login`;
- `notes.create`;
- `notes.update`;
- `notes.move`;
- `notes.delete`;
- `admin.user.create`;
- `admin.user.update`;
- `admin.user.delete`.

`list(limit)` нормализует limit в диапазон `1..200`.

## Frontend

### Основные файлы

- `src/App.tsx` - легкий bootstrap/auth слой: login screen, guest theme/language, toast-host и lazy-загрузка рабочей области после входа.
- `features/app/AuthenticatedApp.tsx` - рабочая область после авторизации: notes workspace, editor, sidebar, модалки заметок и lazy-загрузка админки.
- `src/api.ts` - typed API client и Bearer token.
- `src/i18n.ts` - RU/EN словарь.
- `src/types.ts` - общие frontend-типы.
- `src/styles.css` - дизайн-токены, темы и компоненты.
- `public/favicon.svg` - фавиконка приложения; читаемый размер в браузерной вкладке задается `viewBox` с сохранением всего контура без обрезки, Vite копирует файл в корень backend static build.

### Компоненты

- `components/IconButton.tsx` - icon-only button с tooltip label.
- `components/CustomSelect.tsx` - кастомный dropdown через portal.
- `components/Tooltip.tsx` и `TooltipText.tsx` - единый tooltip-слой.
- `components/Modal.tsx` - кастомные модалки.
- `components/ToastHost.tsx` и `useToasts.ts` - toast-alerting.
- `components/AmbientCubes.tsx` - декоративный слой фоновых кубов и частиц, все изображения/формы задаются кодом.

### Notes Feature

- `features/notes/useNotesWorkspace.ts` - загрузка дерева, выбранная заметка, draft, CRUD, drag-and-drop move.
- `features/notes/Sidebar.tsx` - дерево, поиск, переключение на меню, настройки, выход.
- `features/notes/NotesTree.tsx` - рекурсивное дерево, inline rename, delete, drag-and-drop.
- `features/notes/Topbar.tsx` - шапка заметки.
- `features/notes/useAppShortcuts.ts` - глобальные hotkeys и список подсказок.

### Editor

- `editor/useNotebookEditor.ts` - создание Tiptap editor.
- `editor/lowlight.ts` - lowlight instance с явным набором highlight.js grammars под поддерживаемые языки вместо импорта всего набора `all`.
- `editor/RichTextToolbar.tsx` - toolbar редактора.
- `editor/CodeBlockView.tsx` - кастомный code block: язык, форматирование, нумерация строк.
- `editor/editorCode.ts` - форматирование code block и selection-логика.
- `editor/copyFieldLabels.ts` - labels для copy fields.
- `editor/CopyField.tsx` - атомарное поле копирования, secret-маскирование, генерация пароля.
- `editor/CopyFieldKindMenu.tsx` - compact type menu.
- `editor/EditorLinkTooltip.tsx` - tooltip ссылок в режиме редактирования.

`Ctrl+A` внутри code block перехватывается в node-view и в `editorProps.handleKeyDown`, поэтому выделяет только текст кода.

### Admin Feature

- `features/admin/AdminPanel.tsx` - контейнер админки, загружается через `React.lazy()` только при открытии панели администратора.
- `features/admin/ActivityColumnFilter.tsx` - portal-фильтр таблицы истории.
- `features/admin/adminFilters.ts` - типы и empty state фильтров.

Админка показывает:

- вкладку пользователей;
- вкладку истории действий;
- вкладку статистики.

## Frontend Code Splitting

Frontend использует route/code splitting через `React.lazy()` и `Suspense`:

- стартовый bundle содержит auth/login, базовые UI-компоненты и toast;
- рабочая область `AuthenticatedApp` загружается отдельным chunk только после авторизации;
- Tiptap editor, lowlight и notes workspace не попадают в login bundle;
- `AdminPanel` загружается отдельным chunk только при переходе в панель администратора.
- `vite.config.ts` дополнительно выделяет `editor-vendor`, `code-languages`, `icons` и общий `vendor` через `manualChunks`, чтобы тяжелые зависимости редактора и grammar-файлы не склеивались с прикладным кодом.
- Подсветка кода импортирует только нужные grammars highlight.js; языки без отдельной grammar продолжают уходить в auto/plain fallback.

Fallback для lazy-загрузки использует существующий компактный loader, поэтому поведение UI не меняется.

## Дизайн

- Есть светлая и темная темы.
- Токены цветов, размеров, радиусов, motion и z-index централизованы в `styles.css`.
- Базовая типографика вынесена в `--font-sans`; интерфейс использует стек `Aptos` / `Segoe UI Variable` / `Segoe UI` без внешней загрузки шрифтов.
- Основной фон светлой темы задан спокойным холодным почти-белым токеном `--bg`, чтобы панели и декоративные элементы не спорили с рабочей областью.
- Основной фон темной темы задан глубоким индиго-графитовым токеном `--bg`, без цветных фоновых слоев.
- Основной рабочий блок и sidebar используют отдельный `--layout-shadow`: плотную тонкую тень справа и снизу, подобранную близко к фону темы; остальные элементы остаются без теней.
- Light theme отдельно усиливает `--cube-line`, `--cube-fill`, `--cube-spark` и opacity/stroke декоративных SVG-кубов, чтобы они не терялись на светлом фоне.
- Native `alert`, `prompt`, `confirm` не используются.
- Dropdown, tooltip, modal и toast кастомные.
- Tooltip и dropdown рендерятся через portal, чтобы не обрезаться родительскими overflow.
- Изображения документации и дизайн-референсы лежат только в `docs/images`.

## Runtime Данные

Не являются исходниками:

- `*.sqlite`
- `*.sqlite-wal`
- `*.sqlite-shm`
- `*.tsbuildinfo`
- `test-results`
- `dist`
- `public`
