# Glossary: one word for each thing

*10 October 2026. Plan item 1.8 in `docs/simplify-plan.md`. Written before any screen changes, so every later item
uses the same words and nothing is reworded twice.*

**How to use it.** Every new or changed word on a screen, in a refusal sentence or in a text message uses the word in
the **Say** column. A word in the **Not** column is retired. The words check (`npm run test:words`) fails when a
retired word appears somewhere new. The places that still have one are listed in `scripts/dev/words/known.json`, each
with the plan item that will sweep it. When an item sweeps one, the check says to take it off that list.

Patient pages and staff screens sometimes use different words for the same thing on purpose. A patient taps *Book a
visit*; the desk presses *New booking*. Both are listed.

**Never changed through this glossary.** These change only with the owner's yes, and with the lawyer or accountant
where marked in the plan:
- the consent forms' words and titles, and the privacy notice;
- the patient forms' questions (each change is a new form version a dentist reads);
- the paper record's printed labels, and every printed paper;
- the aftercare sheets;
- the line "Flossify is not a BIR-registered invoicing system…";
- the owner's own phrases: *Your clinic, in the Web*, *Open your clinic in the web* (question 6), *I'm a Patient*.

## Visits

| Say | Not | Notes |
|---|---|---|
| **visit**: the event, on every screen and in every text | appointment, appt., booking (as the event) | One idiom stays on purpose: **By appointment** (no walk-ins, or no hours on file), because patients know it. The staff choice beside *Walk-ins welcome* reads *By appointment only*. |
| **book** (the verb). **New booking**: the staff button and the booking panel's title; *Save booking* | Book a visit, Book it, Book again, Rebook, Book the first one (as staff buttons that open the panel) | Every staff button that opens the booking panel says *New booking* (2.32). |
| **Book a visit**, **Request a visit**: on patient pages | Book a slot, Book here, Book online, Request a time | A patient picks a **time**, never a slot: "That time has just gone. Pick another." |
| **request**: a time the desk must place. Staff: *Web request*, *Place it*, *Decline* | "Asked for online" shown under *Booked* | Other requests keep their names: *Request for medical clearance*, *LOA request*. |
| **Ref**: the booking's reference (BK-…, BU-…) | Booking ref, Booking reference | *Ref* is what the patient sees and what texts say. |
| **the calendar**: the Dashboard's day and week | the Schedule (as a place), "on the book" | |
| **walk-in**: *Here now (a walk-in)* | | |

**A visit's status.** Seven words, one colour each (the Dashboard's colours):

| Say | Not | Notes |
|---|---|---|
| **Booked** | | |
| **Confirmed** | | |
| **Arrived**: here, not seated | In the lobby, In lobby, "Checked in, waiting to be seated", "here, not seated yet" | The server still accepts *in the lobby* and shows it as *Arrived* (1.34). *Check in anyway* stays: it names the act, not the state. |
| **In the chair** | In chair | |
| **Done** | Completed | |
| **No-show** on staff screens; **Missed** on patient pages | No show, Did not come | |
| **Cancelled** | | *Cancel* also closes a form, so the visit's own button says *Cancel the visit*. |

**Waiting** is not a status. It is the count of Arrived visits (the tile) and how long one has waited ("Waiting 12 min").

## Money

