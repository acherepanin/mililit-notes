# Архитектура

## Общая Схема

Приложение разделено на два TypeScript-проекта:

- `app/back` - NestJS backend, SQLite, REST API, auth, роли, админские операции, отдача frontend-статики.
- `app/front` - React + Vite SPA, React Router, Tiptap editor, дерево заметок, админ-панель, личный кабинет, подписки, темы и локализация.

Production-поток:

1. `app/front` собирается в `app/back/public`.
2. `app/back` компилируется в `app/back/dist`.
3. NestJS отдает `/api/*` и статический frontend с одного порта.

## Backend

### Модули

- `AppModule` - подключает `ConfigModule`, `ServeStaticModule`, `AuthModule`, `SubscriptionsModule`, `AdminModule`, `MonitoringModule`, `AiModule`, `DatabaseModule`, `NotesModule`, `HealthController`.
- `DatabaseModule` - singleton `DatabaseService` and shared `AttachmentFilesService`.
- `AuthModule` - login, register, token verification, профиль, пароль, текущий пользователь, preferences; глобальный `AuthGuard` через `APP_GUARD`, публичные routes помечаются `@Public()`.
- `SubscriptionsModule` - тарифы, активные подписки, mock checkout, `EntitlementsService` (AI, файлы, лимит хранилища; admin bypass).
- `NotesModule` - CRUD и move заметок текущего пользователя.
- `WorkspaceModule` - теги, корзина, версии, шаблоны, экспорт/импорт, вложения и публичные ссылки.
- Backend увеличивает JSON body limit до 30 MB для base64-загрузки вложений; бизнес-лимит размера файла задается `MAX_UPLOAD_SIZE_MB`.
- `AdminModule` - пользователи и статистика; агрегаты статистики вынесены в `AdminStatsService`.
- `MonitoringModule` - глобальный interceptor, in-memory метрики, persistent error log и admin API `/admin/monitoring/*`.
- `ActivityModule` - запись и чтение audit-событий.
- `AiModule` - изолированный AI-слой: настройки provider, шифрование AI API key, синхронизация моделей, локальный каталог моделей, chat gateway через OpenAI-compatible API, tool registry для действий с заметками и runtime Telegram/VK webhook-ботов.

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
- `AI_MODEL_CATALOG_URL`
- `AI_TRANSCRIPTION_MODEL`
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
- `share_links` - временные публичные ссылки с hash токена, публичным URL для повторного копирования активной ссылки, флагом показа секретов и optional one-time лимитом открытий через `max_access_count`/`access_count`.
- `share_link_access_logs` - история открытий публичных ссылок.
- `note_fts` - SQLite FTS5 virtual table для полнотекстового поиска.
- `ai_user_settings` - активное состояние Notes AI пользователя: enable flag, доступ к секретам, дневные лимиты запросов/токенов и текущая пара provider/base URL.
- `ai_provider_settings` - per-provider настройки пользователя: model, зашифрованный API key, безопасная маска ключа и состояние проверок/синхронизации для каждой пары `provider_name` + `base_url`.
- `ai_provider_models` - модели, доступные конкретному пользователю и provider/key после синхронизации; старые модели помечаются `is_deprecated`, `provider_created_at` хранит `created` из provider, если оно пришло. Для известных OpenAI-моделей сохраняются `input_price_per_1m`, `cached_input_price_per_1m`, `output_price_per_1m`; неизвестные цены остаются `NULL`.
- `ai_model_catalog` - локальный справочник сигналов моделей: builtin seed и optional remote JSON из `AI_MODEL_CATALOG_URL`. Хранит `score`, `speed_score`, `value_score`, `sort_rank`, tier/quality/speed/cost, цены за 1 миллион токенов, capabilities, source и `last_seen_at`. Используется как общий fallback для всех пользователей и provider-списков.
- `ai_audit_logs` - отдельный расширенный журнал tool-действий Notes AI. Пишутся readonly и mutation tool-вызовы без сырого payload и без секретных значений; общий `activity_logs` по-прежнему хранит пользовательские события `ai.settings.update`, `ai.chat`, `ai.tool.execute`.
- `ai_usage_logs` - учет AI-запросов и input/output tokens по пользователю, provider и модели для дневных лимитов, пользовательской месячной статистики и admin-отчета по расходам.
- `ai_note_embeddings` - кэш embeddings для `notes.semanticSearch`: хранит provider/base URL/model, hash текстового снимка заметки и JSON-вектор. При изменении заметки hash меняется и вектор перестраивается при следующем смысловом поиске.
- `ai_bot_admin_settings` - глобальные admin-настройки Telegram/VK ботов: включение, webhook/callback URL, encrypted tokens/secrets, политика секретов, подтверждения, общий лимит сообщений, лимит readonly-tool вызовов, лимит mutation-действий и статус последней проверки.
- `ai_bot_user_settings` - пользовательские разрешения для ботов: включение, режим `read/write`, доступ к секретам, матрица permission-флагов по tool-группам, личные лимиты сообщений/read/write и привязанный внешний user/chat id.
- `ai_bot_link_codes` - одноразовые hash-коды привязки Telegram/VK аккаунтов с TTL. Новый код удаляет старые коды того же пользователя/provider; активная коллизия по provider/hash проверяется до вставки.
- `ai_bot_pending_actions` - ожидающие подтверждения mutation-действия из Telegram/VK runtime. Хранит только имя tool и JSON payload, очищается по TTL при следующем подтверждении.
- `ai_bot_usage_logs` - дневной учет использования Telegram/VK ботов по `provider` и типам `message`, `read`, `write`. Используется для раздельных лимитов сообщений, чтения и изменений; записи удаляются каскадно при удалении пользователя.

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
- `idx_activity_action_created`
- `idx_ai_usage_logs_created_user`
- `idx_ai_bot_usage_logs_created`

