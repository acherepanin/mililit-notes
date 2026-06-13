# REST API И cURL

## База

Локальный backend по умолчанию:

```bash
BASE_URL=http://localhost:3000/api
```

Публичные endpoints:

- `GET /api/health`
- `POST /api/auth/login`
- `POST /api/auth/register`
- `GET /api/share/:token`
- `POST /api/ai/bots/telegram/webhook`
- `POST /api/ai/bots/vk/webhook`

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
  -d '{"username":"admin","password":"adm136479"}'
```

Сохранить token:

```bash
TOKEN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"adm136479"}' \
  | node -pe "JSON.parse(require('fs').readFileSync(0, 'utf8')).token")
```

Ошибки:

- `401` - неверный логин, пароль, token или истекший token.
- `401` - `Account email is not confirmed yet` — вход с данными неподтверждённой регистрации.

### POST `/api/auth/register`

Создаёт **ожидающую** регистрацию и отправляет письмо с подтверждением. Пользователь в `users` **не создаётся** до перехода по ссылке из письма.

Правила:

- `username` — только `a-z`, `0-9`, `_`; сохраняется в нижнем регистре; уникален среди пользователей и активных (не истёкших) pending-записей.
- `email`, `username`, `password` обязательны; `password` ≥ 8 символов.
- Pending истекает через 24 часа и удаляется; ссылка одноразовая.

Request:

```json
{
  "username": "alice",
  "password": "secret",
  "email": "alice@example.com",
  "firstName": "Alice",
  "lastName": "Smith"
}
```

Response `201`:

```json
{
  "pendingId": 12,
  "email": "alice@example.com",
  "expiresAt": "2026-05-31T12:00:00.000Z"
}
```

Ошибки:

- `400` — валидация.
- `409` — username или email уже заняты (включая неподтверждённую регистрацию с тем же логином).

### GET `/api/auth/register/pending/:id`

Публичный статус ожидания подтверждения.

Response `200`:

```json
{ "status": "pending" }
```

`status`: `pending` | `verified` | `expired` | `not_found`.

### GET `/api/auth/verify-email?token=...`

Подтверждает email, создаёт пользователя, назначает бесплатный тариф, инвалидирует token.

Response `200`: `{ "ok": true }`

Ошибки:

- `404` — ссылка недействительна, уже использована или истекла.
- `409` — username/email заняты на момент подтверждения.

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
  "lastLoginAt": "2026-05-02T09:16:23.000Z",
  "profile": {
    "email": "admin@example.com",
    "firstName": null,
    "lastName": null,
    "patronymic": null,
    "birthDate": null
  },
  "subscription": {
    "subscription": {
      "id": 1,
      "plan": { "id": 1, "slug": "free", "name": "Free", "entitlements": { "ai": { "enabled": false }, "files": { "enabled": true, "storageLimitBytes": 104857600 } } },
      "status": "active",
      "startedAt": "2026-05-30T10:00:00.000Z",
      "expiresAt": null,
      "source": "seed"
    },
    "entitlements": { "ai": { "enabled": false }, "files": { "enabled": true, "storageLimitBytes": 104857600 } },
    "storageUsedBytes": 0
  }
}
```

cURL:

```bash
curl -s "$BASE_URL/me" \
  -H "Authorization: Bearer $TOKEN"
```

### PATCH `/api/me/profile`

Обновляет ФИО и дату рождения. Email изменить нельзя. Response — тот же объект, что `GET /api/me`.

### PATCH `/api/me/password`

Смена пароля.

Request:

```json
{
  "currentPassword": "old",
  "newPassword": "new-secret"
}
```

Response `200`: `{ "ok": true }`.

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

### GET `/api/notes/search?q=postgres`

Полнотекстовый поиск по названию, тексту и тегам.

```bash
curl -s "$BASE_URL/notes/search?q=postgres" \
  -H "Authorization: Bearer $TOKEN"
```

### POST `/api/notes/search/reindex`

Пересобирает полнотекстовый поисковый индекс заметок текущего пользователя.

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
  "tags": ["devops", "postgres"]
}
```

```bash
curl -s -X PATCH "$BASE_URL/notes/1/tags" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tags":["devops","postgres"]}'
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

