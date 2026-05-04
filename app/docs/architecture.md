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

- `AppModule` - подключает `ConfigModule`, `ServeStaticModule`, `AuthModule`, `AdminModule`, `AiModule`, `DatabaseModule`, `NotesModule`, `HealthController`.
- `DatabaseModule` - singleton `DatabaseService` and shared `AttachmentFilesService`.
- `AuthModule` - login, token verification, текущий пользователь, preferences.
- `NotesModule` - CRUD и move заметок текущего пользователя.
- `WorkspaceModule` - теги, корзина, версии, шаблоны, экспорт/импорт, вложения и публичные ссылки.
- Backend увеличивает JSON body limit до 30 MB для base64-загрузки вложений; бизнес-лимит размера файла задается `MAX_UPLOAD_SIZE_MB`.
- `AdminModule` - пользователи, история действий и статистика; агрегаты статистики вынесены в `AdminStatsService`.
- `ActivityModule` - запись и чтение audit-событий.
- `AiModule` - изолированный AI-слой: настройки provider, шифрование AI API key, синхронизация моделей, chat gateway через OpenAI-compatible API и tool registry для действий с заметками.

### Конфигурация

`ConfigModule.forRoot({ isGlobal: true })` читает `.env`.

Ключевые env:

- `PORT`
- `DB_PATH`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `AUTH_SECRET`
- `AUTH_TOKEN_TTL_SECONDS`
- `SECRET_ENCRYPTION_KEY`
- `AI_CREDENTIALS_ENCRYPTION_KEY`
- `UPLOAD_DIR`
- `MAX_UPLOAD_SIZE_MB`
- `ALLOWED_UPLOAD_EXTENSIONS`

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
- удаляет устаревшие колонки снятых функций при старте, если текущая SQLite поддерживает `ALTER TABLE ... DROP COLUMN`;
- создает seed-admin, если таблица `users` пустая;
- создает welcome note, если таблица `notes` пустая.

## SQLite Схема

### `users`

| Поле            | Тип                                 | Описание           |
| --------------- | ----------------------------------- | ------------------ |
| `id`            | `INTEGER PRIMARY KEY AUTOINCREMENT` | ID                 |
| `username`      | `TEXT NOT NULL UNIQUE`              | Логин              |
| `password_hash` | `TEXT NOT NULL`                     | PBKDF2 hash        |
| `role`          | `TEXT NOT NULL DEFAULT 'user'`      | `user` или `admin` |
| `language`      | `TEXT NOT NULL DEFAULT 'ru'`        | `ru` или `en`      |
| `theme`         | `TEXT NOT NULL DEFAULT 'dark'`      | `light` или `dark` |
| `last_login_at` | `TEXT`                              | Последний вход     |
| `created_at`    | `TEXT NOT NULL`                     | Создание           |
| `updated_at`    | `TEXT NOT NULL`                     | Обновление         |

### `notes`

| Поле            | Тип                                                       | Описание             |
| --------------- | --------------------------------------------------------- | -------------------- |
| `id`            | `INTEGER PRIMARY KEY AUTOINCREMENT`                       | ID                   |
| `user_id`       | `INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE` | Владелец             |
| `name`          | `TEXT NOT NULL`                                           | Название             |
| `content_html`  | `TEXT NOT NULL DEFAULT ''`                                | HTML редактора       |
| `content_text`  | `TEXT NOT NULL DEFAULT ''`                                | Plain text           |
| `parent_id`     | `INTEGER REFERENCES notes(id) ON DELETE CASCADE`          | Родительская заметка |
| `position`      | `INTEGER NOT NULL DEFAULT 0`                              | Позиция              |
| `is_favorite`   | `INTEGER NOT NULL DEFAULT 0`                              | Избранное            |
| `is_pinned`     | `INTEGER NOT NULL DEFAULT 0`                              | Закрепление          |
| `deleted_at`    | `TEXT`                                                    | Soft delete          |
| `deleted_by`    | `INTEGER REFERENCES users(id) ON DELETE SET NULL`         | Кто удалил           |
| `delete_reason` | `TEXT`                                                    | Причина удаления     |
| `created_at`    | `TEXT NOT NULL`                                           | Создание             |
| `updated_at`    | `TEXT NOT NULL`                                           | Обновление           |

