# REST API И cURL

## База

Локальный backend по умолчанию:

```bash
BASE_URL=http://localhost:3000/api
```

Публичные endpoints:

- `GET /api/health`
- `POST /api/auth/login`

Все остальные endpoints требуют:

```http
Authorization: Bearer <token>
```

В PowerShell используйте `curl.exe`, чтобы не попасть в alias `Invoke-WebRequest`.

## Ошибки

Стандартный формат NestJS:

```json
{
  "message": "Authentication is required",
  "error": "Unauthorized",
  "statusCode": 401
}
```

Валидация:

```json
{
  "message": ["username must be longer than or equal to 1 characters"],
  "error": "Bad Request",
  "statusCode": 400
}
```

`ValidationPipe` настроен с `whitelist`, `forbidNonWhitelisted`, `transform`.

## Auth

### POST `/api/auth/login`

Вход пользователя.

Request:

```json
{
  "username": "admin",
  "password": "admin"
}
```

Response `200`:

```json
{
  "token": "base64urlPayload.signature",
  "user": {
    "id": 1,
    "username": "admin",
    "role": "admin",
    "language": "ru",
    "theme": "dark",
    "lastLoginAt": "2026-05-02T09:16:23.000Z"
  }
}
```

cURL:

```bash
curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}'
```

Сохранить token:

```bash
TOKEN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}' \
  | node -pe "JSON.parse(require('fs').readFileSync(0, 'utf8')).token")
```

Ошибки:

- `401` - неверный логин, пароль, token или истекший token.

### GET `/api/me`

Текущий пользователь.

Response `200`:

```json
{
  "id": 1,
  "username": "admin",
  "role": "admin",
  "language": "ru",
  "theme": "dark",
  "lastLoginAt": "2026-05-02T09:16:23.000Z"
}
```

cURL:

```bash
curl -s "$BASE_URL/me" \
  -H "Authorization: Bearer $TOKEN"
```

### PATCH `/api/me/preferences`

Обновляет язык и тему текущего пользователя.

Request:

```json
{
  "language": "en",
  "theme": "light"
}
```

Validation:

- `language`: optional, `ru` или `en`;
- `theme`: optional, `light` или `dark`.

cURL:

```bash
curl -s -X PATCH "$BASE_URL/me/preferences" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"language":"en","theme":"light"}'
```

## Healthcheck

### GET `/api/health`

Response `200`:

```json
{
  "status": "ok",
  "service": "notes",
  "time": "2026-05-02T09:16:23.000Z"
}
```

cURL:

```bash
curl -s "$BASE_URL/health"
```

## Notes

Все endpoints заметок работают только с заметками текущего пользователя. Чужой `id` вернет `404`.

### Модель `Note`

```ts
interface Note {
  id: number;
  name: string;
  contentHtml: string;
  contentText: string;
  parentId: number | null;
  position: number;
  isFavorite: boolean;
  isPinned: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}
```

### Модель `NoteTreeNode`

```ts
interface NoteTreeNode {
  id: number;
  name: string;
  parentId: number | null;
  isFavorite: boolean;
  isPinned: boolean;
  tags: string[];
  children: NoteTreeNode[];
}
```

### GET `/api/notes/tree`

Дерево заметок текущего пользователя.

cURL:

```bash
curl -s "$BASE_URL/notes/tree" \
  -H "Authorization: Bearer $TOKEN"
```

### GET `/api/notes/:id`

Одна заметка текущего пользователя.

cURL:

```bash
curl -s "$BASE_URL/notes/1" \
  -H "Authorization: Bearer $TOKEN"
```

Ошибки:

- `404` - заметка не найдена или принадлежит другому пользователю.

### POST `/api/notes`

Создает заметку текущего пользователя.

Request:

```json
{
  "name": "Новая заметка",
  "parentId": null
}
```

Validation:

- `name`: string, 1..120;
- `parentId`: optional, integer >= 1 или `null`.

cURL:

```bash
curl -s -X POST "$BASE_URL/notes" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Новая заметка","parentId":null}'
```

### PATCH `/api/notes/:id`

Редактирует название и содержимое заметки.

Request:

```json
{
  "name": "Переименовано",
  "contentHtml": "<p>Hello</p>",
  "contentText": "Hello",
  "isFavorite": true,
  "isPinned": false
}
```

Все поля optional. При сохранении редактор обычно отправляет `name`, `contentHtml`, `contentText`.

