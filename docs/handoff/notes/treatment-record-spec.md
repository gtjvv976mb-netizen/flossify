# Treatment record: spec

This replaces the patient record's **Timeline** section. The owner asked to rename the Timeline to "Treatment record" and make it one. It becomes the Philippine treatment record: the ledger on page 4 of the PDA dental chart, drawn in the soft template.

No migration, no new permission and no new API are needed. `appointment.created_at`, `recall.created_at` and `invoice_line.procedure_id` already exist. Paths are relative to the repo. `P` = `src/pages/c/[clinic]/patients/[patient].astro`, `R` = `src/pages/c/[clinic]/patients/_record/`.

---

## 1. Name, place, address

| | Now | After |
|---|---|---|
| Index button, banner title, pane title | Timeline | **Treatment record** |
| Section id / hash | `timeline` / `#timeline` | **`treatment-record` / `#treatment-record`** |
| Panel / tab ids | `rec-timeline`, `rec-rec-timeline-tab` | `rec-treatment-record`, `rec-rec-treatment-record-tab` (RecordNav builds them from the id) |
| Group, hue, icon | Patient, teal, `history` | **unchanged**: Patient, teal, `history`, still second in the index after Overview |
| Banner blurb (`sections.ts`) | "Every visit, newest first. Open one to see all of it." | "Every treatment by date: the tooth, the procedure and the dentist, as on the paper treatment record." |

- **The id changes**, because the address bar shows the section (`#health`, `#chart` …) and should name what people see.
- **Old links keep working.** In `P`'s `fromHash()` (`P:1284-1290`), map `timeline` to `treatment-record` before `getElementById`, then `history.replaceState` to `#treatment-record`. A bookmarked `…?visit=<id>#timeline` lands on the new section.
- **Aftercare back link** (`[patient]/aftercare/[kind].astro:34`): change `#timeline` to `#treatment-record` in both branches.
- **Links with `?visit=` and no hash** (`sign/[visit].astro:169,184,190`, Dashboard `recordHref` in `cal/panels.ts:72`) keep working through `current` (§8). Their code does not change.
- **The index label** "Treatment record" must be measured in the 13.75rem column (`record.css:210`) at 1200 and 1440, bold (selected) and normal. It must fit on one line. The phone row already scrolls sideways inside itself.

---

## 2. The section, top to bottom

`<Pane as="section" label="Treatment record" id="treatment-record" pad="none">`. With `pad="none"` the table runs edge to edge, like Visits.

1. **Head:** `<Head icon="history" title="Treatment record" meta=…>`.
   - Meta is "One treatment" or "N treatments" (procedures plus braces adjustments), and none when zero.
   - One quiet action in its `actions` slot: `<a class="ws-btn ws-btn-quiet ws-btn-sm" href="<here>treatment-record/">` with the `print` glyph and the word "Print".
   - No teal button here. The record head's New booking stays the one teal action.
2. **Intro line** (14.5px, ink-2, in a padded div, `px-6 max-md:px-4`):
   - With money: "One line for each treatment, charge and payment, oldest first, as on the paper treatment record. Press a date to see the whole visit: the consent and signature, the dentist's notes, prescriptions and payments."
   - Without money: "One line for each treatment, oldest first, as on the paper treatment record. Press a date to see the whole visit: the consent and signature, the dentist's notes and prescriptions."
3. **Fold:** when there are more than 14 days, the script hides all but the **last 10** (the `hidden` attribute on each `tbody[data-trec-day]`, never a class). It puts one quiet button above the table: "Show N earlier days".
   - A click shows them all, removes the button, and moves focus to the first revealed day's date button, or to the table (`tabindex="-1"`) when that day has none.
   - With scripts off, every day shows.
4. **The ledger** (§3, §4).
5. **Footnote** (money only; 13.5px, ink-2): "Balance is what the patient owes at the end of that day: charges less payments, less what an HMO or PhilHealth is still expected to pay. It is the same count as the Balance at the top. Void statements and voided payments are not counted; they stay in Money."
6. **Cap notice:** loadClinical keeps 300 treatments and loadVisits 300 visits. When `c.done.length === 300` or 300 visits are loaded, show "Only the newest 300 treatments and visits are listed." Money is loaded in full (§5), so the balance is still right.
7. **Empty:** `<Empty icon="clock" text="No treatment recorded yet." />`.

