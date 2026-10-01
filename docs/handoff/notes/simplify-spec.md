# Build spec: the simpler patient record

Base: **Design 1 (job-first)**, which both judges scored highest (8 and 8). It takes in the ideas the judges picked from Designs 2 and 3, and it fixes every item on both judges' "must fix" lists. Every "after" number below is a prediction from this spec, counted the way the inventory counted. Slice 8 measures them again once the record is built.

---

## 1. Owner summary

The patient record goes from twelve tabs to four: **Today**, **Patient info**, **Chart & plan** and **Treatment record**. It opens on Today, which lists what this visit still needs, in the order a visit runs. Each line has its own button, and the next step is the teal one. The chart, the treatment plan, X-rays, lab cases and HMO approvals sit together on one tab. The Treatment record (the PDA ledger) is unchanged, and the notes, prescriptions, letters, statements and texts sit under it. Allergies and other safety facts stay pinned at the top while you chart, on the chair tablet and on phones. The twelve banners, the coloured group headings, the four head tiles and every button that only jumped to another tab go. Every form, panel, print page and link a clinic uses today is still reachable, and the jobs done most often stay one tap.

| | Before | After |
|---|---|---|
| Tabs | 12 (11 for a dentist) | 4 for everyone |
| Buttons visible on first load (owner, Maria, 1440) | 36 (49 with the workspace shell) | 16 (29 with the shell) |
| Buttons across the whole record, without the 32 teeth | 88 | 41 |
| Buttons across the whole record, with the teeth | 120 | 73 |
| Actions inside menus | 8 (More) | 10 in Add ▾ (8 for a dentist), plus about 3 per plan row |
| Teal buttons on one screen | up to 2 | at most 1 |
| Side panels (Maria) | 22 (16 forms and 6 visits) | 22 (16 forms and 6 visits) |
| Kinds of head chip | 9, of which 5 are buttons | 6 safety kinds, all plain text and pinned; the 3 to-do kinds become Today lines |
| Section banners | 12 | 0 |
| Where content starts | 1440: y=988; 390: y=1678 | 1440: about y=320; 390: about y=470 |

---

## 2. The new record

### 2.1 Tabs