Frontend показывает действия `Экспорт JSON` и `Импорт JSON` в разделе `Управление заметками` бокового меню. Экспорт скачивает `.json` файл с активными заметками пользователя, включая `isFavorite`, `isPinned`, `tags`, `parentId` и пользовательские шаблоны; записи из корзины не включаются. Secret/password/token поля данных экспортируются с зашифрованным `data-value` формата `enc:v1:...`; визуальные `********` внутри HTML не используются для восстановления. Импорт принимает JSON-файл такого же формата, валидирует `notes`, восстанавливает теги, избранное, закрепление и связи родитель/дочерняя заметка.

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

Attachments belong to the current account. `noteId` is optional: `POST /attachments` uploads an account file without a note, while `POST /notes/:id/attachments` uploads and attaches the file to a note immediately. `PATCH /attachments/:id/note` attaches a file to another note or detaches it with `noteId: null`. Files are stored on disk in `UPLOAD_DIR`; the database stores only metadata and `storage_path`. JSON body limit is 30 MB, while file validation is controlled by `MAX_UPLOAD_SIZE_MB`. `GET /notes/:id/attachments/archive` builds a ZIP archive for one note; `GET /attachments/archive` builds an account-level ZIP. Optional `ids=1,2,3` limits the archive to selected files. Permanent note deletion detaches files instead of deleting them. Physical files are deleted only when the attachment itself is deleted or when an admin deletes the user account.

### Share Links

```bash
curl -s "$BASE_URL/notes/1/share-links" \
  -H "Authorization: Bearer $TOKEN"

curl -s -X POST "$BASE_URL/notes/1/share-links" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ttlHours":24,"includeSecrets":true,"oneTime":true}'

curl -s "$BASE_URL/share/<token>"

# Frontend public page for a created link:
# http://localhost:3000/share/<token>

curl -s -X DELETE "$BASE_URL/share-links/1" \
  -H "Authorization: Bearer $TOKEN"
```

`POST /notes/:id/share-links` returns `url: "/share/<token>"` for copying and opening in browser.
`includeSecrets: true` keeps secret/password/token values available for copy buttons on the public page while the UI still masks them visually.
При `includeSecrets: false` backend маскирует секреты и в `contentHtml`, и в `contentText` ответа `GET /share/<token>`.
`oneTime: true` creates a single-use link. The first successful `GET /share/<token>` returns the note, increments `accessCount` and immediately revokes the link for future opens.
`DELETE /share-links/:id` deletes the link immediately. Public API data is still loaded from `GET /share/<token>` under the `/api` prefix.

Share link list responses include `oneTime`, `accessCount`, `maxAccessCount`, `lastAccessedAt` and `revokedAt`, so UI can show whether the link is reusable, already used or manually revoked.

## AI

AI endpoints работают только для текущего пользователя и не отдают сохраненный API key обратно на frontend.
Ключ хранится в БД зашифрованным через `AI_CREDENTIALS_ENCRYPTION_KEY`; в ответе есть только `hasApiKey` и безопасная маска `apiKeyHint`.
Ключ, маска, выбранная модель и состояние синхронизации сохраняются отдельно для каждой пары `providerName` + `baseUrl`.

### GET `/api/ai/settings`

Возвращает настройки AI, состояние синхронизации моделей и список моделей текущего пользователя.
В элементах `models[]` дополнительно возвращаются `score`, `speedScore`, `valueScore`, `sortRank`, `inputPricePer1M`, `cachedInputPricePer1M`, `outputPricePer1M`.
Frontend использует `score` только для цветовой полоски эффективности без вывода числа, а `sortRank` - для сортировки новых семейств выше старых.
Поля цены считаются за 1 миллион токенов. Если цена модели неизвестна, backend возвращает `null`, а UI показывает `?`.
`sortRank` считается на backend из семейства модели и `created` от provider, если provider вернул это поле.
Поле `providers[]` содержит сохраненные provider-профили без полного API key: `providerName`, `baseUrl`, `model`, `hasApiKey`, `apiKeyHint`, `apiKeyUpdatedAt`, `updatedAt`.
Поля `allowReadSecrets`, `requireActionConfirmation`, `dailyRequestLimit`, `dailyTokenLimit` управляют доступом Notes AI к секретным значениям полей данных, подтверждением mutation-действий в web-чате и дневными лимитами. `usageToday` возвращает фактическое использование за текущий день: `requests`, `inputTokens`, `outputTokens`, `tokens`.