| Say | Not | Notes |
|---|---|---|
| **statement**: what a patient pays. Its paper is titled *Statement of account*. | invoice, bill (for a statement) | The number keeps its prefix (SOA-000001). Flossify's own bills to clinics really are **invoices** (*Your Flossify plan*, the operator's Billing page); that is a different thing. |
| **charge**: a line on a statement. *New charge*, *Charge this visit* | | |
| **Acknowledgment of payment**: what a payment prints | receipt, invoice (for it) | BIR's own papers keep their names. The field is **BIR invoice or receipt no.** everywhere on screen. The paper size "80 mm receipt" becomes *80 mm roll* (1.42). |
| A statement is **Unpaid** · **Part paid** · **Paid** · **Void** | Not paid yet, Partly paid (for a statement) | Claims keep their own: Draft · Filed · Approved · Partly approved · Denied · Paid. |
| **Still to pay**: a statement's amount not yet paid | Left, left to pay | |
| A person **Owes ₱X**, is **In credit ₱X**, or has **Nothing owed** | balance, owed ("₱X owed"), still owed, left owing, outstanding, owes nothing, paid ahead, "₱X credit" | **Balance** stays in two places only: the Treatment record's *Balance* column (paper), and *Opening balance* when bringing over old records. A payment plan's instalment is "₱3,000 due now" (2.19). |
| **the HMO's part**, **PhilHealth's part**: what the payor pays ("Maxicare's part ₱900") | "Their part", "HMO or PhilHealth pays", "₱X from Maxicare" | *payor* on the claims screens only. |

**Colour.** Amber means owed. Red means overdue only (a payment plan behind). Green means money in. On the record's
sheets, an allergy is the only red.

## Places, named as they are on screen

Point to a place by its on-screen name, with an arrow for the path: *Clinic settings → People*. Place names live in one
module once item 1.18 lands, so when 2.24 renames a section every sentence changes with it.

