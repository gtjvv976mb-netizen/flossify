# Patient forms: the desk poster and the step-by-step forms

*Moved here from `CLAUDE.md` word for word on 10 Oct 2026 (plan item 1.9). `CLAUDE.md` holds the rules; this file holds the detail. Where they differ, `CLAUDE.md` wins.*

## Patient forms — the QR code on the desk (028)

The owner asked for a QR code a clinic prints and posts at reception, so a
patient fills in their details and the standard patient forms on their own
phone. Add patient offers it beside typing and importing, second of the three
and marked *Easiest*.

- **Closed in production until the privacy notice covers it.** Patients
  agree to the notice in force, and privacy-2026-09 does not name what the
  forms collect (health history, address, emergency contact and a parent's
  details, Facebook, PhilHealth PIN, the 30-day deletion). Consent to
  sensitive personal information must be informed (RA 10173 s.13(a)), so on a
  production server `lookupForms` answers `unavailable` and `submitForms`
  `closed` until the notice in force is listed in `FORMS_PRIVACY_VERSIONS`
  (`src/lib/patient-forms.ts`; a development machine always opens them). The
  QR page says so to the clinic. Opening them is one change: a new
  `consent_version` (migration), `/privacy/`'s words and hard-coded version,
  and the id in that list, after the owner's lawyer has read it.
- **A clinic's forms link is `flossify.ph/f/<key>/`**: ten random characters
  with no look-alikes (no i, l, o, 0, 1), one live key per clinic
  (`clinic_forms_key`), made the first time it is asked for (`formsKey`). The
  QR code holds that short link, so the code stays sparse enough to scan from
  a desk. It works whether or not the clinic is listed. "Make a new QR code"
  (`newFormsKey`) retires the key; a retired key is kept so an old poster says
  it was replaced, and it accepts nothing. The app may insert a key and set
  `retired_at`/`retired_by`, nothing else, and a trigger refuses changing a
  key or bringing a retired one back.
- **The public side has no tenant**: `patient_forms_clinic(key)` and
  `patient_form_submit(key, nonce, answers)` (definer functions) are the only
  ways in, and the clinic comes from the key, never from the page. The
  function checks again what the page checked (names, birth date, mobile, both
  ticks, a parent or guardian under 18, the consent wording in force) and
  answers `invalid` rather than raising, so no answer reaches a log. The same
  form sent twice (its nonce, the same answers) is one row and gets its
  reference and stored first name again (`again`); the same nonce with other
  answers saves nothing and is never told the first one's reference
  (`resend`: the page draws the form again with a new nonce). CSRF (a miss
  re-renders the form with the answers, never a redirect), a honeypot, a 64 KB
  cap (`readCappedForm`) and `LIMITS.forms`: per address **and poster**, per
  mobile, per poster, and missed links per address (IPv6 counted per /64,
  `ipBucket`). **A real poster's link always opens**: only links that do not
  exist wait (a clinic's Wi-Fi or a carrier's CGNAT address is many patients).
  At 500 waiting forms through one poster the definer answers `full`; a new
  QR code opens the forms again, and the queue's "Dismiss selected" clears a
  flood.
