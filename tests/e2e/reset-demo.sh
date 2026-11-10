#!/usr/bin/env bash
# Recreates the local demo database used by the browser flows. LOCAL ONLY.
set -euo pipefail
DB=${DEMO_DB:-cc_demo}
dropdb -h "${PGHOST:-/tmp}" -U postgres --if-exists --force "$DB"
createdb -h "${PGHOST:-/tmp}" -U postgres "$DB"
export DATABASE_URL="postgres://postgres@localhost:5432/$DB"
npx tsx scripts/db-migrate.ts
npx tsx scripts/seed-demo.ts
