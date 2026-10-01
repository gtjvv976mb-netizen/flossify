# Tooth-first chairside entry: spec (p01, revised)

A dentist working from a tooth can plan work on it, record it, mark planned work done and write a note, without typing the tooth number again. After a treatment is recorded, the chart can show the result, but only after the dentist confirms it with a tap.

This spec is written against `main` at `d07558b`, with migrations 036–038 applied. It also takes in the Treatment record commit `18a4017`, which is on the working branch after `d07558b`. That commit turned the Timeline into the Treatment record and moved the chart's history to Chart → "Changes to the chart" (`loadChartChanges`).

The spec honours every adjustedScope and every conflict the two verifiers raised on p01. Where they disagreed, the choice made here is stated in the text. This revision also answers the review's seventeen objections. The **Review notes** at the end say which ones were fixed and where, and why the others were not.

It ships as **two PRs**:

- **Step 1** has no migration. It adds:
  - the tooth picker;
  - the chart palette's record actions, including Mark done for the tooth's planned work;
  - the plan and done marks on the chart;
  - the note's default teeth.
- **Step 2** adds migration `042_chart_effect.sql` and the offer to update the chart after a treatment. The offer is only ever applied by the dentist's own tap.

**Numbering.** 039, 040 and 041 are reserved. Step 2's migration is written here as `042_chart_effect.sql`.

- It merges only after 039, 040 and 041 are on main, or once 041 is confirmed unused.
- If a reserved number is still open when Step 2 is ready, the file is renamed before merge. It takes the next number above every file on main and every open reservation.
- Why this matters: Render's pre-deploy step and the Procfile's release step run `npm run db:migrate` with no flag. `migrate.ts` refuses any pending file that sorts before the newest applied one, unless it is run with `--allow-late`. So a reserved number that merged after 042 would stop the deploy.

**Dropped, as the verifiers asked:**

- The fee-guide search field. It is unrelated scope (verifier 1). Verifier 2 kept it; verifier 1's reason wins.
- Files tagged with several teeth. `attachment.fdi` holds one smallint, so this would need a migration.
- Any automatic change to the chart when a treatment is marked done or recorded.

**Added because of the user's own words**, "plan, record and note from the tooth itself":

- The palette's third quiet action, *Clinical note*.
- Mark done for work already planned on that tooth. Without it, the tooth-first path would record the same work twice. The review raised this.

Neither conflicts with any verifier condition.

---

## 1. What the clinic and the patient see

The patient sees nothing new. No text is sent, and no public page changes.

### 1.1 The tooth picker (Step 1): Add to plan, Record a treatment, Clinical note, Add files

A tooth grid replaces two typed fields:

- the "Tooth" field in all four panels;
- the "Teeth" field in the note.

**Layout**

- **The permanent teeth** come in four labelled blocks: *Upper right*, *Upper left*, *Lower right* and *Lower left*.
  - Each block has two rows of four 44×44 tiles showing the FDI number.
  - In the page's own order (DOM, screen reader, arrow keys) the tiles follow the chart: 18→11, 21→28, 48→41, 31→38.
- **At least 400px wide:** the blocks sit two to a row, with the patient's right on the screen's left. They fold so that both midlines run through the middle, as when looking into the open mouth:

  ```
  18 17 16 15 | 25 26 27 28
  14 13 12 11 | 21 22 23 24
  ------------+------------
  44 43 42 41 | 31 32 33 34
  48 47 46 45 | 35 36 37 38
  ```

  - 11 and 21 meet at the centre, and so do 41 and 31.
  - The upper-left and lower-right blocks are placed by CSS (`grid-row`), so the reading order and arrow-key order stay the chart's.
