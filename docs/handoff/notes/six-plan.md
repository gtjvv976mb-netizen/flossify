# Build plan for the next round: blocked time, slot suggestions, booking from the slot, edit in place, tooth-first charting and PTR

Shorthand used below:
- `cal/` = `src/components/ws/cal/`
- `settings/` = `src/pages/c/[clinic]/settings/`
- `patients/` = `src/pages/c/[clinic]/patients/`
- `_record/` = `patients/_record/`

Spec codes: **p07** blocked time, **p24** slot suggestions, **p32** booking from the slot, **p25** edit a booked visit, **p01** tooth-first charting, **p15** PTR.

## 0. Base and ground rules

- **Base.** Branch `claude/funny-ritchie-ujucx6` at `18a4017`, the Treatment record. That commit is not on `main` yet (`origin/main` is `d07558b`). Either merge that PR to `main` first and branch from `main`, or branch from `18a4017` directly. Every spec was checked against `18a4017`.
- **Integration branch.** Create `round/next` from the base.
  - Every queue item in §4 is one PR into `round/next`.
  - `round/next` goes to `main` once, after the combined verification (§6) and the gates (§7).
  - Several slices cannot be deployed on their own. For example, the desk's soft stop is useless before its "Book anyway" button exists, and Settings must not say "lunch is never offered to patients" before the public slots honour lunch.
- **Ownership.**
  - At any moment each file has exactly one owning track (§4).
  - A PR touches only files its track owns at that moment. The reviewer checks `git diff --name-only round/next...HEAD` against the track's list.
  - Ownership changes only at the hand-offs named in §4.
- **Never:**
  - edit `src/data/schema.sql` or an applied migration (038 and below, and 039 once it exists);
  - use number 039;
  - edit `CLAUDE.md` in a track PR. The paragraph goes in the PR description and integration applies it (§5.10);
  - `pkill` astro.
- **Each worktree has its own:**
  - `.env` (copied, with `DATABASE_URL` pointing at its own database);
  - `node_modules`;
  - database, built with `DB=<name> npm run db:setup`;
  - port.

  Rebuild the database after every rebase, because migration files reach `round/next` out of number order.

---

## 1. Files each spec touches

### p07 Blocked time (migration 040), split into five slices

- **A1 migration:** `src/data/migrations/040_blocked_time.sql` (new), exactly as spec §2.
- **A2 server core:**
  - New:
    - `src/lib/block-words.ts`
    - `src/lib/blocks.ts`
    - `src/lib/reminder-state.ts` (moved verbatim out of `calls/index.astro`)
    - `src/lib/schedule-api.ts` (helpers moved verbatim out of `api/schedule/index.ts`)
    - `src/pages/api/schedule/blocks.ts`
  - Changed:
    - `src/lib/schedule.ts`: `isDentistHere`, `Range.blocks`, and `loadRange` with staff hours.
    - `src/pages/api/schedule/index.ts`: helpers moved out; POST/PATCH get `findBlock` and `anyway`, with walk-ins exempt; GET returns `blocks` and `staff[].hours`.
    - `src/pages/c/[clinic]/calls/index.astro`: the `reminder-state` import only.
- **A4 workspace pages:**
  - `settings/_lib/common.ts`: `SECTIONS` gains `closed`.
  - `settings/_lib/profile.ts`: lunch, the lock, `reopenNewlyClosed`.
  - `settings/_lib/closed-days.ts` (new).
  - `settings/_lib/people.ts`: the `schedule` action and `scheduleOf`.
  - `settings/index.astro`: dispatch, `may.closed`, the notes.
  - `settings/_ui/HoursSection.astro`.
  - `settings/_ui/ClosedSection.astro` (new).
  - `settings/_ui/settings.css`.
  - `settings/people/[id].astro`: `<details data-days-hours>`.
  - `src/pages/c/[clinic]/calls/index.astro`: In closed time, Keep it, the open days, the print sheet.
  - `src/components/ws/inbox.ts`.
  - `src/layouts/Clinic.astro`: + New → Block time, and the inbox row.
  - `src/components/ws/routes.ts`: `newBlock`.
- **B3 calendar:**
  - `cal/model.ts`, `cal/board.ts`, `cal/panels.ts`
  - `cal/BlockPanel.astro` (new)
  - `cal/BookPanel.astro`: `data-bk-block`
  - `cal/cal.css`, `cal/data.ts`
  - `src/pages/c/[clinic]/index.astro`
  - `cal/free.ts`, for the seam with p24 (§5.1)
- **C1 public:**
  - `src/lib/availability.ts`: `slotOpen`, `openIntervals`, `statusFor` with closures, `hoursRows` with lunch, `closedDaysText`.
  - `src/lib/directory-db.ts`.
  - `src/data/directory.ts`: `Dentist.clinics[0].hours?`.
  - `src/pages/api/bookings/index.ts`.
  - `src/pages/find/index.astro`, `src/pages/find/_ui/ClinicPage.astro`, `src/pages/find/[clinic]/book.astro`.
  - `src/pages/dentists/[dentist].astro`.

### p24 Slot suggestions (no migration, no server change)

- **B1:**
  - `cal/model.ts`, `cal/board.ts`, `cal/panels.ts`
  - `cal/FreeTimes.astro` (new), `cal/free.ts` (new)
  - `cal/BookPanel.astro`: `data-bk-free` is replaced by `<FreeTimes hook="bk" />`
  - `cal/VisitPanel.astro`: `<FreeTimes hook="vp" />` in the Move form
  - `cal/cal.css`
- The spec has no CLAUDE.md text. Integration adds one bullet (§5.10).

### p32 Booking from the slot (no migration)

- **B2 desk:**
  - `cal/panels.ts`: `openBook`'s Dentist default, one line.
  - `cal/BookPanel.astro`: the header comment.