---

## 3. Layout

### Columns (the PDA's order and words, in sentence case)

| # | Heading shown | Screen-reader name | Money only |
|---|---|---|---|
| 1 | Date | Date | |
| 2 | Tooth no./s | Tooth numbers | |
| 3 | Procedure | Procedure | |
| 4 | Dentist/s | Dentist | |
| 5 | Amount charged | Amount charged | yes |
| 6 | Amount paid | Amount paid | yes |
| 7 | Balance | Balance | yes |
| 8 | Next appt. | Next appointment | |

- Headings are `th scope="col" class="meta"`, sentence case. An abbreviated heading has its visible text `aria-hidden` and the full words `sr-only`.
- Without finance.bill, columns 5–7 are **not rendered at all**. They are not left blank.
- Caption (`sr-only`): "Treatment record of <short name>, oldest first. Teeth in FDI numbers."

### Wide: a real table

- **Markup:**
  - `<div class="trec-wrap">` has `container-type: inline-size; container-name: trec`.
  - Inside it, `<table class="trec" data-money?>`, then one `<tbody data-trec-day>` per day.
  - The day's first cell is `<th scope="rowgroup" rowspan={rows.length}>` holding the date, the way the paper card writes the date once per visit.
- **The table is the default layout.** Stacked cards apply only inside `@container trec (width < 50rem)`. Without container-query support, the page falls back to the table.
  - At 1440 and 1366 the pane is at least 838px, so it shows the table.
  - At 1280 and at 1024–1199 it shows cards.
  - One breakpoint serves both audiences: one rule set beats a narrower one for the 5-column table.
  - Measure (§11). The table must never scroll sideways, and never scroll the page.
- **Cells:**
  - 14.5px ink, padding `0.5rem 0.75rem`; the first and last cells get `1.5rem` so they line up with the head.
  - `vertical-align: top`.
  - Amounts right-aligned, `tabular-nums`, `white-space: nowrap`.
  - A 2px hairline between days (`tbody + tbody`) and a 1px hairline between rows.
- **Date cell:**
  - Shows `dateText(day)`, prefixed "Today · " on today.
  - On a day with a visit, the date is a button: `class="trec-date" data-ws-open="rec-visit-<key>" aria-haspopup="dialog"`, `min-height: 44px`, teal-ink words underlined like `.vx-link`, with an `sr-only` ", see the whole visit" at the end of its name.
  - A second visit that day adds a button "Also <time>" for its own panel.
  - On a day with no visit (for example a payment only), the date is plain text.
- **Tooth cell:** each tooth an `rp rp-tooth` pill ("36 MO"), the house pill for teeth. The dentist is plain text.
- **Amount paid:** values in `--ws-green-ink` (money in, the measured pair `.vx-paid` uses). Everything else is ink. Words always carry the meaning: column headings, "credit", the "−" sign, and "discount" in the procedure words.

### Narrow (the container under 50rem, and every phone at 390): one card per day

- **The table becomes blocks,** the pattern `.ws-table` already uses:
  - `thead` is visually hidden (the same clip as `global.css:2208`).
  - `tbody` is a card: 1px hairline, 12px radius, surface background, `0.75rem` gap.
  - Each `tr` is a block with `order`ed flex children, because DOM order follows the columns.
- **Card head:** the date cell, full width, as a 44px button. In this layout only, it shows a visible "See the whole visit ›" after the date.
- **Each row, in this visual order:**
  - the procedure (15px, 600) and its detail line (13.5px, ink-2);
  - one line of pills: tooth pills and the dentist;
  - amounts as "label + amount" lines, right-aligned: "Amount charged ₱1,500.00", "Amount paid ₱1,500.00".
- **Labels** are `<span class="meta trec-l">` inside each cell, visible only in this layout (`display: none` in the table), like `ws-cell-label`.
- **Empty cells** carry `data-none` and are hidden here. Do not rely on `:empty`, which Astro whitespace can defeat.
- **The day's footer:** the Balance and Next appt. cells (always on the day's last row, §4) get a top hairline and full width.
- **Folded days:** `.trec tbody[hidden] { display: none; }` must be declared. Without it, the block rule beats the browser's `[hidden]` and folded days stay visible (the same trap as `.tl-item[hidden]`).
- No sideways scroll at 390. Every target is at least 44px.

