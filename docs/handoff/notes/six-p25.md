# Spec p25: edit a booked visit in place, and show the desk's notes where the desk decides

Written against `main` @ 18a4017 (migrations up to 038). This is the verifiers' adjusted scope, revised after the review; the "Review notes" appendix at the end records the changes. It has three pieces and **no migration**:

1. **Edit a visit in place.** The desk changes the service, length, reason or note without cancelling and rebooking. If a consent was already signed for the visit, the panel names what it covered, so a changed treatment gets signed again.
2. **The patient's desk note on the Dashboard.** The note is `patient.notes`, minus the two lines the import writes by itself. The visit panel also shows the patient forms' existing "nervous about visits" answer.
3. **New charge fills in a senior citizen or PWD discount** when the patient's latest statement had one. It names an older discount when the latest statement had none, and it gives a hint when the birth date says 60 or over.

Dropped, and not to be built here:
- The "Nervous" and "Senior/PWD ID on file" tick-box columns.
- Any new patient column.
- `PATCH /api/patients`.
- Any coloured flag pill on a calendar card or in Today's patients.

A standing PWD flag is disability data, and the notice `privacy-2026-09` does not name it. "Nervous" is already a patient-forms answer, so a second copy would duplicate it. Migration numbers 039, 040 and 041 are left alone.

---

## 1. What the clinic and the patient see

### 1a. The visit panel (Dashboard → a visit)

**Actions row.** It becomes `[teal next step] [Move] [Edit] [Open record] [More ▾]`.
- **Edit** is quiet (`ws-btn ws-btn-quiet ws-btn-sm`) with a new `pencil` icon. It is never teal.
- Edit shows only when **all** of these hold: `boot.canSchedule`, `!M.DONE.has(c.status)`, `!M.isRequest(c)` and `!c.dateOnly`.
- So it is not offered on a cancelled, done or no-show visit, on an unplaced web request, or on a visit brought in with its day only. Without `schedule.edit` the button is left out, the same way "Text the patient" is left out without `messages.send`.

**The Edit form.** Pressing Edit hides the Move form if it is open. It then opens a folded form styled like Move (`.vp-move`, a teal-tint box). Focus goes to the form's title and then to the Service select.

