# Blocked time: spec (proposal p07, migration 040)

**Blocked time the calendar and public booking both honour: lunch, closed days, a dentist's hours and leave, a chair out of use.**

This spec was written against `main` at `d07558b`. It was checked again against the working branch at `18a4017`, which changes only the record and one line of `panels.ts`.

- Migrations 036–038 are applied.
- 039 is reserved for patient intake, so this feature uses **040**.
- 041 is reserved for PTR.

This revision includes a review of the first draft against the code. What changed and why is in the appendix, "Review notes".

## 0. Where the two verifiers differed, and what this spec does

| Point | Verifier 1 | Verifier 2 | This spec |
|---|---|---|---|
| Migration number | 039 | 039 | **040**. The orchestrator reserved 039. |
| Lunch | A weekly `clinic_block` of kind lunch | `clinic_hours.break_*` | **`clinic_hours.break_from_min / break_to_min`**. `clinic_block` has no lunch kind and no weekly rows, so each fact lives in one place (verifier 1's real concern). |
| A dentist's regular hours | Weekly "away" blocks | `staff_schedule.from_min / to_min` | **`staff_schedule.from_min / to_min`**, where null means the clinic's hours. They are stored as the hours themselves, not as the time outside them, so they still hold when the clinic's hours change. |
| Kinds of dated block | closed · lunch · leave · chair_out | adds emergency_hold | **closed · leave · chair_out** |
| Emergency hold, turnover, holiday list | Defer all three | Step 2 | **Deferred** (§7) |
| What the public sees | Times, slug, chair, kind | Times and slug only | Times, slug, chair, and a **collapsed** kind (`shut`, `lunch`, `closed`, `away`, `chair`). For visits it sees times, the dentist's slug, and whether the visit has a dentist at all. It never sees a note, an author, or whether a dentist is on leave or simply not in that day. |
| Visits already booked when time is blocked | List them | List them on Calls; no text | They are listed in the Block time panel and on Calls → **In closed time**, each with its reminder's state. Nothing is cancelled and no text is sent. Whether reminders should wait is a question for the owner before release (§7.1). |
| "Any dentist" slots | Re-check the chair-count path | Close the counting gap too | One pure rule, `slotOpen()`, decides both what is offered and the re-check. It counts chairs in service, the dentists who are in, and visits booked with no dentist, on **both** the any-dentist and the named-dentist paths. This closes the CLAUDE.md "Open" item. |

One reader turns every kind into dated ranges: the SQL function `clinic_unavailable()`. The desk reads it under RLS. The public reads it through the definer function `public_blocked_ranges()`, and reads the visits through `public_busy_ranges()`.

---

## 1. What the clinic and the patient see

### 1.1 Clinic settings → Opening hours (`settings.edit`)

**Lunch on each day.**
- Each open day's row gets a second line, **Lunch**, with two time fields (step 15). The screen-reader labels are "Lunch starts on Monday" and "Lunch ends on Monday".
- The line looks muted on a day ticked Closed, and a save ignores it there.
- One line under the column heads says: "Leave lunch blank on a day with no break."
- A quiet button, **Same lunch every open day**, appears only when scripts run (it is `hidden` until the script shows it).
  - It copies the first filled lunch into every open row where that lunch fits inside the day's hours.
  - Rows it skips keep what they had.
  - A line under the button (`data-lunch-said`, `role="status"`) says what it did: "Copied to 5 days." or "Copied to 4 days. Not Saturday: 12:00–1:00 pm is outside its hours."
- The intro becomes: "Patients can book only while you are open. Lunch and closed days are never offered to them." It is followed by the link "Closed days and time off" to `#closed`.
- A refused save keeps what was typed. The problems are:
  - "Monday’s lunch needs a start and an end, or leave both blank."
  - "Monday’s lunch has to start after opening and end before closing."
  - "Monday’s lunch ends before it starts."
- Saved: "Saved."
  - If the save put visits ahead in closed time, a warn note follows. Closed time here means lunch, outside the hours, or a closed weekday. The visits counted are only those that were not in closed time before the save: "Saved. 2 visits ahead are now in closed time. They are on the call list: move them or call the patients." With one visit it reads "Saved. 1 visit ahead is now in closed time. It is on the call list: move it or call the patient." The note links to **Open Calls** (`/c/<slug>/calls/#closed-time`).
  - `?held=1` and `heldText()` behave as they do today.

### 1.2 Clinic settings → Closed days (a new section, `settings.edit`)

- This is a section of its own, right after Opening hours in the settings list:
  - id `closed`, label "Closed days", icon `calendar`;
  - the list's status word is "3 ahead" or "None ahead".
- Settings shows one section at a time, so this screen's one teal button is its own **Add closed days**. The hours Save is on another screen and cannot be pressed for it by mistake.
- The pane is `id="closed"`, titled "Closed days and time off", with meta "3 ahead" or "None ahead".
- Intro: "Days the clinic is closed and days a dentist is away. Patients cannot book them, and the calendar shows them. Philippine holidays are not added for you: Holy Week and Eid move every year, so add the days your clinic closes."
- The list shows every dated block that ends in the future, whichever screen made it, soonest first. Examples:
  - "**Clinic closed** · Thu 2 Apr – Sun 5 Apr", with the line under it "Holy week · added by Liza Santos, 28 Sep".
  - "**Dr. Cariño away** · Mon 5 Oct".
  - "**Chair 2 out of use** · Fri 9 Oct, 9:00 am–12:00 pm".
  - Each row has a quiet small **Remove** button (a form with `form=closed-remove` and `<Csrf />`). Its screen-reader text is ": Clinic closed, Thu 2 Apr – Sun 5 Apr".
- Empty: "Nothing ahead. Add a holiday, a closure or a dentist’s leave below; block a few hours from the calendar."
- **Add closed days** is a plain form (`form=closed-add`, `<Csrf />`) that works with scripts off:
  - What: two radio pills, 44 px: "The clinic is closed" and "A dentist is away".
  - Dentist: a select labelled "Dentist (when a dentist is away)", listing the dentists at this branch.
  - From: a date field.
  - Until: a date field, with the hint "Blank is one day".
  - Note: optional, with the hint "For the team; patients never see it."
  - The teal **Add closed days** button, the section's one main action.
- Refusals use the shared words in §3.3 and come back in this section with what was typed.
- Added: "Added: the clinic is closed Thu 2 Apr – Sun 5 Apr."
  - If visits are inside, a warn note follows: "1 visit is already booked in that time. Nothing was changed for it, and its reminder text still goes out. It is on the call list." It links to **Open Calls**.
- Removed: "Removed. Patients can book that time again."

### 1.3 Clinic settings → People → a person → Days at this branch

- The weekday checkboxes stay as they are.
- Under them sits `<details data-days-hours>`, open when any day already has hours. The summary is **Hours on those days**, with the hint "Blank means the clinic’s hours."
- Inside are seven rows: "Monday [from] – [to]". Only ticked days are read.
- For someone who can only read, the pane's meta becomes, for example, "Tue, Thu · Tue 1–6 pm".
- Refusals:
  - "Monday’s hours need a start and an end, or leave both blank."
  - "Monday’s hours end before they start."
- Saved: "Saved Dr. Cariño’s days."
  - If this person's visits ahead fell outside their hours because of this save, the sentence continues: " 1 visit ahead is now outside their hours: it is on the call list." It counts only this person's visits that the save moved into closed time, never other people's.
- Who may change this does not change: the person themselves, or someone who manages them.

### 1.4 Dashboard (the calendar), for anyone who may open it

**The grid.**
- Blocked time is drawn hatched, with the same `--cal-hatch` as closed hours.
- The words sit on a **solid** chip (`ws-pill ws-tint-slate`), never on the hatch. The chip is drawn only when the block is at least 24 px tall.
- The hatched area takes no clicks, so clicking a lane still opens New booking at that minute, as it does today.

Which blocks each view draws:

| View | Drawn in every column | Drawn in its own column only |
|---|---|---|
| Day, by chair | Lunch ("Lunch"), Clinic closed ("Closed" or "Closed · Holy week") | A chair out of use ("Out of use") |
| Day, by dentist | Lunch, Clinic closed | Leave ("Away"), the dentist's regular hours ("Not in") |
| Week | Lunch, Clinic closed | A dentist's leave and hours, only when one dentist is filtered |

- Weekly closed hours keep the existing `.cal-closed` drawing, unchanged.
- **The strip** lists dated blocks only, meaning the ones someone added and might remove.
  - `<ul class="cal-blocks" data-cal-blocks aria-label="Blocked time">` sits between the lanes and the grid, with the visual label "Blocked".
  - Each item is a button (a 32 px pill in a 44 px hit box): "Closed all day · Holy week", "Dr. Cariño away · 9:00 am–12:00 pm", "Chair 2 out of use · until 3:00 pm".
  - In the week view each item starts with its day: "Thu 2 · …".
  - The strip is hidden when there are no dated blocks.
- **The count line** gains " · lunch 12–1 pm". On a day a block closes wholly, it says "closed all day" instead of "next free…".
- **Empty day text** replaces "A visit can still be booked on it" with "The clinic is closed on this day. A booking here asks you to confirm first." When a block closes the day, its note is added: "The clinic is closed on this day (Holy week). …"
- **The week view's column head** says "closed" for a day a block closes wholly.
- **Phone list.** A block reads as a non-interactive line among the cards, in time order: "Lunch · 12:00–1:00 pm".
- **Print.** One line goes under the caption: "Blocked: Lunch 12–1 pm; Dr. Cariño away".

**Block time, for `schedule.edit` only.** It opens from three places:
- the calendar's **More** menu (item "Block time", hint "A closed day, a dentist away, a chair out of use");
- **+ New → Block time** on any workspace page (`/c/<slug>/?new=block`);
- a strip pill, which opens the panel in view mode. Anyone who may open the calendar can open view mode.

The side panel is `BlockPanel.astro`, `id="block"`, titled "Block time", meta "Calendar".

- **What is blocked**: three radio pills, 44 px each:
  - "The clinic is closed", hint "A holiday, a typhoon, a meeting".
  - "A dentist is away", hint "Leave, a seminar, sick".
  - "A chair is out of use", hint "A repair, a delivery".
- **Dentist** is shown for away. It defaults to the filtered dentist, else the first one. **Chair** is shown for a chair.
- **All day** is ticked by default. From: a date, plus a time when not all day. Until: the same.
  - Defaults: the day on screen, and 12:00–1:00 pm when not all day.
- **Note for the team (optional)**, with the hint "Patients never see it; they see only that the time is not open."
- A line: "Visits already booked in that time stay as they are; you will see them listed."
- For `settings.edit`, another line: "Lunch and a dentist’s regular hours are set in Clinic settings." It links to `settings/#hours`.
- Buttons: teal **Block this time**, quiet **Cancel**.
- Saved:
  - A success callout: "Blocked: the clinic is closed Thu 2 Apr – Sun 5 Apr."
  - When visits are inside, a warn callout: "2 visits are already booked in this time. Nothing was changed for them, and their reminder texts still go out. Move each one or call them."
    - Under it is one row per visit, soonest first: the name, the time, the chair, the dentist, and the reminder's state in the Calls page's words ("Reminder queued for 6:00 pm", "Reminder goes the day before", "No reminder: no mobile on file").
    - Each row has a quiet **Show** button that closes the panel and opens that visit.
    - The callout ends with the link **Open Calls**.
- View mode, for a dated block:
  - The title is the block's label. It lists When, Note, and Added by (name, date).
  - A quiet **Remove this block** button, rendered only when `boot.canSchedule`. There is no teal button in this mode.
  - Pressing Remove shows the callout "Remove it? Patients can book this time again." with **Yes, remove it** and **Not now**, both quiet.
  - After removing, a toast: "Removed: Dr. Cariño away, Tue 6 Oct. Patients can book that time again."
- Refusals appear in the panel with the server's sentence (§3.3).
- A role without `schedule.edit` sees no entry point that changes anything. If it forges a call it gets 403 "Your role cannot change the schedule here. Ask the owner."

**Booking or moving into blocked time: a soft stop.**
- **New booking.**
  - When the chosen day, time, chair and dentist fall in a loaded block, or outside the weekly hours, an amber line `data-bk-block` shows before save. For example: "Lunch is 12:00–1:00 pm. Saving asks you to confirm."
  - On save the server answers 409 with `blocked: true`. The panel's error callout shows the sentence and a quiet **Book anyway** button.
  - Book anyway re-sends with `anyway: true`. The toast reads "Booked: Ana Reyes, Mon 5 Oct, 12:15 pm, Chair 1. It is in closed time (lunch)."
- **A walk-in is never soft-stopped.** The patient is at the desk: before opening, at lunch, or as an emergency on a closed day.
  - While **Here now** is ticked, `data-bk-block` stays hidden.
  - The server accepts the walk-in without asking and records that it sits in closed time (§3.7).
  - The toast stays today's "Checked in: …".
- **Move** (the visit panel's form) works the same way, with **Move anyway**, or **Place anyway** for a web request. The move note (formerly `closedNote`) says the block sentence while the fields point into one.
- **Drag.** A card dropped into a block goes back to where it was. The error toast gives the sentence and a **Move anyway** button (`data-cal-anyway`).
- **A clash with another visit** is still a hard 409 with today's sentence ("Chair 1 has Ana Reyes until 10:30 am."). There is no Anyway on a clash, a clash always wins over a block, and walk-ins still get the clash check.
- The soft-stop sentences:
  - "The clinic is closed on Sundays."
  - "The clinic opens at 9:00 am on Mondays."
  - "The clinic closes at 5:00 pm on Mondays."
  - "Lunch is 12:00–1:00 pm."
  - "Dr. Cariño is not in on Saturdays."
  - "Dr. Cariño is in from 1:00 pm on Mondays."
  - "Dr. Cariño is in until 12:00 pm on Mondays."
  - "The clinic is closed Thu 2 Apr – Sun 5 Apr (Holy week)."
  - "The clinic is closed 2:00–5:00 pm on Fri 9 Oct."
  - "Dr. Cariño is away Mon 5 Oct (seminar)."
  - "Chair 2 is out of use until 3:00 pm."
- The booking panel's "next free" hint, the walk-in's chair and the count line all skip blocked time: clinic-wide ranges, the chair's own chair-out ranges, and, when a dentist is chosen, that dentist's leave and hours. The hint is worked out again when the dentist changes.

### 1.5 Calls (`/c/<slug>/calls/`), and the inbox

- The next two open days skip days a clinic closure covers wholly.
- **Still to confirm** also lists visits kept in closed time (Keep it, Book anyway) on a day the clinic is not open that falls between today and the second open day. They appear under their own day heading, so a kept visit is never dropped from the call list.
- A new first pane, `id="closed-time"`, titled **In closed time**, icon `clock`, meta "2 visits". It is hidden when empty.
  - Intro: "Each of these visits falls in time the clinic is not open: lunch, a closed day, a dentist away or a chair out of use. Their reminder texts still go out. Move the visit, or call the patient; press Keep it when the clinic will see them then anyway."
  - Rows are soonest first, so the next reminder to go out is at the top. Each row has:
    - the name (chart number), when, and the dentist;
    - a why pill (`ws-tint-slate`: "Lunch 12:00–1:00 pm", "Clinic closed · Holy week", "Dr. Cariño away", "Chair 2 out of use", "Outside opening hours", "Dr. Cariño not in then");
    - the reminder's state in the same words and icon as Still to confirm (`reminderWords`);
    - the mobile as a `tel:` link.
  - Buttons:
    - quiet **Move**, a link to `/c/<slug>/?date=<ymd>&booking=<id>`;
    - quiet **Keep it**, a form with `intent=keep` that needs `schedule.edit`.
  - Kept: "Kept in closed time: Ana Reyes, Thu 2 Apr, 10:00 am."
- **Print.** The call sheet (`.cs-sheet`) gets an "In closed time" table before the others, with columns Time, Name, Mobile, Why, Reminder, Outcome. It is left out when empty.
- **The inbox** (the top bar, `Clinic.astro`) gains a row for people with `schedule.edit`: "In closed time, next 2 weeks", with its count. It links to `/c/<slug>/calls/#closed-time`, is counted in the total, and is left out for anyone else.

### 1.6 Patients (`/find/`, `/find/<slug>/`, `/<slug>/`, `/find/<slug>/book/`, `/dentists/<slug>`)

- **Slots.**
  - They are offered only outside lunch, closures, the chosen dentist's hours and leave, and chairs out of use.
  - "Any dentist" is offered only while a chair in service **and** a listed dentist who is in are both free, after the visits booked with no dentist are covered.
  - A named dentist is offered only while that dentist and a chair in service are free, **and** the other dentists who are in and free can still cover every visit booked with no dentist.
  - A visit with a dentist who is not listed at this clinic holds a chair but no listed dentist.
- **Status pill** (Manila clock). With no lunch and no closures, every string is exactly as today. The new strings:

| When | Pill text | State |
|---|---|---|
| Open, and the next change is lunch | "Open now · lunch at 12 pm" | open |
| Within 60 minutes of lunch | "Lunch soon · 12 pm" | closing |
| During lunch | "Lunch · back at 1 pm" | closed |
| A closure starts before closing time | "Open now · until 2 pm" / "Closing soon · 2 pm" | open / closing |
| Inside a closure that ends later today | "Closed now · opens 3 pm" | closed |
| Today wholly closed | "Closed today · opens Mon 9 am" / "Closed today · opens tomorrow 9 am" | closed |
| Next opening more than 7 days away, or exactly 7 days away because a closure moved it there | "Opens Mon 13 Apr, 9 am" | closed |
| Hours on file, nothing open within 30 days | "Closed for now" | closed |

- **Open now** on `/find/` follows the pill. `/find/` reads the same 31 days of closures as the clinic page, so a card and its clinic page never disagree, and Holy Week is filtered out.
- **Hours table.** "Monday · 9 am – 6 pm · lunch 12 pm – 1 pm".
  - Under it, when there are any, the heading "Closed days ahead" (`data-closed-list`) lists entries like "Thu 2 Apr – Sun 5 Apr: closed" and "Fri 9 Oct: closed 2 pm – 5 pm".
  - It covers the next 30 days only and never shows a note.
- **Dentists.** The tag becomes "Here Tue 1–6 pm · Thu". It appears on ClinicPage, in the book page's pick line and note, and on the dentist's own page `/dentists/<slug>`.
- **Request mode** (`book.astro`):
  - Under Preferred day, `data-closed-days` says "Closed on: Thu 2 Apr – Sun 5 Apr." With a dentist chosen it adds "Dr. Cariño is not in on: Tue 6 Oct." That line covers days in the next 30 when the dentist is normally in and is wholly away.
  - A refused request gets one of:
    - "The clinic is closed on Thu 2 Apr. Pick another day."
    - "The clinic is closed then on Thu 2 Apr. Pick another time of day."
    - with a dentist chosen: "Dr. Cariño is not in on Tue 6 Oct. Pick another day, or any dentist." or "Dr. Cariño is not in then on Tue 6 Oct. Pick another time of day, or any dentist."
  - The public side never tells leave from a regular day off, so both read "not in".
  - The request's placeholder time never lands in lunch or in the chosen dentist's time away.
- **Live booking into a blocked slot** (a stale page, or a script sending `anyway`) gets today's words: 409 "That slot has just gone. Pick another." The public API never reads `anyway`.

---

## 2. Data: `src/data/migrations/040_blocked_time.sql`

```sql
-- 040 — blocked time: lunch, closed days, a dentist's hours and leave, a chair out of use, honoured by
-- the public slots, the booking API, the status pill, the desk's calendar and its clash rule.
--
-- The weekly shape lives with the week: lunch is a break on clinic_hours; a dentist's hours are from/to on
-- staff_schedule (null = the clinic's hours). Dated exceptions live in clinic_block (no weekly rows, no
-- lunch kind: one fact, one place). clinic_unavailable() turns all of it into dated ranges and is the only
-- thing that does: the desk reads it under row-level security, the public through public_blocked_ranges(),
-- which never returns a note, an author, or whether a dentist is on leave or simply not in. The public slot
-- rule reads visits through public_busy_ranges(): times, the dentist's slug, and whether there is a dentist.
-- Deferred on purpose, for the owner to decide: a turnover buffer, a protected emergency hold, and a list of
-- Philippine holidays (Holy Week and Eid are proclaimed each year; nobody here keeps such a list current).

-- 1. Lunch: one break a weekday, inside the day's hours. A CHECK that comes out NULL passes, so "both ends
--    or neither" is its own check; with it, the second check always has both ends to compare.
alter table clinic_hours
  add column if not exists break_from_min smallint,
  add column if not exists break_to_min   smallint;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'clinic_hours_break_pair') then
    alter table clinic_hours add constraint clinic_hours_break_pair check (num_nonnulls(break_from_min, break_to_min) in (0, 2));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'clinic_hours_break_ok') then
    alter table clinic_hours add constraint clinic_hours_break_ok check (
      break_from_min is null
      or (break_from_min > open_min and break_to_min < close_min and break_to_min > break_from_min));
  end if;
end $$;

-- 2. A dentist's hours on a day they are in. Null, null = the clinic's hours that day. Both or neither.
alter table staff_schedule
  add column if not exists from_min smallint,
  add column if not exists to_min   smallint;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'staff_schedule_hours_pair') then
    alter table staff_schedule add constraint staff_schedule_hours_pair check (num_nonnulls(from_min, to_min) in (0, 2));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'staff_schedule_hours_ok') then
    alter table staff_schedule add constraint staff_schedule_hours_ok check (
      from_min is null
      or (from_min between 0 and 1439 and to_min between 1 and 1440 and to_min > from_min));
  end if;
end $$;

-- 3. Dated blocks. Removed, never deleted or edited: a block that was wrong is removed and a new one added.
create table if not exists clinic_block (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinic(id) on delete cascade,
  kind        text not null check (kind in ('closed', 'leave', 'chair_out')),
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  dentist_id  uuid references staff(id) on delete cascade,
  chair       smallint check (chair is null or chair >= 1),
  note        text check (note is null or length(btrim(note)) between 1 and 200),
  created_by  uuid references staff(id) on delete set null,
  created_at  timestamptz not null default now(),
  removed_at  timestamptz,
  removed_by  uuid references staff(id) on delete set null,
  check (ends_at > starts_at),
  check (ends_at - starts_at <= interval '366 days'),
  check ((kind = 'leave') = (dentist_id is not null)),
  check ((kind = 'chair_out') = (chair is not null)),
  check (removed_by is null or removed_at is not null)
);
create index if not exists clinic_block_live on clinic_block (clinic_id, starts_at, ends_at) where removed_at is null;

alter table clinic_block enable row level security;
alter table clinic_block force row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'clinic_block' and policyname = 'tenant_isolation') then
    create policy tenant_isolation on clinic_block
      using (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid)
      with check (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid);
  end if;
end $$;
revoke all on clinic_block from flossify_app;
grant select, insert on clinic_block to flossify_app;
grant update (removed_at, removed_by) on clinic_block to flossify_app;

create or replace function clinic_block_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.removed_at is not null then raise exception 'A removed block stays removed; add a new one.'; end if;
  if new.removed_at is null then raise exception 'A block is only ever removed.'; end if;
  return new;
end $$;
drop trigger if exists clinic_block_guard on clinic_block;
create trigger clinic_block_guard before update on clinic_block for each row execute function clinic_block_guard();

-- 4. A visit left in closed time on purpose ("Book anyway", "Move anyway", a walk-in, Calls → Keep it).
--    Null = nobody has looked: if it sits in closed time it is on Calls → In closed time. Filled for visits
--    already on the book in step 6, after the reader exists.
alter table appointment add column if not exists blocked_ok_at timestamptz;

-- 5. Every range a clinic is not open for booking, dated, in [p_from, p_to). Invoker rights: under RLS the
--    app sees its own clinic only (another clinic's id returns nothing). At most 400 days a call: a longer
--    window raises rather than quietly drawing no lunch. Kinds:
--      shut      before opening, after closing, all of a weekday with no hours (none on file at all: open)
--      lunch     clinic_hours' break
--      hours     a dentist (treating role, with any day here) on a weekday they are not in, or outside from/to
--      closed | leave | chair_out   clinic_block rows not removed (block_id set)
create or replace function clinic_unavailable(p_clinic uuid, p_from timestamptz, p_to timestamptz)
returns table (kind text, dentist_id uuid, chair smallint, starts_at timestamptz, ends_at timestamptz, block_id uuid)
language plpgsql stable set search_path = public as $$
#variable_conflict use_column
begin
  if p_to - p_from > interval '400 days' then
    raise exception 'clinic_unavailable reads 400 days at most at a time';
  end if;
  if p_to <= p_from then return; end if;
  return query
  with day as (
    select g::date as ymd, extract(dow from g)::smallint as dow, (g::date::timestamp at time zone 'Asia/Manila') as t0
      from generate_series((p_from at time zone 'Asia/Manila')::date::timestamp,
                           (p_to at time zone 'Asia/Manila')::date::timestamp, interval '1 day') g
  ),
  known as (select exists (select 1 from clinic_hours ch where ch.clinic_id = p_clinic) as yes),
  treats as (
    select distinct ss.staff_id from staff_schedule ss join staff st on st.id = ss.staff_id
     where ss.clinic_id = p_clinic and st.disabled_at is null and st.role in ('owner', 'dentist', 'associate')
  ),
  r as (
    select 'shut'::text as kind, null::uuid as dentist_id, null::smallint as chair,
           d.t0 + make_interval(mins => x.a) as starts_at, d.t0 + make_interval(mins => x.b) as ends_at, null::uuid as block_id
      from day d cross join known k
      left join clinic_hours h on h.clinic_id = p_clinic and h.dow = d.dow
      cross join lateral (values (0, coalesce(h.open_min::int, 1440)), (coalesce(h.close_min::int, 1440), 1440)) x(a, b)
     where k.yes and x.b > x.a
    union all
    select 'lunch', null, null, d.t0 + make_interval(mins => h.break_from_min::int), d.t0 + make_interval(mins => h.break_to_min::int), null
      from day d join clinic_hours h on h.clinic_id = p_clinic and h.dow = d.dow
     where h.break_from_min is not null
    union all
    select 'hours', t.staff_id, null, d.t0 + make_interval(mins => x.a), d.t0 + make_interval(mins => x.b), null
      from day d cross join treats t
      left join staff_schedule w on w.staff_id = t.staff_id and w.clinic_id = p_clinic and w.dow = d.dow
      cross join lateral (values
        (0, case when w.dow is null then 1440 else coalesce(w.from_min::int, 0) end),
        (case when w.dow is null then 1440 else coalesce(w.to_min::int, 1440) end, 1440)) x(a, b)
     where x.b > x.a
    union all
    select b.kind, b.dentist_id, b.chair, b.starts_at, b.ends_at, b.id
      from clinic_block b
     where b.clinic_id = p_clinic and b.removed_at is null and b.starts_at < p_to and b.ends_at > p_from
  )
  select r.kind, r.dentist_id, r.chair, r.starts_at, r.ends_at, r.block_id
    from r where r.starts_at < p_to and r.ends_at > p_from;
end $$;
revoke all on function clinic_unavailable(uuid, timestamptz, timestamptz) from public;
grant execute on function clinic_unavailable(uuid, timestamptz, timestamptz) to flossify_app;

-- 6. Visits already on the book that sit in closed time were booked under the old rule ("a closed day is
--    allowed, but said"), so they count as seen. Here closed time is only the weekly shape: outside the hours,
--    a weekday with none, a dentist's weekday off (no lunch, no from/to and no dated block exist yet). Every
--    other visit stays null, so the first lunch or dentist's hours a clinic saves over it puts it on Calls.
--    The migration runs as the admin role (superuser or BYPASSRLS, scripts/db/migrate.ts), so
--    clinic_unavailable sees every clinic's rows here.
update appointment a set blocked_ok_at = now()
 where a.blocked_ok_at is null and a.ends_at > now() and a.status in ('booked', 'confirmed')
   and exists (select 1 from clinic_unavailable(a.clinic_id, a.starts_at, a.ends_at) u
                where u.kind = 'shut' or (u.kind = 'hours' and u.dentist_id = a.dentist_id));

-- 7. The public side of blocked time, next to public_booked_ranges (003): times, the dentist's slug and a
--    chair only, for a listed clinic. A dentist's rows read 'away' whether leave or not in; a chair's 'chair'.
create or replace function public_blocked_ranges(p_clinic uuid, p_from timestamptz, p_to timestamptz)
returns table (kind text, dentist_slug text, chair smallint, starts_at timestamptz, ends_at timestamptz)
language sql security definer stable set search_path = public as $$
  select case when u.dentist_id is not null then 'away' when u.chair is not null then 'chair' else u.kind end,
         s.slug::text, u.chair, u.starts_at, u.ends_at
    from clinic c
    cross join lateral clinic_unavailable(c.id, p_from, p_to) u
    left join staff s on s.id = u.dentist_id
   where c.id = p_clinic and c.archived_at is null and c.listed
     and (u.dentist_id is null or s.slug is not null)
$$;
revoke all on function public_blocked_ranges(uuid, timestamptz, timestamptz) from public;
grant execute on function public_blocked_ranges(uuid, timestamptz, timestamptz) to flossify_app;

-- 8. Busy time for the public slot rule (slotOpen): the dentist's slug and whether the visit has a dentist
--    at all, so a visit with a dentist who is not listed here (another branch's, disabled, no public
--    profile) holds a chair but no listed dentist. Never who is in the chair. public_booked_ranges (003)
--    stays as it is (a new column would change its return type); nothing reads it after this change.
create or replace function public_busy_ranges(p_clinic uuid, p_from timestamptz, p_to timestamptz)
returns table (dentist_slug text, named boolean, starts_at timestamptz, ends_at timestamptz)
language sql security definer stable set search_path = public as $$
  select s.slug::text, a.dentist_id is not null, a.starts_at, a.ends_at
    from appointment a
    join clinic c on c.id = a.clinic_id and c.archived_at is null and c.listed
    left join staff s on s.id = a.dentist_id
   where a.clinic_id = p_clinic and a.status not in ('cancelled', 'no_show')
     and a.starts_at < p_to and a.ends_at > p_from
$$;
revoke all on function public_busy_ranges(uuid, timestamptz, timestamptz) from public;
grant execute on function public_busy_ranges(uuid, timestamptz, timestamptz) to flossify_app;

-- 9. public_directory (014) with lunch in `hours` ([open, close] or [open, close, lunch from, lunch to]) and a
--    dentist's hours in `hours` ({dow: [from, to]}, only days that have them). Same signature: replace.
create or replace function public_directory()
returns table (
  id uuid, slug text, name text, area text, address text, phone text, about text,
  booking_mode text, walk_ins boolean, chairs smallint, founded smallint,
  philhealth_dental boolean, photo_keys text[],
  hours jsonb, hmos text[], dentists jsonb, fees jsonb, email text, maps_url text,
  dpo_name text
)
language sql security definer stable set search_path = public as $$
  select c.id, c.slug::text, c.name, c.area, c.address_line, c.phone, c.about,
    c.booking_mode, c.walk_ins, c.chairs, c.founded, c.philhealth_dental, c.photo_keys,
    coalesce((select jsonb_object_agg(h.dow, case when h.break_from_min is null
                                                  then jsonb_build_array(h.open_min, h.close_min)
                                                  else jsonb_build_array(h.open_min, h.close_min, h.break_from_min, h.break_to_min) end)
                from clinic_hours h where h.clinic_id = c.id), '{}'::jsonb),
    coalesce((select array_agg(m.hmo_id order by m.hmo_id) from clinic_hmo m where m.clinic_id = c.id), '{}'),
    coalesce((select jsonb_agg(jsonb_build_object(
        'slug', s.slug, 'name', s.full_name, 'specialty', s.specialty, 'practices', s.practices,
        'prcCheckedOn', s.prc_checked_on, 'pda', s.pda_member, 'since', s.practising_since, 'about', s.about,
        'days', (select coalesce(array_agg(ss.dow order by ss.dow), '{}') from staff_schedule ss where ss.staff_id = s.id and ss.clinic_id = c.id),
        'hours', (select coalesce(jsonb_object_agg(ss.dow, jsonb_build_array(ss.from_min, ss.to_min)), '{}'::jsonb)
                    from staff_schedule ss where ss.staff_id = s.id and ss.clinic_id = c.id and ss.from_min is not null)
      ) order by s.role = 'owner' desc, s.full_name)
      from staff s
      where s.slug is not null and s.disabled_at is null
        and exists (select 1 from staff_schedule ss where ss.staff_id = s.id and ss.clinic_id = c.id)), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
        'code', p.code, 'name', p.name, 'local', p.local_name, 'category', p.category,
        'min', p.default_price, 'max', p.price_max, 'from', p.price_from, 'unit', p.unit, 'minutes', p.minutes
      ) order by p.category, p.default_price)
      from procedure_catalog p where p.clinic_id = c.id and p.active), '[]'::jsonb),
    c.email, c.maps_url,
    (select g.dpo_name from clinic_group g where g.id = c.group_id)
  from clinic c
  where c.archived_at is null and c.listed
  order by c.name
$$;
grant execute on function public_directory() to flossify_app;

-- 10. public_dentist (007) with each clinic's hours beside its days, so /dentists/<slug> says "Tue 1–6 pm"
--     as the clinic page does. Same signature: replace.
create or replace function public_dentist(p_slug text)
returns jsonb
language sql security definer stable set search_path = public as $$
  select jsonb_build_object(
    'slug', s.slug, 'name', s.full_name, 'prc', s.prc_licence, 'prcCheckedOn', s.prc_checked_on, 'pda', s.pda_member,
    'specialty', s.specialty, 'practices', s.practices, 'since', s.practising_since, 'about', s.about,
    'clinics', (select jsonb_agg(jsonb_build_object('slug', c.slug, 'name', c.name, 'area', c.area, 'bookingMode', c.booking_mode,
                   'days', (select array_agg(ss.dow order by ss.dow) from staff_schedule ss where ss.staff_id = s.id and ss.clinic_id = c.id),
                   'hours', (select coalesce(jsonb_object_agg(ss.dow, jsonb_build_array(ss.from_min, ss.to_min)), '{}'::jsonb)
                               from staff_schedule ss where ss.staff_id = s.id and ss.clinic_id = c.id and ss.from_min is not null)))
                from clinic c where c.archived_at is null and c.listed
                  and exists (select 1 from staff_schedule ss where ss.staff_id = s.id and ss.clinic_id = c.id)))
  from staff s where s.slug = p_slug and s.disabled_at is null
$$;
grant execute on function public_dentist(text) to flossify_app;
```

Notes:
- The new columns are nullable and come last, so `seed.ts`'s positional inserts still work: `insert into clinic_hours values ($1,$2,$3,$4)` and `staff_schedule values ($1,$2,$3)`.
- `appointment` keeps its table-wide UPDATE grant, which covers `blocked_ok_at`.
- Nothing changes in `schema.sql`, in any applied migration, or in `public_booked_ranges`.
- If the owner answers yes to §7.1 before 040 ships, step 11 goes into this same file: `create or replace function sms_enqueue_reminders()` with the one predicate given there.

---

## 3. Server changes

### 3.1 New: `src/lib/block-words.ts`

It is pure (no Node or database imports), so the server and the browser can both import it.

```ts
export type BlockKind = 'closed' | 'leave' | 'chair_out';
export type RangeKind = BlockKind | 'lunch' | 'hours' | 'shut';
export interface RangeLike { kind: RangeKind; startsAt: string; endsAt: string; dentistName?: string | null; chair?: number | null; note?: string | null }
export function blockSentence(r: RangeLike): string;              // the soft-stop sentences in §1.4 (Manila time; "Dr. Cariño" via shortName rules)
export function blockLabel(r: RangeLike, where: 'chip' | 'strip'): string; // "Lunch" · "Closed · Holy week" · "Away" · "Not in" · "Out of use" | "Dr. Cariño away · 9:00 am–12:00 pm"
export function whyWords(r: RangeLike): string;                   // the Calls pill words in §1.5
export function blockDone(r: RangeLike): string;                  // "Blocked: the clinic is closed Thu 2 Apr – Sun 5 Apr."
```

- A range that runs from Manila midnight to Manila midnight is whole days, and is written as days ("Thu 2 Apr – Sun 5 Apr"). Any other range is written as times.
- `shut` and `hours` wording comes from the range's edges:
  - `[00:00, x)` becomes "opens at x" / "is in from x".
  - `[x, 24:00)` becomes "closes at x" / "is in until x".
  - The whole day becomes "closed on / not in on <weekday>s".

### 3.2 New: `src/lib/blocks.ts` and `src/lib/reminder-state.ts`

Everything in `blocks.ts` takes a `Tx` inside `withClinic`, so RLS is the fence.

```ts
export interface BlockRange { id: string | null; kind: RangeKind; dentistId: string | null; dentistName: string | null;
  chair: number | null; startsAt: string; endsAt: string; note: string | null; byName: string | null; createdAt: string | null }
export interface InsideVisit { id: string; patientName: string; chartNo: string; phone: string | null; startsAt: string; endsAt: string;
  dentistName: string | null; chair: number | null; why: string; reminder: string }
export interface NewBlock { kind: BlockKind; startsAt: Date; endsAt: Date; dentistId: string | null; chair: number | null; note: string | null }

/** Every range but 'shut' in [from, to), with names and notes (staff only). One query: clinic_unavailable ⋈ staff ⋈ clinic_block.
 *  Throws (never returns nothing) for a window over 400 days, as the SQL does. */
export async function loadBlocks(tx: Tx, clinicId: string, from: Date, to: Date): Promise<BlockRange[]>;
/** The first range the proposed visit sits in, in its scope (clinic-wide, its dentist, its chair), by priority
 *  closed, shut, lunch, leave, hours, chair_out, then time; null when none. */
export async function findBlock(tx: Tx, clinicId: string, p: Proposed): Promise<{ kind: RangeKind; sentence: string } | null>;
/** Validation shared by the API and Settings; the words are in §3.3. `readWholeDays` reads from/until dates as [from 00:00, until+1 00:00) Manila. */
export function readBlock(input: { kind?: unknown; dentistId?: unknown; chair?: unknown; startsAt?: unknown; endsAt?: unknown; note?: unknown },
  o: { chairs: number; now: Date }): NewBlock | { error: string };
export function readWholeDays(form: FormData, o: { now: Date }): NewBlock | { error: string };
/** Takes pg_advisory_xact_lock(hashtext(clinicId)); checks the dentist (isDentistHere) and chair ≤ clinic.chairs; inserts;
 *  clears blocked_ok_at on booked/confirmed visits ahead inside it (in its scope); audit 'schedule.block'. */
export async function addBlock(tx: Tx, clinicId: string, staffId: string, b: NewBlock): Promise<{ block: BlockRange; inside: InsideVisit[] }>;
/** Lock; update removed_at = now(), removed_by where id and removed_at is null (0 rows → BlockRefused); audit 'schedule.unblock'. */
export async function removeBlock(tx: Tx, clinicId: string, staffId: string, id: string): Promise<BlockRange>;
/** The ids of the visits in closed time, WHATEVER blocked_ok_at says: booked/confirmed, starts_at > now(), not date_only,
 *  not an unplaced request, overlapping a clinic_unavailable() range in scope over [now, now + 366 days).
 *  `dentistId` narrows it to that dentist's visits. Call it after taking the clinic's lock. */
export async function closedIds(tx: Tx, clinicId: string, o?: { dentistId?: string }): Promise<string[]>;
/** After a weekly change (lunch, hours, a dentist's hours), under the same lock: the visits in closed time now that were
 *  not in `before` get blocked_ok_at = null, so they appear on Calls even if kept for another reason earlier.
 *  Returns their ids; the save's sentence counts them. */
export async function reopenNewlyClosed(tx: Tx, clinicId: string, before: string[], o?: { dentistId?: string }): Promise<string[]>;
/** Calls → In closed time: closedIds' rule with blocked_ok_at null, soonest first, ≤ 200 rows (CTE materialized once,
 *  lateral limit 1 for the why), each with its reminder's words (reminder-state.ts). */
export async function visitsInClosedTime(tx: Tx, clinicId: string): Promise<InsideVisit[]>;
/** Calls → Keep it: row locked; must be booked/confirmed; blocked_ok_at = now(); audit 'appointment.keep_blocked'. */
export async function keepInClosedTime(tx: Tx, clinicId: string, staffId: string, id: string): Promise<void>;
/** Closed days section: dated, not removed, ends_at > now(), soonest first, ≤ 100. */
export async function upcomingBlocks(tx: Tx, clinicId: string): Promise<BlockRange[]>;
/** The scope rule as SQL, shared by closedIds, visitsInClosedTime and the inbox's count:
 *  (u.dentist_id is null and u.chair is null) or u.dentist_id = a.dentist_id or u.chair = a.chair, overlapping. */
export const IN_SCOPE_SQL: string;
export class BlockRefused extends Error {}
```

`src/lib/reminder-state.ts` is moved out of `calls/index.astro` verbatim, so that Calls and the Block panel say one thing:

```ts
export type Reminder = { status: string; nextAt: Date; sentAt: Date | null };
/** The newest reminder row per visit (kind 'reminder', direction 'out'), as Calls reads it today. */
export async function remindersFor(tx: Tx, ids: string[]): Promise<Map<string, Reminder>>;
/** "Reminder sent 6:02 pm", "Reminder queued for 6:00 pm", "Reminder goes the day before", "No reminder: no mobile on file" … */
export function reminderWords(v: { startsAt: Date; phone: string | null }, r: Reminder | undefined, now?: Date): { text: string; tone: 'ok' | 'wait' | 'none'; short: string };
```

### 3.3 Validation words (in `readBlock` / `readWholeDays`)

| Problem | Words |
|---|---|
| No kind | "Choose what is blocked: the clinic, a dentist or a chair." |
| Leave without a dentist | "Choose the dentist who is away." |
| Dentist not at this clinic | "That dentist is not at this clinic." |
| Chair missing or out of range | "This branch has 2 chairs; pick one of them." (today's `checkChair` words) |
| Bad or missing dates | "Pick when it starts and when it ends." (Settings: "Pick the first day.") |
| Ends before it starts | "It ends before it starts." (Settings: "Until is before From.") |
| Longer than 366 days | "Block a year at most at a time." |
| `endsAt` ≤ now | "That time has passed." |
| Starts more than 3 years ahead | "That is outside the years this book covers." |
| Note | Whitespace collapsed and cut to 200 characters, like `text()` |
| Remove, not found | "That block is not on this book." |
| Remove, already removed | "That block was already removed." |

### 3.4 `src/lib/availability.ts` (pure)

```ts
export interface BusyRange { dentist: string | null; named: boolean; s: number; e: number }       // epoch ms; named = the visit has a dentist
export interface BlockedRange { dentist: string | null; chair: number | null; s: number; e: number } // epoch ms
/** One rule for the public offer (openSlots) and the re-check inside the booking transaction. */
export function slotOpen(q: { s: number; e: number; dentist: string | null; chairs: number; dentists: string[];
  busy: BusyRange[]; blocked: BlockedRange[] }): boolean;
export interface DayClosure { ymd: string; from: number; to: number; kind: 'closed' | 'lunch' } // Manila minutes, one piece per day
/** A day's open windows in minutes: [open, close] minus the cuts, merged. */
export function openIntervals(day: [number, number] | null, cuts: [number, number][]): [number, number][];
export function statusFor(hours: Hours, now = manilaNow(), closures: DayClosure[] = []): Status; // strings in §1.6; identical with []
export function hoursRows(hours: Hours, lunch: Record<number, [number, number]> = {}); // "9 am – 6 pm · lunch 12 pm – 1 pm"
export function closedDaysText(closures: DayClosure[], hours: Hours): string[];        // "Thu 2 Apr – Sun 5 Apr: closed", "Fri 9 Oct: closed 2 pm – 5 pm"
```

`slotOpen` works like this, where `hit(r)` means `r.s < q.e && r.e > q.s`:
1. Any clinic-wide blocked range (no dentist, no chair) that hits → false.
2. `chairsIn = q.chairs − (distinct chairs c ≤ q.chairs among the chair ranges that hit)`. Let `over` be the busy ranges that hit. If `over.length >= chairsIn` → false. This applies on **both** paths: a named dentist still needs a chair.
3. With a named dentist, `q.dentist` must be one of `q.dentists` (the API refuses any other). A blocked or busy range for that dentist that hits → false.
4. When `q.dentists` is empty → true. This is chairs only, as today.
5. Let `inFree` be the dentists in `q.dentists` with no hitting blocked or busy range. Let `unnamed` be the ranges in `over` with `named` false. Return `inFree − unnamed > 0`.
   - With a named dentist, that dentist is in `inFree` (step 3), so this says the other free dentists can still see every visit booked with no dentist.
   - A visit whose dentist is not listed here holds a chair (step 2) but no listed dentist.

`statusFor` with closures:
- It looks at most 30 days ahead. Nothing open in that span, with hours on file, gives "Closed for now". No hours at all gives "By appointment", as today.
- The dated form "Opens Mon 13 Apr, 9 am" is used only when the next opening is more than 7 days away, or exactly 7 days away because a closure skipped an open weekday.
- With `closures = []` the next opening is never more than 7 days away and never moved by a closure. So every string is today's, including "Opens Mon 9 am" a week ahead for a clinic open one weekday.

### 3.5 `src/lib/directory-db.ts`

- **Types.**
  - `Row.hours` becomes `Record<string, number[]>`, and `dentists[].hours` becomes `Record<string, [number, number]>`.
  - `toHours` reads `[o, c]`.
  - A new `toLunch` reads `[, , bf, bt]` into `DbListing.lunch: Record<number, [number, number]>`, in hours.
  - Each dentist profile's `clinics[0]` gains `hours?: Record<number, [number, number]>` (in hours). The optional field is added to the `Dentist` type in `src/data/directory.ts`.
  - `loadDentist` reads `public_dentist`'s new `hours` for each clinic the same way.
- `export async function publicBlocked(q: Queryable, clinicId: string, from: Date, to: Date): Promise<(BlockedRange & { kind: string })[]>` calls `public_blocked_ranges` through the pool or a `tx`.
- `export async function publicBusy(q: Queryable, clinicId: string, from: Date, to: Date): Promise<BusyRange[]>` calls `public_busy_ranges`.
- `openSlots(l, opts)` reads `publicBusy` and `publicBlocked` for the window, both no longer than 29 days.
  - Its `isTaken(ymd, a, b)` becomes `!slotOpen({ … dentists: l.dentistProfiles.map((d) => d.slug) })`, in epoch milliseconds.
  - The signature and return are unchanged.
- `export async function slotStillOpen(tx: Tx, l: DbListing, p: { dentist: string | null; startsAt: Date; endsAt: Date }): Promise<boolean>` makes the same two definer reads on `tx` for `[startsAt, endsAt)`, then applies `slotOpen`.
- `export async function closuresFor(l: DbListing, o?: { now?: Now; days?: number }): Promise<DayClosure[]>` returns the clinic-wide `closed` and `lunch` ranges from today for `days` (default 31), split per Manila day. `/find/` and ClinicPage both use the default.
- `export async function dentistsAway(l: DbListing, o?: { now?: Now; days?: number }): Promise<Record<string, string[]>>` returns, per listed dentist's slug, the days in the next `days` (default 30) that fall on a weekday they are normally in and that their `away` ranges cover wholly. It feeds `data-closed-days` on the book page.

### 3.6 `src/pages/api/bookings/index.ts` (public; never reads `anyway`)

- **Request path.** Before the limits, the handler reads `publicBlocked` for the requested Manila day, as `cuts`, in minutes:
  - the clinic-wide `closed` and `lunch` ranges;
  - with a dentist chosen, also that dentist's `away` ranges.
- `placeRequest(hours, day, part, now, clinicCuts = [], dentistCuts = [], who: string | null = null)` runs in two stages:
  - It first checks the clinic cuts:
    - a day wholly cut gives "The clinic is closed on Thu 2 Apr. Pick another day.";
    - no room in the part gives "The clinic is closed then on Thu 2 Apr. Pick another time of day."
  - Then, with a dentist chosen (`who` is the short name, "Dr. Cariño"), it checks with the dentist's cuts added:
    - "Dr. Cariño is not in on Tue 6 Oct. Pick another day, or any dentist.";
    - "Dr. Cariño is not in then on Tue 6 Oct. Pick another time of day, or any dentist."
  - The placeholder is the first 30-minute window at or after `part.hour*60`, else before it. It must be inside the part, inside an open interval, and at or after `earliest`.
  - With no cuts, every existing string and placement is identical.
- `requestFallback(hours, visit, call, now, closedDays: Set<string>)` treats a wholly closed day as not open.
- **Live path in the transaction.**
  - The advisory lock stays exactly where it is.
  - The two-branch re-check (`findClash` for a named dentist, the chair count for any dentist) is replaced by `if (!(await slotStillOpen(tx, l, { dentist: dentist?.slug ?? null, startsAt, endsAt }))) return { gone: true }`.
- The new appointment inserts with `blocked_ok_at` null.

### 3.7 `src/lib/schedule-api.ts` (new) and `src/pages/api/schedule/index.ts`

- Move `Refusal`, `refuse`, `answer`, `gate`, `body`, `isoDate`, `chairOf`, `idOf`, `text`, `clinicRow` and `checkChair` verbatim into `src/lib/schedule-api.ts`.
  - `Refusal` gains `extra?: Record<string, unknown>`, and `answer` returns `{ error, ...extra }`.
  - `checkDentist` moves to `src/lib/schedule.ts` as `isDentistHere(tx, clinicId, dentistId): Promise<boolean>`.
- **POST** reads `anyway = b.anyway === true`.
  - After `findClash` (still a hard 409, walk-ins included): `const blk = await findBlock(tx, clinic.id, { startsAt, endsAt, chair, dentistId })`.
  - If `blk && !anyway && !walkIn`, throw `refuse(409, blk.sentence, { blocked: true, kind: blk.kind })`. A walk-in (`status: 'arrived'`) is never refused for a block: the patient is at the desk.
  - The insert sets `blocked_ok_at = blk ? now() : null`.
  - If `blk`, also write audit `appointment.anyway` (walk-ins included).
- **PATCH** does the same, only when `moved`.
  - The update sets `blocked_ok_at = case when blk then now() else null end`.
  - A status-only or words-only PATCH never checks blocks and never touches `blocked_ok_at`.
- **GET** returns `loadRange(...)`, whose `Range` now carries `blocks: BlockRange[]` (every range but `shut`). `staff[]` gains `hours: Record<number, [number, number]>` (in minutes). The eight-day cap on the range is unchanged.

### 3.8 New: `src/pages/api/schedule/blocks.ts`

- **POST** `{ clinic, kind, dentistId?, chair?, startsAt, endsAt, note? }` returns 201 `{ block: BlockRange, inside: InsideVisit[] }`.
  - Order of checks:
    1. `gate`: session, `canOpen`, and `schedule:s:<staff>` with `LIMITS.schedule.staff`.
    2. `csrfHeaderOk` (403 `CSRF_MESSAGE`).
    3. `can(clinic, 'schedule.edit')` (403 "Your role cannot change the schedule here. Ask the owner.").
    4. `readBlock`.
    5. `withClinic` → `addBlock`.
  - Errors are 400 `{ error }`.
- **PATCH** `{ clinic, id, remove: true }` returns 200 `{ removed: BlockRange }`, with the same checks.
- Both take the advisory lock inside `addBlock` / `removeBlock`.

### 3.9 `src/lib/schedule.ts`

`Range` adds `blocks`. `loadRange` calls `loadBlocks(tx, clinicId, from, to)` in its transaction, and adds the staff hours from `staff_schedule.from_min/to_min`. `findClash`, `applyStatus`, `NEXT_STATUS` and `scheduleTexts` are untouched.

### 3.10 `src/components/ws/cal/data.ts` (`loadDashboard`)

- The meta staff JSON gains `'hours', (jsonb_object_agg(dow, [from_min, to_min]) filter (where from_min is not null))`.
- `Dashboard.blocks` comes from two `loadBlocks` calls in the same transaction:
  - one over the range on screen `[from, to)`;
  - one over today `[todayFrom, todayTo)` when today is outside it.
  - The two are merged by `id ?? kind|dentistId|chair|startsAt`.
- A date on screen 18 months ahead therefore still draws its lunch, and no call spans more than a week.

### 3.11 Settings

- **`src/pages/c/[clinic]/settings/_lib/common.ts`**: `SECTIONS` gains `{ id: 'closed', label: 'Closed days', icon: 'calendar' }` right after `hours`.
- **`src/pages/c/[clinic]/settings/_lib/profile.ts`**:
  - `DayRow` gains `lunchFrom` and `lunchTo`, and `savedHours` fills them.
  - `saveClinic` parses `lunch_from[dow]` and `lunch_to[dow]`, with the §1.1 problems.
  - When the hours part is saved, `saveClinic`, inside its transaction:
    1. takes `pg_advisory_xact_lock(hashtext(clinicId))`;
    2. reads `before = closedIds(tx, clinicId)`;
    3. writes the hours with `break_from_min` and `break_to_min`;
    4. runs `newly = reopenNewlyClosed(tx, clinicId, before)`;
    5. redirects to `?saved=hours&closed=<newly.length>#hours`.
- **New: `src/pages/c/[clinic]/settings/_lib/closed-days.ts`**:
  - `closedDaysAction(o: { clinicId; staffId; base; form }): Promise<Response | ClosedRefused>`, where `ClosedRefused = { problems: string[]; values }`:
    - `form=closed-add` → `readWholeDays` → `withClinic` → `addBlock` → `?saved=closed&block=added&inside=<n>#closed`.
    - `form=closed-remove` with `id` → `removeBlock` → `?saved=closed&block=removed#closed`.
    - A `BlockRefused` or a validation error comes back as `ClosedRefused`.
  - `loadClosedDays(clinicId)` calls `upcomingBlocks`.
- **New: `src/pages/c/[clinic]/settings/_ui/ClosedSection.astro`**: the §1.2 pane (`data-set-panel="closed"`), its list (`data-blocks-list`) and its two forms.
- **`src/pages/c/[clinic]/settings/index.astro`**:
  - `may.closed = can(ws, 'settings.edit')`.
  - `Which` gains `'closed-add' | 'closed-remove'`. **Both are listed in the dispatch array** (`['profile', 'hours', …, 'closed-add', 'closed-remove']`), so such a post never falls through to the profile handler. `SECTION_OF` maps both to `'closed'`, so they are gated by `may.closed` and CSRF like every section.
  - `closedRefused` joins the `wanted` chain.
  - `?saved=closed` is a section id, so `fromSection` opens Closed days on the server (`firstOn`), before any script runs.
  - It loads the closed days with the page's other reads. `STATUS.closed` is "<n> ahead" or "None ahead".
  - The notes are the §1.1 and §1.2 sentences. `N` gains optional `href` and `link`, rendered inside `<Note>`'s slot.
- **`src/pages/c/[clinic]/settings/_lib/people.ts`**, action `schedule`:
  - Parses `from[dow]` and `to[dow]` for the ticked days, with the §1.3 problems.
  - Takes the advisory lock and reads `before = closedIds(tx, clinicId, { dentistId: t.id })`.
  - Deletes and inserts with `from_min` and `to_min`.
  - Runs `newly = reopenNewlyClosed(tx, clinicId, before, { dentistId: t.id })`, then redirects to `?done=schedule&closed=<newly.length>#days`.
  - `personNotice` adds the sentence.
  - New: `scheduleOf(clinicId, staffId): Promise<{ dow; from_min; to_min }[]>`. `daysOf` stays.

### 3.12 Calls: `src/pages/c/[clinic]/calls/index.astro`

- **The next open days.** A day counts as open when its weekday has hours **and** `openIntervals` for it, minus the clinic-wide `closed` ranges from `loadBlocks` over `[today, today + 22 days)`, is not empty.
- **Still to confirm** also reads `booked` visits that meet all of these:
  - `blocked_ok_at is not null`;
  - on a day after today and before the second open day;
  - on a day that is not one of the open days.
  - They are grouped under their own day (`dayOrder` gains those days, in order).
- **POST.**
  - The handler accepts `intent=keep`, which requires `maySchedule` (the same sentence) and uses the same `calls:s:` limit.
  - It calls `keepInClosedTime` in `withClinic` and redirects to `?done=keep&v=<id>`.
  - `DONE_WORDS.keep` reads the visit back for the §1.5 sentence.
- **Reminders.** `reminderWords` and the reminder query move to `src/lib/reminder-state.ts` and are imported back unchanged. `visitsInClosedTime` feeds the new pane, whose rows carry the same words.
- **Print.** `.cs-sheet` gains the "In closed time" table (§1.5), drawn from the same rows.

### 3.13 The inbox: `src/components/ws/inbox.ts` and `src/layouts/Clinic.astro`

- `Inbox` gains `closed: number | null`.
- It is counted in the existing single query as `case when staff_can($3::uuid, $4::uuid, 'schedule.edit') then (…) end`. The subselect counts booked/confirmed visits with `blocked_ok_at` null in `[now, now + 14 days)` that meet `IN_SCOPE_SQL` against `clinic_unavailable($4, now(), now() + interval '14 days')`, materialized once.
- `total` adds it.
- `Clinic.astro` draws the row "In closed time, next 2 weeks" beside Requests and Forms, linking to `/c/<slug>/calls/#closed-time`, only when it is not null.

**Permission keys:** `schedule.edit` (calendar blocks, anyway, Keep it, the inbox row), `settings.edit` (lunch and Closed days in Settings), and the person page's existing self-or-manages rule. **No new key.**

**Rate limits:** `LIMITS.schedule.staff` for `/api/schedule/blocks`, the existing `calls:s:` limit for Keep it, and the existing `LIMITS.booking` for the public side.

---

## 4. Client changes

**`src/components/ws/cal/model.ts`**
- Re-export `BlockRange`.
- `nextFree(list, open, dayStart, isToday, chairs, now = Date.now(), blocks: BlockRange[] = [], dentistId: string | null = null)` skips:
  - clinic-wide ranges;
  - the chair's own `chair_out`;
  - with `dentistId`, that dentist's `leave` and `hours` ranges.
- New helpers:
  - `blocksOn(blocks, ymd)`.
  - `shutRanges(hours, ymd): RangeLike[]`, built from the weekly hours.
  - `blockAt(blocks, hours, p: { ymd; startMin; endMin; chair; dentistId }): RangeLike | null`, with the same scope and priority as `findBlock`.
  - `wholeDayClosed(blocks, hours, ymd)`.
- `StaffDay` gains `hours?: Record<number, [number, number]>`.

**`src/components/ws/cal/board.ts`**
- `Boot` gains:
  - `blocks: BlockRange[]`
  - `canSettings: boolean` (`settings.edit`)
  - `links.hours` (`/c/<slug>/settings/#hours`)
  - `links.calls` (`/c/<slug>/calls/#closed-time`)
  - `open.block: boolean`
- `Reply` failure gains `blocked?: boolean`, and `call()` passes `data.blocked` through.
- `fetchRaw` and `fetchRange` return `{ cards, blocks }`, and the cache stores both. `refresh()` redraws when the set of blocks' `id|kind|startsAt|endsAt` changes.
- `Ctx` gains:
  - `dayBlocks(ymd): BlockRange[] | null` (null when that day is not loaded);
  - `callAnyway` (the same as `call`, with `anyway: true`).
- New `blockEls(lane, blocks, start, laneKind)` draws `div.cal-block` (hatch, `pointer-events: none`, z-index 1) with `span.ws-pill.ws-tint-slate.cal-block-chip` (words from `blockLabel`), following the §1.4 table. It runs in `renderDay` and `renderWeek` after `closedBlocks`.
- `renderList` inserts `p.cal-list-block` lines.
- New `renderBlocks()` fills `[data-cal-blocks]` with `button[data-block-id]` pills, which open `panels.openBlock(id, btn)`. It is called from `renderAll`.
- `renderCount`, `emptyText` and the week column head use `wholeDayClosed` and `nextFree(…, blocks)`.
- `renderPrint` writes `[data-cal-print-blocks]`.
- `fail(text, act?: { label: string; run: () => void })` appends a `button.cal-toast-go[data-cal-anyway]`.
- In `onUp`, when a drop is refused with `r.blocked`, the card is put back and `fail(r.error, { label: 'Move anyway', run: () => void callAnyway('PATCH', body).then(done) })` runs.
- `[data-cal-block-new]` calls `panels.openBlockNew({ ymd: S.date })`. `boot.open.block` opens it on load, and `new` is still cleaned from the URL.

**`src/components/ws/cal/panels.ts`**
- `Panels` gains `openBlock(id, opener)` and `openBlockNew(o: { ymd; min? }, opener)`.
- `closedNote` is replaced by `blockNote(ymd, time, minutes, chair, dentistId, base)`, built from `M.blockAt` and `blockSentence` plus " Saving asks you to confirm.". It updates when the date, time, minutes, chair or dentist change, in both the move form and the book form.
  - In the book form it stays hidden while **Here now** is ticked. The walk-in's submit never shows an Anyway button, and its toast stays "Checked in: …".
- `patch()` and the book submit, on `!r.ok && r.blocked`, call `show(err, r.error)` and add a quiet button that re-sends with `anyway: true`:
  - `data-vp-anyway`: "Move anyway" or "Place anyway";
  - `data-bk-anyway`: "Book anyway".
  - The booking's success toast adds " It is in closed time (<kind word>)."
- `freeHint`, the walk-in chair and `fillDentists` pass the day's blocks and the chosen dentist to `nextFree`. `freeHint` also runs on `B.dentist` change. A dentist option reads "Dr. Cariño · in 1:00–6:00 pm" when that dentist has hours on that weekday.
- A new block section wires `BlockPanel`.
  - `POST /api/schedule/blocks` goes with the X-CSRF header. On success, `ctx` reloads the range (the cache is cleared), then the saved and inside callouts show. The inside rows show each visit's `reminder`.
  - View mode renders `data-bl-remove` only when `boot.canSchedule`.
  - Remove: the confirm callout, then `PATCH { id, remove: true }`, then close, then the toast.
  - The one teal button is `data-bl-save`.

**New: `src/components/ws/cal/BlockPanel.astro`**
- A `SidePanel` with `id="block"`.
- Hooks: `data-bl-form`, `data-bl-kind` (radio `name="bl-kind"`), `data-bl-dentist-row`, `data-bl-dentist`, `data-bl-chair-row`, `data-bl-chair`, `data-bl-allday`, `data-bl-times`, `data-bl-from-date`, `data-bl-from-time`, `data-bl-to-date`, `data-bl-to-time`, `data-bl-note`, `data-bl-error`, `data-bl-said`, `data-bl-inside`, `data-bl-save`, `data-bl-settings`, `data-bl-view`, `data-bl-facts`, `data-bl-remove`, `data-bl-ask`, `data-bl-yes`, `data-bl-keep`.
- Fields are 16 px and targets at least 44 px. Everything the script shows later uses `hidden` attributes, never the utility class.

**`src/components/ws/cal/BookPanel.astro`**: add `<p class="ws-callout" data-tone="warn" data-bk-block hidden>` under `data-bk-free`.

**`src/components/ws/cal/cal.css`**, inside `@layer components`:
- `.cal-block`: the same hatch variables as `.cal-closed`, plus a 1 px dashed `--ws-hair` top rule.
- `.cal-block-chip`: absolute at top-left, 3 px in; 13 px/600; max-width `calc(100% - 6px)`; ellipsis.
- `.cal-blocks`: a flex-wrap strip with a 0.75rem gap and padding like `.cal-lane-head`.
- `.cal-block-pill`: a 32 px pill in a 44 px button.
- `.cal-list-block`.
- No new colours: only existing tokens, which already have both dark twins. If a colour must be added, it goes in both `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) … }` and `:root[data-theme="dark"] …`.

**`src/pages/c/[clinic]/index.astro`**
- `openNew = qs.get('new') === 'booking'`, plus `openBlock = qs.get('new') === 'block'`.
- Boot gains `blocks`, `canSettings`, `links.hours`, `links.calls` and `open.block`.
- The More menu gets `<button type="button" class="ws-menu-item" data-cal-block-new>`, only when `can(clinic,'schedule.edit')`.
- `<ul class="cal-blocks" data-cal-blocks aria-label="Blocked time" hidden>` goes after the undated lane.
- `<p class="meta" data-cal-print-blocks>` goes inside the print table's caption area.
- `<BlockPanel chairs staff />`.

**`src/layouts/Clinic.astro` and `src/components/ws/routes.ts`**
- `ShellLinks.newBlock = /c/<slug>/?new=block`.
- The + New menu gets the item "Block time", hint "A closed day, a dentist away, a chair out of use", icon `clock`, when `can(access, 'schedule.edit')`.
- The inbox row from §3.13.

**Settings UI**
- `HoursSection.astro` gains:
  - the lunch line `data-set-lunch` in each row;
  - the copy button `data-lunch-copy` (`hidden`, shown by the page's script) and its line `data-lunch-said` (`role="status"`). The script copies only into rows where the lunch fits that day's hours, and names the rows it skipped;
  - the intro's link to `#closed`.
- `ClosedSection.astro` (new, §3.11). Its teal **Add closed days** is the section's one main action. Remove is quiet. The kind radios are 44 px pills.
- `settings.css`: `.set-hours-lunch` spans the row.
- `people/[id].astro`: `<details data-days-hours>` with `from[dow]` / `to[dow]` time inputs (step 900), and the read-only hours text.

**Public**
- `src/pages/find/_ui/ClinicPage.astro`:
  - Frontmatter: `const closures = await closuresFor(l)`.
  - `<main data-closures=…>`.
  - `hoursRows(l.hours, l.lunch)`.
  - `closedDaysText` under the hours table as an `<h3>` plus `<ul data-closed-list>`, with words on the glass cards only.
  - `daysAt` includes hours.
  - The script calls `statusFor(hours, now, JSON.parse(main.dataset.closures))`.
- `src/pages/find/index.astro`: per card, `closures: await closuresFor(l)` (the same 31 days) into `data-closures` on the `li`, and `statusFor(…, closures)`.
- `src/pages/find/[clinic]/book.astro`:
  - `data-dentists` entries gain `hours` and `away` (from `dentistsAway`).
  - The pick line and note include hours.
  - In request mode, `data-closed-days` goes under Preferred day and adds the chosen dentist's line when a dentist is picked.
- `src/pages/dentists/[dentist].astro`: the days line includes hours ("Tue 1–6 pm · Thu").

---

## 5. What must not change

1. `findClash`, its sentences and its hard 409. A clash always wins over a block, a clash has no Anyway, and walk-ins still get the clash check.
2. `NEXT_STATUS` and `applyStatus`. A status change never runs the block check and never touches `blocked_ok_at`. A walk-in's POST (`status: 'arrived'`) runs `findBlock` only to record `blocked_ok_at` and the audit, and never refuses because of it.
3. One booker at a time, with the same lock: `pg_advisory_xact_lock(hashtext(clinic_id))`.
   - It is now also taken by block add and remove, the hours save and the person-hours save. Each of those reads `closedIds` after taking it.
   - The public re-check stays inside the transaction, after the lock.
4. **No text is queued, cancelled or changed** by adding or removing a block, by saving lunch or a dentist's hours, by Keep it, or by a walk-in in closed time.
   - Visits inside new closed time keep their reminders (see §7.1 for the owner's question).
   - `dropStaleTexts` runs on moves only, as today.
   - No link and no reply ask anywhere.
5. Visits already booked are never cancelled or moved by the system.
6. `/api/bookings` and `/api/availability`: the request and response shapes and every existing string. The additions are the request-mode dentist sentences in §1.6. A request for a named dentist on a day or time they are not in is now refused, where before it was accepted.
7. `/api/schedule`: additions only. These are `blocks` on GET and `staff[].hours`; `blocked` and `kind` on a 409; and the `anyway` input.
8. Identity guarantees:
   - `statusFor` gives identical strings with no lunch and no closures.
   - `hoursRows` is identical with no lunch.
   - Slots on the **named-dentist** path are identical for a clinic with no lunch, no blocks, no dentist hours and all chairs in service, **except** in two intended cases:
     - (a) the visits overlapping the slot already fill every chair. A 1-chair clinic with another dentist's visit no longer offers the slot;
     - (b) a visit with no dentist overlaps the slot and only this dentist is left free to see it.
   - Both are bookings the clinic could not honour (Risk 2).
9. Also unchanged: the `.cal-closed` weekly shut hatch, the QUEUE status colours, the Unplaced lane (`chair = null`), the web-requests lane, drag, the live refresh every 30 seconds, and the keyboard. Nothing is gated by Reduce Motion.
10. One teal button per screen: the Dashboard's New booking, each panel's own, the Hours Save, and the Closed days section's Add closed days. Every Anyway, Remove, Keep it and Show is quiet.
11. `sw.js` still never caches the API. Offline charting is untouched.
12. `patient_act`, `sms_inbound`, `sms_enqueue_reminders` and `sms_enqueue_recalls` are untouched, unless the owner answers yes to §7.1.
13. The seed and `signup_clinic()` insert as before, and the new columns default to null. `public_booked_ranges` is untouched.
14. `can(ws, key)` only: no role name decides a permission. The professional-side role filter (`staff.role in ('owner','dentist','associate')` for who treats) stays where it is today.
15. Workspace computed styles are unchanged outside the new elements (the Site API rule: compare before and after).

---

## 6. Verification plan

Run the dev server on a new port, for example 4417. Never use `pkill`.

Sign in as `liwayway.domingo@example.com` / `flossify` at `session-road`. That clinic has:
- 4 chairs, Mon–Fri 9–6 and Sat 9–3, closed on Sunday;
- Dr. Liwayway Domingo in Mon–Sat;
- Dr. Ramon Cariño in **Tue and Thu** only;
- Dr. Hazel Tabanao in **Mon, Wed and Fri** only (`src/data/directory.ts`).

Dates below are next Monday (M), M+1 (a Tuesday), and so on, computed in the script in Manila time. Before any "at most N" check, read by SQL that the time has no visits on the book. Use a different mobile for each public booking, so the per-number limit is not what refuses it.

**Pure checks** (`node --experimental-strip-types`, in the scratchpad):
1. `statusFor` identity: compare the old function (`git show d07558b:src/lib/availability.ts`) with the new one with `closures=[]`.
   - Inputs: every seeded listing's hours, plus a synthetic clinic open Monday 9–5 only, × 7 days × every 15 minutes.
   - Expect **0 differences**, including the synthetic clinic's "Opens Mon 9 am" a week ahead.
   - Then with closures:
     - a two-week closure gives "Closed today · opens … " or "Opens Mon 13 Apr, 9 am" with the real date;
     - a closure that moves the next opening to exactly 7 days gives the dated form.
2. `slotOpen` table:
   - Lunch cuts everything.
   - A named dentist's leave cuts only that dentist.
   - 4 chairs, 3 dentists all in, 3 visits naming them: any dentist is closed.
   - 1 chair out of 2, plus 1 visit: closed on both paths.
   - A chair-out range on chair 3 when `chairs = 2` is ignored (2 chairs still in).
   - No dentists listed: chairs only.
   - Tuesday shape (Domingo and Cariño in, Tabanao not in): Cariño busy with a named visit, plus 1 visit with no dentist. Named Domingo is **closed**, and any dentist is closed.
   - The same, but that visit is named to a dentist not in the list (`named: true`): Domingo is open, and any dentist is open.
   - 1 chair, 2 dentists, the other dentist busy: named is closed (intended change §5.8a).
3. `placeRequest`:
   - Every existing case gives the same string and minutes with no cuts.
   - Midday with lunch 12–1 places at 11:00 or 13:00, never 12:00.
   - With dentist cuts covering the day: "Dr. Cariño is not in on … Pick another day, or any dentist."
4. `blockSentence`: every example in §1.4, character for character.

**SQL** (as `flossify_app`: `begin; set local app.clinic_id = '<session-road id>'; … rollback;`):
5. `select kind, count(*) from clinic_unavailable(id, M 00:00+08, M+1 00:00+08) group by 1` gives:
   - `shut` 2;
   - `hours` rows for Cariño (not in on Monday);
   - `lunch` 0 before step 8.
6. Isolation:
   - Without `app.clinic_id`, and with another clinic's id: **0 rows**.
   - `public_blocked_ranges(unlisted id, …)` and `public_busy_ranges(unlisted id, …)`: 0 rows.
   - Their column lists contain no `note`, no `created_by`, no patient and no chair on busy.
   - A leave row reads `away`.
   - A visit with a dentist reads `named = true` even when that dentist has no slug.
7. Grants and checks:
   - `has_column_privilege('flossify_app','clinic_block','note','UPDATE')` is false.
   - `'removed_at','UPDATE'` is true.
   - `has_table_privilege('flossify_app','clinic_block','DELETE')` is false.
   - `update clinic_block set removed_at = null where id = <removed>` raises "A removed block stays removed".
   - Inserting kind leave with a null dentist fails the check.
   - A lunch 08:00–09:00 on a 9–6 day fails `clinic_hours_break_ok`.
   - `update clinic_hours set break_from_min = 780, break_to_min = null` fails `clinic_hours_break_pair`.
   - `update staff_schedule set from_min = 780` (with `to_min` null) fails `staff_schedule_hours_pair`.
   - `select * from clinic_unavailable(id, now(), now() + interval '401 days')` raises.

**Playwright, at 1440×900:**

8. Settings → Opening hours:
   - First set Saturday to close at 12:00 and save.
   - By API, book a visit at M 12:15 on Chair 2. Read by SQL how many booked/confirmed visits ahead overlap 12:00–1:00 on Mon–Fri. That is N, including this one.
   - Enter Monday lunch 12:00–13:00, then press **Same lunch every open day**. Expect:
     - Tue–Fri filled;
     - Saturday empty;
     - the said line "Copied to 4 days. Not Saturday: 12:00–1:00 pm is outside its hours."
   - Save. Expect the warn note with N. `select break_from_min, break_to_min from clinic_hours` gives 720/780 on Mon–Fri and null on Saturday. The 12:15 visit is on Calls → In closed time.
   - Enter lunch 11:00 with no end. Expect "Monday’s lunch needs a start and an end, or leave both blank.", with the typed values kept.
   - Put Saturday back to 9–3.
9. Settings → Closed days:
   - `/settings/#closed` has exactly one `.ws-btn-primary`, and it is **Add closed days**.
   - Add "The clinic is closed" M+10 – M+11, note "Test". Expect "Added: the clinic is closed … ".
   - Fetched without scripts, the response has `[data-set-panel="closed"][data-on]`.
   - The clinic row is unchanged (no `clinic.update` audit).
   - Remove it. Expect "Removed. Patients can book that time again."
10. `GET /api/availability?clinic=session-road&minutes=30&days=14`:
    - No slot on an open weekday with `mins` in [720, 780).
    - With `minutes=60`, no 11:30.
    - `POST /api/bookings` any dentist at M 12:00: **409** "That slot has just gone. Pick another."
    - The same with `"anyway": true`: 409.
11. The clinic page, with `page.clock.setFixedTime`:
    - at M 11:30 Manila: "Lunch soon · 12 pm";
    - at 12:15: "Lunch · back at 1 pm";
    - the hours table shows "· lunch 12 pm – 1 pm".
12. Dr. Ramon Cariño's page:
    - By API, book one visit for Domingo and one for Cariño at M+1 (Tuesday) 10:00. Read by SQL how many of Cariño's visits ahead start before 1 pm on a Tuesday. That is K, including this one.
    - Set **Tuesday** 13:00–18:00 and save. Expect "Saved Dr. Ramon Cariño’s days. K visit(s) ahead is/are now outside their hours: it is on the call list." Domingo's visit is not counted.
    - `/api/availability?dentist=ramon-carino` has no Tuesday slot before 780.
    - The book page's pick line reads "Tue 1–6 pm · Thu".
    - `/dentists/ramon-carino` says "Tue 1–6 pm".
    - New booking on M+1 with Cariño chosen: the free hint reads "Chair n at 1:00 pm", not 9:00.
13. Dashboard → More → Block time:
    - "A dentist is away", Cariño, M+1, all day, note "Seminar", then **Block this time**. Expect the saved callout, with his 10:00 visit in the inside list together with its reminder words.
    - The strip shows "Dr. Cariño away · all day". `?by=dentist` shows his column hatched with the "Away" chip.
    - Public: no M+1 slots for him.
    - **Any dentist on M+1 is capped at 1** (only Domingo is in). At a free time, M+1 15:00: two any-dentist bookings, and the second returns 409.
    - At another free time, M+1 16:00: one any-dentist booking, then a named Domingo booking, which returns 409 (the unnamed visit needs him).
    - **Monday case**: Cariño is not in on Mondays. At M 15:00 (free): three any-dentist bookings, and the third returns 409 although 4 chairs are free.
14. Soft stop:
    - New booking at M 12:15, Chair 1. The pre-warning `data-bk-block` shows before save. Save gives "Lunch is 12:00–1:00 pm." plus **Book anyway**, and `document.querySelectorAll('#book .ws-btn-primary').length === 1`.
    - Press Book anyway. The card is drawn over the hatch. SQL: `blocked_ok_at` is not null, and `audit_log` has `appointment.anyway`.
    - Drag a card into lunch. It returns to its place, the toast carries **Move anyway**, and pressing it moves the card.
    - Booking into an occupied chair at lunch gives the clash sentence and no Anyway button.
    - **Walk-in**: Here now ticked, with the time today inside closed time (today's lunch, or before opening). If neither is ahead when the check runs, POST `status: 'arrived'` with `startsAt` inside today's lunch directly.
      - `data-bk-block` stays hidden and there is no Anyway.
      - The answer is 201, with the toast "Checked in: …".
      - `blocked_ok_at` is set and `appointment.anyway` is audited.
      - A walk-in into an occupied chair still gets the clash 409.
15. Visits inside:
    - Book Ana Reyes at M+3 10:00, then add Clinic closed M+3 to M+4 with note "Holy week".
    - The panel lists Ana with "Reminder goes the day before".
    - Calls → **In closed time** shows her with "Clinic closed · Holy week" and the same reminder words.
    - `page.emulateMedia({ media: 'print' })` shows the sheet's In closed time table with her.
    - The inbox shows "In closed time, next 2 weeks" 1 for Liwayway, and no such row for a role without `schedule.edit`.
    - `message_log` has no new row for Ana, and her reminder row (if any) is still queued.
    - **Keep it**: the row is gone, with audit `appointment.keep_blocked`.
    - The Calls page's next open days skip M+3 and M+4.
    - **Kept on a closed day**: book a visit tomorrow (T+1), close T+1 wholly, then Keep it. It appears in Still to confirm under T+1's own heading, before the next two open days. Remove the block afterwards.
16. Public during the closure:
    - At M+3 10:00 the pill reads "Closed today · opens … 9 am".
    - "Closed days ahead" lists "…: closed".
    - `page.content()` does **not** contain "Holy week".
    - Add a closure M+3 to M+16. At M+3 10:00 the `/find/` card's pill and the clinic page's pill read the same dated text. Then remove that closure.
    - Request mode (`update clinic set booking_mode='request'` in a rolled-back test database):
      - `reqDate=M+3` gives 400 "The clinic is closed on <day>. Pick another day.";
      - `dentist=ramon-carino` with `reqDate=M` (a Monday) gives 400 "Dr. Cariño is not in on Mon <d> <Mon>. Pick another day, or any dentist.";
      - with Cariño chosen, `data-closed-days` lists "Dr. Cariño is not in on: Tue <M+1>".
17. Remove: the strip pill, then Remove, then **Yes, remove it**. The strip empties, `removed_at` is set, and the slots come back.
18. Permissions:
    - Create role "Viewer" with `perms '{}'` and give it to a seeded assistant. There is no Block time in More or + New.
    - A strip pill opens view mode with **no** `data-bl-remove`.
    - `fetch('/api/schedule/blocks', {method:'POST', …})` gives 403 "Your role cannot change the schedule here. Ask the owner."
    - Settings is not reachable.
    - Re-run the 7-role × 20-page snapshot (`snap.mjs` / `cmp.mjs`). The only differences allowed:
      - Block time items for `schedule.edit` roles;
      - the Hours section's lunch fields and the Closed days section with its list entry, for `settings.edit` roles;
      - In closed time on Calls when it is not empty;
      - the inbox row for `schedule.edit` when it is not zero.
19. Race: 20 rounds of `Promise.all([POST /api/bookings any dentist at M+5 10:00, POST /api/schedule/blocks closed M+5 09:00–12:00])`, removing the block between rounds.
    - **Each round, the booking is 201 only when its id is in the block response's `inside`; otherwise it is 409.**
    - SQL: every `source='web'` appointment overlapping a live block with `blocked_ok_at` null is in some round's `inside`.
20. Far date: the Dashboard at `?date=` 18 months ahead draws the lunch hatch and pre-warns at 12:15.
21. Measure, light and dark (chosen and device), at 1440 and 390, against the worst pixel behind. Contrast must be at least 4.5:1 for:
    - the grid chips over the hatch;
    - the strip pills;
    - the Block panel, with both callouts and the reminder words;
    - the lunch line, the said line and the Closed days section in Settings;
    - the person-hours details;
    - Calls → In closed time, and the inbox row;
    - the public status pill, hours table and "Closed days ahead" on glass, over a real room, all black, all white, harsh stripes and no photo;
    - the book page's `data-closed-days`.

    Also measure:
    - Every new target is at least 44 px: radios, strip pills, Anyway buttons, Remove, Keep it, Add closed days and the lunch-copy button.
    - Fields are 16 px.
    - At 390, `scrollWidth === innerWidth` on the Dashboard, Settings (Hours and Closed days) and Calls.
    - The Dashboard at 1366×768 still shows at least 24rem of grid.
22. Migration: on a copy of the database at 038, book a future 12:15 visit on an open weekday and a future Sunday visit.
    - `npm run db:migrate` applies 040. The Sunday visit has `blocked_ok_at` set; the 12:15 one is null.
    - Save lunch 12–1. The note counts the 12:15 visit, and Calls lists it. The Sunday visit is not on In closed time.
    - Run `npm run db:migrate` again: nothing to do.

---

## 7. Effort, risks, the owner's question, deferred

**Effort: L, at the top end.** About 35 files: 9 new, 26 changed.
- New: `040_blocked_time.sql`, `block-words.ts`, `blocks.ts`, `reminder-state.ts`, `schedule-api.ts`, `api/schedule/blocks.ts`, `BlockPanel.astro`, `closed-days.ts`, `ClosedSection.astro`.
- Roughly 300 lines of SQL, 800 of library and API code, 700 of calendar code, 450 of Settings and People, 300 of public pages, and 200 of Calls and the inbox, plus the checks.

Update CLAUDE.md in the same change:
- Add a "Blocked time (040)" section.
- Remove "Any available dentist slots count chairs" from Open.
- Add 040 to the Layout list.
- Add Closed days to the Settings section list.

### 7.1 For the owner, before release

**Should a reminder wait while its visit sits in a closure nobody has dealt with?** Take a typhoon or holiday closure added after visits were booked: each patient still gets a text the day before naming the day and time. They come to a locked door unless the desk calls or moves them first. Calls, the Block panel and the inbox now show those visits and when each reminder goes, but the text itself is unchanged.

The alternative is a single predicate in `sms_enqueue_reminders()`: skip a visit with `blocked_ok_at` null that overlaps a live `closed` block, or a live `leave` block for its dentist. Keep it or Move lets the reminder go again. It would go into 040 as step 11. The Calls rows would then read "Reminder held: the clinic is closed then", and the §1.2 and §1.4 sentences "its reminder text still goes out" would change with it. It is reversible, and it never sends anything new.

This spec ships the reminders unchanged. It does not quietly change what patients are texted without the owner's answer.

### Risks

1. **Migration order.** The runner refuses a pending file that sorts before the newest one applied. If 040 reaches production before 039, the deploy that brings 039 must run `npm run db:migrate -- --allow-late` once: Render's `preDeployCommand` gets the flag for that one deploy, then is put back. Local databases need the same. Do not renumber.
2. **Fewer public slots, on purpose.** These are truthful, but the owner should be told they are visible:
   - Where listed dentists who are in are fewer than chairs, fewer "any dentist" slots show. Session-road on a Monday: 4 chairs, 2 dentists in.
   - The named-dentist path now also respects the chair count, chairs out of use, and visits booked with no dentist (§5.8).
   - Request mode now refuses a named dentist's day off, where before it took the request.
3. **The desk gets one extra tap.** Closed weekdays, times outside the hours, and dentists not in used to pass silently. They now ask for Book anyway. Walk-ins are exempt (§1.4).
4. **Visits made during the deploy.** Visits booked by the old web version between the migration and the new release start with `blocked_ok_at` null. Any that fall in closed time appear on Calls and need one Keep it.
5. **Cost.**
   - `clinic_unavailable` is now plpgsql (not inlined). It runs over 366 days on Calls and twice per hours or person-hours save: a few thousand generated rows, materialized once.
   - The inbox adds a 14-day read on every workspace page for people with `schedule.edit`.
   - `/find/` adds one 31-day definer call per listed clinic, next to the existing `openSlots`.
   - Watch these past about 50 clinics.
6. **Weekly saves and kept visits.** A lunch or hours save re-opens (clears `blocked_ok_at` on) only visits it newly put in closed time. A visit already in closed time for another reason, and kept, stays kept. A new dated block re-opens every visit inside its range.
7. **Settings grows a section.** The list's order and the 7-role snapshot change for `settings.edit` roles (verification 18 allows it).
8. **Seams with the other five proposals.**
   - p24 (slot suggestions) must use `M.nextFree(…, blocks, dentistId)` and read `clinic_unavailable()` for `/api/schedule/free`.
   - p25 (edit in place) must route length changes through PATCH's `moved`, so `findBlock` runs.
   - p32 (booking from the calendar) inherits everything through `openSlots` and `slotStillOpen`.

### Deferred

Both verifiers deferred these. Each needs the owner's decision first, and none is built here:
- `clinic.turnover_minutes`. It would refuse the back-to-back visits the desk books today.
- A weekly emergency hold that blocks the public but not the desk.
- A one-press list of Philippine holidays. It needs a named proclamation source and someone to update it every year. `src/data/holidays.ts` is **not** created, and the Closed days section says so plainly.

---

## Appendix: Review notes

Each objection was checked against the code at `18a4017`.

1. **Backfill marks every future visit as kept.** Held: `visitsInClosedTime` required `blocked_ok_at` null, and a lunch save never cleared it. Fixed:
   - 040 marks only visits already in closed time under the weekly shape (§2 step 6);
   - the hours and person-hours saves take the closed set before and after the write under the lock and re-open only the new ones (§3.2 `closedIds` / `reopenNewlyClosed`, §3.11);
   - verification 22.
2. **The named-dentist path ignores visits with no dentist.** Held: the Tuesday example double-books Domingo, and today's `findClash` re-check had the same gap. Fixed: `slotOpen` step 5 applies on both paths (§3.4); verification 2 and 13.
3. **Verification uses wrong seed facts.** Held: Cariño is Tue/Thu at session-road and Tabanao is Mon/Wed/Fri (`directory.ts`). Fixed: step 12 uses Tuesday; step 13 expects a cap of 1 on Tuesday, a cap of 2 on Monday, and a named refusal.
4. **The soft stop hits walk-ins.** Held: `panels.ts` rounds a walk-in's time up to the next 5 minutes, so 8:52 lands at 8:55 in `shut`, and the POST did not exempt `arrived`. Fixed: §1.4, §3.7, §4 panels, §5.2, verification 14.
5. **The teal Save loses typed closed days.** Held: HoursSection is one form with its own teal Save, and a second form's fields are not sent with it. Fixed: Closed days is its own Settings section with its own teal Add (§1.2, §3.11).
6. **Reminders still go for visits inside a closure, unshown.** Held in part. Fixed:
   - the reminder state on every In closed time row, in the Block panel's list and on the printed sheet;
   - an inbox count (§1.5, §3.13).

   Put to the owner as a release question rather than built by default (§7.1), because it changes what patients are texted. Rejected: sorting by reminder time, because reminders go a fixed one or two days before the visit, so soonest-visit-first is already that order.
7. **Request mode ignores the chosen dentist's leave and hours.** Held: `placeRequest` never looked at the dentist, so today a request on his day off is accepted too. Fixed: §1.6 and §3.6, worded "not in", because the public side never tells leave from a day off.
8. **Visits with an unlisted dentist count as unassigned.** Held: `public_booked_ranges` gives a slug outside `dentistProfiles` for such a visit. Fixed: a new `public_busy_ranges` with `named` (§2 step 8, §3.4, §3.5). `public_booked_ranges` is kept, because a new column would change its return type.
9. **§5.8 was false as written.** Held on both points. (a) is stated as an intended change (§5.8, Risk 2, verification 2). (b) now uses the dated form only past a week, or at a week when a closure moved the opening, so the identity with `[]` holds (§1.6, §3.4, verification 1).
10. **/find/ reads 8 days, the clinic page 31.** Held. Fixed: `/find/` reads the same 31 days, and `statusFor` looks 30 days, so the two agree (§1.6, §4 Public, verification 16).
11. **A half lunch or half hours passes the CHECK.** Held: `false OR NULL` passes. Fixed: `num_nonnulls` pair checks (§2 steps 1–2); verification 7.
12. **Settings dispatch and landing.** Held: the dispatch array at `settings/index.astro` would send `block-add` to the profile handler, and `saved=block` is not a section. Fixed by the Closed days section: `closed-add` / `closed-remove` in the array, `SECTION_OF` → `closed`, and `?saved=closed` (§3.11).
13. **The person-hours sentence uses a clinic-wide count.** Held. Fixed: the before/after diff scoped to that dentist (§1.3, §3.11); verification 12.
14. **The race check fails on correct behaviour.** Held: `created_at` is the transaction's start, taken before the advisory lock. Fixed: a per-round check that a 201 is in `inside` (verification 19).
15. **A far date returns no lunch.** Held: the 400-day guard returned nothing. Fixed: two `loadBlocks` calls (§3.10), and `clinic_unavailable` raises past 400 days (§2 step 5); verification 7 and 20.
16. **In closed time cannot print.** Held: `.cs-screen` is hidden on paper, and only `.cs-sheet` prints. Fixed: a sheet table (§1.5, §3.12); verification 15.
17. **Smaller desk gaps.** All six held and are fixed:
    - (1) the copy fills only rows where the lunch fits, and says which it skipped (§1.1, §4);
    - (2) `nextFree` takes the chosen dentist (§1.4, §4); verification 12;
    - (3) Remove is rendered only with `schedule.edit` (§1.4, §4); verification 18;
    - (4) kept visits on a closed day stay in Still to confirm under their own day (§1.5, §3.12); verification 15;
    - (5) chair-out ranges count only for chairs ≤ `chairs` (§3.4); verification 2;
    - (6) `public_dentist` gains hours in 040, and `/dentists/<slug>` shows them (§2 step 10, §4); verification 12.