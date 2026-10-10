# Glossary: one word for each thing

*10 October 2026. Plan item 1.8 in `docs/simplify-plan.md`. Written before any screen changes, so every later item
uses the same words and nothing is reworded twice.*

**How to use it.**
- Every new or changed word on a screen, in a refusal sentence or in a text message uses the word in the **Say**
  column. A word in the **Not** column is retired.
- A check stops a retired word coming back. It also keeps a list of the places that still have one. Each place is
  swept by a named plan item: the item that rewrites those words, or else the first item that rewrites that screen's
  words. Item 2.32, the last sweep, takes the screens no other item touches, and the labels it names itself (the
  doors to the booking panel).
- A few retired words are also ordinary English, so no check can tell them apart. Whoever builds the item for that
  screen sweeps them by hand:
  - "booking" for the event, "this clinic" for the location, "leave", "your page", "plan" alone;
  - "Partly paid", "bill", "intake", "₱X from Maxicare", "consent" alone for the privacy notice;
  - "Service" as a column that shows the reason;
  - Money, Files, Health, Left, Notes and "Consent:" used as bare titles.

Patient pages and staff screens sometimes use different words for the same thing on purpose. A patient taps *Book a
visit*; the desk presses *New booking*. Both are listed.

Where the plan quotes a screen word that this glossary retires (*Book a slot*, *Privacy consent*, *HMO claims*, *your
page*), the glossary's word wins when that item is built.

**Never changed through this glossary.** These change only with the owner's yes, and with the lawyer or accountant
where marked in the plan:
- the consent forms' words and titles, and the privacy notice;
- the questions on the desk poster forms and the step-by-step forms (each change is a new form version a dentist
  reads);
- the paper record's printed labels, and every printed paper. The Treatment record's words are shared by the screen
  and its A4 paper, so its "did not come" and "not owed by the patient" stay until the owner says yes;
- the aftercare sheets;
- the line "Flossify is not a BIR-registered invoicing system…";
- the owner's own phrases: *Your clinic, in the Web*, *Open your clinic in the web* (question 6), *I'm a Patient*.

## Visits

| Say | Not | Notes |
|---|---|---|
| **visit**: the event, on every screen and in every text | appointment, appt., booking (as the event) | One idiom stays on purpose: **By appointment** (no walk-ins, or no hours on file), because patients know it. The staff choice beside *Walk-ins*, *Appointments only* today, becomes *By appointment only* (1.40). |
| **book** (the verb). **New booking**: the staff button and the booking panel's title; *Save booking* | Book a visit, Book it, Book again, Rebook, Book the first one (as staff buttons that open the panel) | Every staff button that opens the booking panel says *New booking*. |
| **Book a visit**, **Request a visit**: on patient pages | Book a slot, Book here, Book online, Request a time, Request here | A patient picks a **time**, never a slot: "That time has just gone. Pick another." |
| **request**: a time the desk must place. Staff: *Web request*, *Place it*, *Decline* | Asked for online | Other requests keep their names: *Request for medical clearance*, *LOA request*. |
| **Ref**: the booking's reference (BK-…, BU-…) | Booking ref, Booking reference | *Ref* is what the patient sees and what texts say. |
| **the calendar**: the Dashboard's day and week | the Schedule (as a place), "on the book" | |
| **walk-in**: *Here now (a walk-in)* | | |

**A visit's status** is one of seven words:

| Say | Not | Notes |
|---|---|---|
| **Booked** | | |
| **Confirmed** | | |
| **Arrived**: here, not seated | In the lobby, In lobby, "Checked in, waiting to be seated", "here, not seated yet" | The system still accepts *in the lobby* and shows it as *Arrived* (1.34). *Check in anyway* stays: it names the act, not the state. |
| **In the chair** | In chair | |
| **Done** | Completed | |
| **No-show** on staff screens; **Missed** on patient pages | No show, Did not come | |
| **Cancelled** | | *Cancel* also closes a form, so the visit's own button says *Cancel the visit*. A cancelled visit leaves the calendar. |

**Waiting** is not a status. It is the count of Arrived visits (the tile) and how long one has waited ("Waiting 12 min").

## Money

