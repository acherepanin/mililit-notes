# Data Migration

The current PostgreSQL database and object bucket are the supported source of
truth. The legacy importer remains available only for a controlled import from
the removed application: its database reads use a repeatable-read, read-only
transaction and its upload volume is mounted read-only.

## Required Configuration

Supply secrets through the untracked `infra/compose/.env` file or the deployment secret store. Do not put real credentials in Compose, image layers, shell history, logs, or documentation.

| Variable | Purpose |
|---|---|
| `LEGACY_DATABASE_URL` | Read-only PostgreSQL connection to the legacy database |
| `DATABASE_URL` | Target PostgreSQL connection; Compose supplies this internally |
| `LEGACY_UPLOADS_VOLUME` | Existing Docker volume containing legacy uploads |
| `OBJECT_STORAGE_BUCKET` | Target S3-compatible bucket |
| `MINIO_ROOT_USER` | Local MinIO access key |
| `MINIO_ROOT_PASSWORD` | Local MinIO secret key |

The default local legacy volume name is `notes-dev_notes-dev-uploads`. A database URL used by a Compose job must address a reachable host or Docker service, not `localhost` inside the job container.

## Preconditions

1. Keep the legacy application running and prevent schema changes during the final migration window.
2. Create and test a PostgreSQL backup of the legacy database.
3. Preserve a snapshot or backup of the legacy upload volume.
4. Confirm the target database is new and contains no application rows. The importer deliberately rejects a non-empty target.
5. Confirm the source and target URLs do not resolve to the same database. The importer rejects this configuration.

Never run the importer against the only production database or replace the legacy volume in place.

## Start Migration Dependencies

```sh
docker compose -f infra/compose/compose.yml up --build --detach --wait
```

The `migrate` job applies the ordered Drizzle migrations and installs required
`pg_trgm` and `vector` extensions. It is safe to rerun.

## Import The Database

Set `LEGACY_DATABASE_URL` outside Git, then run:

```sh
docker compose -f infra/compose/compose.yml --profile migration run --rm legacy-import
```

The importer:

- validates timestamps, booleans, JSON, vectors, IP addresses, hierarchy, and ownership before writing;
- reads the source through one repeatable-read, read-only snapshot;
- writes the target in one transaction and rolls it back on any error;
- copies in bounded batches while preserving existing IDs;
- compares every table count before commit;
- advances every generated-ID sequence beyond `MAX(id)`.

The target must be discarded or restored to its empty snapshot before retrying a completed import. The importer does not merge or overwrite rows.

## Migrate Files

```sh
docker compose -f infra/compose/compose.yml --profile migration run --rm files-migrate
```

Each source path is resolved inside the read-only upload root. The migration verifies the database size, streams the file to object storage, records SHA-256 metadata, checks the stored object, and only then marks the attachment ready. Deterministic object keys and statuses make interrupted runs resumable.

## Verify

```sh
docker compose -f infra/compose/compose.yml --profile tools run --rm --no-deps db-verify
docker compose -f infra/compose/compose.yml --profile tools run --rm --no-deps files-verify
pnpm check
```

Database verification fails on missing tables or extensions, hierarchy cycles, cross-user relations, or sequence lag. File verification fails on pending/failed records, missing objects, size differences, or SHA-256 metadata differences.

Before cutover, also compare source and target row counts, sample representative
users/notes/settings, and test public links and authentication. Successful
migration alone does not authorize cutover.

## Rollback And Retention

- Before cutover, rollback means keeping traffic on the source application; no reverse migration is required.
- After a failed rehearsal, stop the target stack, retain diagnostic logs, and restore or recreate only the isolated target volumes before retrying.
- After cutover, keep the legacy database, upload snapshot, migration report, and backup immutable for the agreed retention period.
- Do not run `docker compose down --volumes` unless deletion of all isolated target data is deliberate and independently backed up.
- Retain production backup sets according to the agreed operational retention policy; source code is not a substitute for data backup.

## Automated PostgreSQL Restore Rehearsal

With the local Compose PostgreSQL container healthy, run:

```sh
pnpm db:verify-backup-restore
```

The verifier uses `pg_dump --format=custom`, restores into a random isolated database in the same PostgreSQL container, compares every application table count with the source, and runs the normal extension, schema, ownership, hierarchy, and sequence checks against the restored copy. It drops the temporary database and removes its container-local dump in `finally`.

This local gate assumes a quiet source while counts are reconciled. A production run must use an explicit maintenance/read-only window or a named exported snapshot and copy the database and object backups to durable storage before restore.

Object storage and the complete routing rollback are verified separately:

```sh
pnpm files:verify-backup-restore
pnpm cutover:verify
pnpm observe:verify
```

See [Production](./production.md) for the deployment, matched-backup, and
rollback boundary.