```bash
curl -s "$BASE_URL/ai/settings" \
  -H "Authorization: Bearer $TOKEN"
```

### PATCH `/api/ai/settings`

Сохраняет активный provider, общие AI-настройки пользователя и настройки текущей пары `providerName` + `baseUrl`. Поле `apiKey` передается только при создании или замене ключа.
Если отправить только `providerName` и `baseUrl`, backend переключит активный provider и вернет ранее сохраненные для него `model`, `hasApiKey` и `apiKeyHint`.
Чтобы удалить ключ, отправьте `clearApiKey: true`.
`allowReadSecrets` по умолчанию `false`: без него Notes AI получает замаскированные значения password/token/secret в `currentNote` и readonly tool-результатах.
`requireActionConfirmation` по умолчанию `true`: mutation-действия возвращаются карточками подтверждения. Если поставить `false`, web-чат выполнит подготовленные Notes AI действия сразу и вернет результаты в `executions[]`.
`dailyRequestLimit` и `dailyTokenLimit` можно отправить числом или `null`, чтобы снять лимит.

```bash
curl -s -X PATCH "$BASE_URL/ai/settings" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled":true,"allowReadSecrets":false,"requireActionConfirmation":true,"dailyRequestLimit":100,"dailyTokenLimit":200000,"providerName":"OpenAI-compatible","baseUrl":"https://api.openai.com/v1","model":"gpt-4.1-mini","apiKey":"sk-..."}'
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
- `apiKey`: optional string до 3000 символов;
- `allowReadSecrets`: optional boolean;
- `requireActionConfirmation`: optional boolean;
- `dailyRequestLimit`: optional integer от 1 до 10000 или `null`;
- `dailyTokenLimit`: optional integer от 1000 до 100000000 или `null`.

### POST `/api/ai/models/sync`

Синхронизирует список моделей через OpenAI-compatible endpoint `GET <baseUrl>/models`.
Модели, которые провайдер больше не возвращает, помечаются как устаревшие.
Та же синхронизация автоматически запускается backend раз в 24 часа для активных пользователей Notes AI, у которых есть сохраненный API key.
Метаданные качества, сортировки и цены берутся из локального `ai_model_catalog`: сначала из builtin seed, затем из удаленного справочника, если задан `AI_MODEL_CATALOG_URL`.

```bash
curl -s -X POST "$BASE_URL/ai/models/sync" \
  -H "Authorization: Bearer $TOKEN"
```

### POST `/api/ai/models/catalog/sync`

Admin-only endpoint. Принудительно обновляет локальный `ai_model_catalog` из URL, заданного в env `AI_MODEL_CATALOG_URL`.
Если переменная не задана, endpoint успешно завершается без изменений. Endpoint не ходит к пользовательскому provider API и не требует API key пользователя.

Поддерживаемый remote JSON:

```json
{
  "models": [
    {
      "id": "gpt-5.5",
      "label": "GPT-5.5",
      "tier": "paid",
      "quality": "high",
      "speed": "medium",
      "cost": "high",
      "score": 99,
      "speedScore": 62,
      "valueScore": 54,
      "sortRank": 5500,
      "inputPricePer1M": 0,
      "cachedInputPricePer1M": 0,
      "outputPricePer1M": 0,
      "capabilities": ["chat"],
      "deprecated": false
    }
  ]
}
```

Также допускается массив моделей без обертки `{ "models": [...] }`.

```bash
curl -s -X POST "$BASE_URL/ai/models/catalog/sync" \
  -H "Authorization: Bearer $TOKEN"
