# Handoff — where the work stopped (1 Oct 2026)

For the next Claude session, which starts from GitHub alone: a fresh clone, no
scratchpad from any earlier session, and no way to read those sessions (the one
that built the open pull request ran on another account). Everything the next
session needs is in this repository: this file, `CLAUDE.md` on the branch you
check out, and `scripts/dev/resume.sh`.

Read in this order:

1. `CLAUDE.md` on `main`: the record of everything built, the intake's three
   phases included.
2. This file, then `docs/intake-design.md` for what the intake's phase 4 is to
   settle with the owner.
3. Run the resume check (below) before changing anything.

## The owner and how to work with them

- Flossify is the owner's startup: practice software for Philippine dental
  clinics, Baguio City. Mantra: **user experience and user-friendliness**, for
  patients and clinic owners both.
- The owner writes short, excited messages ("do it", "make it live") and has
  authorised finishing work, opening pull requests and **merging** them. Render
  deploys `main` to flossify.ph on its own (`render.yaml`: branch `main`, and
  `npm run db:migrate` as the pre-deploy command, so a merge applies pending
  migrations before the new version serves). Check the live site after each
  merge and send screenshots.
- Standing decisions (do not re-open; `CLAUDE.md` "Standing constraints" has the
  full list): motion always on everywhere, never gated on `prefers-reduced-motion`;
  no footer and nothing fixed to the bottom of the screen; the soft template on
  every page (white rounded cards, one teal, sentence case, line icons); frosted
  glass where a clinic is the background; the workspace has exactly four tabs.
- Every line on glass is **measured** against the pixels behind it, light and
  dark, 1440 and 390, before shipping. Numbers, not eyes (`CLAUDE.md`
  "Verification").
- Never enter passwords, API keys or tokens for the owner; they type secrets
  themselves (Render dashboard or shell). Their email is only for identification.
