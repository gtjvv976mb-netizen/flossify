# Tap a free time: slot suggestions in Book and Move (p24)

This spec is written against `main` at `d07558b` (migrations 036–038 applied). The branch head `18a4017` changes one comment in `panels.ts`, and every line reference below holds on both. The feature has no migration and no server change. Migration numbers 039, 040 and 041 are not touched.

## 0. Scope decisions, taken from the verdicts and the review

| Point | Decision |
|---|---|
| V1: no new `/api/schedule/free`. V2: add one with `requireWorkspace`, `schedule.edit`, `withClinic` and `no-store`. | **No new route.** The existing `GET /api/schedule?clinic&from&to` (up to 8 days, `MAX_DAYS`) already returns every visit with its chair, dentist and status, and it already has the guards V2 asked for: `gate()` (session, `canOpen`, `LIMITS.schedule.staff`), `loadRange` inside `withClinic`, and `cache-control: no-store`. The suggestions run in `model.ts`, which the server can import, so a later server caller can use the same functions. The browser asks for suggestions only when `boot.canSchedule` (`can(ws,'schedule.edit')`) is true. |
| Six chips (V1) or four chips (V2) | **Four chips.** This follows the soft template's "very simple" rule. At 390px they make two rows of two. |
| The chips replace "Next free half hour" (both verifiers) | `data-bk-free` and `freeHint()` are removed. |
| Turnover buffer (V2). The p07 verdict: the owner decides turnover. | **Not applied yet: `TURNOVER_MIN = 0`.** On the quarter-hour grid a 10-minute buffer really leaves 15 to 20 minutes, and chips the desk follows set the clinic's pace, so the owner decides turnover. `freeStarts` keeps a `turnover` option with its rule, so a clinic setting (040's `clinic.turnover_minutes`, or an earlier decision) only changes the number. The note's words for a non-zero turnover are fixed in §1. `findClash` never refuses because of turnover. (Review note 5) |
| Capacity: visits with no chair yet, and Any-dentist visits | **Counted in suggestions.** Visits with no chair yet include unplaced web bookings, requests and seeded visits. A start needs a chair left free after each overlapping visit with no chair yet has taken one. It also needs a dentist free after each overlapping Any-dentist visit has taken one of the day's dentists. For chairs this is the same count the public booking API makes (`bookings/index.ts:196–201`, `directory-db.ts:83–88`), so the desk and /find/ agree. `nextFree` keeps its old answer, because the rule is an option (`pool`) that it leaves off. (Review note 1) |
| Blocked time (040) | **`Hold` names its scope on each side**: a chair number or dentist id means that one; `'any'` means it needs one; `'all'` means every one; `null` means none. Visits only ever produce a number, an id or `'any'`. 040 appends rows with `'all'` or `null`, and fixtures L1–L3 prove that `freeStarts` already honours them. (Review note 2) |
| p07: blocks dependency (drop it); dentist hours, lunch and leave (defer) | **No dependency.** The words say suggestions go by the days a dentist is in, not their hours. |
| Where the chips fall in the day | **Anchored on the time the form holds**: a tapped cell, a request's asked time, the moved visit's own time, or the panel's default. Besides that time, the chips offer the first free start of every hole. Inside a long free stretch they offer one start every `gap` minutes, and `gap` spreads a light day across morning and afternoon (9:00, 11:30, 2:00, 4:30). (Review note 6) |
| Course-step "usual return" offsets | **Dropped entirely.** There is no data for them, and they are clinical wording a dentist would have to review. |
| `nextFree` is shared with `renderCount` and the walk-in | `nextFree` becomes a thin wrapper over `freeStarts` with `pool` off and turnover 0. Its output is **the same for every input**. §6.1 proves it, and it was run on this spec's code while writing it: 0 differences in 10,000 random days. |
| Hooks must not collide (`data-slot-*` is used on /find; `.cal-slot` is used on the calendar) | Hooks are `data-bk-slots*`, `data-vp-slots*`, and on chips `data-ft-min`, `data-ft-chair` and `data-ft-ymd`. Classes are `.ft-*` ("free times"). Nothing uses these names today (checked with grep). |
| `hidden` attribute, 44px targets, measured contrast, one teal button | See §4 and §6. The chosen chip gets the teal tint and a ring. Inside the Move form, which is already teal tint, it is white with a 2px ring. The only teal fill stays the Save button. |
| "Only availability the clinic can honour" | A suggestion honours: clinic hours; the chosen dentist's weekdays (`staff_schedule`); chair and dentist overlap exactly as `findClash`/`HOLDS_SLOT` check them; the capacity count above; the visit being moved. With Any dentist, at least one of the day's dentists must be free after the Any-dentist visits. |

## 1. What the clinic and the patient see

### The desk: New booking (Dashboard → + New → New booking, a free cell, or "New booking" on a patient)

The line "Next free half hour: Chair 2 at 10:30 am" under Chair and Dentist is replaced by the **free times block**, in the same place: after the Chair · Dentist row, before "More details".

```
Free for 45 minutes with Dr. Cariño on Thu 1 Oct             ← head (14px, 600, ink)
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ 9:00 am  │ │ 11:30 am │ │ 2:00 pm  │ │ 4:30 pm  │          ← up to 4 chips (44px+), in time order; line 1 = time
│ Chair 1  │ │ Chair 2  │ │✓ Chair 1 │ │ Chair 3  │            line 2 = chair (left out when the branch has one chair)
└──────────┘ └──────────┘ └──────────┘ └──────────┘            ✓ = the form's own time and chair (pressed)
Next free with Dr. Cariño                                     ← only when a dentist is chosen
┌───────────┐ ┌───────────┐
│ Tue 6 Oct │ │ Thu 8 Oct │                                   ← up to 2 chips: line 1 = day, line 2 = time
│ 2:00 pm   │ │ 2:00 pm   │
└───────────┘ └───────────┘
Going by the days Dr. Cariño is in (Tue, Thu), not their hours.
Saving checks the book again.
```

**When a start is free (`freeAt`):**
- **When.** A start is on the quarter hour, at or after opening. Today, it is also at or after now, rounded up to the quarter. The form's own time is also checked as it stands, even when it is off the quarter.
- **Closing.** The visit ends by closing.
- **Chairs.** A chair is free when no visit placed on it overlaps the start. A visit counts when it still holds its slot (`HOLDS_SLOT`: not completed, no-show or cancelled). Each overlapping visit with no chair yet takes one of the free chairs, and at least one chair must be left. The chair the form holds is preferred when it is free; otherwise the lowest free chair is used.
- **Dentists.** The chosen dentist has no overlapping visit, in any chair. The day's dentists are those in `staff_schedule` that weekday. Take away the busy ones, then one more for each overlapping Any-dentist visit.
  - With Any dentist, at least one dentist must be left.
  - With a chosen dentist who is one of them, the others must cover the Any-dentist visits.
  - This check runs only when the schedule names any dentist.
- **Turnover.** None today (`TURNOVER_MIN = 0`). When it is set, a chair is kept that many minutes after each visit, and the start moves to the next quarter hour.

**Which free starts become chips (`pickStarts`, at most 4, shown in time order):**
1. **The form's time**, when it is free. It is pressed when its chair is also the form's chair.
2. **Other candidates.** First the ones after the form's time, earliest first. If room is left, the ones before it, earliest first. A candidate is:
   - the first free start of every hole (a hole is a run of free starts 15 minutes apart), or
   - inside a hole, the next start at least `gap` minutes after the previous candidate.
3. **`gap`** is the largest of: the length, 60, and a quarter of what is left of the day (from the first start to closing) rounded up to the half hour. The result is then rounded up to the quarter hour. On a light day from 9 to 6 the chips are 9:00, 11:30, 2:00 and 4:30. On a Saturday from 9 to 3 they are 9:00, 10:30, 12:00 and 1:30.