```

### POST `/api/ai/test-connection`

Проверяет подключение к provider через синхронизацию моделей и обновляет `lastConnectionCheckAt`.

```bash
curl -s -X POST "$BASE_URL/ai/test-connection" \
  -H "Authorization: Bearer $TOKEN"
```

### GET `/api/ai/usage/monthly`

Возвращает месячную статистику Notes AI текущего пользователя за текущий календарный месяц UTC: запросы, input/output tokens, общую известную стоимость и разбивку по моделям.
Стоимость считается по цене за 1 миллион токенов. Если для модели нет цены, `costUsd` будет `null`, `hasUnknownCost` станет `true`, а UI покажет `?`.

Response `200`:

```json
{
  "monthStart": "2026-05-01T00:00:00.000Z",
  "monthEnd": "2026-06-01T00:00:00.000Z",
  "requests": 12,
  "inputTokens": 18000,
  "outputTokens": 4200,
  "tokens": 22200,
  "knownCostUsd": 0.216,
  "hasUnknownCost": false,
  "models": [
    {
      "providerName": "OpenAI",
      "model": "gpt-5.5",
      "requests": 12,
      "inputTokens": 18000,
      "outputTokens": 4200,
      "tokens": 22200,
      "costUsd": 0.216,
      "inputPricePer1M": 5,
      "cachedInputPricePer1M": 0.5,
      "outputPricePer1M": 30
    }
  ]
}
```

```bash
curl -s "$BASE_URL/ai/usage/monthly" \
  -H "Authorization: Bearer $TOKEN"
