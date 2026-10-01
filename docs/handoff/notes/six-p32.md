# Booking from the slot she tapped: hold that time, no Dentist step at a one-dentist clinic, and say when the time no longer fits (p32)

**Scope.** This covers two places. Most of it is the patient booking at `/find/<slug>/book/`, which patients reach from the "Next open" times on `/find/`. The other part is the desk's booking panel on the workspace calendar.

- **The calendar already starts a booking at the tapped time.** On a desk or tablet (768px and wider), tapping a lane opens New booking at that time and on that chair or dentist (`openBook({ ymd, min, col })` in `src/components/ws/cal/panels.ts`). That stays as it is.
- **The calendar does not yet skip the dentist at a one-dentist clinic.** Its Dentist field starts on "Any dentist" for anyone except a treating dentist, so desk bookings are saved with no dentist. §3.5 fixes this with one change to `openBook`.
- **On a phone, the calendar is a list and has no lanes to tap.** Tapping a free time on a phone belongs to the separately confirmed "Slot suggestions" item, not to this spec.

**No migration.** This spec needs none. 039, 040 and 041 are not touched.

The spec was written against `main` @ d07558b and re-checked at `main` @ 18a4017. Between the two commits, none of the files this spec edits changed, except for one comment line in `panels.ts`, so every line number below still holds. These findings hold:
- `const steps = [...]` is a constant (book.astro:25).
- The page opens with `show(0, false)` (book.astro:407).
- The only preselect of `?slot=` is in the painted DOM, inside `paintSlots` (book.astro:258-262).
- `dentists.length` is never checked.
- `validate` is index-based (`i === 2`, `i === 3`), and the 409 path calls `show(2)`.
- `booking.slot` is `val('slot')` (book.astro:362). The calendar file's `DTSTART` is built from it (book.astro:375).
- `/find/` writes `?slot=` with no reason (find/index.astro:189). Its cards check each time for 30 minutes (`openSlots(l, { limit: 3 })`, find/index.astro:27; `slotsFor`'s default, availability.ts:84).
- `.pt-steps` uses `repeat(5, …)` (patient.css:231). `clinic-glass.css:324-330` only sets gap and padding and has no column rule.
- `main.dataset.phone` IS used, in the request's done text (book.astro:370). Only the empty state has no call action.
- The desk's Dentist field defaults to `ctx.filter()` (panels.ts:622). That is `''` ("Any dentist") for anyone who is not a treating dentist (board.ts:107). The by-dentist view puts every visit with no dentist in its own "No dentist" column (model.ts:236).
- The reminder texts add " with <dentist>" whenever the appointment has a dentist and the text still fits (`sms_reminder_body` in 019, `sms_remind48_body` in 036:35-54).

---

## 1. What the clinic and the patient see

### Patient: the steps

| Clinic | Opened with `?slot=` (a time tapped on /find/) | Opened without it |
|---|---|---|
| One dentist on its public page ("solo") | Reason → Who → Confirm (3) | Reason → When → Who → Confirm (4) |
| No public dentist | Reason → Who → Confirm (3) | Reason → When → Who → Confirm (4) |
| Two or more dentists | Reason → Dentist → Who → Confirm (4) | Reason → Dentist → When → Who → Confirm (5, as today) |
| Request clinic (not live) | `?slot=` is ignored: the plain flow, with Dentist only when there are two or more | same |

- The progress row shows only the steps in the flow, numbered 1…n with no gaps. It re-numbers when When comes back.
- **When comes back** into the flow in three cases:
  - she taps **Change**;
  - the held time no longer fits;
  - the server answers 409.
- Once she has been on the When step, it stays in the flow for the rest of the visit, so Back always goes where she has been.
- **A step shows its check only when she has completed it.** A When step put back into the flow behind her is drawn as a step still to do, with its number and no check. It is never marked done while the held time does not fit.
- **She never skips When on an old answer.** While a time is held and a newer availability answer is still loading, Continue on Reason or Dentist reads "Checking…" and is disabled until the answer comes. It waits at most 6 seconds. After that she carries on, and the server's check on Confirm decides.

### Patient: the strip ("the held time")

The strip appears only on a live clinic opened with `?slot=`. It sits **inside the glass wizard card**, between the progress row and the step. It is never on the bare room, and it is never sticky or fixed. It stays on every step until the done screen, which hides it.

**While the time holds:** a blue callout (`ws-callout`) with the calendar icon.
- The words are: "Your time: **Wed 24 Sep, 9:30 am** · with Dr. Elena Sarmiento".
  - The day is "Today", "Tomorrow" or "Wed 24 Sep", the same words the /find/ card showed.
  - At a solo clinic, the part after the dot is "· with <name>".
  - At a multi-dentist clinic, it is "· any dentist", or "· with <name>" once she has chosen someone.
  - At a clinic with no public dentist, nothing follows the time.
- A quiet **Change** button sits on the right, and wraps under the words on a phone. It opens the When step with this time still chosen, and it is hidden while she is on When.

**When the time no longer fits:** the same box turns amber (`data-tone="warn"`) and the alert icon replaces the calendar icon. The words become one sentence, so colour is never the only signal:
- Past: "9:30 am on Tue 23 Sep has passed."
- Less than an hour away: "3 pm today is too soon to book online."
- She chose a dentist who is not free then: "Dr. Ramon Cariño is not free at 9:30 am on Wed 24 Sep for consultation, about 30 minutes."
- The visit is longer than the 30 minutes a /find/ card checks a time for: "9:30 am on Wed 24 Sep has no room for root canal (anterior), about 90 minutes." This covers both cases (the time was never long enough, or someone took it), and the sentence is true in both.
- Otherwise (a visit of 30 minutes or less whose time someone took): "9:30 am on Wed 24 Sep is no longer free for consultation, about 30 minutes."

The service name is lower-cased by the same `lower()` rule the confirmation text uses.

What follows the sentence:
- **Free times exist:** " Nearest free:" and two quiet slot-style buttons (`.slot`: a small day over the time). They are the two free times closest to the held one, shown in time order. Tapping one holds it:
  - the strip goes back to blue with the new time;
  - When leaves the flow again, unless she has already been on it;
  - on Confirm, the summary's When row changes to the new time;
  - the focus goes to the current step's question;
  - the live region reads the new line.
- **No free times:** " Nothing else is open in the next two weeks. Call the clinic." and a quiet **Call 0927 555 0500** button (`tel:`, the clinic's own number). The button is left out when the clinic has no phone.
- The Change button reads **See all times** while the strip is amber.

**Continue while amber:** on any step after When, Continue opens the When step, never Confirm. This includes Confirm booking on the Confirm step.

### Patient: other screens

- **Reason, carried from /find/.**
  - With a symptom chosen on /find/, the booking opens with that symptom's chip ticked (for example "Toothache") instead of "Not sure — a check-up".
  - With a service chosen, that service is ticked inside "Or choose the service directly", and the disclosure is open.
  - An urgent symptom, or a service this clinic does not list, opens on "Not sure — a check-up".
  - The price line under Reason follows the choice, as today.
- **Dentist step (multi-dentist clinic, time held).** The help line becomes: "“Any available dentist” keeps the time you tapped. Choosing someone checks they are free then." Without a held time it stays "Choosing one limits the days you can pick."
- **When step empty state.** A quiet call button is added. "Try any dentist" is said only where there is a dentist to choose:
  - A dentist was chosen: "Nothing open with Dr. X in the next two weeks. Try any dentist, or call the clinic." and [Call 0917…].
  - Otherwise: "Nothing open in the next two weeks for this visit. Call the clinic to ask about a time." and [Call 0927…].
- **When step, no strip (plain flow).** Her pick now survives "Show more days", Back, and a change of reason when it still fits. When it no longer fits, an amber callout sits under the slots: `<the same sentence as the strip> Pick another time below.`
- **Confirm summary.**
  - At a solo clinic, the Dentist row shows her name.
  - At a multi-dentist clinic, it shows the chosen name or "Any available dentist".
  - At a clinic with no public dentist, the row is left out.
  - The When row shows the held time's words. It is redrawn whenever the held time changes while she is on Confirm.
- **Done screen, undo, calendar file, "Your bookings on this device":** unchanged. The label, the stored `slot` and the calendar file's start all come from the held time. The `.ics` still reads `DTSTART;TZID=Asia/Manila:20260924T093000`.
- **Page description** (`<Base description>`): "in five short steps" becomes "in a few short steps".

### Clinic: what the desk notices

- **Web bookings at a one-dentist clinic.** Every web booking and request now carries `dentist_id` = that dentist, so it shows in her column in the calendar's "by dentist" view.
- **Online booking at a one-dentist clinic.** Online booking now offers only **her** working days (`staff_schedule`). It never offers a time that overlaps a visit that is hers or unassigned. A two-chair solo clinic can no longer be booked twice at once from the web.
- **The desk's New booking at a clinic with one dentist on its calendar.** This means one treating dentist with a schedule at this branch (`boot.staff`). The Dentist field now starts on **her** instead of "Any dentist". This applies to a lane tap in the chair view, to the New booking button, and to "New booking" on a patient.
  - A tap on a dentist's own column, or on the "No dentist" column, still sets that column.
  - The desk can still change the field to "Any dentist".
  - So the desk's bookings and the web's land in the same column.
- **The reminders now name her.** At that clinic, the day-before and two-day reminders for these visits now read "… on Thu 24 Sep, 9:30 am with Dr. Elena Sarmiento. …". This applies to web bookings and to the desk bookings above.
  - The name is added only when the text still fits in one message.
  - It is the first thing dropped when the text does not fit, before the service name.
  - The reminder functions themselves (019, 036) do not change.
  - My visits (`/me/visits/`) likewise shows "with Dr. Elena Sarmiento" for these visits.
- Multi-dentist clinics, the confirmation and request texts, and every other part of the desk's calendar are unchanged.

---

## 2. Data

**No migration and no grant change.**
- The public solo rule reads `public_directory()` (014) for the dentist list and `public_booked_ranges()` (003) for the busy times. Both are existing definer functions.
- The booking re-check runs inside `withClinic` under the appointment RLS policy, like today's any-dentist count. It left-joins `staff`, which is not under RLS and is already read by slug in the same transaction (bookings/index.ts:191, 224).
- The desk's rule reads `boot.staff`, which the Dashboard already loads (data.ts:186-190).
- `migrations/` stays at 038. 039 (intake), 040 (blocked time) and 041 (PTR) remain reserved.

---

## 3. Server changes

### 3.1 `src/lib/availability.ts` (no Node imports; the page's script uses it too)

Add this after `slotsFor`. It reuses the module's private `addDays` and `fmtHour`:

```ts
export interface SlotWords { at: string; date: string; mins: number; label: string; dayLabel: string }
/**
 * A slot's words from its time as the booking links write it ("2026-09-24T09:30:00+08:00"), labelled the
 * way slotsFor labels one: "Today", "Tomorrow" or "Wed 24 Sep", and "9:30 am". Manila's date and clock,
 * whatever the device's zone. A past time is still given words (the page says it has passed).
 * Null for anything that is not a slot time.
 */
export function slotWords(iso: string, now: Now = manilaNow()): SlotWords | null {
  const m = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d):00\+08:00$/.exec(iso);
  if (!m) return null;
  const d = addDays(m[1], 0);
  if (d.ymd !== m[1]) return null;                       // 2026-02-31 rolls into March
  const utc = (ymd: string) => { const [y, mo, da] = ymd.split('-').map(Number); return Date.UTC(y, mo - 1, da); };
  const diff = Math.round((utc(m[1]) - utc(now.ymd)) / 86_400_000);
  const mins = +m[2] * 60 + +m[3];
  return { at: iso, date: d.ymd, mins, label: fmtHour(mins / 60), dayLabel: diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : d.label };
}
```

### 3.2 `src/lib/directory-db.ts`: the public solo rule, in one place

```ts
/** The clinic's one dentist, when its public page lists exactly one: there, "any dentist" is her. */
export const soloDentist = (l: DbListing): string | null => l.dentistProfiles.length === 1 ? l.dentistProfiles[0].slug : null;
```

In `openSlots` (lines 75-91), replace the dentist and `isTaken` lines:

```ts
const solo = soloDentist(l);
const dentist = opts.dentist || solo;            // any dentist at a one-dentist clinic is her
const dentistDays = dentist ? l.dentistProfiles.find((d) => d.slug === dentist)?.clinics[0].days : undefined;
const isTaken = (ymd: string, start: number, end: number) => {
  const overlapping = busy.filter((b) => b.s.ymd === ymd && b.s.mins < end && b.e.mins > start);
  // Her own visits, and every visit with no dentist or no public dentist on it, are hers; the chairs still count.
  if (dentist && dentist === solo) return overlapping.length >= l.chairs || overlapping.some((b) => b.dentist === solo || b.dentist === null);
  if (dentist) return overlapping.some((b) => b.dentist === dentist);
  return overlapping.length >= l.chairs;
};
```

- This one change covers three callers:
  - the /find/ cards (`openSlots(l, { limit: 3 })`);
  - `GET /api/availability`, with or without `dentist=`;
  - the re-check in `/api/bookings`.

  So the time tapped on a card is the time the booking page checks.
- `public_directory()` lists only dentists with at least one `staff_schedule` row at the clinic (014:27-28). So `dentistDays` is never `[]` for a solo dentist.
- `src/pages/api/availability.ts`: **no change.** Its response still echoes the `dentist` param it was given.

### 3.3 `src/pages/api/bookings/index.ts`

Lines 132-133 become:

```ts
const asked = b.dentist ? l.dentistProfiles.find((d) => d.slug === b.dentist) : null;
if (b.dentist && !asked) return json({ error: 'That dentist is not at this clinic.' }, 400);
const solo = soloDentist(l);
// A booking for any dentist at a one-dentist clinic is a booking with her (openSlots' rule), request or live.
const dentist = asked ?? (solo ? l.dentistProfiles.find((d) => d.slug === solo)! : null);
```

Line 163 is unchanged; it now receives the pinned slug. In the transaction, after the advisory lock (lines 190-203):

```ts
if (l.workspace) {
  const { rows: dentRow } = dentist ? await tx.query('select id from staff where slug = $1', [dentist.slug]) : { rows: [] as any[] };
  if (dentist && dentist.slug === solo) {
    // Her time: nothing of hers, and nothing unassigned, overlaps; and a chair is free. Same rule as openSlots.
    const { rows: busy } = await tx.query<{ n: number; hers: number }>(
      `select count(*)::int as n,
              count(*) filter (where s.slug is null or a.dentist_id = $3)::int as hers
         from appointment a left join staff s on s.id = a.dentist_id
        where a.status not in ('cancelled', 'no_show', 'completed') and a.starts_at < $2 and a.ends_at > $1`,
      [startsAt, endsAt, dentRow[0]?.id ?? null]);
    if (busy[0].hers > 0 || busy[0].n >= l.chairs) return { gone: true as const };
  } else if (dentist) { /* findClash, unchanged */ }
  else { /* chair count, unchanged */ }
}
```

- The insert (line 224 onwards) is unchanged. At a solo clinic, `dent[0]?.id` is now her id, for live bookings and requests alike.
- These are unchanged:
  - the body contract;
  - the 400/404/409/429 answers and their words;
  - the rate limits (`book:ip` 20/h, 5 a day per mobile);
  - the confirmation and request text wording;
  - the consent row.
- The reminder functions are not touched. Their output for these visits now includes " with <name>" when it fits (§1, §5).

### 3.4 `src/pages/find/[clinic]/book.astro`: the server part of the page (frontmatter)

```ts
import { soloDentist } from '../../../lib/directory-db';
import { slotWords } from '../../../lib/availability';
type Step = 'reason' | 'dentist' | 'when' | 'who' | 'confirm';
const STEP_WORDS: Record<Step, string> = { reason: 'Reason', dentist: 'Dentist', when: 'When', who: 'Who', confirm: 'Confirm' };
const chooseDentist = dentists.length > 1;
const solo = dentists.find((d) => d.slug === soloDentist(l)) ?? null;
// A time tapped on /find/. A link written before the time was encoded reads "+08:00" as " 08:00": put the plus back.
const tapped = l.workspace ? slotWords((Astro.url.searchParams.get('slot') ?? '').replace(' ', '+')) : null;
// The reason, in /find/'s own names. A service wins over a symptom; urgent symptoms are not bookable here.
const wantSvc = Astro.url.searchParams.get('service') ?? '', wantSym = Astro.url.searchParams.get('symptom') ?? '';
const preSvc = fees.some((f) => f.id === wantSvc) ? wantSvc : '';
const bookable = symptoms.filter((s) => s.urgency !== 'urgent');
const preSym = !preSvc && bookable.some((s) => s.id === wantSym) ? wantSym : '';
const steps = (['reason', 'dentist', 'when', 'who', 'confirm'] as Step[]).filter((s) => s !== 'dentist' || chooseDentist);
const firstPaint = steps.filter((s) => s !== 'when' || !tapped);
const whoFirst = solo ? ` · with ${solo.name}` : chooseDentist ? ' · any dentist' : '';
```

- Rewrite the header comment (lines 15-19) to begin: "Three to five screens, no account. Reason → (dentist, where there is a choice) → when (skipped while a time tapped on Find a clinic still fits) → who → confirm. …". Keep the rest of that comment.
- No permission keys are involved: this is a public page. There is no new endpoint and no new request. The check reuses the `/api/availability` fetch the page already makes on load and on every change of reason or dentist.

### 3.5 `src/components/ws/cal/panels.ts`: the desk's New booking at a one-dentist clinic

In `openBook`, line 622 becomes:

```ts
// A clinic with one dentist on its calendar books with her, as its web booking does (p32): unless the desk
// tapped a dentist's column or "No dentist", or the calendar is filtered to someone. The desk can still change it.
const soloId = boot.staff.length === 1 ? boot.staff[0].id : '';
fillDentists(B.dentist, ymd, by === 'dentist' && o.col !== undefined ? o.col : (ctx.filter() || soloId));
```

- Every opener goes through `openBook`: a lane tap (board.ts:926), New booking (board.ts:933, 508), `?new=booking` (board.ts:1154), and a patient's New booking (panels.ts:224, 686). So one line covers them all.
- The date-change and walk-in handlers already keep `B.dentist.value` (panels.ts:502, 586).
- On a day she is not in, `fillDentists` keeps her, labelled "· not in on Tue", so the desk sees it.
- `/api/schedule`, `findClash`, `NEXT_STATUS`/`applyStatus`, the columns (`model.ts`) and the phone list are untouched.
- `BookPanel.astro`'s header comment gains: "at a clinic with one dentist on the calendar, her".

---

## 4. Client changes

### 4.1 `src/pages/find/[clinic]/book.astro`: markup

- **`<main>`:** add `data-tapped={tapped ? JSON.stringify(tapped) : undefined}`.
- **Progress** (lines 56-64): render from `steps`, named:
  ```astro
  <li class="wiz-step" data-step-mark={s} hidden={s === 'when' && !!tapped} aria-current={s === 'reason' ? 'step' : undefined}>
    <span class="sec-no">{firstPaint.indexOf(s) + 1 || ''}</span><span>{STEP_WORDS[s]}</span><span class="sr-only" data-step-sr></span>
  </li>
  ```
- **The strip**, between `</ol>` and `<form>`, only `{tapped && …}`:
  ```astro
  <div class="ws-callout cl-callout cl-strip" data-slot-strip>
    <Icon name="calendar" class="cl-strip-ok" /><Icon name="alert" class="cl-strip-warn" />
    <div class="cl-strip-body">
      <p class="cl-strip-line" aria-live="polite">
        <span data-strip-held>Your time: <strong data-strip-when>{tapped.dayLabel}, {tapped.label}</strong><span data-strip-who>{whoFirst}</span></span>
        <span data-strip-say hidden></span>
      </p>
      <div class="cl-strip-alts" data-strip-alts hidden></div>
    </div>
    <button type="button" class="btn btn-quiet cl-strip-change" data-strip-change>Change</button>
  </div>
  ```
- **Fieldsets** get named steps: `data-step="reason" | "dentist" | "when" | "who" | "confirm"`.
- **Reason** preselects on the server:
  - The "Not sure" radio is `checked={!preSvc && !preSym}`.
  - Each symptom radio is `checked={s.id === preSym}`, looping over `bookable`.
  - Each direct-service radio is `checked={f.id === preSvc}`.
  - The disclosure is `<details class="pt-more" open={!!preSvc}>`.
  - Values stay as they are, so the ambiguous `consultation` value is never used to preselect.
- **Dentist:**
  - The fieldset is rendered only when `chooseDentist`. With `tapped`, its help line is the new sentence from §1.
  - When `solo`, render `<input type="hidden" name="dentist" value={solo.slug} />` inside the form instead.
  - With no public dentist, render neither.
- **When:** remove `<input type="hidden" name="slot" />`: the held time lives in the script, and `finish()` reads it from there (§4.2). When `l.workspace && !tapped`, add this after `data-slot-note`:
  `<p class="ws-callout cl-callout" data-tone="warn" data-slot-lost hidden><Icon name="alert" /><span data-slot-lost-words></span></p>`

### 4.2 `src/pages/find/[clinic]/book.astro`: script (replaces lines 206-333 and the parts of `finish` named below)

```ts
import { manilaNow, slotWords, type Now } from '../../../lib/availability';
type Step = 'reason' | 'dentist' | 'when' | 'who' | 'confirm';
type SlotW = { at: string; date: string; mins: number; label: string; dayLabel: string };
const ORDER: Step[] = ['reason', 'dentist', 'when', 'who', 'confirm'];
const LIMIT = 200;
const CARD_MIN = 30;                         // the length a /find/ card checks a time for (slotsFor's default)
const WAIT_MS = 6000;                        // the longest Continue waits for an answer before carrying on
const panes = new Map(Array.from(form.querySelectorAll<HTMLFieldSetElement>('fieldset[data-step]')).map((f) => [f.dataset.step as Step, f]));
const marks = new Map(Array.from(main.querySelectorAll<HTMLElement>('[data-step-mark]')).map((m) => [m.dataset.stepMark as Step, m]));
const chooseDentist = panes.has('dentist');
const solo = !chooseDentist && dentists.length === 1 ? dentists[0] : null;
const phone = main.dataset.phone ?? '';
const tapped: SlotW | null = main.dataset.tapped ? JSON.parse(main.dataset.tapped) : null;
const strip = $('[data-slot-strip]') as HTMLElement | null;          // null in the plain flow
const change = $('[data-strip-change]') as HTMLButtonElement | null; // null in the plain flow
let chosen: SlotW | null = tapped;          // the one time the page holds: the When radios, the strip's buttons and the 409 path write it
let verdict: 'fits' | 'gone' | 'unknown' = 'unknown';
let whenOpen = !tapped;                      // sticky: Change, a 409, or having been on When
let at: Step = 'reason';
const done = new Set<Step>();                // the steps she has completed with Continue
let seq = 0;                                 // only the newest availability answer is painted
let pending: Promise<void> | null = null;    // the newest availability request, while it is out
const flow = (): Step[] => ORDER.filter((s) => panes.has(s) && (s !== 'when' || whenOpen || verdict === 'gone' || at === 'when'));
// Words go into the page only when they differ, so the live line is never re-announced unchanged.
const put = (el: HTMLElement, words: string) => { if (el.textContent !== words) el.textContent = words; };
const shown = (el: HTMLElement, on: boolean) => { if (el.hidden === on) el.hidden = !on; };
```

**Functions** (signatures and rules):
- **`fetchSlots(): Promise<SlotW[]>`** sends `limit=200` explicitly. It **returns** the slots and no longer assigns them.
- **`refreshSlots(): Promise<void>`**:
  ```ts
  function refreshSlots(): Promise<void> {
    if (!ws || !slotDays) return Promise.resolve();
    const mine = ++seq;
    slotDays.innerHTML = '<p class="pt-wait">Checking the schedule…</p>';
    const p = (async () => {
      try { const s = await fetchSlots(); if (mine !== seq) return; lastSlots = s; verdict = judge(); paintSlots(); }
      catch { if (mine !== seq) return; verdict = 'unknown'; slotDays.innerHTML = '<p class="pt-error">Could not reach the schedule. Try again, or call the clinic.</p>'; }
      paintStrip(); paintMarks();
    })();
    pending = p; void p.finally(() => { if (pending === p) pending = null; });
    return p;
  }
  ```
  After a failed request, the server's re-check on Confirm decides.
- **`settle(): Promise<void>`** waits while `pending` is set, including any newer request started meanwhile, for at most `WAIT_MS` in all:
  `const until = Date.now() + WAIT_MS; while (pending && Date.now() < until) await Promise.race([pending, new Promise((r) => setTimeout(r, until - Date.now()))]);`
- **`judge()`:**
  - `'unknown'` when nothing is held.
  - `'fits'` when `lastSlots` has `chosen.at`. It then also sets `chosen` to that slot, so its words are fresh.
  - `'unknown'` when `lastSlots.length >= LIMIT` and `chosen.at` is later than the last slot. The ISO strings share `+08:00`, so a string comparison is correct. A free time is therefore never wrongly called gone.
  - Otherwise `'gone'`.
  - It tests `lastSlots`, never the painted DOM.
- **`paintSlots()`:**
  - It groups by day as today. When `chosen` is in `lastSlots` on day index `di >= shownDays`, it sets `shownDays = Math.ceil((di + 1) / 4) * 4`.
  - The radio is rendered `checked` when `s.at === chosen?.at`, so a pick survives repaints. The URL is no longer re-read.
  - The `data-label` on slot radios goes.
  - The empty state uses the new words from §1, plus `<a class="btn btn-quiet" href="tel:${phone.replace(/[^\d+]/g, '')}" data-slot-call>${svgFor('phone')}Call ${esc(phone)}</a>` when `phone` is set. Every value in the markup goes through `esc()`, as today.
- **`phrase(w: SlotW): string`** re-labels with `slotWords(w.at)` against Manila's clock now. It gives "9:30 am today", "9:30 am tomorrow" or "9:30 am on Wed 24 Sep".
- **`missWords(w: SlotW): string`** gives the sentences in §1, checked in this order, with `now = manilaNow()` and `svc = service()`:
  - Past: `date < now.ymd`, or the same day and `mins <= now.mins`: `${phrase(w)} has passed.`
  - Too soon: the same day and `mins < now.mins + 60`: `${phrase(w)} is too soon to book online.`
  - A chosen dentist (only when `chooseDentist`): `${d.name} is not free at ${phrase(w)} for ${lower(svc.name)}, about ${svc.minutes} minutes.`
  - `svc.minutes > CARD_MIN`: `${phrase(w)} has no room for ${lower(svc.name)}, about ${svc.minutes} minutes.`
  - Otherwise: `${phrase(w)} is no longer free for ${lower(svc.name)}, about ${svc.minutes} minutes.`
  - `lower()` is copied from bookings/index.ts:116. The result is plain text, set with `textContent` only (via `put`).
- **`nearest(at: string): SlotW[]`** takes `lastSlots` without `at`, sorts them by `|Date.parse(s.at) − Date.parse(at)|` (ties go to the earlier time), takes 2, and returns them re-sorted by time.
- **`whoWords()`** gives:
  - `' · with ' + solo.name` at a solo clinic;
  - `''` at a clinic with no public dentist;
  - `' · with <chosen>'` or `' · any dentist'` at a multi-dentist clinic.
- **`paintStrip()`:**
  - **Without a strip:** it shows `[data-slot-lost]` when `chosen && verdict === 'gone'`, and puts `${missWords(chosen)} Pick another time below.` into `[data-slot-lost-words]` with `put`. Then it returns. It never touches `change`.
  - **With a strip,** using `put`/`shown` only, so nothing in the live line is rewritten unless its words changed:
    - `data-tone` is set to `warn` or removed.
    - `[data-strip-held]` is shown while the time fits: `[data-strip-when]` gets `${chosen.dayLabel}, ${chosen.label}` and `[data-strip-who]` gets `whoWords()`.
    - `[data-strip-say]` is shown while it is gone, with `missWords(chosen)` followed by " Nearest free:" or " Nothing else is open in the next two weeks. Call the clinic."
    - `[data-strip-alts]` is rebuilt only when its content key changes: the alternatives' ISO strings, or `call`, kept on `altsBox.dataset.stripKey`. It holds either `<button type="button" class="slot" data-strip-alt="${esc(iso)}"><span class="meta">${esc(dayLabel)}</span>${esc(label)}</button>` ×2, or `<a class="btn btn-quiet" href="tel:${phone.replace(/[^\d+]/g, '')}" data-strip-call>${svgFor('phone')}Call ${esc(phone)}</a>`. It is hidden when neither applies.
    - `[data-strip-change]` reads "See all times" or "Change".
  - When `at === 'confirm'`, it ends by calling `summary()`, so the When row always matches what Confirm booking sends.
- **`paintMarks()`:**
  ```ts
  function paintMarks() {
    const f = flow(), here = f.indexOf(at);
    for (const [k, m] of marks) {
      const n = f.indexOf(k);
      m.hidden = n < 0;
      m.querySelector('.sec-no')!.textContent = n < 0 ? '' : String(n + 1);
      // Passed only when she completed it; never When while the held time does not fit.
      const passed = n >= 0 && n < here && done.has(k) && !(k === 'when' && verdict === 'gone');
      m.toggleAttribute('data-passed', passed);
      m.querySelector('[data-step-sr]')!.textContent = passed ? ', done' : '';
      if (k === at) m.setAttribute('aria-current', 'step'); else m.removeAttribute('aria-current');
    }
    back.hidden = here <= 0;
  }
  ```
- **`show(s: Step, focus = true)`:**
  - It sets `at = s`, and `whenOpen = true` when `s === 'when'`.
  - It unhides one pane, runs `paintMarks()`, and sets `if (change) change.hidden = s === 'when'`.
  - On `'confirm'` it sets the button to Confirm booking / Send request and calls `summary()`. On any other step it sets Continue.
  - It clears `err`, focuses the pane's `legend`, and scrolls smoothly, as today.
- **Listeners:**
  - A change on `name="slotpick"` sets `chosen = lastSlots.find(...)`, `verdict = 'fits'`, then runs `paintStrip(); paintMarks();`.
  - A click on `[data-strip-change]` (only when `change` exists) runs `whenOpen = true; show('when')`.
  - A delegated click on `[data-strip-alts]` for `[data-strip-alt]` sets `chosen`, sets `verdict = 'fits'`, runs `paintSlots(); paintStrip(); paintMarks();` (`paintStrip` redraws the summary on Confirm), and focuses the legend of `panes.get(at)`.
- **`validate(s: Step)`:**
  - `'when'` (live): requires a checked `slotpick` ("Pick a slot."), sets `chosen` from it and `verdict = 'fits'`.
  - `'when'` (request): requires `reqDate`, as today.
  - `'who'`: the checks at lines 289-293, unchanged.
- **Next:**
  ```ts
  next.addEventListener('click', async () => {
    const e = validate(at); if (e) { err.textContent = e; return; }
    done.add(at);
    // A held time and When not yet in the flow: the step after Reason or Dentist depends on an answer still coming.
    if (pending && chosen && !whenOpen && (at === 'reason' || at === 'dentist')) {
      const from = at;
      next.disabled = true; setNext('Checking…', 'none');
      await settle();
      next.disabled = false; setNext('Continue', 'go');
      if (at !== from) return;                       // she went Back meanwhile
    }
    const f = flow(), i = f.indexOf(at);
    if (verdict === 'gone' && f.includes('when') && f.indexOf('when') < i) { show('when'); return; }
    if (i < f.length - 1) show(f[i + 1]); else finish();
  });
  ```
  **Back** is `show(f[Math.max(0, i - 1)])` with `f = flow()`.
- **`summary()`:**
  - When reads `${chosen.dayLabel}, ${chosen.label}` (live clinic).
  - The Dentist row is present only when `dentists.length > 0`.
- **`finish()`:**
  - The payload has `at: ws ? chosen?.at ?? '' : ''`.
  - `booking.slot` is `ws ? chosen!.at : \`${val('reqDate')} ${val('reqTime')}\``. It replaces `val('slot')`, whose input is gone. The calendar file's `DTSTART` (line 375) and the `flossify:bookings` entry read it, unchanged.
  - `booking.label` is `${chosen.dayLabel}, ${chosen.label}` (live clinic).
  - The 409 path is `whenOpen = true; show('when'); refreshSlots();`, then the server's words go into `err`, keeping the existing order.
  - On done, `[data-slot-strip]` is hidden together with the form and the progress row.
- **Boot:** `paintReason(); refreshSlots(); paintMine(); paintStrip(); show('reason', false);`

**New hooks.** Each is queried by its exact attribute name, and none exist anywhere today (checked with grep over `src/`):
- `data-tapped`
- `data-slot-strip`
- `data-strip-held`, `data-strip-when`, `data-strip-who`, `data-strip-say`, `data-strip-alts`, `data-strip-alt`, `data-strip-change`, `data-strip-call`
- `data-slot-lost`, `data-slot-lost-words`
- `data-slot-call`

`data-strip-key` is written only on `[data-strip-alts]` and is never queried. The step names reuse the existing `data-step` and `data-step-mark`, now with names as values.

### 4.3 `src/pages/find/index.astro`

- Line 189: the card slot anchors get `data-slot-link`.
- In the script, add the following and call `results.forEach(carry)` at the end of `apply()`:

```ts
// A tapped time carries what she chose here, in this page's own names, so the booking opens on that reason.
const carry = (li: HTMLElement) => {
  for (const a of $$<HTMLAnchorElement>('[data-slot-link], [data-book]', li)) {
    const u = new URL(a.href);
    u.searchParams.delete('service'); u.searchParams.delete('symptom');
    if (state.service) u.searchParams.set('service', state.service);
    else if (state.symptom) u.searchParams.set('symptom', state.symptom);
    a.href = u.pathname + u.search;
  }
};
```

- The Book button (`data-book`) carries the reason too.
- The server render, filtering, sort and `writeUrl` do not change.

### 4.4 CSS

**`src/pages/find/_ui/patient.css:231`:**
- `.pt-steps { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); … }` replaces `grid-template-columns: repeat(5, …)`.
- Add `.pt-steps .wiz-step[hidden] { display: none; }`, the same belt and braces as `.wiz[hidden]` in global.css:788.
- With five visible marks, the /f/ forms stepper lays out exactly as before (verified in §6).
- The comment on line 1: "its five-step booking" becomes "its booking".

**`src/pages/find/_ui/clinic-glass.css`, in "the booking" section after line 345.** There are no new colour values: every colour is an existing token that already has both dark twins.

```css
/* The time tapped on Find a clinic, held at the top of the wizard card: on the glass, never on the bare room.
   Blue while it holds; amber with its alert icon and a sentence when it no longer fits. */
.cl-glass .cl-strip { flex-wrap: wrap; align-items: center; margin-top: 0.625rem; }
.cl-glass .cl-strip > .ws-icon { align-self: flex-start; margin-top: 3px; }
.cl-glass .cl-strip:not([data-tone="warn"]) > .cl-strip-warn,
.cl-glass .cl-strip[data-tone="warn"] > .cl-strip-ok { display: none; }
.cl-glass .cl-strip-body { flex: 1 1 14rem; min-width: 0; }
.cl-glass .cl-strip-line { margin: 0; }
.cl-glass .cl-strip-line strong { font-weight: 600; }
.cl-glass .cl-strip-alts { display: flex; flex-wrap: wrap; gap: 0.375rem; margin-top: 0.5rem; }
.cl-glass .cl-strip-alts .slot { cursor: pointer; font-family: inherit; }
.cl-glass .cl-strip-change { flex: none; margin-left: auto; }
```

### 4.5 Other files

- **`scripts/dev/glass/book-e2e.mjs`:** rewrite it to `node book-e2e.mjs <slug> <phone> [base=http://127.0.0.1:4610] [slot] [outdir=os.tmpdir()]`.
  - It drives the steps from the visible `fieldset[data-step]:not([hidden])`, never from a fixed sequence, with at most 8 turns:
    - `reason`: tap consultation;
    - `dentist`: a named dentist, or "Any available dentist" when `slot` is given;
    - `when`: the 6th slot, or the request's day and part;
    - `who`: fill in the fields;
    - `confirm`: read the summary and confirm.
  - It opens `/book/?slot=<encoded slot>` when `slot` is given, and fails if the When fieldset is ever shown while the strip has no `data-tone`.
  - It writes the screenshot to `outdir`, not the hard-coded macOS path.
  - It prints the visited steps and the decoded `.ics` `DTSTART`.
- **`CLAUDE.md`, "The patient side — /find/", add:**
  - "A time tapped on /find/ is held: the booking opens with it on a strip in the wizard card, skips When while it fits, and turns amber with a sentence and the two nearest free times when it does not."
  - "A clinic with one dentist on its public page books with her: `soloDentist()`/`openSlots` and `/api/bookings` treat any dentist as her, counting her visits, unassigned ones and the chairs. Her reminders then name her."
- **`CLAUDE.md`, "The schedule", add:** "At a clinic with one dentist on its calendar (`boot.staff`), New booking starts with her in Dentist, unless the desk tapped a dentist's column or 'No dentist' (`openBook`)."
- **`CLAUDE.md`, the Open list:** "“Any available dentist” slots count chairs…" becomes "At a clinic with two or more dentists, “Any available dentist” slots count chairs, not which days dentists work (a one-dentist clinic books her days)."
- **`CLAUDE.md`, Layout line:** "its five-step booking" becomes "its booking (three to five steps)".
- **`docs/service-map.md:3`:** "a five-step account-free booking" becomes "an account-free booking of three to five steps".

---

## 5. What must not change

- **`/api/bookings`:**
  - its body and response shapes, every error sentence and status;
  - the advisory lock and the re-check inside the transaction;
  - `LIMITS.booking`;
  - the confirmation and request texts (no link, no reply asked);
  - the `patient_consent` row.
- **The reminder functions** (`sms_reminder_body`, `sms_remind48_body`): not edited. Their output changes only because more visits now carry a dentist. At a one-dentist clinic, reminders name her whenever the text fits in 160 characters, and her name is dropped before the service name. This goes in the owner's release note.
- **`/api/availability`:** its contract. At a multi-dentist clinic, its output and the /find/ cards are **byte-identical** to before, when today's slots are left out of the comparison.
- **The request path:** `placeRequest`, `requestFallback`, the date input's `min` = Manila today, and "Send request".
- **Done, undo and storage:**
  - the three-minute undo;
  - the `.ics` (`TZID=Asia/Manila`, the exact half hour);
  - `flossify:bookings` entries (same fields and meaning; `slot` is the held ISO time);
  - "Your bookings on this device";
  - the done screen's words and focus.
- **The workspace:** only `openBook`'s Dentist default in `src/components/ws/cal/panels.ts` changes, plus the comment in `BookPanel.astro`. No file under `src/pages/c/` changes. These are all untouched:
  - `/api/schedule`, `findClash`, `NEXT_STATUS`/`applyStatus`;
  - the Unplaced lane, the columns and the phone list;
  - multi-dentist clinics' panel.

  The desk may still book over a web visit, and may still choose "Any dentist"; the desk decides.
- **The /f/ patient forms stepper**, which shares `.pt-steps`: same rects and look.
- **Motion:** the smooth scroll on every step stays, and nothing is gated by reduced motion.
- **Frames:** nothing is fixed or sticky. There is still one teal button (Continue / Confirm booking). Change, the two alternatives and both Call buttons are quiet.
- **Marketing copy** on the home page ("Book in five steps") and on `/websites/` stays. Five is still the most steps a booking takes.
- **No migration file.** 039, 040 and 041 are not used.

---

## 6. Verification plan

**Setup.**
- Build: `npm run db:setup` (local, destructive), then `npm run build && PORT=4612 node dist/server/entry.mjs`.
- Baseline: a build of `main` on `PORT=4611` against the same DB. Use new ports; never `pkill astro`.
- Seed facts used below:
  - `marikina-heights` is live, has 2 chairs and one dentist, Dr. Elena Sarmiento (phone 0927 555 0500). This is the solo clinic, and `boot.staff` there is her alone.
  - `session-road` is live and has 3 dentists. Dr. Ramon Cariño works Tue/Thu there.
  - `la-trinidad-family` is a request clinic.
  - The Highland Dental Group owner, `liwayway.domingo@example.com` / `flossify`, has the owner role and works only at Session Road.
- Use a different mobile for each booking (5 a day per mobile). If the 20-an-hour address limit is reached, run `truncate throttle` (dev only).

### Playwright (1440×900 desk and 390×844 phone, `isMobile`, `hasTouch`)

| # | Steps | Expected |
|---|---|---|
| T1 Solo, plain | Open `/find/marikina-heights/book/` | No `fieldset[data-step="dentist"]`. `input[type=hidden][name=dentist]` value is `elena-sarmiento`. Visible marks are Reason, When, Who, Confirm, numbered 1–4. The first `/api/availability` URL has `dentist=elena-sarmiento&limit=200`. `[data-slot-note]` says "Dr. Elena Sarmiento is in on Mon, …". Book through: the summary's Dentist row is "Dr. Elena Sarmiento". SQL: `select a.dentist_id = s.id from appointment a, staff s where a.public_ref = '<ref>' and s.slug = 'elena-sarmiento'` returns `t`. SQL: `select sms_reminder_body(id), length(sms_reminder_body(id)), sms_remind48_body(id), length(sms_remind48_body(id)) from appointment where public_ref = '<ref>'`: each body is ≤ 160 characters, names the service, and contains " with Dr. Elena Sarmiento" (or, when that would not fit, the same body without it). |
| T2 Solo, from /find/ | On `/find/`, tap the Marikina card's first `[data-slot-link]` | The URL has `?slot=`. `[data-slot-strip]` is visible with no `data-tone` and reads "Your time: <the card's dayLabel>, <label> · with Dr. Elena Sarmiento". Marks are Reason, Who, Confirm (1–3), and When's mark is `hidden`. Continue opens Who (legend focused). Fill in, Continue: the summary's When equals the strip's words. Confirm: the POST body `at` equals the tapped ISO, and the done title starts with the same words. Decode `[data-ics]`'s href: it has `DTSTART;TZID=Asia/Manila:<tapped yyyymmddThhmm>00`. `JSON.parse(localStorage['flossify:bookings'])[0].slot` equals the tapped ISO. |
| T3 Multi, dentist busy | `/find/session-road/book/?slot=<a Mon/Wed/Fri free time>`, Continue, choose Dr. Ramon Cariño | Within 2 s the strip has `data-tone="warn"`, the alert icon is visible and the calendar icon has computed `display: none`. The sentence is "Dr. Ramon Cariño is not free at … for consultation, about 30 minutes. Nearest free:". There are exactly 2 `[data-strip-alt]`, and both are in `/api/availability?clinic=session-road&dentist=ramon-carino`. The When mark is visible (5 marks), numbered 3, with no check and no ", done". Tap the first alt: the strip is blue with the new time, the When mark is hidden again, and focus is on the Dentist legend. Continue opens Who. |
| T4 Reason too long | Take a service from `main[data-services]` with `minutes >= 60`. Open `?slot=<the last 30-min slot of a day>&service=<id>` at Marikina | The direct-service radio is checked and `details.pt-more[open]`. The strip is amber: "… has no room for <lowered name>, about <N> minutes. Nearest free:". Continue from Reason opens **When**, not Who. Escaping: in the dev DB, rename that service to `Scale <b>x</b>` for the run and put it back afterwards. The sentence shows the brackets as text, and `[data-slot-strip] b` does not exist. |
| T5 Symptom carried | `/find/?symptom=toothache`, then read the hrefs | Every visible `[data-slot-link]` and `[data-book]` has `symptom=toothache`. Tap one: the "Toothache" chip radio is checked and "Not sure" is not. `?symptom=swelling` (urgent) opens on "Not sure". Choosing a symptom on /find/ after `?service=` replaces the param (never both). |
| T6 Past | `…/session-road/book/?slot=<yesterday>T09:00:00%2B08:00` | Amber: "9 am on <day> has passed. Nearest free:". The two alts are the first two of `/api/availability`. |
| T7 Too soon | `Date` cannot be route-mocked across the server, so compute Manila now + 30 min, rounded to :00/:30, if still inside hours | Amber: "… today is too soon to book online." Skip if outside hours. |
| T8 409 | Contexts A and B both open `/find/marikina-heights/book/?slot=S`. B completes. Then A confirms. | A: the When fieldset is visible, `[data-error]` reads "That slot has just gone. Pick another.", and the strip is amber with 2 alts, none equal to S. Back from When goes to Reason, and When stays in the flow. |
| T9 Race | `page.route('**/api/availability*')` delays only the first response by 1500 ms. Change reason 3 times quickly. | The final strip state and slot list match the last reason's minutes (the stale answer is never painted). |
| T10 Empty | Route `/api/availability` to `{ "slots": [] }` at Marikina (plain flow) and at Session Road with Dr. Cariño chosen | The Marikina text has no "Try any dentist". Session Road: "Nothing open with Dr. Ramon Cariño…". The `[data-slot-call]` href is `tel:` plus the digits. The tapped variant shows `[data-strip-call]` and "Nothing else is open in the next two weeks. Call the clinic." |
| T11 Pick persists | Plain flow at Session Road: pick the 3rd slot, then "Show more days"; Back to Reason, choose another 30-min reason, go to When | The same radio is still checked. With a ≥60-min reason on a last-of-day pick, `[data-slot-lost]` is visible with "… has no room for …, about <N> minutes. Pick another time below." and no radio is checked. Continue says "Pick a slot." |
| T12 Request clinic | `/find/la-trinidad-family/book/?slot=<any>` | No strip. Marks are Reason, Dentist, When, Who, Confirm. `node scripts/dev/glass/book-e2e.mjs la-trinidad-family 0917… http://127.0.0.1:4612` passes. So do `… marikina-heights 0917… http://127.0.0.1:4612 <free iso>` (visited steps reason, who, confirm) and `… session-road 0917… http://127.0.0.1:4612` (five steps). |
| T13 No public dentist | SQL: `delete from staff_schedule where clinic_id = (select id from clinic where slug='marikina-heights')` (restore afterwards) | No Dentist step and no hidden input. The summary has no Dentist row. The booking's `dentist_id` is null. |
| T14 Manila | Run T2 in contexts with `timezoneId` `America/New_York` and `Asia/Tokyo` | The strip, summary and done words are identical to the card's words in all zones, and so are the `.ics` `DTSTART` and the stored `slot`. |
| T15 Keyboard and live line | Start at the top and press Tab. Then, with a MutationObserver on `.cl-strip-line`, switch between two 30-min reasons while the time holds | Tab order: back link, Change, then the step's radios, Back, Continue. Enter on Change opens When with focus on "When?". After an amber change, the text of the `aria-live` line `.cl-strip-line` is the amber sentence. Switching between two 30-min reasons records 0 mutations in the live line. |
| T16 Reduce motion | Repeat T2 with `reducedMotion: 'reduce'` | Identical behaviour, and `scrollIntoView` is still called with `behavior: 'smooth'`. |
| T17 Slow line | Marikina, `?slot=<the last 30-min slot of a day>`. Route every `/api/availability` answer to arrive 2 s late. After the first answer, open "Or choose the service directly", tick a ≥60-min service and tap Continue at once | Continue is disabled and reads "Checking…" until the answer arrives, then the When step shows (legend focused), marks Reason ✓, When 2 (current), Who 3, Confirm 4. A MutationObserver on `[data-step-mark="when"]` never sees `data-passed` or ", done" at any point. |
| T18 Alternative on Confirm | Marikina, `?slot=S`. Route the first `/api/availability` answer to arrive after 8 s, with the real list minus S. Continue at once | Continue waits 6 s, then opens Who (strip blue). Fill in; Continue opens Confirm. When the late answer lands, the strip turns amber with 2 alts and the When mark shows with no check. Tap the first alt: the strip is blue with its words, the summary's When row equals those words, and the When mark is hidden. Confirm booking: the POST `at` equals the alt's ISO. |
| T19 Desk, one dentist (1440 only; the phone calendar has no lanes) | Fresh context. Sign in as the Highland owner. Open `/c/marikina-heights/?date=<next Mon>&view=day` (by chair) and tap an empty spot in Chair 1's lane at 10:00 | The book panel is open: `[data-bk-time]` = 10:00, `[data-bk-chair]` = 1, and the selected `[data-bk-dentist]` option reads "Dr. Elena Sarmiento" with her staff id as value. Choose a patient and save: SQL `dentist_id` is hers, and with `&by=dentist` the card is in her column. New booking at Marikina also starts on her. In `by=dentist`, a tap in her column gives her, and a tap in "No dentist" (when shown) gives "Any dentist". At `/c/session-road/` the same tap gives "Any dentist" (unchanged). |

### SQL checks (dev DB, as superuser)

- **Solo days:** `delete from staff_schedule where staff_id = (select id from staff where slug='elena-sarmiento') and dow in (2,4)`. Then `curl '/api/availability?clinic=marikina-heights'`: no slot `date` falls on a Tue or Thu, and /find/'s Marikina card shows no Tue/Thu time. Restore the rows.
- **Solo, unassigned visit:**
  - Insert `appointment (clinic_id, patient_id, dentist_id, starts_at, ends_at, reason, status, source)` for Marikina with `dentist_id null` and `status 'booked'`, at S (30 min), using any Marikina patient.
  - `/api/availability?clinic=marikina-heights` no longer lists S, although the clinic has 2 chairs.
  - A hand-made `POST /api/bookings` at S returns **409**.
  - The same insert at Session Road: `/api/availability?clinic=session-road` still lists S (the chairs rule, unchanged).
- **No double-booking at the solo clinic** after T1–T8, T17 and T18:
  ```sql
  select count(*) from appointment a join appointment b on a.id < b.id and a.clinic_id = b.clinic_id
   where a.clinic_id = (select id from clinic where slug='marikina-heights')
     and a.status not in ('cancelled','no_show','completed') and b.status not in ('cancelled','no_show','completed')
     and a.starts_at < b.ends_at and b.starts_at < a.ends_at
     and a.source in ('web','request') and b.source in ('web','request');
  ```
  Returns 0.
- **Multi-dentist unchanged:** for `session-road` and `burnham-smile` (with and without `dentist=`, `minutes` 30 and 60), drop today's slots from the `/api/availability` JSON from ports 4611 and 4612; `diff` is empty. The /find/ card slot text for those clinics is identical.
- **No migration:** `ls src/data/migrations | tail -1` is still `038_appointment_contact.sql`.

### Contrast, targets, 390, themes

- **Covers:** in the throwaway `flossify_glass` DB (`scripts/dev/glass/make-uploads.mjs`):
  - `marikina-heights` = all-black;
  - `burnham-smile` = all-white;
  - `leonard-wood` = soft blur;
  - `session-road` = a real room;
  - stripes: run `update clinic set booking_mode = 'live' where slug = 'la-trinidad-family'` for the run, then set it back to `'request'`.
- **Run:** `node scripts/dev/glass/contrast.mjs 'find/<slug>/book/?slot=<first free iso>' <light|dark> <desk|phone> http://127.0.0.1:4612` for the blue state, and with `?slot=<yesterday 09:00>` for the amber state. That is 5 covers × 2 states × 2 themes × 2 widths.
- **Expected:** `fails: []` and `min ≥ 4.5`. The `.slot .meta` (12px) inside the strip is included.
- **Equivalence** (Playwright `getComputedStyle`):
  - `[data-slot-lost]` has the same `color` and `background-color` as the amber strip;
  - `[data-strip-call]` and `[data-slot-call]` have the same `color`, `background-color` and `border-color` as `[data-strip-change]`;
  - `[data-strip-alt]` has the same `font-family` as `.cl-strip-line`.
- **Targets:** every `[data-slot-strip] :is(button,a)`, `[data-strip-alt]`, `[data-strip-call]` and `[data-slot-call]` has a `getBoundingClientRect()` height ≥ 44 and width ≥ 44 at 390 and 1440.
- **390:** in every state of T1–T11, T17 and T18, `document.documentElement.scrollWidth <= innerWidth`. The strip's Change wraps under the words, and no text is clipped (`scrollWidth <= clientWidth` on `.cl-strip-body`).
- **Theme twins:** the computed colours of the strip, the alts and Change are identical between device dark and chosen dark (`localStorage.theme='dark'`), and between device light and chosen light.
- **/f/ stepper:** the rects of `.pf-stepper .wiz-step` at 1440 and 390 are identical between ports 4611 and 4612. To mint a key, open `/c/session-road/patients/qr/` once, then run `select key from clinic_forms_key where retired_at is null`.
- **Hidden marks:** `[data-step-mark][hidden]` has a `getBoundingClientRect().width` of 0, and the visible marks divide the row equally.

---

## 7. Effort and risks

**Effort: M, about 2½ days.**
- About 1 day: book.astro's script moves to named steps, with the strip and its states, the "Checking…" wait and done-tracking.
- About 2 h: the solo rule in `openSlots` and `/api/bookings`, plus `slotWords`.
- About 1 h: /find/ carrying the reason.
- About 1 h: the desk's `openBook` default, and T19.
- About 1 day: the measurements in §6, `book-e2e.mjs` and the docs.

**Risks:**

- **What a clinic can notice.**
  - At a one-dentist clinic with two or more chairs, the web can no longer book two patients at once.
  - Visits the desk left without a dentist now block her time online.
  - The desk's new bookings name her.
  - Her reminders and My visits name her.

  This is deliberate. It keeps to "only availability the clinic can honour", it makes the /find/ card and the booking check agree, and it makes the desk's and the web's bookings land in one column. Say all of it in the release note to the owner.
- **The desk's rule and the web's rule count dentists differently.**
  - The web counts dentists on the public page (a slug and a schedule).
  - The desk counts treating staff with a schedule at the branch (`boot.staff`).
  - They agree in the seed. They differ in one case: an owner who treats, with a schedule but no slug, plus one public dentist. There, the web pins the public dentist and counts the owner's visits (slug null) as hers, which blocks too much but never double-books. The desk offers both and preselects no one.
- **040 (blocked time) also edits `isTaken` in `openSlots`.** Whichever change lands second keeps the block test first, then the solo, dentist or chairs rule. The bookings re-check likewise runs the block check before the solo query.
- **The 200-slot cap:** a held time beyond the cap is judged `unknown`, so it is never called gone. The server's re-check on Confirm decides.
- **The 6-second wait:** on a line slower than that, Continue carries on without the answer. A late 'gone' then puts When back into the flow as a step still to do (T18), and Continue sends her there. The server's re-check on Confirm still decides.
- **A held time can pass while the page is open.** `judge()` refreshes the words only when the slot is found. A stale "Today" is corrected by the "has passed" sentence (`phrase()` re-labels against the clock now), or by the 409 on Confirm.
- **The index-to-name refactor** touches validate, show, Back, Next, the 409 path, the last-step check and `finish`'s stored `slot` together. T1–T19 cover each path, and `book-e2e.mjs` now walks whatever steps are visible, so the existing smoke run keeps working.

---

## Review notes

1. **Calendar solo (major): accepted.** `openBook` defaults Dentist to `ctx.filter()`, which is `''` for the desk (panels.ts:622, board.ts:107). §3.5 now preselects the only dentist in `boot.staff`, and T19 checks it. Lane taps on phones (board.ts:923) are left to the separately confirmed "Slot suggestions" item, as the Scope says.
2. **`booking.slot` lost with the hidden input (major): accepted.** It was `val('slot')` (book.astro:362) and feeds the `.ics` `DTSTART` (line 375). `finish()` now sets it from `chosen.at`, and T2 and T14 decode the `.ics` and read the stored entry.
3. **Continue decides on a stale answer (major): accepted.** Next reads `verdict` synchronously while a fetch is out. §4.2 adds `pending`, `settle()` (at most 6 s, "Checking…") and a `done` set, and never marks When passed while the time is gone. T17 checks it.
4. **Summary not redrawn after an alt on Confirm (minor): accepted.** `summary()` ran only in `show('confirm')`. `paintStrip()` now redraws it on Confirm, and T18 checks it.
5. **"No longer free" for a time never long enough (minor): accepted.** /find/ cards check 30 minutes (find/index.astro:27, availability.ts:84). A visit longer than `CARD_MIN` now gets "has no room for …", which is true in both cases. T4 and T11 are updated.
6. **Reminder texts change at a solo clinic (minor): accepted.** 019 and 036 add " with <name>" when `dentist_id` is set. §1, §3.3 and §5 now say so, and T1 checks both bodies are ≤ 160 characters.
7. **book-e2e cannot run as described (minor): accepted.** It hard-codes port 4610 and a macOS path, and waits on hidden radios. §4.5 now takes a base URL and an out directory, walks the visible steps, and T12 uses it.
8. **Script traps (minor): accepted, all three.**
   - `change` is null in the plain flow, so the code guards it (`change?.hidden`) and `paintStrip` returns early without a strip.
   - The live line is written only when its words differ (`put`/`shown`), and T15 counts mutations.
   - Sentences go in with `textContent`, and every value in the alt and call markup goes through `esc()` with the `tel:` digits sanitised. T4 checks this with a service name containing markup.