**Tapping chips:**
- **A day chip** fills Time and Chair. The chip turns chosen: teal tint, teal ring, a check icon, `aria-pressed="true"`. Focus stays on it. Nothing is saved.
- **Typing** a time or changing the chair re-marks the chips. A chip is pressed only when both its time and its chair match the form.
- **A next-free chip** fills Date, Time and Chair, and keeps the dentist. The day row is worked out again for the new date, anchored on the tapped time. Focus moves to the chip now pressed. If none is pressed (the book changed meanwhile), focus goes to the first day chip, or to the Time field when there are no chips.
- **Save booking** is unchanged: one `POST /api/schedule`, and the server checks the book again under its lock. If another desk took the time, the server's 409 sentence shows in the panel as today ("Chair 2 has Ana Reyes until 10:45 am.").
  - The board then reloads today and the range on screen, so the other desk's visit appears on the calendar behind the panel.
  - The block re-reads the chosen day and the next 7 days from the server, so the taken start is gone.
  - Later redraws read the reloaded board, so it stays gone.

**When the block is worked out again:**
- Date, service (which sets minutes), minutes, dentist or chair changes.
- The panel opens.
- "Here now" is unticked.
- After a 409.
- The live board absorbed a change on the day shown, or on a day the next-free part covers. Focus stays on the chip with the same time and chair. If that chip is gone, it goes to the pressed chip, else the first chip, else the Time field.

**When it is hidden:**
- **"Here now" is ticked** (a walk-in books now). It stays hidden while ticked, whatever else changes (dentist, chair, date, service), and it fetches nothing.
- The date is not a real day.
- The person lacks `schedule.edit` (the Book panel does not open for them anyway).

### The desk: Move / "Give it a time" (visit panel → Move, or Place it on a web request)

- The same block sits inside the move form, under Date · Time · Chair · Minutes · Dentist and above "Save new time" / "Place it".
- The visit being moved is not in its own way. Its current time is the form's time, so while that time is still free it shows as a pressed chip. The other chips are the alternatives.
- The block is worked out when the form opens, again when Date, Minutes, Dentist or Chair change, after a 409, and when the live board absorbs a change while the form is open. It is hidden while the form is folded.
- **Place it** still pre-fills the first chair free at the asked time, as it does today. That chip is pressed when the asked time is free.
  - The pre-fill ignores visits with no chair yet, which the chips count. So when such visits fill the clinic at the asked time, the chair can be pre-filled while the time is not offered.
  - When that happens, the count sentence in the note says why.

### Words for each state

The head is always shown while the block is. The `say` line (`role="status"`) gives the state.

| State | Words |
|---|---|
| Loading a day that is not on screen | Looking for free times… |
| Could not load | Free times could not be loaded. Type a time instead; saving checks the book. |
| Offline | Offline: free times need the connection. |
| Could not load the next-free part only (the day row was drawn from the board) | The next part shows its head and, as its note, the "Could not load" or "Offline" words. It has no chips. |
| Minutes invalid | Head: "Free times". Say: "Set the length (5 to 480 minutes) to see free times." |
| Day before today | That day has passed. |
| Clinic closed | The clinic is closed on Sundays. |
| Chosen dentist not on this branch's schedule (not in `boot.staff`) | Dr. Cariño is not on this branch’s schedule. (No next-free part.) |
| Chosen dentist not in that weekday | Dr. Cariño is not in on Wednesdays. |
| Any dentist, open day, no dentist scheduled that weekday (while the schedule names some) | No dentist is on the schedule on Saturdays. |
| Nothing fits today | Nothing free for 45 minutes left today. (With a dentist: "…with Dr. Cariño left today.") |
| Nothing fits on another day | Nothing free for 45 minutes on this day. (With a dentist: "…with Dr. Cariño on this day.") |
| No next free day for the dentist | Replaces the days note: "No free 45 minutes with Dr. Cariño in the 7 days after this one." (For a day that has passed: "…in the next 7 days.") |

The `-note` line is shown only when at least one day chip is. It joins, in this order:
1. **When counting changed the answer** (the same day without the count offers more starts): "Visits with no chair or no dentist yet are counted, so a chair that looks empty may not be offered."
2. **When turnover is above 0** (not today): "Suggestions leave at least {n} minutes after each visit to ready the chair, then start on the next quarter hour."
3. **Always:** "Saving checks the book again."

- **Head:** "Free for {n} minutes" + (" with {Dr. X}" when a dentist is chosen) + (" today" | " on {Thu 1 Oct}").
- **Next-free head:** "Next free with {Dr. X}".
- **The days note** ("Going by the days Dr. X is in ({days}), not their hours.") compresses runs of three or more consecutive days with `M.daysText`: "Mon–Sat", "Tue, Thu", "Mon, Wed, Fri".

### The patient

Nothing on the patient side changes: /find/, booking, /me/ and the texts. On the phone, the desk now offers two concrete times ("Thursday at 9 or Tuesday at 2?"). The confirmation or moved text is the same text as today.

## 2. Data

- **No migration.** Nothing is added under `src/data/migrations/`. 039 (intake/consent), 040 (blocked time) and 041 (PTR) stay reserved for their own work.
- **No new table, column, grant, RLS policy or definer function.**
- **Reads go only through the existing `GET /api/schedule`:** `loadRange()` inside `withClinic`, with RLS on `appointment`, `clinic_hours`, `staff_schedule` and `procedure_catalog`, and `cache-control: no-store`. `loadRange` already leaves cancelled visits out.
- **The page's boot already carries** `hours`, `staff[].days` (dentists with a `staff_schedule` row at this branch; `data.ts:186–190`) and `chairs`.

## 3. Server changes

**None.** These stay byte-for-byte:
- `src/pages/api/schedule/index.ts`
- `src/lib/schedule.ts` (`findClash`, `HOLDS_SLOT`, `NEXT_STATUS`, `applyStatus`, the advisory lock in `clinicRow`)
- `src/lib/availability.ts`
- `src/lib/directory-db.ts`

| Concern | How it is covered |
|---|---|
| Permission | The browser builds suggestions only when `boot.canSchedule` is true (`can(ws,'schedule.edit')`, set by `src/pages/c/[clinic]/index.astro:193`). POST and PATCH keep refusing without `schedule.edit`. |
| Rate limit | Each GET counts toward `LIMITS.schedule.staff` (600 per 60 s per staff member), as the calendar's own reads do. A recompute makes **at most one** GET: the 8 days from the chosen day, kept 60 s. After a 409 there are also the board's reload (1–2 GETs, as its 30-second refresh already makes) and one fresh read. After a live-board change there is one read, only when the next-free part is shown. |
| Transactions | None. A chip never writes. The only writes are the existing Save paths, which take `pg_advisory_xact_lock(hashtext(clinic_id))` and re-run `findClash` inside the transaction. |
| Capacity on the server | `findClash` does not count visits with no chair yet or Any-dentist visits. A typed time can still fill past capacity, as it can today. The chips only stop suggesting it. Changing that is a server rule for the owner, not part of this feature. |

## 4. Client changes

### 4.1 `src/components/ws/cal/model.ts`

1. Export the existing weekday array: `const DAYS` (line 216) becomes `export const DAYS` (no other change).
2. Replace `nextFree` (lines 244–256) with the code below. The wrapper returns exactly what the old body returned (proof in §6.1). This code was run through §6.1 while writing the spec: 0 equivalence differences, 0 oracle differences, and every fixture as listed.