```

### POST `/api/ai/chat`

Отправляет сообщение в выбранную модель через OpenAI-compatible endpoint `POST <baseUrl>/chat/completions`.
AI может вернуть текстовый ответ, список действий `actions[]` или результаты автоматического выполнения `executions[]`. Readonly tool-calls выполняются сразу. Если `requireActionConfirmation=true`, любые изменения заметок, тегов, шаблонов, версий или share links возвращаются как preview и требуют подтверждения через `POST /api/ai/actions/execute`. Если `requireActionConfirmation=false`, backend сразу выполняет mutation-действия web-чата и возвращает результаты в `executions[]`; если конкретное действие не удалось выполнить, текст ошибки возвращается в `message.content`, а сам `/api/ai/chat` не должен падать из-за одного неудачного auto-action.
Запрос может содержать `currentNote`, чтобы backend и модель знали текущую выбранную заметку для команд вроде “измени текущую заметку” или “напиши текст в уже созданной заметке”.
Developer prompt описывает доступные инструменты, схему заметок, формат `contentHtml/contentText`, правила форматирования, поля данных и порядок работы с поиском/чтением/редактированием.

Tool payload для действий с заметкой должен использовать `noteId`. Backend дополнительно принимает `id` и числовую строку как защиту от некорректного provider tool-call, но новые сценарии и документация должны использовать только `noteId`.
Если передан `currentNote`, prompt включает `id`, `name`, `contentText` и `contentHtml` текущей заметки с ограничением размера.
Frontend передает в `currentNote` актуальный draft редактора, поэтому AI-команды могут использовать текст, который пользователь уже набрал, но еще не сохранил вручную.
AI chat работает по LLM-first схеме: backend не перехватывает команды редактирования заметок до модели. Выбранная модель получает developer prompt, `currentNote`, историю и запрос пользователя, после чего сама должна вернуть нужный tool-call.
`currentNote` включает `id`, `name`, `contentHtml`, `contentText`. `contentHtml` нужен, чтобы команды добавления логина/пароля могли дописать поля данных к существующему содержимому заметки.
Если `currentNote` не передан, но команда явно указывает имя заметки, модель должна использовать `notes.search`, затем `notes.read`, и только после этого возвращать mutation tool-call.
Команды преобразования вроде “перенеси данные в секретные поля” используют `currentNote.contentText` и `currentNote.contentHtml`: модель сама извлекает значения из текста, например из строки `Логин - test, пароль - test12`, удаляет открытый текст с этими значениями и возвращает `notes.update` с полями данных.
Одиночные подтверждения текстом (`да`, `ок`, `yes`) не выполняют tool-call. При включенном `requireActionConfirmation` пользователь подтверждает мутации только кнопкой в карточке действия.
Backend не передает `temperature` в запрос чата, чтобы не ломать GPT-5/reasoning модели, которые могут не поддерживать sampling-параметры в выбранном режиме.
Служебная инструкция отправляется как `developer` message, что совместимо с новыми OpenAI моделями в Chat Completions.
Если provider возвращает ошибку, backend прокидывает короткий текст причины в 400-ответ.
Readonly и mutation tool-вызовы пишутся в `ai_audit_logs` без сырого payload: сохраняются имя tool, режим, `noteId`, если он есть, и список ключей payload.
Перед запросом backend проверяет дневные лимиты `dailyRequestLimit` и `dailyTokenLimit`. После ответа записывает `ai_usage_logs` с provider, model, input/output tokens. Если provider вернул `usage`, используются его значения; иначе применяется приблизительная оценка по длине текста.
Если `allowReadSecrets=false`, backend перед отправкой в модель маскирует secret/password/token значения в `currentNote`, `notes.read`, `notes.search`, `notes.semanticSearch`, `versions.list` и `templates.list`.

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
- `admin.users.list`, только для роли `admin`;
- `admin.stats.read`, только для роли `admin`.

Readonly `notes.read` возвращает модели не только метаданные, но и `contentText` заметки до 6000 символов, чтобы следующие ответы и мутации могли опираться на фактическое содержимое.
Readonly `notes.semanticSearch` принимает `query` и optional `limit`, строит embeddings через текущий provider `POST <baseUrl>/embeddings`, кэширует векторы в БД и возвращает результаты с `score`/`matchType`. Если provider не поддерживает embeddings или вернул ошибку, backend возвращает fallback-результаты обычного `notes.search`.
Mutation `notes.create` принимает optional `parentId`. Если `parentId` передан, заметка создается дочерней внутри существующей заметки текущего пользователя. Родительская заметка может одновременно хранить собственный текст и иметь дочерние заметки; отдельной сущности “папка” нет.
Mutation `notes.createNestedBatch` создает повторяемую вложенную структуру в одном действии. Payload: `scope` (`allActiveNotes`, `parentIds` или `recentNamedNotes`), `parentIds` для точечного режима, `parentNames`/`expectedParentCount`/`recentWithinMinutes` для выбора последних созданных заметок по имени, `childCount`, `nestedChildCount`, optional `childNamePattern`/`nestedNamePattern` с плейсхолдерами `{index}` и `{parent}`. Для `allActiveNotes` backend берет снимок активных заметок до создания новых записей, поэтому новые дочерние заметки не становятся родителями в том же batch. Для продолжения предыдущего batch вида “внутри каждой из новых двух заметок” Notes AI использует `recentNamedNotes`, например `parentNames=["Вложение 1","Вложение 2"]` и `expectedParentCount=20`.
Mutation `attachments.attachToNote` принимает `attachmentId` и optional `noteId`: если `noteId` передан, существующий файл аккаунта привязывается к заметке текущего пользователя; если `noteId` опущен или `null`, файл отвязывается от заметок. Backend проверяет ownership файла и заметки через `WorkspaceService`.
Mutation `notes.deleteAll` принимает `{"scope":"all"}` и переносит все активные заметки текущего пользователя в корзину. Это не окончательное удаление и не удаляет физические файлы аккаунта.
Readonly `admin.users.list` и `admin.stats.read` дополнительно проверяют backend-роль пользователя. Пользователь без роли `admin` получает отказ независимо от того, сгенерировала ли модель такой tool-call.

### GET `/api/ai/bots/admin-settings`

Admin-only endpoint. Возвращает глобальные настройки общих Telegram/VK ботов приложения.
Секретные значения не возвращаются: доступны только флаги `hasBotToken`, `hasAccessToken`, `hasSecret` и маски `botTokenHint`, `accessTokenHint`, `secretHint`.

```bash
curl -s "$BASE_URL/ai/bots/admin-settings" \
  -H "Authorization: Bearer $TOKEN"
