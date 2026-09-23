#!/usr/bin/env sh
# Create the development database from scratch: schema, migrations, seed.
#
#   scripts/db/setup.sh            # creates flossify_dev (drops it first if present)
#   DB=flossify_test scripts/db/setup.sh
#
# Needs a local PostgreSQL where the current user may create databases and
# roles (Homebrew's default). The app connects afterwards as flossify_app,
# a plain role, so row-level security is enforced against it.
set -eu
DB="${DB:-flossify_dev}"
cd "$(dirname "$0")/../.."

psql -v ON_ERROR_STOP=1 -d postgres -qc "drop database if exists \"$DB\""
psql -v ON_ERROR_STOP=1 -d postgres -qc "create database \"$DB\""
psql -v ON_ERROR_STOP=1 -d "$DB" -qf src/data/schema.sql
for m in src/data/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -d "$DB" -qf "$m"; done
DB="$DB" node --experimental-strip-types scripts/db/seed.ts
echo "ok: $DB ready. Connect as postgres://flossify_app:flossify_dev@localhost:5432/$DB"