```ts
/** Minutes a chair is kept free after each visit in the desk's SUGGESTED times. 0 until the owner sets a clinic
 *  turnover (docs/clinic-operations.md §1 suggests 8–12; the p07 verdict leaves it to the owner). On the quarter-hour
 *  grid a buffer of n leaves n to n+14 minutes. Suggestions only: findClash never refuses on it. */
export const TURNOVER_MIN = 0;

/** What stands in a start's way, in minutes after the day's midnight.
 *  chair:   a number = that chair; 'any' = a visit on no chair yet, which still needs one; 'all' = every chair
 *           (blocked time, 040); null = no chair (a dentist's own block).
 *  dentist: an id = that dentist; 'any' = an Any-dentist visit, which still needs one of the day's dentists;
 *           'all' = every dentist (blocked time); null = no dentist (a chair's own block).
 *  Visits (holdsOf) are only ever a number/id or 'any'; 'all' and null are for 040's rows. */
export interface Hold { s: number; e: number; chair: number | 'any' | 'all' | null; dentist: string | 'any' | 'all' | null }
export type Slotted = Pick<Card, 'id' | 'status' | 'chair' | 'dentistId' | 'startsAt' | 'endsAt'>;
/** The visits that still hold their time (findClash's HOLDS_SLOT: not completed, no-show or cancelled), less the one being moved. */
export function holdsOf(list: Slotted[], dayStart: number, excludeId?: string | null): Hold[] {
  return list.filter((a) => !DONE.has(a.status) && a.id !== excludeId).map((a) => ({
    s: (Date.parse(a.startsAt) - dayStart) / 60_000, e: (Date.parse(a.endsAt) - dayStart) / 60_000,
    chair: a.chair ?? 'any', dentist: a.dentistId ?? 'any',
  }));
}

export interface FreeAsk {
  open: [number, number] | null;
  /** Minutes after midnight to look from (the caller rounds it). */
  from: number;
  minutes: number;
  chairs: number;
  /** The dentist chosen; '' or absent = any dentist. */
  dentistId?: string;
  /** The dentists in that weekday (staff_schedule). With Any dentist a start needs one of them free; with `pool`, each
   *  overlapping Any-dentist visit takes one of them. Empty/absent = no dentist check. */
  anyOf?: string[];
  /** Count visits on no chair yet against the free chairs, and Any-dentist visits against the day's dentists
   *  (suggestions: true; nextFree: false, its old answer). */
  pool?: boolean;
  /** The chair the form holds: taken at a start when it is free there. */
  preferChair?: number | null;
  /** Minutes a chair is kept after each visit (0 = nextFree's rule). Blocked time is never padded. */
  turnover?: number;
  /** How many starts to return (default 1; Infinity = every free start that day). */
  limit?: number;
}
export interface FreeStart { min: number; chair: number }

/** The chair a visit of `a.minutes` could take at minute `t`, or null when the clinic could not honour it. */
export function freeAt(holds: Hold[], a: FreeAsk, t: number): number | null {
  if (!a.open || t < a.open[0] || t + a.minutes > a.open[1]) return null;
  const turn = a.turnover ?? 0, end = t + a.minutes;
  const on = (h: Hold, pad: number) => h.s < end + pad && h.e + pad > t;
  if (holds.some((h) => (h.chair === 'all' || h.dentist === 'all') && on(h, 0))) return null;
  const free: number[] = [];
  for (let c = 1; c <= a.chairs; c++) if (!holds.some((h) => h.chair === c && on(h, turn))) free.push(c);
  const unplaced = a.pool ? holds.filter((h) => h.chair === 'any' && on(h, turn)).length : 0;
  if (free.length - unplaced < 1) return null;
  const busy = (d: string) => holds.some((h) => h.dentist === d && on(h, 0));
  if (a.dentistId && busy(a.dentistId)) return null;
  const pool = a.anyOf ?? [];
  if (pool.length && (!a.dentistId || pool.includes(a.dentistId))) {
    const anyVisits = a.pool ? holds.filter((h) => h.dentist === 'any' && on(h, 0)).length : 0;
    if (pool.filter((d) => !busy(d)).length - anyVisits < 1) return null;
  }
  const want = a.preferChair ?? null;
  return want !== null && free.includes(want) ? want : free[0];
}

/** Free starts in time order: from `from`, then every quarter hour, while the visit still ends by closing. */
export function freeStarts(holds: Hold[], a: FreeAsk): FreeStart[] {
  if (!a.open) return [];
  const limit = a.limit ?? 1, out: FreeStart[] = [];
  for (let t = Math.max(a.open[0], a.from); t + a.minutes <= a.open[1] && out.length < limit; t = Math.floor(t / 15) * 15 + 15) {
    const chair = freeAt(holds, a, t);
    if (chair !== null) out.push({ min: t, chair });
  }
  return out;
}

/** How far apart the chips sit inside one free stretch: the length, at least an hour, and at least a quarter of what
 *  is left of the day rounded up to the half hour, so a light day shows its morning and its afternoon. */
export const chipGap = (minutes: number, from: number, close: number, limit: number) =>
  Math.ceil(Math.max(minutes, 60, Math.ceil((close - from) / limit / 30) * 30) / 15) * 15;

/** The day's chips, at most `limit`, in time order: `at` (the form's own time, when free), then the candidates after
 *  it, then the ones before it, earliest first. A candidate is the first start of every hole (starts 15 minutes
 *  apart), and inside a hole the next start at least `gap` after the last candidate. */
export function pickStarts(starts: FreeStart[], o: { at: FreeStart | null; limit: number; gap: number }): FreeStart[] {
  const cand: FreeStart[] = [];
  let prev = -Infinity, last = -Infinity;
  for (const s of starts) {
    if (s.min - prev > 15 || s.min >= last + o.gap) { cand.push(s); last = s.min; }
    prev = s.min;
  }
  const pick: FreeStart[] = o.at ? [o.at] : [];
  const pivot = o.at ? o.at.min : -Infinity;
  for (const s of [...cand.filter((c) => c.min > pivot), ...cand.filter((c) => c.min < pivot)]) {
    if (pick.length >= o.limit) break;
    pick.push(s);
  }
  return pick.sort((x, y) => x.min - y.min);
}

/** The first half hour a chair is free from now (or from opening, on another day), lowest chair first.
 *  Unchanged answers: renderCount's line and the walk-in's chair read it (no pool, no turnover). */
export function nextFree(list: Card[], open: [number, number] | null, dayStart: number, isToday: boolean, chairs: number, now = Date.now()): { chair: number; min: number } | null {
  if (!open) return null;
  const from = isToday ? Math.ceil((now - dayStart) / 60_000 / 15) * 15 : open[0];
  return freeStarts(holdsOf(list, dayStart), { open, from, minutes: 30, chairs })[0] ?? null;
}

/** "Next free with Dr. Cariño": on each of the next days the dentist is in, the first free start at or after `at`
 *  (the form's clock time), else that day's first free start; at most `max` days. */
export function freeDays(list: Slotted[], o: {
  after: string; today: string; nowMin: number; days: number; hours: Record<number, [number, number] | null>;
  dentist: StaffDay; staff: StaffDay[]; at: number | null; minutes: number; chairs: number;
  preferChair?: number | null; excludeId?: string | null; turnover: number; max: number;
}): { ymd: string; min: number; chair: number }[] {
  const first = o.after >= o.today ? addDays(o.after, 1) : o.today;
  const out: { ymd: string; min: number; chair: number }[] = [];
  for (let i = 0; i < o.days && out.length < o.max; i++) {
    const ymd = addDays(first, i), dow = dowOf(ymd), open = hoursOf(o.hours, dow);
    if (!open || !o.dentist.days.includes(dow)) continue;
    const from = Math.ceil((ymd === o.today ? Math.max(open[0], o.nowMin) : open[0]) / 15) * 15;
    const holds = holdsOf(list, startMs(ymd), o.excludeId);
    const ask: FreeAsk = { open, from, minutes: o.minutes, chairs: o.chairs, dentistId: o.dentist.id, pool: true,
      anyOf: o.staff.filter((s) => s.days.includes(dow)).map((s) => s.id), preferChair: o.preferChair, turnover: o.turnover };
    const f = (o.at !== null && o.at > from ? freeStarts(holds, { ...ask, from: o.at })[0] : undefined) ?? freeStarts(holds, ask)[0];
    if (f) out.push({ ymd, ...f });
  }
  return out;
}

const DAY3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** A dentist's days in words, runs of three or more joined: "Mon–Sat", "Tue, Thu", "Mon, Wed, Fri". */
export function daysText(days: number[]): string {
  const d = [...new Set(days)].filter((x) => x >= 0 && x <= 6).sort((a, b) => a - b), out: string[] = [];
  for (let i = 0; i < d.length; ) {
    let j = i;
    while (j + 1 < d.length && d[j + 1] === d[j] + 1) j++;
    if (j - i >= 2) out.push(`${DAY3[d[i]]}–${DAY3[d[j]]}`); else for (let k = i; k <= j; k++) out.push(DAY3[d[k]]);
    i = j + 1;
  }
  return out.join(', ');
}
```

### 4.2 `src/components/ws/cal/board.ts`

**`Ctx` (lines 44–64) gains:**
```ts
/** The 8 days from Manila day `ymd` (the GET's limit), cancelled left out: kept 60 s; `fresh` asks the server
 *  whatever is kept. null = could not be reached. */
rangeCards: (ymd: string, o?: { fresh?: boolean }) => Promise<Card[] | null>;
/** Run the live board's refresh now, after any refresh in flight: today and the range on screen are read again,
 *  and every change is absorbed and drawn. */
reload: () => Promise<void>;
```

