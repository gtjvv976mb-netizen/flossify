# Handoff — where the work stopped (9 Oct 2026)

For the next Claude session, which starts from GitHub alone: a fresh clone, no scratchpad, no memory of earlier
sessions, and possibly **another Claude account** (the owner asked on 9 Oct to move the work to their other
account). Everything the next session needs is in this repository: `CLAUDE.md`, `docs/features/`, this file,
`docs/simplify-plan.md` and the two scripts `scripts/dev/resume.sh` and `scripts/dev/e2e.sh`.

Read in this order:

1. `CLAUDE.md` on `main`: the standing constraints, the owner's decisions, the Retired list and the rules that protect
   patients, consent and money. The record of everything built is in `docs/features/`; CLAUDE.md's last section,
   "Where the detail lives", says which file holds what.
2. This file.
3. `docs/simplify-plan.md`: the plan the owner asked for on 6 Oct ("can you plan on simplifying the whole site"), and
   its 25 questions (section 5). `docs/simplify-plan.html` is the same plan as a page with the questions as choices
   and a "Copy my answers" button: open it in a browser and send it to the owner.
4. Run the two checks (below) before changing anything.

## Moving to another account

- **GitHub.** The repository is `gtjvv976mb-netizen/flossify`. If the new Claude account signs in to GitHub as a
  different user, the owner adds that user as a collaborator with write access (GitHub → the repository → Settings →
  Collaborators), then connects GitHub in the new Claude account and lets the Claude GitHub App reach this repository.
  Nobody else can do that step for them, and the session never touches the owner's credentials.
- **Nothing else moves.** Render deploys `main` to flossify.ph (web + worker, Singapore) and runs
  `npm run db:migrate` before each deploy; the database is DigitalOcean Managed PostgreSQL 17. Both stay on the owner's
  own accounts.
- **Private pages on claude.ai stay with the old account.** Copies are in the repository: the plan page
  (`docs/simplify-plan.html`) and the review pack for the dentist and the lawyer (`docs/review/review-pack.html`,
  rebuilt by `npm run review:pack`). Publish them again from the new account if the owner wants a link.
- **Branches.** `claude/lucid-ptolemy-38t0gn` was the last session's branch and holds nothing that is not on `main`.
  A new session works on its own branch, started from `main`.

## The owner and how to work with them

- Flossify is the owner's startup: practice software for Philippine dental clinics, from Baguio City. The test is
  **user experience and user-friendliness**, for patients and clinic owners both.
- The owner writes short messages ("merge", "do it", "start with the safety fixes"). Pattern that works: build on a
  branch, verify with numbers, open a pull request with what changed and how it was checked, then **merge only when
  the owner says "merge"**. After a merge, watch the Render deploy to success and check the live site
  (`https://flossify.ph/healthz` answers 200).
- When the owner asks for a plan or anything they will read, make it readable without the code: plain words, short
  sentences, what changes for a clinic.