cURL:

```bash
curl -s -X PATCH "$BASE_URL/notes/1" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Переименовано","contentHtml":"<p>Hello</p>","contentText":"Hello"}'
```

### PATCH `/api/notes/:id/move`

Перемещает заметку в другую папку или в корень.

Request:

```json
{
  "parentId": null,
  "position": 0
}
```

Validation:

- `parentId`: optional, integer >= 1 или `null`;
- `position`: optional, integer >= 0.

cURL:

```bash
curl -s -X PATCH "$BASE_URL/notes/2/move" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"parentId":null}'
```

Ошибки:

- `400` - перенос в саму себя или в своего потомка;
- `404` - заметка или parent не найдены у текущего пользователя.

### DELETE `/api/notes/:id`

Удаляет заметку текущего пользователя. Потомки удаляются каскадно.

cURL:

```bash
curl -s -X DELETE "$BASE_URL/notes/1" \
  -H "Authorization: Bearer $TOKEN"
```

### GET `/api/notes/trash`

Возвращает корзину текущего пользователя.

```bash
curl -s "$BASE_URL/notes/trash" \
  -H "Authorization: Bearer $TOKEN"
```

### POST `/api/notes/:id/restore`

Восстанавливает заметку из корзины.

```bash
curl -s -X POST "$BASE_URL/notes/1/restore" \
  -H "Authorization: Bearer $TOKEN"
```

### DELETE `/api/notes/:id/permanent`

Окончательно удаляет заметку.

```bash
curl -s -X DELETE "$BASE_URL/notes/1/permanent" \
  -H "Authorization: Bearer $TOKEN"
```

### GET `/api/notes/search?q=sqlite`

Полнотекстовый поиск по названию, тексту и тегам.

```bash
curl -s "$BASE_URL/notes/search?q=sqlite" \
  -H "Authorization: Bearer $TOKEN"
```

### POST `/api/notes/search/reindex`

Пересобирает FTS5 индекс заметок текущего пользователя.

```bash
curl -s -X POST "$BASE_URL/notes/search/reindex" \
  -H "Authorization: Bearer $TOKEN"
```

### GET `/api/notes/tags`

Список тегов текущего пользователя.

```bash
curl -s "$BASE_URL/notes/tags" \
  -H "Authorization: Bearer $TOKEN"
```

### POST `/api/notes/tags`

Создает глобальный тег текущего пользователя или возвращает существующий тег с таким же именем.
Имя нормализуется в нижний регистр.

```json
{
  "name": "devops"
}
```

```bash
curl -s -X POST "$BASE_URL/notes/tags" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"devops"}'
```

### DELETE `/api/notes/tags/:tagId`

Удаляет глобальный тег текущего пользователя и снимает его со всех заметок пользователя.
Операция идемпотентная: повторное удаление уже отсутствующего тега возвращает успешный ответ.

```bash
curl -s -X DELETE "$BASE_URL/notes/tags/1" \
  -H "Authorization: Bearer $TOKEN"
```

### PATCH `/api/notes/tags/:tagId`

Переименовывает глобальный тег текущего пользователя. Имя нормализуется в нижний регистр.
Если тег с таким именем уже существует, связи заметок переносятся на существующий тег, а старый тег удаляется.

```json
{
  "name": "prod"
}
```

```bash
curl -s -X PATCH "$BASE_URL/notes/tags/1" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"prod"}'
```

### PATCH `/api/notes/:id/tags`

Назначает заметке только уже существующие глобальные теги текущего пользователя.
Имена тегов нормализуются в нижний регистр.

```json
{
  "tags": ["devops", "sqlite"]
}
```

```bash
curl -s -X PATCH "$BASE_URL/notes/1/tags" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tags":["devops","sqlite"]}'
```

### GET `/api/notes/:id/versions`

Список версий заметки.

Возвращает максимум 80 последних версий. Перед выдачей backend удаляет лишние старые версии этой заметки, если лимит был превышен.

```bash
curl -s "$BASE_URL/notes/1/versions" \
  -H "Authorization: Bearer $TOKEN"
```

### POST `/api/notes/:id/versions/:versionId/restore`

Откатывает заметку к версии.

```bash
curl -s -X POST "$BASE_URL/notes/1/versions/2/restore" \
  -H "Authorization: Bearer $TOKEN"
```

## Workspace

### Templates

