# Remaining Work

Last reviewed: 2026-08-27.

Repository implementation, local production builds, unit tests, dependency
audit, Compose assets, and deployment scripts are complete. The remaining work
is release management and acceptance in the real server environment.

Update this file when a task is completed. Mark an item complete only with the
evidence named below; never add credentials, tokens, private hostnames, or
production data to this document.

## 1. Freeze And Publish The Release

- [ ] Review the current worktree and commit the monorepo, legacy deletion,
  documentation cleanup, and production assets.
- [ ] Push the release commit to the protected remote branch.
- [ ] Run the image publishing workflow for API, web, worker, and database
  migration images.
- [ ] Record the immutable GHCR digest for each image and put those digest
  references in the external production env file.

Evidence: clean intended Git status, successful CI run, four pullable image
digests, and no mutable tag in the production configuration.

## 2. Prepare The Host And Network

- [ ] Provision a maintained Linux host and restricted service account.
- [ ] Install and enable Docker Engine and the Compose plugin.
- [ ] Create application and object-storage DNS records pointing to the host.
- [ ] Restrict inbound traffic to operator SSH and public ports 80/443. Keep
  PostgreSQL, Redis, MinIO administration, API, worker, and observability ports
  private.
- [ ] Create restricted configuration and backup directories described in
  [Production](./production.md).

Evidence: Docker survives a host restart, DNS resolves to the server, and an
external port scan exposes only the intended ports.

## 3. Configure Production Secrets And Providers

- [ ] Create `/opt/notes-ai/config/.env.production` from
  `infra/compose/production.env.example` and replace every placeholder.
- [ ] Use separate strong values for session, internal signing, encryption,
  PostgreSQL, Redis, MinIO root, and MinIO application credentials.
- [ ] Configure the final public application and object-storage origins.
- [ ] Configure external SMTP for verification, recovery, notifications, and
  Alertmanager delivery.
- [ ] Configure the required AI provider credentials, endpoint allowlist, model
  access, routing, quotas, and voice support.
- [ ] Configure Telegram and VK tokens, secrets, and public webhook addresses
  when those integrations are enabled.

Evidence: production configuration passes `production.sh config`; secrets are
absent from Git, images, logs, and browser responses; each enabled external
provider passes its real read-only or test workflow.

## 4. Deploy

Run from the release checkout on the server:

```sh
export NOTES_ENV_FILE=/opt/notes-ai/config/.env.production
sh infra/compose/production.sh config
sh infra/compose/production.sh pull
sh infra/compose/production.sh deploy
sh infra/compose/production.sh status
```

- [ ] Confirm every persistent service is running and every healthchecked
  service is healthy.
- [ ] Confirm migration and initialization jobs finish successfully.
- [ ] Confirm Caddy obtains and renews real ACME certificates.
- [ ] Verify the public application and S3 health endpoints over HTTPS.
- [ ] Inspect bounded API, web, worker, Caddy, and migration logs without
  exposing secret values.

Evidence: successful deploy output, healthy Compose status, valid public TLS,
HTTP 200 health responses, and a clean post-deploy log window.

## 5. Migrate Existing Data When Required

Skip this section for a new empty installation. When replacing an existing
Notes installation, follow [Data Migration](./migration.md).

- [ ] Put the source into the agreed maintenance/read-only window.
- [ ] Take independently restorable source database and upload backups.
- [ ] Import into a new empty target database and migrate files from the
  read-only source volume.
- [ ] Reconcile every table, generated sequence, user ownership relation, and
  object hash.
- [ ] Test representative users, notes, settings, files, subscriptions, and
  existing public links before opening traffic.

Evidence: saved migration report, matching reconciliation results, verified
hashes, and successful representative account acceptance. Do not delete source
data after migration.

## 6. Run Public-Domain Acceptance

- [ ] Registration, verification email, login, logout, password recovery, and
  session expiry.
- [ ] TOTP setup/challenge/recovery and Passkey registration/login/removal.
- [ ] Note tree, editor formatting, selected-text links, autosave, search, tags,
  templates, versions, trash, import, and export.
- [ ] File upload/download/preview, folders, movement, duplication, deletion,
  quota display, archives, and note/AI attachment.
- [ ] Public link creation, anonymous read, revocation, and existing-link
  behavior after entitlement changes.
- [ ] Subscription checkout/confirmation with the real payment mode intended
  for production; mock checkout must be disabled.
- [ ] AI streaming, model routing, context, file/image input, tools, approval,
  rejection, quota enforcement, voice, transcription, speech, and cancellation.
- [ ] Telegram and VK linking, webhook processing, permissions, retries, tool
  confirmations, and unlinking for every enabled provider.
- [ ] Administrator users, plans, AI configuration, integrations, monitoring,
  audit, diagnostics, retention, alerts, and silences.
- [ ] Desktop, 390 px, and 320 px browser checks with no overflow, clipped
  actions, serious/critical accessibility findings, or console errors.

Evidence: dated acceptance report against the real domain. Local mocks and
source builds do not close these items.

## 7. Backups, Monitoring, And Recovery

- [ ] Schedule matched PostgreSQL/object backups with
  `infra/compose/production.sh backup`.
- [ ] Copy completed backup sets to encrypted off-host storage and configure
  retention/alerting for failed or stale backups.
- [ ] Restore a matched backup into an isolated environment and reconcile rows,
  sequences, and object hashes.
- [ ] Configure Prometheus retention and Alertmanager's real external receiver.
- [ ] Verify firing and resolved alert delivery and operator access through SSH
  tunnels or another authenticated private boundary.
- [ ] Monitor disk capacity, certificate renewal, restarts, API errors/latency,
  worker failures, queue health, and restore-test age.
- [ ] Rehearse an application rollback to previous image digests.
- [ ] Rehearse a data rollback from one matched database/object backup pair.

Evidence: automated backup schedule, off-host copy, documented restore report,
received test alert, monitoring checks, and dated rollback reports.

## Definition Of Production Done

Production is complete when every applicable checkbox above has evidence, the
real domain passes browser and integration acceptance, backups have been
restored off-host, alert delivery works, rollback has been rehearsed, and no
secret or production data is stored in Git.

Until then, the repository is production-prepared but the deployment is not
production-accepted.