**`Panels` (in panels.ts) gains** `changed: (days: Set<string>) => void`. See §4.5.

**`rangeCards`** sits next to `fetchRange` (lines 170–176):
- A separate `const ahead = new Map<string, { at: number; list: Card[] }>()`, keyed by `ymd`. It holds at most 4 entries and drops the oldest. The view's `cache` is left alone.
- When not `fresh` and there is an entry younger than 60 s, return it.
- Otherwise `fetchRaw(M.startMs(ymd), M.startMs(ymd) + 8 * M.DAY_MS)`, filter to `status !== 'cancelled'`, store it and return it. Return null when it could not be reached.
- It never asks for more than 8 days, so the GET is never refused for its length.

**`absorb()`** (lines 827–834) also calls `ahead.clear()`, next to `cache.clear()`.

**`refresh()`** (lines 546–576) keeps its body and its rules (30 s, `LIVE_KEYS`, no redraw under a drag, the open visit panel not refilled while its move form is open), with three changes:
- **It becomes promise-shaped.** `let inflight: Promise<void> | null = null`. `refresh(force = false)` returns `inflight` when one is running. It returns at once when dragging, or when `navigator.onLine === false`. It returns at once when the page is not visible, unless `force`.
- **It collects changed days.** While it absorbs, it gathers a `Set<string>` of changed Manila days:
  - the new day of every card it absorbs;
  - the old day when a card moved;
  - the day of every card it marks as gone.
- **It reports them.** At the end (also when it stops early), when the set is not empty, it calls `panels.changed(days)`.

**`reload`** is `async () => { if (inflight) await inflight; await refresh(true); }`.

**The `ctx` object** (lines 1121–1134) gets `rangeCards` and `reload`.

**`renderCount()` is unchanged.** It still calls `M.nextFree`.

### 4.3 `src/components/ws/cal/FreeTimes.astro` (new)

```astro
---
// Free times under a booking's or a move's fields (p24): the starts that fit the length on the day chosen and, with a
// dentist chosen, their next free days. free.ts fills it; hidden until then, and for anyone without schedule.edit.
interface Props { hook: 'bk' | 'vp' }
const { hook } = Astro.props;
const d = (k = '') => ({ [`data-${hook}-slots${k}`]: '' });
---
<div class="ft" {...d()} hidden>
  <p class="ft-head" id={`${hook}-slots-h`} {...d('-head')}></p>
  <div class="ft-row" role="group" aria-labelledby={`${hook}-slots-h`} {...d('-row')}></div>
  <p class="ft-say" role="status" {...d('-say')}></p>
  <div class="ft-next" {...d('-next')} hidden>
    <p class="ft-head" id={`${hook}-slots-next-h`} {...d('-next-head')}></p>
    <div class="ft-row" role="group" aria-labelledby={`${hook}-slots-next-h`} {...d('-next-row')}></div>
    <p class="ft-note" {...d('-next-note')}></p>
  </div>
  <p class="ft-note" {...d('-note')}></p>
</div>
```

- **`src/components/ws/cal/BookPanel.astro`:** replace line 77 (`<p class="bk-hint bk-free" data-bk-free></p>`) with `<FreeTimes hook="bk" />`, and add the import.
- **`src/components/ws/cal/VisitPanel.astro`:** insert `<FreeTimes hook="vp" />` after the closing `</div>` of `.vp-fields` (line 81), before the Save / Not now row (lines 82–85), and add the import.

### 4.4 `src/components/ws/cal/free.ts` (new)

```ts
import * as M from './model';
import type { Ctx } from './board';
import { icon } from './ui';

export interface FreeFields {
  date: HTMLInputElement; time: HTMLInputElement; minutes: HTMLInputElement; chair: HTMLSelectElement; dentist: HTMLSelectElement;
  /** The visit being moved or placed; null for a new booking. */
  exclude: () => string | null;
  /** True while the block must stay hidden and fetch nothing: Book's "Here now" ticked; Move's form folded. */
  off: () => boolean;
}
export interface FreeTimes {
  update: (o?: { fresh?: boolean; keep?: boolean }) => void;
  hide: () => void;
  mark: () => void;
  /** The live board absorbed changes on these Manila days: redraw (keeping focus) when the block shows one of them. */
  changed: (days: Set<string>) => void;
}
export function initFreeTimes(ctx: Ctx, hook: 'bk' | 'vp', f: FreeFields): FreeTimes
```

**Setup:** it looks up `[data-${hook}-slots]` once, then its parts with `root.querySelector('[data-${hook}-slots-row]')` and so on. Every hook name is unique on the page. It keeps `seq`, `shownYmd`, `shownBase` (the first day of the 8 it read), `nextShown` and `pendingFocus`.

**`update({ fresh, keep })`:**
1. **Leave early.**
   - Increment `++seq`.
   - If `f.off()`, `!ctx.boot.canSchedule` or `!M.realDay(f.date.value)`, call `hide()` and return.
   - Otherwise set `root.hidden = false`.
   - If `keep`, remember the focused chip (its row and `data-ft-min`/`data-ft-chair`/`data-ft-ymd`).
2. **Minutes.** When they are not a whole number from 5 to 480:
   - set the head to "Free times" and the say line to the minutes words (§1);
   - clear both rows and the note, and hide `-next`;
   - return.
3. **Dentist and head.** The dentist is `d = ctx.staffById.get(f.dentist.value)`. The name is `M.shortName(d?.name ?? <the selected option's text before " · ">)`. Write the head (§1).
4. **Reason the day has none**, checked in this order:
   1. the day has passed;
   2. the clinic is closed (`hoursOf` null);
   3. a chosen dentist not in `staffById` ("not on this branch’s schedule");
   4. a chosen dentist whose `days` lack the weekday ("not in on {M.DAYS[dow]}");
   5. Any dentist, `boot.staff` not empty, and nobody in that weekday.

   With a reason: say it and clear the day row.
5. **Day list.**
   - If there is no reason, `local = fresh ? null : ctx.dayCards(ymd)`.
   - If `local` is there, draw the day from it at once.
   - Otherwise clear the day row and say "Looking for free times…".
6. **Fetch when needed.**
   - It is needed when there is no reason and no `local`, or when `d` is set (a dentist in `staffById`).
   - If not needed, hide `-next`, set `nextShown = false`, and return.
   - Otherwise set `base = ymd >= today ? ymd : today` and `list = await ctx.rangeCards(base, { fresh })`.
   - If `seq` changed meanwhile, drop the answer.
   - If `!list`, use the offline words (when `navigator.onLine === false`) or the could-not-load words. When the day was drawn from `local`, they go in `-next` (its head and note, no chips). Otherwise they go in the say line and `-next` is hidden. Return.
7. **Draw.**
   - Draw the day from `list` if it was not drawn yet.
   - When `d` is set, draw next-free with:
     ```ts
     M.freeDays(list, {
       after: ymd, today, nowMin: M.manila(Date.now()).min, days: 7, hours: boot.hours, dentist: d, staff: boot.staff,
       at: timeMin(f.time.value), minutes, chairs: boot.chairs, preferChair, excludeId: f.exclude(),
       turnover: M.TURNOVER_MIN, max: 2,
     })
     ```
     Then set `-next.hidden = false` and `nextShown = true`. Its note is the days note (`M.daysText(d.days)`), or the "no free … in the 7 days" words when the list is empty.
   - Otherwise set `-next.hidden = true`.
8. **Focus.**
   - After a next-free tap (`pendingFocus`): the pressed day chip, else the first day chip, else `f.time`.
   - With `keep` and a remembered chip: the chip with the same time, chair (or day) in the same row, else the pressed chip, else the first chip, else `f.time`.

`timeMin("HH:MM…")` gives minutes after midnight, or null.

