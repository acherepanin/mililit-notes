# REST API и cURL

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

В PowerShell на Windows для примеров cURL используйте `curl.exe`, чтобы не попасть в alias `Invoke-WebRequest`.

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

`ValidationPipe` настроен с `whitelist`, `forbidNonWhitelisted` и `transform`.

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

- `401` - неверный логин или пароль.

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

Ошибки:

- `401` - нет токена, токен неверный, истек или пользователь удален.

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

Response `200`: объект `AuthUser`.

cURL:

```bash
curl -s -X PATCH "$BASE_URL/me/preferences" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"language":"en","theme":"light"}'
```

Ошибки:

- `400` - неверное значение;
- `401` - нет валидной авторизации.

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
  userId: number;
  name: string;
  contentHtml: string;
  contentText: string;
  parentId: number | null;
  position: number;
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
  children: NoteTreeNode[];
}
```

### GET `/api/notes/tree`

Дерево заметок текущего пользователя.

Response `200`:

```json
[
  {
    "id": 1,
    "name": "Welcome",
    "parentId": null,
    "children": []
  }
]
```

cURL:

```bash
curl -s "$BASE_URL/notes/tree" \
  -H "Authorization: Bearer $TOKEN"
```

### GET `/api/notes/:id`

Одна заметка текущего пользователя.

Response `200`:

```json
{
  "id": 1,
  "userId": 1,
  "name": "Welcome",
  "contentHtml": "<h2>Notes</h2>",
  "contentText": "Notes",
  "parentId": null,
  "position": 0,
  "createdAt": "2026-05-02T09:16:23.000Z",
  "updatedAt": "2026-05-02T09:16:23.000Z"
}
```

cURL:

```bash
curl -s "$BASE_URL/notes/1" \
  -H "Authorization: Bearer $TOKEN"
```

Ошибки:

- `400` - `id` не число;
- `404` - заметка не найдена или принадлежит другому пользователю.

### POST `/api/notes`

Создает заметку текущего пользователя.

Request:

```json
{
  "name": "New note",
  "parentId": null
}
```

Validation:

- `name`: string, 1..120 символов;
- `parentId`: optional, integer >= 1 или `null`.

Response `201`: объект `Note`.

cURL, корневая заметка:

```bash
curl -s -X POST "$BASE_URL/notes" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"API note","parentId":null}'
```

cURL, дочерняя заметка:

```bash
curl -s -X POST "$BASE_URL/notes" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Child note","parentId":1}'
```

Ошибки:

- `400` - неверный payload или пустое имя после trim;
- `404` - parent не найден у текущего пользователя.

### PATCH `/api/notes/:id`

Частично обновляет заметку текущего пользователя.

Request:

```json
{
  "name": "Updated note",
  "contentHtml": "<p>Hello</p>",
  "contentText": "Hello"
}
```

Validation:

- `name`: optional, string, 1..120 символов;
- `contentHtml`: optional, string;
- `contentText`: optional, string.

Response `200`: объект `Note`.

cURL:

```bash
curl -s -X PATCH "$BASE_URL/notes/1" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"contentHtml":"<pre><code class=\"language-json\">{\"ok\":true}</code></pre>","contentText":"{\"ok\":true}"}'
```

Ошибки:

- `400` - неверный payload;
- `404` - заметка не найдена или принадлежит другому пользователю.

### PATCH `/api/notes/:id/move`

Переносит заметку текущего пользователя.

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

Response `200`: объект `Note`.

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

Response `200`:

```json
{
  "id": 1
}
```

cURL:

```bash
curl -s -X DELETE "$BASE_URL/notes/1" \
  -H "Authorization: Bearer $TOKEN"
```

Ошибки:

- `404` - заметка не найдена или принадлежит другому пользователю.

## Admin

Все admin endpoints требуют роль `admin`.

Ошибки:

- `401` - нет валидного Bearer-токена;
- `403` - пользователь не admin.

### Модель `AdminUser`

```ts
interface AdminUser {
  id: number;
  username: string;
  role: 'user' | 'admin';
  language: 'ru' | 'en';
  theme: 'light' | 'dark';
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  notesCount: number;
}
```

### GET `/api/admin/users`

Список пользователей.

Response `200`:

```json
[
  {
    "id": 1,
    "username": "admin",
    "role": "admin",
    "language": "ru",
    "theme": "dark",
    "lastLoginAt": "2026-05-02T09:16:23.000Z",
    "createdAt": "2026-05-02T09:00:00.000Z",
    "updatedAt": "2026-05-02T09:16:23.000Z",
    "notesCount": 1
  }
]
```

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

Validation:

- `username`: string, 1..80;
- `password`: string, 1..200;
- `role`: optional, `user` или `admin`;
- `language`: optional, `ru` или `en`;
- `theme`: optional, `light` или `dark`.

Response `201`: объект `AdminUser`.

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

Все поля optional. Если `password` не передан, пароль не меняется. При включенном `ValidationPipe` с `forbidNonWhitelisted` поля `username`, `language`, `theme` и любые другие лишние поля вернут `400`.

Response `200`: объект `AdminUser`.

cURL:

```bash
curl -s -X PATCH "$BASE_URL/admin/users/2" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"role":"admin","password":"newpass"}'
```

Ошибки:

- `400` - неверный payload или попытка оставить систему без admin;
- `404` - пользователь не найден;

### DELETE `/api/admin/users/:id`

Удаляет пользователя и все его заметки.

Response `200`:

```json
{
  "id": 2
}
```

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

Response `200`:

```json
[
  {
    "id": 6,
    "actorId": 1,
    "actorUsername": "admin",
    "userId": 2,
    "userUsername": "bob",
    "action": "admin.user.delete",
    "targetType": "user",
    "targetId": 2,
    "details": {
      "username": "bob",
      "role": "user",
      "notesCount": 1
    },
    "createdAt": "2026-05-02T09:16:23.000Z"
  }
]
```

cURL:

```bash
curl -s "$BASE_URL/admin/activity?limit=50" \
  -H "Authorization: Bearer $TOKEN"
```

### GET `/api/admin/stats`

Агрегированная статистика.

Response `200`:

```json
{
  "usersTotal": 2,
  "adminsTotal": 1,
  "notesTotal": 5,
  "activityTotal": 12,
  "lastLoginAt": "2026-05-02T09:16:23.000Z",
  "activeUsersToday": 2
}
```

cURL:

```bash
curl -s "$BASE_URL/admin/stats" \
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