- Never touch the `flossify_dev` database in tests and never run `npm run
  db:setup` without `DB=`. Use a throwaway database: `DB=flossify_t
  scripts/dev/resume.sh` makes one, or on the owner's Mac `createdb -T
  flossify_t_final flossify_xyz` (a seeded test copy there), then
  `DB=flossify_xyz npm run db:migrate`.
- Do not save or share the SwiftCare admin screenshot the owner once sent (it
  shows a real minor patient). The SwiftCare sample under `public/samples/swiftcare/`
  keeps SwiftCare's own branding; do not restyle it.

## Where everything stands

**`main`** carries migrations through `043_intake_fixes.sql`. PR #38 (the round
below) and PR #39 (this handoff and the resume check) were merged by the owner
on 1 Oct, in that order, and Render deploys `main` with `db:migrate` before each
version, so the live database should now be at 043. **Not checked from here:**
the cloud session's network policy refuses flossify.ph, so the post-deploy look
(the site loads, `/healthz` is `{"ok":true}`, a record and the calendar open, the
new screens are there) is still owed. Do it first, from a machine that can reach
the site, and check `select max(name) from schema_migrations;` from the Render
shell.

**PR #38** held three of the owner's requests, built as one round and verified
together:

1. **The Treatment record**: the patient record's Timeline became page 4 of the
   PDA dental chart (date, teeth, procedure, dentist, charged, paid, balance,
   next visit), oldest first, with an A4 print. The running balance is
   `patient_balance()`'s rule.
2. **Six scheduling features**: blocked time (040: lunch, closed days, a
   dentist's hours and leave, a chair out of use, one reader
   `clinic_unavailable()`, honoured by the desk and by every public slot); free
   times as chips; a one-dentist clinic books with her; a time tapped on
   `/find/` is held; edit a booked visit in place; tooth-first charting with an
   offered chart update (042); the PTR number on prescriptions and letters (041).
3. **The step-by-step patient intake, phases 1 and 2** (039, fixes in 043): the
   consent library as data with every form's words pinned by a hash, intakes and
   links and clinic tablets under forced row-level security, the desk's steps,
   "Hand this device to <name>" (`/auth/park/`), the patient's pages
   `/f/i/<token>/`, and the record's Consent forms pane.

Its description lists each part and the builder's verification: desk and
schedule suites 719 of 719, `test:consent` 24 of 24, the intake database checks
19 of 19, the QR forms backend test 31 of 31, the 7-role snapshot, lowest
contrast 4.75:1, every target 44 px, races and a production start. The resume
check reproduced what it can on a fresh machine on 1 Oct: 43 files migrate from
empty in order, the seed runs, `test:consent` 24 of 24, the database checks 19
of 19, and the build completes.

**The intake's phase 3, the patient's own phone, is built** (1 Oct, after the
merges; no migration): the QR code on the desk's screen, Start on the first
phone, the birth date for a patient on file, the live panel, and a page 1 fix
that stopped a non-male adult on every device. `CLAUDE.md` "Add patient, step by
step (039)", the Phase 3 bullet, and `docs/intake-design.md`. Verified end to
end in two browsers (`scripts/dev/intake/phone-e2e.mjs`) and measured (0
contrast fails, lowest 5.30:1; fits 390 px; 44 px targets).

**Merged since the 26 Sep handoff** (none of this is to be redone): #23 QR
patient forms; #24 the earlier handoff and the glass tools; #25–#30 clinic sites
P1–P5 (usernames and each clinic's door, roles as rows, members, the Roles
screen, tasks, every clinic's own site); #31 light or dark as the person's
choice; #32–#35 the complete patient record, its paperwork, colour-coded
sections, every detail as a pill; #36 every visit clickable with its signed
consent; #37 the paperless day.

## The resume check — run it first

```sh
git fetch origin main
DB=flossify_t scripts/dev/resume.sh            # needs a local PostgreSQL 16 or 17 and Node 22+
PR_BRANCH=<branch> DB=flossify_t scripts/dev/resume.sh   # also compares with an open pull request's branch
```

On a machine with no PostgreSQL: `initdb` a cluster under `/tmp` as a non-root
user, `pg_ctl start` on a spare port, then `PGHOST=<socket dir> PGPORT=<port>
PGUSER=postgres` in front of the command. Chromium for the browser checks: set
`PW_CHROMIUM` to its binary when Playwright's own build is not installed.

It prints where the checkout stands against GitHub, installs the packages,
creates (if missing), migrates and seeds that local database, runs `test:consent`
and the intake database checks where the checkout has them, builds, and ends
with a summary. "Nothing failed" is the state the pull request was left in.
Without `DB=` it skips the database and its checks; `--no-build` skips the
build. It refuses a remote `PGHOST` and a set `DATABASE_ADMIN_URL`, and it
never drops anything.

What it cannot do, because they need a running server and a browser: the QR
forms backend test, the glass measurements and the booking walk (Tools, below).

## What to do next

### 1. After the merges: look at the live site, and tell the owner

1. flossify.ph loads, `/healthz` is `{"ok":true}`, the calendar and a record
   open, the Treatment record, blocked time, the free-time chips and Add patient
   → *At the clinic, step by step* are there. Screenshots to the owner. (The
   phone path arrives with the pull request that carries this note; after it
   merges, the same look at Add patient → *On their phone*.)
2. If anything is wrong, the Render dashboard's deploy log says whether
   `db:migrate` applied 039 → 043; **never put `--allow-late` in `render.yaml`
   or the Procfile**: it is for a database that somehow has 040–042 without
   039, by hand, once.
3. Tell the owner, in a few lines, what the two pull requests changed for
   clinics, and the questions below.

Open with the owner before a clinic depends on it (also in `CLAUDE.md` "Open"):

- p07 §7.1: should a reminder wait while its visit sits in closed time nobody
  handled? The default ships reminders unchanged.
- Turnover between visits stays 0 until the owner sets it.
- Online slots will be fewer, on purpose: "any dentist" is offered only while a
  dentist who is in is free, and a one-dentist clinic cannot be double-booked
  from the web any more.
- A dentist reads the chart-effect mapping and its sentences.
- A dentist and the owner's lawyer read the ten consent forms and the general
  consent before `CONSENT_REVIEWED` (`src/lib/consent-library.ts`) is filled;
  production offers none of them until then. The Filipino "In short" lines for
  nine forms and the attestation's Filipino are not written.
- The QR patient forms stay closed on the live site until a new privacy notice
  covers what they collect (`FORMS_PRIVACY_VERSIONS`, `CLAUDE.md` "Patient forms").

### 2. The intake's phase 4: the record integration

Phases 1 to 4 are built (1 Oct): the forms signed through an intake or on
paper sit on the visit panel and the Treatment record (4.1); a form is signed
again from the record, on a phone or a tablet, with newer words prepared
again (4.2); page 1 of an intake added to a patient on file is compared with
the record, "Use" per detail, and the Health section names the forms (4.3);
and withdrawals and overrides are asked for first (Mark done anyway, the
strip's Go ahead anyway) and drawn everywhere the form is (4.4). None needed a
migration. `docs/intake-design.md` says what each settled. What is left is
the owner's: the forms' words (`CONSENT_REVIEWED`), the Filipino lines, and
whether the calendar's In the chair step should ask too.

### 3. Then

The `CLAUDE.md` "Open" list, in the owner's order when they give one. Email,
Semaphore's first live send and billing's placeholders are the oldest items.

## What lived only in session scratchpads and is gone

Nothing below is in the repository. Rebuild from the repository if needed, and
**put anything the next session will need under `scripts/dev/` or `docs/`**,
never in a scratchpad: that rule is why this file and `resume.sh` exist.

- `intake-spec.md` (above).
- `entrance-check.mjs` (the staff entrance's measurements), `snap.mjs` /
  `cmp.mjs` (the 7-role × 20-page snapshot), the scheduling round's verification
  scripts (its V1–V6 in the pull request's description) and the desk and schedule
  suites (719 checks). `CLAUDE.md` describes each approach well enough to write
  them again; they are not needed to merge PR #38.
- The build workflow that produced the round, phase by phase. The repository's
  equivalent is this file's "What to do next" plus `resume.sh`.

## Tools in the repository

- `scripts/dev/resume.sh` — the resume check above.
- `npm run test:consent` — the consent library and seal units (PR #38 branch).
  `npm run consent:hash` prints the hash of every template's words; new words
  are a new version id and a new row in one change.
- `scripts/dev/intake/phone-e2e.mjs` — the phone path end to end: a dev server
  on a throwaway database (`DATABASE_URL` as `flossify_app`, `SESSION_SECRET`,
  `SMS_PROVIDER=console`, `UPLOAD_DIR`), then `DB=<db> node
  scripts/dev/intake/phone-e2e.mjs http://127.0.0.1:4610`; `--keep` leaves a
  Start screen, a birth-date screen and the desk's QR step open and saves the
  browsers' states (`KEEP_DIR`) for `contrast.mjs` with `PW_STATE`.
