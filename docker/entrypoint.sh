#!/bin/sh
set -e

if [ -z "${DATABASE_URL:-}" ]; then
  echo "entrypoint: DATABASE_URL is not set" >&2
  exit 1
fi

echo "entrypoint: applying Prisma migrations…"
npx prisma migrate deploy

echo "entrypoint: starting Next.js…"
exec node server.js
