#!/bin/sh
# Virtual Fit container entrypoint (Supabase/PostgreSQL edition):
#   0. Validate environment (DATABASE_URL must point at Postgres)
#   1. Seed demo garment assets into /data/storage on first boot
#   2. Sync the Prisma schema to the database (idempotent)
#   3. Import the demo catalog if the Product table is empty
#   4. Start the Next.js server (CMD)
set -e

strip_quotes() (
  case "$1" in
    \"*\") printf '%s' "${1#\"}" | sed 's/"$//' ;;
    *)     printf '%s' "$1" ;;
  esac
)

# --- 0. Environment -----------------------------------------------------------
if [ -n "${DATABASE_URL:-}" ]; then
  DATABASE_URL=$(strip_quotes "$DATABASE_URL")
  export DATABASE_URL
fi
if [ -n "${STORAGE_ROOT:-}" ]; then
  STORAGE_ROOT=$(strip_quotes "$STORAGE_ROOT")
fi
: "${STORAGE_ROOT:=/data/storage}"
export STORAGE_ROOT

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[entrypoint] FATAL: DATABASE_URL is not set."
  echo "[entrypoint]   1. Run prisma/supabase-setup.sql once in the Supabase SQL Editor"
  echo "[entrypoint]   2. Supabase -> Project Settings -> Database -> Connection string -> URI"
  echo "[entrypoint]   3. Set DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
  exit 1
fi
case "$DATABASE_URL" in
  postgres://*|postgresql://*) : ;;
  *)
    echo "[entrypoint] FATAL: DATABASE_URL must be a postgres:// connection string (Supabase), got: ${DATABASE_URL%%:*}"
    exit 1
    ;;
esac

# --- 1. Demo garment assets on first boot --------------------------------------
mkdir -p "$STORAGE_ROOT"
if [ -d /app/.seed-storage ] && [ -z "$(ls -A "$STORAGE_ROOT" 2>/dev/null)" ]; then
  echo "[entrypoint] Seeding demo garment assets into $STORAGE_ROOT..."
  cp -a /app/.seed-storage/. "$STORAGE_ROOT/"
fi

# --- 2. Sync schema (idempotent; safe when already up to date) -----------------
echo "[entrypoint] Syncing database schema (prisma db push)..."
node /app/node_modules/prisma/build/index.js db push --skip-generate --schema /app/prisma/schema.prisma

# --- 3. Import the demo catalog when the database is empty ---------------------
product_count_rc=0
node -e '
  const { PrismaClient } = require("/app/node_modules/@prisma/client");
  const p = new PrismaClient();
  p.product.count()
    .then((n) => { process.exit(n > 0 ? 0 : 2); })
    .catch(() => process.exit(1))
    .finally(() => p.$disconnect());
' >/dev/null 2>&1 || product_count_rc=$?
if [ "$product_count_rc" -eq 2 ]; then
  echo "[entrypoint] Empty catalog detected - importing demo garments..."
  node /app/scripts/migrate-catalog-to-db.mjs \
    || echo "[entrypoint] WARNING: catalog import failed (continuing)."
fi

echo "[entrypoint] Database ready. Starting Virtual Fit on port ${PORT:-3000}..."
exec "$@"
