#!/usr/bin/env sh
# Back up the database and the uploaded photos: `npm run db:backup`.
#
#   npm run db:backup                      # DATABASE_ADMIN_URL, or local DB (default flossify_dev)
#   BACKUP_DIR=/mnt/backups BACKUP_KEEP=30 npm run db:backup
#
# Writes, into BACKUP_DIR (default ./backups, readable by this user only):
#   flossify-db-<UTC stamp>.dump          pg_dump custom format, checked with pg_restore --list
#   flossify-uploads-<UTC stamp>.tar.gz   the contents of UPLOAD_DIR (followed if it is a symlink)
# and then deletes all but the newest BACKUP_KEEP (default 14) of each kind.
# Nothing is pruned unless the new dump was written and reads back.
# Copy BACKUP_DIR off the server too: a backup on the same disk dies with it.
# With NODE_ENV=production a missing or unset UPLOAD_DIR still writes the
# database dump, then exits 1, so a scheduler reports the photos as not saved.
#
# RESTORE — into an EMPTY database, never over the live one:
#   1. Stop the app and the SMS worker.
#   2. Create an empty database (the provider's console, or: createdb flossify_restore).
#      Restore as a superuser or a BYPASSRLS role, as for backups.
#   3. If that server has no flossify_app role yet:
#        psql "<admin url>" -c 'create role flossify_app login'
#      (or create it in the provider's console if the admin has no CREATEROLE)
#   4. Restore everything except the dump's two DEFAULT ACL entries. They name
#      the admin that made the backup; on another server, or as another admin,
#      they fail and --single-transaction rolls the whole restore back.
#        pg_restore --list backups/flossify-db-<stamp>.dump | grep -v 'DEFAULT ACL' > restore.list
#        pg_restore --no-owner --single-transaction --use-list=restore.list \
#          -d "<admin url of the empty database>" backups/flossify-db-<stamp>.dump
#   5. On a server:  NODE_ENV=production DATABASE_ADMIN_URL="<admin url of that database>" \
#                      APP_DB_PASSWORD=<password> npm run db:migrate
#      On this Mac:  DB=flossify_restore npm run db:migrate
#      It applies anything newer than the backup, sets flossify_app's password,
#      and grants flossify_app the default privileges step 4 left out.
#   6. mkdir -p "<UPLOAD_DIR>" && tar -xzf backups/flossify-uploads-<stamp>.tar.gz -C "<UPLOAD_DIR>"
#   7. Point DATABASE_URL and DATABASE_ADMIN_URL at the restored database; start the app and worker.
#
# Reads DATABASE_ADMIN_URL, DATABASE_SSL, DB, UPLOAD_DIR, BACKUP_DIR, BACKUP_KEEP
# and NODE_ENV from the environment, else from .env (values only, never run).
# The dumping role must be a superuser or BYPASSRLS (as db:migrate requires):
# the clinic tables force row-level security and pg_dump refuses to dump
# around it. pg_dump's major version must be at least the server's.
set -eu
cd "$(dirname "$0")/../.."

# KEY=value from .env, for keys the environment does not already set.
from_dotenv() {
  eval "cur=\${$1:-}"
  [ -n "$cur" ] && return 0
  [ -f .env ] || return 0
  line=$(grep -E "^[[:space:]]*(export[[:space:]]+)?$1=" .env | tail -n 1) || return 0
  val=$(printf '%s' "${line#*=}" | tr -d '\r')
  case $val in
    \"*\") val=${val#\"}; val=${val%\"} ;;
    \'*\') val=${val#\'}; val=${val%\'} ;;
  esac
  export "$1=$val"
}
for k in DATABASE_ADMIN_URL DATABASE_SSL DB UPLOAD_DIR BACKUP_DIR BACKUP_KEEP NODE_ENV; do from_dotenv "$k"; done

PROD=0; [ "${NODE_ENV:-}" = "production" ] && PROD=1
UPLOAD_SET=${UPLOAD_DIR:+1}

DATABASE_ADMIN_URL="${DATABASE_ADMIN_URL:-}"
DB="${DB:-flossify_dev}"
UPLOAD_DIR="${UPLOAD_DIR:-./uploads}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP="${BACKUP_KEEP:-14}"