| Part | Words |
|---|---|
| Title | **Change this visit** (pencil icon) |
| Line under the title | "The time and the booking ref stay the same. No extra text goes out: a text still waiting to go out is rewritten with the new reason." |
| Service (select) | The first option is "No fee-guide service". Then comes every active fee-guide row, as "Filling · 45 min · ₱800". The form starts on the visit's service: the one stored, or the one its reason names (data.ts's rule for older visits). If that service has been retired, it is added at the end as "<name> · no longer in the fee guide". |
| Hint under Service | "Fee guide: ₱2,000–4,500." or "Not priced in the fee guide.", in the booking panel's words (`M.priceLong`). |
| Minutes (number, 5–480, step 5) | Starts at the visit's length. Choosing a service sets it to that service's chair time. |
| Hint under Minutes | "Ends at 10:15 am." When the end is past closing: "Ends at 5:30 pm. The clinic closes at 5:00 pm." |
| Reason (text, maxlength 120) | Starts at the visit's reason. While it still reads as the service's name (or was empty), it follows the service: choosing another service writes that service's name, and "No fee-guide service" empties it. Once the desk types in it, it stays as typed, and it is saved as typed. |
| Note for this visit | **For desk and imported visits:** a textarea (maxlength 500) holding `appointment.notes`. It is saved as one line, like the booking panel's note. **For visits booked online** (`source` is `web` or `request`): no field. The note, if there is one, shows read-only under the label "From the booking" with its line breaks kept, because it is the patient's own words and no copy of it is kept anywhere. |
| Consent line | Shown only when a consent was signed on the tablet for this visit **and** the Service or Reason now differs from what the form opened with. It is an amber callout with an icon: "A consent was signed for this visit for <treatment>. If the treatment is different, have them sign again." For people who may edit records (`boot.canEdit`) it ends with a **Sign on this tablet** link (`.vp-link`, 44px) to the signing page. |
| Buttons | **Save changes** (teal, like Move's "Save new time") · **Not now** (quiet) |

**What happens on Save.**

The browser sends:
- **`catalogCode` and `reason` together** whenever either the service or the reason changed. `catalogCode` is the select's value, with `''` sent as `null`. `reason` is the field as typed.
- `minutes`, when it changed.
- `notes`, when it changed (`''` is sent as `null`). It is never sent for a visit booked online.

If nothing changed, the form closes and the panel says "Nothing changed."

Checks in the browser:
- "Minutes is a whole number from 5 to 480."
- "Say what the visit is for, or pick a service." (an empty reason and no service)

When the save succeeds:
- The panel redraws from the server's answer, and the card flashes.
- The green line says "Saved: Filling · tooth 26, 45 minutes." (`M.whatOf` and the length).
- If a waiting text was withdrawn to be rewritten (`retold > 0`), the line adds: " The text still waiting to go out is rewritten to say it."
- The booking ref, the time, the chair and the dentist do not change, and no "Moved" line appears.

Refusals come back in the panel's red callout, in the server's own words. The form stays open with what was typed.
- A 409 clash: "Chair 2 has Ana Reyes until 10:30 am." (the existing `findClash` wording).
- "That visit is marked done. Its service, length and note stay as they were." This also covers cancelled and no-show, through `WORDS`.
- "That service is not in the fee guide any more. Pick another."
- "“Restoration 26” is the fee guide’s Filling, so the visit reads as Filling. Pick Filling as the service, or word the reason another way." This comes when no fee-guide service is chosen but the reason still names one: data.ts reads a service from the words for visits that have none stored.
- "Say what the visit is for, or pick a service." (the server's copy of the browser check)
- For a hand-written PATCH only:
  - "Place the request first: give it a chair or a new time. Then change what it is for." (an edit against an unplaced request)
  - "A visit booked online keeps the note the patient wrote with it. Put the desk’s words in the patient’s desk note." (notes on a `web` or `request` visit)
- The existing 403 role and CSRF sentences, and the 429 rate-limit sentence.

**The Move form after this change.**
- Changing only Minutes is no longer a move. The sentence reads "Now Thu 1 Oct, 9:00 am – 9:45 am." (`Now ${M.whenOf(start)} – ${M.timeOf(end)}.`), not "Moved: …", and `moved_at` is not stamped.
- Waiting texts are dropped only when the **start** changes, because texts name the start, never the end or the chair. A new dentist withdraws a waiting reminder so the next pass writes it again, because reminders name the dentist. A new chair or length leaves waiting texts alone.

**The "This visit" list.** The row labelled "Notes" is renamed **Visit note**, so it cannot be confused with the patient's desk note.

**"Before we start" (the checklist).** "Consent: signed on the tablet for this visit" becomes "Consent: signed for <treatment>":
- `<treatment>` is the treatment of every consent signed for this visit, joined with "; " and cut to 120 characters with "…".
- The whole text goes in the line's `title`.
- The line stays green. The Edit form's consent line (above) is what asks for a new signature.

**The "Patient" part.**

A **Desk note** row, after Mobile:
- It shows the patient's desk note, with line breaks kept.
- For people who may edit records, it has a teal **Edit** link (`.vp-link`, 44px) to `/c/<slug>/patients/<id>/?open=details&dash=<visit id>`.
- No note, and the person may edit records: "None yet" and an **Add a note** link.
- No note, and the person may not edit records: no row.
- The person may not edit records: the note is shown without the link.

A blue pill in the alerts row, after allergies and conditions, when the latest patient form added to the record answered "nervous about dental visits":
- 'very': "Very nervous about visits (from their form)"
- 'little': "A little nervous about visits (from their form)"
- 'no', or no form: nothing.
- The pill's `title` is "From the patient forms".

### 1b. The calendar card

- A card whose patient has a desk note gets a small `note` line icon after the red alert mark. It uses the card's secondary ink (`--sub`), never a status colour.
- The icon's `title` is "Desk note: <note, cut to 200 chars…>".
- The card's `aria-label` gains ", desk note: <note, cut to 120 chars…>".
- There is no new pill and no new colour. The QUEUE colours stay the only colours on a card.

### 1c. Today's patients (Dashboard list)

- Under the "9:00 am · Cleaning" line, the `note` icon and the desk note sit on one line in ink-2, cut off with an ellipsis. The `title` holds the whole note.
- The row's `aria-label` gains ", note: <cut to 120>".
- There is no pill.

### 1d. The patient record (Edit details) and Add patient

- `?open=details` opens the existing Edit details panel as the page loads, with the caret at the end of **Notes**. This is only for people with `records.edit`; everyone else sees the record as it is today.
- `&dash=<visit id>` (the Dashboard's link) sends the desk back where it came from:
  - The Edit details form carries the visit id in a hidden `dash` field.
  - A successful save goes to `/c/<slug>/?booking=<visit id>`, with `&date=<its Manila day>` in front when that day is not today. The Dashboard opens with that visit's panel showing the new note. This happens only when the visit is this patient's; otherwise the save lands on the record as today.
  - A refused save redraws the record with the panel open, as today, still carrying the field.
- Once the panel has opened from the link, the address drops `open` and `dash` (`history.replaceState`), so Back does not open the panel again.
- A new help line goes under Notes: "The desk sees this beside the patient's visits on the Dashboard. Keep health details in Health."
- The same help line goes under Add patient's "Other notes" (`patients/new.astro`). The import template's hint for its notes column becomes "Anything else, kept on the record. The desk sees it beside their visits."

### 1e. New charge (`finances/new/`)

The fill-in applies when the page is drawn with `?patient=` or `?visit=` (the Dashboard's Charge, and the record's charge links), on a GET only. It reads the patient's **latest** statement that is neither void nor a draft.

**The latest statement had a senior citizen or PWD discount with an ID number:**
- "Senior citizen" (or "PWD") is pre-selected, the ID number is filled in, and the totals show the 20%.
- Under the ID, instead of "Ask for the ID. Its number prints on the statement.", the page says: "Filled in from statement SE-000123 (12 Aug 2026). Check the card: change it if the number is not the same."

**The latest statement had none, but an older one did:**
- Nothing is pre-selected.
- A line under the choices says: "PWD discount on SE-000098 (3 Feb 2025); none on the statements since. Ask for the ID." ("Senior citizen discount on …" for a senior discount.)

**Nothing is pre-selected, and the birth date makes them 60 or over today in Manila:**
- A line under the choices says: "60 or over by the birth date on file: ask for the senior citizen (OSCA) ID." It may show alongside the older-discount line.

**Change patient:**
- If the discount is still exactly as it was filled in (the desk has not touched the radios or the ID), it goes back to None, the ID empties, the from-line hides and the totals recount.
- The older-discount line and the age hint always hide.

**A refused save** draws the form again with what was posted. Nothing is filled in again.

**A patient chosen by typing in the search** gets no fill-in, as today. The fill-in reads the patient on the server. The search answers through `/api/patients`, which anyone who can use the schedule may call, so it must not carry ID numbers.

### 1f. The patient

- No extra text is sent for an edit. The patient receives at most the texts they would have received anyway.
- **Queued reminders** (24 h or 48 h) are rewritten by the worker, not edited in place:
  - A queued reminder is withdrawn and written again, with the new reason (or the new dentist), by the worker's next reminder pass. That pass runs **every 10 minutes**.
  - This happens only when that pass will write it again: the day before a visit that is booked or confirmed, or two days before a visit still booked at a clinic with the 48-hour reminder on; a placed visit with a number on file; and before 11:45 pm Manila, since a pass after midnight reads a new "tomorrow".
  - Any other waiting reminder keeps its old words. An example is one written late the evening before and held for 8 am on the visit day. Old words beat no reminder.
  - A reminder already sent is not sent again.
- **A confirmation still waiting to go out** (in retry back-off, or in the seconds before the worker's pass) is replaced by exactly one confirmation that names the new reason. The patient gets one text either way.
- `/me/` shows the new reason, because `patient_visits` reads `appointment.reason`. The booking ref they were given still works.

---

## 2. Data

**No migration.**
- Every column used already exists: `appointment.catalog_id`, `reason`, `notes`, `ends_at`, `source`, `moved_at`; `patient.notes`; `patient_form.answers`; `visit_consent.treatment`; `invoice.discount_kind`, `discount_id_no`, `series_prefix`, `number`, `issued_at`, `status`.
- The app already holds `update` on `appointment` and `message_log` (002's default privileges; no column revokes; no trigger on `appointment`).
- The reminder body functions (`sms_reminder_body`, `sms_remind48_body`) are revoked from the app (019, 036). That is why reminders are withdrawn and written again by the worker's pass rather than rewritten in place.
- 039, 040 and 041 stay reserved and unused.

The new reads all run inside `withClinic`, so each table's `tenant_isolation` policy scopes them:

```sql
-- data.ts EXTRA (three more columns)
p.notes as desk_note,   -- raw; extrasOf applies deskNoteOf() (import.ts), so there is one definition of the import's own lines
(select case when f.answers->>'nervous' in ('little', 'very') then f.answers->>'nervous' end
   from patient_form f
  where f.patient_id = p.id and f.status = 'added'
  order by f.submitted_at desc limit 1) as form_nervous,
-- patient_form_patient (clinic_id, patient_id, submitted_at desc) serves it; the same "latest added form" rule as the record's Overview.
(select string_agg(replace(btrim(vc.treatment), E'\n', '; '), '; ' order by vc.signed_at)
   from visit_consent vc where vc.appointment_id = a.id) as consent_for
-- visit_consent_visit (appointment_id) serves it, the same lookup as consent_signed.
```

```sql
-- invoices.ts lastDiscountFor: the latest statement given a senior/PWD discount, and whether it is the latest statement of all
with s as (
  select i.discount_kind, btrim(i.discount_id_no) as discount_id_no, i.series_prefix, i.number,
         to_char(i.issued_at at time zone 'Asia/Manila', 'YYYY-MM-DD') as issued_on,
         (i.discount_kind in ('senior', 'pwd') and nullif(btrim(i.discount_id_no), '') is not null) as discounted,
         row_number() over (order by i.issued_at desc, i.number desc) as n
    from invoice i
   where i.patient_id = $1 and i.status not in ('void', 'draft'))
select discount_kind, discount_id_no, series_prefix, number, issued_on, n = 1 as latest
  from s where discounted order by n limit 1
```

---

## 3. Server changes

### `src/lib/schedule.ts`

`dropStaleTexts` stays unchanged. Add this next to it:

```ts
/** A visit's words changed while its start did not: queued texts that name the old words. Reminders ('reminder:<id>',
 *  'remind48:<id>', both kind 'reminder') are withdrawn with their keys cleared ONLY when the worker's next reminder
 *  pass (sms_enqueue_reminders, every 10 minutes) will write them again: the same conditions as that function (036),
 *  and before 23:45 Manila, after which the pass reads a new "tomorrow". Any other waiting reminder, such as one held
 *  overnight for the morning of the visit, keeps its old words: old words beat no reminder. With `confirmations`, a
 *  confirmation-kind text still waiting (a desk or web confirmation, or a "moved" text) is withdrawn and counted: the
 *  caller queues one confirmation in its place. Sent texts keep their keys, so nothing goes out twice. Rows the worker
 *  has claimed ('sending') are left. Keep the reminder conditions in step with sms_enqueue_reminders. */
export async function retellTexts(tx: Tx, id: string, o: { confirmations: boolean }): Promise<{ reminders: number; confirmations: number }> {
  const { rows } = await tx.query<{ kind: string; n: number }>(
    `with v as (
       select a.id, a.status, a.source, a.moved_at, c.remind_48h,
              coalesce(nullif(a.booked_by_phone, ''), p.phone) is not null as has_phone,
              (a.starts_at at time zone 'Asia/Manila')::date - (now() at time zone 'Asia/Manila')::date as days_out,
              (now() at time zone 'Asia/Manila')::time < time '23:45' as before_late
         from appointment a join patient p on p.id = a.patient_id join clinic c on c.id = a.clinic_id
        where a.id = $1),
     gone as (
       update message_log m set status = 'cancelled', dedupe_key = null
         from v
        where m.appointment_id = v.id and m.direction = 'out' and m.status = 'queued'
          and ((m.kind = 'confirmation' and $2)
            or (m.kind = 'reminder' and v.before_late and v.has_phone and not (v.source = 'request' and v.moved_at is null)
                and ((m.dedupe_key = 'reminder:' || v.id and v.days_out = 1 and v.status in ('booked', 'confirmed'))
                  or (m.dedupe_key = 'remind48:' || v.id and v.days_out = 2 and v.status = 'booked' and v.remind_48h))))
       returning m.kind)
     select kind, count(*)::int as n from gone group by kind`, [id, o.confirmations]);
  const n = (k: string) => rows.find((r) => r.kind === k)?.n ?? 0;
  return { reminders: n('reminder'), confirmations: n('confirmation') };
}
```

`dropStaleTexts` itself is not called for an edit. It would also cancel an unrelated waiting "moved" text, and it clears the keys of reminders already sent, which would send a second reminder.

### `src/lib/import.ts`

- Export the two lines the import writes into `patient.notes` as builders, and use them where the import builds `notesText`:
  - `oldPhoneNote(phone)` → `Phone from the old records: ${phone}`
  - `birthYearNote(year)` → `Born in ${year} (the old records give only the year)`
- Add `deskNoteOf(notes: string | null): string | null`. It removes every occurrence of those two phrases and the " · " left dangling beside them, trims, and returns null when nothing is left. It keeps line breaks and everything else as written. Examples:

  | Input | Output |
  |---|---|
  | `"Born in 1958 (the old records give only the year)"` | `null` |
  | `"Prefers mornings · Phone from the old records: 045 123 4567"` | `"Prefers mornings"` |
  | `"Phone from the old records: 045 123 4567 · Born in 1958 (the old records give only the year)\nFather must accompany"` | `"Father must accompany"` |

- In the column list, the notes column's `hint` becomes "Anything else, kept on the record. The desk sees it beside their visits."

### `src/pages/api/schedule/index.ts` (PATCH only; GET and POST unchanged)

Header comment:

```
PATCH { clinic, id, startsAt?, minutes?, chair?, dentistId?, status?, reason?, notes?, catalogCode? }
  → 200 { appointment, texted, retold }
  catalogCode: a fee-guide code, or null | '' for no fee-guide service; the Edit form sends it together with reason.
  reason: a non-empty reason is saved as sent; an empty one takes the service's name, and is refused without a service.
  A new start, chair or dentist is a move; a new length alone is an edit; edits are refused on visits in DONE; a visit
  booked online keeps the patient's note. retold: queued texts withdrawn to be written again.
```

These changes happen in order, inside the existing transaction (the `clinicRow` advisory lock, then the row `for update of a`):

1. **Parse** `const wantCatalog = has('catalogCode') ? text(b.catalogCode, 60) : undefined;` (`null` means clear it). `let retold = 0;`
2. **Widen the `cur` select** with `a.reason, a.notes, a.catalog_id, a.source, a.moved_at`.
3. **Replace the move test:**
   ```ts
   const startChanged = +startsAt !== +new Date(cur.starts_at);
   const endChanged = +endsAt !== +new Date(cur.ends_at);
   const dentistChanged = dentistId !== cur.dentist_id;
   const moved = startChanged || chair !== cur.chair || dentistChanged;
   const resized = endChanged && !moved;          // a length alone never stamps moved_at (018: that would place a request)
   const unplaced = cur.source === 'request' && cur.moved_at === null;
   const online = cur.source === 'web' || cur.source === 'request';
   ```
4. **Resolve the service and the reason:**
   ```ts
   let svc: { id: string; name: string } | null | undefined = undefined;
   if (wantCatalog === null) svc = null;
   else if (wantCatalog !== undefined) {
     const row = (await tx.query('select id, name, active from procedure_catalog where code = $1', [wantCatalog])).rows[0];
     // A retired service stays acceptable on the visit that already has it, so a reason-only edit there still saves.
     if (!row || (!row.active && row.id !== cur.catalog_id)) throw refuse(400, 'That service is not in the fee guide any more. Pick another.');
     svc = { id: row.id, name: row.name };
   }
   const catalogChanged = svc !== undefined && (svc?.id ?? null) !== cur.catalog_id;
   const sentReason = has('reason') ? wantReason : undefined;          // text(): null when sent empty
   const newReason = sentReason ?? (svc && (catalogChanged || sentReason === null) ? svc.name : null);
   if (sentReason === null && newReason === null) throw refuse(400, 'Say what the visit is for, or pick a service.');
   const reasonChanged = newReason !== null && newReason !== cur.reason;
   const notesChanged = wantNotes !== undefined && (wantNotes ?? null) !== (cur.notes ?? null);
   const edited = catalogChanged || reasonChanged || notesChanged || resized;
   ```
   A reason that was sent and is not empty is final. The service's name fills in only when the reason was sent empty, or when an older caller sends only `catalogCode`. An inferred service (`catalog_id` null, a reason naming it) gets linked the first time the form sends it, because its id differs from `cur.catalog_id`.
5. **Refuse before any write:**
   - `edited && DONE.has(cur.status)` → 400 `That visit is marked ${WORDS[cur.status]}. Its service, length and note stay as they were.`
   - `(catalogChanged || reasonChanged || resized) && unplaced && !moved` → 400 "Place the request first: give it a chair or a new time. Then change what it is for."
   - `notesChanged && online` → 400 "A visit booked online keeps the note the patient wrote with it. Put the desk’s words in the patient’s desk note."
6. **`if (moved) { … }`** keeps its checks, clash test, update (it writes `ends_at` and stamps `moved_at`) and `appointment.move` audit, with this one change to its texts:
   ```ts
   if (startChanged) await dropStaleTexts(tx, id);                     // every text names the start
   else if (dentistChanged) retold += (await retellTexts(tx, id, { confirmations: false })).reminders;  // reminders name the dentist
   if (startChanged && +startsAt > Date.now() && canText(cur.phone)) texted = /* the existing "moved" text */;
   ```
   A new chair or length alone drops no text.
7. **`if (resized)`:**
   - `findClash(tx, clinic.id, { id, startsAt, endsAt, chair, dentistId })` → 409 with its sentence.
   - `update appointment set ends_at = $2 where id = $1`
   - No text and no `dropStaleTexts`: texts name the start, never the end.
8. **`if (catalogChanged || reasonChanged || notesChanged)`:**
   ```sql
   update appointment set catalog_id = case when $5 then $4::uuid else catalog_id end,
          reason = coalesce($2, reason), notes = case when $6 then $3 else notes end where id = $1
   ```
   Parameters: `[id, reasonChanged ? newReason : null, wantNotes ?? null, svc?.id ?? null, catalogChanged, notesChanged]`.
9. **`if (edited && !moved)`:** audit `appointment.edit`, as today.
10. **`if (reasonChanged)`:**
    ```ts
    const t = await retellTexts(tx, id, { confirmations: true }); retold += t.reminders + t.confirmations;
    if (t.confirmations > 0 && +startsAt > Date.now() && canText(cur.phone))
      texted = (await queueText(tx, { clinicId: clinic.id, to: cur.phone!, kind: 'confirmation',
        body: scheduleTexts.confirmation(c.name, newReason, startsAt, cur.public_ref, c.phone),
        patientId: cur.patient_id, appointmentId: id, staffId: session.staffId })) !== null;
    ```
    Suppose a hand-written PATCH changes the start and the reason together. The "moved" text step 6 just queued is then replaced by one confirmation that names the new time and the new reason. That is still one text.
11. **Status change**, as today.
12. **The answer and the inference check:**
    ```ts
    const card = await withExtras(tx, await mustRead(tx, id));
    // "No fee-guide service" while the reason still names one: data.ts would read the service back from the words.
    if (svc === null && card.catalogId) throw refuse(400, `“${card.reason}” is the fee guide’s ${card.service}, so the visit reads as ${card.service}. Pick ${card.service} as the service, or word the reason another way.`);
    return { appointment: card, texted, retold };
    ```
    The throw rolls the whole transaction back.

What stays the same:
- Permission: `can(clinic, 'schedule.edit')`. There is no new key.
- CSRF: `csrfHeaderOk`.
- Rate limit: `LIMITS.schedule.staff`.
- Everything runs under `withClinic`, so RLS scopes it.
- One writer per clinic: `pg_advisory_xact_lock(hashtext(clinic_id))`, with the clash re-checked inside the transaction.

### `src/components/ws/cal/data.ts`

- Add `desk_note`, `form_nervous` and `consent_for` (section 2) to `EXTRA`.
- `extrasOf` adds:
  - `deskNote: deskNoteOf(r.desk_note ?? null)` (import it from `src/lib/import.ts`, which is server-only, like this file)
  - `formNervous: r.form_nervous === 'little' || r.form_nervous === 'very' ? r.form_nervous : null`
  - `consentFor: (r.consent_for as string | null) || null`
- Update the header comment.
- `BASE`, `APPT_SELECT`/`Appt`, the patients query and `PT_KEYS` do not change.

### `src/lib/invoices.ts`

```ts
/** The patient's latest statement (not void, not a draft) given a senior citizen or PWD discount, and whether it is
 *  their latest statement of all. New charge fills the kind and ID in only when it is (`latest`); otherwise it names
 *  it and fills in nothing. The desk still checks the card. */
export async function lastDiscountFor(tx: Tx, patientId: string):
  Promise<{ kind: 'senior' | 'pwd'; idNo: string; no: string; issuedOn: string; latest: boolean } | null>
```

It runs the SQL in section 2 and builds `no` with `statementNo(series_prefix, number)`. `issuedOn` is YYYY-MM-DD in Manila. Validation in `saveStatement` stays as it is: the ID is still required and is stored as posted.

### `src/pages/c/[clinic]/finances/new.astro` (server part)

- Widen the `chosen` select with `to_char(birth_date, 'YYYY-MM-DD') as birth`.
- After `chosen`, and only when `may && chosen && Astro.request.method === 'GET' && draft.discount === 'none'`:
  - `const past = await withClinic(clinic.id, (tx) => lastDiscountFor(tx, chosen.id))`
  - If `past?.latest`: `prefill = past; draft.discount = past.kind; draft.discountId = past.idNo`. This happens before `disc` and `total` are computed, so the first paint's totals include it.
  - Else if `past`: `olderDiscount = past`. Nothing is pre-selected.
  - `seniorByAge = !prefill && !!chosen.birth && (ageOn(chosen.birth, manilaToday()) ?? 0) >= 60` (both helpers from `src/lib/health.ts`).
- Dates are written with `dateText(issuedOn)` from `src/lib/health.ts` ("12 Aug 2026"). `Intl` with `en-PH` would give "Aug 12, 2026".

### `src/pages/c/[clinic]/patients/[patient].astro` (server part)

- `OPEN_PANEL` gains `details: 'overview'`. `openNow` is already gated on `canEdit`. Update the comment above `OPEN_PANEL` ("?open=vitals|note|rx|done|file|details").
- `const dashVisit = UUID.test(q.get('dash') ?? '') ? q.get('dash')!.toLowerCase() : null;`
- `<SidePanel id="details" … open={detailsProblems.length > 0 || openNow === 'details'}>`
- The details form gets `{(detailsDash ?? dashVisit) && <input type="hidden" name="dash" value={detailsDash ?? dashVisit} />}`.
- In the `intent === 'details'` branch, read `detailsDash` from the posted `dash` (a UUID or nothing). On `'saved'` with a `detailsDash`:
  - Inside `withClinic`, run `select to_char(starts_at at time zone 'Asia/Manila', 'YYYY-MM-DD') as ymd from appointment where id = $1 and patient_id = $2`.
  - Found: redirect 303 to `/c/${clinic.slug}/?${ymd === today ? '' : `date=${ymd}&`}booking=${detailsDash}`.
  - Not found: redirect as today.

---

## 4. Client changes

### `src/components/ws/icons.ts`

Add two names to `IconName` and `PATHS`:

```ts
note:   '<path d="M6 3.5h12A1.5 1.5 0 0 1 19.5 5v9.5l-6 6H6A1.5 1.5 0 0 1 4.5 19V5A1.5 1.5 0 0 1 6 3.5z"/><path d="M19.5 14.5H15a1.5 1.5 0 0 0-1.5 1.5v4.5M8 8.5h8M8 12h5"/>',
pencil: '<path d="M4.5 19.5l1-4L15.8 5.2a2 2 0 0 1 2.8 0l.2.2a2 2 0 0 1 0 2.8L8.5 18.5z"/><path d="M13.5 7.5l3 3"/>',
```

### `src/components/ws/cal/model.ts`

- `Extras` gains:
  - `deskNote: string | null`: the patient's own notes (Edit details), less the import's own lines.
  - `formNervous: 'little' | 'very' | null`: the latest added patient form's answer.
  - `consentFor: string | null`: what every consent signed for this visit covered, joined with "; ".
- Add `export const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);`. The panel, the card and the list use it.

### `src/components/ws/cal/VisitPanel.astro`

- Props become `{ chairs: number; catalog: Service[] }`. Import `priceShort` and `type Service` from `./model`.
- Pass `catalog={data.catalog}` where `src/pages/c/[clinic]/index.astro` draws `<VisitPanel>`.
- Update the header comment (Edit beside Move).
- After the Move form, add:

```astro
<form class="vp-move" data-vp-edit novalidate hidden>
  <h3 class="vp-move-title" id="vp-edit-h" tabindex="-1"><span class="vp-h-icon" aria-hidden="true"><Icon name="pencil" size={16} /></span>Change this visit</h3>
  <p class="text-[14px] text-ink-2" data-vp-edit-note>The time and the booking ref stay the same. No extra text goes out: a text still waiting to go out is rewritten with the new reason.</p>
  <div class="vp-fields">
    <label class="field vp-wide"><span class="meta">Service</span>
      <select data-vp-edit-service><option value="">No fee-guide service</option>
        {catalog.map((c) => <option value={c.code} data-minutes={c.minutes} data-name={c.name}>{c.name} · {c.minutes} min{c.price ? ` · ${priceShort(c.price)}` : ''}</option>)}
      </select><span class="text-[13.5px] text-ink-2" data-vp-edit-price></span></label>
    <label class="field vp-wide"><span class="meta">Minutes</span><input type="number" min="5" max="480" step="5" inputmode="numeric" data-vp-edit-minutes required /><span class="text-[13.5px] text-ink-2" data-vp-edit-ends></span></label>
    <label class="field vp-wide"><span class="meta">Reason</span><input maxlength="120" placeholder="What the visit is for" data-vp-edit-reason /></label>
    <label class="field vp-wide" data-vp-edit-notes-box><span class="meta">Note for this visit</span><textarea rows="2" maxlength="500" data-vp-edit-notes></textarea></label>
    <div class="vp-wide" data-vp-edit-booknote hidden><span class="meta">From the booking</span><p class="vp-desknote text-[15px] text-ink" data-vp-edit-booknote-text></p></div>
  </div>
  <p class="ws-callout" data-tone="warn" data-vp-edit-consent hidden><Icon name="alert" /><span><span data-vp-edit-consent-text></span> <a class="vp-link" data-vp-edit-consent-sign hidden>Sign on this tablet</a></span></p>
  <div class="flex flex-wrap gap-2">
    <button type="submit" class="ws-btn ws-btn-primary" data-vp-edit-save><Icon name="check" />Save changes</button>
    <button type="button" class="ws-btn ws-btn-quiet" data-vp-edit-close>Not now</button>
  </div>
</form>
```

No `data-vp-edit*` name is used anywhere today (grep-checked, and the same goes for `cal-desknote`, `pt-desknote`, `vp-desknote`, `fin-from`, `data-bill-discount-from|past|help`, `data-bill-senior-hint` and `data-rec-details-notes`). Attribute selectors match whole names, so `[data-vp-edit]` does not match `data-vp-edit-service`.

### `src/components/ws/cal/panels.ts`

- **`V` gains:** `edit`, `editHead` (`#vp-edit-h`), `eService`, `ePrice`, `eMinutes`, `eEnds`, `eReason`, `eNotesBox`, `eNotes`, `eBookNote`, `eBookNoteText`, `eConsent`, `eConsentText`, `eConsentSign` and `eClose`.
- **`fillVisit`:**
  - It sets `V.edit.hidden = true`, as it does for the Move form.
  - It adds Edit (quiet, `pencil`) after Move, under the condition in 1a.
  - It renames the row `['Notes', c.notes]` to `['Visit note', c.notes]`.
  - In `dl(V.patient, …)`, after Mobile, it adds `['Desk note', deskNoteNode(c)]`:
    - The node is a `span.vp-desknote` with the note ("None yet" when there is none).
    - When `boot.canEdit`, a space and `link(c.deskNote ? 'Edit' : 'Add a note', `${recordHref(c.patientId)}?open=details&dash=${encodeURIComponent(c.id)}`)` follow, with class `vp-link`.
    - It returns null when there is no note and `!boot.canEdit`.
  - After `alertChips(V.alerts, …)`: if `c.formNervous`, append `pill(c.formNervous === 'very' ? 'Very nervous about visits (from their form)' : 'A little nervous about visits (from their form)', 'blue')` with `title = 'From the patient forms'`.
- **`fillCheck`:** the signed line becomes `line('ok', `Consent: signed for ${M.clip(c.consentFor ?? 'this visit', 120)}`)`, and the whole `consentFor` goes in the `li`'s `title`.
- **`toEdit(c)`:**
  - It hides the Move form.
  - It removes options marked `[data-vp-edit-extra]`. If `c.catalogCode` is not among the choices, it adds it as an extra option: "<service> · no longer in the fee guide".
  - It sets the fields from the card. For a visit booked online (`c.source === 'web' || c.source === 'request'`), it hides `eNotesBox`, and shows `eBookNote` with `c.notes` only when there is a note.
  - It snapshots `editStart = { code: c.catalogCode ?? '', minutes, reason: (c.reason ?? '').replace(/\s+/g, ' ').trim(), notes }`.
  - It sets `autoReason = !c.reason || c.reason.trim().toLowerCase() === (c.service ?? '').trim().toLowerCase()`.
  - It redraws the hints and the consent line, shows the form, scrolls its head into view and focuses `eService`.
- **`toMove()`** hides the Edit form.
- **Listeners:**
  - `eService change`:
    - A service sets Minutes from `data-minutes`. If `autoReason`, the Reason is set from `data-name`.
    - "No fee-guide service" empties the Reason if `autoReason`.
    - It redraws the price hint, the end hint and the consent line.
  - `eReason input`: `autoReason = false`, then the consent line is redrawn.
  - `eMinutes input`: it redraws `eEnds`, using `M.hm(M.manila(c.startsAt).min + minutes)` and the closing time from `M.hoursOf(boot.hours, M.dowOf(ymd))`.
  - The consent line shows only when `c.consentSigned && (eService.value !== editStart.code || normalised eReason !== editStart.reason)`. Its text is "A consent was signed for this visit for <M.clip(c.consentFor, 120)>. If the treatment is different, have them sign again." `eConsentSign.href = signHref(c.patientId, c.id)` and it shows only when `boot.canEdit`.
  - `eClose`: hides the form and focuses the Edit button.
- **Edit `submit`:**
  - It runs the browser checks (1a).
  - It builds the body:
    - If the service or the reason changed: `catalogCode: eService.value || null` and `reason: eReason.value`, both always together.
    - `minutes`, if changed.
    - `notes: eNotes.value.trim() || null`, if changed and the visit was not booked online.
  - An empty body → "Nothing changed." and the form closes.
  - Otherwise `patch({ id, ...body })`. On success: `fillVisit(r.card)`, then the "Saved: …" sentence (1a) with the `r.retold` clause.
- **Move `submit`:** when the start, chair and dentist are all unchanged, the sentence becomes `Now ${M.whenOf(c.startsAt)} – ${M.timeOf(c.endsAt)}.`

### `src/components/ws/cal/board.ts`

- The `Reply` ok variant gains `retold: number`. `call()` maps `retold: Number(data?.retold) || 0`.
- **`cardEl`**, after the alert mark:
  ```ts
  if (c.deskNote) { const n = el('span', 'cal-desknote'); n.title = `Desk note: ${M.clip(c.deskNote, 200)}`; n.append(icon('note', 13)); who.append(n); }
  ```
  Also add `c.deskNote && `desk note: ${M.clip(c.deskNote, 120)}`` to `label`.
- `LIVE_KEYS` adds `'catalogId', 'deskNote', 'formNervous', 'consentFor'`.
- In `refresh()`, `moveOpen` becomes `formOpen = !!document.querySelector('dialog[open] :is([data-vp-move], [data-vp-edit]):not([hidden])')`, so the panel is never refilled under an open Edit form.

### `src/components/ws/cal/patients.ts`

In `row()`, after `when`:

```ts
if (c.deskNote) {
  const n = el('span', 'pt-desknote');
  n.title = c.deskNote;
  n.append(icon('note', 14), el('span', 'pt-desknote-text', c.deskNote));
  main.append(n);
}
```

Add `c.deskNote ? `note: ${M.clip(c.deskNote, 120)}` : ''` to `label`. The name `pt-note` is already taken on /find/, hence `pt-desknote`.

### `src/components/ws/cal/cal.css`

```css
.cal-desknote { display: inline-flex; flex: none; color: var(--sub); }
.pt-desknote { display: flex; align-items: center; gap: 0.3rem; min-width: 0; font-size: 13.5px; line-height: 1.4; color: var(--c-ink-2); }
.pt-desknote > svg { flex: none; }
.pt-desknote-text { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.vp-desknote { white-space: pre-line; }
```

### `src/pages/c/[clinic]/patients/[patient].astro` (client part)

- The Notes textarea gets `data-rec-details-notes` and the help line in 1d, using the page's `help` class.
- In the page's `<script>`, if `new URLSearchParams(location.search).get('open') === 'details'`, then after two `requestAnimationFrame`s (the shell focuses the title first), and if `#details` is open:
  - focus `[data-rec-details-notes]` with the caret at its end;
  - then `history.replaceState(null, '', …)` without `open` and `dash`, keeping the hash.

### `src/pages/c/[clinic]/patients/new.astro`

- Under "Other notes", add `<span class={help}>The desk sees this beside the patient's visits on the Dashboard. Keep health details in Health.</span>`.

### `src/pages/c/[clinic]/finances/new.astro` (client part)

**Markup:**
- Inside `[data-bill-discount-id]`:
  - The existing help gets `data-bill-discount-help` and `hidden={!!prefill}`.
  - Add `{prefill && <span class="fin-help fin-from" data-bill-discount-from>Filled in from statement {prefill.no} ({dateText(prefill.issuedOn)}). Check the card: change it if the number is not the same.</span>}`.
- After the fieldset:
  - `{olderDiscount && <p class="fin-help fin-from" data-bill-discount-past>{olderDiscount.kind === 'senior' ? 'Senior citizen' : 'PWD'} discount on {olderDiscount.no} ({dateText(olderDiscount.issuedOn)}); none on the statements since. Ask for the ID.</p>}`
  - `{seniorByAge && <p class="fin-help fin-from" data-bill-senior-hint>60 or over by the birth date on file: ask for the senior citizen (OSCA) ID.</p>}`
- In `_fin.css`: `.fin-from { color: var(--c-ink-2); }`. Muted grey is never used for an instruction.

**Script, in the discount section:**
- `let prefilled = !!$('[data-bill-discount-from]')`.
- Any `change` on `[data-bill-discount]`, or `input` on the ID field, sets `prefilled = false`.
- A second `click` listener on `[data-bill-change]`:
  - If `prefilled`: check the `none` radio, empty the ID, set `idBox.hidden = true` and `idInput.required = false`, hide `[data-bill-discount-from]`, show `[data-bill-discount-help]`, set `prefilled = false`, then `recount()`.
  - Always hide `[data-bill-discount-past]` and `[data-bill-senior-hint]`.

### `CLAUDE.md`

Under "The schedule", add one bullet saying:
- Edit in place (service, length, reason, visit note) is refused once Done.
- A length alone is not a move. Waiting texts are dropped only for a new start, and a new dentist rewrites waiting reminders.
- The Edit form sends `catalogCode` and `reason` together, and a sent reason is final.
- A visit booked online keeps the patient's note.
- A reason change withdraws, through `retellTexts`, only the reminders the next pass writes again (keep its conditions in step with `sms_enqueue_reminders`) and replaces a waiting confirmation one for one; nothing extra is sent.
- The desk note (`deskNoteOf`: less the import's own lines), the forms' "nervous" answer and what the visit's consent covered ride on the card's extras.
- New charge fills a discount only from the patient's latest statement.

---

## 5. What must not change

- **POST `/api/schedule`**, the walk-in path, `NEXT_STATUS`, `applyStatus`, `dropStaleTexts` and the `findClash` wording stay as they are.
- **A move to a new start** (by drag or the Move form) still:
  - stamps `moved_at`
  - audits `appointment.move`
  - drops stale texts
  - texts the new start

  A move of chair, length or dentist alone still stamps `moved_at` and audits `appointment.move`. It no longer drops waiting texts: none of them names the chair or the end, and a reminder naming the dentist is rewritten instead.
- **Place it** still places a request (a chair or time change).
- **Reminders**: `sms_reminder_body`, `sms_remind48_body`, `sms_enqueue_reminders` and the worker are untouched. There is no new text kind, no link and no request for a reply.
- **A visit's public ref** never changes on edit.
- **Carried data** is not widened beyond the three extras: `Appt`/`APPT_SELECT`, `PT_KEYS` and the packed patient list, the patient side panel (`openPatient`), the printed day sheet and `/api/patients` stay as they are.
- **Colours**: no pill or colour on calendar cards or in Today's patients beyond what exists. The QUEUE colours stay the only status colours.
- **The record's Edit details** keeps `updateDetails`, `readPersonForm` and the `patient.update` audit. `/api/patients` stays GET-only.
- **No new column and no flag**: nothing new about disability or anxiety is stored on `patient`. The privacy notice, the patient forms and `FORMS_PRIVACY_VERSIONS` are untouched.
- **`invoices.ts` validation**: a discount still needs an ID, the statement stores what the desk saves, and `BILLING_FINAL` is unaffected.
- **The consent**: `visit_consent`, `signVisit` and the signing page are unchanged. The Dashboard only reads what was signed.
- **Workspace design**: the Move form's look, the panel's single teal next step, the soft template and every other page's computed styles are unchanged. The Edit form reuses `.vp-move`.

---

## 6. Verification plan

**Setup**
- Run `npm run db:setup` with `SHOW_DEMO_LOGINS=1`, then `npm run build`.
- Run `npx astro preview --port 4412`. Use a new port; never `pkill`.
- Sign in as the seeded owner of `session-road` (the sign-in page lists it).
- Do not run the SMS worker, so queued texts stay queued.
- SQL runs through `psql` on the dev database as the setup owner role. That role bypasses RLS, so **every query names the clinic**: `:clinic` is `(select id from clinic where slug = 'session-road')`.
- Script: `$SCRATCHPAD/p25-check.mjs` (Playwright, Chromium).

### Playwright

1. **Edit the service.**
   - Book a visit through the UI for tomorrow at 10:00 on an empty chair: a patient with a mobile, service Cleaning (45 min).
   - Open it → **Edit** is visible, quiet (not `.ws-btn-primary`) and at least 44px tall.
   - Choose "Root canal" → Minutes becomes 90 and Reason reads "Root canal".
   - Save → the green line starts "Saved: Root canal", the card shows "Root canal", and the panel's Booked row keeps the same "Booking ref".
2. **The typed reason wins, and is saved.**
   - Edit, type Reason "Root canal 26" and save → the card shows "Root canal · tooth 26".
   - Edit and choose "Filling" → Reason stays "Root canal 26" and Minutes becomes 45. Save.
   - SQL: `reason = 'Root canal 26'`, and `catalog_id` is Filling's.
   - The card shows "Filling · tooth 26", and the panel's Service row reads "Reason: Root canal 26" under it.
3. **Length alone.**
   - Minutes 45 → 60, save → "Saved: … 60 minutes." There is no "Moved" row in the panel.
   - Set Minutes so the visit runs into the next visit on the same chair → a red callout "Chair N has <name> until …", and the card is unchanged.
4. **An inferred service.** Use a seeded visit with `reason = 'Restoration 26'` and `catalog_id is null` (check in SQL first).
   - Edit shows Service "Filling" already chosen.
   - Change only the Reason to "Restoration 26 MO" and save → SQL `catalog_id` is Filling's, and the card still shows Filling with its price.
   - On another such seeded visit, choose "No fee-guide service" and leave the reason → Save → 400 "“Restoration 26” is the fee guide’s Filling, so the visit reads as Filling. Pick Filling as the service, or word the reason another way." SQL shows the row unchanged.
   - Change the reason to "Check-up of 26" → it saves, and the card shows "Check-up of 26" with no price.
5. **Done.**
   - Mark a visit Done → no Edit button.
   - A forged `fetch('/api/schedule', {method:'PATCH', …, catalogCode, reason})` with the page's CSRF header → 400 "That visit is marked done. Its service, length and note stay as they were."
6. **Requests.**
   - An unplaced web request → no Edit.
   - A forged PATCH `{id, minutes: 45}` → 400 "Place the request first…".
   - The Move form's "Place it" with a chair → placed, as today.
7. **A note booked online.**
   - Book through `/find/session-road/book/` with the note "Pain lower left, allergic to amoxicillin".
   - On the Dashboard, place it or open it and press Edit → "From the booking: Pain lower left, allergic to amoxicillin" is shown, and there is no Note textarea.
   - A forged PATCH `{id, notes: 'x'}` → 400 "A visit booked online keeps the note…". SQL shows `notes` unchanged.
8. **Consent carry-over.**
   - On a visit today, sign the consent on `/c/session-road/patients/<id>/sign/<visit>/`, ticking or writing "Cleaning".
   - The panel's "Before we start" reads "Consent: signed for Cleaning".
   - Edit and choose "Extraction" → the amber line "A consent was signed for this visit for Cleaning. If the treatment is different, have them sign again." appears with **Sign on this tablet** (its href is the signing page).
   - Choose Cleaning again → the line hides.
9. **Role without schedule.edit.** Make a role with no `schedule.edit` under Clinic settings → Roles, and sign in as a member with it → no Edit, and a forged PATCH → 403 "Your role cannot change the schedule here. Ask the owner."
10. **CSRF.** A PATCH without `X-CSRF` → 403 with `CSRF_MESSAGE`.
11. **Desk note.**
    - On a patient with a visit today, go to the record → Edit details → Notes "Father must accompany" → Save.
    - Dashboard → that visit's card has `.cal-desknote`, its `title` starts "Desk note: Father", and the card's `aria-label` contains "desk note: Father must accompany". Today's patients has `.pt-desknote` with that text.
    - The visit panel has a "Desk note" row and an "Edit" link.
    - Click the link → the record at `?open=details&dash=<id>`; `#details` is open, `document.activeElement` is `[data-rec-details-notes]`, and `location.search` no longer has `open` or `dash`.
    - Change the note and save → the page is the Dashboard with that visit's panel open, showing the new note.
    - `history.back()` → the record, with `#details` **not** open.
12. **Import lines are not desk notes.**
    - Import (Patients → Import) a CSV with two rows:
      - A: mobile "045 123 4567", birth date "1958", no notes.
      - B: the same, plus notes "Prefers mornings".
    - Book both for today on the Dashboard.
    - A's card has no `.cal-desknote`, and its panel says "None yet · Add a note".
    - B's card note `title` is exactly "Desk note: Prefers mornings".
13. **Live refresh.**
    - With the Dashboard open in tab A, change the note in tab B → within 35 s tab A's card gains or loses the icon (`LIVE_KEYS`).
    - With tab A's Edit form open and a typed Reason, a refresh does not refill the panel: the typed values survive.
14. **Nervous.**
    - Add a patient form (forms are open on a dev machine) that answered "Very nervous" to the patient → the visit panel shows the pill "Very nervous about visits (from their form)".
    - A later form answering "Not really" → no pill.
    - The card and Today's patients show no pill for it.
15. **New charge fill-in.**
    - Charge a statement for patient P with Senior and ID "OSCA-1234".
    - Open Charge from P's visit panel → the Senior radio is checked, the ID is "OSCA-1234", the from-line names that statement and its date in "12 Aug 2026" form, and the discount row shows −20%.
    - Press Change → the discount is None, the ID is empty, the from-line is hidden and the total recounts.
    - Reload, untick to None, clear the lines, add one free line with no words, and post with `HTMLFormElement.prototype.submit.call(form)`, which skips the page's own checks → the server refuses ("Line 1: say what it is for."). The form comes back as None with no from-line.
    - Charge P a second statement with None → open Charge again → nothing is pre-selected, and `[data-bill-discount-past]` reads "Senior citizen discount on SE-… (…); none on the statements since. Ask for the ID."
    - Patient Q, born 64 years ago with no discounted statement → no radio is pre-set, and `[data-bill-senior-hint]` is shown.
    - Void P's statements → no fill-in and no line.
16. **Keyboard.**
    - In the visit panel, Tab goes teal step → Move → Edit → Open record → More.
    - Edit moves focus into the form, "Not now" returns focus to Edit, and Escape closes the panel with focus back on the card.

### SQL checks, after the matching steps

```sql
-- 1: service changed in place
select catalog_id = (select id from procedure_catalog where code = 'rootcanal' and clinic_id = :clinic), reason,
       public_ref = '<ref before>', moved_at from appointment where id = '<v>';        -- t, 'Root canal', t, null
select action from audit_log where entity_id = '<v>' order by at;                      -- … appointment.create, appointment.edit (no appointment.move)
-- 2: the typed reason kept
select reason, catalog_id = (select id from procedure_catalog where code = 'restoration' and clinic_id = :clinic)
  from appointment where id = '<v>';                                                     -- 'Root canal 26', t
-- 3: length only
select moved_at is null, ends_at - starts_at from appointment where id = '<v>';         -- t, 01:00:00
```

**Reminders are withdrawn and written again, never duplicated:**

```sql
select sms_enqueue_reminders();                                                         -- queues reminder:<v> (tomorrow)
-- edit the reason in the UI, then:
select status, dedupe_key, body from message_log where appointment_id = '<v>' and kind = 'reminder';  -- one row: cancelled, key null, old reason
select sms_enqueue_reminders();
select count(*) filter (where status = 'queued'), max(body) filter (where status = 'queued')
  from message_log where appointment_id = '<v>' and kind = 'reminder';                  -- 1, names the new reason
```

**The 48-hour reminder is treated the same way** (the clinic has `remind_48h` on):

```sql
-- book <v48> for the day after tomorrow, still booked; select sms_enqueue_reminders(); edit its reason, then:
select status, dedupe_key from message_log where appointment_id = '<v48>' and kind = 'reminder' order by created_at;  -- cancelled, null
select sms_enqueue_reminders();                                                         -- a queued remind48:<v48> naming the new reason
```

**A reminder already sent is never sent again:**

```sql
update message_log set status = 'sent' where appointment_id = '<v>' and kind = 'reminder' and status = 'queued';
-- edit the reason in the UI again, then:
select sms_enqueue_reminders();                                                         -- 0 new rows for <v>
```

**A reminder the next pass would not write again is left alone:**

```sql
-- a visit <v3> booked for TODAY with a mobile; its reminder was queued last night and is held for 8 am:
insert into message_log (clinic_id, patient_id, appointment_id, channel, to_address, body, status, kind, dedupe_key)
select a.clinic_id, a.patient_id, a.id, 'sms', p.phone, 'old words', 'queued', 'reminder', 'reminder:' || a.id
  from appointment a join patient p on p.id = a.patient_id where a.id = '<v3>';
-- edit <v3>'s reason in the UI, then:
select status, dedupe_key is not null, body from message_log where appointment_id = '<v3>' and kind = 'reminder';  -- queued, t, 'old words'
```

**A waiting confirmation is replaced one for one:**

```sql
-- book a new visit <v2> for tomorrow (the worker is off, so its confirmation stays queued), edit its service, then:
select status, body from message_log where appointment_id = '<v2>' and kind = 'confirmation' order by created_at;
-- two rows: cancelled (old reason), queued (new reason); the API answered texted: true, retold: 1
```

**Only a new start drops texts:**

```sql
-- step 3's length-only edit:
select count(*) from message_log where appointment_id = '<v>' and status = 'cancelled' and kind = 'reminder';  -- unchanged by step 3
-- on <v2> (confirmation queued, a reminder marked sent): Move form → another chair and 60 minutes, same start, then:
select status from message_log where appointment_id = '<v2>' and kind = 'confirmation' and status = 'queued';   -- still one queued
select dedupe_key is not null from message_log where appointment_id = '<v2>' and kind = 'reminder' and status = 'sent';  -- t
-- on <v> with a queued reminder (tomorrow): Move form → another dentist only, then:
select status, dedupe_key from message_log where appointment_id = '<v>' and kind = 'reminder' and body like '%<old dentist>%';  -- cancelled, null
select sms_enqueue_reminders();                                                         -- a queued reminder naming the new dentist
```

The 23:45 guard in `retellTexts` is checked by reading the code. It cannot be exercised without moving the clock.

### Measure: contrast, targets and width

A script (`$SCRATCHPAD/p25-measure.mjs`) runs four ways: `localStorage.theme` set to `light` and `dark`, each at 1440×900 and 390×844.

**Contrast.** Composite each background up to the page and compute the ratio. All of these must be at least **4.5:1**:
- `.cal-desknote` over every `.cal-card[data-status]` background
- the `.pt-desknote` text
- the `.vp-desknote` text and its `.vp-link`
- the renamed "Visit note" row, and the "Consent: signed for …" line
- every text node in `[data-vp-edit]` over its teal tint: the title, `[data-vp-edit-note]`, the labels, `[data-vp-edit-price]`, `[data-vp-edit-ends]`, `[data-vp-edit-booknote]`, and `[data-vp-edit-consent]` with its link on the amber tint
- the blue nervous pill
- `[data-bill-discount-from]`, `[data-bill-discount-past]` and `[data-bill-senior-hint]`
- the Notes help on Edit details and on Add patient

**Targets.** `getBoundingClientRect().height ≥ 44` for:
- the Edit button
- Save changes and Not now
- the desk note link and Sign on this tablet
- every Edit form control

Form controls must also have a computed `font-size ≥ 16px`.

**Width.** At 390, `document.documentElement.scrollWidth === innerWidth`:
- on the Dashboard, with the visit panel and the Edit form open (with a booking note, and with the consent line shown)
- on New charge, with the from-line shown
- on New charge, with the older-discount line shown

**Design regression.** Compare the computed styles of `.vp-move`, `.cal-card` and `.pt-row` before and after. They must be identical except for the added children.

---

## 7. Effort and risks

**Effort: M, about 2½ days.**

| Piece | Time |
|---|---|
| PATCH, `retellTexts`, `deskNoteOf` and `lastDiscountFor` | ¾ d |
| Visit panel Edit form, consent line, desk note row and pill | ¾ d |
| Card icon, list line and `LIVE_KEYS` | ¼ d |
| New charge fill-in, record `?open=details&dash=` and the help lines | ¼ d |
| Playwright, SQL and measurement | ½ d |

**Risks**

- **A length change in the Move form is no longer a move.** It no longer stamps `moved_at` or shows "Moved". On a booked visit that only changes a cosmetic line. On an unplaced request, the server now refuses a length-only change. Before, it quietly "placed" the request with no chair, which let the patient confirm a time the desk never gave (018). Step 6 checks this.
- **A move of chair or length no longer drops waiting texts.** They name the start (and reminders the dentist), never the chair or the end, so nothing stale is left behind. Before, such a move cancelled a waiting confirmation with no replacement, and it cleared the keys of reminders already sent, which sent a second one.
- **A rewritten reminder depends on the worker's reminder pass**, which runs every 10 minutes. If the worker is down, no reminder goes out until it returns, the same as today for every reminder.
  - `retellTexts` withdraws only the reminders the pass will write again. Its conditions copy `sms_enqueue_reminders` (036), so a change to one is a change to both; CLAUDE.md says so.
  - A reminder held overnight for the visit day keeps its old words.
- **A text the worker has already claimed can still go out in the old words.** A row the worker has just claimed (`sending`) is not withdrawn. So is a reminder the pass writes in the instant the edit commits, because the pass read the old reason when its statement began. The window is the same size as `dropStaleTexts`'s today.
- **A reason that names a service reads as that service.** This is data.ts's rule for older visits. So "No fee-guide service" with such a reason is refused with a sentence that says what to do, rather than saved and then read back as the service.
- **Two desks editing the same visit.** Only the fields each desk changed are sent (the service and reason together), and the row lock orders the writes. On the same field, the last save wins. The live refresh shows the other desk's change within 30 s.
- **The Dashboard's page carries every note and consent summary.** `deskNote` (at most 1000 characters) and `consentFor` (at most 600 per consent) ride on every card in the boot JSON, but only for visits on screen. The patient list is not widened. Anyone on the Dashboard already sees each visit's reason, allergies and conditions.
- **Notes on online bookings cannot be changed by the desk.** The desk puts its own words in the patient's desk note. This keeps the patient's words, which may name an allergy, as they wrote them, because there is no column to keep a copy.
- **The prefilled ID number** is shown only to people with `finance.bill`, who can already read it on the statement. The from-line and the law still expect the card to be checked. An expired PWD card must be changed by the desk, and the line says to check. A discount is never pre-selected when the patient's latest statement had none.
- **Sensitive words in desk notes now appear on the Dashboard.** The new help lines under Notes (the record, Add patient and the import template) say so and point health details to Health. The note was already readable by anyone who can open the record.

---

## Review notes

Each objection was checked against `main` @ 18a4017.

1. **The typed reason is replaced by the service name, and an inferred service is lost on a reason-only edit.** *Holds, both halves.* `data.ts` EXTRA takes `catalog_id`/`catalog_code` from the lateral `pr` match when `a.catalog_id is null`, and the old PATCH only fills the reason when none is sent.
   - Fixed: the form sends `catalogCode` and `reason` together whenever either changes, and a sent non-empty reason is final (§1a, §3 step 4).
   - Fixed: an inferred service is linked the first time it is sent.
   - Also fixed:
     - "No fee-guide service" when the reason still names a service is refused with a sentence (§3 step 12), since there is no column to store "none" against the inference.
     - A retired stored service is accepted on its own visit, so a reason-only edit there does not fail on the new "sent together" rule.
   - Tests: steps 2 and 4, and the SQL for 2.
2. **The tablet consent stays "signed" after the treatment changes.** *Holds.* `visit_consent.treatment` exists (035) and `fillCheck` only reads `consentSigned`.
   - Fixed: `consent_for` in EXTRA (using the existing `visit_consent_visit` index), "Consent: signed for <treatment>" in the checklist, and the Edit form's amber line with Sign on this tablet (§1a, §4).
   - `consentFor` was added to `LIVE_KEYS`. Test: step 8.
3. **`patient.notes` holds the import's own lines.** *Holds* (`import.ts`: `extraNote` and the birth-year line, joined with " · ").
   - Fixed with `deskNoteOf()` in `import.ts`, applied in `extrasOf`: one TypeScript definition built from the same exported phrase builders, instead of a second copy as a SQL `regexp_replace`.
   - The help line was added under Add patient's "Other notes" and to the import template's hint. Test: step 12.
4. **Reminder timing is wrong, and withdrawn held reminders are never written again.** *Holds.* `ENQUEUE_EVERY_MS = 10 * 60_000`, and `sms_enqueue_reminders` writes only for today+1 (booked or confirmed) and today+2 (booked, `remind_48h`).
   - Fixed: `retellTexts` withdraws only the reminders the pass will write again, adding the phone and placed-request conditions of the function itself.
   - Fixed: a 23:45 Manila guard. The objection missed this: a pass after midnight reads a new "tomorrow".
   - Fixed: the timings now say 10 minutes, and the note reads "No extra text goes out: a text still waiting to go out is rewritten with the new reason."
   - Rewriting bodies in place was considered and dropped: `sms_reminder_body`/`sms_remind48_body` are revoked from the app, so it would need a migration.
   - Tests: the SQL for the 48 h, held-over and sent reminders.
5. **The move branch drops texts on an end-only change, and a dentist-only move leaves the old dentist in the reminder.** *Holds* (both reminder bodies include `' with ' || s.full_name`).
   - Fixed: `dropStaleTexts` only when the start changed, and `retellTexts(…, { confirmations: false })` for a new dentist (§3 step 6).
   - Tests: the "Only a new start drops texts" SQL.
6. **The desk note link sends the desk in circles.** *Holds* (the details save redirects to `?saved=details#overview`, and a no-store Back re-opens `?open=details`).
   - Fixed with `&dash=<visit id>`, a redirect to `/c/<slug>/?date=…&booking=<id>`, and `replaceState` dropping `open` and `dash`.
   - The parameter is `dash`, not the proposed `visit`, because on the record `?visit=` already opens that visit's panel or the This visit strip, which would stack a second panel.
   - Test: step 11.
7. **Stale discounts, and the search path.**
   - *The first half holds* (the old SQL filtered on the discount before `order by … limit 1`). Fixed: the fill-in happens only when the latest statement had the discount, and an older one is named in a line with nothing pre-selected. Test: step 15.
   - *The second half is rejected*, with one-line reason: telling the desk "only from the Dashboard's Charge" describes plumbing, and carrying ID numbers through `/api/patients` would hand them to every schedule user. The from-line names its source whenever a fill-in happens, so nothing misleads. §1e now states the search path's behaviour.
8. **The patient's booking note can be overwritten.** *Holds* (`api/bookings` stores `b.notes` raw, PATCH's `text()` collapses whitespace, and the audit keeps no copy).
   - Fixed: visits booked online show the note read-only and offer no note field, and the server refuses `notes` on them (§1a, §3 step 5).
   - Appending "· Desk: …" was rejected: repeated edits would stack prefixes, and without a column the two cannot be told apart later.
   - Test: step 7.
9. **Verification gaps.** *Holds.*
   - (a) Cleaning and Filling are both 45 minutes (`directory.ts`, 006). The tests now use Root canal (90) and 45 → 60.
   - (b) The page's own submit check stops a save with no lines. The refusal is now forced with `HTMLFormElement.prototype.submit.call(form)` and a line the server refuses.
   - (c) `procedure_catalog` is unique on `(clinic_id, code)` and the setup role bypasses RLS. Every SQL check now names the clinic.
   - (d) Tests were added for items 1–8.

**Also corrected while verifying:**
- The from-line's date: `Intl.DateTimeFormat('en-PH', …)` gives "Aug 12, 2026". The spec now uses `dateText()` from `health.ts` for "12 Aug 2026".
- The Move sentence example: it now matches `M.whenOf`/`M.timeOf` ("9:00 am – 9:45 am").
- `clip` is defined once in `model.ts` instead of three local copies.