- **The page brings back nothing one person typed for the next** ("Fill in
  forms for someone else", a clinic tablet): the form and every field
  without a contact token (all the health and dental answers, the emergency
  contact, the guardian, the PhilHealth PIN and HMO card number) are
  `autocomplete="off"`; a page restored from the browser's memory or an old
  post sent again is hidden and reloaded empty (the inline script at the top
  of `/f/[key]`); a page a post drew is turned into a GET in the history
  (`replaceState`); and "Fill in forms for someone else" replaces the
  thank-you. Nothing is in the URL or storage. **The contact fields keep
  their autofill tokens on purpose** (name, birth date, mobile, email,
  address, occupation, the HMO card's company, the signature's name:
  `autocomplete` in STEPS; a field's own token wins over the form's "off"),
  so the patient's own phone — the main use — fills them in one tap. The
  cost: a browser that saves addresses may offer them to the next person on
  a shared device, so the QR page tells a clinic tablet to open the link in
  a private tab. Owner's call: to trade that fill-in for a shared tablet,
  drop the tokens from STEPS (`_Field` then renders "off").
- **A form is not a patient.** It waits in "New patient forms" until someone
  who can edit records adds it — as a new patient or to one on file — or
  dismisses it. A form nobody added is deleted 30 days after it was sent, by
  `retention_purge()`, which the worker already runs; an added form stays with
  the record. The app can read forms and write the decision columns only:
  nothing but the definer function inserts one, and nothing changes answers.
- **Adding writes what the desk would**: the patient row (the next P- number,
  under `lockClinic`), a `medical_history` version with `answered_by
  'patient'`, `form_id`, and `answered_at` = **when it was added** (so it is
  the current version even if the desk typed one after the form was sent; the
  sending time is `answers.form.submitted_at` and the record prints "from the
  patient forms (QR-7K2F, sent 26 Sep)"), `recorded_by` null (021's rule for a
  patient's own answers), and `patient_consent` rows with channel `form` (the
  form, who added it, the typed signature, as whom, when it was signed), one
  per version per patient as at the desk. Added to a patient on file, it fills
  only what is empty, never a name, and **never a mobile or an email unless
  the desk ticks it** (checked at the desk: /me/ finds visits by mobile);
  allergies, conditions, medicines and the note on the latest version on file
  carry into the new one (what a patient did not tick is not evidence it is
  gone). What the form says differently is listed on the record with "Use
  <it>" per detail (`useFormDetail`, `TAKEABLE`: never a name or the birth
  date). The record's words about consents come from the rows (`patientForms`
  → `consentState`: from the form, already on file, or none — a record that
  makes the patient a minor who signed for themself, which it says plainly).
  PhilHealth PIN and the HMO's company stay in the answers; the row has
  `hmo_name` and `hmo_member_no` only.
- **The consent to examination and treatment is versioned like the notice**:
  a `consent_version` of kind `treatment` (`treatment-2026-09`), its words in
  `TREATMENT_CONSENT` (`src/lib/patient-forms-def.ts`). A change of words is a
  new row and new words in one change; a version in force with no words here
  closes the forms. `current_consent_version()` now means the privacy notice
  only, and `readConsents()` lists privacy consents only. The app reads
  `consent_version` and cannot write it (028).
