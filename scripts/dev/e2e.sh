#!/usr/bin/env sh
# Every browser check, each on a freshly seeded throwaway LOCAL database, against one dev server this
# script starts and stops. Run it after scripts/dev/resume.sh, from the repository root:
#
#   DB=flossify_t scripts/dev/e2e.sh                  all six checks
#   DB=flossify_t scripts/dev/e2e.sh paper dash       only those (paper dash seat choices profile phone)
#
# It DROPS and reseeds $DB before every check (scripts/db/setup.sh), so DB must be a throwaway database:
# flossify_dev, an empty DB and any PGHOST that is not this machine are refused. The dev server connects
# as flossify_app over TCP (127.0.0.1, or PGHOST when that is localhost) on PGPORT, with the setup's own
# development password, a fixed dev-only SESSION_SECRET, console texts and a temporary UPLOAD_DIR.
#
#   PGHOST / PGPORT / PGUSER   a local server only (a socket directory is fine; it must also listen on TCP)
#   PORT=4610                  the dev server's port (a busy port is refused, not shared)
#   PW_CHROMIUM=<binary>       Chromium, when Playwright's own build is not installed
#   OUT=<dir>                  where each check's log goes (default: a new temporary directory)
#
# After each seed the child patient SR-0144 is made 7 years old, so the record opens with the baby teeth
# shown (the state the checks were last measured in, 6 Oct 2026). Exit 0 when every check passed.
#
# Do not edit files in this checkout while it runs: the dev server watches them and reloads every open page
# ("program reload" in server.log), which can land on a sign-in mid-check (seen 9 Oct: a sign-in timed out).
set -u
cd "$(dirname "$0")/../.."

no() { echo "e2e.sh: refusing: $*" >&2; exit 2; }
[ -n "${DB:-}" ] || no "DB is not set. Name a throwaway local database: DB=flossify_t $0"
[ "$DB" != flossify_dev ] || no "DB=flossify_dev is the owner's working database. Name a throwaway one."
for h in "${PGHOST:-}" "${PGHOSTADDR:-}"; do
  case $h in ''|localhost|127.0.0.1|::1|/*) ;; *) no "PGHOST/PGHOSTADDR is \"$h\", not this machine." ;; esac
done
[ -z "${PGSERVICE:-}" ] || no "PGSERVICE is set; a service entry can point anywhere. Unset it."
[ -z "${DATABASE_ADMIN_URL:-}" ] || no "DATABASE_ADMIN_URL is set; this script is for a local database only."
[ -d node_modules/playwright ] || no "node_modules/playwright is missing: run scripts/dev/resume.sh (or npm ci) first."

PORT="${PORT:-4610}"
case ${PGHOST:-} in localhost|127.0.0.1|::1) TCP=$PGHOST ;; *) TCP=127.0.0.1 ;; esac
OUT="${OUT:-$(mktemp -d)}"
mkdir -p "$OUT/uploads"

ALL="paper dash seat choices profile phone"
WANT="${*:-$ALL}"
script_of() {
  case $1 in
    paper) echo scripts/dev/record/paper-check.mjs ;;
    dash) echo scripts/dev/schedule/dash-check.mjs ;;
    seat) echo scripts/dev/schedule/seat-check.mjs ;;
    choices) echo scripts/dev/schedule/choices-check.mjs ;;
    profile) echo scripts/dev/settings/profile-check.mjs ;;
    phone) echo scripts/dev/intake/phone-e2e.mjs ;;
    *) echo "" ;;
  esac
}
for c in $WANT; do [ -n "$(script_of "$c")" ] || no "unknown check \"$c\" (one of: $ALL)"; done

base="http://127.0.0.1:$PORT"
if curl -s -o /dev/null --max-time 2 "$base/"; then no "something already answers on $base. Set PORT to a free one."; fi

reseed() {
  psql -d postgres -qAtc "select pg_terminate_backend(pid) from pg_stat_activity where datname = '$DB' and pid <> pg_backend_pid()" >/dev/null 2>&1
  DB="$DB" scripts/db/setup.sh >"$OUT/seed.log" 2>&1 || return 1
  psql -d "$DB" -qAtc "update patient set birth_date = current_date - interval '7 years' where chart_no = 'SR-0144'" >/dev/null
}

echo "== seeding $DB (logs in $OUT)"
reseed || { tail -5 "$OUT/seed.log"; echo "e2e.sh: the first seed failed: is a local PostgreSQL running, and may you create databases?"; exit 1; }

echo "== starting the dev server on $base"
DATABASE_URL="postgres://flossify_app:flossify_dev@$TCP:${PGPORT:-5432}/$DB" \
SESSION_SECRET='dev-only-secret-for-the-e2e-checks-0123456789abcdef' \
SMS_PROVIDER=console UPLOAD_DIR="$OUT/uploads" SHOW_DEMO_LOGINS=1 TRUST_PROXY=0 \
  node node_modules/astro/bin/astro.mjs dev --ignore-lock --port "$PORT" --host 127.0.0.1 >"$OUT/server.log" 2>&1 &
server=$!
trap 'kill $server 2>/dev/null' EXIT INT TERM
up() {
  i=0
  while [ $i -lt 90 ]; do
    [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$base/healthz")" = 200 ] && return 0
    kill -0 $server 2>/dev/null || return 1
    sleep 2; i=$((i + 1))
  done
  return 1
}
up || { tail -15 "$OUT/server.log"; echo "e2e.sh: the dev server did not answer /healthz (log: $OUT/server.log)"; exit 1; }

fail=0
RESULTS=""
first=1
for c in $WANT; do
  printf '\n== %s (%s)\n' "$c" "$(script_of "$c")"
  if [ $first = 0 ]; then
    reseed || { tail -5 "$OUT/seed.log"; RESULTS="$RESULTS
  FAIL	$c (the reseed failed)"; fail=1; continue; }
    up || { echo "   the dev server stopped answering (log: $OUT/server.log)"; RESULTS="$RESULTS
  FAIL	$c (no server)"; fail=1; break; }
  fi
  first=0
  # The checks default to the socket in /var/run/postgresql; give them the host the seed and the server used.
  if DB="$DB" PGHOST="${PGHOST:-$TCP}" node "$(script_of "$c")" "$base" >"$OUT/$c.log" 2>&1; then
    tail -1 "$OUT/$c.log" | sed 's/^/   /'
    RESULTS="$RESULTS
  ok	$c"
  else
    grep -E -i 'not ok|fail|error|assert' "$OUT/$c.log" | head -8 | sed 's/^/   /'; tail -3 "$OUT/$c.log" | sed 's/^/   /'
    RESULTS="$RESULTS
  FAIL	$c (log: $OUT/$c.log)"; fail=1
  fi
done

printf '\n== Summary\n%s\n\nLogs: %s\n' "$RESULTS" "$OUT"
[ $fail = 0 ] && echo "Every check passed." || echo "Something failed: read its log first."
exit $fail
