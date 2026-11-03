# The schedule, the Dashboard, blocked time and how the day runs

*Moved here from `CLAUDE.md` word for word on 10 Oct 2026 (plan item 1.9). `CLAUDE.md` holds the rules; this file holds the detail. Where they differ, `CLAUDE.md` wins.*

## The schedule — `/c/<slug>/schedule/`

- **The status machine is the server's.** `NEXT_STATUS` in
  `src/lib/schedule.ts` says where a visit may go from where it is, and
  `applyStatus` refuses the rest: a cancelled or completed visit cannot walk
  back into a chair another patient now holds, and cannot be moved. The
  pages' buttons follow it; they do not define it.
- **One booker at a time per clinic.** `/api/schedule` *and* `/api/bookings`
  take `pg_advisory_xact_lock(hashtext(clinic_id))` and re-check the slot
  **inside** the transaction. The public booking API used to check with
  `openSlots()` before opening one, so a patient and the front desk could
  both take a dentist's minute — measured, twice.
- **A move drops the texts that named the old time** (`dropStaleTexts`),
  including the reminder's dedupe key, so the day-before pass writes a fresh
  one for the new day.
- One day, one column per chair (or per dentist with `?by=dentist`), 15-minute
  rows over the clinic's hours; a week view for the shape of the week. Web
  bookings and seeded visits arrive with `chair = null` and sit in an
  **Unplaced** lane until the desk drags them onto a chair — that lane is the
  inbox, do not hide it.
- Every change is one JSON call to `/api/schedule` (POST create, PATCH
  move/status) with the `X-CSRF` header; `findClash()` in `src/lib/schedule.ts`
  refuses a chair or a dentist double-booking with one sentence naming who is
  in the way. Status changes follow the Today page's state machine; copy it,
  do not fork it. Moving a future visit texts the patient the new time.
- Molarsoft's calendar is behind a login; what clinics praise in any scheduler
  is few taps, colours that mean status, a visible flow, and never a slot the
  clinic cannot honour. The `QUEUE` colour classes on the Today page are the
  only status colours; the schedule reuses them exactly.
- **Free times (p24).** New booking (under Chair · Dentist) and a visit's Move
  form offer up to four free starts for the length on the day chosen, anchored
  on the form's own time, and with a dentist chosen her next two free days
  (`cal/free.ts`, `cal/FreeTimes.astro`). The arithmetic is pure, in `model.ts`:
  `holdsOf`, `freeAt`, `freeStarts`, `pickStarts`, `freeDays`, `blockHolds`. A tap
  fills Time and Chair (a next day's chip fills the Date too); nothing is saved
  until Save, and the server still decides under its lock. Suggestions keep the
  clinic's hours and blocked time (lunch and closures hold everything, a chair
  out of use its chair, a dentist their days, hours and leave), and every visit
  that holds its slot. They count visits with no chair or no dentist yet against
  the chairs and the day's dentists, as /find/ does, and never put a moved visit
  in its own way. The gap after each visit is the clinic's own choice
  (`clinic.turnover_min`, 044, `boot.turnover`; 0 by default, "How the day runs" below). `nextFree`, which feeds the count line and the walk-in's chair, is a
  wrapper with its old answer when nothing is blocked. A day not on screen is
  read eight days at a time (`ctx.rangeCards`, kept 60 s). After a clash 409
  the board reloads (`ctx.reload`) and the free times read the book again; a
  blocked 409 offers Anyway instead. The live refresh tells an open block which
  days changed and redraws keeping the focus. The block is hidden while Here now
  is ticked and for anyone without `schedule.edit`. A redraw keeps every chip
  that is still wanted, so a tap is not lost when a field's change fires on the
  press. Hooks are `data-bk-slots*`, `data-vp-slots*` and `data-ft-*`; classes
  `.ft-*`.
- At a clinic with one dentist on its calendar (`boot.staff`), New booking
  starts with her in Dentist, unless the desk tapped a dentist's column or
  "No dentist" (`openBook`). Dentist menus name a dentist's hours ("Dr. Cariño
  · in 1:00–6:00 pm").