- **The questions are data** (`STEPS` in `patient-forms-def.ts`, versioned by
  `FORM_VERSION`): the public page renders from them, `parsePatientForm` reads
  every field on the server whatever the script did, and `answerSections`
  labels a stored form for the queue, the record and the printout (the desk's
  headings — "The patient", "Health history" — are `_forms/words.ts`).
  `ShowIf` conditions (`minor`, `minAge`, `all`, `not`, a field's answer) are
  evaluated the same on both sides: civil status and occupation from 18,
  pregnancy from 12 and not male, the emergency contact skipped when a minor's
  parent is ticked as it (the server copies the parent's details), a
  follow-up after Yes. A checklist's "none" comes first and folds the rest of
  it away; the 35 conditions sit under small headings (`Choice.group`); the
  optional numbers are folded (`SectionDef.fold`). Every answer is read
  without invisible characters (zero-width, direction overrides:
  `visibleOnly`). `patient-forms-def.ts` has no Node or database imports, so
  a page's script may import it; pages on the server import
  `patient-forms.ts`.
- **The QR code is drawn here** (`src/lib/qr.ts`: `qrcode-generator`, pinned,
  no dependencies): SVG, error correction H, a four-module quiet zone, the
  Flossify mark in a cleared middle (versions up to 6, where the middle is
  data only). After any change to the drawing, decode it again (jsQR over a
  rendered PNG, at several sizes, blurred and turned): a poster that looks
  right and does not scan is the one failure it cannot have.
- **The workspace side.** Add patient offers three ways at its top — type it
  in, *Patients fill it in* (Easiest), import a spreadsheet — and says when
  forms are waiting, so nobody types a patient in twice.
  `/c/<slug>/patients/qr/` is the poster as it prints, one teal Print poster,
  Download QR (PNG), Copy link and Make a new QR code (asks first); on a phone
  the buttons come first, full width. The poster is one set of drawing steps
  in millimetres (`patients/qr/_poster.ts`: headline 15 mm, brand 9.4 mm by a
  14 mm mark, steps 5.5 mm) drawn three ways: SVG for the preview and the A4
  print page (`qr/print/`; Save as PDF keeps it vector), and a 300 dpi canvas
  for the PNG (`qr/_draw.ts`, with a pHYs chunk so it prints at A4). Print
  poster prints the QR page itself, which then shows only its paper copy
  (`.fm-print-sheet`): a hidden frame cannot work, because every page sends
  `frame-ancestors 'none'`. Draw the poster's SVG in tenths of a millimetre
  (`posterSvg` does): at 4–15 units a browser rounds each letter's advance
  and the words come out letter-spaced. `patients/forms/` is the queue (New ·
  Added · Dismissed; a search by name, mobile or reference; boxes and
  "Dismiss selected" on New) and `patients/forms/<id>/` one form: the answers
  labelled from the definition, what the dentist should see first as pills,
  likely matches each with *Add to <name>* (teal when the strongest has the
  same name and birth date; a mobile alone never is), *Add as a new patient*
  and *Dismiss*, each confirmed in a side panel (or in the page with
  `?confirm=…`); the decision card stays in view on a wide screen. Adding goes
  on to the record (`?saved=form&form=<id>`). A waiting form is for people
  who can add patients (`canEditRecords`); an added one is part of the
  record, readable by anyone who may open records (the record's Consent
  section lists its forms; the Overview shows the latest one's reason for
  the visit). The count of waiting forms is on the Patients tab (a dot on a
  phone's tab row), in the inbox and above the patients list — only for
  people who can add patients (`inboxFor(…, staffId)`).
- **Every /c/ response is `Cache-Control: no-store`** (`src/middleware.ts`):
  the forms' answers and printouts, records and health histories must not
  stay in a shared clinic computer's cache after sign-out.

## Add patient, step by step (039) — phase 1: the consent library and the data

The owner (29 Sep 2026): Add patient by QR or at the clinic, step by step — before the QR the staff tick which
consent forms the procedure needs; page 1 patient information, then the consent forms, then the profile is
made. The design was the intake spec (`intake-spec.md`, a session scratchpad, gone; `docs/intake-design.md` has it as built and
opens with the owner's four answers: procedure forms are signed only after the named dentist records "I explained this"; the profile is made
at Send unless the patient looks like one already on file; a fresh signature on every form with initials on
the risks; the six scheduling features first). **Phase 1** is the library, the data and the shared add path;
**phase 2** (shipped, fixes in 043) the desk's steps, clinic tablets, the patient's pages (`/f/i/<token>/`,
`/f/t/`), park/unlock and the record's Consent forms pane; **phase 3** (shipped 1 Oct, no migration) the
patient's own phone; **phase 4** (the record integration, `docs/intake-design.md`) followed the same day: the
signed forms on the visit panel and the Treatment record (the owner's first pick), Sign again from the record,
page 1 beside the record with "Use" per detail, and withdrawals and overrides asked first and drawn.

- **The consent library is data** (`src/lib/consent-library.ts`, no Node imports): ten forms
  (`anaesthesia-2026-10` … `photos-2026-10`, `consent_version` kind `document`, in force from 1 Oct 2026) and
  the general consent (`treatment-2026-09`, `TREATMENT_CONSENT` word for word), each a `Template` holding the
  clinic's part (desk fields; dentist fields the desk may only propose — "to be confirmed by the dentist" until
  the named dentist attests), the patient's questions and every word a page shows. `readClinicPart`,
  `readPatientPart`, `renderDocument` (pure: the one renderer) and `consentsForCatalog` live there.
  **The words are Flossify's plain drafts:** `CONSENT_REVIEWED` is empty, so a production server offers none
  of them through the intake, the general consent included, until a dentist and the owner's lawyer have read each.
  **But the tablet's per-visit signing** (`/c/<slug>/patients/<id>/sign/<visit>/`, 035) reads no review list and
  already offers the general consent (`treatment-2026-09`) on the live site; the review pack says so (6 Oct), so the
  dentist and the lawyer read it first. Filipino shows only where drafted and reviewed.
- **Words are pinned.** `consent_version.body_sha256` equals `libraryHash(template)` (`npm run consent:hash`); a
  server offers a template only while the two match (`templatesInForce`), and `npm run test:consent` fails when
  a word changes. New words are a new version id and a new row, in one change. Tailwind scans these files:
  after editing words, check the build's CSS is unchanged (the word "shrink" once added a class).
- **What was signed is frozen** (`src/lib/consent-seal.ts`): the snapshot is the canonical JSON of the rendered
  page and its facts (keys sorted, no whitespace, NFC, integers only), rendered by the server; the database
  computes `snapshot_sha256` and the seal (`consent_seal()`, the same sum as `sealHex`) whatever the caller
  passes; once a form is on a record its seal joins the clinic's chain (`consent_chain`, written only by a
  definer trigger; `consent_chain_check`, `consent_chain_head`).
- **039's tables all force row-level security:** `intake` (an intake is not a patient), `intake_link` (26
  characters, claimed by the first device; tablet and desk links are made already claimed), `clinic_tablet`,
  `consent_document` (frozen once attested, signed or printed; a signed one is never cancelled), `intake_page`
  (written by the definers only), and the insert-only records `consent_signing`, `consent_attestation` (only by
  the named treating dentist with a PRC licence, before any signing), `consent_confirmation`, `capacity_note`,
  `consent_withdrawal`, `consent_override`, `consent_chain` (select-only for the app) and `intake_event` (never
  an answer). `patient_consent` gains channel `intake`; `medical_history` gains `intake_id`.
  `visit_treatment_consented(appointment)` is the one rule for "consent signed for this visit".
- **The public side has no tenant.** `intake_view`, `intake_claim`, `intake_verify`, `intake_ping`,
  `tablet_poll`, `intake_save_page1`, `intake_mark_page`, `intake_decide` and `intake_send` are the only way in;
  all go through `intake_gate` (granted to nobody), which locks **the intake first, then its link** — every
  desk write locks in that order too. They answer status words and catch every error, so no answer reaches a
  log.
- **`retention_purge()`** keeps its signature and also purges intakes (in a block of its own): preparing, out or
  cancelled after 24 h, and sent over 30 days ago, unless held (a signing, and either a look-alike here or a
  visit). Forms on a record stay.
- **The forms' reader is an engine** (`patient-forms-def.ts`: `FormDef`, `indexFields`, `parseForm`,
  `parseScreen`, `valuesAsForm`); `parsePatientForm` is `parseForm(FORMS_DEF, …)` (9009 fuzzed posts identical
  to before). Page 1 is `INTAKE_DEF` (`src/lib/intake-def.ts`), built from the forms' FieldDefs by name. The add
  path is `src/lib/patient-add.ts`, shared by the forms queue and the intake; `src/lib/refused.ts` is the one
  `Refused` class (four pages keep their own copy until next touched).
