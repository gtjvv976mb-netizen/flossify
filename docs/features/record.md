# The patient record

*Moved here from `CLAUDE.md` word for word on 10 Oct 2026 (plan item 1.9). `CLAUDE.md` holds the rules; this file holds the detail. Where they differ, `CLAUDE.md` wins.*

## The clinical record (033) — Treatment record, Treatment, Notes, Prescriptions, Files, next check-up

The patient record (`patients/[patient].astro`) is **a paper chart** (2 Oct 2026). The owner first asked for "one
seamless page, where all details are shown, and a plus sign appears next to editable or addable", then, on seeing it:
"its still too complicated, imagine that the patient records is a paper record, simple, uneventful but effective".
Built from standard dental practice and the PDA's patient record — the real SwiftCare admin record the owner linked
was **not** opened, twice (another clinic's patient data behind its login; on 2 Oct the owner sent
`/admin/patients/<id>?tab=workspace` again and was asked to describe it, or send screenshots with the patient's
details covered, instead).

- **The paper record (3 Oct 2026) — this is the record now; the bullets after it are its history.** The owner sent a
  Philippine clinic's real three-page paper record and asked: "make the patient records as simple as this, better a
  digital copy of the real form", then "make it a better but still simple like that". The photos showed a real minor
  patient's details: they were used for the form's layout only and nothing from them is in the repository (as with the
  SwiftCare admin screenshot: do not save or share them). The record is one page of **three paper sheets**, then the rest
  folded:
  - **Page 1** (`article.pp-sheet.pp-page`): `_record/Letterhead.astro` — THIS clinic's own name, address, phone and
    email from its row (never another clinic's branding, no logo), Chart # (`chart_no`, opens Edit details) and Date (the
    day the chart was opened); the **Patient's chart** (Odontogram with `codes`: each finding's paper code drawn on its
    tooth by CSS from the attributes `paint()` already sets, and the paper's legend "C – Caries · Ex – Extraction · …"
    under the arches; and `primary`: the baby teeth as a small arch of their own, below); the **Patient information record**: Basic information in the paper's order (Patient name |
    Occupation; Date of birth | Age | Gender | Contact number | Email address; Address | Parent's or guardian's name; a
    six-column `.pf-grid`), HMO · Emergency contact · Desk note in a second grid, **Dental history** and **Medical
    history** (`_record/PaperHistory.astro`, `paper-history.css`), then blood pressure. Edit details gains Occupation and
    Parent or guardian (name, relation, mobile) behind `has_paper_fields` (`readPersonForm` / `updateDetails` in
    import.ts; Add patient never sends the flag).
  - **Page 2: Informed consent** — the privacy notice first (one ruled line once on record: DeskConsent's opt-in `line`;
    the desk's form otherwise, unchanged), the clinic's paper forms on file, then the paper's **ten paragraphs in its
    order** (`PARAS` in ConsentForms.astro, a UI-only map — never in consent-library.ts; `_record/ConsentRow.astro` per
    form: the signature slip or "Signed on paper", state, date — a paper signing's own date —, signed by, "Explained by
    Dr …", withdrawals and overrides in full). Changes in treatment plan, Radiograph and Drugs and medications point to
    their point in the general consent ("No form of its own. See …") — a reference, never a claim that it covers them.
    Then the general consent (its words folded, printed in full) and the paper's foot: Patient's signature (parent or
    guardian if a minor) · **Dentist who explained** (never called a signature: no dentist's signature is stored) · Date —
    the newest agreement still standing (a withdrawn or refused one is not shown as standing). No consent word changed.
  - **Page 3: Treatment record** — Date · Procedure (teeth first, "36 MO · Composite filling") · **Wire** · Next visit ·
    Dentist · Amount · Balance · **Sign** with `finance.bill`, and Date · Procedure · Wire · Next visit · Dentist · Sign
    without it (no money row is read then). Wire is `plan_adjustment.wire` (045; "Adjustment done" has the field, ≤ 60
    characters, shown in the adjustments list, the visit panel and the ledger). Sign is who entered the line
    (`procedure_done.created_by`, `plan_adjustment.done_by`, `invoice.created_by` and `payment.received_by` inside
    `loadLedgerMoney`, so behind finance.bill), blank for imported and unknown rows, and on a signed consent row the
    signer's own small signature. The printed record's foot says what Sign means (print only: no explaining lines on
    screen). The balance rule is `patient_balance()`'s, untouched. Screen and A4 paper share `buildLedger`.
  - **Attached to this record** (`_record/Attached.astro`): Treatment (plan, done, lab cases, LOAs, payment plans),
    Clinical notes, Prescriptions and letters, X-rays and files, Appointments (with the next check-up), Account
    (finance.bill), Texts — each a closed `details.pp-att` with one status line ("2 on the plan", "₱1,200 owed"). Every id,
    hash, opener and post landing still works: the server draws a sheet open when the page lands there or a panel in it
    is drawn open (`PART_OF` / `partOf`); `show()` opens a region's fold; a capturing `ws:panel-open` listener and a
    post-load net open the sheet around any panel opened from outside it — **a dialog inside a closed `<details>` is drawn
    0×0 while still making the page inert** (measured), so a new part must be in `PART_OF`.
  - **The head** keeps ‹ Patients, the actions (New booking the one teal, Edit details, **Print the record**, More), the
    safety chips and the contents grouped Page 1 · Page 2 · Page 3 · Attached. The facts line and the four numbers are
    gone (the paper says each fact once). Pages are numbered ("Page 1 of 3"), not the parts. Headings: h2 per sheet,
    h3 per section, h4 for the cards inside (Pane and Head take `level` 4).
  - **Print the record** prints the three sheets like the paper: black on white whatever the screen theme, no shell,
    pluses, contents, strip or attached sheets, each sheet on its own A4 page with "<name> · Chart # <no> · Page N" at
    its foot (no "of 3": a very long history can still spill onto a second sheet), ticks drawn in ink (they print without
    background graphics). Audited `record.print` by a beacon on beforeprint, at most once a minute.
- **On paper (4 Oct 2026).** The owner: "make the patient record panel look like it's a paper record instead of the normal
  template design". Every `.pp-sheet` (the three pages and the attached sheets) is a sheet of paper on the desk, screen
  only (`@media screen` in record.css, "The record on paper"; print is unchanged): warm off-white `--pp-paper` with a grain
  too faint to cost a word its contrast (2.5% at most), square-cut with a paper's shadow, the letterhead's name in a printed
  serif from the device's own fonts (`--pp-serif`, nothing fetched) over a double rule, each section's title (`.pp-head`)
  in a shaded band `--pp-band` between ink rules (a block inside a section, `.pp-head-sub`, is not banded), the boxes ruled
  in `--ws-hair-strong`, and what was filled in (`.pf-v`, the ledger's cells, the history's ticks) in blue pen ink
  `--pp-pen`; "Not on file" stays printed ink-2 and an allergy red. **The same paper in both themes**: the sheet carries the
  light values of every colour token, so it is drawn and measured as in light mode, and global.css's dark blocks also
  name `.pp-sheet :is(.ws-panel, [popover])`, so a side panel or the chart's palette opened inside a sheet is in the
  person's theme (measured). The head above the sheets (‹ Patients, the actions, the contents) stays the workspace.
  paper-check passes unchanged (lowest 4.68:1, light and dark: the sheet's words are the light ones in both).
- **The dental and medical history (3 Oct)** — `src/lib/paper-history.ts` (pure): the paper's 12 problems and 23
  conditions in its order and words, stored under the words the record already uses (High blood pressure →
  "Hypertension"; aliases are only real re-spellings, never a narrower or wider word), and everything else the paper asks
  in `medical_history.answers.paper` (`{v:'paper-2026-10', …}`: former dentist's name, location and number; last dental
  care and last X-ray as partial dates; flossing and brushing; problems; physician's name, location and last visit; a
  blood transfusion and when; pregnant, nursing, birth control pills; other serious illnesses or operations). No
  migration; every save is still an insert; a form without `has_paper` keeps what is saved; lists compare by meaning, so
  a re-spelling is not a change. `showsPregnancy()` is the one rule for where the pregnancy questions appear (asked, or
  an answer on file), and the form never pre-ticks Yes over a patient's newer No. After a save conflict the paper fields
  are rebased (`rebasePaper`): only this person's own changes are kept. A box with no desk answer shows the patient's
  own words and where they came from ("From the patient forms (QR-…)" or "From the forms the patient filled in (IN-…)").
  The QR forms' and the intake's questions are unchanged. Unit tests: `node --experimental-strip-types --no-warnings
  --import ./scripts/ts-register.mjs --test src/lib/paper-history.test.ts`.
- **The chart's codes (045)** — tooth_state gains extraction (Ex), root_fragment (RF), abutment (Ab), pontic (P),
  denture (Rm) and the surface restorations amalgam (Am) and inlay (I), in every list that names conditions (demo.ts
  `CONDITION_LABEL` / `CONDITION_CODE` / `SURFACE_SCOPED`, api/chart.ts, the palette in the paper legend's order, the
  swatch, global.css). Crown is J and bridge Fx, as on paper; our extras are F (filled), RCT (root canal), Impl (implant)
  and V (veneer) — for a dentist to confirm (review pack, "The chart's codes").
- **The baby teeth (A–T) on the chart (3 Oct)** — Odontogram's `primary` draws them as a small arch of their own: 55–51 |
  61–65 over 85–81 | 71–75, labelled in the notation in use (FDI; Universal A–J across the upper arch from the patient's
  right and K–T back across the lower, 55 = A, 65 = J, 75 = K, 85 = T; Palmer A–E in each quadrant, "URA"). Beside the
  permanent arches where the card holds all 26 teeth at 32 px or more (`@container pt-chart (width >= 62rem)`: 1366,
  33–36 px teeth, the chart note under both); from a 68rem chart (1440 and up) under the permanent arch at 44 px, so the
  chart note and its mouth map stay on the right beside the teeth, as an adult's (the owner, 4 Oct: "in the baby teeth,
  put the chart on the right side so it's visible"); under them otherwise (30 px teeth at 390, the arch whole); printed
  beside them on page 1 (22 px teeth, codes at 7 pt so Impl and RCT clear a neighbour, the arch's name left on screen;
  page 1 still one A4 sheet, 1009 px with a full history). Open for a patient under 13 by the birth date (`primaryOpen`,
  `babyOpen` in the record) or when a baby tooth has a finding or work (the component reads its own marks); otherwise
  behind one quiet **Baby teeth** pill beside the notation (a real button, 44 px, `aria-expanded`, `data-odo-baby-toggle`;
  open, the chosen thing's tint); hidden, the arch prints hidden too. A baby tooth is charted exactly like a permanent
  one (palette, surfaces, codes, legend, chart note, work marks, offline), saved by `POST /api/chart`, whose tooth set is
  the 52 (`isOnChart` in chart-offer.ts is the same set; `tooth_state.fdi` always allowed 11..85, no migration). The
  script changed only where it had to: `pips()` maps quadrant q to ((q − 1) % 4) + 1, and the arrow keys walk the teeth
  as laid out (`stepFrom`: Right and Left along each line and on to the next, Up and Down to the next line's nearest
  tooth; with the baby arch hidden exactly the old ±16 step); the toggle is its own handler. The record's scroll-sync
  pairs the rows within a set (`data-odo-set`). Measured: the arch's name, numbers, midline, codes and the toggle ≥ 4.5:1
  light and dark at 1440 and 390 (lowest 4.97:1 light, 6.58:1 dark), no sideways scroll from 1920 to 360.
- **The chart's pictures (4 Oct)** — the owner: "in the teeth chart, integrate a picture image of the teeth (or whole mouth
  image) for easy identification". Each tooth's box has its **side view** drawn beside it on the outside of the arch
  (`.odo-pic`, roots away from the midline), and the **whole mouth from above** ("Where it is") heads the chart note.
  - **Drawn here, never an image**: `src/lib/tooth-drawing.ts` (pure) hand-draws the 26 kinds (16 permanent, 10 baby) once,
    crown up with the mesial side on the right, as path data in one hidden `<defs>` that every tooth `<use>`s;
    `flipFor(fdi)` turns a picture for its quadrant (upper crown down, the patient's left mirrored, so the mesial side
    always faces the midline) and `tiltFor(fdi)` leans an impacted one toward the midline; `MOUTH` is the map, worked out
    once (both arches as a chart reads them — the patient's right on the left, the upper arch on top — each tooth at an
    average crown's size, the baby arch inside). `src/lib/tooth-name.ts`: "lower left first molar", "upper right first baby
    molar" (`toothName`, `toothTitle`), in each tooth's label, the palette's title ("Tooth 36 · Lower left first molar") and
    the map's line. Unit tests: `src/lib/tooth-name.test.ts` (all 52 names, the turns, the map's places).
  - **What a picture shows is read by CSS from the box's own attributes** (`.odo-col:has(> .tooth[data-state=…])`, the
    component's `<style is:global>`): `paint()` and the stored data are untouched. A whole-tooth finding fills the crown in
    the box's colour; missing, unerupted and impacted are dashed; extraction is crossed; a root fragment is the roots only,
    hatched; a root canal a line down each root; an implant a threaded post; a pontic and a denture tooth have no root. A
    surface finding leaves the picture alone (the pips say which surface). A click on a picture opens the tooth as its box
    does (the button stays the only control).
  - **The map is a picture only** (`aria-hidden` as a whole, nothing in it a control: its shapes were 10–17 px). It lights the
    tooth pointed at or focused, whichever the person did last, and the open one, and its line names it in the notation in
    use; the findings show faintly. Where the note runs under the arches (below a 68rem chart)
    the map is a compact 192 px picture beside the note (patients.css, `[data-odo-note]`, from a 28rem chart; small over it
    on a phone); there it is too far below the upper teeth to follow the pointer, so patients.css hides its line and the
    map follows the open tooth only (the script reads the line's display). Beside the arches it heads the 272 px column and
    follows the pointer and the keyboard. The **palette** has the same map, small (88 px), the open tooth lit, so wherever a
    tooth is opened its place in the mouth is in view. The pictures print small (18 px, a hairline); page 1 still fits one
    A4 sheet. A dentist reads the drawings' simplifications in the review pack ("The chart's pictures").
- Checked by `scripts/dev/record/paper-check.mjs` (rewritten for the three sheets and the attached sheets: order, the
  letterhead names this clinic, basic information in the paper's order, Edit details saves occupation and guardian and an
  older form keeps them, sheets closed on a plain load and opened by their hashes, a history box puts the caret in view,
  the print shows only the three sheets; contrast ≥ 4.5:1 light and dark at 1440 and 390 with every sheet opened —
  lowest 4.68:1 light, 5.59:1 dark —, 44 px, no sideways scroll), phone-e2e (all paths), the history unit tests and the
  QR forms backend test. A 63-agent review (five angles, two skeptics per finding) confirmed 23 defects; all fixed and
  re-checked.
- *(History, 2 Oct: the twelve numbered parts on one sheet, below. The ids and openers they name all still exist.)*
- **One sheet** (`<article class="pp-sheet">`, 64rem, the card colour in both themes) under the head (`.pp-top`, the
  same width): the name line, the allergy and safety chips, and one line of facts (Next visit · Last visit · Balance ·
  Consent: `.pp-facts`, no number tiles). Then **Contents** (`RecordNav.astro`: numbered links `#rec-<id>`,
  `data-rec-link`, nothing sticky), today's visit as a note set apart (`.vs`), and the **twelve parts in the paper
  chart's order, numbered**: 1 Patient information · 2 Medical history · 3 Dental chart · 4 Treatment · 5 Treatment
  record · 6 Clinical notes · 7 Consent · 8 Prescriptions and letters · 9 X-rays and files · 10 Appointments · 11
  Account (with `finance.bill`'s money view) · 12 Texts. Ids stay (`rec-overview`, `rec-health`, …). Each part is a
  `role="region"` under `Banner.astro`: its number and name over a rule (`.pp-head`, `h2#rec-<id>-title`), its adds
  on the right. **No colour groups, no icons, no explanations**: the hue banners, the group colours (`sections.ts`,
  deleted), the cards' icon tiles and the lines saying what a part is for are gone (the record's colour-coding of
  27 Sep is reversed by this request); the parts' cards are flattened into the sheet in record.css ("The record as a
  paper chart"), pills read as plain words, and only what must stand out keeps colour (an allergy in red, a warning
  in amber, money owed). A card titled as its part keeps its title for a screen reader only.
- **Lines, not tiles.** Patient information is label-and-value lines (`.pp-lines` / `.pp-line`, two to a row from
  640 px), the desk note, the next check-up and the patient forms' answers. The medical history is lines too (birth
  date, allergies, conditions, medicines, the note for the dentist, who updated it); its form is folded under
  **Change the medical history** (`<details data-pp-edit>`, open after a post that needs it). Health in short,
  Recent visits and Treatment in short are gone: the parts follow on the same sheet.
- **The plus** (`_record/Plus.astro`: a soft teal ring, round 44 px beside a value, or a quiet pill with words —
  "Add" on an empty line) is beside everything that can be added or changed, for someone who may: each detail (Edit
  details opens with the caret in that field, `data-rec-field`; the birth date goes to the medical history), each
  medical-history line (its form unfolds with the caret in that list's box; the record's `show()` opens a closed
  `<details>` around its target), and every part's add in its card's heading (Add to plan, Record a treatment, New
  lab case, New note, New prescription, Add files, Take a reading, Ask for an LOA, New plan, Pick a day, New charge,
  Book a visit). New booking is the page's one teal button in view.
- **Compact, like a printed record** (the owner, 2 Oct: "make it less space consuming and more organized, like a
  real dental record"). Patient information and the medical history are **boxed form cells** (`_record/FormCell.astro`,
  `.pf-grid`: four to a row, two on a phone; a small label over the value; Full name, Address, HMO, Emergency
  contact, the desk note and each health list take two). A box that can be changed is its own 44 px button
  (`.pf-go`, the whole box) with a small plus in its corner: Edit details with the caret in that field, or the
  medical history's folded form. A card with nothing in it is one line (its name, the words, its plus: the
  `:has(> .ws-empty)` rule in record.css); the next check-up is one line with its choices; the chart's findings are
  one line ("Findings 47 D Caries · 11 Veneer …") instead of tiles; the sheet is 72rem with tighter type, rows,
  tables and callouts. Measured on one patient: 9082 → 6800 px tall at 1440, 13145 → 11606 at 390.
- **Simpler and closer** (the owner, 2 Oct: "make the UI/HUD simpler and less spacious … in the patient records"). No line
  that explains the page (the chart's "saved as you make it" and how-to, the Treatment record's balance note — the
  mismatch and the 300 cap still show —, Signed at visits', the patient forms', the letters', the desk hint under
  privacy consent on the sheet only), and no count lines ("1 on record", "0 about this patient"). Each part's buttons are
  in its heading: Print on the Treatment record, In Finances and New charge on Account, All texts on Texts, and the
  letters' three kinds as pluses (Certificate · Referral · Clearance, `data-letter-kind`). The head is one row (‹
  Patients · chart no. and facts · the actions; no avatar), the facts inline; the contents use short names
  (`SECTIONS[].short`, the full name for a screen reader) on one line from 1366 px and one sideways-scrolling row on a
  phone (its links are `position: relative`, or their sr-only words widen the page); This visit's done line and extras
  share a row; the medical history's updated line, Change and Earlier versions share a row; the Findings line is gone
  (the chart note lists them). Account is one line. The "every look is logged" line is the sheet's foot. Measured on the
  same data: 6005 → 4630 px at 1440, 10119 → 8392 at 390; paper-check passes (lowest 4.75:1 light, 5.59:1 dark), and
  counts the teal button in the first screen only.
- The script is small: measure the workspace bar into `--rec-top` (`scroll-margin-top`), a contents link scrolls its
  part under the bar and puts its name in the address, an address with a part's name or any id opens there, and
  with none the server's choice (`data-rec-start`, the part a post came from).
- Checked by `scripts/dev/record/paper-check.mjs` (the parts in order and numbered, none hidden, no banners, icon
  tiles or number tiles, a plus on every changeable detail, the contents land under the bar, `#consent`, the pluses
  do what they say, none for someone without editing; every line on the sheet ≥ 4.5:1 — lowest 4.75:1 light, 6.27:1
  dark — 44 px, no sideways scroll at 1440 and 390). A fix found on the way: Consent's buttons sat in a `<p>` that
  held `<form>`s, which a browser closes, so they fell one under another; it is a `<div>`.

`src/lib/record.ts` is the whole back end (`loadClinical`, `loadChartChanges`,
`recordAction`, `readRecordFile`); the sections are `patients/_record/*.astro` + `record.css`.

- **Every write is one post** with an `intent` in `RECORD_INTENTS`, checked by `canEditRecords` in the same
  transaction, audited `record.*`. A refused post is thrown out of the transaction (`Refused` in the page),
  so nothing half-done stays, and comes back in its side panel with what was typed (`PANEL_OF`).
- **Treatment plan items** walk planned → accepted → done (or declined); Mark done writes the
  `procedure_done` row. Prices are fee-guide estimates, not statements. Lab cases: ordered → sent →
  back → fitted, or remake.
- **A signed clinical note is never changed**: the app has select/insert only on `clinical_note` (033
  revokes the rest; the database's default privileges would otherwise grant them). A correction is an
  addendum (`amends_id`). Prescriptions and treatments done cannot be deleted by the app either.
- **Prescriptions** print at `patients/<id>/rx/<rx>/` (A5, the clinic's head, the patient, ℞, the
  prescriber's PRC and PTR). The medicine box suggests generic names only, never a dose. A prescriber needs
  a PRC licence on file.
- **Patient files** (JPEG/PNG/WebP/PDF, 25 MB, 10 at a time) are stored under
  `UPLOAD_DIR/records/<clinic id>/`, checked by their first bytes, and served **only** by
  `patients/<id>/files/<file>/` behind `requireWorkspace` + RLS (no-store; views and downloads audited).
  The public `/uploads/` route cannot reach them. Remove hides a file (`removed_at`), never deletes it.
- **Next check-up** (recall) sits on the Overview: 3/6/12 months in one tap, or a day.
- **Tooth-first entry (p01, step 1).** Add to plan, Record a treatment, the clinical note and Add files
  pick the tooth on `_ui/ToothPick.astro`: FDI tiles in the chart's order, mirrored at the midline from
  400px and stacked below it, baby teeth behind a toggle, Whole mouth or No tooth, and M O D B L toggles (I
  on an anterior). A typed box sits under the grid; the server reads it too (`pickedTooth()`): when the
  radios hold nothing the typed box wins, and a picked tooth that differs from the typed one is refused.
  Old text posts still read the same. For people with `records.edit`, the chart's palette adds "For 26 MO"
  with Add to plan, Treatment done and Clinical note — `data-pick-open`, never `data-ws-open`, so the shell
  never takes a hidden palette button as the opener of a panel it draws open. They open the panels over
  the Chart on that tooth; those panels live outside the sections (`_record/TreatmentPanels.astro`,
  `NotePanel.astro`, `pickpanel.ts`), because a dialog in a hidden section is not drawn. Treatment done lists
  that tooth's open plan items as one-tap Mark done forms, so planned work is never recorded twice. A save
  from the palette posts `back=chart`, lands on the chart with its line, and gives focus back to the tooth.
  The actions hide offline, on a kept copy, or when the tooth's server check gets no answer. The chart shows
  a ring under a tooth for open plan items and a dot for work done in the past year, with a legend and a
  work sentence in each tooth's label. A new note opens with today's treated teeth ticked; an addendum with
  none. `Odontogram.astro` changes only additively (props `actions`, `work`, `codes` and `primary`, and the pictures, which
  read the boxes' attributes); its offline logic is untouched.
- **The chart after a treatment (p01 step 2) is an offer, applied only by a tap.** What a treatment does
  to the chart is `procedure_catalog.chart_effect` (042; the seven default codes, set by a trigger when an
  insert says nothing), never guessed from a name. `chart-offer.ts` is the table, pure and shared by page
  and server. Mark done and Record a treatment land on `?treated=<procedure_done id>#chart-offer`, in the
  section the post came from, when the offer has something worth a word: "Update the chart?" with one quiet
  Update the chart (intent `chart-apply`, hidden fields only) and Leave the chart as it is; the uncovered,
  other and no-surfaces cases say why and open that tooth on the chart; nothing to change gets no callout.
  A baby tooth gets the same offer as a permanent one (`isOnChart`; the "baby" offer and its sentence are gone). Record a treatment's chart line is never ticked as drawn, and its box and hidden fields
  are disabled unless it is an `apply` offer on a tooth with nothing waiting. Every write is
  `chartFromRecord` (`src/lib/chart-write.ts`) inside the record post's transaction, in this order: the
  page's sign-in (`sid`, else `chartskip=ended`), the chart lock `'chart:' + lower-case patient id` (the
  same as `/api/chart`), then the check that the tooth still shows what the page showed (else
  `chartskip=changed`, naming who charted it and when). Applied writes the ledger row with `clinic_id`,
  `tooth_state` with `change_id` and `procedure_id`, and `chart.update`. Offline or on the kept copy, the
  button hides and one line says the update needs the connection (`ChartOffer.astro`). A dentist still reads
  the chart-effect mapping and its sentences before a clinic depends on them.
- The Treatment record (below) is the PDA's ledger, built from the visits (035); the chart's own history
  (who charted which teeth, when) is under Chart, "Changes to the chart" (`loadChartChanges`).
- **Colour-coded by group (27 Sep) — reversed on 2 Oct** by the paper chart above: the parts are numbered instead,
  and the hue classes (`.hue-*` in record.css) survive only where a component still uses one inside a card.
- **Every detail was its own pill or tile** (the owner, 27 Sep: "make each specific detail more visible … their own
  pill"): `.rp` pills, `.rk` tags and `.rf-grid` tiles are still the markup inside the cards, and still drawn so in the
  rest of the workspace; on the record's sheet they read as plain words and ruled lines (the paper chart, above).
  Long lists (treatments done, lab cases) show the newest few and a "Show N more" button (`data-fold-list`).

## The record's paperwork (034) — blood pressure, letters, HMO LOA, payment plans

`src/lib/record-extra.ts` (`loadExtra`, `extraAction`, `planState`), the same rules as 033
(canEditRecords in the transaction, audited `record.*`, a refused post comes back in its panel).
Components: `_record/Vitals`, `Letters`, `Loas`, `PayPlans`. The head shows the safety chips (BP today
or out of range, clearance needed/waiting/cleared, an LOA waiting, a plan behind), each a button to its section.

- **Blood pressure and pulse** (`vital_sign`, insert-only) top the Health section. `bpWords`
  (`record-extra-words.ts`, no Node imports, so the panel's script says it while typing) uses the bands
  dental guides commonly use: 180/110 postpone and refer; 160/100 ask for medical clearance; 140/90
  take again; under 90/60 low. The page says it is a guide, not a diagnosis.
- **Letters** (`clinical_letter`): dental certificate, referral, request for medical clearance, in
  "Rx & letters". Printed at `patients/<id>/letters/<id>/` (A5, PRC and PTR; a clearance carries the
  latest BP and a part for the physician). Insert-only, except the clearance reply columns
  (column grant). The signer needs a PRC licence on file.
- **HMO LOA** (`hmo_loa`, `treatment_plan_item.loa_id`): asked → approved (code required) or denied →
  used when every item it covers is done (record.ts plan-status). A plan item waiting for its LOA says
  so and Mark done asks first. HMOs are the branch's (`payorOptions`, kind hmo).
- **Payment plans** (`payment_plan`, `plan_adjustment`): the money is ONE statement the plan makes
  (`createStatement`), paid in Finances like any other, so no balance is counted twice. The plan adds
  the schedule and braces adjustments. Missed = scheduled payments due by today that what was paid does
  not cover (the down payment counts as one). Making or stopping one needs finance.bill; amounts show
  only with it; anyone with records.edit records an adjustment. A statement an active plan is built on
  cannot be voided (`voidStatement` names the plan: stop the plan first, 6 Oct).
- `ws:panel-open` now carries `auto: true` when the server drew a panel open (a refused post): a page
  must not refill that form from the first matching opener (`src/components/ws/shell.ts`).
- **PTR (041).** `staff.ptr_number` / `ptr_year` is the PTR on file. A prescription and a letter take a copy
  (`prescription.ptr_*`, `clinical_letter.ptr_*`) inside the save's transaction and print only that copy,
  never the live value: a 2026 paper reprinted in 2027 keeps its 2026 PTR, and a paper from before 041
  prints the blank line. Never join `staff.ptr_*` into a select that also has `r.*` / `l.*`: node-pg keeps
  the last column. The year is compared with the paper's own issue day, and the panels compare with today.
  Amber means none, no year, last year's from 1 February, or a later year outside December; last year's in
  January and next year's in December are a quiet line. Nothing blocks a save; the PRC still does. The
  number is taken as the receipt prints it: trimmed, spaces collapsed, upper case; letters, digits, spaces,
  dots, slashes and dashes, with at least four digits (widen `PTR_RE` if a city's format is refused). A PTR
  may be saved for last year or this year, and next year from 1 December. Two writers: Edit details on a
  person's page (`people.manage` and `mayManage`), and My page's own PTR form (`action=ptr`, for
  `signsPapers`: the one detail a person sets for themself, audited `staff.ptr`, bumping no token). Both post
  what they were drawn with (`ptr_seen`, `ptr_year_seen`): a form that did not touch the PTR keeps what is
  on file, and one that changes a PTR changed elsewhere since is refused with what it is now. The fix links
  in the panels' notes open in a new tab, so a paper being typed is never lost. The code is
  `src/lib/ptr.ts`; the record's words are `_record/PtrWords.astro`.

## The visit panel and the signed consent (035)

The owner asked for "the full details of the patient's visit" — a visit is clickable and pops out the
doctor, the consent form, the signature (the patient signs on an iPad), the procedure, the tooth, the time
and the amount paid. (It was drawn as the Timeline's cards; the Timeline is now the Treatment record, below.)

- **A visit opens in a side panel** (`_record/VisitPanels.astro`, rendered outside the sections) from its
  date on the Treatment record, Visits' "See the whole visit" and Consent's "See the visit": the visit,
  consent and signature, treatment done, the dentist's notes, BP, Rx and letters (Print), payment
  (charged, paid, HMO share, still owed, each statement's lines, each payment), files, texts.
- **What belongs to a visit** is `loadVisits()` in `src/lib/visit-record.ts`: its `appointment_id`, else
  the Manila day (the visit that had started by then). Treatment, notes, prescriptions or a statement
  on a day with nothing booked make an "At the clinic" day of their own; BP, files, letters and payments
  only join an existing one; a payment follows its statement. The per-visit balance is
  `patient_balance()`'s rule, statement by statement. `Visit.bookedAt` (the appointment's `created_at`)
  is what the Treatment record's Next appt. reads.
- **The consent is signed by hand on the clinic's tablet** at `/c/<slug>/patients/<id>/sign/<visit>/`, its
  own page (no workspace sidebar for a patient to wander into): step 1 for the clinic (tick the plan's
  open lines the dentist explained, anything else, the dentist), "Hand the tablet to <name>", step 2 for
  the patient (the treatment, `TREATMENT_CONSENT`'s words in force, who signs — only a parent or guardian,
  with relation, when the birth date says under 18 — name, finger signature, one tick). Saved, it shows
  only "Thank you — please hand the tablet back"; the desk's button returns to the record with the visit
  open (`?visit=<id>`). Offered for a visit going ahead today or later, or one the patient is
  at now (`canSign`); never for a cancelled, missed or past visit.
- **`visit_consent` (035) is insert-only for the app** (select, insert; measured: update and delete are
  refused) and a trigger checks the visit is this patient's at this clinic and the version is a
  treatment consent. `signVisit()` in `src/lib/visit-consent.ts` re-checks everything in the transaction
  (canEditRecords, visit status, the words in force, the minor rule, the strokes), audit `consent.sign`.
- **The signature is strokes, never an image**: `[[x, y], …]` lines of whole numbers in a 1000 × 400 box
  (`readStrokes`: ≤ 80 strokes, ≤ 6000 points, enough ink to be a signature), drawn back as one SVG path
  (`_record/Signature.astro`) in dark ink on a white slip in both themes, like paper.

## The Treatment record — page 4 of the PDA dental chart

The owner: "rename the timeline to "Treatment record" and make it as such". The record's second section is
the Philippine treatment record ledger — Date · Tooth no./s · Procedure · Dentist/s · Amount charged ·
Amount paid · Balance · Next appt. — oldest first, one row per treatment, charge and payment.
`src/lib/treatment-record.ts` builds it (`buildLedger`, `loadLedgerMoney`, `loadRecallsSet`) for both
`_record/TreatmentRecord.astro` and the paper at `patients/<id>/treatment-record/` (A4 portrait, the heads
repeat, black on white; audit `record.treatment_record_print`), so the screen and the paper never differ.

- **Clinical rows come from `loadVisits()`'s placement**, so the ledger and the visit panel agree. A visit
  with nothing done is still a row (did not come, not marked yet, cancelled with something in it); a
  statement alone is not a visit. A date opens that visit's panel; "Also <time>" a second visit that day.
- **Only statements are charges** (a treatment's price is a fee-guide estimate). Every line of a counted
  statement (issued, partly paid, paid) appears exactly once: on its treatment's row when linked by
  `procedure_id` and issued that day (or on the visit's row for a one-line statement naming the visit, whose
  line then names the procedure — "Consultation"), else as a charge row on the statement's day ("done
  <day>"). Never matched by description. Discounts, the HMO or PhilHealth part and payments are rows; a
  payment dated before its statement sits on the statement's day ("paid <day>").
- **Balance is `patient_balance()`'s rule** through `sumsOf()`, on the last row of each day money moved.
  The last one must equal `patient_balance()`; if not, no balance shows, the section says so and the server
  logs the patient id (`treatment-record balance mismatch`, no name). Void statements and voided payments
  are not counted; they stay in Money. The money columns and rows need `finance.bill`, on screen and paper.
- **Next appt.** (on a day with a visit): the next appointment booked by the end of that day, else a
  check-up set that day, else a braces adjustment's next date.
- A table where the section is 54rem or wider (fits at 1440, not at 1366 with a wide system font); below
  that each day is a card with labelled lines (`@container trec`). Over 14 days, all but the last 10 fold
  behind "Show N earlier days" (the hidden attribute; `.trec tbody[hidden]` is declared, since a display
  rule on tbody beats it). An old `#timeline` link lands here and the address is rewritten to
  `#treatment-record`; `?visit=<id>` opens on the Treatment record when the visit is on it, else on Visits.
- Measured: the last balance equals `patient_balance()` for every dev patient and a crafted one (a part
  payment finished later, a senior discount, an HMO share part-paid by the HMO, a statement two days after
  its treatment, a payment dated before its statement, a void statement, a voided payment, a consultation
  charged by one line, money on account); every word ≥ 4.5:1 light and dark at 1440 and 390; no target
  under 44px; no sideways scroll at 1440 · 1366 · 1280 · 1200 · 1024 · 390; the paper fits A4 with no cell
  overflowing; a dentist without `finance.bill` sees no peso sign on screen or paper.
- Measured: every line on the cards, the panel, Consent's list and both signing steps ≥ 4.5:1 light and
  dark at 1440 and 390; no target under 44px on the signing page; no sideways scroll at 390.

## The paperless day (036) — arrival, this visit, checkout, texts after, the desk's lists

Built from `docs/clinic-operations.md` (how a dental clinic runs, from the call the day before to the archive;
the owner: "be the manager and the dentist owner, improve the experience for the clinic, the staff and the
patient"). One migration, 036; the pieces in the order of a visit:

- **Arrival.** A visit's card shows the minutes waited (`waitMinutes`, amber past `WAIT_ALERT_MIN` = 15) and
  Today's patients rows have one tap for the next step (`stepOf` in `patients.ts`: Arrived · In the chair · Done,
  through `/api/schedule` like the panel, `boot.canSchedule`). A walk-in is a tick on the booking panel ("Here
  now"): `POST /api/schedule` takes `status: 'arrived'` only as that first step, sends no confirmation text and
  runs `applyStatus` to arrived in the same transaction. The board refreshes itself every 30 s while visible
  (`refresh()` in `board.ts`: `LIVE_KEYS` decide what counts as a change; a status change flashes the card and is
  said in the `data-cal-live` region; a card gone from the range is drawn cancelled; nothing moves under a drag).
- **The visit panel's checklist** (`fillCheck` in `panels.ts`, `data.ts`'s EXTRA subselects): "Before we start"
  on a visit today — health history asked (and how long ago), blood pressure today, the consent signed for THIS
  visit, under 18, a clearance or lab case still out — and "Before they leave" on a done one: the statement (or
  Charge this visit, which pre-fills the visit), the aftercare sheet, the next visit or check-up (In 3 months · 6
  months · A year → `POST /api/recall`, the same `recall-set` as the record) or Book a visit. Every line is
  words plus its one action, never a blocked step.
- **"Consent to treatment signed for this visit" has one answer**, `visit_treatment_consented()` (039): the
  tablet's signing or an agreed general consent form for the visit. The calendar (cal/data.ts), the In the chair
  question and the record's strip (`consentedIds` → `VisitStrip`'s `consented`, 6 Oct) all read it. The per-visit
  button is **Sign consent for this visit** everywhere; "Sign on this tablet" is a consent form's own button.
- **The Dashboard takes no posts** (6 Oct): the old Today page's status form posted to `/c/<slug>/` and skipped
  the schedule's checks; a post there now changes nothing. Every status change is `/api/schedule`.
- **The chart's Clear chart is off on the record** (Odontogram's `clearAll`, default false, 6 Oct): one tap wiped
  every finding. A tooth is cleared one at a time in the palette.
- **This visit on the record** (`_record/VisitStrip.astro`, above the sections, for today's going visit:
  `?visit=` else the one under way, else the next, else the one just done). Lines for what is missing in the
  order a visit runs, pills for what is done, "All done" when nothing is. Every chairside form it opens — a
  reading, a note, a treatment (and a plan item's Mark done), a prescription, files, the health form — carries a
  hidden `visit`, read by `visitOf()` in `record.ts` (this patient's, not cancelled, else null) and written to
  `appointment_id` (036 added it to `prescription`, `vital_sign` and `attachment`), so the visit panel and the
  Treatment record place it under the visit instead of matching it by the day (`visit-record.ts` still falls back to the day for old rows).
  "No change" is `intent=health-checked` → `recheckHealth()`: a copy of the latest answers under the person who
  asked (audit `health.checked`), so "last checked" is today; a history over a year old is an amber chip on the
  head. `?open=vitals|note|rx|done|file` opens that panel as the page loads (its section shown behind it); a
  post from the strip comes back with `?visit=` kept, so the strip is still there. A signing comes back to
  `?visit=<id>` (no hash): today's visit shows the strip, a later one opens on Visits.
- **Checkout.** `finances/new/?visit=<id>` pre-fills every treatment recorded at the visit (stamped, or that day
  with no visit named) that no non-void statement charges yet, at the price the dentist wrote, the tooth in the
  words; the statement stores `appointment_id` and each line `procedure_id` (`LineIn.procedureId`,
  `ChargeIn.visitId`, checked to be the patient's own), so the panel's `unbilled` count and the visit panel's Paid
  are right and nothing is charged twice: `createStatement` takes a per-patient advisory lock (`charge:<patient>`)
  and refuses a treatment already on a non-void statement, naming it. A recorded price of 0 is left blank for the
  desk; one outside the fee guide's range is pre-filled as a line of its own, so the save is never refused on a line
  nobody typed. "Paid now" (a Payment card) records the payment in the statement's own transaction
  (`saveStatement(…, after)`: a refused payment rolls the statement back and the page says so) and lands on
  `?done=paid&p=<payment>`, where the acknowledgment prints. The booking panel's new patient is named by
  `splitName()` (the import's Filipino-name rule: particles, suffixes), not split on the first space.
- **Recall that acts.** `applyStatus('completed')` closes the open recall due within 60 days of the visit. Clinic
  settings → Clinic profile has two switches, `clinic.remind_48h` (a second reminder two days before; on by
  default) and `clinic.recall_texts` (off by default): `sms_enqueue_reminders()` now writes both passes
  (`remind48:<id>`), and `sms_enqueue_recalls()` (definer, called by the worker every pass, acting only Tuesday
  and Wednesday 9–11 am Manila) texts one open recall due within 14 days or up to 60 days overdue, no future
  visit, a `09` mobile, at most once in 60 days (`recall.last_sent_at`, shown on the Next check-up card). Texts
  of kind `recall` and `aftercare` wait through quiet hours like reminders.
- **Aftercare** (`src/lib/aftercare.ts`, no Node imports; a dentist reads the words before a clinic ships them).
  Nine sheets (extraction, surgical extraction, root canal, filling, cleaning, crown, denture, braces adjustment,
  whitening), English and Filipino, printed at `patients/<id>/aftercare/<kind>/` (A5, `?lang=en|fil|both`, audit
  `record.aftercare_print`); `kindForCatalog(code, name, category)` finds the sheet from the fee guide's code,
  else the words, else an ortho category. On Done, `queueAftercare` in `schedule.ts` texts the check-in
  (`aftercareText`, GSM-safe, no link, "call <clinic number>") `AFTERCARE[kind].hours` later (`queueText`'s
  `sendAfter` → `next_attempt_at`), once per visit (`aftercare:<id>`), only with a Philippine mobile on file.
- **The desk's lists.** `/c/<slug>/calls/` (Dashboard → Today's patients → Calls): tomorrow's and the next open
  day's `booked` visits grouped by mobile, the reminder's state, Confirmed / Left message / No answer / Will call
  back (`appointment_contact`, 038, insert-only), no-shows and cancellations to call back, a printable sheet.
  `/c/<slug>/finances/close/` (Finances → Close the day, and the Dashboard's Collected today tile): payments
  today by method, the drawer count against the cash expected (`day_close`, 037, insert-only, many closes a day
  and the newest counts), what is still open (in the clinic, done and not charged, charged and unpaid, left
  owing, did not come), tomorrow in three numbers. `finance.bill` opens it; `finance.money` shows amounts.
  Texts → Text a patient lists anyone with a reason (on the book, seen lately, a check-up due, lab work back,
  owes) and fills a template (`src/lib/text-templates.ts`, eight, GSM-safe, no link, no reply asked). The
  Patients tab has Due for check-up and Not seen in a year, and Needs attention includes a health history older
  than a year.
- Measured: every new line ≥ 4.5:1 light and dark at 1440 and 390 against its composited background, no target
  under 44 px, no sideways scroll; the strip's done pills sit in 44 px hit boxes (`.vs-go`, as the head's chips).
