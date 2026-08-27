# Notes AI

Self-hosted knowledge workspace for notes, files, public sharing, AI workflows,
subscriptions, Telegram/VK integrations, and administration.

## Repository

```text
apps/
  web/       Next.js user interface and browser API clients
  api/       NestJS HTTP API, authorization, AI, files, and integrations
  worker/    BullMQ jobs, email, retention, and integration processing
packages/
  config/    validated environment configuration
  db/        Drizzle schema, migrations, imports, and data verification
infra/
  compose/   local and production Compose definitions
  observability/ Prometheus, Alertmanager, OpenTelemetry, and Tempo
docs/        current architecture, functionality, UI, and runbooks
```

The repository root intentionally contains only workspace configuration,
dependency manifests, this entrypoint, and contributor rules. Generated build
output, IDE metadata, reports, and the removed legacy application do not belong
in source control.

## Local Start

Requirements: Node.js 24+, pnpm 11.20.0, Docker Desktop, and an untracked
`infra/compose/.env` based on `.env.example`.

```powershell
pnpm install --frozen-lockfile
pnpm compose:up
```

| Service | URL |
| --- | --- |
| Web | `http://localhost:3200` |
| API health | `http://localhost:3201/api/health` |
| Worker readiness | `http://localhost:3202/ready` |
| Mailpit | `http://localhost:18025` |
| MinIO console | `http://localhost:19001` |

`pnpm compose:down` preserves named volumes. Never add `--volumes` unless
permanent deletion of local data is intentional and backed up.

## Verification

```powershell
pnpm check
pnpm audit --prod

$env:WEB_BASE_URL = "http://localhost:3200"
pnpm audit:web
Remove-Item Env:WEB_BASE_URL
```

`pnpm check` runs formatting, lint, strict TypeScript, unit tests, and all
production builds. Database, object storage, integrations, browser behavior,
and production infrastructure have separate verification commands documented
in [Development](./docs/development.md).

## Documentation

- [Architecture and libraries](./docs/architecture.md)
- [Current functionality](./docs/functionality.md)
- [Frontend structure and component catalog](./docs/frontend.md)
- [Development and verification](./docs/development.md)
- [Data migration](./docs/migration.md)
- [Production deployment and operations](./docs/production.md)
- [Remaining production work](./docs/remaining-work.md)

Read [AGENTS.md](./AGENTS.md) before changing the project. It identifies the
existing ownership boundaries and reuse rules intended to prevent duplicate
components, API clients, and infrastructure.

## Security

Never commit `.env` files, credentials, provider keys, bot tokens, session
secrets, or production exports. API routes are private by default, permissions
are enforced on the server, and PostgreSQL changes require a versioned Drizzle
migration. Build success alone is not evidence of runtime or provider behavior.