- **Checks:** `npm run test:consent` (units) and `scripts/dev/intake/db-test.mjs` (the database; rolls back,
  refuses a non-local database). **Deploy:** 039 applies before 040 when shipped together; a database that
  already has 040–042 takes it with `npm run db:migrate -- --allow-late`, run by hand once — never in
  `render.yaml` or the Procfile.
- **Phase 2 (039, fixes in 043).** The desk ticks the consent forms, fills the clinic's part, and the named
  dentist records "Explain and confirm" (what the patient said is asked of a patient 7 to 17, and while the age
  is not known unless the desk said 18 or over). The forms then go to a clinic tablet or to the desk's own
  device ("Hand this device to <name>", `/auth/park/`: the desk is signed out, `fl_idev` is one per browser
  under `/f/i/`). The patient's pages `/f/i/<token>/` run page 1, then each form, with a quiet Back, "Ask the
  desk" that keeps what was typed, "Decide later" (the photos too), then Check and send. A clinic device pings
  every 12 s and leaves when the desk stops, moves or replaces the link; its closed pages say "Please hand the
  device back to the desk" (`intake_device()`), and the desk's device offers "For the clinic". Unlocking
  (`/auth/unlock/`) or the next hand-over stops the desk device's link (`endHandover`). A clinic tablet is made
  at `/auth/tablet/` (a session change for `sw.js`) and never holds a staff session: `/f/t/`, its poll and
  `/f/i/` end one and log `tablet.signout`. Every standalone workspace page and a record's file view
  (`files/<id>/view/`) carry `ParkedGuard` and leave when the device is handed over. On the record, a form in
  forms being filled in cannot be printed or recorded on paper; throwing the forms away or unticking a form
  puts a record form back as it was. `?paper=1` opens only as "Print for signing on paper" allows, and prints
  the initials boxes and the patient's questions that "Record a paper signing" asks. Adding forms to a patient
  on file re-checks who signed against the record's birth date. Dates on consent pages are Manila days. 043
  applies after 039–042 and only resets a version's fingerprint where no consent form uses that version yet.
  Stop (not throw away) leaves a record form tied to the paused intake until it is taken out, thrown away or
  purged; the record links to the open forms and says how to get it back.