- **C2 public:**
  - `src/lib/availability.ts`: `slotWords`.
  - `src/lib/directory-db.ts`: `soloDentist`, and the pin in `openSlots`.
  - `src/pages/api/bookings/index.ts`: the pin.
  - `src/pages/find/[clinic]/book.astro`: named steps, the strip, the reason carried over.
  - `src/pages/find/index.astro`: `data-slot-link` and `carry`.
  - `src/pages/find/_ui/patient.css`, `src/pages/find/_ui/clinic-glass.css`.
  - `scripts/dev/glass/book-e2e.mjs`.
  - `docs/service-map.md`.

### p25 Edit a booked visit (no migration), split into four slices

- **E1:**
  - `src/lib/import.ts`: `oldPhoneNote`, `birthYearNote`, `deskNoteOf`, the template hint.
  - `src/lib/invoices.ts`: `lastDiscountFor`.
  - `src/pages/c/[clinic]/finances/new.astro`.
  - `src/pages/c/[clinic]/finances/_fin.css`.
  - `src/components/ws/icons.ts`: `note` and `pencil`.
- **A3 server:**
  - `src/pages/api/schedule/index.ts`: PATCH with moved, resized and edited.
  - `src/lib/schedule.ts`: `retellTexts`.
- **D2 record:** `patients/[patient].astro`: `?open=details&dash=`, the hidden `dash` field, the redirect, the focus script, and the Notes help line.
- **B4 calendar:**
  - `cal/data.ts`: `EXTRA`.
  - `cal/model.ts`: `Extras` and `clip`.
  - `cal/VisitPanel.astro`: the Edit form and the `catalog` prop.
  - `cal/panels.ts`, `cal/board.ts`, `cal/patients.ts`, `cal/cal.css`.
  - `src/pages/c/[clinic]/index.astro`: `catalog` passed to VisitPanel.
- **Deferred to 039:** the help line under "Other notes" in `patients/new.astro` (§5.11).

### p01 Tooth-first charting (Step 2 uses migration 042)

- **D3, Step 1:**
  - `src/lib/record.ts`, `patients/[patient].astro`
  - `patients/_ui/ToothPick.astro` (new), `patients/_ui/toothpick.ts` (new), `patients/_ui/patients.css`
  - `_record/TreatmentPanels.astro` (new), `_record/NotePanel.astro` (new)
  - `_record/Treatment.astro`, `_record/Notes.astro`, `_record/Files.astro`
  - `src/components/Odontogram.astro`: additive changes only, plus the `describe()` clause.
- **F1, Step 2 core (new files only):**
  - `src/data/migrations/042_chart_effect.sql`
  - `src/lib/chart-offer.ts`
  - `src/lib/chart-write.ts`
- **D4, Step 2 wiring:**
  - `src/lib/record.ts`, `patients/[patient].astro`
  - `_record/TreatmentPanels.astro`
  - `_record/Treatment.astro`: the `offer` slot.
  - `_record/ChartOffer.astro` (new).
- **Must stay byte-identical:** `src/pages/api/chart.ts`, `src/lib/offline-queue.ts`, `public/sw.js`, `src/components/ws/shell.ts`.

### p15 PTR (migration 041)

- **D1:**
  - `src/data/migrations/041_ptr.sql` (new), `src/lib/ptr.ts` (new)
  - `settings/_lib/common.ts`: `signsPapers`.
  - `settings/_lib/people.ts`: the `edit` action, `PERSON`, `EditValues`.
  - `settings/people/[id].astro`: `#prc` and Edit details.
  - `src/pages/c/[clinic]/account/index.astro`.
  - `src/lib/record.ts`, `src/lib/record-extra.ts`.
  - `patients/[patient]/rx/[rx].astro`, `patients/[patient]/letters/[letter].astro`.
  - `patients/[patient].astro`: `ptrFix` and the quick-menu hint.
  - `_record/Prescriptions.astro`, `_record/Letters.astro`.
  - `scripts/db/seed.ts`.

---

## 2. Files touched by two or more specs

| File | Specs | Owner, then order | How the clash is avoided |
|---|---|---|---|
| `cal/panels.ts` | p24, p32, p07, p25 | B: p24 (B1) → p32 (B2) → p07 (B3) → p25 (B4) | Built in order in one worktree; seams 5.1, 5.2, 5.4, 5.5 |
| `cal/board.ts` | p24, p07, p25 | B: B1 → B3 → B4 | Seam 5.3 (the live refresh) |
| `cal/model.ts` | p24, p07, p25 | B: B1 → B3 → B4 | Seam 5.1 (`nextFree` and `Hold` rows); p25 only adds `Extras` fields and `clip` |
| `cal/cal.css` | p24, p07, p25 | B: B1 → B3 → B4 | Separate additive blocks, all inside `@layer components` |
| `cal/BookPanel.astro` | p24, p32, p07 | B: B1 → B2 → B3 | p07 anchored `data-bk-block` under `data-bk-free`, which p24 deletes; it goes directly after `<FreeTimes hook="bk" />` |
| `cal/VisitPanel.astro` | p24, p25 | B: B1 → B4 | FreeTimes stays inside the Move form; Edit is a sibling form after Move (seam 5.4) |
| `cal/data.ts` | p07, p25 | B: B3 → B4 | Different queries: p07 adds staff hours and blocks, p25 adds `EXTRA` subselects |
| `src/pages/c/[clinic]/index.astro` | p07, p25 | B: B3 → B4 | p25 adds one prop |
| `src/pages/api/schedule/index.ts` | p07, p25 | A: A2 → A3 | p25's PATCH is written on top of p07's (seam 5.2) |
| `src/lib/schedule.ts` | p07, p25 | A: A2 → A3 | Additive. `findClash`, `NEXT_STATUS`, `applyStatus` and `dropStaleTexts` are untouched by both |
| `src/lib/availability.ts` | p07, p32 | C: C1 → C2 | Additive: `slotOpen` and the rest, then `slotWords` |
| `src/lib/directory-db.ts` | p07, p32 | C: C1 → C2 | p32 shrinks to the solo pin on top of `slotOpen` (seam 5.6) |
| `src/pages/api/bookings/index.ts` | p07, p32 | C: C1 → C2 | Seam 5.6 |
| `src/pages/find/[clinic]/book.astro` | p07, p32 | C: C1 → C2 | p32's script rewrite carries p07's lines (seam 5.6) |
| `src/pages/find/index.astro` | p07, p32 | C: C1 → C2 | Different regions: closures per card, and the carry script |
| `settings/_lib/common.ts` | p15, p07 | D (D1), then handed to A (A4) | Different declarations |
| `settings/_lib/people.ts` | p15, p07 | D1 → A4 | p15 owns `edit`; p07 owns `schedule` and `scheduleOf` (seam 5.7) |
| `settings/people/[id].astro` | p15, p07 | D1 → A4 | The `#prc` pane and the `#days` pane |
| `src/lib/record.ts` | p15, p01 | D: D1 → D3 → D4 | Seam 5.8 |
| `patients/[patient].astro` | p15, p25, p01 (and 039) | D: D1 → D2 → D3 → D4 | Seams 5.8 and 5.11 |
| `_record/Treatment.astro`, `_record/TreatmentPanels.astro` | p01 Steps 1 and 2 | D: D3 → D4 | Same spec |
| `patients/new.astro` | p25, 039 | 039 | p25's one sentence is handed to 039 (seam 5.11) |
| `CLAUDE.md` | all six | Integration | Seam 5.10 |

