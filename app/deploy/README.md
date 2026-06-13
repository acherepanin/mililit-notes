# Deployment & environments

This folder contains everything related to running and deploying the Notes
application: the Docker image definition, local and production compose files,
the remote deploy script, and the layered environment configuration.

## Environment files (layered)

The backend uses three committed env files (`app/back/`):

| File       | Loaded when      | Purpose                                                        |
|------------|------------------|---------------------------------------------------------------|
| `.env`     | always (base)    | All default values.                                           |
| `.env.dev`  | `APP_ENV=dev`    | Development overrides on top of `.env`.                       |
| `.env.prod` | `APP_ENV=prod`   | Production overrides on top of `.env`. Baked into the image.  |

Resolution order (first wins, real process env always wins last):

```
process env  >  .env.<APP_ENV>  >  .env
```

`APP_ENV` is selected by the npm scripts:

- `npm run start:dev` → `APP_ENV=dev`
- `npm run start`     → `APP_ENV=prod`

These env files are intentionally **committed to git** and **baked into the
image**. They are not gitignored or dockerignored.

## Database

PostgreSQL with a role and database created on first container start:

- user: `admin`
- password: `adm136479`
- database: `notes`

TypeORM runs with `DB_SYNCHRONIZE=true`, so the schema is created from the
entities on startup — no migrations, fresh start.

## Local development (Docker Desktop, Windows)

Run the full stack (Postgres + app) from the `app/` directory:

```bash
docker compose -f deploy/docker-compose.dev.yml up --build
```

App: http://localhost:3000 · Postgres: localhost:5432

Alternative (backend on host, Postgres in Docker): start only the `postgres`
service, then run `npm run start:dev` in `app/back` (it uses `DB_HOST=localhost`
from `.env`).

## Build the image

From the `app/` directory:

```bash
docker build -f deploy/Dockerfile -t notes-app:latest .
```

The build context is `app/` because the image bundles both `front/` and `back/`.

## Publish to GHCR

`.github/workflows/publish-image.yml` builds and pushes the image to
`ghcr.io/<owner>/<repo>` on pushes to `main`/`master` and on `v*` tags.
It uses the built-in `GITHUB_TOKEN` (no extra secrets needed). Make sure the
package visibility is set as desired in the repository settings.

## Production deploy

The production compose (`docker-compose.yml`) is deliberately minimal and passes
**no configuration** to the app (everything is baked into the image). Only
Postgres receives the credentials it needs to create the `admin` role and
`notes` database — these must match `.env.prod`.

1. Edit `.env` (image ref + SSH target). Keep `IMAGE` in sync with the `image:`
   field in `docker-compose.yml`.
2. Build and push the image, then deploy. From `app/back`:

```bash
npm run image:push   # bash ../deploy/deploy.sh push
npm run deploy       # bash ../deploy/deploy.sh deploy
```

Or call the script directly from `app/deploy`:

```bash
./deploy.sh push     # собрать и запушить образ
./deploy.sh pull     # спулить образ
./deploy.sh deploy   # отправить compose, спулить, перезапустить, очистить
```

`deploy` copies `docker-compose.yml` to the server, runs `docker compose pull` +
`up -d --remove-orphans`, then prunes stopped containers, dangling images and
build cache.

On the server you can also run it directly:

```bash
docker compose up -d
```
