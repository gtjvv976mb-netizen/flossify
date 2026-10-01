# Rules for the round's combined verification (read first)

The six scheduling features (p07 blocked time, p24 free times, p32 booking from the slot, p25 edit a
visit, p01 tooth-first charting, p15 PTR) and the intake's phase 1 (039) were built by separate tracks and
are now merged on branch `round/next` in `/home/user/fl-round` (commit `2d6403f`). Each track passed its
own checks on its own branch. Your job is the plan's combined verification (`six-plan.md` §6, in
`/tmp/claude-0/-home-user-flossify/f4b0cee2-2012-5f9f-a244-94fd3e742817/scratchpad/`), the part you are
given: find what breaks now that the pieces run together. You are a verifier: **do not edit any file under
`/home/user/`** — not the repo, not a worktree. Report failures precisely; the integrator fixes them.

## Your sandbox (numbers in your task)
- The integrated build is already built at `/home/user/fl-round/dist`. Run it on YOUR port against YOUR
  database, never rebuilding it:
  `cd /home/user/fl-round && { DATABASE_URL=postgres://flossify_app:flossify_dev@localhost:5432/flossify_<v> UPLOAD_DIR=/tmp/fl-uploads-<v> NODE_ENV=development PORT=<port> HOST=127.0.0.1 nohup node dist/server/entry.mjs > /tmp/fl-<v>-server.log 2>&1 & echo $! > /tmp/fl-<v>-server.pid; }`
  and stop it with `kill $(cat /tmp/fl-<v>-server.pid)`. Never `pkill`. The environment wins over the
  worktree's `.env` (src/lib/dotenv.ts never overrides it).
- Database `flossify_<v>`: the dev data (Maria Liza Dela Cruz, Joel Bautista, Carlos Santos, "Ledger Test"
  T-LEDG, …) with every migration through 042 applied (039 included). Admin:
  `psql -U root -h /var/run/postgresql -d flossify_<v>`. Change it freely; it is yours alone.
- Sign in at `/auth/login/?any=1`: `liwayway.domingo@example.com` / `flossify` (owner, session-road),
  `hazel.tabanao@example.com` / `flossify` (dentist, no billing), `ramon.cari.o@example.com` / `flossify`.
  If you hit the sign-in rate limit, delete your own `login:*` rows from `throttle`.
- Headless Chromium: `import { chromium } from '/home/user/fl-round/node_modules/playwright/index.mjs'`,
  `chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })`. Scratch in `/tmp/fl-<v>-scratch/`.
- The tracks' own check scripts are in `/tmp/fl-book-scratch/`, `/tmp/fl-cal-scratch/`,
  `/tmp/fl-pub-scratch/`, `/tmp/fl-rec-scratch/`, `/tmp/fl-fin-scratch/`, `/tmp/fl-intake-scratch/` (and
  the intake's `scripts/dev/intake/db-test.mjs`, `npm run test:consent` in fl-round). Copy one into your
  scratch folder and point it at your port and database (they hard-code 4417/4418/4431/4612/4412/4460 and
  `flossify_<track>`); never edit the originals. Where a script needs data the dev copy lacks, make it
  with SQL in your database.
- The specs are `six-p07.md`, `six-p24.md`, `six-p32.md`, `six-p25.md`, `six-p01.md`, `six-p15.md` and
  `intake-spec.md` in the scratchpad folder above.

## Report
Your final message is read by the integrator: for each check, pass or fail with the measured number. For
every failure: the exact steps, what you expected, what happened, the file and line you believe is at
fault, and whether it also fails on the track's own branch (`/home/user/fl-<track>` has its last commit; do
not build there — reason from the code) — i.e. is it an integration break or was it always so. Leave your
server stopped. Say which test rows you left in your database (it is thrown away afterwards).