### `request_error_logs`

| Поле          | Тип                                               | Описание                         |
| ------------- | ------------------------------------------------- | -------------------------------- |
| `id`          | `INTEGER PRIMARY KEY AUTOINCREMENT`               | ID                               |
| `user_id`     | `INTEGER REFERENCES users(id) ON DELETE SET NULL` | Пользователь запроса             |
| `method`      | `TEXT NOT NULL`                                   | HTTP-метод                       |
| `path`        | `TEXT NOT NULL`                                   | Нормализованный путь без query   |
| `status_code` | `INTEGER NOT NULL`                                | HTTP-код                         |
| `message`     | `TEXT`                                            | Сообщение ошибки (до 2000 симв.) |
| `error_name`  | `TEXT`                                            | Имя класса ошибки                |
| `error_body`  | `TEXT NOT NULL DEFAULT '{}'`                      | JSON-тело с редактированием      |
| `duration_ms` | `INTEGER NOT NULL`                                | Время обработки                  |
| `created_at`  | `TEXT NOT NULL`                                   | Время                            |

Записи старше 90 дней удаляются при старте сервиса. 401/404 и частые UI-запросы не сохраняются.

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
- экспорт JSON в файл с зашифрованными `data-value` для secret/password/token полей данных;
- импорт JSON из файла с восстановлением тегов, избранного, закрепления и parent-связей;
- вложения и файловое хранилище: глобальный список файлов аккаунта, загрузка, привязка/отвязка к заметкам, список файлов заметки, переименование, скачивание, удаление и ZIP-архив без хранения бинарного содержимого в SQLite;
- временные публичные ссылки.

Экспорт JSON загружает теги заметок batch-запросом по всем note ids, без N+1 запросов на каждую заметку. Импорт JSON выполняется в SQLite-транзакции: если одна из заметок, связей или шаблонов не проходит валидацию/запись, частично импортированное состояние не остается.

### `SecretFieldCryptoService`

Шифрует и расшифровывает `data-value` у secret/password/token полей данных. Используется при сохранении и чтении заметок и шаблонов.

### `AdminService`

Отвечает за:

- список пользователей с `notesCount`;
- создание пользователя;
- изменение роли и пароля;
- удаление пользователя;
- статистику.

Backend не дает удалить собственный admin-аккаунт и не дает оставить систему без единого admin.

### `MonitoringModule`

Глобальный `MonitoringInterceptor` собирает метрики запросов и ошибки:

- `RequestMetricsService` — in-memory сэмплы (7 дней, до 12 000 записей) для `/admin/monitoring/performance`;
- `RequestErrorLogService` — persistent-лог в `request_error_logs` (90 дней, редактирование чувствительных полей);
- `MonitoringService` — агрегация actions/subscriptions/errors/performance для admin API.

Admin endpoints: `/api/admin/monitoring/actions`, `/subscriptions`, `/errors`, `/performance`. Все защищены `AdminGuard`.

