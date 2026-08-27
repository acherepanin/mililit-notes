#!/bin/sh

set -eu

compose_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
env_file=${NOTES_ENV_FILE:-"$compose_dir/.env.production"}
backup_root=${NOTES_BACKUP_ROOT:-/var/backups/notes-ai}

compose() {
  docker compose \
    --env-file "$env_file" \
    -f "$compose_dir/compose.yml" \
    -f "$compose_dir/compose.observability.yml" \
    -f "$compose_dir/compose.production.yml" \
    "$@"
}

require_file() {
  if [ ! -f "$1" ]; then
    echo "Required file not found: $1" >&2
    exit 1
  fi
}

backup_data() {
  timestamp=$(date -u +%Y%m%dT%H%M%SZ)
  incomplete="$backup_root/$timestamp.incomplete"
  destination="$backup_root/$timestamp"

  umask 077
  mkdir -p "$incomplete/objects"

  compose exec -T postgres sh -ec \
    'pg_dump --format=custom --no-acl --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
    >"$incomplete/postgres.dump"

  compose run --rm --no-deps \
    --entrypoint /bin/sh \
    -v "$incomplete/objects:/backup" \
    object-storage-init -ec \
    'mc alias set local http://object-storage:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null && mc mirror --overwrite "local/$OBJECT_STORAGE_BUCKET" /backup'

  compose config --images >"$incomplete/images.txt"
  (cd "$incomplete" && find objects -type f -exec sha256sum {} \;) \
    >"$incomplete/objects.sha256"
  (cd "$incomplete" && sha256sum postgres.dump images.txt objects.sha256) \
    >"$incomplete/SHA256SUMS"
  mv "$incomplete" "$destination"
  echo "Backup completed: $destination"
}

quiesced_services=""

quiesce_writes() {
  running_services=$(compose ps --status running --services)
  for service in caddy web api worker; do
    if printf '%s\n' "$running_services" | grep -qx "$service"; then
      quiesced_services="$quiesced_services $service"
    fi
  done

  if [ -n "$quiesced_services" ]; then
    # Word splitting is intentional: this is a fixed allowlist assembled above.
    compose stop $quiesced_services
  fi
}

resume_quiesced() {
  if [ -n "$quiesced_services" ]; then
    # Word splitting is intentional: this is a fixed allowlist assembled above.
    compose start $quiesced_services >/dev/null
    quiesced_services=""
  fi
}

consistent_backup() {
  quiesce_writes
  trap 'resume_quiesced' EXIT HUP INT TERM
  backup_data
  resume_quiesced
  trap - EXIT HUP INT TERM
}

require_file "$env_file"
if grep -Eq "replace_(me|with)|example\.com" "$env_file"; then
  echo "Replace every example placeholder in $env_file before deployment" >&2
  exit 1
fi

case "${1:-}" in
  backup)
    consistent_backup
    ;;
  config)
    compose config --quiet
    echo "Production Compose configuration is valid"
    ;;
  deploy)
    compose config --quiet
    compose pull
    if compose ps --status running --services | grep -qx postgres; then
      quiesce_writes
      trap 'resume_quiesced' EXIT HUP INT TERM
      backup_data
      trap - EXIT HUP INT TERM
    fi
    compose up --detach --remove-orphans --wait --wait-timeout "${NOTES_WAIT_TIMEOUT:-180}"
    compose exec -T web node -e \
      "fetch('http://localhost:3000/api/health').then(r=>{if(!r.ok)process.exit(1)})"
    compose exec -T api node -e \
      "fetch('http://localhost:3001/api/health').then(r=>{if(!r.ok)process.exit(1)})"
    compose exec -T worker node -e \
      "fetch('http://localhost:3002/ready').then(r=>{if(!r.ok)process.exit(1)})"
    echo "Production deployment is healthy"
    ;;
  down)
    compose down
    ;;
  logs)
    if [ "$#" -gt 1 ]; then
      compose logs --tail "${NOTES_LOG_TAIL:-200}" "$2"
    else
      compose logs --tail "${NOTES_LOG_TAIL:-200}"
    fi
    ;;
  pull)
    compose config --quiet
    compose pull
    ;;
  status)
    compose ps
    ;;
  *)
    echo "Usage: NOTES_ENV_FILE=/path/to/.env.production sh $0 {config|pull|deploy|backup|status|logs [service]|down}" >&2
    exit 2
    ;;
esac
