# Production

Status: production Compose assets are validated locally; deployment to a real
host, public DNS, ACME, external SMTP, and off-host restore remain environment
acceptance gates.

## Topology

The supported single-host production topology uses three Compose files in this
order:

1. `infra/compose/compose.yml` defines the application and stateful services.
2. `infra/compose/compose.observability.yml` adds Prometheus, Alertmanager,
   OpenTelemetry Collector, and Tempo.
3. `infra/compose/compose.production.yml` replaces local builds with immutable
   GHCR images, closes internal host ports, requires production secrets, enables
   resource and log limits, and adds Caddy.

Only Caddy publishes public ports `80/tcp`, `443/tcp`, and `443/udp`. Caddy
routes the application domain to Next.js and the object-storage domain to the
MinIO S3 API. PostgreSQL, Redis, MinIO console, API, worker, and Mailpit are not
published. Prometheus, Alertmanager, OTLP, and Tempo remain bound to
`127.0.0.1` for SSH-tunnel or host-local operator access.

Caddy does not write request access logs because authentication callbacks,
public-share paths, and presigned S3 query strings can contain sensitive tokens.
The public object endpoint also rejects MinIO Admin API paths; administration
uses the internal Compose network.

## Host And DNS

Use a maintained Linux distribution with Docker Engine and the Compose plugin.
Enable Docker before deployment:

```sh
sudo systemctl enable --now docker
```

Create DNS `A` and, when available, `AAAA` records for both public names:

- `notes.example.com` for the application.
- `files.notes.example.com` for S3-compatible uploads and downloads.

Allow inbound SSH from the operator network and public `80/tcp`, `443/tcp`,
and `443/udp`. Deny public access to every other project port. Caddy obtains and
renews TLS certificates automatically after DNS resolves to the host.

## Release Images

The publish workflow verifies the workspace and dependency audit, then pushes
API, web, worker, and database-migration images to GHCR. Production references
must use registry digests, for example:

```text
ghcr.io/owner/repository-api@sha256:...
```

Do not deploy `latest`, branch tags, or other mutable references. Authenticate
the server with a read-only GHCR token:

```sh
printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
```

## Configuration

Keep the checkout and configuration under a restricted service account:

```sh
sudo install -d -m 750 /opt/notes-ai/config /var/backups/notes-ai
cp infra/compose/production.env.example /opt/notes-ai/config/.env.production
cp infra/observability/alertmanager.production.example.yml \
  /opt/notes-ai/config/alertmanager.yml
sudo chmod 600 /opt/notes-ai/config/.env.production \
  /opt/notes-ai/config/alertmanager.yml
```

Replace every placeholder. Use separate random values for authentication,
integration signing, encryption, PostgreSQL, Redis, MinIO root, and MinIO
application credentials. `POSTGRES_PASSWORD` and `REDIS_PASSWORD` must be
URL-safe and must match their encoded values in `DATABASE_URL` and `REDIS_URL`.
Keep old encryption keys only during an intentional rotation read window.

The Alertmanager configuration is deliberately outside Git because standard
Alertmanager SMTP configuration contains credentials. Replace its example
addresses and SMTP settings before enabling the `observability` profile.

## Validate And Deploy

The operational wrapper always applies the files in the supported order:

```sh
export NOTES_ENV_FILE=/opt/notes-ai/config/.env.production
sh infra/compose/production.sh config
sh infra/compose/production.sh pull
sh infra/compose/production.sh deploy
sh infra/compose/production.sh status
```

`deploy` validates configuration and pulls pinned images before the maintenance
window. When an existing database is running, it temporarily stops Caddy, web,
API, and worker, creates a matched PostgreSQL and object backup, then runs the
one-shot migration and bucket initialization and starts the new stack. A backup
failure restarts the stopped release; a failed migration or rollout remains
stopped or unhealthy for operator review instead of silently reopening writes.
The wrapper waits for health checks, probes web, API, and worker from inside the
network, and never removes named volumes.

After the first deployment, verify the real public boundary:

```sh
curl --fail --show-error https://notes.example.com/api/health
curl --fail --show-error https://files.notes.example.com/minio/health/live
```

Then run production browser acceptance on the real domain, including login,
email verification, TOTP, Passkey registration, notes, files, public links, AI,
and messenger integrations. Local build or Compose health does not prove these
external contracts.

## Backups

Run a matched logical database and object backup manually or from a systemd
timer:

```sh
export NOTES_ENV_FILE=/opt/notes-ai/config/.env.production
export NOTES_BACKUP_ROOT=/var/backups/notes-ai
sh infra/compose/production.sh backup
```

The wrapper stops public and background write paths while it captures the pair,
then resumes the same containers. Each timestamped directory contains
`postgres.dump`, an object mirror, image references, and SHA-256 manifests. Copy
every completed directory to durable off-host storage. A backup remaining only
on the application host is not a disaster-recovery backup. Periodically restore
a copy into an isolated stack and reconcile database rows and object hashes. As
data grows, replace this maintenance-window copy with coordinated PostgreSQL and
versioned-object-storage snapshots rather than accepting an unbounded pause.

## Rollback

Keep the previous production env file, image digests, Alertmanager config, and
matched backup pair immutable during the observation window.

For an application-only rollback with a schema-compatible release, point
`NOTES_ENV_FILE` to the previous env file and run `production.sh deploy`. The
wrapper captures the current state before switching images.

When a migration is not backward-compatible, stop public traffic and restore
the PostgreSQL dump and object mirror from the same backup timestamp. Never mix
database metadata from one snapshot with objects from another. Verify hashes,
database invariants, authentication, files, public links, and health endpoints
before starting Caddy and reopening writes. Do not use `down --volumes` for
rollback.

## Operations

Inspect bounded logs and status with:

```sh
sh infra/compose/production.sh status
sh infra/compose/production.sh logs api
```

Use SSH tunnels for operator-only endpoints rather than publishing them:

```sh
ssh -L 19090:127.0.0.1:19090 -L 19093:127.0.0.1:19093 user@server
```

Monitor filesystem capacity, PostgreSQL and object backup completion, container
restarts, API latency/error rate, worker failures, Caddy certificate renewal,
and restore-test age. Rotate application and SMTP credentials through a planned
deployment and retain previous encryption keys only for the documented read
window.
