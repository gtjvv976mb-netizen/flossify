#!/usr/bin/env sh
# The resume check. Run it first in a new session that starts from GitHub alone (a fresh
# clone, no scratchpad), from the repository root, on the checkout you mean to work on.
# It says where the checkout stands against GitHub, installs the packages, migrates and
# seeds a throwaway LOCAL database, runs every suite this checkout has, and builds. It
# never drops anything and never touches a server. docs/HANDOFF.md says what to do after.
#
#   scripts/dev/resume.sh                   branch state, packages, unit tests, build
#   DB=flossify_t scripts/dev/resume.sh     also create (if missing), migrate and seed that
#                                           local database, and run the database checks
#   scripts/dev/resume.sh --no-build        everything but the build (which takes a minute or two)
#
# PGHOST / PGPORT / PGUSER are honoured for a local server only (a remote PGHOST is
# refused, as in setup.sh). PR_BRANCH is the branch of the open pull request to compare
# with (docs/HANDOFF.md names any). Exit 0 when nothing failed. The browser checks are scripts/dev/e2e.sh.
set -u
cd "$(dirname "$0")/../.."
PR_BRANCH="${PR_BRANCH:-}"
BUILD=1
for a in "$@"; do
  case $a in
    --no-build) BUILD=0 ;;
    *) echo "resume.sh: unknown option $a (see the header)" >&2; exit 2 ;;
  esac