Индексы:

- `idx_notes_user_parent`
- `idx_notes_position`
- `idx_notes_user_deleted`

### Дополнительные Таблицы Workspace

- `tags` и `note_tags` - глобальные теги пользователя и связь заметка-тег.
- `note_versions` - версии заметок перед изменением; хранится максимум 80 последних версий на заметку, старые записи подчищаются автоматически, а при удалении заметки связанные версии удаляются явно.
- `note_templates` - пользовательские и системные шаблоны.
- `attachments` - метаданные файлов аккаунта: `note_id` может быть `NULL`, `user_id` всегда владелец файла, имя, MIME type, размер и `storage_path`; сами файлы лежат в `UPLOAD_DIR`. Связь с заметкой опциональная и использует `ON DELETE SET NULL`, поэтому окончательное удаление заметки отвязывает файлы, но не удаляет их. Физическая очистка файлов централизована в `AttachmentFilesService`; недоступные файлы логируются warning-сообщением и не ломают удаление записи из БД.
- `share_links` - временные публичные ссылки с hash токена и публичным URL для повторного копирования активной ссылки.
- `share_link_access_logs` - история открытий публичных ссылок.
- `note_fts` - SQLite FTS5 virtual table для полнотекстового поиска.
- `ai_user_settings` - AI-настройки пользователя: enable flag, provider/base URL/model, зашифрованный API key, безопасная маска ключа и состояние проверок/синхронизации.
- `ai_provider_models` - модели, доступные конкретному пользователю и provider/key после синхронизации; старые модели помечаются `is_deprecated`, `provider_created_at` хранит `created` из provider, если оно пришло.
- `ai_audit_logs` - отдельная таблица будущего расширенного журнала tool-действий AI; текущие выполнения инструментов пишутся в `activity_logs` как `ai.tool.execute`.

### `activity_logs`

| Поле          | Тип                                               | Описание      |
| ------------- | ------------------------------------------------- | ------------- |
| `id`          | `INTEGER PRIMARY KEY AUTOINCREMENT`               | ID            |
| `actor_id`    | `INTEGER REFERENCES users(id) ON DELETE SET NULL` | Кто сделал    |
| `user_id`     | `INTEGER REFERENCES users(id) ON DELETE SET NULL` | Кого касается |
| `action`      | `TEXT NOT NULL`                                   | Код действия  |
| `target_type` | `TEXT NOT NULL`                                   | Тип цели      |
| `target_id`   | `INTEGER`                                         | ID цели       |
| `details`     | `TEXT NOT NULL DEFAULT '{}'`                      | JSON details  |
| `created_at`  | `TEXT NOT NULL`                                   | Время         |

Индексы:

- `idx_activity_created`
- `idx_activity_user`
- `idx_activity_actor`

Для активных публичных ссылок используется индекс `idx_share_links_active`.

## Backend Services

### `NotesService`

Отвечает за заметки текущего пользователя:

- `getTree(userId)`;
- `getById(userId, id)`;
- `create(userId, dto)`;
- `update(userId, id, dto)`;
- `move(userId, id, dto)`;
- `delete(userId, id)`.
- `listTrash(userId)`;
- `restore(userId, id)`;
- `permanentDelete(userId, id)`;
- `listVersions(userId, noteId)`;
- `restoreVersion(userId, noteId, versionId)`;
- `listTags(userId)`;
- `createTag(userId, name)`;
- `deleteTag(userId, tagId)`;
- `updateTags(userId, noteId, tags)`;
- `search(userId, query)`;
- `rebuildSearchIndex(userId)`.