**Drawing the day** (`dow`, `open = M.hoursOf(boot.hours, dow)`, `nowMin`):
```ts
const from = Math.ceil((ymd === today ? Math.max(open[0], nowMin) : open[0]) / 15) * 15;
const ask: M.FreeAsk = { open, from, minutes, chairs: boot.chairs, dentistId: f.dentist.value || undefined, pool: true,
  anyOf: boot.staff.filter((s) => s.days.includes(dow)).map((s) => s.id),
  preferChair: Number(f.chair.value) || null, turnover: M.TURNOVER_MIN };
const holds = M.holdsOf(list, M.startMs(ymd), f.exclude());
const all = M.freeStarts(holds, { ...ask, limit: Infinity });
const at = timeMin(f.time.value), atChair = at !== null && at >= from ? M.freeAt(holds, ask, at) : null;
const chips = M.pickStarts(all, { at: atChair === null ? null : { min: at!, chair: atChair }, limit: 4, gap: M.chipGap(minutes, from, open[1], 4) });
const counted = M.freeStarts(holds, { ...ask, pool: false, limit: Infinity }).length > all.length;
```
- With no chips: say "Nothing free …" (§1) and leave the note empty.
- With chips: clear the say line, and set the note from `counted`, `M.TURNOVER_MIN` and "Saving checks the book again." (§1).

**Chips:**
- Built with `ctx.el('button', 'ft-chip')`, `type="button"`, `aria-pressed="false"`, and `data-ft-min`/`data-ft-chair` (next chips also `data-ft-ymd`).
- Lines are `<span class="ft-a">` and `<span class="ft-b">`, set as textContent.
  - Day chip: `ft-a` = `M.hm(min)`, `ft-b` = `Chair N` (left out when `boot.chairs === 1`).
  - Next chip: `ft-a` = `M.dayLabel(ymd)`, `ft-b` = `M.hm(min)`.
- `icon('check', 14, 'ft-tick')` goes first in the chip's **last** line.

**Chip clicks:**
- **Day chip:** `f.time.value = M.hhmm(min); f.chair.value = String(chair); mark()`. There is no redraw, so focus stays.
- **Next chip:** set time and chair, then `f.date.value = ymd`, `pendingFocus = true`, and `f.date.dispatchEvent(new Event('change'))`. The panel's date listener runs `fillDentists` (which keeps the dentist and, per §4.5, their name) and then `update()`.

**`mark()`:** each day chip gets `aria-pressed = f.time.value.slice(0,5) === M.hhmm(min) && f.chair.value === String(chair)`.

**`hide()`:** `root.hidden = true`, then empty the rows, the say line and the notes, and set `nextShown = false`.

**`changed(days)`:**
- If `root.hidden` or `f.off()`, return.
- If `days.has(shownYmd)`, or `nextShown` and some day `d` has `shownBase <= d < M.addDays(shownBase, 8)`, call `update({ keep: true })`.

### 4.5 `src/components/ws/cal/panels.ts`

- **Import** `initFreeTimes`.
- **Kept dentist's name.** Add `const keptName = (s: HTMLSelectElement) => s.selectedOptions[0]?.text.split(' · ')[0] || null`. The date listeners pass it as `keepName`, so a kept dentist who is not in `boot.staff` keeps their name instead of turning into "Dentist":
  - `V.date` (line 457): `fillDentists(V.dentist, …, V.dentist.value, keptName(V.dentist))`
  - `B.date` (line 586) and `B.now` (line 502): the same with `B.dentist`.
- **Book:** `const bkFree = initFreeTimes(ctx, 'bk', { date: B.date, time: B.time, minutes: B.minutes, chair: B.chair, dentist: B.dentist, exclude: () => null, off: () => B.now.checked })`.
  - Delete `freeHint()` (lines 589–601) and `free` from `B` (line 490).
  - Every `freeHint()` call becomes `bkFree.update()`: `servicePicked` (line 582), the `B.date` listener, the `B.minutes` listener (line 587) and `openBook` (line 625).
  - `B.now` change (lines 499–511): when ticked, call `bkFree.hide()` in place of `freeHint()`; when unticked, `bkFree.update()`. The walk-in branch keeps its `M.nextFree` call unchanged.
  - Add listeners: `B.dentist` change → `bkFree.update()`; `B.chair` change → `bkFree.update()`; `B.time` input → `bkFree.mark()`. Because of `off`, none of them shows or fetches anything while "Here now" is ticked.
  - Submit: inside `if (!r.ok)`, when `r.status === 409`, add `void ctx.reload().then(() => bkFree.update({ fresh: true }))`.
- **Move:** `const vpFree = initFreeTimes(ctx, 'vp', { date: V.date, time: V.time, minutes: V.minutes, chair: V.chair, dentist: V.dentist, exclude: () => current, off: () => V.move.hidden })`.
  - `toMove()` (lines 392–396) calls `vpFree.update()` after `V.move.hidden = false`.
  - The existing `V.date` change listener also calls `vpFree.update()`.
  - Add listeners: `V.minutes` change, `V.dentist` change and `V.chair` change → `vpFree.update()`; `V.time` input → `vpFree.mark()`.
  - In `patch()` (lines 419–432), on `!r.ok`, when `r.status === 409 && !V.move.hidden`, add `void ctx.reload().then(() => vpFree.update({ fresh: true }))`.
  - The Place it pre-fill (lines 375–384) is unchanged.
- **`Panels` gains `changed(days)`:** `if (B.panel.open) bkFree.changed(days); if (V.panel.open) vpFree.changed(days);`. It is added to the returned object (line 712).

### 4.6 `src/components/ws/cal/cal.css` (inside `@layer components`)

Delete `.bk-free:not(:empty) { margin-top: -0.375rem; }` (line 481) and add:

```css
.ft { display: grid; gap: 0.5rem; margin-top: -0.375rem; }
.ft[hidden], .ft-next[hidden] { display: none; }
.ft-next { display: grid; gap: 0.5rem; }
.ft-head { font-size: 14px; font-weight: 600; line-height: 1.4; color: var(--c-ink); }
.ft-row { display: grid; grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr)); gap: 0.5rem; }
.ft-row:empty { display: none; }
.ft-chip {
  display: grid; justify-items: start; align-content: center; min-height: 44px; min-width: 44px; padding: 0.375rem 0.75rem;
  border: 1px solid var(--ws-field-line); border-radius: var(--ws-r-ctl); background: var(--c-surface); color: var(--c-ink);
  text-align: left; font-variant-numeric: tabular-nums; cursor: pointer;
}
.ft-chip:hover { border-color: var(--ws-field-line-hover); background: var(--ws-subtle); }
.ft-chip:focus-visible { outline: 2px solid var(--ws-teal); outline-offset: 2px; }
.ft-a, .ft-b { display: inline-flex; align-items: center; gap: 0.25rem; white-space: nowrap; }
.ft-a { font-size: 15px; font-weight: 600; line-height: 1.3; }
.ft-b { font-size: 13px; font-weight: 500; line-height: 1.3; color: var(--c-ink-2); }
.ft-tick { display: none; flex: none; }
.ft-chip[aria-pressed="true"] { background: var(--ws-teal-tint); border-color: var(--ws-teal); box-shadow: inset 0 0 0 1px var(--ws-teal); color: var(--ws-teal-ink); }
.ft-chip[aria-pressed="true"] .ft-b { color: var(--ws-teal-ink); }
.ft-chip[aria-pressed="true"] .ft-tick { display: inline-block; }
/* The move form is already the teal tint (.vp-move): there the chosen chip is white with a stronger ring. */
.vp-move .ft-chip[aria-pressed="true"] { background: var(--c-surface); box-shadow: inset 0 0 0 2px var(--ws-teal); }
.ft-say, .ft-note { font-size: 13.5px; line-height: 1.45; color: var(--c-ink-2); }
.ft-say:empty, .ft-note:empty { display: none; }
```

- **Hover** uses `--ws-subtle`, which is opaque (as `.ws-btn-quiet:hover` does), so a chip never shows the tint behind it. A chosen chip keeps its colours on hover because its rule comes later with equal or higher specificity.
- **Widths**, measured in headless Chromium with the site's font stack falling back to DejaVu Sans:
  - "Wed 30 Sep" at 15/600 is 100px, so the widest first line is 126px of a 128px chip.
  - "12:45 pm" plus the check is 123px.
  - Chips per row at 390: two in Book (316px) and two in Move (278px). At 1440: three in Book (430px) and four in Move (552px).
- **Contrast**, computed from the tokens (§6.4 measures it on screen):
  - Chosen teal-ink on teal tint: 5.32:1 light, 7.69:1 dark.
  - Teal-ink on white inside `.vp-move`: 5.91:1 light; on the surface in dark: 9.87:1.
  - The ring against the tint (non-text): 3.50:1 light, 4.79:1 dark.