События подписок в actions исключаются (`subscription.*`); отдельный SQL-union по `subscription_orders` и `user_subscriptions` питает вкладку subscriptions.

### `ActivityService`

Записывает важные события:

- `auth.login`;
- `notes.create`;
- `notes.update`;
- `notes.move`;
- `notes.delete`;
- `notes.delete_all`;
- `ai.settings.update`;
- `ai.chat`;
- `ai.tool.execute`;
- `ai.bot.settings.update`;
- `ai.bot.connection.check`;
- `ai.bot.message`;
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
- `chat(userId, dto, options)`;
- `executeAction(userId, dto)`.

Сервис работает через `DatabaseService`, `AiCryptoService`, `AiModelCatalogService`, `AiToolsService` и `ActivityService`.
Вызовы моделей идут через OpenAI-compatible HTTP API:

- `GET <baseUrl>/models` для синхронизации;
- `POST <baseUrl>/chat/completions` для чата.
- `POST <baseUrl>/embeddings` для смыслового поиска `notes.semanticSearch`.

Chat-запрос отправляется без `temperature`, чтобы один и тот же gateway работал с GPT-5/reasoning моделями и OpenAI-compatible providers, которые не принимают sampling-параметры для части моделей. Служебная инструкция идет как `developer` message вместо `system`, что корректнее для новых OpenAI моделей в Chat Completions. Ошибка provider нормализуется в короткий `BadRequestException` без токенов и секретов.

Расчет стоимости Notes AI строится из raw usage, а не из сохраненных денежных итогов: backend берет строки `ai_usage_logs`, сопоставляет модель с ценой за 1 миллион токенов из `ai_provider_models`, `ai_model_catalog` или локального fallback-каталога `ai-pricing.ts`, а неизвестные цены оставляет как `null`. Поэтому месячная статистика пользователя и admin-статистика показывают известную часть суммы и отдельный признак неизвестной цены.

Если модель возвращает tool-call, `AiService` передает его в `AiToolsService`. Readonly tools выполняются сразу. Мутации возвращаются в UI как preview-действия и выполняются через `POST /api/ai/actions/execute`, когда `requireActionConfirmation=true`; если пользователь выключил подтверждение в настройках Notes AI, `AiService` сразу выполняет mutation-действия и возвращает результаты в `executions[]`. Ошибка подготовки tool-call и ошибка одного auto-execute действия возвращаются текстом в ответе чата, а не валят весь `/api/ai/chat`. Backend не перехватывает команды локальными парсерами: модель сама читает текущий контекст, выбирает tool и формирует полный `contentHtml/contentText`.
Bot runtime вызывает тот же `chat` и `executeAction`, но передает `allowReadSecretsOverride` и `allowedToolNames`. Так Telegram/VK применяет более строгую политику секретов и матрицу прав поверх обычных UI-настроек Notes AI. `AiService` отправляет provider только разрешенные tools, а `AiToolsService` повторно отклоняет disallowed tool-call или pending action перед выполнением.

После синхронизации `AiService` делегирует классификацию моделей в `AiModelCatalogService`: сервис каталога отдает `score`, `speedScore`, `valueScore`, `tier`, `quality`, `speed`, `cost` и общий `sortRank`, а также вычисляет fallback для неизвестных моделей. Эти значения не приходят как готовый рейтинг от provider: frontend показывает только цветовую полоску эффективности, а `sortRank` использует для порядка моделей. `sortRank` учитывает семейство модели и `provider_created_at`, чтобы новые версии шли выше старых.

`baseUrl` валидируется как HTTPS URL. API key не логируется и не возвращается клиенту.

### `AiModelCatalogService`

Отвечает за общий справочник моделей:

- при старте заполняет `ai_model_catalog` builtin-сигналами известных моделей;
- раз в 24 часа пробует обновиться из `AI_MODEL_CATALOG_URL`, если переменная задана;
- поддерживает ручной admin-sync через `POST /api/ai/models/catalog/sync`;
- ищет точное совпадение модели или ближайший prefix-match для provider id вида `openai/gpt-5.2`;
- отдает `score`, `speedScore`, `valueScore`, `sortRank`, capabilities и цены для `AiService`;
- держит короткий in-memory cache для точных/prefix lookup, чтобы список моделей и расчеты стоимости не сканировали таблицу повторно на каждом запросе;
- инвалидирует cache после builtin/remote upsert каталога;
- remote JSON нормализуется на входе, поэтому неизвестные или некорректные поля не ломают синхронизацию.