Все операции проверяют ownership через `user_id`. Move запрещает перенос в самого себя и в потомка.
Окончательное удаление заметки получает все дочерние записи одним recursive CTE и выполняет очистку версий, отвязку вложений, удаление записи и очистку FTS в одной транзакции.

### `WorkspaceService`

Отвечает за функции, которые не являются базовым CRUD заметки:

- шаблоны заметок;
- экспорт JSON в файл с зашифрованными `data-value` для secret/password/token copy fields;
- импорт JSON из файла с восстановлением тегов, избранного, закрепления и parent-связей;
- вложения и файловое хранилище: глобальный список файлов аккаунта, загрузка, привязка/отвязка к заметкам, список файлов заметки, переименование, скачивание, удаление и ZIP-архив без хранения бинарного содержимого в SQLite;
- временные публичные ссылки.

### `SecretFieldCryptoService`

Шифрует и расшифровывает `data-value` у secret/password/token copy fields. Используется при сохранении и чтении заметок и шаблонов.

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
- `ai.settings.update`;
- `ai.chat`;
- `ai.tool.execute`;
- `admin.user.create`;
- `admin.user.update`;
- `admin.user.delete`.

`list(limit)` нормализует limit в диапазон `1..200`.

### `AiService`

Отвечает за AI-настройки текущего пользователя:

- `getSettings(userId)`;
- `updateSettings(userId, dto)`;
- `syncModels(userId)`;
- `testConnection(userId)`;
- `chat(userId, dto)`;
- `executeAction(userId, dto)`.

Сервис работает через `DatabaseService`, `AiCryptoService`, `AiToolsService` и `ActivityService`.
Вызовы моделей идут через OpenAI-compatible HTTP API:

- `GET <baseUrl>/models` для синхронизации;
- `POST <baseUrl>/chat/completions` для чата.

Chat-запрос отправляется без `temperature`, чтобы один и тот же gateway работал с GPT-5/reasoning моделями и OpenAI-compatible providers, которые не принимают sampling-параметры для части моделей. Служебная инструкция идет как `developer` message вместо `system`, что корректнее для новых OpenAI моделей в Chat Completions. Ошибка provider нормализуется в короткий `BadRequestException` без токенов и секретов.

Если модель возвращает tool-call, `AiService` передает его в `AiToolsService`. Readonly tools выполняются сразу, а мутации возвращаются в UI как preview-действия и выполняются только через `POST /api/ai/actions/execute` после подтверждения пользователя. Backend не перехватывает команды локальными парсерами: модель сама читает текущий контекст, выбирает tool и формирует полный `contentHtml/contentText`.

После синхронизации `AiService` пересчитывает локальные `score`, `speedScore`, `valueScore` и `sortRank` для каждой модели. Эти значения не приходят как готовый рейтинг от provider: frontend показывает только цветовую полоску эффективности, а `sortRank` использует для порядка моделей. `sortRank` учитывает семейство модели и `provider_created_at`, чтобы новые версии шли выше старых.

`baseUrl` валидируется как HTTPS URL. API key не логируется и не возвращается клиенту.

### `AiToolsService`

Изолированный registry действий Notes AI. Сервис использует существующие `NotesService` и `WorkspaceService`, поэтому ownership и роли остаются на том же backend-слое, что и у обычного UI.

Поддержанные tools:

- `notes.search`;
- `notes.read`;
- `notes.create`;
- `notes.update`;
- `notes.tags.set`;
- `notes.favorite.set`;
- `notes.pinned.set`;
- `notes.delete`;
- `notes.restore`;
- `templates.list`;
- `templates.createNote`;
- `versions.list`;
- `versions.restore`;
- `attachments.list`;
- `shareLinks.create`.

Имена tool-calls для provider отправляются в безопасном формате с `_`, а внутри приложения мапятся обратно в dotted names.

