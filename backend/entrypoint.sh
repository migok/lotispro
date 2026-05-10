#!/bin/sh
set -e

echo "[entrypoint] Running database migrations..."
alembic upgrade head
echo "[entrypoint] Migrations applied."

echo "[entrypoint] Starting server..."
exec "$@"
