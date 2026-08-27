# Development

The workspace and Compose project are the only supported runtime.

## Prerequisites

- Node.js 24 or newer.
- pnpm 11.20.0 through Corepack or a direct installation.
- Docker Desktop with Docker Compose v2.
- Strong `BETTER_AUTH_SECRET` and `INTERNAL_INTEGRATION_SECRET` values in the untracked `infra/compose/.env` file. Start from `.env.example`; never reuse local values in production and restrict file access to the service account.

## Workspace Checks

```sh
pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` runs formatting validation, ESLint, strict TypeScript checks, unit tests, and production builds for every workspace.

## Start And Stop

```sh
pnpm compose:up
pnpm compose:down
```

The seven persistent services are core dependencies and start together. The
observability profile is optional.

Start the optional local Prometheus, Alertmanager, OpenTelemetry Collector, and Tempo stack when validating metrics, alerts, and traces:

```sh
docker compose -f infra/compose/compose.yml -f infra/compose/compose.observability.yml --profile observability up --build --detach --wait
pnpm metrics:verify
pnpm traces:verify
pnpm alerting:verify
```

## Autostart After Host Reboot

Long-running services use Docker restart policy `unless-stopped`: `web`, `api`, `worker`, `postgres`, `redis`, `object-storage`, `mail`, and optional `prometheus`, `otel-collector`, and `tempo`. One-shot initialization, migration, storage-permission, import, and verification containers intentionally use `restart: "no"` and should be rerun through Compose commands when their job is needed.

On a Windows workstation, enable Docker Desktop's `Start Docker Desktop when you sign in` option and keep its `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run` entry. Docker Desktop starts after that user signs in; a Windows or Linux server that must recover before interactive login should run Docker Engine as an operating-system service instead. On Linux, enable the installed engine with `systemctl enable --now docker`. Once Docker Engine starts, the existing containers are restored without re-running one-shot jobs.

Compose reads `infra/compose/.env` automatically because that directory owns the Compose project. Keep this file on the host so `ps`, rebuilds, migrations, and controlled restarts remain available after reboot; container restart itself does not reread the file.

| Service       | Local endpoint                     |
| ------------- | ---------------------------------- |
| Next.js web   | `http://localhost:3200`            |
| NestJS API    | `http://localhost:3201/api/health` |
| Worker health | `http://localhost:3202/ready`      |
| PostgreSQL    | `localhost:55432`                  |
| Redis         | `localhost:56379`                  |
| MinIO API     | `http://localhost:19000`           |
| MinIO console | `http://localhost:19001`           |
| Mailpit inbox | `http://localhost:18025`           |
| Mailpit SMTP  | `127.0.0.1:11025`                  |
| Prometheus    | `http://127.0.0.1:19090`           |
| Alertmanager  | `http://127.0.0.1:19093`           |
| OTLP/HTTP     | `http://127.0.0.1:14318`           |
| Tempo API     | `http://127.0.0.1:19100`           |

## Verification

```sh
docker compose -f infra/compose/compose.yml up --build --detach --wait
docker compose -f infra/compose/compose.yml ps
```

Verify HTTP 200 responses from the web root, both web/API health routes, the worker health route, and MinIO live health route. Application logs must contain no module-resolution errors or Next.js standalone warnings.

Run the checks that match the changed boundary:

```sh
pnpm db:verify
pnpm files:verify
pnpm integrations:verify
pnpm billing:verify
pnpm correlation:verify
pnpm metrics:verify
pnpm traces:verify
pnpm alerting:verify
pnpm openapi:verify
pnpm load:verify
pnpm db:verify-backup-restore
pnpm files:verify-backup-restore
pnpm cutover:verify
pnpm observe:verify
pnpm audit --prod
```

Database/object checks require the local Compose values from
`infra/compose/.env`. Browser acceptance requires a running web/API stack:

```powershell
$env:WEB_BASE_URL = "http://localhost:3200"
pnpm audit:web
Remove-Item Env:WEB_BASE_URL
```

The browser suite covers desktop, 390 px, and 320 px workflows, overflow, and
serious/critical accessibility findings. External provider calls are verified
only when real credentials and an explicitly approved test environment exist.

Prometheus and Alertmanager are intentionally bound to loopback. Prometheus persists 15 days of data and monitors target loss, API 5xx ratio, and worker job failure. Local alert delivery uses Mailpit; production must configure managed SMTP or a protected webhook.

Collector and Tempo are also loopback-only on the host. Traces are retained in
the Tempo named volume for seven days; the one-shot `tempo-init` container only
prepares that volume for Tempo's non-root UID. The default Compose stack leaves
trace export disabled, so API and worker do not attempt exports when the
optional override is absent.

The CI workflow performs the same workspace, Compose, and HTTP smoke checks on a clean runner.

## Persistent Data

The stack uses named volumes for PostgreSQL, Redis, objects, Prometheus, and
Tempo. A normal `down` keeps them. Do not use `down --volumes` locally unless
deleting all project data is intentional.

Configuration is supplied at runtime through environment variables. The committed values are local-only defaults; production secrets must come from the deployment secret store and must never be baked into an image.

The local Compose files are not a public-server configuration. Use the
production override, immutable GHCR images, Caddy boundary, external SMTP, and
backup workflow documented in [Production](./production.md).
