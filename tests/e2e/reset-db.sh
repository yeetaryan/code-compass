#!/usr/bin/env bash
# Recreates the LOCAL database used by the browser flows and fills it with test fixtures. Local only.
set -euo pipefail
DB=${E2E_DB:-cc_e2e}
dropdb -h "${PGHOST:-/tmp}" -U postgres --if-exists --force "$DB"
createdb -h "${PGHOST:-/tmp}" -U postgres "$DB"
export DATABASE_URL="postgres://postgres@localhost:5432/$DB"
npx tsx scripts/db-migrate.ts
npx tsx tests/e2e/seed-fixtures.ts
