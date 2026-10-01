# Handoff — where the work stopped (1 Oct 2026)

For the next Claude session, which starts from GitHub alone: a fresh clone, no
scratchpad from any earlier session, and no way to read those sessions (the one
that built the open pull request ran on another account). Everything the next
session needs is in this repository: this file, `CLAUDE.md` on the branch you
check out, and `scripts/dev/resume.sh`.

Read in this order:

1. `CLAUDE.md` **on the branch you are going to work on**. The open pull
   request's branch carries a `CLAUDE.md` about 360 lines longer than `main`'s:
   it is the record of what that pull request built (blocked time, the Treatment
   record, the step-by-step intake and the rest). `main`'s copy knows nothing of it.
2. This file.
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

**`main`** is PR #37, merged 28 Sep (UTC). It carries migrations through
`038_appointment_contact.sql`: the clinical record (033–035) and the paperless
day (036–038). It is what flossify.ph runs, so the live database's newest
migration should be 038. Check that from the Render shell before anything
merges: `select max(name) from schema_migrations;`.

**PR #38 is the open work**: a draft,
<https://github.com/gtjvv976mb-netizen/flossify/pull/38>, branch
`claude/funny-ritchie-ujucx6`, 47 commits and 144 files past `main`, mergeable
with no conflict as of 1 Oct. This repository runs no CI, so nothing has checked
it but its builder and the resume check below. It holds three of the owner's
requests, built as one round and verified together:

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

The pull request's description lists each part and the builder's verification:
desk and schedule suites 719 of 719, `test:consent` 24 of 24, the intake database
checks 19 of 19, the QR forms backend test 31 of 31, the 7-role snapshot, lowest
contrast 4.75:1, every target 44 px, races and a production start. The resume
check reproduced what it can on a fresh machine on 1 Oct: 43 files migrate from
empty in order, the seed runs, `test:consent` 24 of 24, the database checks 19
of 19, and the build completes.

**Merged since the 26 Sep handoff** (none of this is to be redone): #23 QR
patient forms; #24 the earlier handoff and the glass tools; #25–#30 clinic sites
P1–P5 (usernames and each clinic's door, roles as rows, members, the Roles
screen, tasks, every clinic's own site); #31 light or dark as the person's
choice; #32–#35 the complete patient record, its paperwork, colour-coded
sections, every detail as a pill; #36 every visit clickable with its signed
consent; #37 the paperless day.

## The resume check — run it first

```sh
git fetch origin main claude/funny-ritchie-ujucx6
git checkout claude/funny-ritchie-ujucx6      # to finish PR #38; main for anything else
git merge origin/main                         # brings this file and resume.sh onto the branch
DB=flossify_t scripts/dev/resume.sh            # needs a local PostgreSQL 16 or 17 and Node 22+
```

(This handoff and the script were written on `main`'s side after the pull
request branched, so the merge is what puts them on that branch; it has no
other conflict as of 1 Oct.)

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

### 1. Finish PR #38 (the plan's step 4: the final check, then ready and merge)

The build and the suites are done above. What remains is the check the owner
relies on, on a fresh machine, and then the merge:

1. Run a dev server on the throwaway database (`DATABASE_URL` pointing at it as
   `flossify_app`, see `.env.example`; `SHOW_DEMO_LOGINS=1` shows the seeded
   logins) and walk the new screens as the pull request describes them: the
   Treatment record and its print; blocked time on the calendar, in Settings,
   on Calls and on `/find/`; the free-time chips; a one-dentist clinic on both
   sides; Edit a visit; the tooth picker and the chart offer; PTR on a
   prescription; Add patient → *At the clinic, step by step*, through a hand-over
   and the patient's pages to Send and the record's Consent forms pane.
2. Measure: `scripts/dev/glass/contrast.mjs` and `measure-page.mjs` on every
   new or changed page, light and dark, desk and phone (0 failures, nothing
   under 4.5:1, no target under 44 px, no sideways scroll at 390). Keyboard order.
   Emulating Reduce Motion must show the same motion.
3. Re-read `CLAUDE.md` on the branch against what you saw; fix what disagrees
   (the branch, not the notes, unless the notes are wrong).
4. Mark the pull request ready and merge it. Render then runs `db:migrate`,
   which applies 039 → 043 in order on a database at 038. **Never put
   `--allow-late` in `render.yaml` or the Procfile**: it is for a database that
   somehow has 040–042 without 039, by hand, once.
5. After the deploy: flossify.ph loads, `/healthz` is `{"ok":true}`, the
   calendar and a record open, and the new screens are there. Screenshots to
   the owner.
6. Tell the owner, in a few lines, what the pull request changed for clinics
   and the questions below.

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

### 2. The intake's phase 3: the phone path

The owner's request (29 Sep): Add patient **by QR** or at the clinic, step by
step; before the QR the staff tick which consent forms the procedure needs;
page 1 patient information, then the consent forms, then the profile is made.
Phases 1 and 2 are the clinic-device path. Phase 3 is the same intake on the
patient's own phone from the QR code on the desk, and phase 4 the record
integration.

The intake spec (`intake-spec.md`) lived in a session scratchpad and is gone.
What survives, and is enough to re-derive it: `CLAUDE.md` on the branch, "Add
patient, step by step (039)", with the owner's four answers (procedure forms
are signed only after the named dentist records "I explained this"; the profile
is made at Send unless the patient looks like one already on file; a fresh
signature on every form with initials on the risks; the six scheduling features
first); the data model in `039_patient_intake.sql` and `043_intake_fixes.sql`;
the definers' status words in `scripts/dev/intake/db-test.mjs`; and the phone
precedent in the QR forms (`src/pages/f/[key].astro`, `CLAUDE.md` "Patient
forms": throttles, the honeypot, the 64 KB cap, nothing kept between patients).
**Write the phase 3 design into `docs/` this time** (`docs/intake-design.md`),
then build it on a branch from `main` after PR #38 is in.

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