- **Edit in place (p25).** PATCH `/api/schedule` tells a move from an edit.
  - A new start, chair or dentist is a move: it stamps `moved_at` and audits
    `appointment.move`. A new length alone, or a new service, reason or visit
    note, is an edit: it audits `appointment.edit` and never stamps `moved_at`,
    so a length cannot place a web request.
  - The Edit form sends `catalogCode` and `reason` together. A sent reason is
    final; an empty one takes the service's name. A retired service is refused
    unless the visit already has it. "No fee-guide service" is refused while the
    reason still names one, because data.ts reads a service from the words.
    Edits are refused on a visit in DONE and on an unplaced request. A visit
    booked online keeps the patient's note.
  - Texts follow what they name. Only a new start drops waiting texts and texts
    the new time. A new dentist, or a new reason, withdraws only the reminders
    the next reminder pass writes again, through `retellTexts` in `schedule.ts`:
    keep its conditions in step with `sms_enqueue_reminders`, and it stops at
    23:45 Manila. A new reason also replaces a waiting confirmation one for one.
    Sent, held-over and claimed texts are left, and nothing extra is sent. The
    answer carries `retold`.
  - The blocked-time soft stop runs on a move and on a resize (after the edit's
    refusals and the clash rule), and both mark `blocked_ok_at`. Words and status
    never look at blocks.
  - The desk note is `patient.notes` less the import's own two lines
    (`deskNoteOf` in `import.ts`, built from the same `oldPhoneNote` /
    `birthYearNote` the import writes with). The record's
    `?open=details&dash=<visit>` opens Edit details with the caret in Notes and
    drops `open` and `dash` from the address; a save returns to the Dashboard
    with that visit open (`?booking=`, with `date=` when not today), only when it
    is the patient's visit.
  - New charge fills a senior citizen or PWD discount only from the patient's
    latest statement that is neither void nor a draft (`lastDiscountFor`), says
    which statement and asks for the card to be checked. An older one is only
    named, and a birth date of 60 or more only brings a hint. Nothing is filled
    on a refused save or for a patient found through the search, because
    `/api/patients` carries no ID numbers.
  - **The visit panel (the calendar side).** Its actions are the teal next step, Move, Edit, Open record,
    then More. Edit is quiet, for `schedule.edit` only, on a visit that is not done, cancelled or a
    no-show, not an unplaced request and not a day-only visit; its form (`[data-vp-edit]`, drawn only for
    `schedule.edit`) is the Move form's sibling — `toEdit` hides Move and calls `vpFree.hide()`, `toMove`
    hides Edit then `vpFree.update()`, and FreeTimes lives only in Move. While either form is open its Save
    is the panel's one teal button and the step goes quiet (`tealFit`). Not now redraws the panel from the
    board (`unfold`), because the live refresh never refills the panel under an open form (`formOpen`). The
    form sends only what changed: `catalogCode` and `reason` together, `minutes`, and `notes` — never for a
    web or request visit, whose note is the patient's own words, shown read-only under "From the booking".
    A new length into blocked time is warned under Minutes, and the refusal offers a quiet Save anyway
    (`data-vp-edit-anyway`); the Move form says "Now …" for a length alone.
  - **The desk note** (`deskNote`, worked out in `data.ts`, never on the client) is a `note` icon on the
    card (in `--sub`, never a status colour), one line in Today's patients, and a Desk note row after Mobile
    with Edit or Add a note (`?open=details&dash=<visit>`, for `records.edit`). `formNervous` is a blue
    pill; `consentFor` names what the tablet consent covered, and the Edit form's amber line asks for a new
    signature when the service or reason changes; "Notes" is "Visit note". A visit's "consent signed" is
    `visit_treatment_consented()` (039): the tablet's signing or an agreed general consent form. `LIVE_KEYS`
    include `catalogId`, `deskNote`, `formNervous` and `consentFor`.

## The dentist who runs the clinic (3 Oct) — the Dashboard as a dentist-owner's home

The owner: "imagine you're a dentist who also manages his own clinic, make the clinic site suitable for your
operations with ease of access and better user experience". The Dashboard is the first screen of every day.

