# A simpler Flossify: the plan

*6 October 2026. This was a plan only when written. Status on 9 Oct: phase 1a, the seven safety fixes, is live (#53); the rest is not started.*

## 1. Summary

Here, "simpler" means one way to do each thing, said once, in plain words, with the main button where you can see it. Nothing clinics rely on, legally or clinically, is removed.

- **Patients** book the time they tapped on one screen: about 6 taps instead of 9. They choose a day and then see that day's times, instead of a grid of 65. The reason they gave reaches the dentist.
- **The front desk** opens one panel per visit. On a phone, today's visits are drawn once; on a desk, in short rows. One inbox shows what is waiting, and checkout has one payment form.
- **Dentists** see more of the chart before scrolling, and the safety reminders stay in view. Each action can be reached from at most two places. Consent gets one answer everywhere.
- **The owner** gets one setup checklist, a Clinic profile split into what patients see and how the day runs, one page about themself, one word for "owed", and a Close the day screen in the order the desk works.

We start with a few safety fixes (phase 1a). One needs your attention now. The clinic tablet already offers the consent to treatment on the live site, before your dentist and lawyer have read it (1.6).

The five biggest changes:
1. Booking a tapped time on one screen (2.2).
2. One panel per visit, with today's visits drawn once on a phone (1.10, 2.4).
3. One list of patient forms waiting to be added (1.12).
4. One setup checklist, and Clinic profile split in two (2.22, 2.23).
5. HMO and PhilHealth claims made from the statement, with the payor's money recorded once (2.18). What happens when they pay less needs your answer (question 14).

## 2. Principles every change follows

1. **One way to do each thing.** Other doors point to it. They do not copy it.
2. **One teal button per screen.** Everything else is quiet.
3. **Say it once, where it is used.** No paragraph explains how to use the page. Repeated numbers and repeated cards go.
4. **The same word for the same thing.** One glossary (1.8) covers visits, money, forms and places. It is written before any screen changes.
5. **Show only what has something in it.** Empty cards and rows that count zero are hidden. Safety alerts, consent gaps and legal lines are never hidden.
6. **The first screen is for the task.** The main button sits where you can see it, on a desk monitor and on a phone.
7. **Measure before and after.** Every item has a before number and a target. Each time, we check contrast, 44 px touch targets and phone width again. No record is weakened.

**Words used in this plan**
- *Teal button:* the one filled, teal main action on a screen.
- *Quiet button:* an outlined button with no fill.
- *Fold:* a part of a screen that stays closed until you tap it open.
- *First screen:* what you see before scrolling. "1440" is a common desk monitor width and "390" a common phone width, both in pixels.
- *Frosted glass:* the see-through panels you chose for the public pages.
- *This visit checklist:* the list at the top of a patient's record for today's visit (blood pressure, consent, notes, charge).
- *Development servers:* the test copies we measured on. They show a "Prototype" banner, 100–130 px tall, that the live site does not. Every on-screen target in this plan is checked on the same setup, and each check also reports the live layout.

## 3. What stays as it is

**Your decisions**

- No 3D, no faces, no tooth chart on the home page, and no invented or third-party branding.
- The soft template everywhere, and frosted glass on the public pages.
- The film as the ground of the home page, with motion always on for everyone.
- No footer, and nothing fixed to the bottom of the screen.
- The record as a paper chart: the three sheets, the paper look, the baby teeth and the pictures.
- Four tabs in the workspace.
- Shared is the default at sign-in.
- Light or dark is each person's choice.
- The SwiftCare sample keeps its own design and its concept labels.

**What clinics must keep**

- **Consent and privacy**
  - Consent records that cannot be edited.
  - The versioned privacy notice.
  - Every RA 10173 duty: the Data Protection Officer, the notice, and deleting forms nobody added after 30 days.
  - Consent forms stay closed on the live site until a dentist and your lawyer have read them. The one exception today is the per-visit tablet signing, which already offers the consent to treatment (see 1.6).
- **Records and checks**
  - Audit trails.
  - PRC checks done by a person, and PTR copies on papers.
  - Allergies in red and alerts in amber.
- **Money**
  - The "not a BIR invoicing system" line on every paper.
  - No invoices until prices are final.
  - One balance definition.
- **Patients and booking**
  - No links in texts, and no text that asks for a reply.
  - Undo after booking, and the consent tick on every booking.
  - Request-only clinics are never shown a fake calendar.
  - Every trust claim names its source.

**What already works and stays**

- The sign-up page: one page, and ten actions to a working clinic.
- Sign-in in three actions.
- The look of the not-found page, the offline page and the privacy page.
- Pricing as one number.
- The free-time chips when booking.
- Next for you.
- Charging straight from the visit.
- One teal button on 19 of the 23 workspace screens sampled.
- No sideways scroll on any of the 86 screens measured.

**Looked at and left as is**

- Import a spreadsheet: 1033 px, 8 controls, one teal button.
- A consent form's own page: 1800 px, 11 headings. Its words are fixed until review.
- The operator's Clinics list, clinic panel and System page. The only change is the shared setup count in 2.22.
- Calls, measured with nothing in it: 100 words, no teal.
- The QR poster page: 1132 px. It must still scan.

**Not audited**

- The clinic tablet's waiting screen.
- Messages → Text a patient.
- Calls, Messages and Tasks on a busy day. All three were measured empty.

---

## 4. The phases

Each item says who it helps, what changes, why, the effort (S = days, M = a week or two, L = longer), the risk and how we keep it safe, and how we will know it worked.

*For the developer: build order.* Write the glossary (1.8) first, and use its words in every later item. Several items edit the same files; do them in this order so nothing is edited twice:
- `book.astro`: 1.14, 1.15, 1.30 (e), then 2.1, 2.2, 2.3.
- `ProfileSection.astro` and settings: 1.22, 1.39, 1.40, then 2.22, 2.23, 2.24.
- `patients/new/type.astro`: 1.11, 1.28, then 2.11, 2.15.
- `inbox.ts` and `Clinic.astro`: 1.12, then 1.13.
- Home `index.astro`: 1.19's label changes now; its section links only after question 3.
- Order constraints:
  - 2.1 before 2.2.
  - 2.29 before 2.30.
  - The phone half of 1.25 follows 2.4.
  - 2.37 comes last.

### Phase 1a: safety fixes first (days)

**1.1 Close an old way to change a visit's status that skips the checks**
- *Helps:* owner, dentists. *Effort:* S. *Risk:* low.
- *What changes:* The Dashboard still accepts a form from the retired Today page that changes a visit's status, though nothing in the app sends it any more. We remove it, so status changes go only through the calendar's normal path.
- *Why:* The old path skips three checks:
  - whether the person's role may change the schedule;
  - the "consent form not signed: why?" question when a patient is seated (or checked in, where the clinic asks at the door);
  - the limit on how fast requests can come.
- *Kept safe:* We first confirm no page sends to it. Then we run the seating and Dashboard checks and compare all 7 roles' screens before and after.
- *Measure:* Today the old path changes a status with no consent question; after, it is refused. The role comparison is identical.
- *For the developer:* `src/pages/c/[clinic]/index.astro` lines 75–91 (the POST handler and its `?stale`/`?refused` callout); `board.ts` `calUrl` pf/pq. Checks: `seat-check.mjs`, `dash-check.mjs`, `snap.mjs`/`cmp.mjs`.

**1.2 Stop voiding a statement that a payment plan is built on**
- *Helps:* desk, owner, patient. *Effort:* S. *Risk:* low.
- *What changes:* Voiding a statement that a braces or payment plan is built on is refused, with one sentence: "Stop the payment plan first." Once claims are linked to statements (2.18), the same check also refuses voiding a statement whose HMO or PhilHealth claim has been filed.
- *Why:* Today voiding checks only that no payment is still recorded. A plan built on a void statement stays "active", and its missed-payment count keeps running against money that no longer exists. After 2.19 it would show "₱3,000 due now" on that statement.
- *Kept safe:* Nothing already voided changes. Voiding stays the owner's or admin's, with a reason.
- *Measure:* Voiding a statement with an active plan is allowed today; after, it is refused with the sentence.
- *For the developer:* `voidStatement` in `src/lib/invoices.ts:632` checks only live payments. Add a check on `payment_plan.invoice_id` (active plans). Add the filed-claim check with 2.18. `planState` in `record-extra.ts`. 3.8 inherits both checks.

**1.3 Take "Clear chart" off the patient record**
- *Helps:* dentist. *Effort:* S. *Risk:* very low.
- *What changes:* The full-width Clear chart button leaves the record, and "Clear this tooth" stays. The demo wording "the way it would in a real patient record" becomes "Nothing charted yet."
- *Why:* One click wipes every finding on a real patient's chart, with no confirmation and no undo. A dentist without editing rights still sees the button (measured 230×44 px), and the server then refuses it.
- *Kept safe:* The chart's history is kept. A clear already waiting offline still syncs once and is recorded.
- *Measure:* 1 unguarded button → 0.
- *For the developer:* `Odontogram.astro` (button ~405, empty line ~401, handler ~1431), additive prop `clearAll` defaulting to false; record `[patient].astro:966`; `patients.css` `[data-clear]` rules. Leave the `/api/chart` clear path and `offline-queue.ts` as they are.

**1.4 Never mark a dentist "PRC checked" when no number is on file**
- *Helps:* patients, Flossify's operator. *Effort:* S. *Risk:* low.
- *What changes:*
  - The operator's PRC queue lists only dentists who have a number. The rest become one line with nothing to press: "N dentists have no PRC number yet; their profile says PRC check pending."
  - The system refuses "checked" when no number is on file. Any such rows go back to pending, and the counts include only dentists with a number.
  - Before shipping, we count on the live database (reading only) how many dentists are marked checked with no number. Their public pages go back to "PRC check pending", and we will tell you which clinics change.
- *Why:* A new owner who skipped the optional number sits in the queue as "PRC number not on file", next to a working Matches button. One tap would publish "PRC licence · checked <date>" for no licence at all.
- *Kept safe:* The public profile keeps "PRC check pending". When a number is added, the dentist rejoins the queue on their own.
- *Measure:* "Matches" on no number is allowed today and refused after. The live count is reported to you before the change.
- *For the developer:* `admin/prc/index.astro`. New migration for `admin_prc_mark()` (009), the 027 overview counts and `admin_clinic_rows.prc_pending`, with a read-only count on production first.

**1.5 One answer to "consent to treatment signed for this visit"**
- *Helps:* desk, dentist. *Effort:* S. *Risk:* low (display only).
- *What changes:* The This visit checklist and the visit panel use the rule the Dashboard already uses.
  - A consent to treatment prepared for that visit and agreed on the patient's phone or on paper counts, as a tablet signing does.
  - The duplicate "signed" pill goes.
  - The per-visit tablet signing has one label everywhere: "Sign consent for this visit". The consent forms' own rows keep "Sign on this tablet" and "Sign on their phone", so the desk can tell the two apart.
- *Why:* The checklist counts only the tablet signing. A visit whose consent to treatment was agreed on the patient's phone reads "signed" on the Dashboard and "not signed · Sign on this tablet" on the record. We found this in the code; we did not reproduce it on screen. The same action has three labels today.
- *Note:* A consent to treatment signed on the phone when a patient was first added, with no visit named, counts for no visit under either rule, so that patient is still asked at their next visit. Question 13 decides that.
- *Kept safe:* Nothing stored changes. The signing page and the seating question are unchanged.
- *Measure:* Four test visits:
  - signed on the tablet;
  - the consent prepared from that visit and agreed on the phone;
  - a paper signing recorded for that visit;
  - none.

  Today the checklist and the Dashboard disagree on the phone and paper cases. After, the checklist, the visit panel and the Dashboard agree on all four.
- *For the developer:*
  - Files: `[patient].astro:491`, `_record/VisitStrip.astro`, `_record/VisitPanels.astro:42–77`, `cal/panels.ts:247`, `VisitPanel.astro:115`.
  - Use `visit_treatment_consented()` (039:1247). It counts a 039 form only when `consent_document.appointment_id` is that visit.
  - Leave `cal/data.ts` and `seatingGaps` as they are.
  - Audit note: the Dashboard auditor proposed "Sign on this tablet" everywhere. We chose the whole-site auditor's "Sign consent for this visit", not "today's", because `canSign` also allows future visits.

**1.6 Tell your dentist and lawyer: the clinic tablet already offers the consent to treatment**
- *Helps:* owner, patients. *Effort:* S. *Risk:* none (nothing offered changes).
- *What changes:*
  - A line goes into the review pack and into this plan's "for your information".
  - The per-visit tablet signing offers the consent to treatment on the live site with no review check, while the same words in the consent forms wait for review.
  - We ask the dentist and your lawyer to read the consent to treatment first.
  - Nothing is switched off before they have read it, because pausing it could leave the live site with no way to record that consent on the tablet.
- *Why:* We found this in the code. The tablet signing page has no review check, the list of reviewed forms is empty, and elsewhere the forms are treated as unreviewed.
- *Measure:* Listed in the review pack: no → yes. The consent to treatment's review: not done → signed off, after which it is listed as reviewed.
- *For the developer:* `patients/[patient]/sign/[visit].astro` has no `CONSENT_REVIEWED` check; `scripts/dev/review/review-pack.ts`. See also 3.5.

**1.7 A wrong clinic or dentist address gets the real not-found page**
- *Helps:* patient. *Effort:* S. *Risk:* low.
- *What changes:* A wrong or outdated clinic page, booking or dentist link shows the site's not-found page, with the top bar and ways on. On that page, Find a clinic becomes teal and the home page link becomes quiet.
- *Why:* Today these links answer with bare text ("No such clinic") and no way on. This happens to every shared link of a clinic that unlists itself. The not-found page's only teal button sends a lost patient to the clinic sales pitch and a 4–9 MB film.
- *Measure:* 3 bare-text answers → 0.
- *For the developer:* Return `new Response(null,{status:404})` from `find/[clinic]/index.astro:12`, `find/[clinic]/book.astro:23` and `dentists/[dentist].astro:17/22`; `404.astro`.

### Phase 1b: groundwork (before the quick wins)

**1.8 Write the glossary first**
- *Helps:* everyone. *Effort:* S. *Risk:* low.
- *What changes:* A one-page list of the words we use, written before any screen changes, so every later item uses the same words and nothing is reworded twice.
  - **Visits:**
    - A *visit* is the event. *Book* is the verb.
    - "New booking" is the staff button.
    - A *request* is only a time the desk must place.
    - Patient pages keep "Book a visit" and "Request a visit".
    - "Here, not seated" is *Arrived*.
  - **Money:**
    - A *statement* is what a patient pays, and a *charge* is a line on it ("New charge", "Charge").
    - "Acknowledgment of payment" is never called a receipt or an invoice.
    - A statement's amount is "Still to pay". A person "owes", is "In credit" or has "Nothing owed".
    - "Balance" is used only in the Treatment record column, and in Opening balance when bringing over old records.
  - **Places:**
    - *People*, never Team.
    - Every place is named as it is on screen.
    - The Messages page becomes *Texts*, matching the record's Texts sheet and "Text a patient". Its address stays the same.
  - **Forms:**
    - *Desk poster forms*, and the *step-by-step forms* (your "Add patient, step by step").
    - *Forms to add* (sent, waiting to be added to a patient) and *Forms being filled in*.
    - A *consent form* is always shown with its state.
    - *The consent to treatment* is its one short name in staff sentences. The form keeps its own title, "Consent to dental examination and treatment".
    - *Privacy notice.*
  - **The record:** the *This visit checklist*. The name of the attached Treatment sheet is question 1.
  - **Not touched:** consent words and titles, the privacy notice, the paper record's labels, printed papers (without your agreement), and the not-BIR line.
- *Measure:* The glossary exists before phase 1c starts. A check flags retired words (Team, "appointment" on staff screens). The last sweep is 2.32.
- *How later items use it:* The check's list names the item that sweeps each retired word still on screen: the item that rewrites those words, or else the first item that rewrites that screen's words. 2.32 takes the screens no other item touches, and the labels it names itself. Where this plan quotes a screen word the glossary retires (Book a slot, Privacy consent, HMO claims, your page), the glossary's word wins when the item is built.
- *For the developer:* `docs/glossary.md`; a words check in tests that reads only on-screen strings and skips consent, privacy, paper and print files. Built as `npm run test:words` (`scripts/dev/words/`), with `known.json` listing each retired word still in the code: the ones to sweep with their plan item, and the ones allowed with the reason.

**1.9 A shorter rulebook for whoever builds Flossify next**
- *Helps:* maintainer. *Effort:* M. *Risk:* low.
- *What changes:* The project notes are 1,886 lines and about 24,000 words, read at the start of every session. They become a rulebook of 300–400 lines, with:
  - your decisions word for word;
  - a "Retired — do not bring back" list with your quotes;
  - the rules that protect patients, consent and money.

  Feature detail moves to separate documents, and the handoff note is brought up to date. It says 1 Oct and "migrations through 043"; main has 045.
- *Why now:* Every later session pays for the long file, and every item in phases 1 and 2 would otherwise add more to split later.
- *Kept safe:* Every quote and every "never" is checked across before merging. You read the new constraints and the Retired list first.
- *Measure:* 1,886 lines → 300–400. Handoff dated 1 Oct with 043 → current, with 045.
- *For the developer:* `CLAUDE.md`, `docs/HANDOFF.md`, `docs/features/`. Commit the scratchpad tools (`entrance-check.mjs`, `snap.mjs`/`cmp.mjs`, `intake-spec.md`) or remove their references.

### Phase 1c: quick wins (low risk, a day or two each)

**1.10 A row in Today's patients opens the visit**
- *Helps:* desk, dentist, owner. *Effort:* S. *Risk:* low.
- *What changes:* Tapping a patient in Today's patients opens the same visit panel as their calendar card. The small separate patient panel goes. The visit panel now carries both lists' taps, and 2.6 tidies its layout.
- *Why:* One visit opens two different panels depending on where you click.
  - The visit panel has the status, the "Before we start" checklist, the next step, Move, Edit and Open record.
  - The patient panel has 38 words, 5 controls and a teal New booking. For Maria, in the chair since 9:00, it said "Next visit: None booked" and "Last visit: None yet", with no status and no Done.
- *Kept safe:* The visit panel already shows allergies, conditions, mobile, HMO, the desk note, the balance (for those who see money) and the last and next visit. To book again, use + New → New booking, or the record.
- *Measure:* 2 panel types → 1. The Dashboard check passes.
- *For the developer:* `cal/patients.ts:293–299`, `panels.ts` openPatient (~968–1006), `PatientPanel.astro`, `index.astro:51, 396`; `docs/workspace-redesign.md:98–108`.

**1.11 One Add patient chooser**
- *Helps:* desk. *Effort:* S. *Risk:* low.
- *What changes:*
  - There is one chooser, on Add patient. It offers only the ways that work on this server, and "Easiest" appears only beside a way that is open.
  - When typing is the only way open (the live site today), the page goes straight to the typing form, as now. That form loses its own second three-way header. It keeps:
    - both "forms already sent" warnings;
    - one line on why patients cannot fill in their own forms yet;
    - a quiet Import link.
  - The four "other ways" links become two quiet ones: Import, and Forms to add when some are waiting.
  - The QR poster stays under Patients → More.
- *Why:* There are two choosers, with two different "Easiest" options, and seven ways in on the first. On the live site the poster's forms are closed until the privacy notice covers them, so the most prominent choice leads to a page that says they are closed.
- *Measure:* 2 choosers → 1. "Easiest" appears 0 or 1 times, and only beside an open way.
- *For the developer:* `patients/new/index.astro`, `new/type.astro` lines 350–387 (fm-ways). Keep `[data-ik-choose]`. Uses `formsNoticeReady` and `CONSENT_REVIEWED`.

**1.12 One list of forms waiting to be added: "Forms to add"**
- *Helps:* desk. *Effort:* S. *Risk:* low.
- *What changes:* Desk poster forms and step-by-step forms a patient has sent wait in one list, "Forms to add". Each row:
  - keeps its reference (QR-… or IN-…);
  - says which way it came and when it will be deleted;
  - opens its existing page for adding it to a patient.

  Forms still being filled in keep their own list, "Forms being filled in".
- *Why:* Today there are two queues. Step-by-step forms that were sent are counted nowhere and reached by no link, so they can sit unnoticed.
- *Kept safe:* We merge the list, not the adding. Each way keeps its own check for a patient already on file, its consent signings, its tamper check and its deletion rule. Poster forms are deleted 30 days after they were sent; step-by-step forms 30 days after Send, unless held.
- *Measure:* Places to look 2 → 1. Sent step-by-step forms in the inbox: not counted → counted. The deeper merge is 3.1.
- *For the developer:* `patients/forms/`, `patients/intake/`, `inbox.ts` (`countSentIntakes`), `canEditRecords`.

**1.13 The inbox lists only what is waiting**
- *Helps:* desk, owner, dentists. *Effort:* S. *Risk:* low.
- *What changes:*
  - The inbox shows only rows with something in them. It adds sent step-by-step forms (1.12) and "Your tasks" that are due today or late.
  - When every count is 0 it says "Nothing waiting".
  - Its foot holds three quiet links: Calls · Texts · Tasks. Question 2 asks whether you also want them in the sidebar.
  - "New replies" and the Replies filter appear only once this branch has received a reply.
  - The Texts page's note becomes "Between 9 pm and 8 am, reminders and your own texts wait until morning."
- *Why:* The inbox shows 5 rows even when every count is 0 (58 words of hints), yet misses sent forms and your tasks. Texts and Tasks can be reached only from menus, and "Tasks you gave" takes 3 clicks. The live text service sends one way, so "New replies" is always 0 today.
- *Kept safe:*
  - The Calls button in Today's patients stays.
  - A reply that does arrive always shows, because this follows the data, not a setting.
  - Sign-in codes are never counted or shown.
  - Each row is shown only to people who may open it.
- *Measure:* Rows shown at zero 5 → 0. "Tasks you gave" 3 clicks → 2.
- *For the developer:* `Clinic.astro` inbox Menu (331–335); `inbox.ts` (+ received count, + own tasks due); `messages/index.astro:343, 347`; `QUIET_KINDS` in `scripts/sms/worker.ts`. Audit note: one auditor would also count tomorrow's visits to confirm and statements left owing. We follow the other: the "to confirm" list is never zero, and "call back" cannot be marked done, so that count would go stale.

**1.14 Keep what the patient said is wrong**
- *Helps:* patient, desk, dentist. *Effort:* S. *Risk:* low.
- *What changes:*
  - The two check-up choices become one, "A check-up, or not sure".
  - The symptom picked on Find a clinic travels on every link from the card, through the clinic page, into the booking.
  - The visit note starts "Picked: Toothache", followed by anything the patient typed.
- *Why:* The test booking BU-RYFR picked Toothache twice and was saved as "Consultation" with an empty note. The dentist cannot see why the patient came, so the desk calls to ask. The clinic-page route also asks for the symptom a second time.
- *Kept safe:*
  - Urgent symptoms are never preselected in booking, and unknown values are ignored.
  - The visit's reason stays the service name, because the calendar reads the service from it.
  - Texts are unchanged.
  - No change to the privacy notice is needed.
- *Measure:* The test booking's note goes from empty to "Picked: Toothache". Reason choices 11 → 10.
- *For the developer:* `book.astro` (chips, payload), `find/index.astro` carry(), `find/_ui/ClinicPage.astro` Book links, `api/bookings/index.ts`; symptoms in `src/data/directory.ts`.

**1.15 After booking: the address, Directions and Call**
- *Helps:* patient. *Effort:* S. *Risk:* low.
- *What changes:*
  - The done screen shows:
    - the time and the clinic;
    - the clinic's street address, with a quiet Directions button;
    - Call, and Add to calendar;
    - Undo, with its 3:00 countdown.
  - The calendar file carries the address.
  - "Find another clinic" and "Your bookings on this device" go, and the patient's name and mobile are no longer kept in the browser.
  - My visits is the one place to see and cancel a booking. The done screen already links to it.
- *Why:* On the measured path the street address appears nowhere: not on the card, the booking, the done screen, the calendar file or the text. "Find another clinic" is not a next step for someone who has just booked.
- *Kept safe:* Undo is unchanged, and My visits finds requests too. There is no teal on this screen.
- *Measure:* Address on the done screen and in the calendar file: no → yes.
- *For the developer:* `book.astro` (done panel, .ics, paintMine, `flossify:bookings`), `ClinicPage.astro:35`; `book-e2e.mjs:53`. Update the /find/ rule in `docs/features/find-a-clinic.md` ("The patient side — `/find/`": "Bookings live in `localStorage` …").

**1.16 Toothache now: urgent help first on a phone**
- *Helps:* a patient in pain. *Effort:* S. *Risk:* low.
- *What changes:*
  - On a phone, the urgent choices (Swelling or fever, Knocked-out tooth) come right after Toothache, so they are in the first screen.
  - With an urgent choice:
    - clinics open now go to the top, with their status in words;
    - the urgent message names the first clinic open now and carries its Call button, the screen's one teal button;
    - on every card, Call moves up beside the clinic's name, quiet and ahead of Book;
    - the emergency-room sentence stays word for word;
    - if no clinic is open, one line says so above the list.
  - On a phone, the intro card becomes just its heading.
- *Why:* On a 390 phone the row of symptoms is 2075 px wide, and the urgent ones are last, about five swipes away. After tapping one, the first Call is at y=1194, below the fold, and every card still says Book.
- *Not doing:* switching on the Open now filter. At night it would hide every clinic and its phone number.
- *Measure (on the development server):*
  - Urgent choices at x≈1741 → in the first screen.
  - First Call at y=1194 → inside the urgent message, which starts at y≈497.
  - About 120 px saved above the first card's times.
- *For the developer:* Call lives in `.pt-actions` at the foot of each card (`find/index.astro:196–200`), so reordering that row only moves it sideways. In urgent mode, render Call in `.pt-result-head` and in the urgent callout. Symptom order is in `directory.ts`; booking filters the urgent ones out. Also `patient.css`.

**1.17 Close the day in the order the desk does it**
- *Helps:* desk, owner. *Effort:* S. *Risk:* low.
- *What changes:*
  1. Still open: only the groups that have something in them, otherwise "Nothing left open."
  2. Today's takings: only the payment methods used, plus the total. For those who see money, a fold with today's payments, each opening its statement.
  3. Count the drawer and Close, unchanged.

  Tomorrow becomes one line linking to Calls. Finances' "Collected today" tile opens this page, as the Dashboard's already does.
- *Why:*
  - The page is 2128 px (2734 on a phone), and Close is below the first screen.
  - The first 560 px are a table of 8 methods, always ₱0.00 on a quiet day. It includes Cheque, which no new payment can use.
  - Still open comes after the count, so a late payment means closing again.
  - There is no list of who paid today, except the spreadsheet download.
- *Kept safe:* The printed sheet keeps all 8 methods, every group and the signature line. A blind count stays blind.
- *Measure:* About 25% shorter on a day with things open (simulated 2195 → 1679 px at 1440). On a quiet day, Close rises from y=1055 to about 870. On purpose, Close sits lower when there is open work.
- *For the developer:* `finances/close/index.astro`; the tile's link in `finances/index.astro`.

**1.18 Call every place by its name on screen, and link straight to it**
- *Helps:* everyone. *Effort:* S. *Risk:* low.
- *What changes:*
  - "Settings → Team" becomes People everywhere: the forgot page, a sign-in error, the Texts page, and 2 texts to owners.
  - "Clinic settings → HMOs" becomes "Clinic profile → HMOs you accept", and "Services & fees" becomes "Services & prices".
  - The forgot page says "No mobile on file? Ask your clinic owner to set a new password for you in Clinic settings → People."
  - Links go straight to the real page instead of passing through old addresses.
  - The Messages page becomes Texts (its address stays), and the Finances tab "HMO claims" becomes "HMO & PhilHealth claims", as the glossary says.
- *Why:* 7 places send people to "Team", which is called People. On the live site, every staff member who forgets a password reads it.
- *Kept safe:* Texts stay one SMS long, re-measured with a long dentist name. Old addresses and PayMongo returns still land. A check stops the retired names coming back.
- *Measure:* Retired names on screen and in texts 7+ → 0. Live links through old addresses 3 → 0.
- *For the developer:* `auth/forgot.astro:211`, `auth/login.astro:68`, `messages/index.astro:259/377`, `lib/messages.ts:134–144`, `record-extra.ts:228`, `finances/new.astro:276`, `BillingNotice.astro:24`, `payments.ts:205`, `api/payments/checkout.ts:36`, `routes.ts` newCharge. A place-names module built from `SECTIONS`. Also `docs/launch.md:182` and `docs/features/backend.md`: "Backend — Postgres, RLS, sessions" ("reset by the owner from Settings → Team") and "Production — settings, database, deploy" ("Settings → Team and `/start/` both check globally").

**1.19 Home page: one name per destination, and words that match the product**
- *Helps:* prospective owner, patient. *Effort:* S. *Risk:* low.
- *What changes now:*
  - The hero's two buttons keep your words. So do the How to register buttons, because the videos quote them.
  - Pricing's "Start your 30 free days" becomes "Open your clinic", with "30 days free, no card" beside it.
  - Partners' "See every clinic" becomes "Find a clinic".
  - The empty-state "Become a partner clinic" becomes "Open your clinic".
  - The price is written once: "₱800 a month for each branch". "Prices are not final yet" stays.
  - "Book in five steps" becomes "Book in a few taps". Booking is 4 steps from a tapped time and 5 from a clinic page.
  - "Invite your team: code by text" becomes "Add your team: each person gets their own sign-in and the right access".
- *After question 3 (folding the home page):* The four header links in Services and How it works that repeat a nearby button go. If you say yes, they go with the fold (3.2); if no, they go then.
- *Why:* Sign-up is linked 6 times under 5 labels, and Find a clinic 6 times under 3. On a desk, 4 of the 9 controls in the first screen lead to 2 places under 4 names.
- *Measure:*
  - Labels for sign-up 5 → 2 (the hero's and the bar's), and for Find a clinic 3 → 2.
  - With the header links gone, visible links 23 → 19 at 1440 and 18 → 14 at 390.
  - Teal buttons unchanged.
  - Frosted-glass contrast re-measured wherever a label's length changes.
- *For the developer:* `index.astro` (forPatients, clinicSteps, ways[], the Pricing card, group headers, the Partners empty state). Walkthrough captions are unchanged.

**1.20 The clinic page shows its next open times**
- *Helps:* patient. *Effort:* S. *Risk:* low.
- *What changes:* Under Book a slot on a live clinic's page, "Next open: Today 2 pm · 2:30 pm · 3 pm". This applies to both the Find a clinic version and the clinic's own site. Each time opens booking with that time already chosen. Request-only clinics are unchanged.
- *Why:* The Find a clinic card shows three times, but the clinic page shows none. A patient who arrives there (from Google, a dentist's page or the clinic's own site) must go through Reason and Dentist, then a grid of more than 60 times, before seeing one.
- *Kept safe:* Book a slot stays the one teal button. Contrast is checked over a real cover photo, an all-black, an all-white, a striped and a missing cover. Today that page has 0 fails, lowest 5.3:1.
- *Measure:* To Confirm in 9 taps over 5 screens → 7 over 4.
- *For the developer:* `find/_ui/ClinicPage.astro` head, `openSlots(l,{limit:3})` when `l.workspace`; `clinic-glass.css`. The clinic site's bar label in `[clinic]/index.astro` is its twin and changes with it. Audit note: another count gave 10 taps today.

**1.21 My visits says "Booked" for a time the patient just chose**
- *Helps:* patient. *Effort:* S. *Risk:* low.
- *What changes:*
  - A visit the patient booked online shows a calm "Booked", with "You chose this time. From two days before, you can confirm it here; the clinic may also call."
  - From two days before, it shows "Please confirm". Confirm is available all along: quiet at first, teal within the two days.
  - Visits the desk booked or placed ask for confirmation at once, as now.
- *Why:* A minute after booking, the patient sees an amber "Please confirm" for a time they just picked.
- *Kept safe:* This is display only. Statuses, reminders and the desk's two-day calls (the protection against no-shows) are unchanged.
- *Measure:* Amber "Please confirm" right after an online booking: yes → no.
- *For the developer:* `me/visits/index.astro` statusOf, canConfirm.

**1.22 List a new clinic in one save**
- *Helps:* new owner. *Effort:* S. *Risk:* low.
- *What changes:*
  - When the About is the only thing missing, the "Show on Find a clinic" switch can already be ticked, with the About box right under it. Type, tick, Save.
  - When hours or a dentist are missing, the switch stays off and names what is missing.
  - The switch's line drops "Then switch this on and save".
  - The checklist itself is redone once, in 2.22.
- *Why:* Today the switch is locked until the About is saved: 5 actions, 2 saves and 2 page loads. On a phone the switch and the About are 1,270 px apart.
- *Kept safe:* The server's listing rule is unchanged, and it works with scripts off.
- *Measure:* 5 actions and 2 saves → 3 actions and 1 save.
- *For the developer:* `settings/_ui/ProfileSection.astro`; `_lib/profile.ts` heldText, okToList, missingForListing; `profile-check.mjs`.

**1.23 "I have a code" on every sign-in card**
- *Helps:* new staff. *Effort:* S. *Risk:* low.
- *What changes:* One shared "Other ways in" list:
  - **A clinic's door:** Forgot your password? · I have a code · "Not at <clinic>? Sign in another way" (kept).
  - **The email door:** the same two, then "Sign in at your clinic's page" and "New clinic?" (kept, because it is the only route to sign-up from there).
  - **The forgot page:** its link becomes "I have a code".
  - **Unlock:** gets only the door's wrong-password sentence.
- *Why:* The invitation text says to choose "I have a code". But a clinic computer that has signed in once opens the clinic's door, which has no such link.
- *Kept safe:* The staff entrance still fits 1440×900 with no scroll, with the button in view at 1366×768.
- *Measure:* An invitation from the clinic's door takes 3 screens today → 2.
- *For the developer:* A new list component in `components/entry/`; `[clinic]/sign-in.astro`, `auth/login.astro`, `auth/forgot.astro`, `auth/unlock.astro`.

**1.24 Clinic settings on a phone: the list first, then one section**
- *Helps:* owner, admin. *Effort:* S. *Risk:* low.
- *What changes:* On a phone, with no section named, only the section list shows, with its status lines. A tap opens that section alone, with "‹ Clinic settings" at its head.
  - It opens straight on a section when the address names one, or after a refused save.
  - **The welcome landing, defined once:** after sign-up, the setup checklist is the first thing on the screen, on a phone and on a desk. Until 2.22 it is the checklist inside Clinic profile; after 2.22 it is the setup card at the top of the list.
- *Why:* At 390 the 630 px list sits above a 3,891 px form, and no setting is in the first screen.
- *Kept safe:* Unsaved typing and the "not saved yet" prompts work as now. With scripts off, everything stacks as today. The desk layout is unchanged.
- *Measure:*
  - On landing at 390, a section's settings in the first screen: 0 → the whole list of sections.
  - A tapped section's first setting at y=909 → inside the first screen.
  - Page length when landing: 4,849 px → the list alone.
- *For the developer:* `settings/index.astro` (set-side, set-jump, first-paint script, go(), pushState), `settings.css`.

**1.25 The Waiting and In the chair tiles show who**
- *Helps:* desk, owner. *Effort:* S. *Risk:* low.
- *What changes:*
  - Pressing Waiting or In the chair narrows Today's patients to those people, longest wait first, with "Showing 2 waiting · Show everyone". Pressing again clears it.
  - On a phone, once 2.4 stops drawing Today's patients there, the same press narrows the calendar's list of cards instead.
  - On today's view the count line drops "N booked", because the tile already says it.
- *Why:* Today's numbers are said four times, yet "who is waiting, and for how long?" has no list.
- *Kept safe:* Narrowed rows keep their allergy and alert labels and their one-tap step.
- *Measure:* Who is waiting: no list → one press. The Dashboard check covers desk and phone.
- *For the developer:* `index.astro` tiles, `Tile.astro`, `board.ts` renderCount, `patients.ts`; `dash-check.mjs`.

**1.26 One "whose visits" control, and the numbers follow it**
- *Helps:* dentists, owners who treat. *Effort:* S–M. *Risk:* low.
- *What changes:*
  - The "Only mine / Show everyone" line in Today's patients goes. It does what Mine · Everyone already does.
  - For people who treat, More → "Show the visits of" lists only the other dentists.
  - The tiles and the list count what the board shows. Collected today stays the clinic's money.
- *Why:* Hazel, on Mine, saw an empty board under "Booked today 3 · Waiting 1 · In the chair 1".
- *Measure:* Controls that choose whose visits, for people who treat: 3 → 1. Hazel's tiles over her empty board: "3 booked" → "0".
- *For the developer:* `index.astro` (pills, whoItems, summarize), `patients.ts` scope line, `board.ts` renderTiles, renderCount and renderChrome, `model.ts` summaryNotes.

**1.27 Find a clinic: fewer filters on show, one link per place on a card**
- *Helps:* patient. *Effort:* S. *Risk:* low.
- *What changes:*
  - The "What's wrong?" choices (urgent ones in red) and Open now stay in view.
  - Service, HMO, Area, PhilHealth and Sort move into "More filters". It stays closed at every width unless one of them is set, and it says what is inside and how many are on.
  - On each card, the clinic's name is one link to its page, and the separate "Clinic page" button goes.
- *Why:* At 1440 there are 34–36 controls in the first screen for 5 clinics. Each card has 7 links: 2 to the clinic page and 4 to booking.
- *Kept safe:* Old filtered links still work. The name link grows from 20 px to at least 44 px.
- *Measure:* Links per card 7 → 6. First-screen controls at 1440: 34–36 → under 25 (target).
- *For the developer:* `find/index.astro` (.pt-actions, .pt-filters, .pt-result-head, readUrl), `patient.css`. Audit note: one auditor would drop Sort; we keep it inside the fold. Both agree not to merge symptoms with services, because the urgent ones must stay red and trigger the call-now message.

**1.28 Type a patient in: fold the old-record parts**
- *Helps:* desk. *Effort:* S. *Risk:* low.
- *What changes:* Past visits and Opening balance go into one quiet fold before Save, "Bringing over an old paper record?". It opens by itself when something was typed there or a save was refused. Privacy consent stays in view.
- *Why:* The form is 2726 px (5053 on a phone), and Save is below the fold. Two of its five sections are tools the page itself says most patients don't need.
- *Kept safe:* One save, the same money permissions and the same audit.
- *Measure:* Height 2726 / 5053 px → re-measured. Save in the first screen at 1440: no → target yes, with 2.11.
- *For the developer:* `patients/new/type.astro`.

**1.29 One word and one colour for what a patient owes**
- *Helps:* desk, dentist, owner. *Effort:* S. *Risk:* low–medium (it touches Finances, the record and the Dashboard at once).
- *What changes:* Following the glossary (1.8):
  - A statement is Unpaid · Part paid · Paid · Void everywhere, and its amount is "Still to pay".
  - A person "Owes ₱X", is "In credit ₱X" or has "Nothing owed".
  - "Balance" appears only in the Treatment record column, as on paper, and in Opening balance when bringing over old records.
  - Amber means owed, and red means overdue only (a payment plan behind). The record's Account sheet matches Finances. On the sheet, red stays only for an allergy and a refused or withdrawn consent.
- *Why:* What a patient owes appears in 14 places under 8 words, with 3 words for "unpaid". It is amber in Finances and red on the record.
- *Kept safe:* "Statements of account, not BIR receipts." stays word for word unless you answer question 22. Amber on the paper is checked at 4.5:1 or better, light and dark.
- *Measure:* Words for "owed" 8 → 3. Colours 2 → 1.
- *For the developer:* `STATUS` in `src/lib/invoices.ts` as the one source. Remove `TONE_OF`, `STMT_TINT`/`BILL_STATUS`, `STMT_WORD`, and "Not paid yet" in `VisitPanels.astro`.

**1.30 Take out empty and repeated cards**
- *Helps:* patient. *Effort:* S. *Risk:* low.
- *What changes:*
  - (a) The Reviews cards go until reviews exist.
  - (b) The dentist's page has one credentials list in its head: PRC, PDA and specialty, each with its source line, said once.
  - (c) With one clinic, its Book button is teal; with several, all are quiet.
  - (d) My visits hides the empty "Past · 0 visits" card.
  - (e) "Book here" opens booking with that dentist already chosen.
- *Why:* The dentist's page says PRC, PDA and specialty twice, and has 2 teal buttons in the first desk screen.
- *Kept safe:* Every trust claim keeps its source, more visibly than today's hover text.
- *Measure:*
  - Reviews cards 2 → 0.
  - Credentials said twice → once.
  - Teal in the dentist page's first desk screen 2 → at most 1.
  - Choosing the dentist again after "Book here": 1 extra tap → 0.
- *For the developer:* `ClinicPage.astro` (#rev), `dentists/[dentist].astro` (#rev, #cred), `me/visits/index.astro`, `book.astro ?dentist=`.

**1.31 Coverage: one way to act, and the privacy notice in one place**
- *Helps:* patient. *Effort:* S. *Risk:* low.
- *What changes:*
  - One teal "Find a clinic that lists it", with a PhilHealth / HMO choice.
  - The PhilHealth figures, the circular's citation and "Always confirm with your HMO." stay word for word.
  - The health-data card becomes one line linking to the privacy notice.
  - The sign-up tick "I've read how Flossify handles patient data" links to the privacy notice instead of that card.
- *Why:* 524 words and no teal button. The only way from "I have an HMO" to a clinic that takes it is an inline link, then a filter hidden behind More filters on a phone. The privacy card repeats the notice.
- *Measure:*
  - Teal 0 → 1.
  - From the page to a list filtered to your HMO: a link plus a hidden filter → 1 tap.
  - 524 words → re-measured, target fewer.
- *For the developer:* `coverage.astro` (#ph, #hmo, #privacy), `start/index.astro:205`.

**1.32 My visits door: one card, one sentence**
- *Helps:* patient. *Effort:* S. *Risk:* low.
- *What changes:* The heading, then "We text a code to the mobile you booked with. No account, no password.", the field and the button, then two short links. The small label above the heading and the "How it works" card go.
- *Why:* 121 words for one field. The side card is 388 px, nearly twice the form card.
- *Measure:* Phone height 1040 px → about 650 (estimate). Words 121 → about 40.
- *For the developer:* `me/_Door.astro`, `me/index.astro`.

**1.33 One list of work done: the Treatment record**
- *Helps:* dentist. *Effort:* S. *Risk:* low.
- *What changes:*
  - The attached Treatment sheet drops its "Treatments done" card, so page 3 is the one list of work done.
  - The sheet keeps the plan (with Mark done, and Mark done anyway with its reason), lab cases, LOAs and payment plans.
  - "Record a treatment" lands on page 3.
  - The sheet's name is question 1.
- *Measure:* Lists of work done 2 → 1. The record check passes.
- *For the developer:* `_record/Treatment.astro`, `TreatmentRecord.astro`, `ANCHOR`/`SECTION_OF['done-add']`, a `#treatment-done` alias, `PART_OF`.

**1.34 Stop offering "In the lobby"**
- *Helps:* desk, dentist. *Effort:* S. *Risk:* low.
- *What changes:* "Here, not seated" has one step, Arrived. A visit already marked "In the lobby" shows as Arrived.
- *Why:* The two statuses stamp the same time, count in the same tile and share a colour. The state has six names, and a confirmed visit's More menu offers 3 ways to say "they are here".
- *Kept safe:* The server still accepts both. The consent question at the door is unchanged.
- *Measure:* More items on a confirmed visit 6 → 5. Names for the state 6 → 1.
- *For the developer:* `panels.ts` STEP/SAID, `ws/status.ts`, `visit-record.ts`, `[patient].astro` HERE, `api/search.ts`.

**1.35 A dentist with nothing today: one message**
- *Helps:* dentist. *Effort:* S. *Risk:* low.
- *What changes:* One line instead of two: "Dr. Tabanao is not in today · next in Wed 7 Oct", with a quiet Everyone link. When she is in but has nothing booked, it says "Nothing booked with you today". Whether to open on the whole clinic is question 25.
- *Measure:* Empty messages 2 → 1.
- *For the developer:* `board.ts` emptyText, `patients.ts:281`.

**1.36 Phone sign-in: the button in the first screen**
- *Helps:* staff on their phone. *Effort:* S. *Risk:* low.
- *What changes:* On phones:
  - the light/dark switch becomes a round icon beside the patients' pill, so the top takes one row instead of two;
  - the "Good morning." line goes;
  - the device hint keeps every fact, with "computer" changed to "device".

  Shared stays the default.
- *Why:* The Sign in button sits at y=843 on the clinic door (entirely off-screen) and at y=799 on the email door (cut by the fold).
- *Measure:* The button's bottom 891 → about 808 on the door, and 846 → about 763 on the email door. Desk sizes unchanged.
- *For the developer:* `StaffEntrance.astro`, `ThemeSwitch.astro`, the entrance section of `global.css`.

**1.37 A shorter code page, and one sign-in link on sign-up**
- *Helps:* staff setting a password, new owners. *Effort:* S. *Risk:* low.
- *What changes:*
  - The code page asks for the new password once, with a Show button.
  - When the number came from the previous step, the note and the field become one line: "If 0917 … is on a staff account, a code is on its way…". It never says "sent to", so it cannot reveal whether a number is known.
  - Sign-up keeps one "Already set up? Sign in", states the listing rule once, and gains a Show button.
  - Sign-up and My page keep "type it again", because that is the owner's own password and nobody else can reset it.
- *Measure:* Code page at 390, about 1388 → about 1250 px. It still scrolls, so we will not claim the button comes into view.
- *For the developer:* `auth/code.astro`, `start/index.astro`; `passwordProblem()`. Audit note: another count measured the code page at 1281 px.

**1.38 A way back on a desk device handed to a patient**
- *Helps:* desk. *Effort:* S. *Risk:* low.
- *What changes:* A small quiet "For the clinic" button in the top bar of every open form page, far from Continue, leading to staff sign-in. Desk devices only.
- *Why:* Today the way back shows only after the forms close. If a patient hands the device back halfway, the only way back is typing an address.
- *Plain cost:* Screens the patient already sent are kept. What is typed on the open screen is lost. Saving it first is possible (effort S → M).
- *Measure:* Way back while forms are open: typing an address → 1 tap.
- *For the developer:* `f/i/[token].astro` (.ip-bar), `/auth/unlock/`; `phone-e2e.mjs`.

**1.39 Opening hours: one lunch line; Save where you can see it**
- *Helps:* owner. *Effort:* S. *Risk:* low.
- *What changes:*
  - One Lunch row above the week fills every open day it fits, and names any day left out and why.
  - "A different lunch on some days" opens the per-day fields. It opens by itself when saved lunches differ.
  - In every settings section, Save sits at the top, with a second Save at the foot only when the top one is out of view. There are never two teal buttons in view.
- *Why:* 35 fields for 7 days, and the only Save is at y=1313, below the first screen.
- *Measure:* Lunch typed per day 7 → 1. Save at y=1313 → in the first screen. A 12–1 lunch saves cleanly at clinics with short Saturdays.
- *For the developer:* `_ui/HoursSection.astro`; Save placement across sections.

**1.40 Settings: lead with the question**
- *Helps:* owner. *Effort:* S. *Risk:* low.
- *What changes:* Each setting opens with the question it answers and keeps one accurate line. The rest folds under "How this works". For example: "A consent form isn't signed: ask the desk why… (•) When the patient sits in the chair ( ) When the patient arrives." Words only; no setting or default changes.
- *Why:* Clinic profile is 468 words, and several settings explain how they work before they offer the choice.
- *Measure:* Clinic profile 468 words → a third fewer (target), with every setting and default unchanged.
- *For the developer:* `ProfileSection.astro`, `RolesSection.astro`, `RoleField.astro`, `TabletsSection.astro`; `choices-check.mjs`, `profile-check.mjs`.

**1.41 Flossify's own plan: said once, when it matters**
- *Helps:* owner. *Effort:* S. *Risk:* low.
- *What changes:*
  - The sidebar trial card shows only:
    - in the last 7 days of the trial;
    - for 7 days after it ends;
    - when the plan is cancelled;
    - when an invoice is due.
  - On the plan page, "Prices are not final: you will not be charged until we tell you." appears once. "Not final yet" stays on the price, and "Do not pay" stays on any early invoice.
- *Why:* The trial card (about 73 px) is on every workspace page for 30 days. The plan page says "trial" 4 times and "not final" 3 times.
- *Measure:* Days the card shows during the trial 30 → 7. "Trial" on the plan page 4 → 1. "Not final" 3 → 2 (the notice and the price's label).
- *For the developer:* `billing.ts` describe(), `ws/plan.ts`, `BillingNotice.astro`, `PlanSection.astro`.

**1.42 Print with one button**
- *Helps:* desk. *Effort:* S. *Risk:* low.
- *What changes:* A statement has one quiet Print. The print page keeps its A5 / 80 mm choice and remembers it on that computer. The payment prints and "Print the acknowledgment" stay.
- *Why:* The paper size is chosen twice.
- *Kept safe:* One audit line per print, and every word on paper unchanged.
- *Measure:* Paper size chosen 2 times → 1. The statement page's two-choice Print menu → one button.
- *For the developer:* `[invoice]/index.astro`, `[invoice]/print.astro`; a cookie under /c/, and `?paper` wins.

**1.43 Claims: one "Save the answer" button**
- *Helps:* desk. *Effort:* S. *Risk:* low.
- *What changes:* One amount box and one teal button. The answer is recorded as approved when the amount equals the claim and partly approved when it is less; more than the claim is refused. Denied stays its own form.
- *Why:* Two buttons today, with help text explaining which to press.
- *Measure:* Answer buttons 2 → 1. The help line → gone.
- *For the developer:* `finances/_Claims.astro`, `_claims.ts`.

**1.44 Show at most six partner clinics on the home page**
- *Helps:* patient, prospective owner. *Effort:* S. *Risk:* low.
- *What changes:* Above six listed clinics, the home page shows six, rotating daily and never in name order, and the link reads "See all N clinics". Below six, nothing changes. Every listed clinic stays on Find a clinic.
- *Why:* 5 clinics already take 892 px on a phone, and each card adds about 90–117 px. At 30 clinics that is about 2,700 px more, which stretches the film's walk.
- *Measure:* The Partners page on a phone stays at about 1,000 px or less, however many clinics are listed.
- *For the developer:* `index.astro` partners.map; a shuffle seeded by the Manila date.

**1.45 Clinic websites page: fix the frame, cut the build notes**
- *Helps:* prospective owner. *Effort:* S. *Risk:* low.
- *What changes now:*
  - Fix the framed sample. On the development server it shows Flossify's not-found page inside the frame.
  - Remove the big "The clinic's live site ↗" button, keeping the concept caption word for word.
  - Make "Open the sample site" a quiet link in the frame's bar.
  - Cut the 80-word card of build rules to one sentence.

  The rest waits for question 19.
- *Why:* 377 words and 10 controls, and none of them asks for a website.
- *Measure:* Sample shown in the frame: no → yes. Large buttons 2 → 0. The build-rules card about 80 words → one sentence.
- *For the developer:* `websites.astro`; point the frame at `/samples/swiftcare/index.html`.

**1.46 Operator pages: each number once**
- *Helps:* Flossify's operator. *Effort:* S. *Risk:* low.
- *What changes:* The overview becomes Needs you, then New clinics, then one list of facts. The four tiles go once their numbers are in the list. While billing is off, the billing page shows the banner, Due only when something is due, then every group.
- *Why:* The PRC count appears 3 times and the clinic count 3 times. Billing shows four ₱0 tiles.
- *Kept safe:* "Counts only: no patient's name, number or record reaches these pages." stays.
- *Measure:*
  - PRC count shown 3 → 2 (Needs you and the menu).
  - Clinic count 3 → 1.
  - ₱0 tiles while billing is off 4 → 0.
  - Overview 1383 px and billing 1428 px → re-measured.
- *For the developer:* `admin/index.astro`, `admin/billing/index.astro`.

**1.47 Tidy old addresses, dead switches and the unused clinics list**
- *Helps:* maintainer. *Effort:* S. *Risk:* low.
- *What changes:*
  - Remove five always-on internal switches and their dead fallbacks, one page setting nothing reads, and unused section names.
  - Gather the old-address redirects into one table with a removal date. Each keeps its behaviour.
  - Retire the unlinked clinics list page; its address sends people to Clinic sign-in.
  - Update the installed app's colour from the retired grey.
- *Kept safe:* /today/ (the installed app's start page), the plan's PayMongo return, and the claims page for people without Finances all stay.
- *Measure:*
  - Always-on switches 5 (10 references) → 0.
  - Pages passing an unused setting 20 → 0.
  - Scattered redirect pages 9 → one table.
  - Orphan page 1 → 0.
- *For the developer:*
  - Switches and settings: `routes.ts` LANDED/newCharge; `Clinic.astro` finance prop and Section ids.
  - Redirects: `schedule/`, `billing/[...path].ts`, `settings/{team,fees,photos,privacy}.astro`, `settings/people/index.astro`.
  - Clinics page: `clinics.astro` → 301 to `/auth/login/`. Keep 'clinics' reserved.
  - Manifest: `manifest.webmanifest` → #f3f5f8.
  - Docs: `workspace-redesign.md` 728–731, 741, 790, 817.
  - Audit note: one auditor proposed `/auth/clinic/`. We chose `/auth/login/`, which was measured to send a signed-in member to their workspace and a remembered device to its door.

### Phase 2: consolidation, area by area

#### Patients

**2.1 Choose a day, then that day's times**
- *Helps:* patient. *Effort:* M. *Risk:* low–medium.
- *What changes:*
  - A row of day buttons for the next 14 days, each with its count in words: "Wed 7 · 12 open", "Closed" or "Full".
  - Under it, only the chosen day's times, split into Morning and Afternoon, with Continue right under them.
  - Choosing a time never moves on by itself.
  - This comes before 2.2, which builds on it.
- *Why:* The When step draws 4 days and 65 times (72 controls). On a phone, Continue is 1405 px below the question.
- *Caution:* Two clinics already return the most times the system sends at once (200), with the last day cut short. A day past that limit must never read "0" or "Closed".
- *Measure:* Controls on the step 72 → re-measured, target under 30. Continue's distance from the question at 390: 1405 px → re-measured.
- *For the developer:* `book.astro` paintSlots. `/api/availability` needs an uncapped per-day count, or "See times" for days it does not cover.

**2.2 Book a time you tapped, on one screen, with the clinic and the step on one line**
- *Helps:* patient. *Effort:* M. *Risk:* medium.
- *What changes:*
  - **Booking with a chosen time:** everything is on one screen.
    - **The chosen-time line at the top:** "Toothache · Wed 7 Oct, 10:00 am · any dentist [Change]", or "with Dr <name>" at a one-dentist clinic.
      - Change opens reason, dentist and time in place, using 2.1's day row.
      - Every dentist keeps "PRC checked" or "pending".
      - The "does this time still fit" check runs again.
    - **Below the line:**
      - who the visit is for, with Me ticked;
      - name and mobile, with HMO and a note optional;
      - the consent tick and the privacy link, word for word;
      - the summary, with every promise from today's Confirm step;
      - one teal "Book 10:00 am" in the page, never stuck to the bottom.
  - **Every booking:** the separate head card moves into the booking card as one line: "‹ <clinic>", the area, and "Book a visit" (or "Request a visit … the clinic confirms the time with you"). The numbered bar becomes "Step 2 of 3 · When", counting only the steps shown, and screen readers announce it.
  - **Without a chosen time:** the steps stay, and Dentist becomes a "With" choice on the When step.
- *Why:* From Find a clinic, booking takes 9 taps over 6 screens. Two of those screens only confirm what is already chosen, and Confirm repeats the line at the top. On a phone, 232 px sit above every question, and Continue was below the fold on every step measured (y=1072, 849, 976, 1092).
- *Kept safe:* The consent record is unchanged. The time is checked again at saving, "That slot has just gone" reopens the times, and the 3-minute Undo stays.
- *Measure:*
  - 9 taps over 6 screens → 6 over 3.
  - Where Book sits at 390 and 1440.
  - Continue on the Reason step (plain flow) about 1102 → about 950 px at 390.

  These are measured on the development server, and the live layout is reported too. We will not claim the first screen unless measured.
- *For the developer:* `book.astro` (flow, show, the slot strip, header.cl-head, ol.pt-steps), `/api/bookings`, `patient_consent`, the p32 verdict, `soloDentist`, `willRemind`; `clinic-glass.css`; `book-e2e.mjs`.

**2.3 A clinic's own page: one address, and its booking stays on it**
- *Helps:* patient, clinic owner. *Effort:* S–M. *Risk:* low.
- *What changes:*
  - A booking started on the clinic's own site keeps that clinic's top bar and goes back to its site. Done offers "Back to <clinic>", not "Find another clinic".
  - Search engines are told the clinic's own address is the main one.
  - Settings shows one address, with Open and Copy.
- *Why:* Today the clinic's own site hands its patient to Flossify's bar, which lists other clinics. Two addresses draw the same page, and Settings offers both.
- *Kept safe:* The consent wording and Undo are kept. So is the Done line "cancel under My visits or by calling…", which is the patient's only way to cancel from the clinic's own bar.
- *Measure:*
  - Addresses search engines see per clinic 2 → 1.
  - Addresses Settings offers 2 → 1.
  - Links to other clinics while booking from a clinic's own site 3 → 0 (Find a clinic, Open your clinic, Find another clinic).
- *For the developer:* `[clinic]/index.astro` `?from=site`; `book.astro` SiteHeader clinic; `Base.astro` canonical prop; `ProfileSection.astro` address blocks; RESERVED exception.

#### The front desk and the Dashboard

**2.4 Today's visits drawn once on a phone; shorter rows on a desk**
- *Helps:* desk, dentist, owner. *Effort:* M. *Risk:* medium.
- *What changes:*
  - **Desk:** Today's patients stays beside the calendar, with rows of one or two lines: time, name, age, status with "Waiting N min", allergy, first alert, and the step. Mobile, balance and the full desk note move to the visit panel.
  - **Phone:**
    - The calendar's list cards gain the one-tap step (keeping the consent question), the allergy as a red label in words, the first alert in amber in words, and the desk-note mark.
    - Calls and See all patients go to the foot of the list.
    - Today's patients is not drawn, and the Waiting and In the chair tiles narrow the cards instead (1.25).
  - **Condition for the phone change:** we make it only once the cards carry all of that, measured. If they cannot, the list stays on phones too.
  - The allergy shown in both Next for you and Today's patients is deliberate and stays.
- *Why:* On a phone the same 3 visits appear three times, the page is 2089 px, and the first calendar card is at y=959, below the fold. On a desk, rows are 198–223 px tall, about 1.5 rows in the first screen.
- *Measure:*
  - The phone's first card at y=959 → above the 844 px fold, measured on the development server and reported live.
  - Desk rows 198–223 → 80 px or less.
  - Allergy words readable without hovering, at 4.5:1 or better.
- *For the developer:* `index.astro` #patients, `patients.ts` row()/stepOf, `panels.askSeat`, `board.ts` list cards, `cal.css`; `dash-check.mjs`. Audit note: one auditor would keep Today's patients on every width, because today the cards show an allergy only as an icon with hover text and have no step button. Hence the condition above.

**2.5 The calendar's head: the date said once**
- *Helps:* desk, dentist, owner. *Effort:* M. *Risk:* low.
- *What changes:*
  - First row: ‹ date ›, a "Go to a date" button, Today (only when you are not on today), More, and New booking (teal).
  - Second row: Day | Week · Mine | Everyone · the count.
  - The title says "Tomorrow · Wednesday 7 October" when it is.
- *Why:* There are 10 controls before the first visit, and the date is said four ways.
- *Measure (on the development server; live reported too):*
  - Calendar top at 1440: 613 → about 560.
  - Calendar in view at 1366×768: 103 → about 208 px.
  - Phone list: 944 → about 840.
- *For the developer:* `index.astro` calendar Pane and .cal-bar, `board.ts` renderChrome, `cal.css`.

**2.6 The visit panel: actions on one row, everything in one panel**
- *Helps:* desk, dentist. *Effort:* S. *Risk:* low.
- *What changes:*
  - The five actions (next step, Move, Edit, Open record, More) fit on one row at 1440.
  - The "Before we start" and "Before they leave" lists use the shared rules from 2.9, with done items as one row of labels.
  - After 1.10, every visit opens here.
  - The heading "This visit" inside the panel goes: the panel is already titled Visit, and "This visit" names the record's checklist (the glossary).
- *Why:* The action row wraps at 1440, so More drops to a second line. The content is 942 px in an 874 px panel.
- *Kept safe:* The teal step follows the server's rules, Cancel asks first, and nothing is removed.
- *Measure:* Action rows 2 → 1 at 1440. Content 942 → 874 px or less. Controls (11) unchanged.
- *For the developer:* `VisitPanel.astro`, `panels.ts` fillCheck, `cal.css`.

**2.7 New booking: free times first**
- *Helps:* desk. *Effort:* M. *Risk:* low.
- *What changes:*
  - Order: Patient, Service, "Here now (a walk-in)", Day, Dentist, then the free times.
  - Time and Chair fold under "Another time or chair".
  - A filled time is never hidden: one line above Save reads "Tue 6 Oct · 9:30 am · Chair 2 · Change".
  - The blocked-time warning and "Book anyway" stay right above Save.
- *Why:* The free times sit under Time and Chair and overwrite them. The panel has 15 controls, and Save is below the first screen on a phone.
- *Measure:* Known patient 7 actions → 6. Save in the first screen at 390.
- *For the developer:* `cal/BookPanel.astro`, `panels.ts` openBook/bkNote, `free.ts`.

**2.8 One form for days off; a dentist's time away on her page**
- *Helps:* owner, desk, dentist. *Effort:* M–L. *Risk:* low.
- *What changes:*
  - The Dashboard's Block time panel becomes the one form for adding a closed day, a dentist away or a chair out of use.
  - Settings → Closed days keeps its list with Remove. Its Add opens the same panel.
  - A dentist's page lists her time away ahead, with "Add time away".
  - Block time leaves the everyday + New menu; it stays under the calendar's More.
  - **Who may add:** people who may change the schedule, as the Block time panel already requires. Every default role that adds closed days today still can. A custom role that may change clinic settings but not the schedule would lose it; we check whether any clinic has one and tell you.
  - **Scripts off:** today's whole-day form stays, used only when scripts don't run, with the same rule. The old form is retired only once the panel works from Settings and from a dentist's page.
- *Why:* Two forms write the same thing in the same words, and a dentist's leave never shows on her page.
- *Kept safe:* The blocking rules, the record of who blocked what, held reminders and online booking are unchanged. Nothing is texted, moved or cancelled. The comparison across all 7 roles is run again.
- *Measure:* Forms for adding a day off 2 → 1 (plus the scripts-off fallback). A dentist's time away on her page: not shown → listed.
- *For the developer:* `cal/BlockPanel.astro` (lift it out of `panels.ts`), `/api/schedule/blocks` (gate unchanged: `schedule.edit`), `ClosedSection.astro`, `_lib/closed-days.ts` (closed-add kept behind `<noscript>` and also checking `schedule.edit`; don't delete closed-add or readWholeDays early), `Clinic.astro`, `settings/people/[id].astro`. `blocks.ts` is unchanged.

#### The patient record

**2.9 Give the chart more of the first screen: a compact This visit checklist**
- *Helps:* dentist, desk. *Effort:* M. *Risk:* medium.
- *What changes:*
  - **Safety reminders stay unfolded**, each with its action:
    - health history not asked, or over a year old;
    - blood pressure out of range, or not taken;
    - consent to treatment not signed;
    - a consent form not agreed;
    - no privacy notice on file;
    - a medical clearance waiting.
  - Everything else still to do becomes one line: "Still to do: clinical note · treatment · next check-up · charge".
  - Done items become one row of labels.
  - One set of rules feeds both this checklist and the Dashboard's visit panel. Where they differ today, the stricter colour wins.
- *Why:* For a patient in the chair the chart starts at 922 px, below the 900 px first screen. The checklist is written twice, and the two copies disagree on colour.
- *Measure:*
  - **Maria's record** (in the chair today, with blood pressure not taken, consent not signed and no privacy notice on file, so three or four safety reminders stay open): the upper teeth of the chart inside 900 px at 1440. Reported at 1366×768 too. If her safety reminders still push the teeth below, we report that; we do not fold them.
  - **A patient with no safety reminders:** the chart's heading inside 900 px.
- *For the developer:* `_record/VisitStrip.astro`, `cal/panels.ts` fillCheck, a new pure rules module. Head chips untouched.

**2.10 Opening a tooth's panel: the tooth named, not picked again**
- *Helps:* dentist. *Effort:* M. *Risk:* low–medium.
- *What changes:*
  - A panel opened from a tooth on the chart (Add to plan, Treatment done, Clinical note) shows "Tooth 26 MO · Change" instead of the full picker of 32 teeth. Change opens the picker.
  - Panels opened elsewhere keep the picker.
  - In the chart's tooth menu, those three record actions move to the top.
- *Why:* Four panels each carry a full picker of 32 teeth and are 1187–1384 px tall at 1440 (up to 1731 at 390). The tooth menu is 801 px with 27 buttons, and its record actions are at the bottom.
- *Kept safe:* The server still reads and checks the tooth as now. Offline charting is untouched, and the chart itself changes only by addition.
- *Measure:* A panel opened from a tooth, 1187–1384 px → inside 900 px at 1440 (target). Record actions in the tooth menu: at the bottom of 801 px → at the top.
- *For the developer:* `_ui/ToothPick.astro`, `toothpick.ts`, `pickpanel.ts`, `TreatmentPanels.astro`, `NotePanel.astro`, `pickedTooth()`; Odontogram's palette `actions` prop (additive only).

**2.11 Type a patient in: a short first screen**
- *Helps:* desk. *Effort:* M. *Risk:* low–medium.
- *What changes:*
  - The first screen is name, birth date with age, sex and mobile. Middle name, suffix, email and HMO join the existing "more" fold.
  - **Health:** this form asks only the three lists it asks today.
    - Allergies stay open, with "None known".
    - Conditions and medicines are one line each ("None" · "Add …").
    - The answers are stored the way page 1 of the paper record stores them (2.15), so they fill the right boxes.
    - It does not add the paper record's other questions; those stay on the record's own health form, where the desk asks them today.
  - Privacy consent stays exactly as it is.
- *Why:* 76 visible fields, of which 2 are required.
- *Must ship with:* a list nobody opened is saved as "not asked", never "none". The Dashboard's checklist says what was not asked.
- *Measure:* About 35 controls leave the first screen. Save in the first screen at 1440: no → yes (target, with 1.28).
- *For the developer:* `new/type.astro`, `readHealthForm`, `fillCheck`, `data.ts` health_asked_at, `readPersonForm` flags.

**2.12 At most two doors per action on the record**
- *Helps:* dentist, desk. *Effort:* M. *Risk:* low.
- *What changes:*
  - The head's More menu keeps only New charge and Bring in past visits.
  - The checklist's "Also:" row goes.
  - Checklist lines for something missing today still open their panel directly.
  - There is one "Record a treatment" plus, on page 3.
  - The chart's tooth actions are unchanged.
- *Why:* 132 visible controls. A clinical note has 4 doors, and so do letters. All 8 items in More repeat a door that exists elsewhere.
- *Measure:* More items 8 → 2. Doors per action: at most 2.
- *For the developer:* `[patient].astro` More, `VisitStrip.astro`, Attached pluses. Check that visitId still posts and that PART_OF still opens the sheet. Checks: `paper-check.mjs`, `phone-e2e.mjs` E.

**2.13 Page 1: one form behind the boxes**
- *Helps:* desk. *Effort:* M. *Risk:* medium.
- *What changes:* Every box on page 1 opens one "Edit page 1" form in the paper's order, with the cursor in the box you tapped.
  - Details are saved only when details changed.
  - A new health-history version is written only when a health answer or the birth date changed.
  - "Checked with the patient, no change" stays its own act.
  - If someone else changed the health history meanwhile, nothing is saved, and everything typed comes back.
- *Why:* 33 boxes open two different forms. Date of birth and Age open the health form, while the boxes beside them open Edit details.
- *Kept safe:* Saving a phone number never claims the health history was checked.
- *Measure:* Forms behind page 1's boxes 2 → 1. A save of details only writes no health version (checked).
- *For the developer:* FormCell .pf-go, `updateDetails`, PaperHistory intent=health, `rebasePaper`, `recheckHealth`; `paper-check.mjs`.

**2.14 Step-by-step forms at the desk: one press for the usual case**
- *Helps:* desk. *Effort:* M. *Risk:* low.
- *What changes:*
  - When the chooser named "their phone" and no ticked form needs the clinic's part or a dentist, Continue says "Show the QR code" and goes there.
  - Forms nobody suggested fold behind "Add another form". Suggested forms stay in view.
- *Why:* Sending only the consent to treatment takes 7 desk clicks over 5 screens, and the Check screen asks again for the device.
- *Kept safe:* Your 29 Sep answers are unchanged: staff tick the forms first, and forms are signed only after the named dentist explains them.
- *Measure:* 7 clicks over 5 screens → about 5 over 4 (the Check screen is skipped).
- *For the developer:* `patients/intake/[intake].astro`; `saveChecklist` + `goLive`.

**2.15 Every way of asking the health history fills page 1**
- *Helps:* desk, patient, dentist. *Effort:* L. *Risk:* medium.
- *What changes:*
  - **Each place keeps the questions it asks today; only where the answers land changes:**
    - The desk's typed form keeps its three lists (2.11).
    - The desk poster and step-by-step forms keep every condition they ask today. The list stays visible, with "None of these" first.
    - Each answer lands in the matching box on page 1 where the meaning is the same. The rest shows as the patient's own words.
  - **The paper record's other questions** (former dentist, physician, transfusions, pregnancy, nursing, the pill) stay where they are asked today, on the record's health form, and are not added to Add patient or the patient forms.
  - **The privacy notice:** the desk already asks those questions on the record, and the current notice does not name them. That gap already exists and is on your lawyer's list; this plan does not widen it.
- *Why:* The health history is asked four ways. After a patient is typed in, page 1 still shows 24 "Not on file / Not asked yet" boxes, so the desk asks again.
- *Measure:*
  - After typing a patient in, the allergies, conditions and medicines boxes are filled; the 24 "Not on file / Not asked yet" boxes fall to only the questions nobody asked.
  - On a patient added from the poster or step-by-step forms, boxes reading "Not asked yet" although the patient answered: 0.
- *For the developer:* `patient-forms-def.ts` STEPS/FORM_VERSION, `intake-def.ts`, `paper-history.ts` (canonicalWord, pregnancyTwin). New form versions, with the old ones still readable.

**2.16 One rule for chart numbers**
- *Helps:* desk, maintainer. *Effort:* M. *Risk:* low.
- *What changes:*
  - Every way of adding a patient continues the clinic's own numbers (SR-0144 → SR-0145), including patients who book online.
  - Typed or imported numbers still win, and existing numbers never change.
  - Two empty, unused tables are dropped.
- *Why:* There are four ways to add a patient and three numbering rules. Session Road on one test copy now carries SR-, P- and W- numbers side by side. Today's step-by-step forms gave P-0001 beside the clinic's SR-0142…0144, and a web booking fails after a patient is deleted by hand.
- *Measure:* Numbering rules 3 → 1. A web booking after a hand-deleted patient: fails → works.
- *For the developer:* `nextChartNos` (import.ts), `patient-add.ts`, `api/schedule` nextChartNo, `api/bookings` 'W-' count+1; `form_template`/`form_response` (refuse to drop if any rows); `refused.ts`.

#### Money

**2.17 Checkout: one payment form, and "Save and take payment"**
- *Helps:* desk. *Effort:* M. *Risk:* medium.
- *What changes:*
  - One payment form on New charge and on the statement: method, amount, reference, BIR receipt number (always visible), and the date folded.
  - At the total, "Save and take payment" (teal). The first tap only opens the payment fields, with the amount filled in. The button then names what will be recorded: "Save and record ₱1,200 · Cash".
  - "Save, pays later" is quiet.
- *Why:* "Paid now" sits below the first screen (y=922 at 1440), and the BIR number has 3 places to type it.
- *Kept safe:*
  - The statement and the payment are saved together, or neither is.
  - Record payment stays green, as you asked on 26 Sep.
  - Every fact line and the not-BIR line stay.
- *Measure:* Places to type the BIR number at checkout 3 → 1. The payment choice: below the first screen → at the total.
- *For the developer:* `finances/new.astro`, `[invoice]/index.astro`, `recordPayment`, `saveStatement(…, after)`, form keys, `PAYOR_METHODS`.

**2.18 HMO and PhilHealth claims come from the statement, and the payor's money is recorded once**
- *Helps:* desk, owner. *Effort:* L. *Risk:* medium.
- *What changes:*
  - Saving a statement with an HMO or PhilHealth part creates its draft claim, linked to the statement. It is filled in with the patient, the payor, the payor's part and the card number. The approval code is filled in only when exactly one approved LOA covers the work.
  - The claims list shows the statement number. New claim stays only for old visits with no statement.
  - Mark paid records the payor's payment on the statement in the same step, with the day the money arrived, the reference and the BIR receipt box. If the payment is refused, nothing is saved.
  - Voiding a statement with a filed claim is refused (as in 1.2).
  - What happens when the payor pays less is question 14 (3.4).
- *Why:* About 26 taps from LOA to money received, and the amount is typed 4 times. 0 of 4 claims are linked to their statement. Mark paid records no money, so the desk enters the same cheque twice, or the two records disagree.
- *Kept safe:* Statements are never edited, there is one balance, and claim amounts stay with the people who see money.
- *Measure:* Amount typed 4 times → 2. Claims linked to their statement: 0 of 4 → every new one. About 26 taps → about 13 (estimate).
- *For the developer:* `finances/_claims.ts`, `_Claims.astro`, `src/lib/invoices.ts`, `record-extra.ts`, `hmo_claim.invoice_id`, `recordPayment()`.

**2.19 A payment plan is not money owed today**
- *Helps:* desk, owner, patient. *Effort:* M. *Risk:* medium.
- *What changes:*
  - Wherever a balance shows, the plan sits beside it: "₱54,000 · on a plan · ₱3,000 due now (month 4 of 18)".
  - A patient who is up to date is not offered the "balance" text.
  - A plan's statement fills in the instalment, not the whole balance.
  - New plan takes the down payment in the same step.
- *Why:* A braces patient who is up to date shows the whole remaining amount as owed in five places, and the desk retypes the instalment every month.
- *Kept safe:* The one balance is unchanged, and the total is always shown.
- *Measure:* Places showing a plan's whole remainder as owed today, with nothing beside it: 5 → 0. Instalment retyped each month → filled in.
- *For the developer:* `planState` to a pure module, `text-templates.ts`, `defaultAmount`, Finances, the Patients list, panels.

**2.20 The owner sees earlier drawer closes**
- *Helps:* owner. *Effort:* S–M. *Risk:* low.
- *What changes:*
  - "Earlier closes" on Close the day covers the last 14 days:
    - who closed;
    - counted against expected, with any difference;
    - the note;
    - every close, when there were several.
  - "Not closed" shows only for a day with payments or visits.
  - The Collected tile turns amber only when something is off.
  - Whether two branches show together is question 10.
- *Why:* Nothing shows a past close today, although the page promises the figures are "kept for the owner". This is a fix for a gap, not a simplification.
- *Measure:* Past closes visible: 0 days → 14.
- *For the developer:* `finances/close/index.astro`, `day_close`, `varianceWords`.

**2.21 One place for one patient's money: the record's Account**
- *Helps:* desk. *Effort:* M. *Risk:* low.
- *What changes:*
  - Each unpaid row on the record's Account sheet gets a quiet "Pay", which opens that statement's payment form. The desk chooses the statement; it is never picked for them.
  - The Finances single-patient view sends you here.
  - Search in Finances stays.
- *Why:* A patient's statements are listed by two separate screens, and neither takes a payment.
- *Kept safe:* A money lookup is logged as a view of the record.
- *Measure:* Places listing one patient's statements 2 → 1. Record payment on arrival: below the first screen (y=949) → in view.
- *For the developer:* `[patient].astro` #money, `finances/index.astro ?patient=`.

#### Settings and getting started

**2.22 One setup checklist for the owner, the Dashboard and Flossify's operator**
- *Helps:* new owner, operator. *Effort:* M. *Risk:* low–medium.
- *What changes:*
  - **One list of what "ready" means:** about, hours, a dentist with days, check your prices, PRC on file, HMOs, a photo, Data Protection Officer named, then "Show on Find a clinic".
  - **"Needed to list" is still the same three** (About, hours, a dentist) and counts on its own. The rest are recommended. A clinic one step from listing no longer reads "2 of 5 done".
  - **It is shown as a card at the top of Clinic settings.** This is the welcome landing after sign-up (1.24).
  - **On the Dashboard,** one slim quiet line while the clinic is not listed, with "Keep it off Find a clinic" to stop the reminder.
  - **The operator** sees the same "N of M".
  - Whether the Data Protection Officer is required is question 7.
- *Why:* Four lists disagree about one clinic, and none of them names the Data Protection Officer. A first weekend takes 10 or more saves across 7 sections and 2 pages, with no single path. After the first day, nothing on the Dashboard mentions listing.
- *Measure:* Definitions of "ready" 4 → 1. A listed clinic's calendar still starts at 613 px.
- *For the developer:* `setupState()` in src/lib; `missingForListing` as a view of it; admin `stepsOf` → setupState through a new `admin_*` migration.

**2.23 Split Clinic profile: what patients see, and how the day runs**
- *Helps:* owner. *Effort:* M. *Risk:* medium.
- *What changes:*
  - **"Your public page":** listing, addresses, contact details, about, founded, walk-ins, PhilHealth, HMOs and photos.
  - **"How the day runs"** (your 044 words): booking mode, chairs, the text switches, time between visits, held reminders and the consent question.
  - **The TIN and BIR branch code** move beside Services & prices, as "On your statements (not shown on your page)". The BIR sentence stays word for word.
  - Each part has its own Save, and each save changes only its own part.
- *Why:* 2976 px, 22 settings and one Save, mixing the public page, daily operations and tax numbers.
- *Kept safe:* A save from one part can never unlist the clinic, remove its HMOs, switch off PhilHealth claims or reset reminders. Old tabs and links keep working. We will tell you where "How the day runs" now lives.
- *Measure:* One section of 2976 px and one Save → two sections of about 1,250 and 1,300 px (estimates), each with its own Save.
- *For the developer:* `ProfileSection.astro`; `_lib/profile.ts` saveClinic with presence flags like `has_work_choices`; the 017 accreditation trigger; `choices-check.mjs`, `profile-check.mjs`. Audit note: names proposed were "How you work", "How the day runs" and "Appointments & reminders"; we kept the owner's own.

**2.24 Ten settings sections to seven**
- *Helps:* owner. *Effort:* M. *Risk:* low–medium.
- *What changes:* The seven sections are:
  1. Your public page
  2. Hours and closed days
  3. How the day runs (with clinic tablets)
  4. Services & prices (with the TIN for statements)
  5. People (with Roles inside)
  6. Privacy
  7. Your Flossify plan

  Parts that apply to every branch are labelled "All your branches".
- *Why:* 10 equal sections, and nothing says which apply group-wide. Roles counts "Dentist · 3 people" across the group, while People counts this branch.
- *Kept safe:* Each part keeps its own permission.
- *Measure:* Sections 10 → 7. The phone's list (630 px) → re-measured.
- *For the developer:* `SECTIONS`, `settings/index.astro`; per-form tracking of unsaved changes.

**2.25 One page about yourself**
- *Helps:* owner, admin. *Effort:* M. *Risk:* medium.
- *What changes:*
  - For people who manage staff, My page holds Edit details (with your role read-only), days and hours, public profile and PTR.
  - Your own person page in Settings sends you to My page.
  - Appearance stays on My page, because it is the only control that hands the light/dark choice back to the device.
- *Why:* 4 of My page's 7 panes repeat your person page. The PTR and the public profile each have two forms.
- *Kept safe:* Nobody changes their own role. The audit lines are unchanged. A forged attempt from a dentist is refused.
- *Measure:* Changing your own mobile, 4–5 clicks over 2 pages → 3 on 1. My page 2645 → about 1850 px.
- *For the developer:* `account/index.astro`, `settings/people/[id].astro`, `personAction`, `saveBio`, shared BioForm/PtrFields.

**2.26 Services & prices: edit one service at a time**
- *Helps:* owner. *Effort:* M. *Risk:* low–medium.
- *What changes:* One Service panel for both Add and Edit. Tapping a row edits that service only. "All prices" stays as the quiet second way.
- *Why:* Changing one price opens and saves 70 fields, and a misspelt name cannot be fixed.
- *Kept safe:* A rename changes the label only. Past treatments and statements keep the old name, and the panel says so.
- *Measure:* Fields saved for one price change 70 → about 7. The panel's 3313 px → one panel height.
- *For the developer:* `FeesSection.astro`, `_lib/fees.ts`; backfill `procedure_done.name`.

**2.27 Who sees money: one pane, one sentence**
- *Helps:* owner. *Effort:* M. *Risk:* low.
- *What changes:*
  - A person's page gets "What {name} can do here", plus one switch only the owner can use. It shows only when the person's role doesn't already see amounts.
  - Add member loses its money tick.
  - Questions 8 and 9 settle the rest.
- *Why:* The money switch has 3 wordings. A hidden "can edit records" setting exists with no screen anywhere.
- *Measure:* Wordings 3 → 1. Add member controls 20 → 19.
- *For the developer:* `people/[id].astro`, `RoleField.astro`, `permsOf`; stop writing `can_manage_staff`.

**2.28 One account for someone who works at two branches**
- *Helps:* owners with more than one branch. *Effort:* M. *Risk:* medium.
- *What changes:*
  - In a group with more than one branch, a person's page gets "Works at", with a tick per branch.
  - Ticking a branch keeps the same password. Days are set per branch. Money stays off at the new branch until an owner turns it on.
  - For someone already in the group, Add member offers "Add them to {branch}".
- *Why:* Dr. Sarmiento cannot be added at Session Road at all without a second account, and that account could not reset its password by text.
- *Kept safe:* The rules on who may change whom still apply. Each account still has its own email and mobile across the service. Every tick is recorded.
- *Measure:* Adding a group member at a second branch: impossible without a second account → one tick.
- *For the developer:* `_lib/people.ts` addPerson, `staff_access`, `mayManage`/`mayGive`.

**2.29 One sign-in code for the clinic door and unlock**
- *Helps:* maintainer. *Effort:* S. *Risk:* low.
- *What changes:* One shared piece of code for these two sign-ins. No words, limits or audit lines change, and a before-and-after check proves it. It comes before 2.30, which uses it.
- *Measure:* Copies of the door's sign-in code 2 → 1. The door check is identical before and after.
- *For the developer:* `[clinic]/sign-in.astro`, `auth/unlock.astro`, new `src/lib/entry.ts`; `door-check.mjs`.

**2.30 Sign in with a username on a new device, on one card**
- *Helps:* staff without an email. *Effort:* M. *Risk:* medium.
- *What changes:*
  - The email door's first field becomes "Email or username".
  - Without an "@", the same card asks for the clinic's address and signs in at that clinic only.
  - Add member gets "Copy sign-in details": the address and username, never the password.
- *Why:* Measured at 8 actions over 4 screens.
- *Measure:* 8 actions over 4 screens → 4 on 1. The entrance still fits 1440×900.
- *For the developer:* `auth/login.astro`, `clinicDoor()`, the shared sign-in from 2.29. Audit note: a recount gave 6 actions over 3 screens.

**2.31 Sign-up asks "Do you treat patients at this clinic?"**
- *Helps:* owner, patients. *Effort:* M. *Risk:* medium.
- *What changes:*
  - One Yes/No on sign-up, with Yes as the default.
  - With No, there is no public dentist profile, no column on the calendar and no PRC queue entry.
  - The owner can switch it later, in either direction.
- *Why:* Today every new owner is published as a general dentist, whether or not they treat.
- *Measure:* Owners published as dentists without being asked: every sign-up → only those who say Yes. Sign-up fields 12 → 13.
- *For the developer:* A new migration replacing `signup_clinic()` (006 untouched); `roleLocked`.

#### Behind the scenes (makes every later change cheaper)

**2.32 Apply the glossary to every screen**
- *Helps:* everyone. *Effort:* M. *Risk:* low.
- *What changes:* Screens not already touched in phases 1 and 2 are swept to the glossary (1.8), with the same exclusions: consent words and titles, the privacy notice, the paper record's labels, printed papers (without your agreement) and the not-BIR line. On staff screens, "New booking" is the one label for the booking panel and "New charge" or "Charge" for charging. Patient pages keep "Book a visit".
- *Why:* The workspace says visit 44 times, booking 31 and appointment 9. Ten doors open the booking panel under five labels.
- *Measure:* Labels that open the booking panel 5 → 1. "Appointment" on staff screens 9 → 0.
- *For the developer:* The words check from 1.8; `test:consent` and `consent:hash` unchanged.

**2.33 One way to build each kind of button and label**
- *Helps:* maintainer. *Effort:* M. *Risk:* low–medium.
- *What changes:* No visible change; less to maintain. Today the same button is built two ways, and the same small label seven ways. After this, each is built once, and the special looks (the paper record, the frosted glass, the staff entrance, print, the SwiftCare sample) keep their own.
- *Kept safe:* The offline sign-out warning stays as it is. Styles are compared before and after on every kind of page.
- *Measure:* Button systems 2 → 1. Label styles 7 → 1. One shared icon style, defined in 21 places → 1.
- *For the developer:* `global.css` .btn/.ws-btn, pills, callouts; the `pt-` prefix clash.

**2.34 Build the paper record as paper**
- *Helps:* maintainer. *Effort:* M. *Risk:* medium.
- *What changes:* No visible change on the record; less to maintain. The sheets are drawn directly as paper instead of as cards that are then made to look like paper. One visible change goes ahead only with your yes (question 11): dropping the visit panel's section colours.
- *Measure:*
  - The record check is identical (lowest 4.68:1), and page 1 still prints on one A4 sheet.
  - Style rules whose only job is to undo other rules 35 → 0.
  - Unused styles 70 → 0.
- *For the developer:* `record.css`, `global.css`, `.hue-*`; raw colours to tokens on screens, with print kept fixed.

**2.35 One shared layout for the printed pages**
- *Helps:* maintainer, desk. *Effort:* M. *Risk:* medium.
- *What changes:*
  - Seven print pages share one layout and header. The QR poster is left alone, because it must still scan.
  - The A4 Treatment record uses the same drawing as page 3 and gains the not-BIR line.
- *Kept safe:* Every paper's printed text is recorded before and after (PRC, PTR, TIN, the consent checks). A consent printout keeps the clinic's details as they were when it was signed.
- *Measure:* Separate print stylesheets 8 → 1 shared, with the poster kept apart. Ways the Treatment record is drawn 2 → 1. The not-BIR line on the record's prints: no → yes.
- *For the developer:* The 8 print pages; Letterhead is not reused.

**2.36 One recipe for the frosted glass**
- *Helps:* maintainer. *Effort:* L. *Risk:* medium.
- *What changes:* No visible change. The frosted panels on the photo pages are built from one shared recipe, set once for light and dark, instead of separate copies. The home page's glass over the film, the staff entrance and the clinic-cover rules stay separate, and nothing becomes more see-through.
- *Measure:* About 1,770 lines in about 6 copies → 1 copy. Every line re-measured; the lowest today are 4.7:1 on the home page and 5.3:1 on a clinic page.
- *For the developer:* websites, find, start, me/_Door, me/_Shell, coverage, clinic-glass.css.

#### Last in phase 2

**2.37 The walkthroughs: record them once, after the screens they show have changed**
- *Helps:* prospective owner, patient. *Effort:* S. *Risk:* low.
- *What changes:*
  - After questions 5 and 6, and after the booking (2.1, 2.2), sign-up landing (1.24, 2.22, 2.23) and Dashboard (2.4, 2.5) work, we record the two walkthroughs once, or take the captioned screenshots, as you choose.
  - If you also say yes to question 15 (the top bar), we record after that change, so it is done once.
  - Until then, the videos show the old top bar.
  - Captions stay the same as the steps on the page, and they still play for everyone.
- *Why:* The videos were recorded on 26 Sep, and the booking, sign-up, Dashboard and bar items above all change what they show. Recording now would mean recording again.
- *Measure:* Walkthroughs match the live screens: no → yes.
- *For the developer:* `scripts/record-walkthroughs.mjs`, `public/video/register-*.mp4` and posters; or `scripts/shoot.mjs` for screenshots.

### Phase 3: bigger changes that need your yes

**3.1 One set of patient forms: the desk poster starts the step-by-step forms** (question 12)
- *Helps:* desk, patient, maintainer. *Effort:* L. *Risk:* medium–high.
- *If yes:*
  - Patients see the same poster questions and the same strict consent.
  - Behind it there is one set of forms, one public page and one "Forms to add" list.
  - Forms started at the desk still make the record at Send, as you chose.
  - Every poster protection carries over: limits, the 30-day deletion and old references.
- *Why:* Two QR systems overlap by about 3,900 lines of code, with two queues and two kinds of reference.
- *Kept safe:* The forms stay closed on the live site until the privacy notice covers them.
- *Measure:* Public form pages 2 → 1. Old QR- references still open.

**3.2 Home page: six pages folded into four** (questions 3 and 4)
- *Helps:* prospective owner, patient. *Effort:* M. *Risk:* medium.
- *If yes:*
  - "One price. Everything in it.": the price beside the 8 features, keeping every clause that states a limit honestly.
  - "For patients": four links.
  - Partners, as now.
  - "How to start": the two walkthroughs with their steps.
  - The opening and Know the team are unchanged.
  - The header links held back in 1.19 go with the fold.
- *Why:* The features are told twice and the patient steps three times. 765 words, 34 headings and 7003 px on a phone.
- *Measure:* About 450 words, about 12 headings, and about 2,500 px shorter on a phone. The frosted glass is re-measured over the film.
- *For the developer:* Audit note: one count gave 713 words today.

**3.3 One top bar on every public page, with My visits on it** (question 15)
- *Helps:* patient. *Effort:* S. *Risk:* low.
- *If yes:*
  - Find a clinic · My visits · Pricing everywhere, except a clinic's own site.
  - Visible PhilHealth & HMO links on Find a clinic and in booking.
  - A "Clinic websites" link on sign-up.
- *Why:* Two different bars. From the home page, My visits takes 3 taps and 2 page loads on a phone.
- *Measure:* My visits from the home page: 3 taps → 1 click on a desk and 2 taps on a phone.

**3.4 When an HMO or PhilHealth pays less** (question 14)
- *Helps:* desk, owner. *Effort:* M. *Risk:* medium–high.
- *If answered:*
  - The statement and the claim show one plain line: "Medicard did not pay ₱900 of this statement."
  - The desk's choice is recorded as a new line with a reason, never as an edit.
  - For PhilHealth, nothing goes past what its rules allow.
- *Why:* Today a denied or cut part stays "from Medicard" on the statement for ever, unless the owner voids it and charges again.
- *Measure:* A denied part with no next step → one line and the desk's recorded choice. The last balance still matches the one balance definition.

**3.5 Consent to treatment: once per visit or once per record** (question 13)
- *Helps:* everyone. *Effort:* L. *Risk:* high.
- *If "once per record":*
  - Every new signing goes through one hand-over.
  - The patient still signs with a finger on the clinic's tablet.
  - The desk's steps are no longer than today's.
- *If "per visit":* both signing mechanisms stay, and we stop at 1.5.
- *Kept safe:* This happens only after the dentist and your lawyer have read the consent to treatment (1.6). Every existing signature stays exactly as signed. At no point is the live site left with no way to record this consent.
- *Measure:* Signing mechanisms 2 → 1. The desk's steps counted before and after; they must not rise.

**3.6 The record: one quiet "Edit" per section instead of 53 plus marks** (question 16)
- *Helps:* dentist, desk. *Effort:* M. *Risk:* low–medium.
- *If yes:* The boxes still open with one tap, but the plus marks become one Edit per section, like a printed form.
- *Can be done without waiting:*
  - Remove two hidden duplicate headings.
  - Make Record consent quiet, but only together with an amber "No privacy consent on file" label in the record's head.
- *Measure:* Plus marks 53 → one Edit per section. Taps for common edits must not rise.

**3.7 Finances: the tiles become the switches** (question 17)
- *Helps:* desk, owner. *Effort:* M. *Risk:* low–medium.
- *If yes:*
  - Three tiles that are also switches: Today, Still to pay, HMO claims.
  - One "This month" line, with All and Void one tap away.
  - This changes your 26 Sep layout.
- *Why:* The tiles, the filters and the tabs repeat each other.
- *Measure:* 12 controls before the first row at 1440 → fewer (re-measured). The list starts at 556 px at 390 → higher.

**3.8 Correct a statement in one step: "Replace"** (question 20)
- *Helps:* owner, desk. *Effort:* M. *Risk:* medium.
- *If yes:*
  - One reason, then a new charge already filled in.
  - On saving, the old statement and its payments are voided and the payments moved, with "Replaces / Replaced by" on screen and on paper.
  - It is still a void plus a new statement, never an edit, and it keeps the checks from 1.2 and 2.18.
- *Why:* Today it takes about 14 taps, 2 typed reasons and 3 screens.
- *Measure:* About 14 taps, 2 reasons and 3 screens → 1 reason and one filled-in charge on 1 screen.

**3.9 Page 2 of the record: empty consent paragraphs on one line on screen** (question 23)
- *If yes:* On screen, empty paragraphs share one line in the paper's order, keeping their "see …" links. Print is unchanged.
- *Measure:* 380 px → one or two lines at 1440. 660 → about 120 px on a phone.

**3.10 This year's Philippine holidays in one press** (question 18)
- *If yes:* A list under Closed days, with regular holidays ticked. One quiet button adds them, and each can be removed. Flossify's team enters the dates from each year's proclamation.
- *Why:* About 14 separate adds a year today.
- *Risk:* A wrong date closes online booking on a working day.
- *Measure:* About 14 adds a year → 1 press.

**3.11 A dentist's day off opens on the whole clinic** (question 25)
- *If yes:* This applies only to today, when no dentist was asked for and she has no visit. On every other day, your 3 Oct rule holds.
- *Measure:* Presses of Everyone on a day off: every time → 0.

**3.12 My visits, once signed in: the patients' top bar instead of a side bar** (question 24)
- *If yes:* The privacy notice is one tap away, Sign out stays secure, and Confirm stays the one teal button.
- *Measure:* Layouts a patient meets 3 → 2.

**3.13 Clinic websites: one next step** (question 19)
- *Once answered:*
  - The one teal button is the real way to ask for a website.
  - The price comes from billing and is labelled "not final yet".
  - One line says how a website differs from the clinic page each clinic already has.
- *Measure:* Ways to ask for a website on the page: 0 → 1.

**3.14 Should dentists without Finances see the claims list?** (question 21)
- *Measure:* Pages drawing the claims list 2 → 1, or 0 for staff without Finances.

**3.15 The "not a BIR invoicing system" line: always on paper, once on screen** (question 22)
- *If yes:* It stays word for word on every paper. On screen it appears only on New charge.
- *Measure:* On-screen copies 5 → 1. About 17 fewer words on 2 of the 3 Finances screens.

---

## 5. Questions for the owner

Marked **[lawyer]** or **[accountant]** where they should answer with you.

**A. Please answer these first: they hold up work in phases 1 and 2.**

1. **The attached "Treatment" sheet on the record will hold the plan, lab cases, LOAs and payment plans; work done moves to page 3 (1.33). What should it be called?** "Treatment plan and lab" / "Treatment plan, lab cases and LOAs" / keep "Treatment".
2. **Calls, Texts and Tasks: small links under Dashboard in the sidebar, which changes the four-tab sidebar, or only at the foot of the inbox (1.13)?** Sidebar / inbox only.
3. **The home page's six pages are your layout from 25 Sep. They describe the clinic features twice and the patient steps three times. May we fold Services, How it works, Pricing's "Included" list and How to register into three pages: "One price. Everything in it.", "For patients" and "How to start"?** The opening, Partners and Know the team stay. This decides 3.2 and part of 1.19. Yes / no.
4. **Only if your answer to 3 is no: the section "How to register" sits on a page that says patients need no account. May it become "How to start", with "As a clinic" and "As a patient: book a visit"?** Yes / no.
5. **The two home-page walkthroughs were recorded on 26 Sep and already show the old top bar. Keep them as videos, re-recorded once after phase 2 and after each later change to those screens, or replace each with three or four captioned screenshots that can be retaken in one step (2.37)?** Videos / screenshots.
6. **"Your clinic, in the Web" and "Open your clinic in the web": spell "web" the same way in both?** If the button's words change, the clinic walkthrough's first caption changes too, so we decide this before recording (2.37). Same spelling / leave both as they are.
7. **[lawyer] The law (RA 10173) expects every clinic to name a Data Protection Officer, and a clinic's public page says "not named here yet" until one is. Should naming the officer be required before a clinic can be listed on Find a clinic, or only recommended and kept in view until done (2.22)?** Required / recommended.
8. **Who sees money: should it come from a person's role only, or from the role plus an "also sees money at this branch" switch you set per person?** For example, a secretary who sees claim amounts at Session Road but not at Marikina Heights needs the switch (2.27). Role only / role plus switch.
9. **Today one database setting can stop a staff member editing patient records at one branch. No screen sets it, and nobody uses it. Add a switch for it on the person's page, or remove it (2.27)?** Add a switch / remove it.
10. **You own two branches. Should Close the day show both branches' drawer counts together, or do you switch branch to see each (2.20)?** Together / switch branch.
11. **The visit panel on the Dashboard colours each of its sections (teal, violet, blue, rose and green). On 2 Oct you asked to drop colour groups on the record. May we drop them in the visit panel too, keeping red for allergies and amber for warnings (2.34)?** Yes / no.

**B. For the phase 3 changes.**

12. **Patients can fill in their own forms two ways: the desk poster anyone can scan, or "Add patient, step by step", where the desk ticks the consent forms and makes a code for one patient. Should the poster start the same step-by-step forms, so there is one set of forms and one list (3.1)?** Yes / no.
    - If yes, when should a poster patient's record be made?
      - **At Send:** quicker, but anyone who scans the poster creates a record with no desk check. The 500-form limit per poster exists because of floods.
      - **When the desk adds it:** as now, so the desk stays in control.

    At Send / when the desk adds it.
13. **[lawyer] Should a patient sign the consent to treatment on the clinic's tablet at every visit, as now, or once on their record and again only when the words change (3.5)?**
    - Signing once gives up a record, for each visit, of which planned treatments the dentist explained that day.
    - Today's signing keeps that record, and the calendar asks for a new signature when a visit's treatment changes.

    Your lawyer decides. Every visit / once per record.
14. **When an HMO pays less than the statement expected, may the desk move the unpaid part onto what the patient owes (confirming each time, with a reason), or does it stay the clinic's to chase from the HMO or write off (3.4)?** Move it / keep it with the clinic.
    **[lawyer or accountant]** For PhilHealth, its own rules may forbid billing the patient for what it does not pay. Please have them answer that half.
15. **The public top bar can hold three links. Should it be Find a clinic · My visits · Pricing on every public page, with PhilHealth & HMO and Clinic websites linked from the pages where they come up? And should the third link say "Pricing for clinics", so a patient does not read it as treatment prices (3.3)?** Yes, "Pricing" / yes, "Pricing for clinics" / another three.
16. **Each box on the paper record that can be changed has its own small plus: 53 on one patient. Would you rather have one quiet "Edit" per section, like a printed form, with the boxes still opening with one tap (3.6)?** Yes / no.
17. **Finances: may the three tiles at the top become the switches between Today, Still to pay and HMO claims, replacing the tabs and the row of filters from your 26 Sep layout (3.7)?** Yes / no.
18. **Should Flossify keep each year's Philippine holidays up to date, so a clinic can close on them with one press (3.10)?**
    - Yes means our team enters the dates from each year's proclamation.
    - Eid is announced late, and a wrong date would close online booking on a working day.

    Yes / no.
19. **Clinic websites: how does a clinic ask for one, and what does it cost (3.13)?**
    - Cost: part of ₱800 / an add-on price / quoted per clinic.
    - How they ask: email / phone / "Open your clinic".
20. **May the owner or admin "Replace" a wrong statement in one step (3.8)?** The old statement stays, voided with a reason, and its payments move to the new one, marked as moved. Yes / no.
21. **Should dentists and assistants without Finances still see the HMO and PhilHealth claims list, with patients, status and notes but no amounts (3.14)?** Yes / no.
22. **[accountant] Flossify prints "Flossify is not a BIR-registered invoicing system…" on every statement and acknowledgment. May we keep it on every paper and show it on screen only once, on New charge beside Save (3.15)?** Yes / keep it on every screen too.
23. **Page 2 of the record: on screen, put the consent paragraphs that have no form yet on one line, in the paper's order, keeping their "see …" links (3.9)?** The printed record would still show all ten. Yes / no.
24. **When a patient has signed in to My visits, should the page keep the public top bar (with their number, the privacy notice and Sign out added) instead of today's clinic-style side bar (3.12)?** Yes / no.
25. **On a day when a dentist has no patients booked with them, should their Dashboard open on the whole clinic's day instead of their own empty column (3.11)?** "Mine" stays one tap away. Yes / no.

**For your information (no answer needed):**
- **Please act on this one.** The clinic tablet's per-visit signing already offers the consent to treatment on the live site, although it is still marked unreviewed elsewhere. Please have your dentist and lawyer read it first (1.6).
- **PRC (1.4).** Done on 6 Oct. The line starting `046:` in that day's deploy log on Render says whether any dentist went back to "PRC check pending", and names the clinics. Please send it: a session cannot read the live database.
- **Add patient (1.11).** "Easiest" appears only beside a way that is open. On the live site the poster stays under Patients → More until the privacy notice covers it.
- **Texts (1.8, done in 1.18).** The Messages page is renamed "Texts".
- **Bookings in the browser (1.15).** The browser no longer keeps a list of bookings. Undo, then My visits, replace it.
- **In the lobby (1.34).** "In the lobby" is no longer offered; Arrived covers it.
- **Partners (1.44).** The home page shows six partner clinics at a time, rotating daily. Every listed clinic stays on Find a clinic.
- **Clinic sites (2.3).** A booking started on a clinic's own site stays on that site.
- **Block time (2.8).** Block time leaves the + New menu; it stays under the calendar's More and in Clinic settings. A custom role that may change clinic settings but not the schedule can no longer add closed days. Default roles are not affected.
- **Chart numbers (2.16).** Patients who book online get the clinic's own chart numbers (SR-0145) instead of "W-…". The visit itself still shows it was booked online. Tell us if you want "W-" kept.
- **How the day runs (2.23).** It moves to its own settings section.
- **TIN and BIR (2.23).** The TIN and BIR branch code move beside Services & prices, as "On your statements (not shown on your page)".
- **My page (2.25).** Your own person page in Clinic settings becomes My page.

## 6. Baseline measurements

Heights are in pixels. Controls and words are at 1440 unless marked. Some screens were measured by two auditors who counted differently; both numbers are shown. Patient-side and Dashboard heights include the development-only "Prototype" banner (about 100–130 px).

| Screen | Height 1440 / 390 | Controls (first screen / total) | Teal | Words |
|---|---|---|---|---|
| Home (film) | 4472 / 7003 | 9 / 24–25 | 3 (max 1 per screen) | 765 |
| Find a clinic | 1745 / 3150 | 34–36 / 56–58 | 0 | 484 main (523 page) |
| Clinic page | 1475 / 3087 | 16 / 20 | 2 (1 per screen) | 395 main (434 page) |
| Booking, first step | 900 / 1143 | 21 / 22 (another count 10 / 11) | 1 | about 100–139 |
| Booking, When step (live clinic) | — | 72 total; 65 times | 1 | — |
| My visits door | 900 / 1040 | 11 / 12 | 1 | 121 |
| My visits, signed in | 900 / 969 | 12 / 13 | 1 | 82 |
| Coverage | 1336 / 2797 | 8 / 12 | 0 | 524–563 |
| Clinic websites | 1617 / 2323 | 10 / 10 | 1 | 377 |
| Privacy notice | 2847 / 4442 | 13 | 0 | 620 |
| Sign-up | 1305 / 2191 | 18 / 24 | 1 | 288 |
| Clinic's sign-in door | 900 / 1164 | 11 / 12 | 1 | 82 (button top y=843 at 390) |
| Email sign-in | 900 / 1184 | 14 / 15 | 1 | 83 |
| Dashboard (owner) | 1144 / 2089 | 33 / 39 | 1 | 247 content (303 page) |
| Visit panel | content 942 in an 874 panel | 11 | 1 | 107–118 |
| Patient record (adult, Maria) | 4447 / 7179; chart starts at 922 | 28–37 / 132–180 | 2–3 | about 960–1000 |
| Patients list | 900 / 1213–1397 | 14 main (29 / 30 page) | 1 | 140–221 |
| Add patient chooser | 981 / 1145 | 6 main (18 / 20 page) | 1 | 111–167 |
| Add patient, typed | 2726 / 5053 | 13 / 24 main (25 / 46 page); 76 fields | 1 (below fold) | 331–387 |
| Finances list | 900 / 1398 | 15 / 15 main | 1 | 140 |
| New charge (empty) | 1075 / 1852 | 10 main | 1 | 236 |
| Statement (unpaid) | 1082 / 1851 | 15 / 18 | 0 (green) | 118 |
| Close the day | 2076–2128 / 2734 | 3 / 12 main | 1 (below fold) | 219 |
| Clinic settings (profile) | 2976 / 4849 | 11 / 41 (another count 30 / 47) | 2 | 468 section (568 page) |
| My page (owner) | 2645 / 3727 | 19–22 / 36 | 1 | 348–404 |
| Operator overview | 1184–1383 / 2577 | 14 / 22 | 1 | 313 |

| Task | Today |
|---|---|
| Patient books from the home page (phone) | 9 taps, 2 typed fields, 3 pages |
| Patient books from a tapped time on Find a clinic | 9 taps, 6 screens; Continue below the fold on all 4 steps |
| Patient books from a clinic page | about 9–10 taps to Confirm |
| Patient reaches My visits from the home page (phone) | 3 taps, 2 page loads |
| New clinic gets listed | 5 actions, 2 saves |
| New clinic's first weekend of setup | 10 or more saves across 7 sections and 2 pages |
| Username-only staff, new device | 8 actions, 4 screens (recount 6 / 3) |
| Desk sends forms to a patient's phone | 7 clicks, 5 screens |
| Desk types a patient in | 4 clicks, 3 screens (live: 2 / 2) |
| Desk books a known patient | 7 actions |
| Checkout with payment | 7 taps, 4 screens from Finances; 5 taps from the visit |
| HMO treatment to money received | about 26 taps; amount typed 4 times |
| Correct a statement with one payment | about 14 taps, 2 reasons, 3 screens |
| Change one price | 4 clicks; saves 70 fields |
| Close for the year's holidays | about 14 separate adds |

*Test rows the audit left behind* (checked by reading the databases, nothing changed):
- **flossify_t:**
  - Session Road patients P-0001 "Plan Walkthrough", P-0002 "Records Tx-Audit" and W-0005 "Plan Walk".
  - Statements SOA-000001 (Joel Bautista, paid) and SOA-000002 (Plan Walkthrough, partly paid).
  - The clinic "Plan Check Dental 9627092".
  - 8 Session Road step-by-step forms: 1 added, 4 out, 3 being prepared.
- **flossify_teeth:**
  - W-0001 "Plan Tester" at Burnham Smile (booking BU-RYFR).
  - W-0004 "Plan Audit 1440" and W-0005 "Plan Audit 390" at Session Road, both booked.
  - The clinics "Plan Test Dental 32140", "Plan Onboard Check 4707732", "Verify Listing Dental 755131" and "Welcome Measure 4869638".
  - 5 step-by-step forms being prepared.

## 7. What we decided not to do, and why

- **Delaying the phone film's download until the visitor scrolls.** Not measured on a real phone. The audit saw a headless browser fetch the whole 3.97 MB phone film on arrival, and we have not tested a real Android phone on mobile data. We are deferring it because holding the film back would briefly show the still opening frames you objected to. We will measure on a real phone on mobile data before deciding.
- **Opening the calendar on whoever is still in the clinic.** The problem came from the test data's fixed visit times. The first screen already shows those patients, and the change would push the afternoon out of view.
- **Merging symptoms and services into one choice on Find a clinic.** The urgent symptoms must stay red and must trigger the call-now message.
- **Switching on Open now for urgent symptoms.** At night it would hide every clinic and its phone number.
- **Removing Today's patients on a desk.** It is the only place the desk sees every patient's allergies in words together with the one-tap step.
- **Drawing each consent only on page 2.** The visit panel and the Treatment record keep their consent cards, because nothing may hide that a visit went ahead without one.
- **Putting planned work on page 3.** The Treatment record stays what was done and charged, the same on screen and on paper.
- **Dropping "type it again" on sign-up and My page.** It is the owner's own password, and nobody else can reset it.
- **Counting tomorrow's calls and money owed in the inbox, for now.** The "to confirm" list is never zero, and "call back" cannot be marked as done.
- **A setting to hide replies.** A reply that arrives must never be hidden behind a setting someone forgot to change.
- **Picking the statement automatically when taking a payment.** The desk chooses, because the acknowledgment, the BIR number and the HMO share follow that choice.
- **Removing the Calls button from Today's patients, renaming "Not at <clinic>?", or dropping "New clinic?" from the staff entrance.** Each is the only way to somewhere.
- **"Code sent to …" on the code page.** It would reveal whether a number belongs to a staff member.
- **Hiding the patient forms' condition list behind None / Yes.** On the poster and step-by-step forms the list stays visible, with "None of these" first. Only the desk's typed form shows conditions as one line with Add (2.11), because there the desk is asking the patient aloud.
- **Adding the paper record's other health questions to Add patient or the patient forms now.** The privacy notice does not name them; this is already on your lawyer's list.
- **Shortening the patient's own form pages for now.** The "Your health" screen is 3801 px with 70 controls on a phone, the consent page is 3148 px, and the poster page is 11,977 px when scripts are off. The consent words are fixed until your dentist and lawyer review them. The health questions are clinical, so changing them is a new form version the dentist reads. We come back to the layout after question 12 and the review.
- **Defaulting phones to "My own" at sign-in.** Shared stays the default.
- **Changing any consent words, the privacy notice, the paper sheets' headings or the BIR wording as part of simplifying.** Each of those is a legal change, made with your lawyer and only with your yes.