| Say | Not | Notes |
|---|---|---|
| **statement**: what a patient pays. Its paper is titled *Statement of account*. | invoice, bill (for a statement) | The number keeps its prefix (SOA-000001). Flossify's own bills to clinics really are **invoices** (*Your Flossify plan*, the operator's Billing page); that is a different thing. |
| **charge**: a line on a statement. *New charge*, *Charge this visit* | | |
| **Acknowledgment of payment**: what a payment prints | receipt, invoice (for it) | BIR's own papers keep their names. The payment's field becomes **BIR invoice or receipt no.** everywhere on screen (2.17; today it also reads "BIR receipt no." and "BIR no."). The paper size "80 mm receipt" becomes *80 mm roll* (1.42). |
| A statement is **Unpaid** · **Part paid** · **Paid** · **Void** | Not paid yet, Partly paid (for a statement) | Claims keep their own: Draft · Filed · Approved · Partly approved · Denied · Paid. |
| **Still to pay**: the part of a statement the patient has yet to pay | Left, left to pay | |
| A person **Owes ₱X**, is **In credit ₱X**, or has **Nothing owed** | balance, owed ("₱X owed"), still owed, left owing, outstanding, owes nothing, paid ahead, "₱X credit" | **Balance** stays only where it is a bookkeeping word: the Treatment record's *Balance* column (paper), and *Opening balance*, *Balance as of* and "Balance brought forward…" when bringing over old records. A payment plan's instalment is "₱3,000 due now" (2.19). |
| **the HMO's part**, **PhilHealth's part**: what the payor pays ("Maxicare's part ₱900") | Their part, HMO or PhilHealth pays, "₱X from Maxicare" | *payor* on the claims screens only. |

**Colour.**
- Amber: a patient owes.
- Green: money in.
- Red: a payment plan behind (the only red for money), an allergy, or a consent refused or withdrawn. On the record's
  sheets, nothing else is red.

## Places, named as they are on screen

