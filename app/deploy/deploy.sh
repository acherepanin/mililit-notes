#!/usr/bin/env bash
# Управление образом и деплоем.
# Команды: push | pull | deploy (по умолчанию deploy).
#   push   - собрать образ и запушить в GHCR
#   pull   - спулить образ из GHCR
#   deploy - отправить docker-compose.yml на сервер, спулить образ и перезапустить
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"
CMD="${1:-deploy}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Нет файла ${ENV_FILE}" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

: "${IMAGE:?IMAGE обязателен}"

case "${CMD}" in
  push)
    docker build -f "${SCRIPT_DIR}/Dockerfile" -t "${IMAGE}" "${SCRIPT_DIR}/.."
    docker push "${IMAGE}"
    ;;
  pull)
    docker pull "${IMAGE}"
    ;;
  deploy)
    : "${REMOTE_HOST:?REMOTE_HOST обязателен}"
    : "${REMOTE_USER:?REMOTE_USER обязателен}"
    : "${REMOTE_DIR:?REMOTE_DIR обязателен}"

    REMOTE_PORT="${REMOTE_PORT:-22}"
    SSH_ARGS=(-p "${REMOTE_PORT}")
    SCP_ARGS=(-P "${REMOTE_PORT}")
    if [[ -n "${REMOTE_SSH_KEY:-}" ]]; then
      SSH_ARGS+=(-i "${REMOTE_SSH_KEY}")
      SCP_ARGS+=(-i "${REMOTE_SSH_KEY}")
    fi
    REMOTE="${REMOTE_USER}@${REMOTE_HOST}"

    ssh "${SSH_ARGS[@]}" "${REMOTE}" "mkdir -p '${REMOTE_DIR}'"
    scp "${SCP_ARGS[@]}" "${COMPOSE_FILE}" "${REMOTE}:${REMOTE_DIR}/docker-compose.yml"
    ssh "${SSH_ARGS[@]}" "${REMOTE}" "
      set -e
      cd '${REMOTE_DIR}'
      docker compose pull
      docker compose up -d --remove-orphans
      docker container prune -f
      docker image prune -f
      docker builder prune -f
    "
    ;;
  *)
    echo "Неизвестная команда: ${CMD} (push | pull | deploy)" >&2
    exit 1
    ;;
esac