```bash
curl -s "$BASE_URL/templates" -H "Authorization: Bearer $TOKEN"

curl -s -X POST "$BASE_URL/templates" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Deploy","contentHtml":"<p>Steps</p>","contentText":"Steps"}'

curl -s -X POST "$BASE_URL/notes/from-template" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"templateId":1,"parentId":null}'

curl -s -X DELETE "$BASE_URL/templates/1" \
  -H "Authorization: Bearer $TOKEN"
```

### Export / Import API

Frontend показывает действия `Экспорт JSON` и `Импорт JSON` в разделе `Управление заметками` бокового меню. Экспорт скачивает `.json` файл с активными заметками пользователя, включая `isFavorite`, `isPinned`, `tags`, `parentId` и пользовательские шаблоны; записи из корзины не включаются. Secret/password/token copy fields экспортируются с зашифрованным `data-value` формата `enc:v1:...`; визуальные `********` внутри HTML не используются для восстановления. Импорт принимает JSON-файл такого же формата, валидирует `notes`, восстанавливает теги, избранное, закрепление и связи родитель/дочерняя заметка.

```bash
curl -s "$BASE_URL/export/json" -H "Authorization: Bearer $TOKEN"

curl -s -X POST "$BASE_URL/import/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"notes":[{"id":1,"name":"Imported","contentHtml":"<p>Text</p>","contentText":"Text","parentId":null,"isFavorite":true,"isPinned":false,"tags":["devops"]}]}'
```

### Attachments

```bash
curl -s "$BASE_URL/attachments" \
  -H "Authorization: Bearer $TOKEN"

curl -s -X POST "$BASE_URL/attachments" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"fileName":"global.env","mimeType":"text/plain","contentBase64":"VEVTVA=="}'

curl -s -X POST "$BASE_URL/notes/1/attachments" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"noteId":1,"fileName":"config.env","mimeType":"text/plain","contentBase64":"VEVTVA=="}'

curl -s "$BASE_URL/notes/1/attachments" \
  -H "Authorization: Bearer $TOKEN"

curl -s -X PATCH "$BASE_URL/attachments/1" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"fileName":"renamed-config.env"}'

curl -s -X PATCH "$BASE_URL/attachments/1/note" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"noteId":2}'

curl -s -X PATCH "$BASE_URL/attachments/1/note" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"noteId":null}'

curl -L "$BASE_URL/attachments/1/download" \
  -H "Authorization: Bearer $TOKEN" \
  -o config.env

curl -L "$BASE_URL/notes/1/attachments/archive" \
  -H "Authorization: Bearer $TOKEN" \
  -o attachments.zip

curl -L "$BASE_URL/notes/1/attachments/archive?ids=1,2,3" \
  -H "Authorization: Bearer $TOKEN" \
  -o selected-attachments.zip

curl -L "$BASE_URL/attachments/archive?ids=1,2,3" \
  -H "Authorization: Bearer $TOKEN" \
  -o account-attachments.zip

curl -s -X DELETE "$BASE_URL/attachments/1" \
  -H "Authorization: Bearer $TOKEN"
```

Attachments belong to the current account. `noteId` is optional: `POST /attachments` uploads an account file without a note, while `POST /notes/:id/attachments` uploads and attaches the file to a note immediately. `PATCH /attachments/:id/note` attaches a file to another note or detaches it with `noteId: null`. Files are stored on disk in `UPLOAD_DIR`; SQLite stores only metadata and `storage_path`. JSON body limit is 30 MB, while file validation is controlled by `MAX_UPLOAD_SIZE_MB`. `GET /notes/:id/attachments/archive` builds a ZIP archive for one note; `GET /attachments/archive` builds an account-level ZIP. Optional `ids=1,2,3` limits the archive to selected files. Permanent note deletion detaches files instead of deleting them. Physical files are deleted only when the attachment itself is deleted or when an admin deletes the user account.

### Share Links

```bash
curl -s "$BASE_URL/notes/1/share-links" \
  -H "Authorization: Bearer $TOKEN"

curl -s -X POST "$BASE_URL/notes/1/share-links" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ttlHours":24,"includeSecrets":true}'

curl -s "$BASE_URL/share/<token>"

# Frontend public page for a created link:
# http://localhost:3000/share/<token>

curl -s -X DELETE "$BASE_URL/share-links/1" \
  -H "Authorization: Bearer $TOKEN"
```