- `scripts/dev/intake/db-test.mjs` — the intake database: row-level security,
  grants, triggers, definers answering status words, seals and the chain,
  retention, races. Rolls back; refuses a database that is not on this machine.
  `DB=<db> node --experimental-strip-types --no-warnings --import
  ./scripts/ts-register.mjs scripts/dev/intake/db-test.mjs`.
- `scripts/dev/qr-forms/backend-test.mjs` — the QR forms' back end against a
  running dev server (its header says how; `ts-resolve.mjs` beside it).
  `qr-decode-test.mjs` decodes the poster at several sizes, blurred and turned.
- `scripts/dev/glass/contrast.mjs` — text contrast against the real pixels
  behind every line (hides text, screenshots, reads the pixels under each text
  box; WCAG AA). `node contrast.mjs <home|start|find|any/path/> <light|dark>
  <desk|phone|wide|laptop|tablet> <base-url> [outdir]`. On the home page it
  redirects the film to `/video/tour-test.webm` (a VP9 copy, git-excluded; the
  ffmpeg line is in `scripts/film.mjs`).
- `scripts/dev/glass/measure-page.mjs <outdir> <path> [base]` — screenshots and
  card geometry at 1440×900 and 390×844; `measure.mjs` does home and `/start/`.
- `scripts/dev/glass/make-uploads.mjs` — test "uploaded photos" for clinics in a
  throwaway database (a real room, all-black, all-white, harsh stripes, none).
- `scripts/dev/glass/book-e2e.mjs`, `signup-e2e.mjs` — a real booking with Undo
  (with a held slot on the PR #38 branch) and a clinic sign-up, against a local
  server on a throwaway database.
- `scripts/film.mjs` — the home page film walk; `scripts/record-walkthroughs.mjs`
  re-records the two "How to register" videos (`REC_BASE=<url>`).
- Headless Chromium has no H.264: verify the scrub with the VP9 copy and the
  visuals from decoded frames. Set `PW_CHROMIUM` to a Chromium binary when
  Playwright's own is not installed.
- On the owner's Mac there is no `timeout`; wrap long commands as
  `perl -e 'alarm shift; exec @ARGV' 150 <cmd>`. A throwaway PostgreSQL on a
  machine without one: `initdb` a cluster under `/tmp` as a non-root user,
  `pg_ctl start` on a spare port, and `PGHOST=<socket dir> PGPORT=<port>`.
