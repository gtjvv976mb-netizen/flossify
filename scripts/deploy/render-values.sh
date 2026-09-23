#!/bin/sh
# Hands Render the values it asks for when the Blueprint (render.yaml) is
# created, one at a time through the clipboard. Nothing is shown on screen,
# written to disk, or sent anywhere.
#
#   1. In DigitalOcean, open the database → Connection Details → Database:
#      flossify, User: doadmin, Connection string → copy it.
#   2. Run:  sh scripts/deploy/render-values.sh
#   3. Follow it: each value lands on your clipboard; paste it into the Render
#      field with the same name (and into your password manager), then press
#      Return for the next.
#
# It makes flossify_app's password (APP_DB_PASSWORD) itself and builds
# DATABASE_URL from it, so the database addresses are always consistent.
# macOS only (pbcopy / pbpaste).
set -eu

say() { printf '%s\n' "$*"; }
wait_return() { printf '   … then press Return. '; read -r _ </dev/tty || true; }
put() { printf '%s' "$2" | pbcopy; say ""; say "→ $1 is on your clipboard. Paste it into the Render field named $1."; wait_return; }

admin=$(pbpaste | tr -d '\r\n ')
case "$admin" in
  postgres://*@*|postgresql://*@*) ;;
  *) say "Your clipboard doesn't hold a database address yet."
     say "In DigitalOcean: the database → Connection Details → Database: flossify, User: doadmin → Connection string → Copy. Then run this again."
     exit 1 ;;
esac
admin=${admin%%\?*}                # no ?sslmode=require: DATABASE_SSL=1 encrypts instead
hostdb=${admin##*@}                # host:port/database
db=${hostdb##*/}
if [ "$db" != flossify ]; then
  say "That address is for the database \"$db\", not \"flossify\"."
  say "In Connection Details, set Database to flossify, copy the connection string again, and rerun."
  exit 1
fi
case "$admin" in
  *//doadmin:*) ;;
  *) say "Note: that address is not for the doadmin user. Flossify needs the admin (doadmin) here." ;;
esac

pw=$(openssl rand -hex 24)
app="postgresql://flossify_app:${pw}@${hostdb}"

say "Flossify values for Render. Keep the Render Blueprint page open beside this window."
put DATABASE_ADMIN_URL "$admin"
put APP_DB_PASSWORD "$pw"
put DATABASE_URL "$app"
say ""
say "→ DATABASE_URL again, for the flossify-worker service (it is still on your clipboard)."
wait_return

say ""
say "Now the Semaphore API key: in semaphore.co, Account → API, copy the key."
printf '   Copied it? Press Return. '; read -r _ </dev/tty || true
key=$(pbpaste | tr -d '\r\n ')
if [ -z "$key" ] || [ "$key" = "$pw" ]; then say "The clipboard didn't change. Copy the Semaphore key and run this again."; printf '' | pbcopy; exit 1; fi
say "→ SMS_API_KEY is on your clipboard. Paste it into SMS_API_KEY on both services."
wait_return

say ""
say "Last: SMS_SENDER (both services) is your sender name exactly as Semaphore approved it. Type it in."
printf '' | pbcopy
say ""
say "Done. Your clipboard is cleared. Click Apply in Render."