- **Someone who treats** is a dentist or associate, **or an owner or admin with a column here** (`staff_schedule` at
  this clinic, the calendar's `data.staff`): `treats` in `index.astro`, `boot.me.treats`. Before, an owner who treats
  never had Mine · Everyone, because only `role` dentist/associate counted. A dentist's Dashboard still opens on their
  own column (`me.dentist`, `?dentist=` empty); an owner's opens on the whole clinic, and her Mine is
  `?dentist=<her id>&by=dentist` (`setWhose` and the seg's hrefs in `board.ts` follow `me.dentist`).
- **Next for you** (`[data-pt-next]`, `renderNext` in `patients.ts`, drawn with Today's patients and kept in step with
  every change the calendar takes): the patient in your chair, else your next visit today not done — the time (or the
  minutes waiting), name and age, what for, the chair, every allergy (red) and alert (amber), "Then N more with you
  today", **Open record** (the record on that visit, `?visit=`, so This visit is there) and the visit's next step (the
  row's same one press, `stepOf` / `takeStep`; the focus stays on the card). "All done for you today" when every visit
  of yours is done; away when you have none. Quiet buttons: New booking stays the screen's one teal.
- **The first screen gives way to the day**: the four numbers are a slim strip (two by two on a phone, no note or
  icon there); the tasks card only while a task is open; the website's lane only while something waits for the desk
  (`.cal-lane[data-reqs]:not([data-some]):not(:target)`, so the inbox's `#requests` still shows it). Measured at
  1440 × 900: the calendar's grid starts at 613 px (it was below the first screen).
- Checked by `scripts/dev/schedule/dash-check.mjs` (the first screen, Next for you and Open record, Mine · Everyone for
  the owner, Done on the card moving it on, a dentist, someone with no column, New → Task, `#requests`; the strip and
  the card ≥ 4.5:1 light and dark at 1440 and 390 — lowest 4.95:1 — 44 px, no sideways scroll). Reseed before it.
  `choices-check.mjs` now opens tomorrow's weekday for its reminder test when tomorrow is a closed day (a Saturday
  run), and closes it after.

## Blocked time (040) — lunch, closed days, a dentist's hours and leave, a chair out of use

The owner's first ask of the round: blocked time that both the calendar and online booking respect.
The weekly shape lives with the week — lunch is a break on `clinic_hours` (`break_from_min`/`break_to_min`),
a dentist's hours are `staff_schedule.from_min`/`to_min` (null = the clinic's hours) — and dated exceptions
live in `clinic_block` (kinds `closed`, `leave`, `chair_out`; no weekly rows, no lunch kind). A protected
emergency hold and a list of Philippine holidays are deferred for the owner; the turnover gap and holding
reminders in closed time are each clinic's own choice since 044 (below, "How the day runs").

- **One reader.** `clinic_unavailable(clinic, from, to)` turns all of it into dated ranges: the hours
  (`shut`), lunch, a treating dentist's days and hours (`hours`), and the live blocks. The desk reads it
  under RLS; the public reads `public_blocked_ranges()` and `public_busy_ranges()` (definers: times, a slug
  or a chair, a collapsed kind and whether a visit has a dentist — never a note, an author, or leave told
  apart from a day off).
- **The desk's side is `src/lib/blocks.ts`**, always inside `withClinic`: `loadBlocks` (every range but
  shut, with names and notes; throws past 400 days), `findBlock` (the first range a visit sits in, in its
  scope — the clinic, its dentist, its chair — by priority closed, shut, lunch, leave, hours, chair_out),
  `addBlock` / `removeBlock` (under the book's lock `pg_advisory_xact_lock(hashtext(clinic id))`, audit
  `schedule.block` / `schedule.unblock`), `closedIds`, `reopenNewlyClosed`, `visitsInClosedTime`,
  `keepInClosedTime`, `upcomingBlocks`, `readBlock` / `readWholeDays`, and `IN_SCOPE_SQL` /
  `VISIT_AHEAD_SQL`. A block is only added or removed: the app has insert and `update (removed_at,
  removed_by)`, and a trigger refuses the rest.
- **The soft stop.** `/api/schedule` POST, and PATCH when it moves or resizes, run `findBlock` after
  `findClash`. In closed time the answer is 409 `{ error: <one sentence>, blocked: true, kind }`;
  `anyway: true` books it and sets `appointment.blocked_ok_at` (audit `appointment.anyway`), and a move out
  clears it. A walk-in (`status: 'arrived'`) is never asked — the patient is at the desk — and is marked
  the same way. A clash always wins: a hard 409 with today's sentence and no anyway. A status-only or
  words-only PATCH never looks at blocks. GET's Range adds `blocks` and `staff[].hours`.
