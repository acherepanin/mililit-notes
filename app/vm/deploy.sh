#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}. Copy .env.example to .env and fill remote settings." >&2
  exit 1
fi

set -a
source "${ENV_FILE}"
set +a

: "${REMOTE_HOST:?REMOTE_HOST is required}"
: "${REMOTE_USER:?REMOTE_USER is required}"
: "${REMOTE_HOME:?REMOTE_HOME is required}"

REMOTE_PORT="${REMOTE_PORT:-22}"
REMOTE_DOCKER_DIR="${REMOTE_DOCKER_DIR:-${REMOTE_HOME}/docker}"
NOTES_DATA_DIR="${NOTES_DATA_DIR:-${REMOTE_DOCKER_DIR}/notes-data}"

SSH_ARGS=(-p "${REMOTE_PORT}")
SCP_ARGS=(-P "${REMOTE_PORT}")

if [[ -n "${REMOTE_SSH_KEY:-}" ]]; then
  SSH_ARGS+=(-i "${REMOTE_SSH_KEY}")
  SCP_ARGS+=(-i "${REMOTE_SSH_KEY}")
fi

REMOTE="${REMOTE_USER}@${REMOTE_HOST}"

ssh "${SSH_ARGS[@]}" "${REMOTE}" "mkdir -p '${REMOTE_DOCKER_DIR}' '${NOTES_DATA_DIR}'"
scp "${SCP_ARGS[@]}" "${ENV_FILE}" "${REMOTE}:${REMOTE_DOCKER_DIR}/.env"
scp "${SCP_ARGS[@]}" "${COMPOSE_FILE}" "${REMOTE}:${REMOTE_DOCKER_DIR}/docker-compose.yml"

ssh "${SSH_ARGS[@]}" "${REMOTE}" "
  set -e
  cd '${REMOTE_DOCKER_DIR}'
  docker compose --env-file .env pull
  docker compose --env-file .env up -d --remove-orphans
  docker image prune -f
"
