# Open: read before shipping

*Moved here from `CLAUDE.md` word for word on 10 Oct 2026 (plan item 1.9). `CLAUDE.md` holds the rules; this file holds the detail. Where they differ, `CLAUDE.md` wins.*

## Open — read before shipping

- The Semaphore provider is written to their v4 API but has not been run
  against a live key; the first real send needs a registered sender name and
  a check of the response shape.
- Email (023) is off until `EMAIL_PROVIDER` and a verified sending domain are
  set on the server; until then reset, invitations and receipts are text-only.
- PRC licence checks are still a person's job; `prc_checked_on` stays null for
  self-added dentists until someone verifies, and the public profile says so.
- Billing is manual payment marked paid by operations; no gateway. Prices,
  pay-to details and the pause policy are placeholders in
  `src/lib/billing.ts`, and `BILLING_FINAL` (`src/lib/billing-config.ts`)
  stays false until the owner sets them: nothing is invoiced before that.
- Health history, allergies, birth date (021), patient billing (022), email
  (023), online payment of Flossify's own invoices (024) and offline charting
  (025) are built. Patient invoices are Flossify statements and
  acknowledgments only: BIR invoices still come from the clinic's registered
  booklet or system. `patient_balance()` is the one balance definition.
- Live since 24 Sep 2026: flossify.ph on Render (web + worker, Singapore) with DigitalOcean Managed PostgreSQL 17 (SGP1, trusted sources = Render's Singapore ranges).
- A person's page in Clinic settings edits their name, email and PRC number
  (031), and the public profile's own lines and the clinic's founding year
  have forms since 1 Oct (below, "Members the owner makes"); what a public
  page still hides when empty is only what nobody has typed.
- The privacy notice (consent version privacy-2026-09) says texts let patients
  "confirm or cancel by text" and does not mention the IP address stored with
  consent: a new consent version, reviewed by the owner's lawyer, is needed.
- `/privacy/` hardcodes the current `consent_version` id; publish a new
  version and the page together.
- Offline covers a chart that was already open, and nothing else: opening a
  record, the schedule or billing needs the line (the service worker keeps
  one record page, for at most 4 hours).
- Desk consent is recorded on Add patient and on the record (agreed at the
  desk, or a signed paper copy — `recordDeskConsent` / `recordPaperConsent`
  in `src/lib/health.ts`); web bookings write their own `patient_consent`.
- **The patient forms are closed on the live site until a new privacy
  notice is published** (`FORMS_PRIVACY_VERSIONS` is empty; see "Patient
  forms"). The notice must name every category the forms collect — health
  and dental history, home address, emergency contact, a parent's or
  guardian's details, Facebook, PhilHealth PIN and HMO card — why, who sees
  it, and that a form nobody adds is deleted after 30 days; the owner's
  lawyer reads it first. The consent to examination and treatment
  (`treatment-2026-09`) is Flossify's plain summary of the usual Philippine
  dental consent; a dentist and the lawyer read it too.
- **Going ahead without a consent form asks why** on the record (Mark done anyway, the strip's Go ahead
  anyway) and on the calendar (In the chair → Seat anyway, or Arrived → Check in anyway where the clinic asks at
  the door, 044), and never blocks.
- **The review pack** (`npm run review:pack`, `docs/review/review-pack.html`) is what the dentist and the
  lawyer read: re-run it after any change of words and send the new copy; each form's foot is its sign-off,
  and the fingerprint printed with it is what a `CONSENT_REVIEWED` entry is for.
- **The consent forms (039) are unreviewed drafts** (`CONSENT_REVIEWED` is empty), in force in the
  database from 1 Oct 2026; production offers none until a dentist and the owner's lawyer have read each. The
  Filipino "In short" lines for nine forms and the attestation's Filipino are not written yet.
- **Before a clinic depends on the scheduling round:** a dentist reads the chart-effect mapping and its
  sentences (should a crown over a charted root canal be offered? should one visit's offers be gathered into
  one?). The owner's three scheduling questions (turnover, p07 §7.1's held reminders, where the consent question
  comes) are each clinic's own setting since 044, defaulting to what shipped.
- **The paper record's open questions (3 Oct):** a dentist confirms our own chart codes (F, RCT, Impl, V) and the
  general consent pointers for Changes in treatment plan, Radiograph and Drugs and medications (or asks for forms of
  their own: new templates, versions and a migration, with the lawyer); the privacy notice (privacy-2026-09) does not
  name the desk's health history, and the paper fields add pregnancy, nursing, the pill, transfusions and third parties'
  names and numbers (physician, former dentist) — listed in the review pack for the lawyer; no dentist's signature is
  stored (the foot says "Dentist who explained"); a long archwire spec can wrap mid-spec in the printed Wire column. The
  baby teeth (built 3 Oct) ask the dentist two things in the review pack: whether a baby tooth lost naturally should be
  told apart from one extracted (both are M), and whether 13 is the right age to show them open; and the owner, whether
  an adult's printed record should carry the baby arch empty, as the paper form does (today it prints only when open).
  The chart's pictures (4 Oct) are simplified drawings: the review pack lists what a dentist should read (roots, cusps,
  how each finding is drawn).
- A new web patient's chart number is `W-` + (patients here + 1) (`api/bookings`): the app never deletes a
  patient, but one deleted by hand makes the next web booking for a new mobile fail on the unique key until
  another patient is added. Test scripts that share a database archive their patients instead of deleting.
- Patient forms throttles are estimates: 40 an hour per address and poster,
  8 a day per mobile, 300 a day per poster, 200 missed links an hour per
  address; 500 waiting forms per poster answers "full".