- **`blocked_ok_at`** means someone saw the visit in closed time and kept it there (Book, Move or Place
  anyway, a walk-in, Calls → Keep it). Null means nobody has looked, and such a visit belongs on Calls → In
  closed time. A new block clears the mark on the visits inside it. A weekly change clears it only on
  visits it newly put in closed time (`closedIds` before, `reopenNewlyClosed` after, under the lock). 040
  marked the visits already booked in the old weekly closed time as seen.
- **`/api/schedule/blocks`**: POST `{ kind, dentistId?, chair?, startsAt, endsAt, note? }` → 201 `{ block,
  inside }`; PATCH `{ id, remove: true }` → 200 `{ removed }`. It uses the schedule's gate and limit,
  `X-CSRF`, and `schedule.edit`. `inside` lists the visits already booked there with their reminder's
  state; nothing is done to them, and no text is queued or changed by a block. Reminders still go, unless
  the clinic holds them (044, below): then a block withdraws the reminders waiting for the visits it puts in
  closed time, and `inside` says "Reminder held".
- **The words are `src/lib/block-words.ts`** (pure; the calendar imports it too): `blockSentence`,
  `blockLabel(r, 'chip' | 'strip', { day })`, `blockListed`, `whyWords` (the Calls pill), `blockDone`. Whole
  Manila days are written as days; a block already under way says when it ends.
  `src/lib/reminder-state.ts` is the one wording of a visit's reminder (Calls, the Block panel).
  `src/lib/schedule-api.ts` holds the schedule API's gate, body readers and refusal (a refusal may carry
  extra fields). `isDentistHere` is in `schedule.ts`.