- Only tokens are used. Both theme twins already exist in `global.css`, so no dark rule is added.
- No motion is added and nothing is gated on reduced motion.

## 5. What must not change

- **`nextFree`'s answers**: the Dashboard's count line ("next free: Chair N at …", "fully booked", "no free time left today") and the walk-in's chair pick. They are proven identical in §6.1. `nextFree` passes no `pool` and no turnover.
- **`/api/schedule` GET/POST/PATCH** stay as they are, with `findClash`, `HOLDS_SLOT`, `NEXT_STATUS`, `applyStatus`, the advisory lock and re-check, `dropStaleTexts`, and the texts sent. A chip never writes. Save is still the one write, and the server still decides.
- **Typing a time works as before.** `step="900"` stays. No field becomes required. A back-to-back typed booking is still accepted, and so is a typed time past the capacity count.
- **Place it** still pre-fills the first chair free at the asked time.
- **One teal fill per panel:** Save booking, Save new time or Place it. Chips are quiet; the chosen chip is tint plus ring (white plus ring in the move form).
- **The live board:** its 30-second refresh, `LIVE_KEYS`, the rule not to refill the visit panel while the move form is open, no refresh under a drag, and the view `cache` semantics. `ahead` is separate. `refresh()` only becomes awaitable, may be forced past the visibility check by `reload`, and reports the days it changed.
- **`fillDentists`** lists the same dentists. The date listeners only pass the kept dentist's name.
- **People without `schedule.edit`:** nothing new is shown or fetched.
- **The public side is untouched:** `/find/`, `openSlots`, `slotsFor`, `statusFor`, `src/lib/availability.ts` and `src/lib/directory-db.ts`.
- **Status colours** stay the `QUEUE` classes only. Amber and red keep their meanings; chips use neither.
- **Nothing assumes** dentist hours within a day, lunch, leave, holidays, a turnover or course-step return intervals.

## 6. Verification plan

**Setup:**
1. Run `npm run db:setup`, then `npm run build`.
2. Start `PORT=4399 HOST=127.0.0.1 node dist/server/entry.mjs` in the background, on a new port. Never pkill astro.
3. Sign in at `/auth/login/?any=1` as `liwayway.domingo@example.com` / `flossify`. She owns Session Road and her role is owner, so the Dashboard opens on Everyone and Book on Any dentist.
4. Session Road's data from the seed:

   | | |
   |---|---|
   | Chairs | 4 |
   | Hours | Mon–Fri 9–6, Sat 9–3, Sun closed |
   | Dr. Domingo | Mon–Sat |
   | Dr. Cariño | Tue, Thu |
   | Dr. Tabanao | Mon, Wed, Fri |

   The seed books only today, every visit with no chair and with Dr. Domingo.
5. Dates are worked out from `boot.today`, never hard-coded. **W** is the next Wednesday after today.
6. **Seed W.** Placed visits go through `POST /api/schedule` as the owner. The rest are made by SQL in the dev database. Ids are recorded.
   - V1: Domingo, chair 1, 9:00–10:00.
   - V2: Tabanao, chair 2, 9:30–10:30.
   - V3: Any dentist, chair 3, 11:00–11:45.
   - V4: Domingo, chair 4, 13:00–14:00, then set to `completed` by SQL.
   - V5: Tabanao, chair 4, 15:00–16:00, then set to `no_show` by SQL.
   - V6: an unplaced web booking, inserted by SQL: `source 'web'`, chair null, dentist null, 14:00–14:45.
   - V7: an unplaced request, inserted by SQL: `source 'request'`, `moved_at` null, chair null, dentist null, 10:00–10:30.
7. Scripts go in the session scratchpad. Steps 1–6 run within 60 s of each other, so `ahead` still holds what they read.

### 6.1 Model check (`free-model-check.ts`)

Bundle and run with `node_modules/.bin/esbuild free-model-check.ts --bundle --platform=node --format=esm --outfile=free-model-check.mjs && node free-model-check.mjs`. Results are compared by field, not by key order.

**Equivalence:**
- Paste the old `nextFree` body from main (`model.ts:244–256`) verbatim as `oldNextFree`.
- Run 10,000 random days:
  - chairs 1–4;
  - 0–14 visits with starts on a 5-minute grid from 7:00 to 19:00, lengths 5–150;
  - statuses from all eight, chairs null or 1–5, dentists null or one of three;
  - hours ∈ {null, [480,1020], [490,1080], [540,1080], [540,900]};
  - `isToday` random, with `now` random in the day.
- **Expect 0 differences** from `nextFree`. This was run on §4.1's code: 0.

**Oracle:**
- An independent brute force checks every start minute by minute against every hold. It writes the §1 rules out separately: the chair count less the unplaced visits, the day's dentists less the busy ones and the Any-dentist visits, `'all'` and `null` scopes, and turnover padding on chair holds only.
- It builds holes as arrays for `pickStarts`, including `at`.
- Run 5,000 random asks:
  - random dentist, anyOf and pool, preferChair and excludeId;
  - turnover 0 or 10, minutes 15–120;
  - 20% with an extra block row (chair ∈ {2, 'all', null}, dentist ∈ {id, 'all', null});
  - an `at` half the time;
  - limit 4, `gap = chipGap(...)`.
- **Expect 0 differences.** This was run on §4.1's code: 0.

**Fixtures.** Unless said otherwise: hours [540, 1080] (9–6), chairs 2, from 540, **turnover 0**, pool on.