**Shared read-only dependencies.** Nobody here edits these, but each must keep holding:

- `src/lib/health.ts` exports `manilaToday`, `dateText` and `ageOn`. p15 and p25 read them, and 039 may edit the file.
- The column `visit_consent.treatment`, which p25 reads.
- `LIMITS`, which p07 reuses.
- The `GET /api/schedule` response shape. p24's `rangeCards` reads it, and p07 adds `blocks` to it.

---

## 3. Migration numbers

| No. | File | Spec | What it holds | Built in |
|---|---|---|---|---|
| 039 | (the intake and consent work) | separate | Reserved. Not used by this round. | none |
| 040 | `040_blocked_time.sql` | p07 | The `clinic_hours` break, `staff_schedule` from/to, `clinic_block`, `appointment.blocked_ok_at` and its backfill, `clinic_unavailable()`, `public_blocked_ranges()`, `public_busy_ranges()`, and replacements of `public_directory()` and `public_dentist()` | A1 |
| 041 | `041_ptr.sql` | p15 | **Needed:** `staff.ptr_year`; `prescription.ptr_number` and `ptr_year`; `clinical_letter.ptr_number` and `ptr_year` | D1 |
| 042 | `042_chart_effect.sql` | p01 Step 2 | `procedure_catalog.chart_effect`, `procedure_chart_effect()`, and the insert trigger. The number is final because 041 is used. | F1 |
| — | none | p24, p32, p25 | Checked: `ls src/data/migrations` gains nothing from these three. | — |

**Rules:**

1. **Order in production.** `migrate.ts` refuses a pending file that sorts before the newest applied one unless run with `--allow-late`. Render's `preDeployCommand` and the Procfile's `release` run it with no flag.
   - **Preferred:** `round/next` goes to `main` only after 039 is on `main`. Merge `main` into `round/next`, rebuild every database, and re-run V1. One deploy then applies 039, 040, 041 and 042 in order.
   - **If the owner ships this round first:** 040–042 apply. The later deploy that brings 039 needs one `npm run db:migrate -- --allow-late`, run by hand by the owner. Never put the flag in `render.yaml` or the Procfile. V1 rehearses this path.
2. **When a file freezes.** A migration may change until it is first applied in production. After that, any change is a new number (043 or later). This matters for 040: if the owner answers yes to p07 §7.1, that answer is step 11 inside 040 and must be written before the first deploy.
3. **Collision check with 039, before either merges.**
   - Grep 039 for `create or replace function` of `public_directory`, `public_dentist`, `sms_enqueue_reminders` or `signup_clinic`, and for alterations of `clinic_hours`, `staff_schedule`, `appointment` and `procedure_catalog`.
   - 040 replaces `public_directory()` and `public_dentist()`. If 039 also replaces either, the one applied last silently wins. In that case, 039's change is folded into 040's function body, since 040 applies after 039.
4. **Development databases.** Files reach `round/next` out of number order: 040 on day 1, 042 from F1 early, 041 from D1. After every rebase run `DB=flossify_<track> npm run db:setup`. Test `--allow-late` only in V1.
5. **The seed.** 040's new columns are nullable and come last, so `seed.ts`'s positional inserts keep working. Only p15 edits the seed.

---

## 4. Tracks and build order

### 4.1 Tracks

Every track owns a disjoint set of files. The tracks run in parallel, in separate worktrees.