done
fail=0
RESULTS=""
note() { RESULTS="$RESULTS
  $1	$2"; }
step() { printf '\n== %s\n' "$1"; }
out=$(mktemp)
trap 'rm -f "$out"' EXIT

step "1. Where this checkout stands"
if git fetch -q origin main $PR_BRANCH 2>/dev/null; then :; else
  echo "   (could not fetch from origin; comparing with the refs already here)"
fi
echo "   branch: $(git rev-parse --abbrev-ref HEAD) at $(git log -1 --format='%h %cs %s' | cut -c1-96)"
if git rev-parse -q --verify origin/main >/dev/null; then
  echo "   vs origin/main: $(git rev-list --count origin/main..HEAD) ahead, $(git rev-list --count HEAD..origin/main) behind"
fi
if [ -z "$PR_BRANCH" ]; then
  echo "   (PR_BRANCH=<branch> also compares with an open pull request's branch; docs/HANDOFF.md names any)"
elif git rev-parse -q --verify "origin/$PR_BRANCH" >/dev/null; then
  echo "   the PR branch $PR_BRANCH is $(git rev-list --count origin/main..origin/"$PR_BRANCH") commits past main;"
  echo "   this checkout is $(git rev-list --count origin/"$PR_BRANCH"..HEAD) ahead of it and $(git rev-list --count HEAD..origin/"$PR_BRANCH") behind it"
else
  echo "   the PR branch $PR_BRANCH is not on origin (merged or deleted?): see docs/HANDOFF.md"
fi
if [ -z "$(git status --porcelain)" ]; then echo "   working tree: clean"; else echo "   working tree: has changes (git status)"; fi
if command -v gh >/dev/null 2>&1; then
  # The REST API: a Claude Code session refuses gh's GraphQL commands (gh pr list, create, merge).
  gh api 'repos/{owner}/{repo}/pulls?state=open' --jq '.[] | "#\(.number) \(if .draft then "draft " else "" end)\(.head.ref) \(.title)"' 2>/dev/null \
    | sed 's/^/   open PR: /'
fi
echo "   newest migration on disk: $(ls src/data/migrations/*.sql | sort | tail -1 | xargs basename)"
note ok "branch state"

step "2. Node and packages"
nv=$(node -v 2>/dev/null || echo none)
major=${nv#v}; major=${major%%.*}
if [ "$nv" = none ] || [ "$major" -lt 22 ] 2>/dev/null; then
  echo "   Node 22 or newer is needed (found $nv): the scripts use --experimental-strip-types and --env-file-if-exists"
  note FAIL "node $nv"; fail=1
else
  echo "   node $nv, npm $(npm -v)"
fi
if [ -d node_modules ]; then
  echo "   node_modules is present (rm -rf node_modules && npm ci to refresh)"
  note ok "packages (already installed)"
elif npm ci --no-audit --no-fund >"$out" 2>&1; then
  tail -1 "$out" | sed 's/^/   /'; note ok "npm ci"
else
  tail -5 "$out" | sed 's/^/   /'; note FAIL "npm ci"; fail=1
fi

step "3. A local database"
if [ -z "${DB:-}" ]; then
  echo "   no DB given, skipped. DB=flossify_t $0 makes, migrates and seeds a local throwaway"
  echo "   database and runs the database checks. Never name flossify_dev or a server here."
  note skip "database (no DB given)"
else
  for h in "${PGHOST:-}" "${PGHOSTADDR:-}"; do
    case $h in
      *,*) echo "   refusing: PGHOST/PGHOSTADDR lists several hosts (\"$h\"); name one local host"; exit 1 ;;
      ''|localhost|127.0.0.1|::1|/*) ;;
      *) echo "   refusing: PGHOST/PGHOSTADDR is \"$h\", not this machine"; exit 1 ;;
    esac
  done
  if [ -n "${PGSERVICE:-}" ]; then
    echo "   refusing: PGSERVICE is set; a service entry can point anywhere. Unset it."; exit 1
  fi
  if [ -n "${DATABASE_ADMIN_URL:-}" ]; then
    echo "   refusing: DATABASE_ADMIN_URL is set, and this step is for a local database only"; exit 1
  fi
  fresh=0
  if psql -d "$DB" -Atc 'select 1' >/dev/null 2>&1; then
    echo "   $DB exists; applying what is pending"
  elif createdb "$DB"; then
    echo "   created $DB"; fresh=1
  else
    echo "   could not create $DB: is a local PostgreSQL running, and may you create databases?"
    note FAIL "createdb $DB"; fail=1
  fi
  if [ $fail = 0 ]; then
    # Local only, whatever .env says (the same guard as setup.sh): no admin URL, no password change.
    if env -u DATABASE_ADMIN_URL -u APP_DB_PASSWORD -u DATABASE_SSL -u NODE_ENV DB="$DB" \
        node --experimental-strip-types --no-warnings scripts/db/migrate.ts >"$out" 2>&1; then
      tail -1 "$out" | sed 's/^/   /'; note ok "migrate $DB"
    else
      tail -8 "$out" | sed 's/^/   /'; note FAIL "migrate $DB"; fail=1
    fi
    if [ $fresh = 1 ] && [ $fail = 0 ]; then
      if DB="$DB" node --experimental-strip-types --no-warnings scripts/db/seed.ts >"$out" 2>&1; then
        head -1 "$out" | sed 's/^/   /'; note ok "seed $DB"
      else
        tail -4 "$out" | sed 's/^/   /'; note FAIL "seed $DB"; fail=1
      fi
    fi
    applied=$(psql -d "$DB" -Atc "select count(*) from schema_migrations where name <> 'schema.sql'" 2>/dev/null || echo 0)
    files=$(ls src/data/migrations/*.sql | wc -l | tr -d ' ')
    echo "   migrations: $applied applied of $files on disk"
    if [ "$applied" != "$files" ]; then
      echo "   MISMATCH: read npm run db:migrate's output (a late file needs --allow-late, by hand, once)"
      note FAIL "migrations $applied/$files"; fail=1
    fi
  fi
fi

step "4. The checks this checkout has"
if node -e 'process.exit(require("./package.json").scripts["test:consent"] ? 0 : 1)'; then
  if npm run -s test:consent >"$out" 2>&1; then
    grep -E '^# (tests|pass|fail)' "$out" | tr '\n' ' ' | sed 's/^/   test:consent: /'; echo
    note ok "test:consent ($(grep -E '^# pass' "$out" | sed 's/^# //') of $(grep -E '^# tests' "$out" | sed 's/^# tests //'))"
  else
    grep -E '^# (tests|pass|fail)|^not ok' "$out" | head -8 | sed 's/^/   /'
    note FAIL "test:consent"; fail=1
  fi
else
  echo "   no test:consent on this checkout (it arrives with PR #38)"; note skip "test:consent (not on this checkout)"
fi
if [ -f scripts/dev/intake/db-test.mjs ]; then
  if [ -z "${DB:-}" ]; then
    echo "   intake db-test needs DB=<local database>"; note skip "intake db-test (no DB)"
  elif DB="$DB" node --experimental-strip-types --no-warnings --import ./scripts/ts-register.mjs scripts/dev/intake/db-test.mjs >"$out" 2>&1; then
    tail -1 "$out" | sed 's/^/   intake db-test: /'; note ok "intake db-test"
  else
    grep -E '^ *(not ok|FAIL|Error|AssertionError)' "$out" | head -6 | sed 's/^/   /'; tail -2 "$out" | sed 's/^/   /'
    note FAIL "intake db-test"; fail=1
  fi
else
  echo "   no scripts/dev/intake/db-test.mjs on this checkout"; note skip "intake db-test (not on this checkout)"
fi
echo "   the browser checks need a running server: DB=<throwaway db> scripts/dev/e2e.sh runs all six, each on a"
echo "   fresh seed. Not run by either: scripts/dev/qr-forms/backend-test.mjs, scripts/dev/glass/*.mjs (contrast,"
echo "   geometry, a real booking), scripts/film.mjs. See docs/HANDOFF.md, Tools."

step "5. The build"
if [ $BUILD = 0 ]; then
  echo "   skipped (--no-build)"; note skip "build (--no-build)"
elif npm run -s build >"$out" 2>&1 && [ -f dist/server/entry.mjs ]; then
  grep -E 'Complete!|built in|server built|prerendered' "$out" | tail -2 | sed 's/^/   /'
  note ok "build (dist/server/entry.mjs)"
else
  grep -E -i 'error|cannot|failed' "$out" | head -8 | sed 's/^/   /'; tail -3 "$out" | sed 's/^/   /'
  note FAIL "build"; fail=1
fi

printf '\n== Summary\n%s\n\n' "$RESULTS"
if [ $fail = 0 ]; then
  echo "Nothing failed. Next: DB=<throwaway db> scripts/dev/e2e.sh, then docs/HANDOFF.md, \"What to do next\"."
else
  echo "Something failed: fix that first (docs/HANDOFF.md, \"Tools\", says what each check needs)."
fi
exit $fail