### `AiToolsService`

Изолированный registry действий Notes AI. Сервис использует существующие `NotesService` и `WorkspaceService`, поэтому ownership и роли остаются на том же backend-слое, что и у обычного UI.

Поддержанные tools:

- `notes.search`;
- `notes.semanticSearch`;
- `notes.read`;
- `notes.create`;
- `notes.createNestedBatch`;
- `notes.update`;
- `notes.tags.set`;
- `notes.autotag`;
- `notes.favorite.set`;
- `notes.pinned.set`;
- `notes.delete`;
- `notes.deleteAll`;
- `notes.restore`;
- `templates.list`;
- `templates.createNote`;
- `versions.list`;
- `versions.restore`;
- `attachments.list`;
- `attachments.attachToNote`;
- `shareLinks.create`;
- `admin.users.list`;
- `admin.stats.read`.

Имена tool-calls для provider отправляются в безопасном формате с `_`, а внутри приложения мапятся обратно в dotted names.
Каждый выполненный readonly/mutation tool дополнительно фиксируется в `ai_audit_logs`: сохраняются имя действия, режим, целевой `noteId`, если он есть, и технические ключи payload без содержимого заметок, токенов, паролей и API-ключей.

`AiToolsService` принимает `noteId` как основной идентификатор заметки. Для устойчивости к provider/tool-call особенностям backend также принимает alias `id` и числовые строки, но developer prompt всегда должен передавать модели текущую заметку как `noteId=<number>` и требовать использовать именно `noteId` в payload.
`notes.create` принимает optional `parentId` для дочерних заметок. В prompt закреплено, что заметка может быть одновременно текстовой записью и родителем других заметок; для команд “создай внутри/под текущей/в подзаметке” модель должна передавать `parentId`, а не менять контент родителя.
`notes.createNestedBatch` закрывает массовые команды по дереву без пустого поиска и без десятков отдельных tool-calls. Для `scope=allActiveNotes` `NotesService` берет снимок активных заметок до создания новых записей, затем создает direct children и nested children, ограничивая batch максимумом 300 новых заметок. Для продолжения предыдущих batch-команд есть `scope=recentNamedNotes`: backend выбирает последние заметки текущего пользователя по `parentNames`, optional `expectedParentCount` и окну `recentWithinMinutes`, чтобы модель могла продолжить работу с новыми `Вложение 1`/`Вложение 2` без ручного перечисления всех id.
`attachments.attachToNote` переиспользует `WorkspaceService.attachAttachmentToNote`, поэтому проверка владельца файла и целевой заметки остается общей с обычным UI. `admin.users.list` и `admin.stats.read` дополнительно проверяют роль пользователя в backend и доступны только `admin`.

### `AiEmbeddingsService`

Отвечает только за смысловой поиск Notes AI:

- берет текущие provider/base URL/API key пользователя из AI-настроек;
- выбирает embedding model: если выбранная модель уже похожа на embeddings-модель, использует ее, иначе применяет `text-embedding-3-small`;
- отправляет в embeddings-provider до 300 последних активных заметок пользователя и поисковый запрос;
- кэширует vectors в `ai_note_embeddings` по `content_hash`;
- не отправляет secret/password/token значения в embeddings, если доступ к секретам выключен;
- пишет token usage embeddings-запросов в `ai_usage_logs`;
- при ошибке provider возвращает fallback обычного `NotesService.search`, чтобы чат не ломался.

### `AiCryptoService`

Шифрует AI API key через AES-256-GCM и env `AI_CREDENTIALS_ENCRYPTION_KEY`.
Полный ключ расшифровывается только на время запроса к provider.

### `AiBotRuntimeService`

Принимает входящие Telegram/VK webhook-сообщения через отдельный публичный controller без `AuthGuard`.
Сервис:

- проверяет включение общего бота и optional webhook secret;
- привязывает внешний аккаунт по одноразовому коду `XXXX-XXXX-XXXX-XXXX-XXXX` из `ai_bot_link_codes`;
- находит `ai_bot_user_settings` по `provider + linked_external_id`;
- применяет глобальные и пользовательские дневные лимиты bot-запросов: сообщения, readonly-tool вызовы и mutation-действия;
- для голосовых Telegram/VK сообщений скачивает аудио до 25 MB во временный memory-buffer, распознает его через `AiService.transcribeAudio` и передает расшифровку в тот же Notes AI pipeline; аудио не сохраняется на диск и не пишется в БД;
- отправляет текст в `AiService.chat`;
- выполняет readonly ответы сразу;
- для mutation actions проверяет `accessMode: write`, создает pending action на 10 минут и ждет команду `подтвердить` или `подтвердить <id>`;
- отправляет ответы через Telegram `sendMessage` или VK `messages.send`.

