# Архитектура

## Общая Схема

```text
React/Vite frontend
  |
  | fetch /api/*
  v
NestJS backend
  |
  | better-sqlite3
  v
SQLite file
```

В production frontend собирается в `app/back/public`. NestJS:

- обслуживает API с глобальным префиксом `/api`;
- исключает `/api/{*path}` из static serving;
- отдает собранные frontend assets из `public`;
- создает SQLite-файл при старте, если его нет.

## Backend Модули

`AppModule` подключает:

- `ConfigModule.forRoot({ isGlobal: true })`;
- `ServeStaticModule` для `public`;
- `DatabaseModule`;
- `ActivityModule`;
- `AuthModule`;
- `AdminModule`;
- `NotesModule`;
- `HealthController`.

### DatabaseService

Файл: `app/back/src/infra/database.service.ts`

Ответственность:

- читает `DB_PATH` из `ConfigService`;
- если `DB_PATH` пустой, использует `join(process.cwd(), 'notes.sqlite')`;
- создает директорию для SQLite-файла;
- открывает `better-sqlite3`;
- включает `journal_mode = WAL`;
- включает `foreign_keys = ON`;
- запускает миграции;
- создает seed-admin, если пользователей нет;
- добавляет welcome-заметку для admin, если заметок нет.

Миграции совместимы с уже созданной БД:

- добавляют `users.role`, если колонки нет;
- добавляют `users.last_login_at`, если колонки нет;
- добавляют `notes.user_id`, если колонки нет;
- старые заметки без `user_id` привязываются к первому admin-пользователю.

### AuthModule

Файлы:

- `app/back/src/auth/auth.controller.ts`;
- `app/back/src/auth/auth.service.ts`;
- `app/back/src/auth/auth.guard.ts`;
- `app/back/src/auth/admin.guard.ts`;
- `app/back/src/auth/password.ts`.

Публичные методы:

- `POST /api/auth/login`;
- `GET /api/me`;
- `PATCH /api/me/preferences`.

`AuthService`:

- ищет пользователя по логину без учета регистра;
- проверяет пароль;
- обновляет `last_login_at`;
- пишет `auth.login` в `activity_logs`;
- подписывает HMAC-токен;
- проверяет подпись и срок действия токена;
- всегда перечитывает пользователя из БД при проверке токена.

`AuthGuard`:

- принимает только `Authorization: Bearer <token>`;
- вызывает `AuthService.verifyToken`;
- кладет пользователя в `request.user`.

`AdminGuard`:

- требует `request.user.role === 'admin'`;
- возвращает `403`, если роль не admin.

### NotesModule

Файлы:

- `app/back/src/notes/notes.controller.ts`;
- `app/back/src/notes/notes.service.ts`;
- `app/back/src/notes/notes.mapper.ts`;
- `app/back/src/notes/dto/*.ts`.

Все routes защищены `AuthGuard`.

Главный инвариант: каждый публичный метод принимает `userId` из токена и всегда добавляет `user_id = @userId` в SQL.

Методы сервиса:

- `getTree(userId)` - читает заметки текущего пользователя и собирает дерево.
- `getById(userId, id)` - возвращает одну заметку текущего пользователя.
- `create(userId, dto)` - проверяет parent внутри пользователя, создает заметку, пишет историю.
- `update(userId, id, dto)` - обновляет только заметку текущего пользователя, пишет историю.
- `move(userId, id, dto)` - проверяет parent и циклы внутри пользователя, пишет историю.
- `delete(userId, id)` - удаляет заметку текущего пользователя, потомки удаляются каскадно, пишет историю.
- `requireNote(userId, id)` - общая проверка существования и владения.
- `nextPosition(userId, parentId)` - вычисляет позицию внутри parent текущего пользователя.
- `isDescendant(userId, candidateId, ancestorId)` - защищает от циклов в дереве.

### AdminModule

Файлы:

- `app/back/src/admin/admin.controller.ts`;
- `app/back/src/admin/admin.service.ts`;
- `app/back/src/admin/admin.types.ts`;
- `app/back/src/admin/dto/create-user.dto.ts`;
- `app/back/src/admin/dto/update-user.dto.ts`.

Все routes защищены `AuthGuard` и `AdminGuard`.

Методы:

- `listUsers()` - список пользователей с количеством заметок.
- `createUser(actorId, dto)` - создает пользователя, роль по умолчанию `user`, пишет историю.
- `updateUser(actorId, id, dto)` - меняет только пароль и роль, пишет историю.
- `deleteUser(actorId, id)` - запрещает удалить себя, удаляет пользователя и его заметки, пишет историю.
- `listActivity(limit)` - возвращает историю.
- `getStats()` - агрегирует статистику.

Защитные правила:

- нельзя удалить собственный admin-аккаунт;
- нельзя понизить последнего администратора до `user`;
- логин проверяется на уникальность без учета регистра;
- неизвестные поля DTO запрещены глобальным `ValidationPipe`.

### ActivityModule

Файлы:

- `app/back/src/activity/activity.service.ts`;
- `app/back/src/activity/activity.types.ts`.

`ActivityService.record()` пишет важное событие в `activity_logs`.

`ActivityService.list(limit)`:

- ограничивает `limit` диапазоном `1..200`;
- при нечисловом значении использует `80`;
- присоединяет actor username и target user username;
- сортирует по `created_at DESC, id DESC`.

## SQLite Схема

### `users`

| Поле            | Тип                                 | Описание                  |
| --------------- | ----------------------------------- | ------------------------- |
| `id`            | `INTEGER PRIMARY KEY AUTOINCREMENT` | ID пользователя           |
| `username`      | `TEXT NOT NULL UNIQUE`              | Логин                     |
| `password_hash` | `TEXT NOT NULL`                     | Hash пароля               |
| `role`          | `TEXT NOT NULL DEFAULT 'user'`      | `user` или `admin`        |
| `language`      | `TEXT NOT NULL DEFAULT 'ru'`        | `ru` или `en`             |
| `theme`         | `TEXT NOT NULL DEFAULT 'dark'`      | `dark` или `light`        |
| `last_login_at` | `TEXT`                              | ISO-дата последнего входа |
| `created_at`    | `TEXT NOT NULL`                     | ISO-дата создания         |
| `updated_at`    | `TEXT NOT NULL`                     | ISO-дата обновления       |

### `notes`

| Поле           | Тип                                                       | Описание                |
| -------------- | --------------------------------------------------------- | ----------------------- |
| `id`           | `INTEGER PRIMARY KEY AUTOINCREMENT`                       | ID заметки              |
| `user_id`      | `INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE` | Владелец заметки        |
| `name`         | `TEXT NOT NULL`                                           | Название                |
| `content_html` | `TEXT NOT NULL DEFAULT ''`                                | HTML из Tiptap          |
| `content_text` | `TEXT NOT NULL DEFAULT ''`                                | Plain text              |
| `parent_id`    | `INTEGER REFERENCES notes(id) ON DELETE CASCADE`          | Родительская заметка    |
| `position`     | `INTEGER NOT NULL DEFAULT 0`                              | Порядок внутри родителя |
| `created_at`   | `TEXT NOT NULL`                                           | ISO-дата создания       |
| `updated_at`   | `TEXT NOT NULL`                                           | ISO-дата обновления     |

Индексы:

- `idx_notes_user_parent` по `(user_id, parent_id)`;
- `idx_notes_position` по `(user_id, parent_id, position, name)`.

### `activity_logs`

| Поле          | Тип                                               | Описание                        |
| ------------- | ------------------------------------------------- | ------------------------------- |
| `id`          | `INTEGER PRIMARY KEY AUTOINCREMENT`               | ID события                      |
| `actor_id`    | `INTEGER REFERENCES users(id) ON DELETE SET NULL` | Кто совершил действие           |
| `user_id`     | `INTEGER REFERENCES users(id) ON DELETE SET NULL` | Целевой пользователь, если есть |
| `action`      | `TEXT NOT NULL`                                   | Код действия                    |
| `target_type` | `TEXT NOT NULL`                                   | Тип цели: `user`, `note`        |
| `target_id`   | `INTEGER`                                         | ID цели                         |
| `details`     | `TEXT NOT NULL DEFAULT '{}'`                      | JSON-детали события             |
| `created_at`  | `TEXT NOT NULL`                                   | ISO-дата события                |

Индексы:

- `idx_activity_created` по `(created_at DESC, id DESC)`;
- `idx_activity_user` по `(user_id, created_at DESC)`.

## Frontend Архитектура

Ключевые файлы:

- `app/front/src/App.tsx` - главный контейнер приложения.
- `app/front/src/api.ts` - typed API client.
- `app/front/src/types.ts` - общие типы API.
- `app/front/src/i18n.ts` - RU/EN словари.
- `app/front/src/features/auth` - вход и auth hook.
- `app/front/src/features/notes` - дерево, topbar, workspace hook.
- `app/front/src/features/admin/AdminPanel.tsx` - панель администратора.
- `app/front/src/editor` - Tiptap editor, toolbar, code block node view, link tooltip, code helpers, copy field.
- `app/front/src/components` - общие UI-компоненты.

`App.tsx` держит:

- текущего пользователя;
- guest language/theme;
- выбранный режим workspace: `notes` или `admin`;
- Tiptap editor;
- режим редактора `Просмотр`/`Редактирование`;
- модалки удаления и ссылки;
- toast-alerting;
- hotkeys.

`Sidebar`:

- показывает компактный сайдбар с двумя режимами: дерево заметок и полноценное меню;
- кнопка переключения режимов стоит на месте бывшего логотипа слева от заголовка, поэтому отдельная кнопка дополнительного меню не используется;
- в режиме дерева показывает поиск, единую кнопку создания справа от поиска и дерево заметок;
- в режиме меню скрывает поиск/директории и показывает группы разделов (`Заметки`, `Панель администратора`) и настроек (`Тема`, `Язык`) в области дерева;
- в режиме меню использует компактные шрифты и иконки, не выводит правые статусы у разделов и показывает справа только значения темы/языка;
- для пунктов меню применяет `TooltipText`, поэтому tooltip появляется только при фактическом ellipsis-обрезании;
- создает заметку сразу с дефолтным названием, без модального окна: дочернюю для выделенной заметки или корневую при выделенном корне;
- выбирает корень кликом по свободной области дерева без визуального выделения области;
- позволяет переименовать заметку прямо в строке дерева через режим карандаш/сохранение;
- позволяет удалить заметку из строки дерева через отдельную правую иконку;
- переносит заметки в корень через drop в свободную область `tree-panel`; drop на конкретную строку дерева останавливает bubbling и переносит заметку в выбранного parent;
- подсвечивает статус заметок цветом иконки пункта `Заметки` и кнопки меню вместо отдельного нижнего индикатора;
- при клике по пункту `Заметки` из админки выбирает текущую или первую заметку через `selectFirstNote`, а при клике по конкретной строке дерева переводит workspace из `admin` в `notes`;
- переключает язык и тему через inline-меню сайдбара без portal/popup;
- открывает панель администратора, если `auth.user.role === 'admin'`;
- не является источником безопасности, backend все равно проверяет роль.

`AdminPanel`:

- загружает пользователей, историю и статистику параллельно;
- держит черновики редактирования только роли и нового пароля пользователя;
- отправляет ошибки и успехи в toast-host через callbacks;
- локализует action-коды истории.
- использует список компактных пользовательских строк вместо широкой таблицы;
- показывает логин существующего пользователя только для чтения;
- показывает логин в отдельном визуальном бейдже без дублирования роли под ним;
- прижимает управление ролью и паролем к левой части строки после короткого профиля;
- прижимает действия сохранения и удаления к правому краю строки;
- на mobile держит действия пользователя справа в верхней части карточки, а роль и пароль выносит во вторую строку;
- переводит поля роли и пароля в одну колонку только на очень узких экранах;
- показывает поиск и кнопку добавления в одной горизонтальной шапке списка пользователей;
- растягивает поиск по всей доступной ширине, оставляя кнопку добавления справа на desktop и mobile;
- выравнивает toolbar и список пользователей по одной вертикали без бокового inset внутри вкладки;
- открывает создание пользователя в кастомной модалке;
- фильтрует список пользователей по логину на клиенте;
- использует кастомный dropdown-список роли;
- фильтрует историю на клиенте через кастомные dropdown-фильтры с мультивыбором в заголовках колонок и сортирует ее по дате из заголовка таблицы;
- показывает историю таблицей с пользователем, датой, действием, инициатором и целью;
- использует смысловую `History`-иконку для вкладки истории и единые hover/active-состояния вкладок;
- показывает статистику цветными KPI-плитками и аналитическими блоками с простыми CSS-графиками;
- выравнивает содержимое статистики по одной вертикали с шапкой без бокового inset;
- растягивает одиночную плитку статистики на всю строку в адаптивной сетке;
- размещает описание KPI в верхней строке справа от иконки.