- **Phase 3: their own phone (no migration; 039's definers already had it).** On Check, "Their phone" is offered
  (`phoneOk`: `gates.phoneOpen` = `PHONE_PATH_BUILT`, and for a new patient `page1Open`; the chooser's phone card
  says the same, and a patient on file needs a birth date on record). Step 4 then shows a **QR code on the desk's
  screen** (`qrSvg` of `/f/i/<token>/`; at flossify.ph live, this machine's origin in development so a phone on
  the network can scan it), good for 15 minutes (`intake_link.open_by`), with the state in words: waiting to be
  scanned until hh:mm, on their phone, typing the birth date, idle, not scanned in time, locked. **The first phone
  to press Start claims the link** (`intake_claim`, the page then sets `fl_idev` under `/f/i/`; `claimIntake`), the
  QR leaves the desk's screen at once, and a second phone reads "open on another device". **A patient on file
  types their birth date first** (`intake_verify`, `verifyIntake`: wrong is told, three misses retire the link as
  locked and the desk says so); nothing of the record is drawn before. A code that ended (not scanned, idle,
  locked) keeps "Show a new code" (`goLive` again: the old link `replaced`/retired, a new one made;
  `DeskIntake.lastLink` says why the last one ended). **The live panel**: step 4 asks itself `?step=out&live=1`
  every 8 s while visible (`LIMITS.intake.poll` per staff member; JSON of the state words, each part's tag, what
  needs the desk) and updates the words in place and in an aria-live line; a change in what needs the desk, or
  the forms sent, stopped or thrown away, loads the page again. The phone's own words differ from a clinic
  device's (`intakeWords`: "Thank you. The clinic has them." rather than "hand the device back").
  **A page 1 fix found by the phone run (every device):** a condition that reads an earlier screen's answer
  (the pregnancy questions read `sex` from the first screen) was hidden by the page's script, which could not
  see that answer, while the server required it, so a non-male adult could not pass the health screen with
  scripts on. The form now carries `data-prior` (only the fields a condition names, from earlier screens) and
  the script reads it. **Checks:** `scripts/dev/intake/phone-e2e.mjs` plays the desk and two phones through a
  new patient, a patient on file (a wrong birth date, then the right one), a second phone, an idle code and a
  new one, the geometry at 390 (no sideways scroll, 44 px), and the database after each; `--keep` leaves a Start
  screen, a birth-date screen and the desk's QR step open with saved states for `contrast.mjs` (`PW_STATE`,
  `PW_CHROMIUM`). Measured 1 Oct: 0 fails, lowest 5.30:1, light and dark, phone and desk.
