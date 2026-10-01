# Rules for building the simpler patient record (read first)

The owner: "SIMPLIFY THE PATIENT RECORD" and "THERE'S TOO MANY TABS AND BUTTONS". The design is settled:
`simplify-spec.md` in this folder (`/tmp/claude-0/-home-user-flossify/f4b0cee2-2012-5f9f-a244-94fd3e742817/scratchpad/`).
Build exactly what it says, slice by slice (§8). Its §9 questions take their defaults (yes; In 6 months; keep
Treatments done folded). The inventory it was measured from: `simplify-result.json` in the same folder
(`inventory.report`), and the inventory scripts in `/tmp/fl-simplify/inventory/` (`inv.mjs`, `panels.mjs`,
`fold.mjs`, `health.mjs`, `tabscroll.mjs` — they hard-code port 4399; copy into your scratch and repoint).

## Your sandbox
- Worktree `/home/user/fl-simple`, branch `round/simple` (starts at round/next = everything so far, the intake's
  phase 2 included). Work ONLY there: `cd /home/user/fl-simple && …` in every shell command, absolute paths
  under it for every edit. Never edit `/home/user/flossify`, `/home/user/fl-round` or another worktree. Never run
  git commands that change another branch.
- Database `flossify_simple` (a copy of the dev data; the worktree's `.env` points at it). Admin shell:
  `psql -U root -h /var/run/postgresql -d flossify_simple`. **No migration is expected** for this work; if you
  truly need one it is `044_*.sql`, additive, and you say why in your report.
- Build: `cd /home/user/fl-simple && npm run build`. Serve on port **4470** only:
  `cd /home/user/fl-simple && { NODE_ENV=development PORT=4470 HOST=127.0.0.1 nohup node dist/server/entry.mjs > /tmp/fl-simple-server.log 2>&1 & echo $! > /tmp/fl-simple-server.pid; }`
  and stop it with `kill $(cat /tmp/fl-simple-server.pid)`. Never `pkill`. Rebuild and restart after every change you test.
  If Postgres is down: `service postgresql start`.
- Sign in at `http://127.0.0.1:4470/auth/login/?any=1`: `liwayway.domingo@example.com` / `flossify` (owner,
  session-road), `hazel.tabanao@example.com` / `flossify` (dentist, no billing), `ramon.cari.o@example.com` /
  `flossify`. Hit the rate limit? Delete `login:*` rows from `throttle` in flossify_simple.
- Test patients: Maria Liza Dela Cruz (SR-0142) and "Ledger Test" (T-LEDG, id 9ea415bd-4b9e-4725-80e8-391464e2c12e).
  Make any other data you need with SQL in flossify_simple (e.g. a patient with 5 allergies and a long note for the
  sticky-height check; an LOA waiting; a lab case; a payment plan; a minor).
- Headless browser: `import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs'`,
  `chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })`. Scratch in `/tmp/fl-simple-scratch/`
  (never in the repo). The 030 snapshot tools: copy `/tmp/fl-v4-scratch/snap.mjs` and `cmp.mjs`.

## Rules that bind this work (CLAUDE.md applies in full; these are the ones most at risk)
- Soft template; one teal button per screen; sentence case; line icons; contrast MEASURED ≥ 4.5:1 against the
  pixels behind, light and dark (both twins: `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) … }`
  and `:root[data-theme="dark"] …`), at 1440 and 390; targets ≥ 44px; fields ≥ 16px; no sideways scroll.
- Nothing fixed to the bottom of the screen. The sticky row is at the TOP (under the workspace top bar).
- `hidden` attribute, never the `hidden` class, on anything a script shows later. `data-*` hooks unique.
- Every form keeps `<Csrf />`; every intent keeps its server checks (`canEditRecords`, `can()`), audit and
  `Refused` handling. Money only with `finance.bill`. No change to what a role may do — only where it is drawn.
- `src/pages/api/chart.ts`, `src/lib/offline-queue.ts` and `public/sw.js` stay byte-identical; `Odontogram.astro`
  changes only additively. The offline kept copy must still work (opens on Chart).
- The Treatment record's ledger (`treatment-record.ts`, the paper `treatment-record.astro`) must not change
  output: last balance = `patient_balance()` for every dev patient.
- Nothing a clinic uses is lost: every form, panel, print page, intent, action and outgoing link stays reachable
  (spec §3 and §5), except "Bring in past visits" on the record (it stays at Patients › Add patient › Import).
- Never gate anything on reduced motion.

## Finish each slice
- Run the slice's checks (spec §8) and measure: numbers, not screenshots. Fix until they pass.
- Commit in the worktree, one commit per slice (`git add <paths>`; never add stray files), plain sentences,
  ending with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01KWQrsMwM4vBK2FEE98qqkk`
  Never push. Leave the worktree clean. Stop your server.
- Keep a running log in `/tmp/fl-simple-scratch/progress.md` (slice, commit, checks, open items) so a restart can
  resume from it. Before starting, read it: if your slice is already committed, verify and continue from there.
- Your final message is read by the integrator: commit sha, files, each check with its measured number, every
  deviation from the spec and why, anything left open.