- Standing decisions, never re-opened (`CLAUDE.md` "Standing constraints", "Your decisions" and "Retired — do not
  bring back"): motion always on, never gated on `prefers-reduced-motion`; no footer and nothing fixed to the bottom of
  the screen; the soft template everywhere (white rounded cards, one teal button per screen, sentence case, line
  icons); frosted glass where a clinic is the background; the workspace has four tabs; no faces, no 3D, no tooth chart
  on the home page.
- Every new line of text is **measured**: contrast ≥ 4.5:1 against what is behind it, light and dark, at 1440 and
  390 px wide; targets ≥ 44 px; fields 16 px; no sideways scroll. Every dark rule needs both twins.

### Rules that protect people (never relax)

- Never type passwords, API keys or tokens for the owner; they enter secrets themselves (Render dashboard, shell).
  Their email is only for identifying them.
- Never touch the `flossify_dev` database in tests, and never run `npm run db:setup` (or `scripts/db/setup.sh`)
  without `DB=` naming a throwaway database: it drops the database first.
- Never edit an applied migration or `schema.sql`; a change is a new numbered file (the newest is `046`).
- Never put `--allow-late` in `render.yaml` or the `Procfile`.
- The owner once sent a SwiftCare admin screenshot and SwiftCare admin links: another clinic's real patient data. Do
  not open the links, and do not save or share the screenshot. (The SwiftCare sample site in `public/samples/` is a
  separate, public concept and is fine.)
- On 3 Oct the owner sent photos of a Philippine clinic's real three-page paper record. They show a real minor
  patient's details. They were used for the form's layout only. Nothing from them is, or may be, in the repository,
  a test, a comment or a document; do not ask for them again or share them.
- A test or a helper agent never deletes audit rows (`audit_log`, `auth_event`) to tidy up after itself; archive
  test patients instead of deleting them (`CLAUDE.md` "Rules that protect patients, consent and money", the `W-` chart
  numbers; the full note is in `docs/features/open.md`).

## Where everything stands (9 Oct 2026)

- **`main`** carries pull request #53 (`723b9cd`, the safety fixes) and #54 (this handoff, merged 9 Oct), with
  migrations through `046_prc_needs_number.sql`. Both deployed on Render, web and worker successful, and
  `https://flossify.ph/healthz` answered `{"ok":true}` afterwards.
- **Owed by the owner:** in the Render web service's deploy log for that deploy, the line starting `046:` says whether
  any dentist had been marked "PRC checked" with no PRC number, and names their clinics (they went back to "PRC check
  pending"). A session cannot read the live database or the Render dashboard.
- **Open pull request #52** (draft, branch `claude/funny-ritchie-ujucx6`, from another session's 30 Sep–1 Oct work):
  a four-tab patient record. `main`'s paper record (#44–#51) replaced that design at the owner's request, and #52 is
  on hold: **the owner decides** whether to carry pieces over into the paper record (the pinned allergy line, Today's
  one-button visit lines, the `test:record-tabs` deep-link check) or close it. Its own `docs/handoff/README.md`, "STOP
  FIRST", says the same. Do not merge it or resolve its conflicts mechanically.

### Merged since the 1 Oct handoff

| PR | Merged | What |
|---|---|---|
| #40 | 1 Oct | The intake's phase 3: the patient's own phone, from a QR code on the desk's screen |
| #41 | 1 Oct | The intake's phase 4: the signed forms where the dentist looks; Sign again from the record |
| #42 | 2 Oct | Phase 4 finished; the consent question at the chair or the door; How the day runs (044); profile forms; the review pack |
| #43–#46 | 2 Oct | The patient record as one page, then a paper chart, then compact; a Dashboard for the dentist who runs the clinic |
| #47 | 3 Oct | The patient record as the clinic's paper form (three sheets; 045's chart codes and the braces wire) |
| #48 | 3 Oct | Chart: baby teeth (FDI 51–85) |
| #49 | 4 Oct | The patient record on paper (the look) |
| #50 | 4 Oct | Chart: a drawing of each tooth, and the whole mouth |
| #51 | 4 Oct | Chart: with the baby teeth open, the chart note stays on the right |
| #53 | 6 Oct | The simplification plan, and its phase 1a: the seven safety fixes (below) |
| #54 | 9 Oct | This handoff, `scripts/dev/e2e.sh`, the plan page and its evidence in `docs/` |
| #55 | 10 Oct | Handoff corrections from an independent review |
| #57 | 10 Oct | The glossary (`docs/glossary.md`) and the words check (`npm run test:words`), plan 1.8 |

Phase 1a's safety fixes, all live (`CLAUDE.md` has each as a rule or a Retired line; the detail is under its old
section in `docs/features/`, 6 under "Add patient, step by step" in `docs/features/patient-forms.md`):

1. The Dashboard takes no form posts; every visit status change goes through `/api/schedule` and its checks.
2. A statement an active payment plan is built on cannot be voided.
3. No "Clear chart" button on the patient record (`Odontogram`'s `clearAll`, off by default).
4. 046: a PRC check needs a PRC number. The operator's queue offers no Matches without one and says how many dentists
   wait for a number. The migration runner now prints a file's `RAISE NOTICE` lines in the deploy log.
5. "Consent signed for this visit" has one rule everywhere, `visit_treatment_consented()`; the per-visit button reads
   "Sign consent for this visit".
6. The review pack says the tablet's general consent and the chart's offer are already live.
7. A missing clinic or dentist page answers with the site's 404 page; its teal button is Find a clinic.

## What to do next

### 1. Get the owner's answers to the plan's 25 questions

`docs/simplify-plan.md`, section 5 ("Questions for the owner"), and the same questions as choices in
`docs/simplify-plan.html`. The owner had the page on the old account and had not sent answers by 9 Oct. Ask once,
plainly; add the decision on PR #52 (above) as a 26th. Items that wait on an answer are marked in the plan
("question N"); everything else can go ahead.

### 2. Then the plan's phases, in order

- **Phase 1a** (safety fixes 1.1–1.7): done, #53.
- **Phase 1b** (groundwork, `docs/simplify-plan.md` §4, items 1.8 and 1.9): 1.8 merged (#57); 1.9 in progress.
  - **1.8 Write the glossary first** (`docs/glossary.md`), before any screen changes; every later item uses its
    words, and its sweep over every screen is 2.32. Done (#57): `npm run test:words` fails on a retired word anywhere
    new, and `scripts/dev/words/known.json` names the item that sweeps each one still on screen. An item that
    rewrites those words removes them, then runs `npm run words:prune`.
  - **1.9 A shorter rulebook**: `CLAUDE.md` from about 1,900 lines to 300–400, the owner's decisions word for word
    and a "Retired — do not bring back" list; the owner reads the new constraints first. Its other two parts are done
    by #54: the handoff is current, and the references to lost scratchpad tools are fixed. In its own pull request
    (10 Oct): the detail moved word for word to `docs/features/`, and the rulebook for the owner to read.
  - `docs/simplify/critique.md` numbers items as the first draft did: its "2.28 glossary" is the final plan's 1.8
    (2.28 is now "One account for someone who works at two branches").
- **Phase 1c** (quick wins), **phase 2** (consolidation by area) and **phase 3** (bigger changes that need the
  owner's yes), as the plan orders them. One pull request per coherent group; each measured as above.

### 3. Still open with the owner (unchanged; also `CLAUDE.md` "Open")

- A dentist and the owner's lawyer read the consent forms, the general consent, the chart's codes and offer, the
  aftercare sheets and the drawings (`docs/review/review-pack.html`). Their sign-off fills `CONSENT_REVIEWED`; until
  then production offers none of the ten consent forms.
- A new privacy notice (the lawyer's) opens the QR patient forms on the live site (`FORMS_PRIVACY_VERSIONS`).
- Semaphore's first live text, the email provider and a verified domain, and billing's real prices and pay-to details
  (`BILLING_FINAL` stays false until then). Each needs something only the owner has.

## The checks — run them first

### `scripts/dev/resume.sh`: branch state, packages, a seeded database, unit tests, the build

```sh
git fetch origin main
DB=flossify_t scripts/dev/resume.sh          # Node 22+, a local PostgreSQL 16 or 17
```

It never drops anything (it creates the database only if missing) and refuses a database that is not on this
machine. Without `DB=` it skips the database; `--no-build` skips the build.

### `scripts/dev/e2e.sh`: every browser check, each on a freshly seeded database

```sh
DB=flossify_t scripts/dev/e2e.sh                 # paper dash seat choices profile phone
DB=flossify_t scripts/dev/e2e.sh paper dash      # only those
```

It starts its own dev server (port 4610, or `PORT=`), **drops and reseeds `$DB` before every check**, and refuses
`flossify_dev` and any remote host. On 9 Oct, in a cloud session from a cold start, paper, seat, choices, profile
and phone passed, and the Dashboard check passed when run again on its own: its first run timed out on a sign-in
because files were being edited during the run and the dev server reloaded the page (PR #54; the script's header
warns about it). The unit tests:

```sh
npm run test:consent
node --experimental-strip-types --no-warnings --import ./scripts/ts-register.mjs --test \
  src/lib/paper-history.test.ts src/lib/tooth-name.test.ts src/lib/messages.test.ts
```

### In a cloud session (no PostgreSQL running, root user)

```sh
mkdir -p /tmp/flpg && chown nobody /tmp/flpg
su -s /bin/bash nobody -c '/usr/lib/postgresql/16/bin/initdb -D /tmp/flpg/data -U postgres -A trust'
su -s /bin/bash nobody -c '/usr/lib/postgresql/16/bin/pg_ctl -D /tmp/flpg/data -o "-p 5499 -k /tmp/flpg -c listen_addresses=127.0.0.1" -l /tmp/flpg/log start'
export PGHOST=/tmp/flpg PGPORT=5499 PGUSER=postgres PW_CHROMIUM=/opt/pw-browsers/chromium
DB=flossify_t scripts/dev/resume.sh && DB=flossify_t scripts/dev/e2e.sh
```

(The pg_ctl line starts it again after the container has slept.) Verified from scratch on 9 Oct. The container's
network policy may refuse flossify.ph from a browser; `curl` reached it on 9 Oct.

Outside that recipe (a Mac with Homebrew's PostgreSQL, say), export `PGHOST=localhost` (and `PGPORT` if it is not
5432) before the checks: the check scripts default to the socket in `/var/run/postgresql`, not `/tmp`. `e2e.sh`
passes its own host on to them.

### Working by hand against a dev server

The port continues the cloud recipe (5499); use your own PostgreSQL's port (usually 5432) elsewhere.

```sh
DATABASE_URL='postgres://flossify_app:flossify_dev@127.0.0.1:5499/flossify_t' \
SESSION_SECRET='dev-only-secret-0123456789abcdef0123456789' SMS_PROVIDER=console \
UPLOAD_DIR=/tmp/fl-uploads SHOW_DEMO_LOGINS=1 TRUST_PROXY=0 \
  npx astro dev --ignore-lock --port 4610 --host 127.0.0.1
```

- Seeded logins, password `flossify`: `liwayway.domingo@example.com` (owner, clinic `session-road`),
  `hazel.tabanao@example.com` (a dentist at session-road: edits records and the schedule, but has no Finances,
  amounts or staff management), `ops@flossify.example` (Flossify's operator, `/admin/`). To see the record as someone
  who may not edit, set `staff_access.can_edit_records = false` for her at that clinic, as `paper-check.mjs` does,
  and set it back after. `/auth/login/?any=1` is the email sign-in.
- Patient `SR-0144` at session-road is the child for the baby teeth: `e2e.sh` sets the birth date to 7 years ago
  after each seed; do the same by hand after `db:setup`.
- To reseed while a server runs: end the database's connections
  (`select pg_terminate_backend(pid) from pg_stat_activity where datname = '<db>' and pid <> pg_backend_pid()`), then
  `DB=<db> npm run db:setup`. The server's pool reconnects on its own.
- A throwaway Playwright or `pg` script must sit inside the repository to find its packages: name it
  `scripts/dev/.<name>.tmp.mjs` (git ignores that pattern) and delete it after. Never `pkill astro`: it kills the session's
  own shell; use another port. Headless Chromium has no H.264 (see `CLAUDE.md` "Traps").

## Tools in the repository

- `scripts/dev/resume.sh`, `scripts/dev/e2e.sh` (above).
- `scripts/dev/record/paper-check.mjs` — the patient record: the three sheets and the attached sheets, Edit details,
  the print, contrast light and dark at 1440 and 390, 44 px, no sideways scroll.
- `scripts/dev/schedule/dash-check.mjs` — the Dashboard for a dentist who runs the clinic.
  `seat-check.mjs` — In the chair asks why for a consent form not agreed. `choices-check.mjs` — How the day runs
  (044).
- `scripts/dev/settings/profile-check.mjs` — the public profile's lines and the clinic's founding year.
- `scripts/dev/intake/phone-e2e.mjs` — the intake on the patient's phone and the record's phase 4, in two browsers;
  `--keep` leaves screens open for `contrast.mjs`. `scripts/dev/intake/db-test.mjs` — the intake's database rules
  (rolls back; run by `resume.sh`).
- `scripts/dev/qr-forms/` — **written on the owner's Mac and not runnable from a clone as they are**:
  `backend-test.mjs`, `qr-decode-test.mjs`, `qr-stress.mjs` and `seed-sample-forms.mjs` import from a hard-coded path
  there, the decode tests need `jsqr` and `pngjs` (not in `package.json`), and `backend-test.mjs` runs only against a
  database named `flossify_qr`. `qr-decode-test.mjs` decodes the code at several sizes; `qr-stress.mjs` blurs and turns
  it. Make the paths relative before relying on them (and after any change to the QR drawing, `CLAUDE.md` asks for
  that decoding).
- `scripts/dev/glass/contrast.mjs` — text contrast against the real pixels behind every line;
  `measure-page.mjs`, `make-uploads.mjs`, `book-e2e.mjs`, `signup-e2e.mjs` beside it.
- `scripts/dev/review/review-pack.ts` — `npm run review:pack` writes `docs/review/review-pack.html`; re-run it after
  any change of words a patient signs.
- `scripts/film.mjs` (the home page film), `scripts/record-walkthroughs.mjs` (the two "How to register" videos).
- Every browser script reads `PW_CHROMIUM` (a Chromium binary) when Playwright's own build is not installed, except
  `scripts/shoot.mjs` and `scripts/audit.mjs`, which name `/opt/pw-browsers/chromium` outright.
- `docs/simplify/` — the evidence behind the plan: `audit.json` (the 6 Oct audit of eight areas of the site: what
  each measured, what to keep, and its 103 proposals, plus the two it dropped and why) and `critique.md` (the
  adversarial read of the first draft, whose points the final plan answers).

## What lived only in session scratchpads and is gone

Put anything the next session will need under `scripts/dev/` or `docs/`, never only in a scratchpad.

- From before 1 Oct: `intake-spec.md` (its content is `docs/intake-design.md`), `entrance-check.mjs` (the staff
  entrance's measurements), `snap.mjs` / `cmp.mjs` (the 7-role × 20-page structure snapshot) and the 719-check desk
  and schedule suites. `docs/features/sign-in-and-people.md` describes the first two approaches well enough to write
  them again: the staff entrance's measurements under "The staff entrance — `/auth/login/`, `/auth/forgot/`,
  `/auth/code/`", and the snapshot under "Roles and permissions (030)". No document describes the 719-check suites.
- From 2–9 Oct: one-off probes and screenshots only. Everything they established is in `CLAUDE.md` and
  `docs/features/`, the pull requests' descriptions and the checks above; the plan's page and evidence were saved to
  `docs/`.