Общие UI-компоненты:

- `CustomSelect` - кастомный dropdown с расчетом направления открытия по свободному месту на экране; меню рендерится через portal в `document.body`, поэтому не режется родительским overflow.
- `Tooltip` - единая подсказка, рендерится через portal в `document.body` поверх модалок, dropdown и scroll-контейнеров.
- `TooltipText` - общий ellipsis-текст, использует `Tooltip` для показа полного значения только при фактическом обрезании.
- `ShortcutHint` - окно горячих клавиш в topbar, рендерится через portal в `document.body` поверх прочих окон.
- `IconButton` - icon-only button с локализованным label; визуальная обертка строится на четкой matte-подложке, тонком border и цвете состояния без теней. Внешний browser outline отключен глобально, поэтому focus/keyboard-навигация не рисует системную рамку. Общая рамка группировки оставлена только у основных групп toolbar редактора заметок; дерево заметок, админка, одиночные действия и кнопки шапки заметки остаются без групповой подложки. SVG наследуют цвет обертки, а темная тема не использует черный контрастный цвет для primary/selected-иконок.
- `Modal` - кастомные модальные окна без native dialog, с локальным presence-состоянием для плавного закрытия.
- `ToastHost` - toast-alerting в правом верхнем углу с полупрозрачной поверхностью; `useToasts` вынесен отдельно и помечает toast как closing перед удалением.

Редактор:

- `useNotebookEditor` создает Tiptap editor с `editable: false`; `App.tsx` переключает `editor.setEditable(...)` по режиму просмотра/редактирования.
- `RichTextToolbar` группирует действия по смыслу: режим, формат текста, блоки, вставки, undo/redo.
- `CodeBlockWithTools` расширяет `CodeBlockLowlight` и подключает React node view.
- `CodeBlockView` рендерит dropdown языка внутри code block в правом верхнем углу и обновляет `codeBlock.language`.
- `codeLanguages.ts` содержит общий список языков для подсветки и переводов.
- `EditorLinkTooltip` в режиме редактирования показывает `href` ссылки через portal tooltip, а в режиме просмотра открывает ссылки кликом.
- `CopyField` реализует атомарный Tiptap node для обычных и секретных полей копирования. Тип поля хранится в `data-kind`, секретность в `data-secret`; тип выбирается через компактное icon-menu, пароль можно сгенерировать через `crypto.getRandomValues`, в preview секретные значения маскируются, но исходное значение остается в HTML заметки.

## Потоки Данных

### Вход

1. Пользователь отправляет логин и пароль.
2. Frontend вызывает `authApi.login`.
3. Backend проверяет пароль.
4. Backend обновляет `last_login_at`.
5. Backend пишет `auth.login`.
6. Frontend сохраняет token и user.

### Создание Заметки

1. Пользователь нажимает единую иконку создания заметки в сайдбаре.
2. Frontend вызывает `POST /api/notes`.
3. Backend берет `userId` из токена.
4. Frontend передает `parentId` выбранной заметки или `null`, если выбран корень.
5. Backend проверяет parent внутри этого userId.
6. Backend создает заметку с `user_id` и дефолтным названием, переданным frontend.
7. Backend пишет `notes.create`.
8. Frontend обновляет дерево и выбирает новую заметку.
9. Пользователь может переименовать ее inline в строке дерева через `PATCH /api/notes/:id`.

### Управление Пользователем

1. Admin открывает админку.
2. Frontend вызывает `GET /api/admin/users`, `GET /api/admin/activity`, `GET /api/admin/stats`.
3. Backend проверяет Bearer token и роль `admin`.
4. Admin создает пользователя, меняет роль или пароль существующего пользователя, либо удаляет пользователя.
5. Backend пишет соответствующее `admin.user.*` событие.
6. Frontend перезагружает данные админки.

### Удаление Пользователя

1. Admin вызывает `DELETE /api/admin/users/:id`.
2. Backend запрещает удалить самого себя.
3. Backend пишет `admin.user.delete`.
4. Backend удаляет строку `users`.
5. SQLite каскадно удаляет `notes` пользователя.
6. `activity_logs.user_id` для удаленного пользователя становится `null`.