`POST /notes/:id/share-links` returns `url: "/share/<token>"` for copying and opening in browser.
`includeSecrets: true` keeps secret/password/token values available for copy buttons on the public page while the UI still masks them visually.
`DELETE /share-links/:id` deletes the link immediately. Public API data is still loaded from `GET /share/<token>` under the `/api` prefix.

## AI

AI endpoints работают только для текущего пользователя и не отдают сохраненный API key обратно на frontend.
Ключ хранится в БД зашифрованным через `AI_CREDENTIALS_ENCRYPTION_KEY`; в ответе есть только `hasApiKey` и безопасная маска `apiKeyHint`.

### GET `/api/ai/settings`

Возвращает настройки AI, состояние синхронизации моделей и список моделей текущего пользователя.
В элементах `models[]` дополнительно возвращаются `score`, `speedScore`, `valueScore` и `sortRank`.
Frontend использует `score` только для цветовой полоски эффективности без вывода числа, а `sortRank` - для сортировки новых семейств выше старых.
`sortRank` считается на backend из семейства модели и `created` от provider, если provider вернул это поле.

```bash
curl -s "$BASE_URL/ai/settings" \
  -H "Authorization: Bearer $TOKEN"
```

### PATCH `/api/ai/settings`

Сохраняет настройки AI. Поле `apiKey` передается только при создании или замене ключа.
Чтобы удалить ключ, отправьте `clearApiKey: true`.

```bash
curl -s -X PATCH "$BASE_URL/ai/settings" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled":true,"providerName":"OpenAI-compatible","baseUrl":"https://api.openai.com/v1","model":"gpt-4.1-mini","apiKey":"sk-..."}'
```

Удаление ключа:

```bash
curl -s -X PATCH "$BASE_URL/ai/settings" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"clearApiKey":true}'
```

Validation:

- `baseUrl` должен быть валидным HTTPS URL;
- `providerName`: optional string до 80 символов;
- `model`: optional string до 180 символов или `null`;
- `apiKey`: optional string до 3000 символов.

### POST `/api/ai/models/sync`

Синхронизирует список моделей через OpenAI-compatible endpoint `GET <baseUrl>/models`.
Модели, которые провайдер больше не возвращает, помечаются как устаревшие.

```bash
curl -s -X POST "$BASE_URL/ai/models/sync" \
  -H "Authorization: Bearer $TOKEN"
```

### POST `/api/ai/test-connection`

Проверяет подключение к provider через синхронизацию моделей и обновляет `lastConnectionCheckAt`.

```bash
curl -s -X POST "$BASE_URL/ai/test-connection" \
  -H "Authorization: Bearer $TOKEN"
```

### POST `/api/ai/chat`

Отправляет сообщение в выбранную модель через OpenAI-compatible endpoint `POST <baseUrl>/chat/completions`.
AI может вернуть текстовый ответ или список действий `actions[]`. Readonly tool-calls выполняются сразу, а любые изменения заметок, тегов, шаблонов, версий или share links возвращаются как preview и требуют подтверждения через `POST /api/ai/actions/execute`.
Запрос может содержать `currentNote`, чтобы backend и модель знали текущую выбранную заметку для команд вроде “измени текущую заметку” или “напиши текст в уже созданной заметке”.
Developer prompt описывает доступные инструменты, схему заметок, формат `contentHtml/contentText`, правила форматирования, copy/secret fields и порядок работы с поиском/чтением/редактированием.
Если передан `currentNote`, prompt включает `id`, `name`, `contentText` и `contentHtml` текущей заметки с ограничением размера.
Frontend передает в `currentNote` актуальный draft редактора, поэтому AI-команды могут использовать текст, который пользователь уже набрал, но еще не сохранил вручную.
AI chat работает по LLM-first схеме: backend не перехватывает команды редактирования заметок до модели. Выбранная модель получает developer prompt, `currentNote`, историю и запрос пользователя, после чего сама должна вернуть нужный tool-call.
`currentNote` включает `id`, `name`, `contentHtml`, `contentText`. `contentHtml` нужен, чтобы команды добавления логина/пароля могли дописать secret/copy-поля к существующему содержимому заметки.
Если `currentNote` не передан, но команда явно указывает имя заметки, модель должна использовать `notes.search`, затем `notes.read`, и только после этого возвращать mutation tool-call.
Команды преобразования вроде “перенеси данные в секретные поля” используют `currentNote.contentText` и `currentNote.contentHtml`: модель сама извлекает значения из текста, например из строки `Логин - test, пароль - test12`, удаляет открытый текст с этими значениями и возвращает `notes.update` с copy/secret-полями.
Одиночные подтверждения текстом (`да`, `ок`, `yes`) не выполняют tool-call. Пользователь подтверждает мутации только кнопкой в карточке действия.
Backend не передает `temperature` в запрос чата, чтобы не ломать GPT-5/reasoning модели, которые могут не поддерживать sampling-параметры в выбранном режиме.
Служебная инструкция отправляется как `developer` message, что совместимо с новыми OpenAI моделями в Chat Completions.
Если provider возвращает ошибку, backend прокидывает короткий текст причины в 400-ответ.