Point to a place by its on-screen name, with an arrow for the path: *Clinic settings → People*. In a text message the
arrow is a comma (*Clinic settings, People*): it is not a GSM-7 character. Where a name changes in a later item, it is
written "today's name (becomes …, item)". The names are in `src/lib/places.ts` (`PLACE`, `settingsPlace()`,
`sectionName()`): the sentences item 1.18 swept, and every new one, take the name from there. Some headings and older
sentences still write a name out (most settings sections' titles, the Calls page's title, "on their page in Clinic
settings"), so a rename also searches for the old name.

- **Workspace tabs:** Dashboard · Patients · Finances · Clinic settings (the phone's tab row says *Settings*).
- **Sidebar foot:**
  - My page.
  - HMO & PhilHealth claims: only for people without Finances; *Claims* on a narrow screen.
  - Your Flossify plan: the owner's card, shown only when it has something to say.
- **Top bar:** Inbox · New.
- **Dashboard:** the calendar · Today's patients · Next for you · the tiles *Booked today*, *Waiting*, *In the chair*,
  *Collected today* · Calls · Tasks.
- **Finances:** statements · New charge · Close the day · HMO & PhilHealth claims.
- **Patients:** Add patient · Import patients · New patient forms (becomes *Forms to add*, 1.12) · Patient forms in
  progress (becomes *Forms being filled in*, 1.12) · *QR code for your desk* (the poster's page).
- **Texts** (its web address stays `/messages/`; the inbox's link to it is *All texts*). It holds *Text a patient*.
- **Clinic settings**, today: Clinic profile · Opening hours · Closed days · Services & prices · People · Roles ·
  Photos · Privacy · Clinic tablets · Your Flossify plan.
  After 2.23 and 2.24: Your public page · Hours and closed days · How the day runs · Services & prices · People (with
  Roles inside) · Privacy · Your Flossify plan.
- **Public:** Find a clinic · My visits · PhilHealth & HMO · Clinic websites · Pricing (question 15) · Privacy notice
  · Clinic sign-in · Open your clinic. On a clinic's own site: *Staff sign-in* and its booking button. The email
  door's link *Sign in at your clinic's page* opens the page titled *Find your clinic*; the plan (1.23) keeps both.
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
| **Medical history** (the record's place for the health history) | Health, the Health section (as a place) | 1.18 |
| **X-rays and files** | Files (as a place) | 1.18 |
| **HMO & PhilHealth claims** | HMO claims | 1.18 |
| **PhilHealth & HMO** (the page) | Coverage (as its name) | 1.31 |
| **Treatment record** | Timeline | already gone; kept out |

## People and branches

| Say | Not | Notes |
|---|---|---|
| **People**: the clinic's staff, as a place and a list. One person in it is a **member** (*Add member*) | Team (as a place) | "the team" in a sentence stays: *Task for the team*, the home page's *Know the team*. A **staff account** is what a person signs in with: "If that number belongs to a staff account, a code is on its way." |
| **branch**: one clinic location, on staff screens ("at this branch") | this clinic (for the location, on staff screens) | Patients see *clinic*. |
| **All your branches**: what applies to every branch (2.24) | the group | The operator's pages may say *group*. |
| **Disabled**: an account switched off (*Enable* switches it back on) | | Someone who has left is named in the history as such ("No longer on the team"); that is a different thing. |
| **your public page**: the clinic's page on Find a clinic and at its own address | your page, your clinic page, your clinic's own page, Clinic page | Patients still read "Clinic page on Flossify" at its foot. **Listing** is the act of showing on Find a clinic ("switch on your listing"), not the page. A dentist's page is their **public profile**. |
| **My page**: your own details | your page (for this) | |

## Forms and consent

| Say | Not | Notes |
|---|---|---|
| **desk poster forms**: what a patient fills in from the QR poster at reception | patient forms (for these), the QR forms, Patients fill it in | The page the patient opens keeps its title, *New patient forms*: patient-facing and versioned. |
| **step-by-step forms**: *Add patient, step by step*. The desk ticks the consent forms; the patient fills in the patient information and the forms on a clinic tablet, a device handed to them, or their phone. | Patient forms (for these), intake (on screen) | |
| **the code for their phone**: the one-patient QR code on the desk's screen | calling it a poster | |
| **Forms to add**: forms a patient sent, waiting to be added to a patient (1.12) | New patient forms (the staff list), Forms sent, "Sent: add to the records" | References stay *QR-…* and *IN-…*. The patient's own "Forms sent" after sending stays. |
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
| **This visit checklist**: the list at the top of the record for today's visit (on screen: *This visit*) | strip | Never "strip", on screen or in notes to the owner. The calendar's visit panel (titled *Visit*) has *Before we start* and *Before they leave*; the heading "This visit" inside it goes in 2.6. |
| **health history**: the idea, everywhere. On the record it sits under the paper's *Medical history* and *Dental history*. | Health (as a place or a card's name), health answers, health form | Patient pages keep *Your health*. |
| **the chart**: the teeth on page 1 | odontogram, dental chart, tooth chart | **Chart no.** is the number (the paper prints *Chart #*). |
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
- Three texts are written by the database: the reminder, the two-day reminder and the check-up text. Changing their
  words needs a database change.

## Waiting on the owner

- **Question 1:** the attached *Treatment* sheet's name: *Treatment plan and lab*, *Treatment plan, lab cases and
  LOAs*, or keep *Treatment*.
- **Question 6:** "web" or "Web" in the owner's two phrases.
- **Question 15:** *Pricing* or *Pricing for clinics* in the public bar.

## For the developer: the words check

`npm run test:words` reads the words people see, not the code:
- in `.astro` files: text, visible attributes and props, the strings in `{…}` and in scripts;
- in `.ts`, `.js` and `.mjs` files: their strings, including the lists in `src/data/`;
- the CSS `content:` strings;
- the installed app's manifest, `public/sw.js` and `public/pwa.js`;
- the screen-only bar of each print page.

It skips:
- code-like strings (ids, paths, class lists, hooks, SQL);
- comments;
- SQL files. The reminder texts are built in migrations 019 and 036, so a new migration changes them;
- the fixed files: `FIXED` in `scripts/dev/words/extract.mjs`, which `node scripts/dev/words/check.mjs --fixed` lists
  with the reason for each.

Each rule below is one retired wording; a rule with `files` counts only in those files (`staff-book-a-visit` and
`patient-forms` only on staff screens). `scripts/dev/words/known.json` lists two kinds of match:
- **allowed**: a legitimate other meaning, with the reason;
- **todo**: still to sweep, with its plan item.

Anything else fails the check. A todo that is gone also fails, until it is taken off the list (`npm run words:prune`).
`node scripts/dev/words/check.mjs --files <paths>` tries the rules on any file. The place names are in one module,
`src/lib/places.ts`, built from `SECTIONS` (item 1.18), so 2.24's renames change every sentence that reads it at once
(and a search finds the few that still write a name out).

| Rule | Say instead |
|---|---|
| `appointment` | visit (*By appointment* stays) |
| `booking-ref` | Ref |
| `book-door` | New booking (staff), Book a visit (patients) |
| `staff-book-a-visit` | New booking (on staff screens only) |
| `slot` | time |
| `request-a-time` | Request a visit |
| `asked-online` | Web request |
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
| `health-place` | Medical history (on the record), health history |
| `files-place` | X-rays and files |
| `timeline` | Treatment record |
| `coverage-name` | PhilHealth & HMO |
| `hmo-claims` | HMO & PhilHealth claims |
| `public-page` | your public page |
| `the-group` | All your branches |
| `desk-poster-forms` | desk poster forms |
| `patient-forms` | desk poster forms, step-by-step forms |
| `new-patient-forms` | Forms to add |
| `forms-in-progress` | Forms being filled in |
| `privacy-consent` | privacy notice |
| `consent-no-dental` | the consent to treatment |
| `general-consent` | the consent to treatment |
| `sign-another-consent` | Sign consent for this visit |
| `not-paid-yet` | Unpaid |
| `balance` | Owes, Still to pay |
| `owed` | Owes ₱X, In credit ₱X, Nothing owed |
| `payor-part` | the HMO's part, PhilHealth's part |
| `receipt` | Acknowledgment of payment |
| `bir-field` | BIR invoice or receipt no. |
| `invoice` | statement |
| `recall` | Next check-up |
| `odontogram` | the chart |
| `strip` | This visit checklist |
| `other-notes` | desk note |
| `dentists-notes` | clinical notes |
| `health-answers` | health history |
| `lab-work` | lab case |