fail() { echo "db:backup: $*" >&2; exit 1; }
case $KEEP in ''|*[!0-9]*) fail "BACKUP_KEEP must be a whole number of backups to keep, not \"$KEEP\"." ;; esac
[ "$KEEP" -ge 1 ] || fail "BACKUP_KEEP must be at least 1."
if [ "$PROD" = 1 ] && [ -z "$DATABASE_ADMIN_URL" ]; then
  fail "NODE_ENV=production but DATABASE_ADMIN_URL is not set."
fi
case ${DATABASE_SSL:-} in ''|0|1) ;; *) fail "DATABASE_SSL must be 1 (TLS) or unset." ;; esac
command -v pg_dump >/dev/null || fail "pg_dump is not installed (it comes with the PostgreSQL client tools)."

umask 077
mkdir -p "$BACKUP_DIR"
# One name per second; a second run in the same second waits rather than overwrite.
while :; do
  STAMP=$(date -u +%Y%m%dT%H%M%SZ)
  DUMP="$BACKUP_DIR/flossify-db-$STAMP.dump"
  TARBALL="$BACKUP_DIR/flossify-uploads-$STAMP.tar.gz"
  [ -e "$DUMP" ] || [ -e "$TARBALL" ] || break
  sleep 1
done
trap 'rm -f "$DUMP.partial" "$TARBALL.partial"' EXIT

if [ -n "$DATABASE_ADMIN_URL" ]; then
  # libpq's "require" is DATABASE_SSL=1 in db:migrate: encrypted, not verified.
  # An sslmode written on the URL wins over this.
  if [ "${DATABASE_SSL:-}" = 1 ]; then export PGSSLMODE="${PGSSLMODE:-require}"; fi
  TARGET="$DATABASE_ADMIN_URL"; SOURCE="DATABASE_ADMIN_URL"
else
  TARGET="$DB"; SOURCE="$DB (local)"
fi
pg_dump --format=custom --no-password --file="$DUMP.partial" --dbname="$TARGET" \
  || fail "pg_dump failed (above). No backup was written and none was removed."
LIST=$(pg_restore --list "$DUMP.partial") || fail "the dump does not read back; nothing was pruned."
ENTRIES=$(printf '%s\n' "$LIST" | grep -c '^[0-9]' || true)
mv "$DUMP.partial" "$DUMP"
echo "db:backup ← $SOURCE"
echo "  $DUMP  $(du -h "$DUMP" | cut -f1 | tr -d ' '), $ENTRIES entries"

# The folder's contents, not the folder: UPLOAD_DIR is often a symlink to a
# volume, and tar would store only the link. -C follows it.
PHOTOS_MISSING=
if [ "$PROD" = 1 ] && [ -z "$UPLOAD_SET" ]; then
  PHOTOS_MISSING="NODE_ENV=production but UPLOAD_DIR is not set, so no photos were backed up."
elif [ -d "$UPLOAD_DIR" ]; then
  tar -czf "$TARBALL.partial" -C "$UPLOAD_DIR" .
  mv "$TARBALL.partial" "$TARBALL"
  echo "  $TARBALL  $(du -h "$TARBALL" | cut -f1 | tr -d ' ')"
elif [ "$PROD" = 1 ]; then
  PHOTOS_MISSING="UPLOAD_DIR $UPLOAD_DIR does not exist, so no photos were backed up. Is the volume mounted, and is the path right?"
else
  echo "  uploads: $UPLOAD_DIR does not exist; no photos backed up."
fi

# Newest first by name (the stamp sorts), keep KEEP of each kind, remove the rest.
prune() {
  ls -1 "$BACKUP_DIR" | grep -E "^$1\$" | sort -r | tail -n "+$((KEEP + 1))" | while IFS= read -r f; do
    rm -f -- "$BACKUP_DIR/$f"
    echo "  removed old $f"
  done
}
prune 'flossify-db-[0-9]{8}T[0-9]{6}Z\.dump'
prune 'flossify-uploads-[0-9]{8}T[0-9]{6}Z\.tar\.gz'
echo "  keeping the newest $KEEP of each in $BACKUP_DIR"
if [ -n "$PHOTOS_MISSING" ]; then
  echo "db:backup: $PHOTOS_MISSING The database dump above was written." >&2
  exit 1
fi
