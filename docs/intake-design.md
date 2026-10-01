# Add patient, step by step — the intake as built, and what is left

The owner (29 Sep 2026): Add patient by QR or at the clinic, step by step; before
the QR the staff tick which consent forms the procedure needs; page 1 patient
information, then the consent forms, then the profile is made. Their four
answers: procedure forms are signed only after the named dentist records "I
explained this"; the profile is made at Send unless the patient looks like one
already on file; a fresh signature on every form, with initials on the risks;
the six scheduling features first.

The original spec (`intake-spec.md`) lived in a session scratchpad and is gone.
This file is its replacement: what each phase settled, where it lives, and what
phase 4 still has to settle with the owner. `CLAUDE.md` "Add patient, step by
step (039)" is the detailed record; this is the map.

## Phase 1 — the library and the data (039)

- Ten procedure forms and the general consent as data (`src/lib/consent-library.ts`),
  every form's words pinned by a hash (`consent_version.body_sha256`, `npm run
  consent:hash`, `npm run test:consent`). New words are a new version id.
- Intakes, links, clinic tablets, consent documents, signings, attestations,
  confirmations, withdrawals, overrides and a per-clinic seal chain, all under
  forced row-level security; the public side only through definers that answer
  status words (`intake_gate` first, then `intake_view`, `intake_claim`,
  `intake_verify`, `intake_ping`, the page and decide calls, `intake_send`).
- The forms reader became an engine shared with the QR forms; the add path is
  `src/lib/patient-add.ts`.
- Production offers none of the forms until a dentist and the owner's lawyer have
  read them (`CONSENT_REVIEWED`).

## Phase 2 — the clinic's devices (039, fixes in 043)

- The desk's steps at `/c/<slug>/patients/intake/<id>/`: who and which forms,
  the clinic's part, Check, Hand over. The named dentist's "Explain and confirm".
- A clinic tablet (`/auth/tablet/`, `/f/t/` waiting, polled every 4 s) or the
  desk's own device handed over (`/auth/park/`, which signs the desk out;
  `/auth/unlock/` takes it back).
- The patient's pages `/f/i/<token>/`: page 1 (a new patient), each form with a
  fresh signature, Check and send, a thank-you that shows nothing of the record.
- The record's Consent forms pane, a form's own page and print, a paper path.

## Phase 3 — the patient's own phone (1 Oct, no migration)

What was decided, and why:

- **The QR code is on the desk's screen, not printed.** It is one patient's
  code, good for 15 minutes, and it must not be left on a counter: step 4 shows
  it, and it leaves the screen the moment a phone claims it. The poster's QR
  (`/f/<key>/`, the patient forms of 028) stays the clinic-wide one.
- **The first phone wins.** Start claims the link with a secret made for that
  browser (`fl_idev`); a second phone is told the forms are open on another
  device. The desk can always show a new code, which retires the old one.
- **A patient on file proves who they are with their birth date**, three tries,
  before anything of the record is drawn. Three misses lock the code; the desk
  sees "Locked" and offers a new one. A patient with no birth date on record
  cannot use the phone path until the desk adds one (the chooser says so).
- **The desk watches without touching the phone.** The live panel polls every
  8 s and says, in words, where the patient is; a question or a refusal reloads
  the page so "Needs the desk" shows. Nothing private crosses: only the state
  words the page already shows.
- **Page 1 on a phone has the same rule as on a tablet**: it opens only where
  the privacy notice in force covers it (`page1Open`), so on the live site a
  new patient's phone path waits for the new notice like every other device.
  A patient on file (consent forms only) does not need it.
- **One bug fixed on the way, on every device**: a page 1 question whose
  condition reads an earlier screen's answer (pregnancy reads sex) was hidden
  by the page's script and required by the server. The form now carries the
  earlier answers a condition names (`data-prior`).

Verified by `scripts/dev/intake/phone-e2e.mjs` (two browsers, three paths, the
database after each, geometry at 390) and `scripts/dev/glass/contrast.mjs` with
`--keep` (0 fails, lowest 5.30:1).

## Phase 4 — the record integration

The original spec named phase 4 only as "the record integration". What existed
already on the record: the Consent forms pane (phase 2), the signed consent on
the visit (035), `visit_treatment_consented()` for the visit panel's checklist.
Four candidates were put to the owner on 1 Oct; they chose the first.

### 4.1 — the signed forms where the dentist looks (built 1 Oct, no migration)

- **A form belongs to a visit** when it was prepared from one (its
  `appointment_id`); otherwise a signed form joins the visit of the day it was
  signed (a paper's own day), the same rule the visit panel uses for blood
  pressure and files: it joins an existing visit and never makes a day of its
  own. A form nobody signed and no visit names stays in Consent only.
- **The visit panel** lists each form as a card in "Consent and signature",
  beside the tablet-signed consent of 035: the signature (or "Signed on
  paper"), who signed, the state in a pill, where and when it was signed, the
  teeth, who explained it, Open the form and Print. A form still to sign shows
  as "To sign", so the dentist sees at the chair what is outstanding.
- **The Treatment record** gets one row per signed form, before the work it
  covers: "Signed by Ana Dimaculangan · on their phone · 2:31 pm" (or "Did not
  agree · …", "withdrawn <day>"), the form's teeth, the dentist who explained
  it. No money. The paper draws the same rows. A form still to sign is not
  history and is no row.
- Built in `src/lib/visit-record.ts` (`Visit.forms`), `src/lib/treatment-record.ts`
  (row kind `consent`, `formWords`, `SIGNED_WHERE`) and `_record/VisitPanels.astro`.
  Checked by `scripts/dev/intake/phone-e2e.mjs` at a clinic with a visit today and
  measured with the panel open (0 contrast fails, fits 1440 and 390).

### 4.2 — Sign again from the record (built 1 Oct, no migration)

- **Two ways on every form that may be signed**, on the Consent pane and the
  form's own page: Sign on this tablet, Sign on their phone. The phone way
  lands on the intake's Check step with the phone preselected, so the desk
  presses once and shows the QR code.
- **Newer words.** When a form's version is no longer in force and the version
  in force for its code is offered here, the record marks it "Newer words: sign
  again" and offers Sign again both ways. The start prepares the form again
  under the words in force, inside the new intake: the clinic's part carried
  over when the fields are the same, the dentist, the visit and the plan line
  kept, no attestation copied (the dentist explains the new words again). An
  unsigned old form retires as renewed; a signed one stays as history, so what
  was agreed under the old words is never lost.
- Not offered: a form signed under the words in force (nothing to sign again),
  and words this server does not offer yet (a production server until the new
  version is reviewed).
- Built in `src/lib/intake.ts` (`startIntake`), `_record/ConsentForms.astro`
  and `consents/[document].astro`. Checked by `phone-e2e.mjs` path B2 with an
  older version planted by the test.

### Still open, for the owner to rank

3. **The health history from page 1 against the one on file**, side by side,
   with "Use" per detail as the QR forms do (`useFormDetail`), where today the
   intake writes a new version.
4. **Withdrawals and overrides on the record**, which the data holds
   (`consent_withdrawal`, `consent_override`) and no page draws yet.

None of these needs a migration. Build the next on a branch from `main`; write
what was decided here.
