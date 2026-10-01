# Rules for every track builder (read first)

You are one of five builders working in parallel on Flossify's next round: blocked time (p07), slot
suggestions (p24), booking from the slot (p32), edit a booked visit (p25), tooth-first charting (p01) and the
PTR number (p15). The owner asked for these six; the designs are settled. Build your slices exactly as their
spec says, measure them, and commit them on your own branch.

## Where things are
- Specs (the full, reviewed designs): `/tmp/claude-0/-home-user-flossify/f4b0cee2-2012-5f9f-a244-94fd3e742817/scratchpad/six-p07.md`,
  `six-p24.md`, `six-p32.md`, `six-p25.md`, `six-p01.md`, `six-p15.md` in that folder.
- The build plan: `six-plan.md` in that folder. Read §0, the §1 entries for your slices, the §2 ownership table,
  and every §5 seam that names your slices. A seam's instructions win over a spec where they differ.
- CLAUDE.md in the repo is the project's rulebook and applies in full (soft template, one teal button per
  screen, sentence case, contrast measured ≥ 4.5:1 light and dark at 1440 and 390, targets ≥ 44px, fields
  16px, every dark rule with both twins, `hidden` attribute not class, unique `data-*` hooks, `<Csrf />` +
  `csrfOk()` on every post, permissions by `can()`, RLS through `withClinic`, no links or reply-asks in texts,
  never gate anything on reduced motion, never edit `schema.sql` or an applied migration).

## Your sandbox (the numbers are in your task)
- Worktree `/home/user/fl-<track>` on branch `round/<track>`. It starts at `round/next` = the Treatment record
  plus migration 040 (already written: `src/data/migrations/040_blocked_time.sql`).
- Do ALL work inside your worktree: `cd /home/user/fl-<track> && …` in every shell command, and edit files
  only by absolute paths under it. Never edit `/home/user/flossify` (the main checkout), `/home/user/fl-round`
  or another track's worktree. Never run git commands that change another branch.
- Database `flossify_<track>`, a copy of the dev database with 040 applied. The worktree's `.env` points the
  app at it. Admin shell: `psql -U root -h /var/run/postgresql -d flossify_<track>`. A new migration file of
  yours is applied with `cd /home/user/fl-<track> && PGUSER=root PGHOST=/var/run/postgresql DB=flossify_<track> npm run db:migrate`.
  Do not run `npm run db:setup` (it drops and reseeds; the copy holds test patients other checks use) unless
  your slice truly needs a fresh seed, and then only with `DB=flossify_<track>`.
- Build: `cd /home/user/fl-<track> && npm run build` (a few seconds). Serve your build on YOUR port only:
  `cd /home/user/fl-<track> && { NODE_ENV=development PORT=<port> HOST=127.0.0.1 nohup node dist/server/entry.mjs > /tmp/fl-<track>-server.log 2>&1 & echo $! > /tmp/fl-<track>-server.pid; }` (the braces make `$!` node's own pid)
  and stop it with `kill $(cat /tmp/fl-<track>-server.pid)`. Never `pkill`, never touch ports 4399 or another
  track's port. Rebuild and restart after every change you test.
- Sign in for checks at `http://127.0.0.1:<port>/auth/login/?any=1`: `liwayway.domingo@example.com` /
  `flossify` (owner, session-road), `hazel.tabanao@example.com` / `flossify` (dentist: no billing),
  `ramon.cari.o@example.com` / `flossify` (dentist, in Tue and Thu). Other clinics and people: query the database.
- Headless browser: `import { chromium } from '/home/user/fl-<track>/node_modules/playwright/index.mjs'` and
  `chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })`. Keep scratch scripts and screenshots in
  `/tmp/fl-<track>-scratch/`, never in the repo.

## Scope
- Touch only the files your track owns for your slices (plan §1 and §4.1). If you find you must change a
  file another track owns, do not: say so in your report with the exact change needed.
- Do not edit CLAUDE.md: write the paragraph(s) the plan asks for into your report instead.
- Keep `src/pages/api/chart.ts`, `src/lib/offline-queue.ts` and `public/sw.js` byte-identical.
- Owner's decisions: p07 §7.1 (reminders for visits in closed time) takes the spec's default: unchanged.
  p01's two questions for a dentist take the spec's defaults. Everything else is as the specs say.

## Finish
- Run your slices' checks (plan §4.2 "its own checks before merge", and the spec's verification section for
  those slices). Measure: numbers, not screenshots. Fix until they pass, or report exactly what fails and why.
- Commit in your worktree, one commit per slice, only your files (`git add <paths>`, never `git add -A` of
  stray files). Commit messages in plain sentences, ending with these two lines:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01KWQrsMwM4vBK2FEE98qqkk`
  Never push. Leave the worktree clean (`git status` shows nothing).
- Stop your server.
- Your final message is the report, and it is read by the integrator, not a person: for each slice, the
  commit sha, the files changed, each check with its measured result, every deviation from the spec and why,
  anything left open, and the CLAUDE.md paragraph(s) for integration.