- **Below 400px** (a phone's full-screen panel, which has 358px usable at 390 and 328px at 360) the blocks stack one per row, each in the chart's reading order:
  - 18 17 16 15 / 14 13 12 11
  - 21 22 23 24 / 25 26 27 28
  - 48 47 46 45 / 44 43 42 41
  - 31 32 33 34 / 35 36 37 38
  - There is no sideways scroll.

**Kinds of choice**

- **Plan, Record a treatment and Add files** use a single choice (radio buttons).
  - The first choice is a pill: **Whole mouth** (plan and done) or **No tooth** (files).
  - The pill is checked when nothing is picked.
  - One radio group spans the permanent tiles, the baby tiles and the pill.
- **Clinical note** uses multiple choice (checkboxes). Nothing ticked means no teeth.

**Baby teeth**

- A quiet toggle button (`aria-expanded`) shows a second set of four blocks, each one row of five, already mirrored: 55–51 | 61–65 over 85–81 | 71–75.
- All four forms accept 51–85 (the FDI set in `record.ts`), so the toggle is in all four.
- With scripts off, the baby teeth are simply shown.
- The group opens by itself when the value already holds a baby tooth.

**Or type it**

- A small field under the grid, labelled **"Or type the tooth number (FDI)"**. For notes it reads **"Or type the tooth numbers (FDI)"**. The placeholder is "e.g. 36", or "e.g. 16 17" for notes.
  - The label is distinct from the treatment-name box in the same panel, which is also labelled "Or type it".
- Typing into the field unticks the tiles. A valid number ticks its tile, and 51–85 opens Baby teeth.
- In single choice, the person picking a tile or the pill empties the field. A tile that the typed field ticks does not empty it.
- The server reads the field, so it works without scripts. When the radios hold nothing, the typed field wins.
- When both hold a tooth and they differ, the post is refused: "26 is picked and 36 is typed. Keep one of them." Only a page with scripts off can get there.

**Surfaces** (plan and done only)

- A second row of five 44×44 toggles: **M O D B L**.
  - On an anterior tooth (tens digit any, units 1–3) the O toggle reads **I** and posts `I`. This is the chart's own `occlusalCode`.
  - The old typed Surfaces box goes. F and P are no longer offered, but they are still accepted from older pages.
- **Surfaces carried over from the chart** (§1.2) are only a suggestion. They are ticked only while the chosen fee-guide item works on surfaces:
  - in Step 1, the default guide's *Filling* (`restoration`) and *Pit & fissure sealant* (`sealant`);
  - in Step 2, any item whose `chart_effect` is `filled` or `sealant`.
- Choosing any other item clears the suggestion, unless the dentist has changed the toggles by hand. So an extraction, root canal or crown recorded from a tooth with caries MO is saved with no surfaces.
- The toggles always stay usable by hand, for a clinic's own services.

**Words**

- **Legends:** "Tooth (FDI)", or for notes "Teeth (FDI)".
- **Help lines**, in ink-2:
  - Plan and done: "FDI numbers. Whole mouth for work that is not on one tooth."
  - Note: "FDI numbers. Tick every tooth the note is about."
  - Files: "FDI numbers. The tooth it shows, if one."

**Refused posts** keep their sentences, word for word:

- "That is not a tooth number. Use the FDI numbers on the chart: 11 to 48, or 51 to 85 for baby teeth." The files form keeps its own version of this sentence.
- "Surfaces are letters: M, O, D, B, L (or I, F, P), up to five, like "MOD"."
- The one new sentence is the picked-and-typed clash above.
- The panel comes back open with the tiles, the typed number and the surfaces exactly as they were posted.

### 1.2 From the tooth itself (Step 1): the chart's palette

For people who may edit records (`records.edit`, the same rule `/api/chart` uses), the popover that opens on a tooth gets one more block at its foot, under "Clear this tooth".

**The block's heading** is a small line: **For 26 MO**.

- The number is the FDI number and the letters are the surfaces ticked above. It follows the surface toggles live.
- When the clinic's notation is Universal or Palmer, it reads **For FDI 26 MO**, because the picker and the record store FDI.

**Three quiet buttons** (not teal) sit in one row. Each is at least 44px, and their words may wrap.

- **Add to plan** (`aria-label` "Add to plan: tooth 26 MO")
  - Opens *Add to plan* over the chart, with tooth 26 picked.
  - M and O are ticked once a filling or sealant is chosen (§1.1).
- **Treatment done** (`aria-label` "Treatment done: tooth 26 MO")
  - Opens *Record a treatment* the same way.
  - When the picked tooth has open work on the plan, the panel starts with it:
    - a line "On the plan for 26:";
    - one quiet button per item, such as **Mark done: Filling MO** (`aria-label` "Mark done: Filling, tooth 26 MO"). Each button is its own one-tap form and makes the same post as Treatment's Mark done: intent `plan-status`, `to=done`, the visit, and the dentist (or a "Done by…" choice for someone who does not treat). When the item's LOA is waiting or has expired, it asks the same LOA question first. It comes back to the chart;
    - then the line "Or record other work on 26 below."
  - The list follows the tooth picked in the panel, however the panel was opened.
- **Clinical note** (`aria-label` "Clinical note: tooth 26")
  - Opens *New clinical note* with only 26 ticked.

**The chart stays where it was**

- The panels open over the Chart section, and nothing switches behind them.
- A saved form comes back to `#chart`, and the Chart section shows the saved line:
  - Plan: "Added to the plan. Teeth with planned work have a ring under their number."
  - Mark done: "Marked done, and added to treatments done."
  - Record: "Treatment recorded."
  - Note: "Note saved under your name."
- A refused post from these panels comes back open over the Chart section.

**Focus**

- Closing a panel that was opened from the tooth puts focus back on the tooth. This also applies to a refused post that came back over the Chart.
- Some panels were opened from something no longer on screen, such as a closed More menu or a hidden section. When one of these closes, focus goes to the shown section's own button for that panel, or else to that section's tab.

**Offline or unsure of the line.** The three buttons and the Mark done buttons are hidden, and one line takes their place: "Planning, recording and notes need the connection. Findings still save on this device." This happens when any of these holds:

- the device knows it is offline (`navigator.onLine === false`);
- the page is the service worker's kept copy (`html[data-offline-copy]`);
- the check the chart already makes as a tooth opens (`GET /api/chart` through `serverWho`, at most 4 seconds) comes back with no answer.

In a brownout, the buttons show until that check fails. A panel's post that fails after that shows the browser's own error page. No check can promise more than that.

- The finding buttons keep working as they do today.
- A chart locked by an ended sign-in does not open the palette at all, as today.

**Size.** The popover gets a maximum height of the viewport minus 16px and scrolls inside, so it never runs off a small screen.

### 1.3 Planned and done work on the chart (Step 1)

**The marks.** Under each tooth's number there is a small mark row:

- a **ring** (hollow circle, 8px, 2px ink-2 border) when the tooth has open plan items (planned or accepted);
- a **dot** (filled 8px, ink-2) when something was done on it in the last 365 days.

Shape carries the difference, not colour. The row keeps its height when it is empty, so the arches stay aligned.

**The legend** gains two items next to Caries, Filled and the rest: "○ On the plan" and "● Treated in the past year".

**Each tooth's `aria-label`** gains a sentence, for example: "Tooth 26, Caries on MO. On the plan: Filling MO. Treated in the past year: Root canal, 12 Mar 2026. Activate to edit."

- Everyone who sees the chart gets this sentence, with or without `records.edit`.
- It survives the chart's own repaints and notation changes.

**Permanent teeth only.** If any open plan item, or any work done in the past year, is on a baby tooth, a line under the chart says: "Work on baby teeth is in Treatment; this chart shows permanent teeth only."

The marks are separate elements. They never use `.tooth::after`, which already means "waiting on this device".

### 1.4 The note's default teeth (Step 1)

- *New clinical note* opens with the teeth of today's treatments already ticked. "Today's treatments" follows the VisitStrip rule:
  - every `procedure_done` of this visit (`appointment_id` = the strip's visit);
  - plus those done today in Manila time with no visit named.
- **Add an addendum** opens with no teeth ticked.
- Opening from the palette ticks only that tooth.
- Only the palette sends the note back to the chart. Every other opener clears that.
- A refused post keeps what was ticked.

### 1.5 The chart after a treatment (Step 2): always an offer, applied only by the dentist's tap

**When the callout appears.** After *Mark done* on a plan item (from Treatment or from the panel), or after *Record a treatment*, the record lands on a callout (`id="chart-offer"`).

- It sits at the top of the section the post returned to (Treatment, or Chart if the post came from the chart), under that section's saved line.
- It appears only when the treatment has a tooth, its fee-guide item has a chart effect (§2), and the rules below produce **offer** or one of the **point** states.
- *Same*, *none* and *baby* produce no callout and no redirect to it. A child's filling on 55 simply lands on "Treatment recorded.", and the Chart's own line already says baby teeth are in Treatment.

**What the offer checks.** The offer is worked out against the chart as it is now. The chart holds one finding per tooth. Its rules:

| Chart now ↓ / treatment's effect → | filled, sealant | crown | root canal | veneer | missing (extraction, wisdom) |
|---|---|---|---|---|---|
| Sound | **offer** (needs at least one surface, else *no-surfaces*) | **offer** | **offer** | **offer** | **offer** |
| Caries on S | **offer** only if the treatment's surfaces cover all of S, else *uncovered* | **offer** | **offer** | *other* | **offer** |
| The same finding | union of surfaces: **offer**, or nothing if already shown | nothing | nothing | nothing | nothing |
| Filled ↔ sealant (the other one) | *other* | **offer** | **offer** | *other* | **offer** |
| Crown, root canal, veneer, bridge, implant, unerupted, impacted (a different one) | *other* | *other* | *other* | *other* | **offer** |
| A baby tooth (51–85) | *baby* | *baby* | *baby* | *baby* | *baby* |

A filling or sealant with no surfaces is always *no-surfaces*.

**The states and their words:**

- **offer** (info callout):
  - Title "Update the chart?"
  - Line "Chart 26 MO as filled. Now: caries MO."
  - One quiet button, **Update the chart**, and a link, **Leave the chart as it is**, which removes the callout and changes nothing.
- **applied** (success): "Chart updated: 26 MO filled."
  - In the Treatment section it also has a quiet **Open the chart** button.
- **uncovered** (amber):
  - "26 still has caries on D, which Filling on MO does not cover. The chart keeps one finding per tooth, so it was not changed."
  - **Open 26 on the chart**, which shows the Chart section and opens the palette on 26.
- **other** (amber):
  - "46 shows crown. The chart keeps one finding per tooth, so root canal would hide it. Choose on the chart."
  - **Open 46 on the chart**.
- **no-surfaces** (amber):
  - "No surfaces were written for this Filling, so the chart cannot show it. Chart 45 yourself."
  - **Open 45 on the chart**.
- **baby** (quiet line in *Record a treatment* only, never a callout): "The chart shows permanent teeth only, so 55 is not on it. The treatment is listed in Treatment."
- **changed** (amber, shown above the fresh offer): "26 changed since this page showed it: Dr. Ramon Cariño charted it at 10:05 am. The chart was not changed."
  - The name is the staff row's full name.
  - The fresh offer, if any, follows from the chart as it is now.
- **ended** (amber, shown above the fresh offer): "This page belonged to a sign-in that has ended, so the chart was not changed. Below is the chart as it is now."
  - This applies when the page that was confirmed was drawn under another sign-in, such as a tab left open on a shared tablet after its dentist signed out.
  - The fresh offer follows, drawn for the person signed in now.
- **Offline** (line down or kept copy): the button is hidden, and the callout says "Updating the chart needs the connection."
- **Refused**, for example a treatment that is not on this record: the red callout with the sentence, at `#chart-offer`. Nothing is written.

**In *Record a treatment*.** A visible line appears under Surfaces, **unticked**, when the fee-guide item, tooth and surfaces produce **offer** against the tooth as the chart on this page draws it:

**☐ Chart 26 MO as filled**, followed by "Now: caries MO on the chart."

- If the dentist ticks it, the chart is updated in the same save, under the same rules.
- If the chart moved in between, the treatment is still saved and the **changed** callout follows. **ended** works the same way.
- Left unticked, nothing is written to the chart, and the follow-up callout offers the update after saving.
- *uncovered*, *other*, *no-surfaces* and *baby* show their sentence instead of the box.
- If that tooth has a change waiting on this device, the line says "26 has a change waiting on this device. Chart it on the chart once it has synced." There is no box.
- Whenever the line is not in its offer state, its box and hidden fields are disabled, so nothing about the chart is posted. Each new offer (another tooth, other surfaces, another treatment) starts unticked.
- With scripts off, the line stays hidden and disabled, and the follow-up callout offers the update after saving.

**Mark done** stays a one-tap form. Its offer is the follow-up callout.

People without `records.edit` see no callout, no line, no palette actions and no Mark done buttons. The server refuses them regardless.

---

## 2. Data

**Step 1: no schema change.**

**Step 2: `src/data/migrations/042_chart_effect.sql`** (see Numbering), in full:

```sql
-- 042 — what a treatment in the fee guide does to the chart (tooth-first charting, step 2).
--
-- After a treatment is recorded or marked done on a permanent tooth, the record offers to update the
-- chart — "Chart 26 MO as filled. Now: caries MO." — and writes it only when the dentist confirms
-- (Update the chart, or ticking the line in Record a treatment). What a treatment does to the chart is
-- never guessed from its name: it is this column, set per fee-guide code.
--
--   procedure_catalog.chart_effect  the finding a treatment leaves on its tooth: filled, sealant,
--                                   root_canal, crown, missing or veneer. Null: no offer (consultation,
--                                   cleaning, X-ray, fluoride, dentures, bridge, whitening, braces, and any
--                                   service a clinic added itself).
--
-- The default fee guide's codes (006 signup_clinic, src/data/directory.ts, the seed) are set here for every
-- clinic, and a trigger sets them on insert when the insert says nothing, so signup_clinic(), the seed and
-- Settings → Services & fees need no change.
--
-- Additive: one nullable column with a check, one immutable function, one trigger function and trigger.
-- No policy or grant changes: procedure_catalog is already under tenant_isolation, and the app already
-- selects and inserts it. The runner connects as a superuser or BYPASSRLS role, so the update below
-- reaches every clinic's rows.

alter table procedure_catalog add column if not exists chart_effect text
  check (chart_effect is null or chart_effect in ('filled', 'sealant', 'root_canal', 'crown', 'missing', 'veneer'));

create or replace function procedure_chart_effect(p_code text) returns text
language sql immutable as $$
  select case p_code
    when 'restoration' then 'filled'
    when 'sealant'     then 'sealant'
    when 'rootcanal'   then 'root_canal'
    when 'crown'       then 'crown'
    when 'extraction'  then 'missing'
    when 'wisdom'      then 'missing'
    when 'veneers'     then 'veneer'
  end
$$;

update procedure_catalog set chart_effect = procedure_chart_effect(code) where chart_effect is null;

create or replace function procedure_catalog_chart_effect() returns trigger
language plpgsql as $$
begin
  if new.chart_effect is null then
    new.chart_effect := procedure_chart_effect(new.code);
  end if;
  return new;
end $$;

drop trigger if exists procedure_catalog_chart_effect on procedure_catalog;
create trigger procedure_catalog_chart_effect before insert on procedure_catalog
  for each row execute function procedure_catalog_chart_effect();
```

**Tables Step 2 writes, which already exist.** No DDL is needed on them, and the grants are already in place, because `/api/chart` makes the same writes.

- **`sync_change`**: one row per applied offer.

  | Column | Value |
  |---|---|
  | `id` | `gen_random_uuid()` |
  | `clinic_id` | the clinic (`ctx.clinicId`; not null, no default, checked by RLS) |
  | `device_id` | `gen_random_uuid()` |
  | `device_seq` | 1 |
  | `entity` | `'chart'` |
  | `entity_id` | patient |
  | `occurred_at` | `now()` |
  | `received_at` | `clock_timestamp()`, stamped under the chart lock |
  | `staff_id` | the signed-in person |
  | `outcome` | `'applied'` |
  | `conflict_with` | null |
  | `payload` | `{ fdi, condition, surfaces, since, from: 'record', procedure: <procedure_done id> }` |

  - `since` is the posted `base` as an ISO time only when it is finite, greater than 0 and no later than a minute past the server's now. Otherwise it is `null`.
  - `newerChanges()` in `api/chart.ts` reads only `fdi`, `clear`, `cleared` and `kept`, so the extra keys are harmless.
  - Every chart drawn before this row now sees it as a newer change.

- **`tooth_state`**:
  - The tooth's live rows get `superseded_at = received_at`.
  - New rows go in, one per surface or one with `surface = null`, carrying:
    - `noted_by` = the person;
    - `noted_at` = `received_at`;
    - `change_id` = the ledger id;
    - `procedure_id` = the `procedure_done` id (the column already exists and is unused today).
  - These rows appear in Chart → "Changes to the chart" like any other chart change.

- **`audit_log`**: `chart.update`, entity `patient`. This is in addition to the `record.done_add` or `record.plan_done` line that the save already writes.

Nothing new is public, and no definer function is added.

---

## 3. Server changes

### Step 1

**`src/lib/record.ts`**

1. Add `pickedTooth(form)`:

   ```ts
   /** The tooth a ToothPick posted. The typed box wins when the radios hold nothing; both holding a tooth,
    *  and different, is a clash (scripts off). An older page posts `fdi` as text; it reads the same. */
   function pickedTooth(form: FormData): { raw: string; fdi: number | null; clash: string | null } {
     const typed = String(form.get('fdi_typed') ?? '').trim(), picked = String(form.get('fdi') ?? '').trim();
     const raw = typed || picked, fdi = toothOf(raw);
     const clash = typed && picked && fdi && toothOf(picked) !== fdi ? `${picked} is picked and ${typed} is typed. Keep one of them.` : null;
     return { raw, fdi, clash };
   }
   ```

   - In `plan-add`, `done-add` and `file-add`, replace `typedTooth` and `toothOf(form.get('fdi'))` with `pickedTooth(form)`.
   - The "not a tooth number" sentences stay as they are and are checked first. `clash` is checked after them.

2. Surfaces: `const typedSurface = form.getAll('surface').map(String).join('').trim();`, then pass the same value to `surfaceOf`.
   - `surfaceOf` also removes repeated letters (`[...new Set(s)].join('')`) before the regex.

3. `note-add`: `teethFrom([...form.getAll('teeth'), form.get('teeth_typed') ?? ''].map(String).join(' '))`.
   - Ticked and typed teeth are joined, so they cannot clash.

4. `values` (for a refused post) joins repeated `teeth` and `surface` entries with a space instead of keeping the last one:

   ```ts
   const values: Record<string, string> = {};
   for (const [k, v] of form.entries()) {
     if (typeof v !== 'string' || k === '_csrf' || k === 'intent') continue;
     values[k] = (k === 'teeth' || k === 'surface') && k in values ? `${values[k]} ${v}` : v;
   }
   ```

5. `loadClinical`'s catalog select adds `code`, and `CatalogItem` gains `code: string`. This feeds the fee pick's surface rule (§1.1). It is a select change, not a schema change.

No new intent, permission key or rate limit is added. Every post still goes through `canEditRecords` in its transaction and `hit('record:s:'+staffId, …LIMITS.chart.staff)`.

**`src/pages/c/[clinic]/patients/[patient].astro`** (server side)

1. In the `RECORD_INTENTS || EXTRA_INTENTS` branch:

   ```ts
   const postedBack = form.get('back') === 'chart' ? 'chart' : form.get('back') === 'treatment' ? 'treatment' : null;
   // success:
   const qs = [`saved=${encodeURIComponent(outcome.saved)}`, ...Object.entries(outcome.qs ?? {}).map(([k, v]) => `${k}=${encodeURIComponent(v)}`), postedBack === 'chart' ? 'back=chart' : ''].filter(Boolean).join('&');
   const hash = outcome.qs?.treated ? 'chart-offer' : postedBack === 'chart' ? 'chart' : ANCHOR[intent] ?? EXTRA_ANCHOR[intent] ?? outcome.section;
   return Astro.redirect(to(qs, hash), 303);
   // refused (including the rate limit, which now also returns to the section the form was posted from):
   backTo = postedBack ?? (slow ? null : outcome.section);
   ```

   - `outcome.qs` only exists from Step 2. In Step 1 it is always undefined.

2. `const fromChart = q.get('back') === 'chart';` Then:

   ```ts
   current = backTo ?? (fromChart ? 'chart' : null) ?? savedTo[saved ?? ''] ?? recordSaved(saved) ?? …
   ```

3. **Chart work**, built from data already loaded (`clin.plan`, `clin.done`):

   ```ts
   const PERMANENT = (n: number) => n >= 11 && n <= 48 && n % 10 >= 1 && n % 10 <= 8;
   const since = Date.now() - 365 * 864e5;
   const chartWork: Partial<Record<number, { plan: string[]; done: string[] }>> = {};
   for (const i of planOpen) if (i.fdi && PERMANENT(i.fdi)) (chartWork[i.fdi] ??= { plan: [], done: [] }).plan.push(`${i.name}${i.surface ? ` ${i.surface}` : ''}`);
   for (const d of clin.done) if (d.fdi && PERMANENT(d.fdi) && +new Date(d.at) >= since) (chartWork[d.fdi] ??= { plan: [], done: [] }).done.push(`${d.name}, ${dateText(manilaDay(new Date(d.at)))}`);
   const babyWork = [...planOpen, ...clin.done.filter((d) => +new Date(d.at) >= since)].some((x) => x.fdi != null && x.fdi >= 51);
   ```

4. **Note default teeth**: the teeth of `clin.done` rows where `visitId === thisVisit?.id`, or where `manilaDay(at) === today && !visitId`. Unique, in order.

5. `CHART_SAVED = { plan: …, 'plan-done': …, done: …, note: … }`, holding the words in §1.2.

6. The header comment says the odontogram is placed "as it is". Update it to: "…gains the palette's record actions and the plan/done marks (props `actions`, `work`); its offline logic is untouched."

### Step 2

**New: `src/lib/chart-offer.ts`.** Pure functions with no Node or database imports, so the panel script can import it. It imports only from `src/data/demo.ts`.

```ts
export const CHART_EFFECTS = ['filled', 'sealant', 'root_canal', 'crown', 'missing', 'veneer'] as const;
export type ChartEffect = (typeof CHART_EFFECTS)[number];
export interface LiveMark { condition: ToothCondition; surfaces: Surface[] }          // null = sound
export const isPermanent = (fdi: number) => fdi >= 11 && fdi <= 48 && fdi % 10 >= 1 && fdi % 10 <= 8;
/** M→mesial, O/I→occlusal (the chart's one biting slot), D→distal, B/F→buccal, L/P→lingual; deduped, chart order. */
export function surfacesFromLetters(letters: string | null): Surface[];
/** 'sound' | '<condition>' | '<condition>:<surfaces in chart order, comma-joined>' — what a form says it showed. */
export function markKey(m: LiveMark | null): string;
export type ChartOffer =
  | { kind: 'none' }                                   // no tooth, or no chart effect: say nothing
  | { kind: 'baby'; fdi: number }
  | { kind: 'same'; fdi: number; now: LiveMark }
  | { kind: 'apply'; fdi: number; now: LiveMark | null; to: { condition: ChartEffect; surfaces: Surface[] } }
  | { kind: 'point'; fdi: number; now: LiveMark | null; why: 'no-surfaces' | 'uncovered' | 'other'; left?: Surface[] };
/** The table in §1.5, exactly. Checks in order: none → baby → no-surfaces → sound → same (union) → missing → caries cover → other. */
export function chartOffer(effect: string | null, fdi: number | null, letters: string | null, now: LiveMark | null): ChartOffer;
/** Whether an offer earns the follow-up callout: 'apply' and 'point' only (never none, same or baby). */
export const calloutWorthy = (o: ChartOffer) => o.kind === 'apply' || o.kind === 'point';
export function markWords(fdi: number, m: LiveMark | null): string;          // "caries MO", "sound", "crown"
export function offerWords(o: ChartOffer, treatment: string): { title: string; line: string } | null;  // §1.5's sentences
```

**New: `src/lib/chart-write.ts`.** This is a new module. `src/pages/api/chart.ts` is not refactored, imported or changed by it.

```ts
import './dotenv';
import type { Tx } from './db';
/** sid: the tag of the sign-in this request is under — chartSession(session), computed by the page. */
export interface Ctx { clinicId: string; staffId: string; patientId: string; sid: string }
/** The tooth as the chart draws it (one mark; 'incisal' rows land in the occlusal slot), or null when sound. */
export async function liveTooth(tx: Tx, patientId: string, fdi: number): Promise<LiveMark | null>;
/** Who last changed this tooth and when: the newest applied ledger row for it (or a clear that cleared it),
 *  else the newest tooth_state row without a change_id (noted_at). */
export async function lastToothChange(tx: Tx, patientId: string, fdi: number): Promise<{ at: Date; by: string | null } | null>;
/** The write itself, inside the caller's transaction, AFTER the lock below: ledger row, supersede, insert, audit. */
export async function writeToothFromRecord(tx: Tx, c: Ctx, t: { fdi: number; to: { condition: ChartEffect; surfaces: Surface[] }; procedureId: string; since: Date | null }): Promise<{ changeId: string; at: Date }>;
export type ChartApply =
  | { kind: 'applied'; fdi: number } | { kind: 'changed'; fdi: number; by: string | null; at: Date | null }
  | { kind: 'ended' } | { kind: 'nothing' } | { kind: 'missing' };
/** Confirmed by the person: apply the offer for this treatment if the page was drawn under this sign-in and the
 *  tooth still shows `from`. */
export async function chartFromRecord(tx: Tx, c: Ctx, t: { treated: string; from: string; base: unknown; sid: string }): Promise<ChartApply>;
export interface OfferState { treatedId: string; treatment: string; fdi: number | null; letters: string | null; effect: ChartEffect | null;
  now: LiveMark | null; applied: boolean; offer: ChartOffer; base: number; last: { at: Date; by: string | null } | null }
/** For the callout: read-only, no lock (the write re-checks under the lock). */
export async function offerFor(tx: Tx, patientId: string, treatedId: string): Promise<OfferState | null>;
```

`chartFromRecord` runs in this order, inside the record post's own `withClinic` transaction:

0. **If `t.sid !== c.sid` → `ended`.** Nothing is read or written.
   - This is the chart's own sign-in rule (`api/chart.ts` refuses a change whose `sid` differs, as `'session'`).
   - A record tab left open after its dentist signed out on a shared tablet therefore cannot write the chart under whoever signs in next. The CSRF cookie lives 30 days and is not rotated at sign-in, so CSRF alone would not stop it.
1. `select pg_advisory_xact_lock(hashtext($1))` with `'chart:' + patientId.toLowerCase()`.
   - This is the same key as `POST /api/chart` and `chartNow`: `api/chart.ts` builds it from the patient id lower-cased, and `chartNow` uses `.toLowerCase()`.
2. Read the treatment:

   ```sql
   select d.id, d.name, d.fdi, d.surface, c.chart_effect
     from procedure_done d left join procedure_catalog c on c.id = d.catalog_id
    where d.id = $1 and d.patient_id = $2
   ```

   Nothing found → `missing`.
3. If a live `tooth_state` row already has `procedure_id = d.id` → `nothing`. A re-post is harmless.
4. `now = liveTooth(...)`, then `offer = chartOffer(effect, fdi, surface, now)`. If `offer.kind !== 'apply'` → `nothing`.
5. If `markKey(now) !== t.from` → `changed`, with `lastToothChange`. Nothing is written.
   - This is how "never replace a finding the person did not see" is kept here: the person was shown `from`, and the write replaces exactly that and nothing else.
6. `since` is `t.base` when it is a finite number greater than 0 and no later than a minute past now; otherwise `null`. It is used only for the payload and the words.
7. `writeToothFromRecord(...)` → `applied`.

`writeToothFromRecord` does, in order:

1. Insert the ledger row, with `clinic_id = c.clinicId` (§2), returning `id` and `received_at`.
2. `update tooth_state set superseded_at = <received_at> where patient_id = $1 and fdi = $2 and superseded_at is null`.
3. Insert the rows (§2).
4. Write the `chart.update` audit line.

**`src/lib/record.ts` (Step 2)**

- `CatalogItem` gains `effect: string | null`: add `chart_effect` to `loadClinical`'s catalog select.
- `Ctx` gains `sid?: string` (the page passes `chartSession(session)`). The chart writes require it.
- `Outcome` gains `qs?: Record<string, string>`: `{ ok: true; section: string; saved: string; qs?: Record<string, string> }`.
- `plan-status` with `to=done`, after the insert:

  ```ts
  const o = await offerFor(tx, c.patientId, d.id);
  return { ok: true, section, saved: 'plan-done', qs: o && calloutWorthy(o.offer) ? { treated: d.id } : undefined };
  ```

- `done-add`, after the insert:
  - If `form.get('chart') === '1'` and `chart_from` is non-empty, run `r = chartFromRecord(tx, c, { treated: d.id, from: chart_from, base: form.get('chart_base'), sid: String(form.get('sid') ?? '') })`.
  - `applied`, `changed` or `ended` → `qs = { treated: d.id, ...(r.kind === 'changed' || r.kind === 'ended' ? { chartskip: r.kind } : {}) }`.
  - Otherwise, use `offerFor` and `calloutWorthy` as `plan-status` does.
  - The treatment itself is saved whatever the chart part answers. Only the chart write is bound to the sign-in.
- New intent **`chart-apply`**: `SECTION_OF['chart-apply'] = 'chart'`. It posts `treated`, `from`, `base`, `sid`, `back` and (when the strip is showing) `visit`.

  ```ts
  case 'chart-apply': {
    const id = String(form.get('treated') ?? '');
    if (!UUID.test(id)) return fail('Choose the treatment to chart.');
    const r = await chartFromRecord(tx, c, { treated: id, from: String(form.get('from') ?? ''), base: form.get('base'), sid: String(form.get('sid') ?? '') });
    if (r.kind === 'missing') return fail('That treatment is not on this record any more. Nothing was changed.');
    return { ok: true, section, saved: 'charted', qs: { treated: id, ...(r.kind === 'changed' || r.kind === 'ended' ? { chartskip: r.kind } : {}) } };
  }
  ```

  - `canEditRecords` has already run at the top of `recordAction`, in the same transaction.
  - A `fail` is thrown out as `Refused`, so nothing half-done stays.
- `recordSaved`: add `charted: 'treatment'`. The `back=chart` rule above wins when it is present.

**`[patient].astro` (Step 2)**

- `import { chartSession } from '../../../api/chart'`, as the Odontogram already does. The file itself is unchanged.
  - `const chartSid = chartSession(session)` is passed into `recordAction`'s ctx (`sid`), rendered into ChartOffer's form, and rendered into `rec-done-add`'s chart line.
- The offer state:

  ```ts
  const treatedQ = q.get('treated');
  offerState = canEdit && treatedQ && UUID.test(treatedQ) ? await withClinic(clinic.id, (tx) => offerFor(tx, patient.id, treatedQ)) : null;
  const chartSkip = q.get('chartskip') === 'changed' || q.get('chartskip') === 'ended' ? q.get('chartskip') : null;
  const offerProblem = recordProblem?.intent === 'chart-apply' ? recordProblem : null;
  ```

- Render `<ChartOffer>` at the top of the `current` section only, under that section's saved line, when `offerState` holds a callout-worthy offer, `applied`, a `chartSkip`, or `offerProblem`:
  - in Chart: after `<Banner>` and the `CHART_SAVED` callout;
  - in Treatment: through a new `offer` slot in `Treatment.astro`, rendered just after its own saved callout.
  - The id stays unique, and `#chart-offer` lands inside a shown tab panel.
  - A refused `chart-apply` renders the red callout even when `offerState` is null (a made-up id), and so does the rate-limit sentence (§3 Step 1, item 1).

Permission keys: `records.edit` only (`canEditRecords` → `staff_can`). No new key and no new rate limit.

---

## 4. Client changes

### Step 1

**New: `src/pages/c/[clinic]/patients/_ui/ToothPick.astro`**

```ts
interface Props {
  id: string;                 // 'tp-plan' | 'tp-done' | 'tp-note' | 'tp-file' — unique prefixes
  name: 'fdi' | 'teeth';
  multiple?: boolean;         // checkboxes (notes)
  value?: string;             // "36" or "16 17"; typed values are shown in the typed box
  typed?: string;
  label: string; optional?: boolean; help?: string;
  noneLabel?: string;         // 'Whole mouth' | 'No tooth' (single only)
  surfaces?: string | null;   // present (even '') → render the M O D B L row, value = posted letters
}
```

Markup: `<fieldset class="tp" data-tp data-tp-name={name} data-tp-multiple={multiple ? '' : undefined}>` with a `legend` ("Tooth (FDI)" / "Teeth (FDI)"), then the help line, then:

- `div.tp-mouth[data-tp-set="permanent"]`, holding four `div.tp-q[role=group][aria-label]` blocks in chart order (UR, UL, LR, LL).
  - UL and LR carry `data-tp-fold`.
  - Each block has a `span.tp-q-name` and a `div.tp-grid` of `label.tp-t`.
  - Each `label.tp-t` holds `input.sr-only` (radio or checkbox, with `name` and `value`) **followed by `span.tp-face`**, which holds the number.
- `button.tp-baby-toggle[data-tp-baby-toggle][aria-expanded][aria-controls="{id}-baby"]`. It carries the `hidden` attribute in the HTML; the script removes it.
- `div#{id}-baby.tp-mouth[data-tp-set="baby"][data-tp-baby]`, with no `hidden` in the HTML.
- A none pill (single only): `label.tp-none` > `input.sr-only[type=radio][name][value=""]` + `span.tp-pill`.
- `label.field.tp-typed` ("Or type the tooth number (FDI)" / "Or type the tooth numbers (FDI)") > `input[name="{name}_typed"][data-tp-typed][inputmode=numeric][autocomplete=off]`.
- If surfaces are wanted: `fieldset.tp-surf[data-tp-surfaces]` (legend "Surfaces"), with five `label.tp-t`. Each holds:
  - `input.sr-only[type=checkbox][name=surface][value=M|O|D|B|L]`;
  - then `span.tp-face[aria-hidden=true]` with the letter;
  - then a `span.sr-only` word ("Mesial" …).
  - The O input has `data-tp-occlusal`.

The chosen state is drawn with the sibling pattern (`input:checked + .tp-face`), as the chart's notation control already is, never with `:has()`. No Tailwind utilities go on the `.tp-*` elements, except `sr-only`.

**New: `src/pages/c/[clinic]/patients/_ui/toothpick.ts`** (browser only)

```ts
export function initToothPick(root: HTMLElement): void;   // hides the baby group unless it holds a checked tooth (toggles the
                                                          // hidden ATTRIBUTE), wires the toggle, typed box ↔ tiles (typing
                                                          // unticks the tiles and ticks a valid one; a `change` the person
                                                          // makes on any radio, pill included, empties the typed box — a tile
                                                          // the typed box ticks does not), O↔I relabel (face text and input
                                                          // value) on a single pick, marks the surfaces "by hand" on a person's
                                                          // click (root.dataset.tpSurfacesTouched), dispatches 'tp:change'
                                                          // (bubbles; detail { teeth: number[], surfaces: string })
export function setTeeth(root: HTMLElement, fdis: number[]): void;   // checks those tiles (opens baby group if needed), clears typed
export function setSurfaces(root: HTMLElement, letters: string): void; // does not count as "by hand"
export function readTeeth(root: HTMLElement): number[];               // typed box wins for single when valid, union for multiple
export function readSurfaces(root: HTMLElement): string;
```

`ToothPick.astro`'s `<script>` runs `document.querySelectorAll<HTMLElement>('[data-tp]').forEach(initToothPick)`.

**CSS: `_ui/patients.css`, new block "The tooth picker (.tp-)".** It is unlayered like the rest of that file. It uses tokens only, and every token already has its dark value in `global.css`.

```css
.tp { container: tp / inline-size; min-width: 0; margin: 0; padding: 0; border: 0; }
.tp-mouth { display: grid; grid-template-columns: max-content; gap: 0.75rem; }
@container tp (width >= 400px) {
  .tp-mouth[data-tp-set="permanent"] { grid-template-columns: repeat(2, max-content); column-gap: 1rem; }
  /* Upper left and lower right fold the other way, so both midlines run through the middle (§1.1). */
  .tp-q[data-tp-fold] .tp-grid > .tp-t:nth-child(-n + 4) { grid-row: 2; }
  .tp-q[data-tp-fold] .tp-grid > .tp-t:nth-child(n + 5) { grid-row: 1; }
}
@container tp (width >= 500px) { .tp-mouth[data-tp-set="baby"] { grid-template-columns: repeat(2, max-content); column-gap: 1rem; } }
.tp-mouth[hidden] { display: none; }
.tp-q-name { display: block; margin-bottom: 0.25rem; font-size: 13px; font-weight: 500; color: var(--c-ink-2); }
.tp-grid { display: grid; grid-template-columns: repeat(4, 44px); gap: 4px; }
.tp-mouth[data-tp-set="baby"] .tp-grid { grid-template-columns: repeat(5, 44px); }
.tp-surf .tp-grid { grid-template-columns: repeat(5, 44px); gap: 6px; }
.tp-t { position: relative; display: block; width: 44px; height: 44px; cursor: pointer; }
.tp-face { display: grid; place-items: center; width: 100%; height: 100%; border: 1px solid var(--ws-field-line); border-radius: 10px;
           background: var(--ws-field); font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--c-ink); }
.tp-t:hover > .tp-face { border-color: var(--ws-field-line-hover); }
.tp-none { display: inline-block; cursor: pointer; }
.tp-pill { display: inline-flex; align-items: center; min-height: 44px; padding: 0 1rem; border: 1px solid var(--ws-field-line); border-radius: 999px;
           background: var(--ws-field); font-size: 14.5px; font-weight: 600; color: var(--c-ink); }
.tp-t > input:checked + .tp-face, .tp-none > input:checked + .tp-pill { border-color: var(--ws-teal); background: var(--ws-teal-tint); color: var(--ws-teal-ink); }
.tp-t > input:focus-visible + .tp-face, .tp-none > input:focus-visible + .tp-pill { outline: 2px solid var(--ws-teal); outline-offset: 2px; }
.tp-baby-toggle { min-height: 44px; }
.tp-help { margin-bottom: 0.625rem; font-size: 13px; line-height: 1.4; color: var(--c-ink-2); }
/* The palette in the record: never taller than the screen. */
.pt-chart [data-palette] { max-height: calc(100dvh - 16px); overflow-y: auto; }
```

Width check: 4 × 44 + 3 × 4 = 188px per block.

- Two blocks need 392px, against 432px usable in a normal panel.
- One block needs 188px, against 358px on a 390 phone and 328px on a 360 phone.
- A baby row is 236px. Two need 488px, which only fits the wide panel's 592px.

**Panels moved out of the hidden tab panels.** A `<dialog>` whose ancestor has the `hidden` attribute is not rendered, which is why today's openers carry `data-rec-show`. The precedent is `VisitPanels`, which is already outside the sections.

**New: `_record/TreatmentPanels.astro`** holds `rec-plan-add` and `rec-done-add`, cut from `Treatment.astro` together with the `[data-fee-form]` price script.

- **Props:** `{ c, loas, canEdit, action, meId, problem, today, firstName, visitId, openNow }`.
- **Inside both forms:**
  - `<ToothPick id="tp-plan" name="fdi" label="Tooth (FDI)" noneLabel="Whole mouth" surfaces={pv.surface ?? ''} value={pv.fdi} typed={pv.fdi_typed} …/>` replaces the Tooth and Surfaces inputs. The same goes for `tp-done`.
  - Fee `<option>`s get `data-fee-surfaces` when `x.code` is `restoration` or `sealant`. In Step 2 the rule becomes `x.effect` is `filled` or `sealant`.
  - `<input type="hidden" name="back" value={pv.back === 'chart' ? 'chart' : ''} data-pick-back />`.
- **`rec-done-add` also gets, above its form, `<div data-pick-plan hidden>`:**
  - a `p` for "On the plan for 26:";
  - for **every open plan item with a tooth**, a `<form method="post" data-plan-fdi={i.fdi} hidden>`. Each form holds:
    - `Csrf`;
    - `intent=plan-status`, `item`, `to=done`;
    - `visit` (when there is one);
    - `dentist`, as a hidden field with the person's id when they treat, else a required "Done by…" select;
    - a hidden `back` (`data-pick-plan-back`);
    - `data-confirm` with Treatment's LOA sentence when that item's LOA is waiting or expired (Treatment's document-level submit listener asks, as today);
    - a quiet `ws-btn ws-btn-quiet` button, "Mark done: {name}{ surface}", with `aria-label` "Mark done: {name}, tooth {fdi}{ surface}";
  - a closing `p`: "Or record other work on 26 below."
- **Script, on `ws:panel-open` for each of the two dialogs:**

  ```ts
  const { opener, auto } = (e as CustomEvent).detail ?? {};
  if (auto) { showPlan(); return; }                    // a refused post: the form already holds what was posted
  const pick = opener instanceof HTMLElement && opener.dataset.pickFdi ? opener : null;
  delete tp.dataset.tpSurfacesTouched;
  if (pick) {
    setTeeth(tp, [Number(pick.dataset.pickFdi)]); setSurfaces(tp, '');
    dialog.dataset.pickFdi = pick.dataset.pickFdi!; dialog.dataset.pickSurfaces = pick.dataset.pickSurfaces ?? '';
    back.value = 'chart';
  } else {
    if ('pickFdi' in dialog.dataset) { setTeeth(tp, []); setSurfaces(tp, ''); }   // after a pick: start clean, keep other typing
    delete dialog.dataset.pickFdi; delete dialog.dataset.pickSurfaces;
    back.value = '';                                   // only the palette sends a panel back to the chart
  }
  suggest(); showPlan();
  ```

  - `suggest()`, run on open and on the fee pick's `change`:
    - It does nothing without `dialog.dataset.pickSurfaces`, or once `tp.dataset.tpSurfacesTouched` is set.
    - Otherwise it calls `setSurfaces(tp, selected option has data-fee-surfaces ? dialog.dataset.pickSurfaces : '')`.
  - `showPlan()`, run on open and on `tp:change` (`rec-done-add` only):
    - shows the `[data-plan-fdi="<picked tooth>"]` forms;
    - fills in the words;
    - copies `back.value` into each form's `data-pick-plan-back`;
    - hides the block when no form matches.
  - **Focus**, on `ws:panel-close`: when focus did not land (`document.activeElement` is `body` or null), it goes to:
    - the tooth, `[data-odontogram] button[data-tooth][data-fdi="N"]`, when `back.value === 'chart'`. N is `dialog.dataset.pickFdi`, or the posted tooth on a panel the server drew open;
    - else the shown section's own `[data-ws-open="<this panel>"]` button;
    - else the shown section's tab.
  - "Go to the plan" is not built; the Mark done forms replace it.

**New: `_record/NotePanel.astro`** holds `rec-note-add`, cut from `Notes.astro` together with its script. It adds the props `defaultTeeth: number[]` and `back`.

- `<ToothPick id="tp-note" name="teeth" label="Teeth (FDI)" multiple value={v.teeth ?? defaultTeeth.join(' ')} typed={v.teeth_typed} />` replaces the Teeth input.
- `data-note-default-teeth={defaultTeeth.join(' ')}` goes on the form, and a hidden `back` (`data-pick-back`).
- The script keeps the existing amends logic, and adds:
  - an addendum → `setTeeth(tp, [])` and `back=''`;
  - a new note from a pick → `setTeeth(tp, [fdi])`, `back='chart'` and `dialog.dataset.pickFdi`;
  - any other new note → the default teeth and `back=''`;
  - the same focus rule on `ws:panel-close`.

**Other files**

- **`Treatment.astro`**:
  - Remove the two panels and the fee script, and drop the `openNow` prop.
  - Keep `rec-lab-add`, the Mark done forms, the fold and confirm scripts. The confirm listener is document-wide and also serves the panel's Mark done forms.
- **`Notes.astro`**: remove the panel and its script.
- **`Files.astro`**: `<ToothPick id="tp-file" name="fdi" label="Tooth (FDI)" noneLabel="No tooth" value={v.fdi} typed={v.fdi_typed} optional />` replaces the Tooth input. The Day taken field stays.
- **`[patient].astro`**:
  - Next to `<VisitPanels …/>`, render `{canEdit && <TreatmentPanels … openNow={openNow === 'done'} />}` and `{canEdit && <NotePanel … defaultTeeth={noteTeeth} openNow={openNow === 'note'} />}`.
  - `Treatment` and `Notes` lose the moved props.
  - The Chart section gets:
    - `{fromChart && saved && CHART_SAVED[saved] && <Callout tone="success" text={CHART_SAVED[saved]} />}` after the Banner;
    - `<Odontogram … actions={canEdit} work={chartWork} />`;
    - `{babyWork && <p class="mt-3 text-[13.5px] text-ink-2">Work on baby teeth is in Treatment; this chart shows permanent teeth only.</p>}` under the chart.

**`src/components/Odontogram.astro`**: additions only, plus one clause in `describe()`. `lay`, `say`, `tell`, `refresh`, `commit`, `keep`, `settle`, `notKept`, `ask` and `check` stay as they are.

- **Props:**
  - `actions?: boolean` (default `false`);
  - `work?: Partial<Record<number, { plan: string[]; done: string[] }>>` (default `{}`; permanent teeth only).
- **Server `tooth()`**: add `plan` and `done` from `work[fdi]`, and `workWords`:

  ```ts
  [plan.length ? `On the plan: ${plan.join('; ')}.` : '', done.length ? `Treated in the past year: ${done.join('; ')}.` : ''].filter(Boolean).join(' ')
  ```

  Server `describe()` puts `workWords` before "Activate to edit."
- **Tooth `<button>`**, new attributes:
  - `data-tooth-work` = `'plan'`, `'done'`, `'plan done'` or absent;
  - `data-tooth-work-words` = `workWords` (absent when there is none).
- **In the tooth's column `div`, after the `[data-label]` span:**

  ```html
  <span class="tooth-marks" data-tooth-marks aria-hidden="true">
    {t.plan && <span class="tooth-mark-plan"></span>}
    {t.done && <span class="tooth-mark-done"></span>}
  </span>
  ```

  `.tooth-marks` is always present at `height: 10px`. In both arches it sits on the midline side, because of the existing `flex-col` / `flex-col-reverse`.
- **Legend**: when `Object.keys(work).length`, two items with `.tooth-mark-plan` and `.tooth-mark-done` swatches: "On the plan" and "Treated in the past year".
- **`<style>`** (component-scoped):

  ```css
  .tooth-marks { display: flex; gap: 3px; justify-content: center; align-items: center; height: 10px; }
  .tooth-mark-plan { width: 8px; height: 8px; border-radius: 999px; border: 2px solid var(--c-ink-2); }
  .tooth-mark-done { width: 8px; height: 8px; border-radius: 999px; background: var(--c-ink-2); }
  ```

- **Palette**: when `actions`, after "Clear this tooth":

  ```html
  <div data-pick-block class="mt-4 border-t border-line pt-3.5">
    <p class="meta" data-pick-title>For tooth</p>
    <div class="mt-2 grid grid-cols-3 gap-1.5" data-pick-acts>
      <button type="button" data-pick-open="rec-plan-add" data-pick-fdi="" data-pick-surfaces="" class="min-h-11 cursor-pointer border border-line px-1.5 py-1.5 text-[12.5px] leading-tight font-medium">Add to plan</button>
      <button type="button" data-pick-open="rec-done-add" data-pick-fdi="" data-pick-surfaces="" class="…same…">Treatment done</button>
      <button type="button" data-pick-open="rec-note-add" data-amends="" data-pick-fdi="" data-pick-surfaces="" class="…same…">Clinical note</button>
    </div>
    <p data-pick-offline hidden class="mt-2 text-[13px] leading-snug text-ink-2">Planning, recording and notes need the connection. Findings still save on this device.</p>
  </div>
  ```

  - The buttons use `data-pick-open`, **not** `data-ws-open`, so the shell never picks a hidden palette button as the opener of a panel it draws open (`shell.ts` uses the first `[data-ws-open="<id>"]` in the page).
  - `patients.css`'s `.pt-chart [data-palette] button` already draws them soft and quiet.
- **Client script:**
  - `describe(b)` inserts `b.dataset.toothWorkWords`, when present, before " Activate to edit.", **for every chart**, whether or not the pick block exists. `paint()` and the notation handler already call it.
  - Only when `[data-pick-block]` exists:
    - `let heard: 'waiting' | 'yes' | 'no' = 'waiting';`
    - `syncPick()`:
      - sets each `[data-pick-fdi]` to `fdiOf(active)`;
      - sets each `[data-pick-surfaces]` to `surfaceSummary(fdi, [...picked])`;
      - sets the title to `For ${notation === 'fdi' ? '' : 'FDI '}${fdi}${codes ? ' ' + codes : ''}` and the aria-labels from §1.2;
      - `const away = !!copyAt || navigator.onLine === false || heard === 'no'; acts.hidden = away; offlineLine.hidden = !away;`.
    - At the end of `openPalette()`:

      ```ts
      heard = 'waiting'; syncPick();
      const mine = asked;
      mine.then((w) => { if (asked === mine) { heard = w === undefined ? 'no' : 'yes'; syncPick(); } });
      ```

      `ask()` → `serverWho()` resolves `undefined` when no answer came within its 4-second limit.
    - Call `syncPick()` at the end of `syncSurfaces()`. Add a separate `online`/`offline` listener that calls `syncPick()` if the palette is open.
    - A click on any `[data-pick-open]`:

      ```ts
      palette.hidePopover();                               // before showModal: a popover over a modal would sit on top
      window.ws?.openPanel(btn.dataset.pickOpen!, btn);    // detail.opener = btn; the panel returns focus to the tooth (above)
      ```

**Hook names.** All are new. A repo grep today finds no `data-pick*`, `data-tp*`, `data-tooth-work*`, `data-tooth-marks`, `data-plan-fdi`, `data-fee-surfaces` or `data-chart*`.

- `data-fdi` and `data-surface` are not reused on the new controls; the chart owns them.
- Scripts read a tooth only with the scoped selector `[data-odontogram] button[data-tooth][data-fdi="N"]`.
- Anything shown later by script is toggled with the `hidden` attribute, never the class.

### Step 2

**`TreatmentPanels.astro`:**

- Fee `<option>`s get `data-chart-effect={x.effect ?? ''}`, and `data-fee-surfaces` follows the effect (§4 Step 1).
- `rec-done-add` gets, under the ToothPick:

  ```html
  <div data-chart-line hidden>
    <label class="…44px row…"><input type="checkbox" name="chart" value="1" disabled data-chart-line-tick /> <span data-chart-line-words></span></label>
    <p class="text-[13px] text-ink-2" data-chart-line-now></p>
    <input type="hidden" name="chart_from" value="" disabled data-chart-line-from />
    <input type="hidden" name="chart_base" value="" disabled data-chart-line-base />
    <input type="hidden" name="sid" value={chartSid} disabled data-chart-line-sid />
  </div>
  <p data-chart-line-point hidden class="text-[13.5px] text-ink-2"></p>
  ```

  - The box is **never** rendered `checked`.
- Its script runs on open, on `tp:change` and on the fee pick's `change`:
  1. Read the tooth button `[data-odontogram] button[data-tooth][data-fdi="N"]`: `data-state`, `data-surface-condition` and `.pip[data-on]` give the `LiveMark`, and `data-waiting` says whether a change is waiting.
  2. `o = chartOffer(effect, fdi, letters, live)`.
  3. `apply` on a tooth with no waiting change:
     - show the line and fill the words;
     - set `chart_from = markKey(live)` and `chart_base` = the root's `data-rendered-at`;
     - **enable** the box and the three hidden fields;
     - untick the box whenever the offer differs from the last one shown.
  4. `point` or `baby` → show the point sentence.
  5. A waiting tooth → the waiting sentence, with no box.
  6. In every case except 3: hide the line, **disable and untick** the box and **disable** the hidden fields, so none of them is posted.
  - It imports `chartOffer`, `markKey` and `offerWords` from `src/lib/chart-offer.ts`.

**`Treatment.astro`:** add `<slot name="offer" />` right after its saved callout and inline problem.

**New: `_record/ChartOffer.astro`**

- **Props:** `{ state: OfferState | null; skip: 'changed' | 'ended' | null; problem: RecordProblem | null; action: string; sid: string; visitId: string | null; back: 'chart' | 'treatment'; leaveHref: string; inChart: boolean }`.
- **Root:** `<div id="chart-offer" data-chart-offer>`, holding, in order:
  - the red problem callout, if there is a problem;
  - the amber `skip` line, if there is one;
  - the one Callout for the state (§1.5's words). With a problem, the red callout comes alone.
- **The offer's form:**

  ```html
  <form method="post" action={`${action}?treated=${state.treatedId}${back === 'chart' ? '&back=chart' : ''}#chart-offer`}><Csrf />
    <input type="hidden" name="intent" value="chart-apply" />
    <input type="hidden" name="treated" value={state.treatedId} /><input type="hidden" name="from" value={markKey(state.now)} />
    <input type="hidden" name="base" value={state.base} /><input type="hidden" name="sid" value={sid} />
    <input type="hidden" name="back" value={back} />{visitId && <input type="hidden" name="visit" value={visitId} />}
    <button class="ws-btn ws-btn-quiet">Update the chart</button></form>
  ```

  - The query in `action` means a refused post, re-drawn at that address, still has `?treated=` and `back`. The page also renders the problem whenever `recordProblem.intent === 'chart-apply'`.
- **The point buttons** are `<button type="button" class="ws-btn ws-btn-quiet" data-chart-open={fdi}>Open {fdi} on the chart</button>`. The script:

  ```ts
  document.getElementById('rec-rec-chart-tab')?.click();
  const t = document.querySelector(`[data-odontogram] button[data-tooth][data-fdi="${fdi}"]`);
  t?.scrollIntoView({ block: 'center' }); t?.click();
  ```

- **Offline:** `[data-chart-offer-offline]`. The same script hides the form while `navigator.onLine === false` or on the kept copy. The form posts hidden fields only, so a post that fails in a brownout loses nothing typed.

---

## 5. What must not change

- **Byte-for-byte.** `git diff main -- src/pages/api/chart.ts src/lib/offline-queue.ts public/sw.js src/components/ws/shell.ts` is empty after both steps.
  - This covers the offline ledger, the conflict answers, the kept copy, the sign-in lock and the panel shell.
  - `chartSession` is imported from `api/chart.ts`, which already exports it; nothing in that file changes.
- **Odontogram behaviour.** These all behave exactly as today: the finding buttons, Clear chart, the waiting corner (`.tooth[data-waiting]::after`), the notices, Save/Delete of earlier sign-ins, the status line and arrow-key movement. The diff to its script is additive, plus the one `describe()` clause (§4).
- **No chart change without a tap.**
  - Nothing writes `tooth_state` except `/api/chart` and, in Step 2, `chartFromRecord`, after an explicit tap (Update the chart, or the ticked box) on a page drawn under this sign-in.
  - Mark done, and Record a treatment with the box unticked, write no chart rows.
- **Old-shaped posts still work.** A kept copy of the page posting `fdi=36` as text, `surface=MOD` as text or `teeth=16 17` as text is read exactly as before.
- **Insert-only tables.** `procedure_done` and `clinical_note` stay insert-only; grants are unchanged. A signed note is still never edited.
- **Record rules.**
  - Every record post still checks `canEditRecords` in its transaction and audits `record.*`.
  - A refused post still comes back open in its panel. The `PANEL_OF` ids are unchanged: `rec-plan-add`, `rec-done-add`, `rec-note-add` and `rec-file-add`.
  - The `visit` hidden field and `visitOf()` are unchanged.
- **Openers.**
  - The More menu and the This visit strip still open these panels and switch to their section behind (`data-rec-show`).
  - `?open=done` and `?open=note` still open their panels.
  - Treatment's own Mark done forms are unchanged.
- **Treatment record.** `VisitPanels`, `loadVisits` and `buildLedger` are untouched. A chart write from Step 2 appears in Chart → "Changes to the chart" as an ordinary chart change.
- **Design.**
  - One teal button per screen: the record's teal stays *New booking*. All new buttons are quiet.
  - The chart stays on the patient record only, never on the home page.
  - Sentence case everywhere. No Swiss markup is added: the palette block uses the classes `patients.css` already softens.
- **Roles.** The 7-role × 20-page snapshot (`snap.mjs`/`cmp.mjs`) must differ only by the expected changes:
  - the tooth and surface fields;
  - the three palette buttons and the panel's Mark done forms, for roles with `records.edit`;
  - the panels' new place in the DOM;
  - the tooth aria-labels' work sentence;
  - in Step 2, the new ChartOffer only when `?treated=` is present.

---

## 6. Verification plan

**Setup:**

1. `npm run db:setup`.
2. `npm run build`.
3. Serve the built app on `127.0.0.1:4399`.
4. Use Playwright with `/opt/pw-browsers/chromium`.
5. Sign in at `/auth/login/?any=1` as `liwayway.domingo@example.com` / `flossify` (owner and clinician, session-road).

**Other seeded accounts** (the seed turns a name into an address, and "ñ" becomes "."):

- Dr. Ramon Cariño: `ramon.cari.o@example.com`. In SQL, select him by `slug = 'ramon-carino'`.
- Dr. Hazel Tabanao: `hazel.tabanao@example.com`, session-road.

**The seed patients used below** (`demo.ts`):

- **Maria Liza Dela Cruz**: 26 caries MO, 36 crown, 46 root canal, 16 filled O, 45 sound.
- **Joel Bautista**: 47 caries D, 37 filled MOD.
- **Anna Patricia Reyes**: age 12.

The script is `tooth-first-check.mjs` in the session scratchpad (not committed).

### Step 1, Playwright

1. **Palette block.** Maria `#chart` → click tooth 26.
   - `[data-pick-block]` is visible, and `[data-pick-title]` reads "For 26 MO".
   - There are three buttons, each with a `getBoundingClientRect()` of at least 44×44.
   - None has the teal fill as its computed background, and none carries `data-ws-open`.
2. **Add to plan.**
   - Click **Add to plan**.
   - `#rec-plan-add[open]`, `#rec-chart` has no `hidden`, and `#rec-treatment` is `hidden`.
   - `input[name=fdi][value="26"]:checked`, no surface is checked yet, and `[data-pick-back]` value is `chart`.
   - Choose Filling → M and O become checked.
   - Choose Extraction → no surface is checked.
   - Choose Filling again → M and O are checked.
3. **Save the plan.**
   - With Filling chosen, submit.
   - The URL is `?saved=plan&back=chart#chart`, and the Chart section shows "Added to the plan…".
   - Tooth 26 has `data-tooth-work~="plan"`, and `.tooth-mark-plan` is visible under 26.
   - The aria-label contains "On the plan: Filling MO".
   - SQL: `select fdi, surface, name, status from treatment_plan_item where patient_id = '<maria>' order by created_at desc limit 1` → `26 | MO | Filling | planned`.
4. **Treatment done, not planned.**
   - Joel `#chart` → 47 → **Treatment done** → Extraction → save.
   - SQL: `select fdi, surface from procedure_done where patient_id = '<joel>' order by created_at desc limit 1` → `47 | null`. The finding's D was not copied.
   - `.tooth-mark-done` is under 47.
   - The chart finding is unchanged, because Step 1 writes no chart rows: `select count(*) from tooth_state where patient_id = '<joel>' and fdi = 47 and superseded_at is null and condition = 'caries'` → 1.
5. **Treatment done, planned.**
   - Maria 26 → **Treatment done**. The panel shows "On the plan for 26:" and **Mark done: Filling MO** (the plan item from step 3).
   - Tap it → the URL is `?saved=plan-done&back=chart#chart`, and the Chart shows "Marked done, and added to treatments done."
   - SQL: the item's `status = 'done'`.
   - Exactly one new `procedure_done` row for 26, with `plan_id` set, and no other new row.
6. **Clinical note.**
   - Maria 26 → **Clinical note**.
   - The title is "New clinical note", and only `input[name=teeth][value="26"]` is checked.
   - Save → `select teeth from clinical_note order by created_at desc limit 1` → `{26}`.
   - Then open **New note** from Notes → `[data-pick-back]` value is `''`. Save → the URL hash is `#notes`, not `#chart`.
7. **Default teeth.**
   - With Maria's strip visit today and a treatment recorded on 36 at it: New note from Notes → 36 is checked.
   - **Add an addendum** → no teeth are checked.
8. **Focus.**
   - Open a panel from the palette, then press Escape → `document.activeElement` is `button[data-tooth][data-fdi="26"]`.
   - Post a refused plan from the chart (step 9), then press Escape → again the tooth.
   - Open More → Add to treatment plan, then press Escape → `document.activeElement` is not `body`.
9. **Typed fallback.**
   - Type "36" in `[data-tp-typed]` → radio 36 is checked. Tap tile 26 → the typed box is empty. Type "36", then tap **Whole mouth** → the typed box is empty.
   - Type "99" and submit → the refusal sentence, with `#rec-plan-add[open]` over the Chart section (`current` is chart) and the typed box still holding 99.
   - **Clash**, with scripts off: pick 26, type 36 and submit → "26 is picked and 36 is typed. Keep one of them. Nothing was added." No row is added.
10. **Baby teeth.**
    - Anna → Treatment → Record a treatment → **Baby teeth** (`aria-expanded` becomes true, and `[data-tp-baby]` loses `hidden`) → 55, Extraction → save.
    - `procedure_done.fdi = 55`, there is no mark on the chart, and the line "Work on baby teeth is in Treatment…" is visible.
11. **Scripts off.** In a `javaScriptEnabled: false` context, the record HTML contains:
    - **53** `input[name=fdi]` in each single picker (`#tp-plan`, `#tp-done`, `#tp-file`): 32 + 20 + the pill;
    - 52 `input[name=teeth]` in `#tp-note`;
    - no `hidden` attribute on `[data-tp-baby]`;
    - `input[name=fdi_typed]`.
12. **Offline and brownout.**
    - `context.setOffline(true)` on Maria → tap 26 → `[data-pick-acts]` is `hidden` and `[data-pick-offline]` is visible.
    - Caries O on 26 still marks "Will sync".
    - Back online, reopen → the actions are visible.
    - **Brownout:** online, with `page.route('**/api/chart', (r) => r.abort())` → tap 26 → within 5 s `[data-pick-acts]` is hidden and the line shows.
13. **Kept copy.**
    - Load Maria → go offline → reload (the service worker's copy, `html[data-offline-copy]`) → tap 26 → the actions are hidden.
    - Run the 025 offline chart checks again end to end. They must pass unchanged.
14. **No `records.edit`.**
    - `update staff_access set can_edit_records = false where staff_id = (select id from staff where slug = 'ramon-carino') and clinic_id = (select id from clinic where slug = 'session-road')`.
    - Sign in as Ramon → `[data-pick-block]`, `#rec-plan-add` and `[data-plan-fdi]` are absent.
    - Two seconds after load, tooth 26's `aria-label` still contains "On the plan:", or "Treated in the past year:" after step 5.
    - A forged POST `intent=plan-add&fdi=26` → "Your role cannot change records at this branch. Ask the owner." The row count is unchanged.
15. **Phone widths** (390×844 and 360×800, light and dark via `localStorage.theme`), for each open panel:
    - `document.documentElement.scrollWidth <= innerWidth`;
    - `[data-tp].scrollWidth <= [data-tp].clientWidth`;
    - every `.tp-t` is at least 44×44;
    - the four permanent blocks are stacked (their `getBoundingClientRect().left` values are equal), each in chart order (tile 21's top is above tile 25's).
16. **At 1440**, *Add to plan* shows two blocks per row, mirrored:
    - tile 25's left equals tile 21's left, and 25's top is above 21's;
    - tile 11's right edge plus 16px equals tile 21's left edge;
    - tile 41's right edge plus 16px equals tile 31's left edge.

### Step 2, SQL

- `select code, chart_effect from procedure_catalog where clinic_id = (select id from clinic where slug = 'session-road') order by code`:
  - restoration → filled
  - sealant → sealant
  - rootcanal → root_canal
  - crown → crown
  - extraction → missing
  - wisdom → missing
  - veneers → veneer
  - everything else → null.
- After a new clinic signs up at `/start/`, the same seven are set (the trigger).
- A service added in Settings with code `night-guard` → null.

### Step 2, Playwright cases

Each case uses Mark done or Record a treatment (box unticked), then the callout.

| # | Patient / tooth | Treatment | Expected | After **Update the chart** |
|---|---|---|---|---|
| a | Maria 26 (caries MO) | Filling MO | "Chart 26 MO as filled. Now: caries MO." | live rows: 26 mesial filled, 26 occlusal filled |
| b | Maria 26 | Filling M | uncovered: "…caries on O…" + Open 26 | — (nothing written) |
| c | Maria 46 (root canal) | Crown | other: "46 shows root canal…" | — |
| d | Joel 47 (caries D) | Extraction | "Chart 47 as missing. Now: caries D." | 47 missing, null surface |
| e | Joel 37 (filled MOD) | Filling D | no callout; URL has no `treated` (same) | — |
| f | Maria 16 (filled O) | Filling M | "Chart 16 MO as filled. Now: filled O." | 16 filled M + O |
| g | Anna 55 | Extraction | no callout; URL has no `treated`; before saving, the panel showed the baby sentence | — |
| h | Maria 45 (sound) | Filling, no surfaces | no-surfaces + Open 45 | — |

For **a**:

- `select outcome, staff_id, clinic_id, payload->>'procedure', device_seq from sync_change where entity_id = '<maria>' order by received_at desc limit 1` → `applied | <liwayway> | <session-road> | <treated id> | 1`.
- The live `tooth_state` rows for 26 have `change_id` equal to that row and `procedure_id` = `<treated id>`.
- `audit_log` has `chart.update` for Maria.
- Chart → "Changes to the chart" lists the change.
- Re-posting the same form (a resend) → no second `sync_change` row.

Further cases:

- **Colleague conflict.**
  - Context A: Mark done Filling MO on 26 → the offer.
  - Context B (Ramon, `records.edit` turned on again): chart 26 as filled O through the palette.
  - A: **Update the chart** → "26 changed since this page showed it: Dr. Ramon Cariño charted it at …. The chart was not changed."
  - The live rows are still B's.
- **Tablet offline.**
  - Context C (**Hazel**) draws Maria's chart, goes offline, and taps 26 caries MOD ("Will sync").
  - A (Liwayway) applies offer **a**.
  - C goes online → the notice reads "Your change to tooth 26 was not saved: Dr. Liwayway Domingo saved a change to it at … that your chart was not showing. The chart shows theirs now."
  - The live rows are still A's.
- **Ended sign-in.**
  - One browser context. Liwayway opens Maria's offer **a** in tab 1.
  - In tab 2 she signs out, and Hazel signs in.
  - Tab 1: **Update the chart** → the page shows the **ended** line and a fresh offer. There is no new `sync_change` row, and the live rows for 26 are unchanged.
  - The same with the Record a treatment box ticked on a stale tab → the `procedure_done` row is saved, and no chart rows are written.
- **Inline line.**
  - Joel → Record a treatment → Extraction, tooth 47 → `[data-chart-line]` is visible and the box is **unticked**: "Chart 47 as missing".
  - Save → no chart rows, and the follow-up offer appears.
  - Repeat with the box ticked → applied in the same post, and the callout says "Chart updated: 47 missing."
- **Disabled fields.**
  - Joel → Record a treatment → Extraction on 47 (the line shows), then pick 11 (veneer: *other*).
  - `new FormData(form)` has no `chart`, `chart_from`, `chart_base` or `sid`.
  - Save → no chart rows.
- **Waiting tooth.**
  - Offline, chart 45 caries O.
  - Come back online before it syncs (hold `/api/chart` with `page.route`).
  - Record a treatment on 45 → the waiting sentence shows. There is no enabled `chart` checkbox, and FormData has no `chart_from`.
- **Refused `chart-apply`** with a made-up `treated` → the URL keeps `?treated=<made-up>`, and the red callout "That treatment is not on this record any more…" is at `#chart-offer`. No rows are written.

### Both steps: contrast, targets, sideways scroll

Extend `measure.mjs` in the scratchpad with these pages, in light and dark, at 1440 and 390:

- the Maria record at `#chart` with the palette open;
- each of the four panels open, including `rec-done-add` with its Mark done list;
- ChartOffer in each state: offer, applied, uncovered, changed, ended, offline and refused.

Expected results:

- Every text node is at least 4.5:1 against its composited background.
- `.tooth-mark-plan`'s border and `.tooth-mark-done`'s fill are at least 3:1 against the chart card.
- The checked `.tp-face` border is at least 3:1 against the panel.
- Every button, label and link is at least 44×44.
- `scrollWidth <= innerWidth`.
- **Keyboard:**
  - Tab from "Clear this tooth" reaches Add to plan → Treatment done → Clinical note.
  - In a picker, the arrow keys move within the radio group in the chart's order.
- **7-role snapshot:** run `snap.mjs` and `cmp.mjs` before and after each step. The only differences are those listed in §5.

---

## 7. Effort and risks

**Effort.**

- Step 1 is **M**: about 5 days including measurement. It includes the panel's Mark done list, the focus fallback and the mirrored layout.
- Step 2 is **M**: about 4 days. It includes the sign-in binding and the disabled fields.
- Together they are **L**, as verifier 1 estimated for the full scope.

**Risks:**

- **Odontogram.astro is 1,114 lines of offline-critical code.**
  - Keep the diff additive, as §4 lists, plus the one `describe()` clause.
  - Review the script diff line by line.
  - Re-run the 025 offline checks.
  - Confirm the §5 empty `git diff`.
- **The panels move out of `#rec-treatment` and `#rec-notes`.**
  - Any selector that assumed they were inside those sections breaks. A grep today shows only `PANEL_OF`, the More menu and VisitStrip, which open by id.
  - The role snapshot catches anything else.
- **The popover and the modal dialog.**
  - The palette hides itself, then calls `window.ws.openPanel`. The popover is always closed before `showModal()`, whatever order the click handlers run in.
  - Focus return goes through each panel's own `ws:panel-close` fallback, because the palette button is not rendered after the popover closes.
- **The content check versus the time rule.** `chartFromRecord` refuses whenever the tooth differs from what the person was shown.
  - That is stricter than necessary in one direction: a change made and then undone is allowed, because the person saw the current finding.
  - It is safe in the other direction: it never replaces an unseen finding.
  - The ledger row still protects every open chart, through `/api/chart`'s `received_at` rule.
  - The sign-in check (step 0) keeps the chart's rule that a page belongs to the sign-in it was drawn under.
- **Brownouts.**
  - The palette's actions hide when the device knows it is offline, or when the chart's own server check gets no answer.
  - A line that fails after that check shows the browser's error page on the panel's post. The page says only what it can know.
- **Notation.** The picker and the record use FDI.
  - A clinic on Universal or Palmer sees "For FDI 36 MO" in the palette, "(FDI)" in the picker's legend and label, and FDI numbers on the tiles.
  - A notation-aware picker is left out.
- **Chart effect is limited to the seven default codes.**
  - Services a clinic added itself get no offer, and no surfaces carried over from the chart.
  - Setting the effect in Settings → Services & fees is a follow-up, with its own form and audit line.
  - A code's meaning is never guessed from its name.
- **Migration order.** See Numbering. The migration merges only after 039, 040 and 041 (or 041 is confirmed unused), or it is renamed above them. Render's pre-deploy `db:migrate` has no `--allow-late`.
- **The Treatment record (`18a4017`)** is on the working branch after `d07558b`.
  - It replaced the Timeline, moved the chart's history into the Chart section, and changed `?visit=`.
  - It does not touch `recordAction` or `loadClinical`'s selects. Build both steps on top of it.
- **Records correctness.**
  - The table in §1.5 is deliberately cautious. Anything that would hide a different whole-tooth finding points to the chart instead of writing.
  - A dentist should read the effect mapping and §1.5's sentences before a clinic depends on them. The owner has already asked for that for the aftercare words.
  - Two questions for that dentist:
    - Should a crown recorded over a charted root canal be offered, since the chart can show only one? Today it is *other*: open the tooth and choose.
    - Should several offers from one visit be gathered into one? Each Mark done today brings its own callout.
- **Docs.** Update `CLAUDE.md`:
  - "The clinical record (033)": one bullet on tooth-first entry. It covers the picker, the palette's actions and Mark done, the marks, and the chart offer with its rules: a tap only, never automatic; the content check; the sign-in check; the box always unticked.
  - The Layout list: `042` (or its final number), `chart-offer.ts`, `chart-write.ts`, `ToothPick`, `toothpick.ts`, `TreatmentPanels`, `NotePanel` and `ChartOffer`.

---

## Review notes

Each objection was checked against the code at `18a4017`.

| # | Objection | Verdict | What changed |
|---|---|---|---|
| 1 | Step 2's chart writes ignore the chart's sign-in binding | **Holds.** `csrf.ts` keeps a 30-day cookie with no rotation at sign-in or sign-out; `api/chart.ts` refuses a `sid` mismatch as `'session'`; the new form posts would not. | Fixed. The page passes `chartSession(session)` as `Ctx.sid`, and a hidden `sid` goes in both forms. `chartFromRecord` step 0 answers `ended` and writes nothing. The **ended** state (§1.5) and a verification case (§6) are added. The treatment in `done-add` still saves, as every record form does today. |
| 2 | The pre-ticked line makes the chart change opt-out | **Holds.** It contradicts the spec's own "only when the dentist confirms it". | Fixed. The box is never rendered checked, and each new offer starts unticked (§1.5, §4). The Inline line case now expects no chart rows by default. |
| 3 | ChartOffer's form cannot work; a refusal has nowhere to show | **Holds.** `treated` had no value. `recHere` is `here`, with no query. Outside `!canEdit`, a record problem shows only in a panel. | Fixed. The form carries `value={state.treatedId}` and the action carries `?treated=…&back=…`. ChartOffer renders whenever `recordProblem.intent === 'chart-apply'`. `backTo = postedBack ?? …`, so the rate-limit sentence lands there too. |
| 4 | The finding's surfaces are copied into whole-tooth treatments | **Holds.** `openPalette` seeds `picked` from the finding. Surfaces print on the Treatment record and the statement. | Fixed. The tooth's surfaces are a suggestion, ticked only with a filling or sealant: `code` in Step 1, `chart_effect` in Step 2 (§1.1, §4). Step 4 checks `surface is null`. Not taken: disabling the toggles, because a clinic's own services may need them. |
| 5 | Planned work sends the dentist to Treatment and risks a duplicate `procedure_done` | **Holds.** | Fixed. `rec-done-add` lists the picked tooth's open plan items, each with a one-tap Mark done form (the same post, with `back=chart`). "Go to the plan" is dropped. There is a verification step 5. |
| 6 | The hidden line's fields are still submitted | **Holds.** The `hidden` attribute does not remove fields from a submission. | Fixed. The box and all hidden fields are disabled (and the box unticked) whenever the line is not in its offer state (§4). A Disabled fields case is added. |
| 7 | The migration-order rule forgets 041 | **Holds.** `migrate.ts` refuses late files; Render's `preDeployCommand` runs `db:migrate` with no flag. | Fixed. The Numbering paragraph and §7 now say: after 039, 040 and 041 (or 041 confirmed unused), else rename above them. |
| 8 | The work sentence is erased from the aria-label for people without `records.edit` | **Holds.** `refresh()` → `lay()` → `paint()` → `describe()` runs at load. | Fixed. The client `describe()` always appends `data-tooth-work-words` (§4). Step 14 checks it as Ramon. |
| 9 | The 2×4 blocks do not mirror across the midline | **Holds.** | Fixed. At 400px and wider, the upper-left and lower-right blocks fold by `grid-row`, so 11\|21 and 41\|31 meet at the centre. DOM order stays the chart's, and stacked blocks keep the chart's reading order (§1.1, §4 CSS, step 16). Not the single row of 8: 380px does not fit a 358px (or 328px) phone panel. |
| 10 | The typed box and the radios can disagree | **Holds.** | Fixed. A person's change to any radio, the pill included, empties the typed box. The server refuses a clash with "26 is picked and 36 is typed. Keep one of them." (§1.1, §3, step 9). |
| 11 | Panel state leaks, and focus is lost | **Holds, all three.** `shell.ts` auto-opens with the first `[data-ws-open=id]`, which would be the hidden palette button. | Fixed. `back` resets on every open that is not a pick. The palette uses `data-pick-open` with `window.ws.openPanel`, so it is never the auto-opener. Each panel has a focus fallback on `ws:panel-close`. "Go to the plan" is removed. |
| 12 | Two "Or type it" labels, and "as on the chart" is wrong under another notation | **Holds for the words.** | Fixed. The labels read "Or type the tooth number (FDI)", with the legend "Tooth (FDI)" and help that starts "FDI numbers." Not taken: a chart number under each tile, which would be under 12px in a 44px tile. The notation-aware picker stays out of scope (§7). |
| 13 | `navigator.onLine` stays true in a brownout | **Holds.** Odontogram's own comment says so. | Fixed. The palette also hides its actions when the chart's existing `ask()` / `serverWho()` check gets no answer (§1.2, §4, step 12). The claim is reworded to what the page can know. ChartOffer keeps `onLine`, because its post carries hidden fields only and loses nothing typed. |
| 14 | Verification steps would fail | **Holds, all three.** The seed gives `ramon.cari.o@example.com`; there are 53 radios with the pill; the tablet notice would read "you" if C were Liwayway. | Fixed. Ramon is selected by slug, 53 radios are expected, C is Hazel, and names are given as the staff row writes them ("Dr. …"). |
| 15 | The ledger insert misses `clinic_id`; `base` is not validated | **Holds.** `sync_change.clinic_id` is not null with no default. | Fixed. `clinic_id = ctx.clinicId` (§2). `base` is used only when it is finite, greater than 0 and not later than a minute past now; otherwise it is `null` (§3). |
| 16 | The follow-up callout will often be noise | **Partly holds.** | Fixed: *baby* (and *same*) no longer redirect to a callout (`calloutWorthy`); the chart's own line says baby teeth are in Treatment. Not changed: *no-surfaces*, which is the only sign the chart is behind, with one tap to the tooth. Not changed: crown over root canal stays *other*, a verifier condition never to hide a different whole-tooth finding without a choice on the chart; it is now a question for the reviewing dentist (§7). Gathering one visit's offers is listed as a follow-up question. |
| 17 | `:has()` alone shows the chosen tile | **Holds in part.** The site already uses `:has()` for layout, and an iPad that runs iPadOS 15 can update past 15.4. But here `:has()` would carry the chosen state, and the fix costs nothing. | Fixed. `input + .tp-face` / `.tp-pill`, as the chart's notation control does (§4). |