```bash
curl -s -X POST "$BASE_URL/ai/chat" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"Добавь в текущую заметку логин test, пароль qwerty","history":[],"currentNote":{"id":1,"name":"Test","contentHtml":"<p></p>","contentText":""}}'
```

Пример ответа с действием:

```json
{
  "message": {
    "role": "assistant",
    "content": "Подтвердите действие: Создать заметку."
  },
  "actions": [
    {
      "name": "notes.create",
      "title": "Создать заметку",
      "description": "Будет создана заметка \"Новая заметка\".",
      "payload": {
        "name": "Новая заметка",
        "contentHtml": "<p>Доступы</p>",
        "contentText": "Доступы"
      }
    }
  ]
}
```

### POST `/api/ai/actions/execute`

Выполняет подтвержденное AI-действие. Endpoint принимает только действия из registry текущего backend и всегда работает от имени текущего пользователя.
Для `notes.update` backend требует хотя бы одно реальное поле изменения: `name`, `contentHtml` или `contentText`.

```bash
curl -s -X POST "$BASE_URL/ai/actions/execute" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"notes.create","payload":{"name":"Новая заметка","contentHtml":"<p>Текст</p>","contentText":"Текст"}}'
```

Ответ:

```json
{
  "message": {
    "role": "assistant",
    "content": "Заметка создана."
  },
  "noteId": 12,
  "refreshTree": true
}
```

Поддержанные действия:

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

Readonly `notes.read` возвращает модели не только метаданные, но и `contentText` заметки до 6000 символов, чтобы следующие ответы и мутации могли опираться на фактическое содержимое.

## Admin

Все admin endpoints требуют роль `admin`.

Ошибки:

- `401` - нет валидного Bearer-token;
- `403` - пользователь не admin.

### Модель `AdminUser`

```ts
interface AdminUser {
  id: number;
  username: string;
  role: "user" | "admin";
  language: "ru" | "en";
  theme: "light" | "dark";
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  notesCount: number;
}
```

### GET `/api/admin/users`

Список пользователей.

cURL:

```bash
curl -s "$BASE_URL/admin/users" \
  -H "Authorization: Bearer $TOKEN"
```

### POST `/api/admin/users`

Создает пользователя. Если `role` не передан, используется `user`.

Request:

```json
{
  "username": "bob",
  "password": "bobpass",
  "role": "user",
  "language": "ru",
  "theme": "dark"
}
```

cURL:

```bash
curl -s -X POST "$BASE_URL/admin/users" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username":"bob","password":"bobpass"}'
```

Ошибки:

- `400` - неверный payload или пустой username;
- `409` - username уже занят.

### PATCH `/api/admin/users/:id`

Редактирует пароль и роль пользователя. Логин, язык и тема через этот метод не меняются.

Request:

```json
{
  "password": "newpass",
  "role": "admin"
}
```

cURL:

```bash
curl -s -X PATCH "$BASE_URL/admin/users/2" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"role":"admin","password":"newpass"}'
```

Ошибки:

- `400` - неверный payload или попытка оставить систему без admin;
- `404` - пользователь не найден.

### DELETE `/api/admin/users/:id`

Удаляет пользователя и все его заметки.

cURL:

```bash
curl -s -X DELETE "$BASE_URL/admin/users/2" \
  -H "Authorization: Bearer $TOKEN"
```

Ошибки:

- `400` - admin пытается удалить собственный аккаунт;
- `404` - пользователь не найден.

### GET `/api/admin/activity?limit=80`

Возвращает историю действий. `limit` ограничивается диапазоном `1..200`; если значение не число, используется `80`.

Модель:

```ts
interface ActivityLog {
  id: number;
  actorId: number | null;
  actorUsername: string | null;
  userId: number | null;
  userUsername: string | null;
  action: string;
  targetType: string;
  targetId: number | null;
  details: Record<string, unknown>;
  createdAt: string;
}
```

cURL:

```bash
curl -s "$BASE_URL/admin/activity?limit=50" \
  -H "Authorization: Bearer $TOKEN"
```

### GET `/api/admin/stats?range=week`

Агрегированная статистика.

Query `range` управляет графиком активности:

- `day` - последние 24 часа по часам;
- `week` - последние 7 дней по дням, значение по умолчанию;
- `month` - последние 30 дней по дням;
- `year` - последние 12 месяцев по месяцам.

Ответ включает общие счетчики, файловое хранилище, отвязанные от заметок файлы, активные публичные ссылки, LLM/Notes AI агрегаты, активность за выбранный период, топ пользователей по объему файлов, топ пользователей по действиям и топ выбранных LLM-моделей.
В `topActivityUsers.username` используется пользователь-цель события, затем инициатор события, а для удаленных пользователей возвращается `unknown`.

Response `200`:

```json
{
  "usersTotal": 2,
  "adminsTotal": 1,
  "notesTotal": 5,
  "activityTotal": 12,
  "lastLoginAt": "2026-05-02T09:16:23.000Z",
  "activeUsersToday": 2,
  "eventsLast24h": 4,
  "attachmentsTotal": 8,
  "attachmentsStorageBytes": 2457600,
  "orphanAttachmentsTotal": 2,
  "orphanAttachmentsBytes": 512000,
  "averageAttachmentBytes": 307200,
  "largestAttachmentBytes": 1048576,
  "notesWithAttachmentsTotal": 3,
  "noteVersionsTotal": 18,
  "shareLinksActiveTotal": 1,
  "aiEnabledUsersTotal": 1,
  "aiSelectedModelsTotal": 1,
  "aiProvidersTotal": 1,
  "aiSyncedModelsTotal": 24,
  "aiDeprecatedModelsTotal": 2,
  "aiChatsLast24h": 5,
  "aiToolExecutionsLast24h": 2,
  "aiActiveUsersLast24h": 1,
  "aiLastModelsSyncAt": "2026-05-05T09:30:00.000Z",
  "activityRange": "week",
  "activityByDay": [
    {
      "date": "2026-04-27",
      "total": 3,
      "login": 1,
      "notes": 2,
      "admin": 0,
      "ai": 0
    }
  ],
  "topStorageUsers": [
    {
      "username": "admin",
      "filesTotal": 8,
      "storageBytes": 2457600
    }
  ],
  "topActivityUsers": [
    {
      "username": "admin",
      "eventsTotal": 12
    }
  ],
  "topAiModels": [
    {
      "model": "gpt-5.5",
      "usersTotal": 1
    }
  ],
  "fileTypes": [
    {
      "type": "image",
      "filesTotal": 3,
      "storageBytes": 1048576
    }
  ]
}
```

cURL:

```bash
curl -s "$BASE_URL/admin/stats?range=month" \
  -H "Authorization: Bearer $TOKEN"
```

## Smoke-Сценарий

```bash
BASE_URL=http://localhost:3000/api

TOKEN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}' \
  | node -pe "JSON.parse(require('fs').readFileSync(0, 'utf8')).token")

curl -s "$BASE_URL/me" -H "Authorization: Bearer $TOKEN"

BOB_ID=$(curl -s -X POST "$BASE_URL/admin/users" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username":"bob","password":"bobpass"}' \
  | node -pe "JSON.parse(require('fs').readFileSync(0, 'utf8')).id")

BOB_TOKEN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"bob","password":"bobpass"}' \
  | node -pe "JSON.parse(require('fs').readFileSync(0, 'utf8')).token")

curl -s -X POST "$BASE_URL/notes" \
  -H "Authorization: Bearer $BOB_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Bob private note"}'

curl -s "$BASE_URL/notes/tree" -H "Authorization: Bearer $BOB_TOKEN"
curl -s "$BASE_URL/notes/tree" -H "Authorization: Bearer $TOKEN"
curl -s "$BASE_URL/admin/activity?limit=50" -H "Authorization: Bearer $TOKEN"
curl -s "$BASE_URL/admin/stats" -H "Authorization: Bearer $TOKEN"

curl -s -X DELETE "$BASE_URL/admin/users/$BOB_ID" \
  -H "Authorization: Bearer $TOKEN"
```