- **Workspace tabs:** Dashboard · Patients · Finances · Clinic settings (the phone's tab row says *Settings*).
- **Sidebar foot:** My page · HMO & PhilHealth claims (*Claims* for people without Finances) · Your Flossify plan.
- **Top bar:** Inbox · New.
- **Dashboard:** the calendar · Today's patients · Next for you · the tiles *Booked today*, *Waiting*, *In the chair*,
  *Collected today* · Calls · Tasks.
- **Finances:** statements · New charge · Close the day · HMO & PhilHealth claims (one name; not "HMO claims").
- **Patients:** Add patient · Import patients · Forms to add · Forms being filled in · the desk poster's page.
- **Texts:** the page at `/c/<clinic>/messages/` (its address stays). It holds *Text a patient*.
- **Clinic settings**, today: Clinic profile · Opening hours · Closed days · Services & prices · People · Roles ·
  Photos · Privacy · Clinic tablets · Your Flossify plan.
  After 2.23 and 2.24: Your public page · Hours and closed days · How the day runs · Services & prices · People (with
  Roles inside) · Privacy · Your Flossify plan.
- **Public:** Find a clinic · My visits · PhilHealth & HMO · Clinic websites · Pricing (question 15) · Privacy notice
  · Clinic sign-in · Open your clinic. On a clinic's own site: *Staff sign-in* and its *Book a visit*.
- **Operator:** Overview · Clinics · PRC checks · Billing · System.

| Say | Not | Swept in |
|---|---|---|
| **People** (the place) | Team, Settings → Team, Open Team | 1.18 |
| **Texts** (the page) | Messages, All messages, the Messages page | 1.18 |
| **Services & prices** | Services & fees | 1.18 |
| **Clinic profile → HMOs you accept** (after 2.23: *Your public page → HMOs you accept*) | Clinic settings → HMOs, "the HMOs you take" | 1.18 |
| **Closed days** | Closed days and time off | 1.18 |
| **Calls** | the call list | 1.18 |
| **the calendar** on the Dashboard | the Schedule, the Today page | 1.18, 1.47 |
| **Medical history** (the record's place for the health history) | Health, the Health section (as a place on the record) | 1.18 |
| **X-rays and files** | Files (as a place) | 1.18 |
| **Treatment record** | Timeline | done (kept out) |
| **PhilHealth & HMO** (the page) | Coverage (as its name) | 1.18 |
| **Find your clinic** (the page a link opens) | Sign in at your clinic's page | 1.23 |

## People and branches

| Say | Not | Notes |
|---|---|---|
| **People**: the clinic's staff, as a place and a list. One person is a **member** (*Add member*) | Team (as a place), staff account | "the team" in a sentence stays: *Task for the team*, the home page's *Know the team*. |
| **branch**: one clinic location, on staff screens ("at this branch") | this clinic (for the location, on staff screens) | Patients see *clinic*. |
| **All your branches**: what applies to every branch (2.24) | the group | The operator's pages may say *group*. |
| **Disabled**: an account switched off | no longer on the team, a member who has left | |
| **your public page**: the clinic's page on Find a clinic and at its own address | your page, Clinic page, your clinic page, your listing | Patients still read "Clinic page on Flossify" at its foot. A dentist's page is their **public profile**. |
| **My page**: your own details | your page (for this) | |

## Forms and consent

| Say | Not | Notes |
|---|---|---|
| **desk poster forms**: what a patient fills in from the QR poster at reception | patient forms (for these), the QR forms, "Patients fill it in" | The page the patient opens keeps its title, *New patient forms*: patient-facing and versioned. |
| **step-by-step forms**: *Add patient, step by step*. The desk ticks the consent forms; the patient fills in the patient information and the forms on a clinic tablet, a device handed to them, or their phone. | Patient forms (for these), intake (on screen) | |
| **the code for their phone**: the one-patient QR code on the desk's screen | calling it a poster | |
| **Forms to add**: forms a patient sent, waiting to be added to a patient (1.12) | New patient forms (the staff list), Forms sent, "Sent: add to the records" | References stay *QR-…* and *IN-…*. |
| **Forms being filled in** | Patient forms in progress, Filling in now | 1.12 |
| **consent form**, always with its state: Signed · To sign · To confirm · Did not agree · No photos · Withdrawn · Removed | a consent form named with no state | |
| **the consent to treatment**: its short name in staff sentences. The form keeps its title, *Consent to dental examination and treatment*. | general consent, treatment consent, "consent to examination and treatment" (without *dental*), "Consent:" alone for it | |
| **Sign consent for this visit**: the per-visit tablet signing | Sign another consent | A consent form's own rows keep *Sign on this tablet* and *Sign on their phone*. |
| **privacy notice**. A patient has **agreed to the privacy notice**: *Privacy notice: agreed* / *not agreed yet* | privacy consent, consent (alone, for this) | The legal names stay: Data Privacy Act of 2012, National Privacy Commission, Data Protection Officer. |

## The record

| Say | Not | Notes |
|---|---|---|
| **Page 1 · Page 2 · Page 3**: the three paper sheets. Their printed titles stay: *Patient's chart*, *Patient information record*, *Medical history*, *Dental history*, *Informed consent*, *Treatment record*. | | The step-by-step forms' first part is **patient information** in staff sentences, never "page 1" on the record. |
| The **attached sheets**: Treatment (its name waits on question 1) · Clinical notes · Prescriptions and letters · X-rays and files · **Visits** · Account · Texts | Appointments (the sheet), Money (the Account sheet's card) | A sheet's card, read aloud, has the sheet's name. The contents' short names (*Notes*, *Rx and letters*, *X-rays*) are short forms of the same names. |
| **This visit checklist**: the list at the top of the record for today's visit (on screen: *This visit*) | strip | In owner text and code comments too. The calendar's visit panel has *Before we start* and *Before they leave*; its block titled "This visit" gets another name in 2.6. |
| **health history**: the concept, everywhere. On the record it sits under the paper's *Medical history* and *Dental history*. | Health (as a place), health answers, health form | Patient pages keep *Your health*. |
| **the chart**: the dental chart on page 1 | odontogram, dental chart, tooth chart | **Chart no.** is the number (the paper prints *Chart #*). |
| **Next check-up**: when to come back | recall | |
| **clinical note**: the dentist's note. **desk note**: the desk's note about the patient. **visit note**: the note on one visit. **note for the dentist**: on the health history | Notes (as the Edit details field), Other notes, The dentist's notes | |
| **treatment plan**: work planned. **treatment done**: work done, shown on page 3. **payment plan** | "plan" alone where both could be meant | |
| **service**: a line of the fee guide (*Services & prices*). **reason**: why the patient is coming | "Service" as a column that shows the reason | |
| **lab case** | lab work (on staff screens) | A patient's text says "your lab work". |

## Blocked time

| Say | Means |
|---|---|
| **Block time** | the action, and the panel |
| **blocked time** | lunch, a closed day, a dentist's time away, a chair out of use |
| **closed day** | the whole clinic closed on a date (*Closed days*) |
| **time away** | a dentist away on dated days (2.8: *Add time away*); not "leave" on screen |
| **not in** | a dentist's regular day off: "Dr. Cariño is not in on Tue 6 Oct" |
| **chair out of use** | one chair blocked |
| **In closed time** | a visit booked inside blocked time that nobody has kept there (*Calls*) |

## Text messages

- Say **your visit**. Never appointment, booking or appt.
- No link, and no text asks for a reply.
- Name the day ("Thu 24 Sep, 9:00 am"), never "tomorrow".
- The reminder, the two-day reminder and the check-up text are built in SQL (migrations 019 and 036). Their words change
  only through a new migration.

## Waiting on the owner

- **Question 1:** the attached *Treatment* sheet's name (*Treatment plan and lab* / *Plan, lab work and LOAs* / keep
  *Treatment*).
- **Question 6:** "web" or "Web" in the owner's two phrases.
- **Question 15:** *Pricing* or *Pricing for clinics* in the public bar.

## For the developer: the words check

`npm run test:words` reads the words people see, not the code:
- in `.astro` files: text, visible attributes and props, the strings in `{…}` and in scripts;
- in `.ts` files: their strings;
- the CSS `content:` strings;
- the installed app's manifest.

It skips:
- code-like strings (ids, paths, class lists, hooks, SQL);
- comments;
- the fixed files listed in `scripts/dev/words/check.mjs`.

Each rule below is one retired wording. `scripts/dev/words/known.json` lists two kinds of match:
- **allowed**: a legitimate other meaning, with the reason;
- **todo**: still to sweep, with its plan item.

Anything else fails the check. A todo that is gone also fails, until it is taken off the list (`npm run test:words --
--prune`).

| Rule | Say instead |
|---|---|
| `appointment` | visit (*By appointment* stays) |
| `booking-ref` | Ref |
| `book-door` | New booking (staff), Book a visit (patients) |
| `slot` | time |
| `request-a-time` | Request a visit |
| `schedule-place` | the calendar |
| `the-book` | the calendar |
| `in-lobby` | Arrived |
| `in-chair` | In the chair |
| `completed` | Done |
| `no-show` | No-show |
| `did-not-come` | No-show (staff), Missed (patients) |
| `team-place` | People |
| `messages-place` | Texts |
| `services-fees` | Services & prices |
| `hmos-place` | Clinic profile → HMOs you accept |
| `closed-days-time-off` | Closed days |
| `call-list` | Calls |
| `today-page` | the Dashboard |
| `health-place` | Medical history |
| `files-place` | X-rays and files |
| `timeline` | Treatment record |
| `find-your-clinic` | Find your clinic |
| `privacy-consent` | privacy notice |
| `consent-no-dental` | the consent to treatment |
| `general-consent` | the consent to treatment |
| `sign-another-consent` | Sign consent for this visit |
| `new-patient-forms` | Forms to add |
| `forms-in-progress` | Forms being filled in |
| `not-paid-yet` | Unpaid |
| `balance` | Owes, Still to pay |
| `owed` | Owes ₱X, Nothing owed |
| `receipt` | Acknowledgment of payment |
| `invoice` | statement |
| `recall` | Next check-up |
| `odontogram` | the chart |
| `strip` | This visit checklist |
| `other-notes` | desk note |
| `the-group` | All your branches |