---

## 4. The rows

### How rows are gathered

- **Clinical rows** come from `loadVisits()`'s placement, so the ledger and the visit panel always agree on which visit a thing belongs to.
- **Money rows** come from the ledger's own complete money query (§5).
- **Days** are the union of both, as Manila `YYYY-MM-DD`, **sorted oldest first** like the paper. Within a day:
  1. clinical rows, by time;
  2. money-only rows: each statement in `issued_at` order (its lines by `line_no`, then its discount, other change and HMO or PhilHealth part);
  3. payments, by `received_at`.

### Row kinds

| Row | Made from | Day | Tooth no./s | Procedure (words · detail line) | Dentist/s | Amount charged | Amount paid |
|---|---|---|---|---|---|---|---|
| **Treatment done** | each `c.done` | the `day` of the visit loadVisits put it in | `fdi` + `surface` | `d.name` · the first 140 characters of `d.note` (with "…"), and "done <date>" when `performed_at`'s day differs from the row's day | `d.dentist` | the sum of its live statement lines (`procedure_id`) **issued the same Manila day**, else empty | |
| **Braces adjustment** | each `x.plans[].adjustments[]` | `a.on` | | "Braces adjustment" · `a.note` | the dentist of that day's visit, else empty | | |
| **Visit, nothing done** | a visit holding no treatment or adjustment (rules below) | `v.day` | imported visits only: `v.asked` | see "Visit words" | `v.dentist` | the one line of a statement that names this visit (`appointment_id`), issued that day, **with exactly one line**, else empty. The detail line then adds "Charged: <line description>". | |
| **Charge** (money) | every live statement line not shown on a row above | the statement's issue day | the linked procedure's tooth, if any | the line description · "SOA-000123", plus "done <date>" when linked to a treatment on another day | the linked procedure's dentist | the line amount | |
| **Discount** (money) | `invoice.discount > 0` | issue day | | `DISCOUNTS[kind]?.line` or "Discount" · SOA no. | | `−` the discount (a real minus sign) | |
| **Other change** (money) | when the statement's lines minus its discount ≠ its total (defensive; today total = subtotal − discount) | issue day | | "Other change on SOA-…" | | the difference | |
| **HMO or PhilHealth part** (money) | `payor_share > 0` | issue day | | "<payor_name>'s part: ₱x" · "SOA-… · not owed by the patient" | | | |
| **Payment** (money) | each payment `voided_at is null` whose statement is counted (§5), or with no statement | the later of (`paid_on` or `received_at`'s Manila day) and its statement's issue day | | "Payment · <methodLabel>". For `hmo`/`philhealth` it is "Payment from <statement's payor_name>" (or the method word) with detail "its part". Detail also: SOA no., and "paid <date>" when moved. | | | the amount |

**Why charges come from statements:** the price a dentist types on a treatment is a fee-guide estimate. Only statements are charges, and only they move the balance. A procedure row shows its amount only when its statement is dated the same day. Otherwise its line becomes a charge row on the statement's day, so every day's Charged/Paid always matches that day's balance. Every line of a counted statement appears **exactly once**.

### Visit words (the "Visit, nothing done" row)

A visit is a row only if **all** of these hold:

- it has already started (`!v.future`);
- it holds no treatment or adjustment;
- it is not a cancelled visit that holds nothing;
- if it is an "At the clinic" day (`v.id === null`), that day holds something clinical (a note, prescription, letter, BP or file). A day that exists only because of a statement is not a visit row: its charges are the rows, and its date still opens its panel.

| Status or kind | Procedure words | Detail |
|---|---|---|
| `completed` | "No treatment recorded" | the reason, then what the panel holds ("Clinical note, prescription, X-ray") |
| imported (`source = 'import'`) | the reason (the service the old record names) | "From old records" |
| At the clinic (`v.id === null`) | "No treatment recorded" | "At the clinic, no booking", then what it holds |
| `no_show` | `<Chip status="no_show">` ("Did not come"); row words in ink-2 | reason |
| `arrived`, `in_lobby`, `in_chair` | `<Chip status=…>` | reason |
| `booked` or `confirmed`, start passed | `<Chip status=…>` | "Not marked done or missed" |
| `cancelled` that holds something | `<Chip status="cancelled">` | what it holds |

Future visits are never rows. They appear only as Next appt. (§6) and in Visits.

### Balance and Next appt. cells

Both are always on **the last row of the day**, and empty on every other row.

- **Balance:** only on a day where money moved: a row with an amount, or a statement issued that day. The value is "₱1,200.00", "₱0.00" or "₱200.00 credit". Weight 600.
- **Next appt.:** only on a day with a visit (§6).

---

## 5. The running balance: patient_balance's rule, not a second one

**New `src/lib/treatment-record.ts`** (server only; imports `sumsOf`, `fromDb`, `pesos`, `statementNo`, `methodLabel`, `DISCOUNTS`, `PAYOR_METHODS` from `invoices.ts`).

`loadLedgerMoney(tx, patientId)` is run only when `money` is true, inside `withClinic`:

- **Statements:** `id, appointment_id, issued_at, series_prefix, number, total, discount, discount_kind, payor_name, payor_share` from `invoice` where the patient matches and `status in ('issued','partly_paid','paid')`. These are exactly the statements `patient_balance()` counts (022:278).
- **Lines:** `id, invoice_id, procedure_id, description, amount, line_no` of those statements.
- **Payments:** `id, invoice_id, amount, method, paid_on, received_at` where `voided_at is null` and (`invoice_id is null` or the invoice is counted).
- Each query has a sanity limit of 2000. If one is hit, set `complete = false`: every Balance cell is left out, and the footnote says "Too many entries to count a balance here; the balance now is <tile> (Money)."

**`balanceAt(day)`**:

- For every counted statement issued on or before `day`: add `r.balance − r.payorDue`, where `r = sumsOf(statement, its payments whose row day ≤ day)`.
- Then subtract every unlinked payment whose row day ≤ `day`.

`sumsOf(...).balance − payorDue` is algebraically `patient_balance`'s per-statement term, `left_ − greatest(least(payor_share − payor_paid, left_), 0)`, including the zero cases. It is the TS twin `invoices.ts:463` already names, so no new formula exists.

**Guard:** the last day's balance must equal `fromDb(patient.balance)`, which `P:321` already reads from `patient_balance(p.id)`. If it does not:

- no Balance cell is shown;
- the footnote says "The running balance did not match the balance on file (₱x). Check Money.";
- the server logs `console.warn('treatment-record balance mismatch', patientId)`. That is an id only, no name.

`VisitPanels`' per-visit "Still owed" (`visit-record.ts:155-176`) stays as it is. It is a per-visit figure. The only case it misses, payments with no statement, never happens today: both `insert into payment` paths (`invoices.ts:530`, `import.ts:1411`) set `invoice_id`.

---

## 6. Next appt.

This is for days that have a visit (booked or At the clinic). "End of the day" is the end of that Manila day. Take the first rule that applies:

1. **The earliest appointment that starts after the end of the day and was booked by then** (`created_at` ≤ end of the day), from `fullVisits`, **any status**.
   - Show `dateText(day)`, plus " · cancelled" or " · did not come" when so.
   - It is a 44px button with `data-ws-open="rec-visit-<id>"`, accessible name "Next appointment <date>: see the visit".
   - This is the paper's meaning: the appointment set at that visit. That is why "booked by then" matters.
   - Imported visits usually have none, because their `created_at` is the import time.
2. Else **a recall set that day** (`recall.created_at`'s Manila day, any recall, open or closed): "Check-up due <date>".
3. Else **a braces adjustment that day with `nextOn`**: "Adjustment due <date>".
4. Else empty.

**Data:**

- Add `a.created_at` to loadVisits' query (`visit-record.ts:88`) and `bookedAt: Date | null` to `Visit` (null for `day-` keys).
- Add one query to the page and the print page: `select to_char(due_on,'YYYY-MM-DD') as due, to_char(created_at at time zone 'Asia/Manila','YYYY-MM-DD') as set_on from recall where patient_id = $1`.

---

## 7. Who sees what

The rule is unchanged: `money = can(clinic, 'finance.bill')` (`P:141`). It is the same rule as the Money section, the Balance tile, the Patients list (`patients/index.astro:57`) and the Finances statement list. On Finances, `finance.money` gates takings and claim amounts, not a patient's own statements, so it is not applied here. Changing that is the owner's call.

| | finance.bill (by default Owner, Admin, Secretary, and anyone with "sees money here") | Everyone else (Dentist, Associate, Assistant) |
|---|---|---|
| Columns | all 8 | Date · Tooth no./s · Procedure · Dentist/s · Next appt. |
| Rows | treatments, adjustments, visits without treatment, charges, discounts, HMO or PhilHealth parts, payments | treatments, adjustments, visits without treatment |
| Money queries | run | **not run** (like loadVisits and loadTimeline today) |
| Print | amounts, the balance footnote, and `NOT_BIR` | no amounts |

---

## 8. The visit panel and `?visit=`

- The panels do not change (035, `VisitPanels.astro`). They are rendered once for every visit. They open from:
  - the ledger's date buttons and Next appt. buttons;
  - Visits' "See the whole visit";
  - Consent's "Signed at visits".
- **`current`** (`P:566`) currently sends `?visit=` for another day's visit to `'timeline'`. It becomes:
  - `'treatment-record'` when that visit's key is one of the ledger's day buttons;
  - otherwise `'visits'`: a future visit, or a cancelled one that holds nothing, so the section behind the panel lists it.
  - Today's visit still shows the This visit strip, as now.
- The filter chips (Everything · Visits · Between visits) go. The ledger holds one kind of thing, so there is nothing to filter.

---

## 9. Print: `[patient]/treatment-record.astro` (new)

URL: `/c/<slug>/patients/<id>/treatment-record/`.

- **Page structure:** an own document like `rx/[rx].astro` and `aftercare/[kind].astro`.
  - A `px-bar` (does not print) with "Back to <first name>'s record" (to `…/#treatment-record`) and **one teal Print** (`data-print`).
  - The sheet is white with dark words in both themes, as it prints.
- **Gate:** `requireWorkspace`. Everything is read in `withClinic`, and an unknown or other clinic's patient is a 404. Audit `record.treatment_record_print` (entity `patient`). `/c/` is already `no-store` in the middleware.
- **Data:** the same loaders as the page:
  - `loadClinical`, `loadExtra`, `loadVisits(tx, id, clinical, extra, [], money)`;
  - the recall query, `loadLedgerMoney` when `money`, `patient_balance(p.id)`;
  - the clinic head (name, address, phone).
  - The same builder, so the page and the paper can never differ.
- **Paper:**
  - `@page { size: A4 portrait; margin: 12mm; }`.
  - At the head: clinic name, address and phone; the title **Treatment record**; a line "Name · Age · Sex · Chart no.", the PDA's header in Flossify's words.
  - Then the same table: every day (no fold), oldest first, 10pt; plain text instead of buttons; tooth numbers as text.
  - `thead` repeats on each page; `tr { break-inside: avoid }`; `tbody { break-inside: avoid }` where it fits.
- **Foot:**
  - "Teeth in FDI numbers."
  - With money: the balance footnote and `NOT_BIR`.
  - "Printed <date> by <session name>."
- **Screen at 390:** the sheet's table sits in `.ws-table-wrap`, which scrolls sideways inside the sheet, never the page. Printing is unaffected.

---

## 10. What goes away, and where it still is

The Timeline's "between visits" lines are not treatment. Each already has a home, except one:

| Line | Where it is |
|---|---|
| Health history, blood pressure | Health (earlier versions list, Vitals) |
| Consents, patient forms added | Consent |
| Texts | Texts |
| Files | Files |
| Letters, physician replies | Rx & letters |
| Plan items, lab cases, LOAs, payment plans | Treatment |
| Next check-up set | Overview (RecallCard) |
| Added / brought in | Overview Details, "On file since" |
| **Chart changes** | **Nowhere else. Moves to Chart:** a `<details>` "Changes to the chart (N)" under Findings, newest first ("25 Sep 2026, 9:14 am · 3 changes · teeth 16, 26 · <who>"). It uses the grouped `tooth_state` query moved out of `loadTimeline` into `loadChartChanges(tx, patientId)` in `record.ts`. The odontogram and its offline logic are not touched. |

**Delete** (grep first; nothing else uses them):

- `R/Timeline.astro`.
- In `record.ts`: `loadTimeline`, `TimelineEvent`, `TimelineKind`, `TIMELINE_FILTERS` (already unused) and `VISIT_WORD`.
- In `record-extra.ts`: `extraEvents` and its `TimelineEvent` import.
- `Visit.refs` and its pushes in `visit-record.ts`. Only the Timeline read them.
- The `mini` prop of `Signature.astro` and `.sig-mini`.
- `.rp-hue-blue`, `.vx-card*` and `[data-tl-item][hidden]`.
- The `.tl-day`, `.tl-date`, `.tl-list` and `.tl-item*` rules (`record.css:24-52`, `:239-252`).
- **Keep** `.tl-filters`, `.tl-filter` and `.tl-n`: `Files.astro:49-50` uses them.

---

## 11. Everything the rename touches

**Code**

- `P`:
  - header comment (`:1-19`, the section list);
  - `:98` import TreatmentRecord instead of Timeline;
  - `:133-134` drop `loadTimeline` and `extraEvents`;
  - `:369-376` drop `timeline`; load the recalls and `loadLedgerMoney`; build the ledger; add `loadChartChanges`;
  - `:429` comment;
  - `:519` `{ id: 'treatment-record', label: 'Treatment record' }`;
  - `:565-566` the `current` rule (§8);
  - `:767` comment;
  - `:882-886` the panel markup with the new ids and `<Banner id="treatment-record" …>`;
  - the Chart pane's "Changes to the chart";
  - `:1145` becomes "Open the visit in Visits to have one signed.";
  - `fromHash()` alias (§1).
- `R/sections.ts:1-6` comment; `:22` key `'treatment-record'` with the new blurb.
- `R/TreatmentRecord.astro` (new; props `days`, `money`, `canEdit`, `today`, `printHref`, `capped`, `balanceNote`), with its fold script (`data-trec-*` hooks only).
- `R/record.css`:
  - `:1` comment;
  - a new "Treatment record" block (`.trec-*`, the container query, `.trec tbody[hidden]`);
  - the deletions from §10.
- `R/VisitPanels.astro:2-3`, `R/VisitStrip.astro:11,15`, `R/Signature.astro:4`, `_ui/glyphs.ts:27`: comments say "the Treatment record".
- `src/lib/visit-record.ts`:
  - `:1-14`, `:72` comments;
  - `created_at` / `bookedAt`;
  - remove `refs`.
- `src/lib/treatment-record.ts` (new): the builder, `loadLedgerMoney`, `balanceAt`, the guard.
- `[patient]/aftercare/[kind].astro:34` hash.
- `[patient]/treatment-record.astro` (new).
- Comments only: `sign/[visit].astro:4,15`, `cal/panels.ts:71`, `finances/new.astro:18`.
- Leave `036_paperless_day.sql:6` alone: applied migrations are never edited.

**Docs**

- CLAUDE.md:
  - `:821`, `:823` section list becomes "Overview · Treatment record · Health …";
  - `:826`: `loadTimeline` is replaced by `src/lib/treatment-record.ts`;
  - `:846`: the bullet becomes the ledger's rules in short (the columns, charges from statements, balance = `patient_balance` via `sumsOf` with the guard, the money gate, the print);
  - `:849`, `:855`: "Timeline" becomes "Treatment record";
  - `:893-909`: the 035 heading becomes "The visit panel and the signed consent (035)". A visit opens from its date on the Treatment record; the card sentence goes; the `ref` sentence goes;
  - `:917`: fix to `?visit=<id>` with no hash (the code has no hash; `:959` already says so);
  - `:953`, `:959`, `:963`, `:1113`: wording;
  - Layout: add the three new files.
- `docs/clinic-operations.md:25`: "logged on the Timeline" becomes "logged on the call list".

---

## 12. Soft template checklist

- Sentence case everywhere; the PDA's own headings in sentence case.
- No teal fill in the section. The date and next-appointment buttons are teal-ink text links. Print and "Show N earlier days" are quiet.
- Teal group throughout: banner, the pane's top edge, date links. Status is shown with `Chip` (words and colour). Amount paid is green-ink with its heading. Credit and discount are in words.
- Every line at least 4.5:1 against its real background, light and dark, 1440 and 390: ink-2 details, teal-ink links, `rp-tooth` pills, green-ink amounts, chips, and the muted "did not come" rows (ink-2, never muted grey on a tint).
- Targets at least 44px. No sideways page scroll. Nothing fixed or sticky. No motion added.

---

## 13. Verification: measure it

1. **Balance.** A scratch script (not committed) walks every dev patient and asserts:
   - the last shown Balance equals `patient_balance(p.id)`;
   - every counted statement's lines appear exactly once, and the charged amounts for each statement add up to its total.
   
   Include crafted cases:
   - HMO share, part-paid by the HMO;
   - senior discount;
   - partial payments;
   - a `paid_on` earlier than its statement;
   - a statement dated after its treatment;
   - a void statement and a voided payment;
   - an imported visit and statement;
   - a consultation-only visit charged with one line.
2. **Roles.** The `snap.mjs` approach, 7 roles: only finance.bill holders see columns 5–7, charge and payment rows, and amounts on the print. Every other page's fingerprint is unchanged.
3. **Layout** at 1440, 1366, 1280, 1200, 1024 and 390, light and dark:
   - `scrollWidth ≤ innerWidth`;
   - the table never wider than its pane;
   - table layout at 1440 and 1366, cards at 1280 and below;
   - every target at least 44px;
   - contrast per text node at least 4.5;
   - the index label on one line at 1200 and 1440.
4. **Addresses:**
   - `#timeline` opens the section and rewrites to `#treatment-record`;
   - `?visit=<past>` opens the section with its panel;
   - `?visit=<future>` opens Visits with its panel;
   - the aftercare back link lands on the section;
   - the sign page's return behaves as before.
5. **Fold:** with 15 or more days, the button shows and the last 10 are visible. At 390, folded `tbody`s are actually hidden (check `getBoundingClientRect().height === 0`). With scripts off, every day shows.
6. **Print:**
   - A4 with print emulation in the dark theme: black on white, `thead` repeated;
   - an audit row is written;
   - 404 for another clinic's patient;
   - no amounts without finance.bill.
7. `npm run build` is clean, and `grep -ri timeline src/pages/c src/lib` finds only the calendar's own unrelated "timeline" (`cal/board.ts`, `cal.css`).

---

## 14. Traps found when checking this against the code

- `Files.astro` reuses `.tl-filter`, `.tl-filters` and `.tl-n`. Deleting all `tl-*` rules would unstyle the Files filters.
- A `display` rule on `tbody` beats the browser's `[hidden]`. Declare `.trec tbody[hidden] { display: none }`.
- `loadVisits` drops payments it cannot place (`visit-record.ts:150`) and caps rows at 300/500. The balance must come from the ledger's own complete money query, never from `Visit.money`.
- Payments can be dated up to a year back, before their statement (`invoices.ts:521-524`). A payment's row day is never earlier than its statement's day, or a day's balance would not match its row.
- Old statements, and imported ones, have lines with no `procedure_id`, and imports write no `procedure_done`. Matching by description would be a guess. Lines attach only by link (`procedure_id`, or `appointment_id` with one line); everything else is its own charge row.
- loadVisits makes an "At the clinic" day for a statement alone (money only). That day is not a visit row, or money viewers would see "No treatment recorded" on a statement date that dentists never see.
- Hash resolution goes through `getElementById(hash)` and then its panel (`P:1284-1290`). Without the alias, an old `#timeline` would find nothing and stay on the server's section.
- `recall.created_at` was added in 033 with `default now()`, so older recalls carry the migration time. They can show a "Check-up due" only on that one day.

## 15. Left as it is (the owner's call)

- **The "Treatment" section keeps its name.** Only the Timeline was asked about. The blurbs keep the two apart: Treatment record is "what was done and paid, by date"; Treatment is "the plan, lab cases, HMO approvals and payment plans". If "Treatment" next to "Treatment record" confuses encoders, renaming it to "Treatment plan" is a one-line follow-up.
- **The money gate stays `finance.bill`**, not `finance.money` (§7).
- **Oldest first on screen as well as on paper**, as on the card, with the fold keeping the newest days close.