### `AiCryptoService`

Шифрует AI API key через AES-256-GCM и env `AI_CREDENTIALS_ENCRYPTION_KEY`.
Полный ключ расшифровывается только на время запроса к provider.

## Frontend

### Основные файлы

- `src/App.tsx` - легкий bootstrap/auth слой: login screen, guest theme/language, toast-host и lazy-загрузка рабочей области после входа.
- `features/app/AuthenticatedApp.tsx` - рабочая область после авторизации: notes workspace, editor, sidebar, модалки заметок и lazy-загрузка админки.
- `features/ai/AiAssistant.tsx` - изолированный AI widget: плавающая кнопка, чат, настройки provider и карточки подтверждения AI-действий.
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
- `features/notes/Sidebar.tsx` - дерево, поиск, быстрый фильтр избранного, кнопка-фильтр тегов с portal-меню, верхний список быстрых ссылок на закрепленные заметки, переключение на меню, настройки, выход.
- `features/notes/NotesTree.tsx` - рекурсивное дерево, inline rename, delete, drag-and-drop.
- `features/notes/Topbar.tsx` - шапка заметки, ellipsis названия и активные индикаторы избранного, закрепления и тегов перед названием.
- `features/notes/NoteHeaderMenu.tsx` - меню действий в шапке: icon-кнопки избранного, закрепления, сохранения и удаления, поиск, создание, inline-редактирование и удаление глобальных тегов.
- `features/notes/useAppShortcuts.ts` - глобальные hotkeys и список подсказок.
- `features/notes/NoteToolPanels.tsx` - компактные панели заметки: корзина, версии, шаблоны, ссылки доступа и файловый менеджер вложений.
- `features/notes/attachmentsPanel.helpers.tsx` - общие чистые функции вложений: тип preview, иконки файлов, размер, base64, скачивание и ограничения окна просмотра.
- `features/notes/AttachmentOverlays.tsx` - overlay-компоненты вложений: плавающее окно просмотра файла и меню действий файла. `NoteToolPanels.tsx` оставляет бизнес-логику загрузки/удаления/переименования, а разметка overlay вынесена отдельно.
- `features/app/jsonBackup.ts` - runtime-валидация JSON backup и скачивание export-файла.
- `features/share/PublicSharePage.tsx` - публичная страница `/share/<token>` без авторизации: показывает только содержимое заметки в preview-стиле.

### Editor

- `editor/useNotebookEditor.ts` - создание Tiptap editor.
- `editor/lowlight.ts` - lowlight instance с явным набором highlight.js grammars под поддерживаемые языки вместо импорта всего набора `all`.
- `editor/RichTextToolbar.tsx` - toolbar редактора и верхнее меню действий заметки.
- `editor/CodeBlockView.tsx` - кастомный code block: язык, форматирование, нумерация строк.
- `editor/editorCode.ts` - форматирование code block и selection-логика.
- `editor/copyFieldLabels.ts` - labels для copy fields.
- `editor/CopyField.tsx` - атомарное поле копирования, secret-маскирование, генерация пароля.
- `editor/CopyFieldKindMenu.tsx` - compact type menu.
- `editor/EditorLinkTooltip.tsx` - tooltip ссылок в режиме редактирования.

`Ctrl+A` внутри code block перехватывается в node-view и в `editorProps.handleKeyDown`, поэтому выделяет только текст кода.

### Admin Feature

- `features/admin/AdminPanel.tsx` - контейнер админки, загружается через `React.lazy()` только при открытии панели администратора.
- `features/admin/AdminUserCard.tsx` - строка редактирования пользователя.
- `features/admin/AdminCreateUserModal.tsx` - модалка создания пользователя.
- `features/admin/AdminStatsView.tsx` - вся вкладка статистики и локальные вычисления графиков.
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
- Инструменты заметки встроены в рабочий chunk редактора и больше не используют отдельное общее окно инструментов.
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