| Tab (label on phones) | Tab id | Hue on its icon | What it holds, top to bottom |
|---|---|---|---|
| **Today** (Today) | `overview` (kept) | teal | This visit (`#this-visit`) · Coming up (`#visits`, `#recall`) · Needs attention · Last visit |
| **Patient info** (Patient) | `patient` (**new**; `health` is an alias) | rose | Details (`#details-card`) · Health (`#health`, `#vitals`) · Consent (`#consent`: privacy with `#consent-paper`, the intake's Consent forms `#consent-forms`, Signed at visits `#visit-consents`, Patient forms `#patient-forms`) |
| **Chart & plan** (Chart) | `chart` (kept) | blue | ChartOffer (`#chart-offer`, only after a post) · Odontogram (`#chart`) · Treatment plan (`#treatment`, with a "Done" fold `#treatment-done`) · X-rays and photos (`#files`) · Lab cases (`#treatment-lab`), HMO approvals (`#loas`) and Braces and payment plans (`#payplans`), each drawn only when the patient has one |
| **Treatment record** (Record) | `treatment-record` (kept) | violet | Ledger (unchanged) · "Cancelled and missed (N)" fold · Clinical notes (`#notes`) · Prescriptions and letters (`#rx`, `#letters`) · Statements (`#money`, green edge, `finance.bill` only) · "Texts (N)" fold (`#texts`) |

- Judge 2 found that reusing the id `health` to label Patient info would mislead the next maintainer, so that tab gets a new id, `patient`. `health` becomes an alias in `TAB_OF`.
- Nothing outside the page clicks `rec-rec-health-tab`. `pickpanel.ts` falls back to `rec-rec-<current>-tab`, which always exists.

### 2.2 The head (one card, about 150px at 1440, not sticky)

- **Row 1:** Back to patients, as a text link.
- **Row 2:**
  - Left: the avatar and the chart-no. pill (mono), then "38 years old · Female · 0917 555 0142 · Maxicare 1234-5678".
  - For `finance.bill` only, the same row adds "· **Owes ₱3,250.00**". The amount is a text link to `finances/?patient=<id>&view=all`. It reads "In credit ₱X" when the patient is in credit.
  - Right: **Edit details** and **New booking**, both quiet. Each is one tap from any tab.
- **Row 3, the safety line:** plain text, never buttons.
  - Allergies (soft red). With no allergies it says "No known allergies" (green) or "Allergies: not asked yet" (amber), so an empty line never passes for safe.
  - Conditions (amber), "Takes <medicine>", BP when taken today or out of range, "Clearance asked <day>", Under 18 / guardian.
  - After the intake's phase 4, "Not agreed: <form>" (soft red).
- **Below the chips:**
  - The "Note for the dentist" callout, in full.
  - The **desk note** (`patient.notes` less the import lines, `deskNoteOf`), as one quiet line with a note icon. It moves here from the Overview's Details.
  - The callouts after a post, unchanged: stale, saved new / details / form, form differs / used, the four intake callouts.
- The head controls are 2 buttons plus 2 text links. Before, there were 5 buttons.

### 2.3 The sticky row (every width, under the workspace top bar, never at the bottom)

- **From 768px:**
  - Left: the 4 tabs (icon, label, count badge). Right: **Add ▾**.
  - When an IntersectionObserver sees the head's safety line leave the screen, an `aria-hidden` compact copy of it appears as a second line of the row.
  - The row is capped at **128px on 1366×768**. Allergies are never cut short. Past that height, the remaining conditions, medicines and the note fold into the plain text "+N more alerts, at the top". The copy never covers a side panel: dialogs sit in the top layer. It never covers the chart palette or ChartOffer either: the tab panels get `scroll-margin-top` equal to the row's height, and the palette's clearance is measured.
- **Below 768px:**
  - A 5-column row, 56px tall: Today · Patient · Chart · Record · Add. Each column is about 71px wide at 390, an icon over a 13px label. There is no sideways scroll.
  - Above it, one pinned alert line in words, for example "Allergy: Penicillin · +1 more". Allergies are always in full.
- **Choosing a tab** scrolls the page, only when needed, so the tab's content starts just under the sticky row. On a phone the change is never off-screen.
- **Badges:**
  - Today shows the number of open lines.
  - Chart & plan shows the number of open plan items.
  - On a phone the badge becomes a dot, and the count stays in the accessible name.

### 2.4 Add ▾ (a `<details>` menu in groups, items ≥44px)

| Group | Items | Opens |
|---|---|---|
| This visit | Clinical note | `rec-note-add` |
| | Record a treatment | `rec-done-add` |
| | Blood pressure | `rec-vitals-add` |
| | Prescription | `rec-rx-add` |
| | X-ray or photo | `rec-file-add` |
| Plan | Add to plan | `rec-plan-add` |
| | Lab case | `rec-lab-add` |
| | HMO approval (LOA) | `rec-loa-add` |
| | Braces or payment plan (`finance.bill`) | `rec-payplan-add` |
| Papers | Certificate or letter | `rec-letter-add`; the kind is a radio inside the panel, certificate by default |
| Money | New charge (`finance.bill`) | the existing `billing/new/?patient=` link |

- That is 10 items for the owner and 8 for a dentist without billing.
- Items that need `records.edit` are shown only to people who have it, as the More menu does today.
- The menu is hidden offline and on the kept copy. The palette's actions hide there too.

### 2.5 The first screen: owner, Maria, today's visit at 9:30 am, Confirmed

**At 1440×900.** The top bar is 0–64 and the head about 80–230. The sticky row, about 246–302, shows [Today 4] [Patient info] [Chart & plan 2] [Treatment record] … [Add ▾]. Below it, Today is laid out in two columns (1.35fr | 1fr) from about y=318.

- **Left column: This visit** (teal edge)
  - Header: "9:30 am · Filling, tooth 36 · Chair 2 · HT Dr. Hazel Tabanao", with the status chip Confirmed. It reads today's Manila date only, which fixes the `hereNow` bug.
  - "Before we start". Every line has its own button, and the first open line's first button is teal:
    1. Health history: last checked 28 Sep → **[No change]** (teal) · [Something changed], which opens `rec-health`.
    2. Privacy notice: not agreed yet → [Record it], which goes to `#consent`. This is the one tab jump kept on purpose: "Show the patient" is a full-screen page mode that cannot live in a dialog.
    3. Blood pressure: not taken → [Take it], which opens `rec-vitals-add`.
    4. Consent to treatment: not signed → [Sign on this tablet], the link to `sign/<visit>/`.
  - Once the patient is seated, the card adds:
    - Treatment done → [Record it]
    - Clinical note → [Write it]
    - "Also": [Prescription] [X-ray or photo]
  - After a high BP, the card adds [Ask for clearance], which opens `rec-letter-add` with the clearance kind already chosen.
  - At checkout it adds [Charge this visit] (`finance.bill`) and [Set the next check-up]. Set the next check-up opens `rec-recall-set`.
  - "Done:" is one line of ticked words. Only "Prescription · Print" and "Aftercare · Print" stay links.
- **Left column: Last visit**
  - [Mon 28 Sep 2026] opens that visit's panel.
  - Then, in words: Cleaning · Dr. Liwayway Domingo, what was done, the BP that day, and the note's diagnosis line.
- **Right column: Coming up** (`#visits`, `#recall`)
  - "Nothing booked after today." A coming visit is listed with its reminder's state, for example "Fri 9 Oct, 10:00 am · Dr. Cariño · Reminder sent Thu 8 Sep", using the words from `reminder-state.ts`.
  - "Next check-up: not set" → [In 6 months] [Other…]. Other… opens `rec-recall-set`, which holds one-tap In 3 months and In a year, Pick a day, Came in and Clear.
  - "Still on the plan: Root canal treatment 46 · agreed; Porcelain crown 46 · planned", in words.
- **Right column: Needs attention.** Only lines that apply are drawn.
  - "Not on file: email, address, HMO, emergency contact" → [Add them], which opens `details`.
  - "27 Sep visit is still marked In the chair" is a text link to that day on the Dashboard.
  - Other lines that can appear, each with one action:
    - LOA waiting → [Record the answer] (`rec-loa-answer`)
    - Plan behind → [Take a payment] (Finances link, `finance.bill`)
    - Health over a year old → [Check it] (`rec-health`)
    - Clearance waiting → [Physician replied] (`rec-letter-answer`)
    - Forms sent and not added → [Add them now]
    - The intake's phase-4 consent gaps
- **Totals:** 16 controls (head 2, row 5, Today 9). The first to-do is at about y=380, above the fold. There is 1 teal button.

**At 390×844.**
- The top bar is 0–56.
- The head, about 72–330:
  - the facts, wrapped;
  - Edit details and New booking as two half-width 44px buttons;
  - the safety line and the desk note.
- The sticky alert line and the 5-column row are at about 346–430.
- Then the cards in one column: This visit, Needs attention, Coming up, Last visit. On each line the words sit above the buttons. One button is full width; two are half width each.
- The first to-do is at about y=470. The controls are the same 16, all at least 44px, with no sideways scroll.

### 2.6 Every remaining button, by tab (owner, Maria, 1440, teeth not counted)

| Where | Buttons | Count |
|---|---|---|
| Always on | Edit details, New booking, 4 tabs, Add ▾ | 7 |
| Today | No change, Something changed, Record it, Take it, Sign on this tablet, In 6 months, Other…, Add them, the Last visit date | 9 |
| Patient info | Update health, Earlier versions (disclosure), Show the patient, Read the notice (disclosure), Record consent (teal while the consent is missing), Signed on paper? (disclosure) | 6 |
| Chart & plan | Clear chart, Changes to the chart (disclosure), Add to plan (teal), plus next step and ⋯ on each of 2 plan rows, Done (N) fold | 8 |
| Treatment record | Print, 5 dates, Next appt., 2 × Add an addendum, Print on the prescription, Texts fold | 11 |
| **Total** | | **41** |

- **Plan row.** The next step for the row's state is a button:
  - planned → Patient agreed
  - agreed → Mark done, with the "Done by" select kept for someone who does not treat
  - waiting for its LOA → Mark done, which still asks first

  The ⋯ menu holds Not agreed yet, Declined, Remove and "Ask for an LOA for this" (pre-ticks the item).
- **Lab row:** the next step (Sent, Back or Fitted), with Remake in ⋯.
- **LOA row:** Record the answer, a merged panel that posts the existing `loa-approve` / `loa-deny` intents.
- **Payment plan row:** Adjustment done, with Take a payment (a Finances link) and Stop in ⋯.
- **File tile:** the thumbnail link, with Save and Remove in ⋯.
- **Teal buttons:** Today has the next step, Patient info has Record consent only while the consent is missing, Chart & plan has Add to plan, and Treatment record has none.

---

## 3. Mapping of everything on today's record

### Head
| Today | After | Why |
|---|---|---|
| Back to patients | Kept, as a text link | |
| Avatar, chart-no. pill, age, sex, mobile | Kept | |
| HMO name, member no. | Moved into the facts line | The desk needs them on the phone (judge 1, fix 3) |
| New booking (teal) | Kept, now quiet | One teal per screen |
| Edit details | Kept | |
| More ▾ (8 items) | Becomes Add ▾ in the sticky row (10 items) | One tap from any tab, and it stays in view |
| More › Bring in past visits | **Removed from the record** | It is the clinic-wide import. It stays at Patients › Add patient › Import (`/patients/import/`) |
| Allergy, condition and medicine chips; the under-18 chip | Safety line, plain text, pinned | 034 kept; now always in view |
| BP chip, clearance chip (buttons) | Safety line, plain text | A chip that navigates is a button |
| LOA-waiting, plan-behind and health-stale chips (buttons) | Needs attention lines, each with its one action | To-dos need an action |
| Note for the dentist | Kept in the head, in full, and in the pinned copy | |
| Tile: Today now / Next visit | This visit and Coming up | Also removes the `hereNow` bug (a 27 Sep visit shown as "Today, now") |
| Tile: Last visit | The Last visit card | |
| Tile: Balance | "Owes ₱…" text link in the facts line (`finance.bill`) | |
| Tile: Consent | The Today privacy line and the Patient info Consent card | |
| Callouts after a post | Unchanged | |

### Index and banners
- `RecordNav`: 12 vertical tabs under 5 group headings become 4 horizontal tabs. `aria-orientation="horizontal"`, left and right arrow keys, through the shell's `data-ws-tabs`. The `rec-rec-<id>-tab` ids are kept for the four.
- The 12 `Banner` cards are **deleted**. Each was the second of three places the section's name appeared (tab, banner, pane title).

### This visit strip → Today's This visit card
- Meta line, status chip and dentist pill → the card header.
- No change → kept.
- Something changed / Ask now → opens `rec-health` (before, it was a tab jump).
- Take it / Take again → kept.
- What to do (after a high BP) → Ask for clearance, which opens the letter panel set to clearance.
- Sign on this tablet → kept. Phase 4 swaps it for "Prepare consent forms".
- Privacy Record it → kept.
- Record it (treatment) → kept.
- The plan → removed: Chart & plan is one tab away, and the badge counts the open items.
- Write it → kept.
- Set it (was an anchor) → opens `rec-recall-set`.
- Charge this visit → kept.
- Done pills (buttons) → one ticked "Done:" line, keeping the two Print links.
- Also: Prescription, X-ray or photo → kept, shown once the patient is seated.
- Also: Chart → removed, because it only switched tabs.
- The strip was 428–544px tall and sat above every section. It now lives only on Today.

### Overview → Today / Patient info
- **Details** (10 tiles) → the Patient info Details card, as a definition list: full name, birth date, mobile, email, address, HMO and member no., emergency contact, on file since, and the audit line.
  - The 4–5 dashed "+ Add" tiles become one "Not on file:" line, plus Today's [Add them].
- **Recent visits** (4 cards and See all) → removed. Today's Last visit and Coming up and the ledger hold the same visits.
- **Next check-up (RecallCard)** → Today › Coming up. The 4 buttons become In 6 months and Other…
  - Book it becomes the head's New booking.
  - Came in and Clear go into the panel. Came in is nearly redundant, because `applyStatus('completed')` already closes the check-up.
  - "Texted <day>" is kept.
- **Health, in short**, with its Update and Open → removed. The safety line and the Patient info Health card hold the same facts.
- **Treatment, in short** → Coming up's "Still on the plan" line, plus the Chart & plan badge.
- **From the patient forms** → Today's "The patient wrote: …" line when the form is under 30 days old. The list goes to Patient info › Patient forms, and "All answers" becomes a text link.

### Visits
- Past visits → the ledger.
- Coming visits → Coming up.
- Cancelled or missed visits that hold nothing (the ledger skips them, `treatment-record.ts:150-155`) → the new "Cancelled and missed (N)" fold under the ledger. Each date opens that visit's panel.
- 6× "See the whole visit" → removed. The ledger dates open the same panels.
- The Charged column → removed. The ledger's money columns hold the same figures.

### Health
- The **BP pane** → the Health card's readings (`#vitals`). Take a reading → Today's Take it and Add ▾ › Blood pressure.
- The **always-open form** → a new side panel, `rec-health`, opened by Today's Something changed, Check it, the card's Update health, and `?open=health`. It keeps:
  - the conflict and problem callouts;
  - the "Not saved yet" pill and `data-health-unsaved`;
  - a warning when it is closed with unsaved answers;
  - reopening, drawn by the server, after a refused post (`auto: true`).
- The **birth date** moves into Edit details. This fixes the trap at `:1373`, and the `birth` intent is unchanged.
- **Earlier versions** → a disclosure on the Health card, so a reader without `records.edit` can still see it.

### Chart
- Kept whole: the teeth, the palette (Add to plan, Treatment done and Clinical note through `data-pick-open`), rings and dots, the legend, the notation radios, Clear chart, and the "Changes to the chart" disclosure.
- The findings are listed **once**. The "Findings" cards go and the server-rendered "Chart note" list stays. Check first that the list renders with scripts off and on the kept copy; if it does not, keep the cards and drop the list instead.

### Treatment
- **Plan** → Chart & plan, with a next step and ⋯ per row (from 4–5 buttons per row).
- **Treatments done** → a "Done (N)" fold inside the plan card, with id `treatment-done`, newest 5 and "Show N more". It is folded because it repeats the ledger. It is kept because it is the per-tooth list the chart offer and scribes read.
- **Record a treatment** here → removed. It is still on Today, the palette and Add ▾.
- **Lab, LOA, payment plans** → Chart & plan, drawn only when present. Their "New…" buttons move to Add ▾.
- **LOA Approved / Denied** → Record the answer, the merged `rec-loa-answer` panel. It asks with a radio first, then shows that choice's fields.

### Notes, Files, Rx & letters, Consent, Texts, Money
- **Notes** → Treatment record › Clinical notes: newest 3 and a fold.
  - New note is removed here; it is on Today, the palette and Add ▾.
  - **Add an addendum stays on each note card.** It is never opened from inside a visit panel, because `shell.ts` opens one dialog at a time.
- **Files** → Chart & plan › X-rays and photos, all kinds. The kind filter shows only when there is more than one kind.
  - Add files on the card is removed; it is on Today's Also and Add ▾. The empty state says "Add X-rays and photos from Add ▾".
  - Save and Remove go into ⋯.
  - The card hides on the kept copy.
- **Rx & letters** → Treatment record › Prescriptions and letters, one list, newest first.
  - Print stays on each item. Physician replied stays on a clearance row.
  - New prescription → Today's Also and Add ▾.
  - The 3 kind tiles → the kind radio inside `rec-letter-add`.
- **Consent** → Patient info › Consent. Everything stays on the page: DeskConsent with Show the patient, Read the notice, Record consent, and `#consent-paper`.
  - "Signed at visits" keeps its signatures drawn in place. The "See the visit" buttons are removed; the date is plain words, and the ledger opens the visit.
  - The patient forms rows go from two buttons to one text link.
- **Texts** → Treatment record › "Texts (N)" fold, with All messages as a text link. The visit panels keep "Texts about this visit". Coming visits show their reminder state on Today.
- **Money** → Treatment record › Statements (`finance.bill` only): the owes and paid sentence, statements as text links, and "In Finances" as a text link.
  - New charge here → removed; it is in Add ▾ and Today's Charge this visit.

### Panels (all stay outside the tab panels)
| Panel | Opened from |
|---|---|
| `details` | Edit details, Today › Add them, `?open=details(&dash=)` |
| `rec-health` **(new)** | Today › Something changed / Check it, Health › Update health, `?open=health` |
| `rec-vitals-add` | Today › Take it, Add ▾, `?open=vitals` |
| `rec-note-add` | Today › Write it, palette, Add ▾, Add an addendum on each note, `?open=note` |
| `rec-done-add` | Today › Record it, palette, Add ▾, `?open=done` |
| `rec-plan-add` | Chart & plan › Add to plan, palette, Add ▾ |
| `rec-rx-add` | Today › Also, Add ▾, `?open=rx` |
| `rec-file-add` | Today › Also, Add ▾, `?open=file` |
| `rec-letter-add` | Add ▾, Today › Ask for clearance |
| `rec-letter-answer` | Clearance row, Needs attention |
| `rec-lab-add` | Add ▾ |
| `rec-loa-add` | Add ▾, the plan row's ⋯ |
| `rec-loa-answer` **(merges approve and deny)** | LOA row, Needs attention |
| `rec-payplan-add` | Add ▾ (`finance.bill`) |
| `rec-adjust-add` | Payment plan row |
| `rec-recall-set` | Today › Other… / Set the next check-up |
| `rec-capacity` (intake) | Consent forms pane |
| `rec-visit-<key>` | Ledger dates, Also <time>, Next appt., cancelled fold, Last visit date, `?visit=` |

That is 16 form panels (+`rec-health`, −1 from the LOA merge) plus one per visit, the same as today.

---

## 4. The frequent jobs, clicks from the open record (before → after)

**Desk**

| Job | Before | After |
|---|---|---|
| Mobile, HMO name and member no., balance, desk note | 0 (member no. was below the fold) | 0, all in the head |
| Emergency contact | 0 (Overview) | 1 (Patient info) |
| Health: no change | 1 | 1 |
| Health: something changed | Tab, form, Save; you stay on Health | Panel, form, Save; you are back on Today |
| Privacy consent | 4 | 4 |
| Edit details | 2 | 2 from any tab |
| Missing details | 1 | 1 |
| New booking | 1 | 1 from any tab |
| Check-up in 6 months | 1 (Overview) / 2 | 1 |
| Check-up in 3 months or a year | 1 | 2 |
| Charge this visit | 1 | 1 |
| Aftercare or today's Rx print | 1 | 1 |
| Older Rx or certificate print | 2 | 2 |
| Ask for an LOA | 3 plus about 1300px of scrolling | 3, with the plan in view |
| Record the LOA answer | 3 | 2 from Needs attention, 3 from the row |
| Braces payment | 2 | 1 when behind, else 2 |
| Did the reminder go? | 1 | 0 for a coming visit; 2 for the full log |

**Dentist**

| Job | Before | After |
|---|---|---|
| Alerts while charting | scrolled away | 0: pinned at every width |
| Chart a finding | 1 + tooth + state | unchanged |
| Plan from a tooth | about 5, and the list is on another tab | about 5, with the list under the chart |
| Patient agreed | 2 | 2 |
| Mark done | 2, and the chart offer is on another tab | 2, with the offer on the same tab |
| Record a treatment | 1 | 1 |
| Note | 1 | 1 from Today, 2 from another tab |
| Rx while seated | 1 | 1 |
| Rx from elsewhere | 2 | 2 |
| Certificate | 2 | 2, plus a radio for another kind |
| After a high BP | "What to do" goes to Health | Ask for clearance, 1 |
| Last visit's note | 1 | 0 |
| Any past visit | 2 | 2 |
| X-rays while charting | leave the tab | the same tab |

**Assistant**

| Job | Before | After |
|---|---|---|
| BP | 1 + Save | 1 + Save |
| Health re-check | 1 | 1 |
| Tablet hand-over | 1 | 1 |
| X-ray upload | 1 | 1 while seated, 2 through Add ▾ |
| Lab step | 2 | 2 |
| Aftercare print | 1 | 1 |

**Owner**

| Job | Before | After |
|---|---|---|
| Owes | 0 | 0 |
| Statements | 1 | 1 |
| Unfinished plan | 0 | 0 |
| Chart history | 2 | 2 |
| Health versions | 2 | 2 |

**One click slower:** check-up in 3 months or a year, emergency contact, the full text log, and a note or X-ray from a tab other than Today.

---

## 5. Deep links

**One map.** `TAB_OF` in `sections.ts` maps every old section name and anchor to its tab:
- `overview` ← overview, this-visit, visits, recall
- `patient` ← patient, health, vitals, consent, consent-paper, consent-forms, visit-consents, patient-forms, details-card
- `chart` ← chart, chart-offer, treatment, treatment-done, treatment-lab, loas, payplans, files
- `treatment-record` ← treatment-record, timeline, notes, rx, letters, money, texts

It is used in five places:
1. The server's `current`: `TAB_OF[backTo ?? … ] ?? 'overview'`. `savedTo`, `recordSaved`, `SECTION_OF` (record.ts:154-158, record-extra.ts:134-138), `PANEL_OF` and `EXTRA_PANEL` keep their old section names and are mapped once, in the page.
2. `OPEN_PANEL`: every `?open=` value lands on `overview`, so the panel opens over Today. The panel ids are unchanged.
3. The client's `show()`, for `data-rec-go` and `data-rec-show`, including the intake branch's `data-rec-go="consent"`.
4. `fromHash`: it looks for the element's closest `[data-rec-panel]`, then `TAB_OF`, then falls back to overview. An absent card still lands on the right tab, for example `#money` for a dentist (Treatment record top) or `#loas` with no LOA (Chart & plan). `#timeline` is still rewritten to `#treatment-record`.
5. The `back` field (§ below).

| Link | Lands on |
|---|---|
| `?visit=<id>` today (`panels.ts:85,358`, `sign/[visit].astro:169,184,190`) | Today, with that visit as This visit |
| `?visit=<id>`, another day | Treatment record with the panel open. A cancelled visit opens its fold. A future visit opens on Today (Coming up) with the panel open. The `'visits'` fallback becomes `'overview'` |
| `panels.ts:236-247`: `?visit=&open=vitals#vitals`, `#health`, `#rx`, `#treatment` | The BP panel over Today; the Health card; Prescriptions; the plan. Optional: drop those hashes so the Dashboard lands on Today |
| `?open=details&dash=<visit>` (`panels.ts:463`) | Unchanged: the panel, the caret in Notes, and the return to the Dashboard (`:288-293`) |
| `?open=vitals\|note\|rx\|done\|file\|details\|health` | The panel over Today |
| `?back=chart` and the palette's `back=chart` posts | Unchanged. `pickpanel.ts` gives focus back to the tooth; its fallback `rec-rec-chart-tab` exists |
| `?treated=<id>#chart-offer`, `?chartskip=changed\|ended` | Chart & plan. ChartOffer is drawn only there. The Treatment `slot="offer"` and `back=treatment` are removed in the same change; an old `back=treatment` maps to chart |
| `?saved=new\|details\|form`, `?form=&used=#overview`, `?stale=1` | Today, with the callouts in the head |
| `?saved=health\|birth\|nothing` | Patient info. `birth` now comes from the details panel and lands on Today, via `savedTo` |
| `?saved=consent\|consent-already\|paper`, `#consent-paper` (`DeskConsent.astro:163`) | Patient info › Consent |
| `?saved=intake&intake=` | Today, where the consent lines show. `capacity`, `consent-removed` and `?capacity=refused` → Patient info |
| `#treatment-record` (`treatment-record.astro:32`, `aftercare/[kind].astro:34`), `#timeline` | Unchanged |
| `#rx` (`rx/[rx].astro:26`), `#letters` (`letters/[letter].astro:25`) | Treatment record › Prescriptions and letters |
| `#treatment` (`finances/close:338`) | Chart & plan › plan. Suggested: change the link to `#treatment-record`, since done-but-not-charged work is on the ledger. The old link still works |
| `#money` (`finances/close:370`) | Statements |
| `#visits` (`import.astro:572`) | Today › Coming up. Change the link to `#treatment-record`, where the imported past visits are |
| The intake's `#consent` links (`consents/index.astro`, `[document].astro:100,170`, `new/index.astro:107`, `intake/[intake].astro:708`) | Patient info › Consent |
| Post anchors: `ANCHOR` (treatment-done, treatment-lab, recall), `EXTRA_ANCHOR` (vitals, letters, loas, payplans), `#recall` | All stay element ids |
| Offline kept copy | Opens on `chart`, and the chart notices bring `chart` forward. The service worker's bare URL is unchanged. Add ▾, the palette actions and X-rays hide |
| Links out: Charge this visit, New booking, `sign/<visit>/`, `aftercare/<kind>/?visit=`, `treatment-record/`, `rx/<id>/`, `letters/<id>/`, the PTR fix links, the forms pages | Unchanged |

**`back` generalised.** `postedBack` (`[patient].astro:301`) accepts `overview | patient | chart | treatment-record`, and `chart` keeps its current meaning.
- Every panel form carries a hidden `back`, which the opener sets to the current tab.
- A save redirects to `#<back>`.
- "Just saved" lines move into one **saved-line slot** at the top of the current tab. These are the Rx and letter "Print it" line, the PTR warnings, CHART_SAVED, and the vitals and recall lines. So an Rx written from Today shows its Print link and its PTR warning on Today.
- A refused post comes back over the same tab with its panel open (`auto: true`).

---

## 6. Colour groups, pills and head chips: what stays of the owner's earlier asks

- **Colour groups (033, "encoders never lose their place"): changed.**
  - Kept: the five hues and what they mean.
    - Each tab has one hue on its icon: Today teal, Patient info rose, Chart & plan blue, Treatment record violet.
    - Every card keeps its `hue-*` top edge and icon: Health rose, Consent violet, notes, plan and files blue, statements and payment plans green.
    - Amber and red stay reserved for their meanings. Words always say the group too.
  - Dropped: the 5 group headings in the index and the 12 banners.
  - Why: with four named tabs pinned on screen there is no place to get lost. The banners were the second of three places each name appeared, and they pushed content below the fold.
  - The ledger's teal becomes violet with its tab. The selected tab uses the site's teal "chosen thing".
- **"Every detail its own pill or tile" (033): narrowed.**
  - Kept: pills where someone scans a list for a fact.
    - teeth, allergies, conditions, medicines, "none known";
    - statuses (visit, plan, lab, LOA, statement);
    - amounts in lists;
    - `.rk` tags in notes;
    - the visit panels as they are.
  - Dropped:
    - pills that were buttons (the strip's done pills, the head chip buttons);
    - the Details tiles and the dashed "+ Add" tiles, now a definition list and one "Not on file" line;
    - Recent visits' chip rows;
    - the duplicate Findings cards.
  - Why: 69 pills (27 on the Overview) look like 69 things to press, and an allergy is one pill among many. It stands out when the rest is quiet.
- **Head safety chips (034): kept, and pinned.**
  - Allergy, condition, medicine, BP, clearance and under 18 stay as plain text, pinned at every width, with the explicit "No known allergies" or "Allergies: not asked yet".
  - LOA waiting, plan behind and stale health move to Today › Needs attention, each with its one action.
  - The intake's to sign, to confirm and waiting to explain become Today lines, and "Not agreed" goes into the safety line. So the head does not grow to 13 chip kinds.

---

## 7. The intake's Consent forms pane (`/home/user/fl-intake`, `round/intake`)

- **Merge `round/intake` into main first**, then restructure on top of it. It edits `[patient].astro` in the same regions: imports, `refused.ts`, the new loaders, `savedTo`, the four callouts and the Consent section.
- `ConsentForms.astro` moves **whole** into Patient info › Consent, between the Privacy consent pane and Signed at visits, with its id `consent-forms`.
  - Its header actions stay: Prepare consent forms, and Record that the patient cannot decide (→ `rec-capacity`, a sibling panel outside the tabs).
  - Its row actions stay as they are (Open, Open forms, Print, Explain and confirm, Sign on this tablet, Print for signing on paper).
  - It is a list a person reaches on purpose, and its rare actions already live on `consents/<doc>/`.
- The four head callouts stay in the head's callout zone. Their "See Consent" (`data-rec-go="consent"`) resolves through `TAB_OF` to Patient info.
- `savedTo`: `intake` → overview; `capacity` and `consent-removed` → patient.
- **Phase 4:**
  - This visit reads `visit_treatment_consented()`, not only `visit_consent`. This removes today's disagreement with the Dashboard.
  - Per-form lines on Today: "<form>: explain and confirm" or "<form>: to sign → Sign on this tablet", and "Forms sent, not added → Add them now".
  - "Prepare consent forms for this visit" (`patients/new/?patient=&visit=`) replaces the 035 Sign on this tablet on Today and in the visit panel.
  - The visit panel gains its "Consent forms" block. The ask-first reason dialog hooks the plan row's Mark done and the `rec-done-add` Mark done list.

---

## 8. Files and build order

**Files**
- `_record/sections.ts`: `TABS`, `TAB_OF`, `CARD_HUE`. `SECTION_META` is kept for card hues.
- `_record/RecordNav.astro`: horizontal, sticky, Add ▾, the pinned safety copy, the phone's 5 columns.
- `[patient].astro`:
  - the 4 tab panels;
  - the head (tiles and `hereNow` removed, the facts line, the desk note, the safety line);
  - `postedBack`, `current`, `OPEN_PANEL`, `fromHash`, `show()`;
  - the health form moved out;
  - the birth date moved into `details`.
- New components:
  - `_record/Today.astro`: This visit, Coming up, Needs attention, Last visit.
  - `_record/HealthPanel.astro`.
  - `_record/SafetyLine.astro`.
  - `_record/SavedLine.astro`.
  - `_record/LoaAnswer`, inside `Loas.astro`.
- Changed components: `VisitStrip.astro` (becomes This visit), `RecallCard.astro`, `Treatment.astro`, `Loas.astro`, `PayPlans.astro`, `Files.astro`, `Notes.astro`, `Prescriptions.astro`, `Letters.astro`, `TreatmentRecord.astro` (only the cancelled fold is added after it; the ledger is untouched), `ChartOffer.astro`, `DeskConsent.astro` (placement only), `record.css`.
- Deleted: `Banner.astro`.
- Links: `import.astro:572`; optionally `finances/close:338` and `panels.ts:234-248`.
- `CLAUDE.md`: rewrite the record sections.

**Slices.** Each slice is its own commit, and each is checked before the next one starts.

- **S0. Baseline**
  - Merge intake.
  - Run the inventory scripts (`/tmp/fl-simplify/inventory/inv.mjs`, `panels.mjs`) and the 030 snapshot (`snap.mjs`) for 7 roles × the record, on Maria and Ledger Test.
  - Record every deep link's landing tab and element with a new `links.mjs`.
- **S1. `TAB_OF` and the resolver check** (pure; no visible change)
  - Add a script that fails when any value in `ANCHOR`, `EXTRA_ANCHOR`, both `SECTION_OF`, `savedTo`, `recordSaved`, `OPEN_PANEL`, every `?open=`, `?visit=` (today, past, future, cancelled) or any inbound hash in §5 does not resolve to one of the 4 tabs.
- **S2. The frame**
  - The 4 tab panels re-parent the existing components unchanged; banners and group headings go; RecordNav becomes horizontal and sticky with Add ▾.
  - `current`, `fromHash`, `show()` and `back` are generalised, and the saved-line slot is added.
  - Checks:
    - `links.mjs`: every link lands where §5 says;
    - every `RECORD_INTENTS` and `EXTRA_INTENTS` intent × the 4 `back` values, plus a refused post for each, reopens its panel;
    - the PTR warning shows after an Rx save from Today;
    - the offline copy opens on Chart;
    - the palette hands focus back to the tooth;
    - the snapshot's only differences are the tab list and the banners.
- **S3. The head**
  - Tiles and `hereNow` go; the facts line gets the HMO, member no. and "Owes"; the desk note moves up.
  - The safety line gets its explicit empty states and is pinned (≥768px as the copy in the row, <768px as the alert line). The birth date moves into Edit details.
  - Checks:
    - the height of the sticky block at 1366×768 with 5 allergies and a long note (≤128px, no allergy cut);
    - the palette, panel titles and ChartOffer are never covered (bounding rectangles);
    - no "Owes" and no amounts for a dentist without billing.
- **S4. Today**
  - This visit keeps one button per line and a teal next step; Coming up gets the reminder states and In 6 months / Other…; Needs attention and Last visit are added.
  - Checks: first load has 16 controls (29 with the shell) and 1 teal; the first to-do sits above the fold at 1440 and 390; `?visit=` for today.
- **S5. Patient info and `rec-health`**
  - The health form goes into its panel with its conflict and unsaved handling and the close warning; the Consent card keeps DeskConsent on the page.
  - Checks: `health`, `birth`, `nothing` and `health-checked` posts; the conflict flow; a refused post reopening the panel; Show the patient on a tablet.
- **S6. Chart & plan**
  - Plan rows get a next step and ⋯, with Done by and the LOA ask-first kept; the Done fold; X-rays; the conditional lab, LOA and payplan cards; the LOA answer merge; the Findings duplicate goes; ChartOffer is drawn only here.
  - Checks:
    - `?treated=`, `?chartskip=`, Update the chart;
    - `loa-approve` and `loa-deny` through the one panel;
    - the offline charting script from 025 unchanged;
    - the notes render with scripts off.
- **S7. Treatment record**
  - Add the cancelled fold, notes (newest 3, addendum on the card), Prescriptions and letters with the kind radio, Statements and the Texts fold.
  - Checks:
    - the ledger's last balance still equals `patient_balance()` for every dev patient;
    - the paper `treatment-record/` renders byte-identical;
    - the tab's height at 1366 and 390 (target under 2,200px for Maria at 1440);
    - the empty states say where things are made.
- **S8. Measure everything**
  - Re-run the inventory: target 41 total, 16 first load, 22 panels, ≤1 teal per screen.
  - 7-role snapshot. The expected differences are only:
    - tabs 12→4;
    - banners gone;
    - the removed buttons listed in §3;
    - `rec-loa-approve` and `rec-loa-deny` → `rec-loa-answer`;
    - `rec-health` added.

    The set of form intents, `action`s and outgoing links must be unchanged, apart from Bring in past visits.
  - Contrast ≥4.5:1 light and dark (both theme twins) at 1440 and 390, including the sticky row over scrolled content.
  - Targets ≥44px, fields 16px.
  - No sideways scroll at 1440, 1366, 1280, 1200, 1024, 768 and 390.
  - Keyboard order: the tabs' arrow keys, and ⋯ and Add ▾ returning focus.
  - Reduced-motion parity.
  - Compare the built CSS before and after.
  - Rewrite `CLAUDE.md`.

---

## 9. Risks and questions for the owner

**Risks**
1. **Merge order.** Build only after `round/intake` lands; its uncommitted review pass touches `ConsentForms.astro`.
2. **Routes lost silently.** The S1 resolver check, `links.mjs` and the snapshot are required gates, not optional.
3. **The saved-line slot and `back`** touch every record component's success callout. S2 tests every intent against every `back` value.
4. **The health form in a panel** is long on a phone. Measure 16px fields and 44px targets, and test the unsaved-close warning.
5. **Sticky height** on 1366×768 with many alerts. The 128px cap and the "+N more alerts" rule never cut an allergy.
6. **No usage data.** Before S4 cuts routes, count one month of live `audit_log` by action: `record.*` by intent, `health.checked`, `recall-set`, `consent.*`, `patient.view`.
7. **A missed menu item.** About 16 actions now sit in Add ▾ or the ⋯ menus. Each needs a clear label and a 44px item, and the empty states must name Add ▾.

**Questions (the build uses the default unless the owner says otherwise)**
1. *May we reverse parts of 033 and 034?* The coloured group headings and the banners go. Pills that were buttons become words. The head chips become pinned text, and their to-dos move to Today.
   **Default: yes.** The hues stay on tabs and cards, and the safety chips stay, pinned.
2. *Which check-up is the one tap on Today?*
   **Default: In 6 months**, with 3 months, a year and a date under Other…
3. *Should "Treatments done" stay as a folded list on Chart & plan, or go entirely, since the ledger holds the same rows?*
   **Default: keep it folded** (newest 5), so a dentist can scan the work done on one tooth.