- **Phase 4, first piece: the signed forms where the dentist looks (no migration).** `loadVisits()` takes the
  record's consent forms (`RecordDoc[]`, `Visit.forms`): a form prepared from a visit belongs to it, signed or still
  to sign; one signed through an intake or on paper with no visit named joins the visit of the day it was signed (a
  paper's own day), and never makes a day of its own; a form nobody signed and no visit names stays in Consent. The
  **visit panel**'s "Consent and signature" draws each as a card beside the tablet-signed consent (`[data-vx-form]`:
  the signature or "Signed on paper", who signed, the state pill, where — `SIGNED_WHERE`: on their phone, the
  clinic's tablet, a device handed to them, paper — and when, the teeth, who explained, Open the form, Print). The
  **Treatment record** gets a row of kind `consent` per signed form, before the work it covers (`formWords`:
  "Signed by Ana Dimaculangan · on their phone · 2:31 pm", or "Did not agree · …", "withdrawn <day>"), with the
  form's teeth and the dentist who explained it; a form still to sign is no row. The paper draws the same rows.
  `holds()` counts signed forms, so a visit with nothing else done is still history. Checked by `phone-e2e.mjs` at a
  clinic with a visit today (the card, the row, the paper, the page fits at 1440 and 390) and measured with the
  panel open: 0 contrast fails, light and dark, desk and phone.
- **Phase 4, second piece: Sign again from the record, on a phone or this tablet (no migration).** On the record's
  Consent pane and a form's own page, a form that may be signed (never signed, refused, withdrawn, no photos) has
  **Sign on this tablet** and **Sign on their phone**: the same intake start (`intent=start`, `document=<id>`,
  `way=clinic|phone`); the phone way lands on Check with the phone preselected (`?via=phone`). A form whose
  **words are no longer in force** (a newer version of its code in `consent_version`, and that version offered
  here: the pane's `offered` codes) is marked "Newer words: sign again" and offers **Sign again** the same two
  ways: `startIntake` no longer refuses `doc_words` but prepares the form again under the words in force in the
  new intake — the clinic's part carried over when the fields are the same (as `renewDocuments`), the dentist,
  the visit and the plan line kept, no attestation copied (the named dentist explains the new words again). An
  unsigned old form retires as `renewed`; a signed one stays on the record as history. A form signed under the
  words in force is still refused (`doc_signed`); words not offered here refuse `doc_words`. Checked by
  `phone-e2e.mjs` B2: an older general-consent version planted by the test (never offered; the row is a
  superuser's), an unsigned form on it, the record's pill and button, the intake under `treatment-2026-09`, the
  old form `renewed`, signed on the phone, the record clean. The pill and buttons reuse measured classes
  (`rp-warn`, `ws-btn-quiet`, `ik-tag[data-tone=warn]`).
- **Phase 4, third piece: page 1 beside the record, "Use" per detail (no migration).** An intake for a new
  patient added **to a patient on file** (Screen F, `add_to`) lands on `?saved=intake&intake=<id>` as before;
  the record now says what the QR forms say there — "Added the forms (IN-…) to <name>'s record. Empty details
  were filled in, and the record has the health history <name> gave on page 1 (sent …). Kept from the record as
  well: …" — and lists each detail page 1 says differently, or a mobile or email the desk did not tick, with
  **Use <it>** (intent `intake-use`: `useIntakeDetail` in `intake.ts` → `useAnswerDetail` in `patient-add.ts`,
  the one writer `useFormDetail` now calls too; `TAKEABLE` only, never a name or the birth date; back with
  `?intake=<id>&used=<field>`). `intakeAnswers(q, intakeId, patientId)` is the read (an added intake of this
  patient's with a page 1). The Health section names the forms a version came from: `readHealth` joins the
  intake (`HealthVersion.intakeRef`, `formSentAt` is the intake's `sent_at` then) and the line reads "from the
  forms <name> filled in (IN-7K2F, sent 1 Oct 2026)". Checked by `phone-e2e.mjs` D: page 1 with a patient on
  file's name and birth date, Send waits, Screen F's panel says "Occupation: on file Nurse · on the forms
  Teacher", the record's callouts, Use Teacher, the Health line.
- **Phase 4, fourth piece: withdrawals and overrides, asked first and drawn (no migration).** The data of 039
  (`consent_withdrawal`, `consent_override`) now reaches the pages. **Ask first:** a form linked to a plan line
  (`consent_document.plan_item_id`) that is not agreed — to sign, to confirm, refused, withdrawn; "No photos" is a
  decision, not a gap (`consentGapsFor(q, patientId)` → by plan line and by visit; `ConsentGap`, `gapWords`,
  `gapWhy`; a form nobody explains is never "not explained") — shows the gap in amber under the line (`.tx-gap`)
  and turns Mark done into **Mark done anyway** with a reason box (`consent_reason`, `.tx-why`), on the Treatment
  plan and on the tooth panel's one-tap list alike. `plan-status` to `done` in `record.ts` runs `consentGaps`
  for the line: without a reason it refuses with the gap in words ("…: not signed yet. To mark it done anyway,
  say why in the box beside Mark done."); with one it records `overrideConsent(context 'plan_done')` for each
  gapped form in the same transaction, then writes the treatment. A form linked to **today's visit**
  (`appointment_id`) that is not agreed is a line on the This visit strip ("Consent form · <title>: not signed
  yet", Open the form, **Go ahead anyway** → a side panel `rec-ahead-<doc>` with a reason, intent
  `consent-override` on the record page, context `strip`, back to `?saved=consent-ahead&visit=`); once it went
  ahead today the line becomes a done pill that says so. **The calendar's In the chair asks too (1 Oct):**
  PATCH `/api/schedule` to `in_chair` runs `seatingGaps(tx, visit)` (the visit's forms not agreed that nobody went
  ahead without today, Manila); with any and no `consentReason` it answers 409 `{ error, consent: true, forms }`
  and changes nothing; with one it records `overrideConsent(context 'in_chair')` per form in the same transaction
  as the seat. `in_chair` needs `schedule.edit` only, never `records.edit`: seating is the desk's step and is
  never refused for paperwork. The board's visit panel (its teal step and More) and Today's patients' one tap
  (`panels.askSeat`) show the sentence in amber in the panel's callout, a box for why (`.vp-why`, `#vp-why-in`,
  16 px, 44 px) and **Seat anyway** (`data-vp-seat-anyway`); an empty box is not sent. Checked by
  `scripts/dev/schedule/seat-check.mjs` (the API's 409 and the today filter, the prompt from one tap, empty not
  sent, seated and kept, a visit with nothing to ask seated in one tap, contrast light and dark, 390 px). **Drawn:** `RecordDoc.overrides` (`overridesOf`, newest first;
  `overrideWords`: "Went ahead anyway (not signed), treatment marked done · Dr …, 1 Oct 2026, 2:31 pm: “…”") and
  the withdrawal in full (`withdrawalWords`: "Withdrawn 1 Oct 2026: told by …, by phone, recorded by …. “…”")
  on the Consent pane's rows (`[data-rc-withdrawal]`, `[data-rc-override]`), the visit panel's cards (a
  "Went ahead anyway ×2" pill and `rk` lines), the form's own page (a "Went ahead without this consent" pane),
  and the Treatment record: one `consent` row per override, "Went ahead without <title>", on the visit the form
  belongs to, naming the override's own day when it differs; the paper draws it too. Nothing blocks treatment;
  nothing hides that it went ahead. Checked by `phone-e2e.mjs` E at a clinic with a visit today (a plan line and
  an unsigned form planted on it: the strip, the refusal, the override rows, every place it is drawn, then a
  withdrawal of path B's signed form).
