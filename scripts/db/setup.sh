#!/usr/bin/env sh
# DEVELOPMENT ONLY. Rebuild a local database from scratch: drop, create,
# migrate, seed. It DROPS the database first. For a real server use
# `npm run db:migrate`, which never drops anything.
#
#   scripts/db/setup.sh            # rebuilds flossify_dev (drops it first if present)
#   DB=flossify_test scripts/db/setup.sh
#
# Needs a local PostgreSQL where the current user may create databases and
# roles (Homebrew's default). The schema and migrations go through the same
# runner production uses (scripts/db/migrate.ts), so this database records
# them in schema_migrations too. The app connects afterwards as flossify_app,
# a plain role, so row-level security is enforced against it.
set -eu
DB="${DB:-flossify_dev}"
cd "$(dirname "$0")/../.."

no() { echo "setup.sh: refusing: $*" >&2; exit 1; }
if [ "${NODE_ENV:-}" = "production" ]; then
  no "NODE_ENV=production. This script drops the database; use npm run db:migrate."
fi
# psql and the migrate runner both follow the PG* variables, so only this
# machine's Postgres: before anything is dropped, refuse a PGHOST/PGHOSTADDR
# elsewhere (the rule seed.ts uses) and a service entry, which can name any host.
# A tunnel to a server on a localhost port looks local to that check, so the
# server is also asked its own address before the drop (below).
for h in "${PGHOST:-}" "${PGHOSTADDR:-}"; do
  case $h in
    *,*) no "PGHOST/PGHOSTADDR lists several hosts (\"$h\"); libpq would try each. Name one local host." ;;
    ''|localhost|127.0.0.1|::1|/*) ;;
    *) no "PGHOST/PGHOSTADDR is \"$h\", not this machine. This script drops the database." ;;
  esac
done
[ -z "${PGSERVICE:-}" ] || no "PGSERVICE is set (\"$PGSERVICE\"); a service entry can point anywhere. Unset it."
# And the server's own answer, before the drop (seed.ts asks the same, but only after it): a tunnel on a
# localhost port looks local to every check above.
srv=$(psql -X -d postgres -Atc "select coalesce(host(inet_server_addr()), 'socket') || ' ' || (inet_server_addr() is null or inet_server_addr() <<= inet '127.0.0.0/8' or inet_server_addr() <<= inet '::1/128' or inet_server_addr() <<= inet '::ffff:127.0.0.0/104')") || no "cannot reach PostgreSQL with these PG* settings."
case $srv in *' true') ;; *) no "the server answering is at ${srv% *}, not this machine (a tunnel?). This script drops the database." ;; esac

psql -v ON_ERROR_STOP=1 -d postgres -qc "drop database if exists \"$DB\""
psql -v ON_ERROR_STOP=1 -d postgres -qc "create database \"$DB\""
# Local only, whatever the shell or .env says: no admin URL (it could point at a
# real server), no password change (flossify_app is shared by every local
# database), no production mode.
env -u DATABASE_ADMIN_URL -u APP_DB_PASSWORD -u DATABASE_SSL -u NODE_ENV \
  DB="$DB" node --experimental-strip-types scripts/db/migrate.ts
DB="$DB" node --experimental-strip-types scripts/db/seed.ts
echo "ok: $DB ready. Connect as postgres://flossify_app:flossify_dev@localhost:5432/$DB"