| Track | Worktree / branch | Port / database | Owns at the start |
|---|---|---|---|
| **A BOOK** (schedule server, settings, calls, shell) | `../fl-book` / `round/book` | 4417 / `flossify_book` | `040_*`; `block-words.ts`, `blocks.ts`, `reminder-state.ts`, `schedule-api.ts`; `src/pages/api/schedule/**`; `src/lib/schedule.ts`; `calls/index.astro`; `ws/inbox.ts`, `layouts/Clinic.astro`, `ws/routes.ts`; `settings/**` **except** the three files D holds until D1 merges |
| **B CAL** (calendar client) | `../fl-cal` / `round/cal` | 4399 / `flossify_cal` | `src/components/ws/cal/**`; `src/pages/c/[clinic]/index.astro` |
| **C PUB** (patients' side) | `../fl-pub` / `round/pub` | 4612, with a baseline build on 4611 / `flossify_pub` | `availability.ts`, `directory-db.ts`, `data/directory.ts`; `src/pages/api/bookings/**`; `src/pages/find/**`; `src/pages/dentists/**`; `scripts/dev/glass/book-e2e.mjs`; `docs/service-map.md` |
| **D REC** (record, papers, people page first) | `../fl-rec` / `round/rec` | 4431 / `flossify_rec` | `041_*`; `ptr.ts`; `record.ts`, `record-extra.ts`; `patients/[patient].astro`, `patients/[patient]/**`, `_record/**`, `patients/_ui/**`; `Odontogram.astro`; `account/index.astro`; `scripts/db/seed.ts`. Until D1 merges, also `settings/_lib/common.ts`, `settings/_lib/people.ts` and `settings/people/[id].astro` |
| **E FIN** (p25's finance and helpers) | `../fl-fin` / `round/fin` | 4412 / `flossify_fin` | `import.ts`, `invoices.ts`; `finances/new.astro`, `finances/_fin.css`; `ws/icons.ts` |
| **F CHART** (p01 Step 2 core) | `../fl-chart` / `round/chart` | none / `flossify_chart` | `042_*`, `chart-offer.ts`, `chart-write.ts` (all new files) |
| **I Integration** | `../fl-round` / `round/next` | 4450 / `flossify_round` | `CLAUDE.md`; the final fixes |

The ports are distinct, and p01's checks move off 4399 (p24's port) to 4431. E and F are small enough for one builder to run between other items.

### 4.2 Queue items

| Item | Slice | Waits for | Size | Its own checks before merge |
|---|---|---|---|---|
| **A1** | p07's 040 file, exactly as its §2 | none | 0.5 d | p07 SQL checks 5–7. Merge it first, the same day, because C1 needs its definer functions. |
| **A2** | p07 server core | A1 | 3 d | p07 pure check 4 (`blockSentence`); the API's soft stop (409 `blocked`/`kind`, `anyway`, walk-in accepted); blocks POST/PATCH (403, CSRF, lock); the move of the helpers is verbatim, and Calls output is unchanged |
| **A3** | p25 PATCH and `retellTexts`, plus seam 5.2 on the server | A2 | 0.75 d | p25's SQL checks: reminders withdrawn and written again, the 48 h reminder, a sent reminder, a held-over reminder, a confirmation one for one, only a new start drops texts; and seam 5.2's resize into lunch |
| **A4** | p07 settings, person hours, Calls, inbox, + New | A2, D1 | 3 d | p07 checks 8, 9, 12 (the settings half), 15 (Calls and inbox), 22 |
| **B1** | p24 | none | 3 d | p24 §6.1 (0 differences on equivalence and on the oracle, all fixtures) and §6.2 steps 1–18 |
| **B2** | p32's desk line | B1 | 0.25 d | p32 T19 |
| **B3** | p07 calendar, plus seams 5.1 and 5.3 | A2, B2 | 4 d | p07 checks 13, 14, 17, 20; p24 §6.1 run again with `blocks = []` (0 differences) |
| **B4** | p25 visit panel, card, list, extras, plus seams 5.2 (client), 5.3 and 5.4 | A3, B3, E1 | 1.5 d | p25 steps 1–10, 13, 14, 16 |
| **C1** | p07 public | A1 | 2.5 d | p07 pure checks 1–3; checks 10, 11, 16; the §5.8 identity checks |
| **C2** | p32 public, reduced to the pin (seam 5.6) | C1 | 2.5 d | p32 T1–T18; the solo SQL checks; the contrast runs |
| **D1** | p15 | none | 1.25 d | p15 §6.1–6.4 |
| **D2** | p25's record side | D1 | 0.25 d | p25 step 11, the record half (`?open=details&dash=`, `replaceState`, Back) |
| **D3** | p01 Step 1 | D2 | 5 d | p01 Step 1 checks 1–16 |
| **D4** | p01 Step 2 wiring | D3, F1 | 2 d | p01 Step 2 SQL; cases a–h; conflict, tablet offline, ended sign-in, inline line, disabled fields, waiting tooth, refused |
| **E1** | p25 finance, `deskNoteOf`, icons | none | 0.75 d | p25 step 15; a unit test of `deskNoteOf` with the spec's three rows |
| **F1** | p01 Step 2 core | none | 2 d | `chartOffer()` against the full §1.5 table and cases a–h as pure tests; `chart-write.ts` against a database (the lock key, `clinic_id`, `since` validation) |

### 4.3 Phases (working days, one builder per track)

| Phase | A BOOK | B CAL | C PUB | D REC | E / F |
|---|---|---|---|---|---|
| **1** (days 1–4) | A1 (merge day 1) → A2 | B1 → B2 | C1, once A1 is merged | D1 → D2 → D3 begins | E1; F1 |
| **Sync 1** | A2 merged | B1 and B2 merged | — | D1 merged: the settings files pass to A; D2 merged | E1 and F1 merged: F's files pass to D |
| **2** (days 5–9) | A3 → A4 | B3 | C1 merged → C2 | D3 | — |
| **Sync 2** | A3 and A4 merged | B3 merged | C2 merged | D3 merged | — |
| **3** (days 9–10) | idle | B4 | idle | D4 | — |
| **4** (days 11–13) | Integration: CLAUDE.md, docs, and the whole of §6 | | | | |

- The longest paths are B (B1 → B2 → B3 → B4) and D (D1 → D2 → D3 → D4), each about 9–10 days.
- Building F1 in its own worktree takes two days off D's path.

### 4.4 Hand-offs

| When | Files | From → to |
|---|---|---|
| D1 merged | `settings/_lib/common.ts`, `settings/_lib/people.ts`, `settings/people/[id].astro` | D → A |
| F1 merged | `042_chart_effect.sql`, `chart-offer.ts`, `chart-write.ts` | F → D |
| All merged | everything | tracks → I |

### 4.5 Worktree setup (once per track)

```sh
git fetch origin
git switch -c round/next 18a4017 && git push -u origin round/next     # or origin/main once 18a4017 is merged
for t in book cal pub rec fin chart; do
  git worktree add ../fl-$t -b round/$t round/next
  cp .env ../fl-$t/.env
  sed -i "s#/flossify_dev\$#/flossify_$t#" ../fl-$t/.env               # DATABASE_URL → the track's own database
  (cd ../fl-$t && npm ci && DB=flossify_$t npm run db:setup)
done
git worktree add ../fl-round round/next
```

### 4.6 Merge protocol

1. **At the start of each item:** `git rebase round/next` (only at item boundaries), `DB=flossify_<t> npm run db:setup`, `npm run build`.
2. **One PR into `round/next` per item.** Its description gives:
   - the files, which must be within the track's ownership;
   - the item's checks, as numbers, not screenshots;
   - the seams it closes;
   - the CLAUDE.md paragraph for integration.
3. **Merge with rebase**, only while `round/next` builds. Tracks never share files, so rebases do not conflict. The one exception would be a file-ownership violation, which is refused at review.
4. **Commits end with the repository's attribution lines.**

---

## 5. Seams: the work that exists only because two specs meet

1. **Free times over blocked time (p24, then p07; owner B3).**
   - **`model.ts`.** Keep p24's `nextFree` wrapper and add p07's parameters: `(…, now, blocks: BlockRange[] = [], dentistId: string | null = null)`.
     - Blocks become `Hold` rows:
       - `closed` and `lunch` → `{chair: 'all', dentist: 'all'}`;
       - `chair_out` → `{chair: n, dentist: null}`.
     - In `nextFree`, only the given dentist's `leave` and `hours` rows are added, as `{chair: 'all', dentist: 'all'}`. Nothing else in the ask changes, so visits count exactly as before.
     - With `blocks = []`, p24 §6.1 must still give 0 differences.
   - **`free.ts`.**
     - Holds for the day and for `freeDays` are `holdsOf(cards)` plus that day's blocks.
     - Here every dentist's `leave` and `hours` rows are `{chair: null, dentist: id}`, so `freeAt`'s own rules for a chosen dentist and for Any dentist apply.
     - Two new reasons for a day with no chips, using `blockSentence`: a clinic closure that covers the whole day, and a whole-day absence of the chosen dentist.
     - The days note drops "not their hours", because hours are honoured now. The exact words are in B3's PR and are measured.
   - **`board.ts`.** `fetchRaw` and `rangeCards` return `{cards, blocks}`. The `ahead` cache stores both. `free.ts` uses `ctx.dayBlocks(ymd)` for the local draw.
   - **`BookPanel.astro`.** `data-bk-block` goes right after `<FreeTimes hook="bk" />`. It stays hidden while Here now is ticked, under the same `off` rule.
   - **`freeHint` stays deleted.** p07's "worked out again when the dentist changes" is met by `bkFree.update()`.
   - **Dentist option names.** p07 adds " · in 1:00–6:00 pm" to a dentist option. p24's `keptName` and the free-times head split at " · ", so the name still comes out whole. Test it.

2. **PATCH with moves, edits and blocks (p07, then p25; server A3, client B4).**
   - **Server:**
     - `findBlock` runs when `moved || resized`, after p25's refusals and after `findClash`.
     - `anyway` is honoured on both paths.
     - Both updates set `blocked_ok_at = case when blk then now() else null end`, and both audit `appointment.anyway` when a block was found.
     - An edit that changes only words, and any status change, never calls `findBlock` and never touches `blocked_ok_at`.
     - p25's text rule replaces p07's "dropStaleTexts on moves": `dropStaleTexts` runs only on a new start, and `retellTexts` runs on a new dentist.
   - **Client, in the Edit form:**
     - When `!r.ok && r.blocked`, the form shows the red callout and a quiet **Save anyway** button (`data-vp-edit-anyway`) that re-sends with `anyway: true`. Save changes stays the one teal button.
     - The "Ends at …" hint adds the block sentence and "Saving asks you to confirm." when the new end runs into a block (`M.blockAt`).

3. **The live refresh in `board.ts` (p24, p07, p25; owner B3, then B4).** The final contract:
   - It can be awaited (`inflight`, `reload`).
   - It reads `{cards, blocks}`.
   - It redraws when the set of blocks' `id|kind|startsAt|endsAt` changes.
   - It reports the changed days to `panels.changed`, including the days of blocks added or removed.
   - It never refills the visit panel while the Move or Edit form is open (`formOpen`).
   - It never refreshes under a drag.
   - `LIVE_KEYS` holds today's keys plus p25's four.

4. **The visit panel's two forms (p24 and p25; owner B4).**
   - `fillVisit` hides both forms.
   - `toEdit` hides Move and calls `vpFree.hide()`.
   - `toMove` hides Edit, then calls `vpFree.update()`.
   - FreeTimes lives only in the Move form.

5. **`openBook`'s dentist (p32, then p24, then p07; owner B2, kept by B3 and B4).** The final lines:

   ```ts
   fillDentists(B.dentist, ymd, by === 'dentist' && o.col !== undefined ? o.col : (ctx.filter() || soloId));
   bkFree.update();
   ```

   The Block panel keeps its own default from p07: the filtered dentist, else the first one.

6. **The public slot rule (p07, then p32; owner C2).**
   - **What p32 keeps.** p32 lands on p07's `slotOpen` and keeps only the pin:
     - `dentist = opts.dentist || soloDentist(l)` in `openSlots`, plus the `dentistDays` filter;
     - `asked ?? solo` in `/api/bookings`, for live bookings and requests alike.
   - **What p32 drops.** Its own solo branch in `isTaken` and its solo SQL re-check go. `slotStillOpen(tx, l, { dentist: <pinned slug> })` already counts her visits, visits with no dentist (`named = false`) and the chairs.
   - **Accepted difference.** A visit whose dentist is not listed at the clinic holds a chair but not the solo dentist. That is p07's `named` rule; p32 over-blocked here, as its own risk note says.
   - **Request mode at a one-dentist clinic.** The dentist was pinned, not chosen, so ", or any dentist" is dropped from both sentences, for example "Dr. Elena Sarmiento is not in on Tue 6 Oct. Pick another day." `placeRequest` gains `pinned: boolean`.
   - **`book.astro`.** p32's named-step script carries p07's additions:
     - `data-dentists` entries with `hours` and `away`;
     - the hours in the pick line and in `data-slot-note`;
     - the `data-closed-days` line, recomputed on each dentist pick.

     At a one-dentist clinic there is no Dentist step, so `data-closed-days` names her days away from the start.
   - **CLAUDE.md.** The Open item "Any available dentist slots count chairs" is removed (§5.10).

7. **The person page (p15, then p07; owner D1, then A4).**
   - A4 rebases on D1.
   - `people.ts`: p15 owns `edit`, `PERSON` and `EditValues`; p07 owns `schedule` and `scheduleOf`.
   - `[id].astro`: p15 owns `#prc`; p07 owns `#days`.
   - `common.ts`: p15 owns `signsPapers`; p07 owns `SECTIONS`.
   - Each save must leave the other's columns alone (V3.7).

8. **The patient record (p15, then p25, then p01; owner D).**
   - `OPEN_PANEL` gains `details` (p25). `done` and `note` must still open their panels after p01 moves them into `TreatmentPanels` and `NotePanel`.
   - `rx`, `vitals` and `file` are unchanged.
   - p15, p01 Step 1 and p01 Step 2 each change a different select in `loadClinical`: the prescriptions and clinicians, then the catalog's `code`, then `chart_effect`.
   - p01 Step 2 adds `sid` to the context passed to `recordAction`.

9. **Reminder conditions (p07 §7.1 and p25).** If the owner answers yes to holding reminders inside an unhandled closure:
   - 040 step 11 changes `sms_enqueue_reminders()`;
   - p25's `retellTexts` gains the same predicate in the same change (A3, or an A follow-up if A3 has merged);
   - p07's sentences "its reminder text still goes out" change with it.

10. **CLAUDE.md (all six; owner I).** Integration applies the paragraphs from the PR descriptions:
    - a new section "Blocked time (040)";
    - under "The schedule": one bullet each for p24, p25 and p32's desk default;
    - two p32 bullets under "The patient side";
    - one p01 bullet under "The clinical record (033)";
    - a "PTR (041)" paragraph under "The record's paperwork (034)";
    - in the Layout list: 040, 041 and 042 with their new files, and "its booking (three to five steps)";
    - in the Open list: **remove** "Any available dentist slots count chairs". p07's `slotOpen` closes it for every clinic, so p32's rewording is dropped;
    - Settings' section list gains Closed days.

11. **039 (intake) touch points.**
    - `patients/new.astro`: p25's sentence ("The desk sees this beside the patient's visits on the Dashboard. Keep health details in Health.") goes into 039's PR, or lands as a one-line change after 039 merges.
    - `patients/[patient].astro`: 039 may edit its consent region. D rebases on 039 when it reaches `main`.
    - p25's `consent_for` reads `visit_consent.treatment`. 039 must keep that column, or tell B4 its replacement.
    - `health.ts` must keep exporting `manilaToday`, `dateText` and `ageOn`.
    - The function collision check is in §3 rule 3.

12. **Icons.** E1 adds `note` and `pencil` before B4 uses them. No other spec adds icons.

13. **What "unchanged" means now.**
    - p24's "count line identical to `main`" holds only on a day with no lunch or blocks, because p07 changes the count line on purpose.
    - p32's "multi-dentist `/api/availability` byte-identical to `main`" is compared against `round/next` just before C2, not `main`, because p07 changed the named-dentist path on purpose (its §5.8).

---

## 6. Combined verification (Integration, on `round/next`, port 4450, database `flossify_round`)

### V0. Static checks and the build

- `npm run build` passes.
- `git diff <base>..round/next -- src/pages/api/chart.ts src/lib/offline-queue.ts public/sw.js src/components/ws/shell.ts` is empty.
- `git diff <base>..round/next --name-status -- src/data/` shows only these changes:
  - `A migrations/040_blocked_time.sql`, `A 041_ptr.sql` and `A 042_chart_effect.sql` (plus 039 if it came from `main`);
  - `M directory.ts`.

  `schema.sql` and every applied migration are untouched.
- Grep the round's diff and confirm it adds none of these:
  - `prefers-reduced-motion`, `force-motion`, `?motion`;
  - `fonts.googleapis`;
  - a role name that decides a permission. Only the existing professional-side `role in ('owner','dentist','associate')` filters are allowed.
- Each new `data-*` hook appears only in its own component and script:
  - p07: `data-bl-*`, `data-cal-block*`, `data-lunch-*`, `data-closed-*`, `data-days-hours`;
  - p24: `data-bk-slots*`, `data-vp-slots*`, `data-ft-*`;
  - p32: `data-strip-*`, `data-slot-strip`, `data-slot-lost*`, `data-slot-call`, `data-slot-link`, `data-tapped`;
  - p25: `data-vp-edit*`, `data-bill-discount-*`, `data-bill-senior-hint`, `data-rec-details-notes`;
  - p01: `data-pick-*`, `data-tp*`, `data-tooth-work*`, `data-tooth-marks`, `data-plan-fdi`, `data-fee-surfaces`, `data-chart-*`;
  - p15: `data-rx-ptr-for`, `data-rx-prescriber`, `data-lt-*`, `data-my-ptr-form`, `data-px-ptr-note`.

### V1. Migrations

1. **Fresh build.** `DB=flossify_round npm run db:setup` applies every migration up to 042 in order. A second `npm run db:migrate` has nothing to do.
2. **Upgrade.** Take a copy of a database at 038 (or at 039, if it is on `main`). Book a future 12:15 visit on an open weekday and a future Sunday visit. Then `npm run db:migrate`. Expect:
   - p07 check 22: the Sunday visit has `blocked_ok_at` set; the 12:15 visit is null.
   - `procedure_catalog.chart_effect` is set for exactly the seven default codes in every clinic, and is null everywhere else.
   - `staff.ptr_year` is null everywhere, and no prescription or letter row gained a PTR (nothing was backfilled).
3. **The late path, if 039 is still pending.** Apply 040–042, then add 039. `db:migrate` refuses, and `--allow-late` applies it. Write the exact command into the owner's deploy note.
4. **Grants and RLS:**
   - p07 checks 6–7: `clinic_block` isolation, the definer columns, no DELETE, and the removed-block trigger.
   - p15 §6.1: no UPDATE on the PTR copies.
   - p01 Step 2 SQL: the trigger fires on a signup through `/start/`.

### V2. Each spec's own suite on the integrated build

Each suite runs on a freshly seeded database, in this order: p15 → p01 Step 1 → p01 Step 2 → p25 → p32 → p24 → p07. p07 goes last because its lunch and blocks change what the others see. Adapt these steps:

- **p24 §6.2 step 16:** compare the count lines against the base build on a database with no lunch and no blocks.
- **p32 "multi-dentist unchanged":** compare against `round/next` just before C2 (seam 5.13).
- **p32 T1 and T19:** the dentist option **starts with** "Dr. Elena Sarmiento", since " · in …" follows when she has hours.
- **p07 check 12's last bullet:** the free hint is now the first day chip, which reads 1:00 pm.
- **p07 check 14:** `data-bk-block` sits after `[data-bk-slots]`. With Here now ticked, both are hidden and no Anyway button appears.
- **p07 check 20:** at the far date, no chip falls between 12:00 and 13:00.
- The 7-role snapshot runs once, in V4, with every spec's allowed differences combined.

### V3. Cross-spec checks

Start from one fresh database, then set up:
- at `session-road`: lunch 12–1 Mon–Fri; Cariño on Tuesday 13:00–18:00; Cariño away on M+1; chair 2 out of use M+2 from 9 to 12;
- at `marikina-heights`: lunch 12–1, and a closure on M+3.

1. **Chips and blocks (p24 × p07).**
   - New booking on a Monday: no chip starts in [12:00, 13:00).
   - Cariño on M+1:
     - no day chips;
     - the say line reads "Dr. Cariño is away Mon …";
     - next-free skips M+1.
   - Cariño on the next Tuesday: the first chip is at 1:00 pm or later.
   - M+2: no chip on chair 2 before 12:00.
   - A typed 12:15 shows `data-bk-block`.
   - Tick Here now: both blocks are hidden and no GET is made.
   - p24's §6.1 oracle, re-run with real block holds added: 0 differences.
2. **The count line and the chips agree** on a day with lunch: "· lunch 12–1 pm", and the chips skip lunch.
3. **Edit in place (p25 × p07).**
   - Change a visit's length from 45 to 60 minutes so it runs into lunch: 409 with `blocked`, and **Save anyway** shows.
   - Press Save anyway: 200. `blocked_ok_at` is set, `moved_at` is null, and `audit_log` has both `appointment.anyway` and `appointment.edit`.
   - A reason-only edit on a visit in closed time leaves `blocked_ok_at` unchanged. Calls → In closed time is unchanged.
4. **Move into a block.**
   - A typed Move into lunch gives **Move anyway**.
   - A card dragged into lunch goes back to where it was; its toast carries **Move anyway**.
   - The chips never offer lunch.
5. **Live refresh (p24 × p25 × p07).**
   - Context A has the Edit form open with a typed reason. Context B adds a block on that day.
   - Within 35 seconds A's grid is hatched, the panel is not refilled, and the typed values survive.
   - With A's Book panel open on that day, the chips redraw and keep focus by time and chair.
6. **The one-dentist clinic (p32 × p07 × p24), at `marikina-heights`.**
   - **Public side:**
     - The `/find/` card offers no lunch time. Tapping it opens the booking strip.
     - On M+3 the card's pill and the clinic page's pill match.
     - With Elena away for a day: no slots that day, and `data-closed-days` names her.
     - In request mode (rolled back afterwards): "Dr. Elena Sarmiento is not in on …. Pick another day.", with no "any dentist".
   - **Desk side:** New booking opens on Elena, and the chips' head reads "… with Dr. Sarmiento …".
   - **Visits that hold time:**
     - A visit booked with no dentist removes that time from the web.
     - A visit whose dentist is not listed holds only a chair.
7. **The person page (p15 × p07).** On Hazel's page:
   - Saving a PTR leaves `staff_schedule` unchanged.
   - Saving days and hours leaves `ptr_number` and `ptr_year` unchanged, and gives the right "outside their hours" count.
   - p15 G2 (the stale form), run with a days save in between: still refused with the PTR on file now.
8. **The record (p15 × p25 × p01).**
   - Dashboard desk note → **Edit** → the record at `?open=details&dash=` → Save → back on the Dashboard with that visit's panel open.
   - `?open=done`, `note`, `rx`, `vitals`, `file` and `details` each open their panel.
   - The Rx panel's PTR notes still work next to the ToothPick-era panels.
   - `chart-apply` after a PTR change: the chart write is unaffected.
   - The palette's Mark done, then the Treatment record: one `procedure_done` row.
9. **Texts.** After V2 and V3, compare `message_log` with its state before the run:
   - no new `kind`;
   - no body contains `http`, `www.` or asks for a reply;
   - adding or removing a block, saving lunch, saving hours, Keep it and a walk-in in closed time queued nothing;
   - p25's confirmations are replaced one for one;
   - with the worker off, `sms_enqueue_reminders()` then writes one reminder per visit, with the new reason.
10. **039, if it has merged.** The "Other notes" help line appears exactly once on `patients/new.astro`. `consent_for` still reads what was signed on the tablet.

### V4. Rules for the whole round

- **Role snapshot.** Run the 7-role × 20-page snapshot (`snap.mjs`/`cmp.mjs`) on the base build and on `round/next`. The only allowed differences are:
  - **p07:**
    - Block time in More and in + New, for `schedule.edit`;
    - the lunch fields, and the Closed days section with its list entry, for `settings.edit`;
    - the days-hours details on the person page;
    - Calls → In closed time, and the inbox row, when not empty.
  - **p24:** `[data-bk-free]` gone; `[data-bk-slots]` and `[data-vp-slots]` added.
  - **p25:**
    - Edit and its form, for `schedule.edit`;
    - the Desk note row and links;
    - "Visit note" instead of "Notes";
    - the help lines;
    - the New charge lines.
  - **p01:**
    - the tooth and surface pickers;
    - the palette buttons and the Mark done forms, for `records.edit`;
    - the panels' new place in the DOM;
    - the tooth labels' work sentence;
    - ChartOffer, only with `?treated=`.
  - **p15:**
    - My page's PTR block, for people who sign papers;
    - the person page's PTR row and fields;
    - the record's PTR notes and help wording;
    - "· PTR …" on Rx cards.
- **Measurement sweep.**
  - Themes: light and dark, each chosen (`localStorage.theme`) and from the device. Chosen dark must equal device dark.
  - Widths: 1440 and 390, plus 768 and 1024 for the prints.
  - Rules:
    - every line is at least 4.5:1 against the worst pixel behind it;
    - tooth marks, rings and the pressed chip's ring are at least 3:1;
    - every target is at least 44 px and every field 16 px;
    - at 390 there is no sideways scroll;
    - at 1366×768 the Dashboard shows at least 24 rem of grid;
    - each screen has exactly one `.ws-btn-primary`.
  - Screens to check:
    - the Dashboard, and the Book, Visit/Move/Edit and Block panels;
    - Settings → Hours, Settings → Closed days, the person page;
    - My page, Calls and the inbox;
    - the record, with the palette, the four panels and ChartOffer;
    - the prints, New charge, `/find/`, the clinic page, and the booking over all five covers.
- **Reduced motion.** Re-run p24 steps 1–6, p32 T2 and p07 check 13 with `reducedMotion: 'reduce'`. The results must be identical.
- **Keyboard orders** as each spec lists them.
- **Offline.** Run the 025 offline-charting checks end to end, plus p01 checks 12–13.
- **Security.**
  - A CSRF miss is refused on each new post:
    - `closed-add`, `closed-remove`;
    - Calls `keep`;
    - My page `action=ptr`, and the person page's PTR edit;
    - `chart-apply`;
    - `/api/schedule/blocks` POST and PATCH;
    - `/api/schedule` PATCH edits.
  - 403 for a role without the key: `schedule.edit`, `settings.edit`, `records.edit` or `people.manage`.
  - Every `/c/` page is `no-store`.

### V5. Races, run together

- p07 check 19 (bookings racing blocks);
- p24 check 11 (two desks, one chip);
- p32 T8 (a 409 from a held time);
- p01's colleague-conflict and tablet-offline cases;
- p15 G2;
- a combined race at `marikina-heights`: a web booking for any dentist, a desk booking with Elena, and a block closing that time, all at once.
  - Exactly one booking is 201.
  - If the block committed after it, that booking is in the block's `inside`.
  - SQL finds no two overlapping visits holding the same dentist or chair.

### V6. Deploy rehearsal

- `NODE_ENV=production npm start` against a copy database refuses unsafe settings as before, and `/healthz` answers 200.
- `npm run sms:once` on the V3 database:
  - reminders for visits in closed time follow the owner's §7.1 answer;
  - no new text kinds;
  - no links.

---

## 7. Gates before a clinic depends on this round, and what to tell the owner

**Gates from the owner's request, carried over:**

- **Recall texts.** "Text patients when their check-up is due" (`clinic.recall_texts`) starts off. Check it on a fresh `/start/` signup and on existing clinics; each clinic switches it on itself.
- **Reviews.**
  - A dentist reads the aftercare sheets and their texts.
  - The owner's lawyer reads the treatment consent (`treatment-2026-09`).
  - The same dentist reads p01's chart-effect mapping and its §1.5 sentences, and answers two questions: should a crown over a charted root canal be offered? Should one visit's offers be gathered into one?
- **Before 040 is first applied in production:** the owner answers p07 §7.1, whether a reminder waits while its visit sits in an unhandled closure. The default ships the reminders unchanged.
- **Migration order:** §3 rule 1.

**Release notes for the owner:**

- **Fewer online slots, on purpose.**
  - "Any dentist" is offered only while a dentist who is in is free.
  - The named-dentist path now respects chairs, chairs out of use, and visits with no dentist.
  - Request mode refuses a dentist's day off.
- **The desk's extra tap.** Booking into closed time asks for **Book anyway**. Walk-ins are exempt.
- **One-dentist clinics.**
  - The web books her days only and can no longer double-book her.
  - The desk's New booking starts with her.
  - Her reminders and My visits name her.
- **Settings** gains Closed days. No list of Philippine holidays is kept; the clinic adds its own.
- **Turnover** stays 0 until the owner sets it (p24).
- **Desk notes** now show on the Dashboard, and the help lines say to keep health details in Health. No disability or anxiety flag is stored (p25).
- **PTR.**
  - A paper keeps the PTR it was saved with.
  - In January last year's PTR is fine, and in December next year's is quiet.
  - Nothing is ever blocked. If a city's receipt format is refused, widen `PTR_RE`.