| Fixture | Input | Expect |
|---|---|---|
| B | chair 1 9:00–9:40; chair 2 9:00–10:00; 30 min; turnover 10 | first `{600,1}`. `pickStarts` over all starts with gap 60 and no `at`: `[{600,1},{660,1},{720,1},{780,1}]` |
| B′ | B with turnover 0 | first `{585,1}` (9:45) |
| TG | 1 chair; visit 9:00–9:45; 45 min | turnover 10: `{600,1}` (a 15-minute gap after rounding); turnover 0: `{585,1}` |
| C | dentist D in chair 2 10:00–11:00; ask D, 30 min, from 600 | `{660,1}`: chair 1 is free at 10:00, but D is not |
| D | 1 chair; visit X 10:00–10:30; excludeId X; from 600 | `{600,1}` |
| E | 1 chair; hold 9:00–17:20; 45 min; limit 4 | `[]` (17:30 + 45 > 18:00) |
| E′ | 1 chair; hold 9:00–17:15; 45 min | `[{1035,1}]` (ends exactly at 18:00) |
| F | 3 chairs; D1 in chair 1 and D2 in chair 2, both 10:00–11:00; anyOf [D1,D2]; from 600 | `{660,1}`, not 10:00 in chair 3 |
| F′ | F with turnover 10 | `{660,3}` (chairs 1 and 2 are readied until 11:10) |
| H | completed and no-show visits covering the day; ask D | don't block; `{540,1}` |
| P1 | 4 chairs; four unplaced visits 10:00–10:45; from 600 | pool: `{645,1}`; pool off (nextFree's rule): `{600,1}` |
| P2 | anyOf [D]; an Any-dentist visit in chair 1 10:00–10:45; Any dentist; from 600 | `{645,1}` (the only dentist is taken) |
| P3 | P2, but ask dentist D | `{645,1}`; with anyOf [D,E]: `{600,2}` |
| L1 | 1 chair; block `{12:00–13:00, chair 'all', dentist 'all'}` | from 720: `{780,1}`; from 690: `{690,1}` (ends as lunch starts); pool off: `{780,1}` |
| L2 | block `{9:00–18:00, chair null, dentist D}` (leave) | ask D: `[]`; Any with anyOf [D,E]: `{540,1}`; Any with anyOf [D]: `[]` |
| L3 | block `{9:00–18:00, chair 1, dentist null}` (chair out of use) | `{540,2}` |
| Light day | 4 chairs, nothing booked, 30 min | `chipGap` = 150; no `at`: 9:00, 11:30, 2:00, 4:30; `at` 9:00: the same; `at` 15:00: 9:00, 11:30, 3:00, 4:30 |
| Tapped cell | the light day, `preferChair` 3, `at` 3:15 pm | `[{540,3},{690,3},{915,3},{990,3}]` |
| Gaps | `chipGap` | Sat 9–3: 90; today from 2 pm: 60; 90 minutes on 9–6: 150 (9:00, 11:30, 2:00, 4:30) |

**`freeDays`** (Cariño [2,4], Domingo [1–6], hours as Session Road, 4 chairs, 45 min):
- after = Mon 5 Oct, `at` null: Tue 6 Oct 9:00 and Thu 8 Oct 9:00.
- after = Sat 3 Oct, `at` 2 pm: Tue 6 Oct 2:00 and Thu 8 Oct 2:00.
- `at` 5:30 pm (cannot fit by 6:00): falls back to each day's 9:00.

**`daysText`:** [1–6] → "Mon–Sat"; [2,4] → "Tue, Thu"; [1,3,5] → "Mon, Wed, Fri"; [0,1,2,4] → "Sun–Tue, Thu"; [1,2] → "Mon, Tue".

### 6.2 Playwright (`free-check.mjs`, chromium at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`)

**Oracle and request count:**
- Fetch `GET /api/schedule` for the same range inside the page (same cookies). Compute the expected chips with 6.1's brute force, taking `at` from the form's Time field and the day's dentists from `boot.staff`.
- Count requests with `page.on('request')` for URLs matching `/api/schedule?`.

1. **Open Book.** Open `/c/session-road/?new=booking`, then set the date input to W (dispatch change).
   - `[data-bk-free]` does not exist, and `[data-bk-slots]` is visible (no `hidden` attribute).
   - The head reads "Free for 30 minutes on Wed …".
   - Chip starts and chairs equal the oracle (Any dentist; anyOf = Domingo and Tabanao; V6 and V7 counted; V4 and V5 not). There are at most 4 chips, each rect ≥ 44×44.
   - No start overlapping 10:00–10:30 is offered: Tabanao has V2 and V7 needs the one dentist left.
   - The note reads "Saving checks the book again.", preceded by the count sentence exactly when the oracle without the count offers more starts.
   - `-next` is hidden.
   - GETs: exactly 1 (W is not on screen), for 8 days from W.
2. **Tap the second chip.**
   - The time input equals its `hh:mm`, and the chair select equals its chair.
   - Only that chip has `aria-pressed="true"`, and `document.activeElement` is that chip.
3. **Type a time that is not a chip.** No chip is pressed.
4. **Pick the service "Root canal"** (90 minutes).
   - The head reads "Free for 90 minutes on Wed …".
   - The chips equal the oracle for 90 minutes, `at` = the typed time, and gap `chipGap(90, …)`.
   - GETs: 0.
5. **Choose Dr. Cariño.** Set the date to W+1 (Thursday), choose Dr. Cariño, then set the date back to W. He is kept as "Dr. Ramon Cariño · not in on Wed".
   - The say line reads "Dr. Cariño is not in on Wednesdays.", and the day row is empty.
   - `-next` is visible, with head "Next free with Dr. Cariño".
   - Up to 2 chips, on W+1 and W+6 (Tuesday), equal the oracle's `freeDays` with `at` = the form's time.
   - The next note reads "Going by the days Dr. Cariño is in (Tue, Thu), not their hours."
   - GETs: 1 when the date moves to Thursday (8 days from W+1); 0 when Cariño is chosen; 0 when the date moves back (both ranges are held).
6. **Tap the first next-free chip.**
   - The date is W+1, and the dentist select is still Cariño.
   - The day row is redrawn. The chip at the tapped start and chair is pressed and focused.
   - GETs: 0.
7. **Save booking.**
   - The response is 201, and the toast reads "Booked: …, Thu …, Chair N, Dr. Cariño."
   - SQL 1 below returns 0 rows involving the new id.
8. **Next Sunday**, Any dentist: "The clinic is closed on Sundays." and no `-next`.
   - Choose Domingo on the Saturday before, then set the date to Sunday: the same say line, and `-next` lists Monday and Tuesday.
9. **Walk-in and minutes.**
   - Tick "Here now": `[data-bk-slots]` has the `hidden` attribute.
   - With it still ticked, change Dentist, Chair, Date and Service. The attribute stays and 0 GETs are made.
   - Untick it: the block is back.
   - Open More details and set Minutes to 3. The head reads "Free times", and the say line reads "Set the length (5 to 480 minutes) to see free times."
10. **Yesterday:** "That day has passed."
    - With Cariño (chosen on one of his days first), `-next` starts from today.
11. **Race.** Contexts A and B are both signed in, and both show W on the calendar (day view).
    - Both open Book on W, pick a patient and Any dentist, and tap the same chip. A saves (201). Then B saves:
      - B gets 409, and the error callout reads "Chair N has … until …."
      - B's board reloads (GETs for today and W), and A's visit is on B's calendar.
      - B's block then makes exactly 1 fresh GET (8 days from W, not from `ahead`), and B's chips no longer offer that start on that chair.
    - B then changes the service and back. The refused start on that chair is still not offered.
    - SQL 2 returns 1.
12. **Move.** Open V1 (W 9:00, Domingo) and press Move.
    - `[data-vp-slots]` is visible inside `[data-vp-move]`.
    - The head reads "Free for 60 minutes with Dr. Domingo on Wed …".
    - Chips equal the oracle with V1 excluded. The 9:00 chip on chair 1 is pressed, with a white background and a 2px ring.
    - Change Minutes to 90: the chips are redrawn. Change Dentist: the chips are redrawn.
    - Tap another chip, then Save new time: PATCH 200 and "Moved: …". SQL 1 returns 0 rows.
13. **Place it.** Open V7 from the lane and press Place it.
    - Before any tap, the chair select equals the first chair free at 10:00 (chair 1, as on main), and the 10:00 chip on chair 1 is shown and pressed (V7 is excluded, so Domingo is free).
    - Tap another chip, then Place it: 200 and "Placed: …".
14. **Viewer.**
    - Settings → Roles → Add role "Viewer" with Records only (no "Book, move and check in visits"), and give it to Dr. Tabanao.
    - Signed in as Tabanao, New booking shows "Your role cannot book visits here. Ask the owner."
    - Open a visit and press Move: `[data-vp-slots]` stays hidden and 0 GETs are made.
15. **Live board.** B opens Book on today (the day on screen) with focus on chip 1. A books chip 2's time and chair through `POST /api/schedule`.
    - Within 35 s (the 30-second refresh), and with no action by B, B's chip 2 is gone and focus is still on chip 1.
16. **Unchanged lines.** Read `[data-cal-count]` for today to today+13 on this build and on a main build at the same database state: identical.
17. **Reduced motion.** Run steps 1–6 again with `reducedMotion: 'reduce'`: identical results.
18. **Keyboard.** From the Dentist select, Tab reaches chip 1…4, then the next chips, then "More details".
    - Enter on a chip fills the fields and does not submit the form (`type="button"`).
    - The focus ring is visible (outline width 2px).

### 6.3 SQL checks

```sql
-- 1. No two slot-holding visits share a chair or a dentist (rows made by the test).
select a.id, b.id from appointment a join appointment b
  on b.clinic_id = a.clinic_id and a.id < b.id and a.starts_at < b.ends_at and b.starts_at < a.ends_at
 and (a.chair = b.chair or a.dentist_id = b.dentist_id)
 where a.clinic_id = (select id from clinic where slug = 'session-road')
   and a.status not in ('cancelled','no_show','completed') and b.status not in ('cancelled','no_show','completed')
   and (a.id = any($1) or b.id = any($1));          -- expect 0 rows
-- 2. The race left one visit at that start and chair.
select count(*) from appointment where clinic_id = (select id from clinic where slug='session-road')
   and starts_at = $1 and chair = $2 and status <> 'cancelled';   -- expect 1
```

Also check that no migration file was added and that this feature leaves `schema_migrations` unchanged.

### 6.4 Contrast, targets and 390px

- **Themes:** device light, device dark (`colorScheme` emulation), chosen dark and chosen light (`localStorage.theme`).
- **Sizes:** 1440×900 and 390×844.
- **What is measured:** the Book panel and the Move form, in rest, pressed and hover states:
  - `.ft-head`, `.ft-a`, `.ft-b`, `.ft-say`, `.ft-note`, including the pressed `.ft-a` and `.ft-b` in both places.
- **How:**
  - Set the element's words to `color: transparent`, screenshot its box, and take the pixel with the **lowest** ratio against the computed text colour.
  - The panel is `--ws-glass-strong`, so open it over the busiest calendar area.
- **Expect:**
  - Every ratio ≥ 4.5. Record the measured values.
  - From the tokens: the pressed chip in Book is 5.32 light / 7.69 dark. The pressed chip in the Move form (white) is 5.91 light / 9.87 dark.
  - The pressed ring against its ground is ≥ 3:1 (3.50 light, 4.79 dark from the tokens).
- **Targets:** every `.ft-chip` rect is ≥ 44×44.
- **Chip overflow:** at both sizes, with "Wed 30 Sep" and "12:45 pm" pressed, every `.ft-chip` has `scrollWidth <= clientWidth`.
- **390px:**
  - `document.documentElement.scrollWidth <= 390`, and `.ws-panel-inner` has `scrollWidth <= clientWidth`.
  - Test with the longest head ("Free for 480 minutes with Dr. Domingo on Wed 30 Sep") and the next chips.
  - Chips sit two per row in both Book and Move.
- **Role snapshot:** run snap/cmp (7 roles × 20 pages, the CLAUDE.md "Verified by snapshot" approach). The only expected diff is on the Dashboard: `[data-bk-free]` is gone, and `[data-bk-slots]` and `[data-vp-slots]` are added (both `hidden`).

## 7. Effort and risks

**Effort: M.** About 2 days to build and 1 day to verify.

| File | Size |
|---|---|
| `model.ts` | about 110 lines |
| `free.ts` | about 220 lines |
| `FreeTimes.astro` | about 20 lines |
| `panels.ts` | about 40 changed lines |
| `board.ts` | about 45 lines |
| `cal.css` | about 22 lines |

There is no server, database or migration work.

**Risks:**

1. **Honest only to the book's grain.** The book knows `staff_schedule` weekdays, but not a dentist's hours, lunch, leave or holidays.
   - The words say so ("Going by the days … not their hours"), and Save is still checked by the server.
   - When **040** lands, it:
     - appends its blocks as `Hold` rows with an explicit scope: `'all'` for every chair or dentist, `null` for none, a number or id for one (fixtures L1–L3 already pass);
     - clips `open` by any per-dentist hours;
     - rewords the days note.
   - Whether the Dashboard's count line (`nextFree`) should also respect blocks is 040's decision. `nextFree` answers them already if they are passed, and today they are not.
2. **Staleness.** Another desk can take a time that is still on a chip.
   - For days in the board's range (today and the range on screen), the block redraws when the 30-second refresh absorbs a change. Other days are read at most 60 s old, and redrawn on the next recompute.
   - After a 409, the board reloads and the block reads fresh.
   - The server's lock and re-check are the only guarantee, and they are unchanged.
3. **Turnover.** It is 0 until the owner decides.
   - The rule, its words and its fixtures (B, TG, F′) are ready. With n minutes the real gap is n to n+14 minutes on the quarter grid, and the words say "at least".
   - If the owner sets a number, it replaces `TURNOVER_MIN` (a constant now, or a boot value once a clinic setting exists).
   - The owner still decides whether turnover ever becomes a clash rule; this feature never makes it one.
4. **Capacity is a count, not a seating plan.**
   - It can under-offer: a visit with no chair yet that could fit on a chair freed before it starts still counts for the whole overlap.
   - It can over-offer only when the visits with no chair yet can already not all be seated.
   - It matches the public booking API's count. The server does not count unplaced visits, so a typed time still books past it, as today.
5. **Two "next free" answers.** The count line (chairs only, 30 minutes, placed visits only, unchanged by rule) can say 9:30 while the chips start later because unplaced or Any-dentist visits are counted. They answer different questions in different words. This is accepted, not unified.
6. **Overlap with p25 (Edit a booked visit).** p25 reworks the visit panel's forms. Keep `<FreeTimes hook="vp">` in the move form under its fields. If Minutes moves out of Move, re-point `minutes` in `initFreeTimes`, and keep `off` tied to whatever shows the form.
7. **Hours not on the quarter hour** (e.g. 8:10). Grid chips round up to the next quarter hour; the form's own time is checked as it is. The typed time and `nextFree` behave as before.
8. **Rate.** Suggestion GETs count toward the per-staff 600 per minute: at most one per recompute that needs data not on screen, cached 60 s, plus the board's reload after a 409.

## Review notes

Each objection was checked against the code at `d07558b`/`18a4017`. The §4.1 code was run through §6.1 (0 / 0 differences, 41 fixtures).

1. **Unplaced and Any-dentist visits hold nothing (major). Upheld and fixed.** In the old code `chairFree` and `dentistFree` compare with `===`, so null never matches. The public API counts every slot-holding overlap against chairs (`bookings/index.ts:196–201`). The seed and web bookings insert chair null (`seed.ts:159`, `bookings/index.ts:227`), and owner and desk sessions open Book on Any dentist.
   - Holds now carry `'any'`, and `freeAt` counts them against free chairs and the day's dentists (`pool`, on for suggestions, off for `nextFree`).
   - The rule is in the oracle, fixtures P1–P3 test it, and W is seeded with V6 and V7 (§0, §1, §4.1, §6).
2. **A null-scoped block blocks nothing (major). Upheld and fixed.** `Hold` scope is now explicit on each side (number/id, `'any'`, `'all'`, `null`), and `freeAt` treats `'all'` as blocking. Fixtures L1–L3 cover a clinic-wide lunch, a dentist's leave and a chair out of use. The "no change needed" claim is replaced in §7.1.
3. **The walk-in shows chips again (major). Upheld and fixed.** `FreeFields.off` (`() => B.now.checked`; for Move, `() => V.move.hidden`) hides the block and stops fetching in every update. Step 9 now changes Dentist, Chair, Date and Service while ticked and expects `hidden` and 0 GETs.
4. **The 409 recovery does not last, and nothing redraws the block (major). Upheld and fixed.**
   - `ctx.reload()` awaits the live board's refresh. On a 409 the board reloads before a fresh read, so later reads of the board are current and the other desk's visit is drawn.
   - `refresh()` reports changed days to `panels.changed`, which redraws an open block while keeping focus by time and chair.
   - Steps 11 and 15 check both.
5. **10 minutes of turnover becomes 15 on the grid (major). Upheld and fixed.** `TURNOVER_MIN = 0` until the owner decides. The option, its honest words ("at least n minutes … then the next quarter hour") and fixtures B, TG and F′ stay ready.
6. **Chips never reach the afternoon, and the form's time is ignored (major). Upheld and fixed**, with one adaptation.
   - `pickStarts` anchors on the form's time (pressed when its chair matches too), then takes the candidates after it, then the ones before it. `chipGap` spreads a light day: 9:00, 11:30, 2:00, 4:30. `freeDays` takes the form's clock time.
   - The adaptation: the chips are shown in time order rather than with the anchor always first, because times read in order. The pressed state marks the anchor.
7. **Verification steps would fail or cannot run (minor). Upheld and fixed.**
   - (a) F is now at turnover 0 → `{660,1}`, and F′ at turnover 10 → `{660,3}`. E was also wrong at turnover 0 and is now 9:00–17:20 → `[]`, plus E′.
   - (b) GET counts follow the 60 s `ahead` cache (steps 4–6 expect 0 where held).
   - (c) Dentists are chosen on one of their days, then the date changes (steps 5, 8 and 10).
   - (d) V7 is inserted by SQL as a request (step 13).
   - (e) W is seeded with placed visits across dentists, an Any-dentist visit, a completed visit, a no-show and an unplaced web booking.
8. **The chosen chip blends into the Move form's tint (minor). Upheld and fixed.** Inside `.vp-move` the chosen chip is white with a 2px teal ring (5.91 light / 9.87 dark from the tokens, measured in §6.4). Hover also moved to the opaque `--ws-subtle`.
9. **Stale head, "Dentist" as a name, and lost focus (minor). Upheld and fixed.**
   - The head reads "Free times" when minutes are invalid.
   - The date listeners pass `keptName(...)` to `fillDentists`.
   - After a next-free tap, focus falls back to the first day chip, then to the Time field.
   - The VisitPanel reference is corrected to line 81.