```

### PATCH `/api/ai/bots/admin-settings/:provider`

Admin-only endpoint. Сохраняет настройки общего бота, где `provider` равен `telegram` или `vk`.
Telegram использует `botToken`, optional `secret` для webhook secret header и `webhookUrl`. VK использует `groupId`, `accessToken`, `secret`, `confirmationCode` и `webhookUrl`.
`allowSecrets` и `requireConfirmation` задают глобальную политику безопасности бота.
`dailyRequestLimit`, `dailyReadLimit`, `dailyWriteLimit` задают глобальные дневные лимиты сообщений, readonly-tool вызовов и mutation-действий. Каждый лимит можно передать числом от 1 до 10000 или `null`, чтобы снять ограничение.

```bash
curl -s -X PATCH "$BASE_URL/ai/bots/admin-settings/telegram" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled":true,"webhookUrl":"https://example.com/api/ai/bots/telegram/webhook","botToken":"123:secret","secret":"webhook-secret","requireConfirmation":true,"allowSecrets":false,"dailyRequestLimit":100,"dailyReadLimit":200,"dailyWriteLimit":25}'
```

### POST `/api/ai/bots/admin-settings/:provider/test`

Admin-only endpoint. Проверяет подключение к Telegram или VK по сохраненным настройкам.
Для Telegram вызывается `getMe`, для VK проверяется `groups.getById`.
Результат проверки сохраняется в `lastCheckAt`, `lastCheckStatus`, `lastCheckError`.

```bash
curl -s -X POST "$BASE_URL/ai/bots/admin-settings/telegram/test" \
  -H "Authorization: Bearer $TOKEN"
```

### GET `/api/ai/bots/me`

Возвращает пользовательские настройки Telegram/VK-привязки и разрешений.

```bash
curl -s "$BASE_URL/ai/bots/me" \
  -H "Authorization: Bearer $TOKEN"
```

Ответ содержит `permissions`:

```json
{
  "provider": "telegram",
  "enabled": true,
  "accessMode": "write",
  "allowSecrets": false,
  "permissions": {
    "readNotes": true,
    "writeNotes": true,
    "deleteNotes": false,
    "manageTags": true,
    "useTemplates": false,
    "useVersions": false,
    "listAttachments": true,
    "createShareLinks": false
  },
  "dailyRequestLimit": null,
  "dailyReadLimit": null,
  "dailyWriteLimit": null,
  "linkedExternalId": "123",
  "linkedUsername": "user",
  "linkedAt": "2026-05-05T10:30:00.000Z"
}
```

### PATCH `/api/ai/bots/me/:provider`

Обновляет пользовательскую политику доступа бота к личным данным: `enabled`, `accessMode`, `allowSecrets`, `permissions`, `dailyRequestLimit`, `dailyReadLimit`, `dailyWriteLimit`.
Полноценная привязка внешнего аккаунта выполняется через одноразовый код.
`permissions` можно передавать частично: backend сохранит только переданные флаги и не доверяет frontend при выполнении команд.

```bash
curl -s -X PATCH "$BASE_URL/ai/bots/me/telegram" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled":true,"accessMode":"write","allowSecrets":false,"dailyRequestLimit":50,"dailyReadLimit":120,"dailyWriteLimit":20,"permissions":{"readNotes":true,"writeNotes":true,"deleteNotes":false,"listAttachments":true}}'
```

### POST `/api/ai/bots/link-code`

Создает одноразовый код привязки Telegram/VK аккаунта к текущему пользователю.
Код действует 10 минут, имеет формат `XXXX-XXXX-XXXX-XXXX-XXXX`, в БД хранится только hash. При генерации нового кода старые коды этого пользователя для выбранного provider удаляются. Backend дополнительно проверяет, что активного кода с таким hash у provider нет. Старый короткий формат кодов не принимается.

```bash
curl -s -X POST "$BASE_URL/ai/bots/link-code" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"provider":"telegram"}'
```

### POST `/api/ai/bots/telegram/webhook`

Публичный webhook endpoint для Telegram. Auth token приложения не нужен: доступ ограничивается включенным admin-настройками бота, сохраненным bot token и optional `X-Telegram-Bot-Api-Secret-Token`, если `secret` задан в настройках Telegram-интеграции.

Поведение:

- сообщение с одноразовым кодом привязывает Telegram user id к пользователю приложения;
- непривязанный аккаунт получает короткую инструкцию создать код в настройках Notes AI;
- привязанный аккаунт отправляет текст в тот же Notes AI pipeline, что и UI-чат;
- если привязанный аккаунт отправляет voice/audio message без текста, backend скачивает аудио во временный memory-buffer, проверяет лимит 25 MB, распознает его через активный AI provider пользователя (`/audio/transcriptions`, модель `AI_TRANSCRIPTION_MODEL`, default `whisper-1`) и отправляет расшифровку в тот же Notes AI pipeline;
- Notes AI получает только те tools, которые разрешены матрицей `permissions`; при включенном праве чтения доступны `notes.search`, `notes.semanticSearch` и `notes.read`;
- при включенном доступе к файлам доступны `attachments.list`, а в режиме изменений дополнительно `attachments.attachToNote`;
- для привязанного пользователя с ролью `admin` доступны readonly tools `admin.users.list` и `admin.stats.read`;
- runtime пишет `ai_bot_usage_logs` и проверяет раздельные дневные лимиты: `message` для входящих сообщений, `read` для readonly-tool вызовов, `write` для подтвержденных или автоматически выполненных mutation-действий;
- mutation tools требуют `accessMode: "write"` и соответствующий permission-флаг; если включено подтверждение, действие сохраняется как pending action на 10 минут;
- перед выполнением pending action backend повторно проверяет актуальные permissions, поэтому действие не выполнится, если право было выключено после создания preview;
- подтверждение в чате: `подтвердить` или `подтвердить <id>`.

```bash
curl -s -X POST "$BASE_URL/ai/bots/telegram/webhook" \
  -H "Content-Type: application/json" \
  -H "X-Telegram-Bot-Api-Secret-Token: webhook-secret" \
  -d '{"message":{"chat":{"id":123},"from":{"id":123,"username":"user"},"text":"найди заметки про postgres"}}'