- **Settings.** Opening hours has lunch on each day (blank for none; both ends or neither, inside the
  day); a script-only "Same lunch every open day" copies the first lunch where it fits and names the days
  it skipped. **Closed days** (`settings/_lib/closed-days.ts`, `_ui/ClosedSection.astro`, `settings.edit`)
  lists every dated block ahead with a quiet Remove, and adds the clinic closed or a dentist away for whole
  Manila days (its own teal Add closed days; posts `form=closed-add` / `closed-remove`, mapped to `closed`
  in `SECTION_OF`). A person's page has their hours on their days here, for people who treat. Every weekly
  save (hours, a person's days) takes the book's lock, reads `closedIds` before, writes, and runs
  `reopenNewlyClosed`; the note after it counts only the visits it newly put in closed time and links to
  Calls. Nothing is texted, held, moved or cancelled.
- **The Dashboard** hatches blocked time like closed hours, with its words on a solid slate chip, and the
  hatch takes no clicks. Lunch and a closure show in every column; a chair out of use in its chair's
  column; a dentist's time away or not in in their column, or on a week filtered to them. A phone's list
  reads each as a line among the cards. The **Blocked** strip lists the dated blocks on screen as pills
  that open `cal/BlockPanel.astro` in view mode (Remove for `schedule.edit`, asking first). Its add form
  (More → Block time, + New → `?new=block`) is `schedule.edit` only and lists the visits already inside.
  New booking and Move say before saving when a time falls in blocked time ("Saving asks you to
  confirm."); the 409 offers a quiet Book / Move / Place anyway; a drag into blocked time goes back with
  Move anyway in its toast. The count line says "lunch 12–1 pm" and "closed all day".
- **Calls → In closed time** (`#closed-time`, first when not empty): each visit ahead in closed time that
  nobody kept, with why, its reminder in Calls' words, the number, Move (`/?date=&booking=`) and Keep it
  (`intent=keep`, `schedule.edit`, audit `appointment.keep_blocked`). The next two open days skip a day a
  closure covers whole; a kept visit on such a day stays on Still to confirm under its own day; the printed
  sheet has an In closed time table first. The inbox's "In closed time, next 2 weeks" (for
  `schedule.edit`, shown when above 0) counts the same rule over 14 days.
- **Patients.** One rule, `slotOpen()` in `src/lib/availability.ts`, decides both what a patient is
  offered (`openSlots`) and the re-check inside the booking's transaction after the clinic's lock
  (`slotStillOpen`). A slot is open when nothing clinic-wide touches it (outside the hours, lunch, a
  closure); a chair in service is free after every visit then; a named dentist is listed and neither away
  nor booked; and the listed dentists who are in and free outnumber the visits booked then with no
  dentist. A visit whose dentist is not listed here holds a chair but no listed dentist. `/api/bookings`
  never reads `anyway`: a blocked slot gets today's 409 "That slot has just gone. Pick another." A request
  (`placeRequest`) is refused on a day or part of a day a closure shuts, or, with a dentist chosen, that
  dentist is not in ("Dr. Cariño is not in on Tue 6 Oct. Pick another day, or any dentist."); its
  placeholder never lands in lunch or the dentist's time away, and "No word by" skips closed days.
- **The status pill** reads `closuresFor(l)`: the clinic's closures and lunch for 31 days, per Manila day,
  the same on a Find a clinic card and on the clinic's page ("Open now · lunch at 12 pm", "Lunch · back at 1
  pm", "Closed today · opens Mon 9 am"). With none, every string is the pre-040 one. The hours card shows
  each day's lunch and "Closed days ahead" (30 days, never a note). A dentist's days carry their hours
  ("Here Tue 1–6 pm · Thu") on the clinic page, the booking and `/dentists/<slug>`. A request's Preferred
  day says "Closed on: …" and, with a dentist chosen, "Dr. Cariño is not in on: …" (`dentistsAway`).
- Fewer online slots, on purpose: "any dentist" is offered only while a dentist who is in is free, and the
  named-dentist path now respects chairs, chairs out of use and visits with no dentist.

## How the day runs (044) — the owner's three questions, as each clinic's own choice

Clinic settings → Clinic profile → **How the day runs** (`id="work"`, `settings.edit`). Every default is what
shipped before, so nothing changes for a clinic until it chooses. The save reads the three only when the form
carries `has_work_choices` (an older tab keeps what is saved); a gap not on the list is refused.

- **Time between visits** (`clinic.turnover_min`: 0, 5, 10, 15, 20 or 30). Online booking keeps it after each
  visit on the chair count (`slotOpen`'s `turnover`; `openSlots` and `slotStillOpen` read it through the definer
  `public_clinic_turnover()`, listed clinics only, and the re-check pads its busy read by it), and so do the
  calendar's suggested times (`boot.turnover` → `freeStarts` / `freeDays`, the note says so). Dentists and blocked
  time are never padded, and `findClash` never refuses on it: the desk can still book back to back by hand.
- **Hold the reminder** (`clinic.hold_closed_reminders`, p07 §7.1). While a visit sits in closed time nobody kept
  (`appointment_reminder_held()`: the switch, `blocked_ok_at` null, a range of `clinic_unavailable()` in its
  scope), `sms_enqueue_reminders()` writes neither of its reminders, and `holdClosedReminders()` (blocks.ts)
  withdraws one already queued — after `addBlock`, after `reopenNewlyClosed`, and when the switch is turned on.
  Keep it (Calls) or a move out of closed time, and the next pass writes it. Calls (its lede, the line, the sheet)
  and the Block panel say "Reminder held" (`reminderWords`' `held`); sent texts are never touched.
- **Ask about a consent form not signed** (`clinic.consent_ask_at`: `chair` or `arrived`). At the door,
  `PATCH /api/schedule` to `arrived` or `in_lobby` asks as In the chair does (409 `{ consent: true }`, "Say why
  they are checked in without it, or have it signed while they wait."), the panel's button reads **Check in
  anyway**, and the reason is kept as `consent_override.context = 'arrived'` ("checked in"); In the chair then asks
  only about what nobody answered that day (`seatingGaps`). At the chair, as before.
- Checked by `scripts/dev/schedule/choices-check.mjs` (each choice end to end, the old-form keep, the forged gap,
  the block → withdrawn → pass → Calls → Keep it → written again round, the door in the API and from one tap, and
  the new block measured light and dark at 1440 and 390: lowest 4.55:1, targets ≥ 44 px, no sideways scroll).