## Frontend

### Основные файлы

- `src/App.tsx` - `BrowserRouter`, публичные `/login`, `/register`, `/verify-email`, `/share/:token`, guard `RequireAuth` / `RequireAdmin`, lazy `AuthenticatedApp`.
- `routes/RequireAuth.tsx`, `routes/RequireAdmin.tsx` - защита маршрутов.
- `features/auth/RegisterPage.tsx`, `features/account/AccountPage.tsx` - регистрация и личный кабинет.
- `features/admin/AdminApp.tsx` - оболочка админки по `/admin/*`.
- `features/app/AuthenticatedApp.tsx` - рабочая область `/notes/*`: editor, sidebar, AI, модалки; без встроенной админки.
- `features/app/CommandPalette.tsx` - кастомная палитра быстрых команд `Ctrl+Shift+P` через portal: поиск, disabled-состояния, tooltip для длинных строк и запуск действий текущего workspace.
- `features/ai/AiAssistant.tsx` - изолированный AI widget: плавающая кнопка, чат, голосовой ввод через браузерный SpeechRecognition, настройки provider, переключатель подтверждения web-действий, пользовательские настройки Telegram/VK-ботов и карточки подтверждения AI-действий.
- `features/ai/AiBotAccessMenu.tsx` - dropdown пользовательских доступов Telegram/VK-ботов: режим работы, доступ к данным, действия, секреты и дневные лимиты.
- `features/ai/aiAssistant.helpers.ts` - чистые helpers AI-виджета: draft settings, provider presets, группировка/сортировка моделей и merge настроек Telegram/VK-ботов.
- `src/api.ts` - typed API client и Bearer token.
- `src/i18n.ts` - RU/EN словарь.
- `src/types.ts` - общие frontend-типы.
- `utils/formText.ts` - общие текстовые helpers форм, включая безопасный placeholder для сохраненных ключей без показа полного секрета.
- `utils/numberFormatting.ts` - общий формат tokens, USD, цен моделей и числовых лимитов для AI-чата, admin-интеграций и admin-статистики.
- `src/styles.css` - дизайн-токены, темы и компоненты.
- `public/favicon.ico` - фавиконка приложения; Vite копирует файл в корень `back/public` при сборке. В `index.html` ссылка с `?v=` для сброса кеша браузера после замены иконки.

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
- `editor/copyFieldLabels.ts` - labels для полей данных.
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
- `vite.config.ts` дополнительно выделяет `editor-vendor`, `code-vendor`, `icons` и общий `vendor` через `manualChunks`, чтобы тяжелые зависимости редактора и grammar-файлы не склеивались с прикладным кодом.
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

## Безопасность

- Все endpoints заметок, вложений, тегов, подписок и профиля scoped по `request.user.id` из Bearer token; подстановка чужого `userId` в URL не даёт доступ к данным.
- Глобальный `AuthGuard` защищает все API routes по умолчанию; публичные исключения: `GET /api/health`, `POST /api/auth/login`, `POST /api/auth/register`, `GET /api/auth/register/pending/:id`, `GET /api/auth/verify-email`, `GET /api/share/:token`, webhook Telegram/VK (`@Public()`).
- Публичная ссылка `/api/share/:token` отдаёт только одну заметку по токену; при `includeSecrets=false` маскируются секретные поля в `contentHtml` и `contentText`.
- `ValidationPipe` с `whitelist` и `forbidNonWhitelisted` на входе API.
- В production обязателен сильный `AUTH_SECRET`; mock checkout (`/api/subscription/checkout`) отключён, если не задан `ALLOW_MOCK_CHECKOUT=true`.
- Webhook Telegram/VK требуют настроенный secret; пустой secret отклоняется.
- Загрузка вложений ограничена расширениями и размером; файлы хранятся вне публичного каталога и отдаются через авторизованный endpoint.
- Notes AI mutation tools выполняются только после подтверждения пользователя в UI или боте; readonly tools не изменяют данные.
- Общие утилиты маскировки секретов: `app/back/src/common/secret-redaction.util.ts`.