```

### POST `/api/ai/bots/vk/webhook`

Публичный webhook endpoint для VK Callback API. Для `confirmation` возвращает `confirmationCode`, для `message_new` проверяет `secret` и `group_id`, если они заданы в admin-настройках.

Поведение привязки, выполнения команд и подтверждения действий совпадает с Telegram runtime.

```bash
curl -s -X POST "$BASE_URL/ai/bots/vk/webhook" \
  -H "Content-Type: application/json" \
  -d '{"type":"message_new","group_id":123,"secret":"secret","object":{"message":{"from_id":456,"peer_id":456,"text":"найди заметки про деплой"}}}'
```

## Subscriptions

### GET `/api/subscription-plans`

Каталог активных тарифов (для витрины в личном кабинете).

### GET `/api/me/subscription`

Текущая подписка, effective entitlements и `storageUsedBytes`.

### POST `/api/subscription/checkout`

Создаёт заказ на смену тарифа. Body: `{ "planId": 2 }`.

### POST `/api/subscription/checkout/:orderId/confirm`

Mock-подтверждение оплаты; активирует подписку.

Ошибки enforcement (AI, upload):

- `403` + `code: "SUBSCRIPTION_REQUIRED"`
- `403` + `code: "STORAGE_LIMIT_EXCEEDED"`

### Admin subscription plans

- `GET /api/admin/subscription-plans`
- `POST /api/admin/subscription-plans`
- `PATCH /api/admin/subscription-plans/:id`
- `DELETE /api/admin/subscription-plans/:id`
- `POST /api/admin/subscription-plans/assign/:userId` — body `{ "planId": 2 }`

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

Создает пользователя. Email сохраняется без подтверждения — пользователь создается администратором. Если `role` не передан, используется `user`.

Request:

```json
{
  "username": "bob",
  "email": "bob@example.com",
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
  -d '{"username":"bob","email":"bob@example.com","password":"bobpass"}'
```

Ошибки:

- `400` - неверный payload, username, email или password;
- `409` - username или email уже заняты.

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

### GET `/api/admin/monitoring/actions?limit=100`

Действия пользователей без событий подписок (`subscription.*` вынесены в отдельную вкладку).

Query `limit`: число от 1 до 200, по умолчанию `100`.

### GET `/api/admin/monitoring/subscriptions?limit=100`

События подписок: оплаченные/неуспешные/отменённые заказы (`checkout`) и назначения админом или миграции (`admin_grant`, `migration`). Включает сумму, срок, окончание, всего потрачено и дату последней покупки.

Query `limit`: число от 1 до 200, по умолчанию `100`.

### GET `/api/admin/monitoring/errors?limit=100`

Неуспешные API-запросы (4xx/5xx, кроме 401/404) с расшифровкой ошибки и JSON-телом ответа. Чувствительные поля (`password`, `token`, `secret`, `apiKey`, `authorization` и т.п.) редактируются до записи.

Не логируются частые UI-запросы: health, polling регистрации, дерево заметок, admin stats/monitoring, auth login/register, AI bot webhooks.

Записи старше 90 дней удаляются при старте сервиса.

Query `limit`: число от 1 до 200, по умолчанию `100`.

### GET `/api/admin/monitoring/performance?range=day`

Метрики нагрузки сервиса за период `hour|day|week|month`: количество запросов, среднее/макс. время, ошибки (по тем же правилам, что и вкладка «Ошибки»), память процесса и системы, load average, buckets по времени.

Метрики хранятся **в памяти текущего процесса** (до 7 дней, до 12 000 сэмплов) и сбрасываются при перезапуске. В multi-instance окружении каждый инстанс показывает только свои данные.

Модель действий:

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
curl -s "$BASE_URL/admin/monitoring/actions?limit=50" \
  -H "Authorization: Bearer $TOKEN"
```

### GET `/api/admin/stats?range=week`

Агрегированная статистика.

Query `range` управляет графиком активности:

- `day` - последние 24 часа по часам;
- `week` - последние 7 дней по дням, значение по умолчанию;
- `month` - последние 30 дней по дням;
- `year` - последние 12 месяцев по месяцам.

Ответ включает общие счетчики, файловое хранилище, отвязанные от заметок файлы, активные публичные ссылки, LLM/Notes AI агрегаты, активность за выбранный период, топ пользователей по объему файлов, топ пользователей по действиям, топ выбранных LLM-моделей и месячные расходы Notes AI по каждому пользователю.
В `topActivityUsers.username` используется пользователь-цель события, затем инициатор события, а для удаленных пользователей возвращается `unknown`.
В `aiMonthlySpendUsers[]` стоимость считается по моделям за текущий календарный месяц UTC. Если цена модели неизвестна, `costUsd` будет `null`, а сумма пользователя выводится как известная часть `knownCostUsd` плюс признак `hasUnknownCost`.

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
  "aiMonthlySpendUsers": [
    {
      "userId": 1,
      "username": "admin",
      "requests": 12,
      "inputTokens": 18000,
      "outputTokens": 4200,
      "tokens": 22200,
      "knownCostUsd": 0.216,
      "hasUnknownCost": false,
      "models": [
        {
          "providerName": "OpenAI",
          "model": "gpt-5.5",
          "requests": 12,
          "inputTokens": 18000,
          "outputTokens": 4200,
          "tokens": 22200,
          "costUsd": 0.216
        }
      ]
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
  -d '{"username":"admin","password":"adm136479"}' \
  | node -pe "JSON.parse(require('fs').readFileSync(0, 'utf8')).token")

curl -s "$BASE_URL/me" -H "Authorization: Bearer $TOKEN"

BOB_ID=$(curl -s -X POST "$BASE_URL/admin/users" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username":"bob","email":"bob@example.com","password":"bobpass"}' \
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
curl -s "$BASE_URL/admin/monitoring/actions?limit=50" -H "Authorization: Bearer $TOKEN"
curl -s "$BASE_URL/admin/stats" -H "Authorization: Bearer $TOKEN"

curl -s -X DELETE "$BASE_URL/admin/users/$BOB_ID" \
  -H "Authorization: Bearer $TOKEN"
```
