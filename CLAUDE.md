# Flossify

> **Continuing work?** Read `docs/HANDOFF.md` (9 Oct 2026) next: where `main` and the open pull request stand, moving to another account, what to do first (`docs/simplify-plan.md` and the owner's 25 questions), and the two checks to run before changing anything: `scripts/dev/resume.sh`, then `scripts/dev/e2e.sh`.

> **Words and detail.** One word for each thing: `docs/glossary.md` (`npm run test:words` stops a retired word coming back). The detail of each area, moved word for word out of this file: `docs/features/` ("Where the detail lives", at the end).

Marketing site + prototype clinic workspace for dental practice software aimed at
Philippine clinics. Astro 7 (static), Tailwind v4 via `@tailwindcss/vite`.

```bash
npm install
npm run dev       # http://localhost:4321
npm run build
npm run preview
```

---

## Standing constraints

These came from the owner over many rounds and reversing any of them undoes
work that was already rejected once. Do not quietly relax them.

- **No 3D models.** A Three.js scene was built and deliberately removed.
- **No human faces** in any image. Equipment, teeth, braces, tools, empty rooms.
  Three photographs were deleted for containing people.
- **No tooth chart on the home page.** The odontogram lives on the patient
  record only, and was removed from the home page twice.
- **No invented clinic branding and no third-party brand marks in imagery.**
  Two generated shots were thrown away for lettering a fictional clinic name on
  a wall and for a real autoclave manufacturer's logo.
- The site is judged on **user experience and user-friendliness**, for **both
  patients and clinic owners**.

## Your decisions

The owner's decisions, in force, with the owner's words and dates where the record has them. The detail is in the
`docs/features/` file named in each heading. None of this is relaxed without the owner's yes.

### One look: the soft template, everywhere (design.md)
- **One look for the whole site, by the owner's decision (26 Sep 2026).** The owner called the Swiss workspace "hard,
  angry and dark" next to SwiftCare's "soft, friendly and accommodating"; then, of the soft workspace: *"I love what
  you've done! Now implement this kind of HUD/UI design and template to the whole site."* Every page uses the soft
  template in `docs/workspace-redesign.md` ("The soft template", "The whole site, soft", "Site API").
- **The template** (values: design.md): white cards with gently rounded corners, a hairline, at most a whisper of
  shadow; slate words, never black; one calm teal for the main action and the chosen thing; green, amber, blue and a
  soft red each mean one thing; dark mode soft charcoal, never pure black. Inter or the device's own face, no web font
  fetched; IBM Plex Mono (self-hosted) only for reference numbers; sentence case. One teal button per screen (the public
  bar's goes `cta="quiet"` where the page has its own); line icons; initial avatars; tinted callouts in plain words.
- **Frames:** a soft top bar on public pages (a drawer on phones); in the workspace a left sidebar with **four tabs**:
  Dashboard · Patients · Finances · Clinic settings. My visits uses the same sidebar pattern with its own two items, My
  visits · Find a clinic (`me/_Shell.astro`); its way in (/me/, /me/code/) is the patients' bar over one card.
- **Light or dark is the person's choice** (`ThemeSwitch.astro`, `localStorage.theme`). Every dark rule needs both
  twins: `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) … }` and `:root[data-theme="dark"] …`.
- **Measured everywhere:** targets ≥ 44px, fields ≥ 16px, contrast ≥ 4.5:1 against the worst pixel behind the words,
  light and dark, at 1440 and 390, no sideways scroll. Muted slate on a pale tint is 4.48: use ink-2 or the tint's ink.
  **Exceptions:** the SwiftCare sample (its own design), print pages (black on white), the record's sheets (paper).
- **Frosted glass where a clinic is the background** (design.md, "Frosted glass"). The owner, 26 Sep 2026: "make the
  panels translucent … so more of the background can be seen". Glass on the home page, /start/, /find/, /coverage/,
  /me/, a clinic's page and booking, and /websites/; a dentist's page stays opaque. Glass uses the `--glass-*` tokens;
  measure again before making it clearer. A clinic's page stands on **that clinic's own** first uploaded photo (`up:`
  key) or a soft blur, never a house or stock photo, which would read as its interior; every line passes over an
  all-black, all-white and striped cover, and on a clinic's own site words stay on glass.

### The home page, its film and the staff entrance (home-film.md, sign-in-and-people.md)
- **The owner's layout (25 Sep 2026):** *Your clinic, in the Web* — "Switch to paperless, seamless, effortless daily
  operations:" with *Open your clinic in the web* (/start/) and *I'm a Patient* (/find/); Services; How it works;
  Pricing, ₱800 a month per branch, everything included (`PRICE_PER_BRANCH`, the one number); Partners (clinics really
  listed); How to register; Know the team (real people only, left out while empty). Lists name only what is live.
- **The film is the ground of the whole home page**: the owner asked for "a video that shoots all the page". One 39.8s
  film, street to chair, scrubbed by the page's scroll; its times live only in `src/data/film.ts`. H.264, 5-frame GOP.
- The owner, 26 Sep 2026: "make the pages in the home page more compact and make the panels translucent so more of the
  background can be seen": 60% white on a 24px blur (74% charcoal in dark mode), lowest 4.7:1 over the film. On the
  glass: ink words, ink-2 small print (never muted grey), links in `#06403e` (the pale `#98e3dc` in dark mode).
- **No footer and nothing fixed at the foot.** The owner removed the readout rail and the link footer: "the footer takes
  too much space … label each page on the site itself". Pages are labelled where they are: the bar's pill from 1180px
  ("Services · Reception"), each section's title, and the "Clinic sign-in" pill on the staff entrance. The footer's
  links are in the header nav; the copyright is one line on the last page.
- **Motion is always on, for every visitor, with no switch.** The owner said it twice, the second time: "THE CINEMATIC
  MOTION SHOULD ALWAYS BE ON, ITS NOT AN OPTION". If accessibility comes up, raise it with the owner.
- **The staff entrance** is one compact white card on the film. The owner: "make the boxes translucent and compact so
  that the video background is still emphasized". A clinic's door stands on its own cover, never the film. **Shared is
  the default**, on phones too: Shared signs out after 12 hours and remembers nothing; My own lasts 14 days.

### The Dashboard and the day (schedule.md)
- The owner (3 Oct): "imagine you're a dentist who also manages his own clinic, make the clinic site suitable for your
  operations with ease of access and better user experience". The Dashboard is the first screen of the day: Next for
  you, a slim row of four numbers, tasks and the website's lane only while something is open. One teal: New booking. An
  owner or admin with a column at the clinic counts as someone who treats (Mine · Everyone, Next for you).
- **Blocked time (040)**, the owner's first ask of that round: blocked time that both the calendar and online booking
  respect. **How the day runs (044):** the owner's three questions (time between visits, holding reminders in closed
  time, where the consent question comes) are each clinic's own choice; every default is what shipped before.

### The patient record (record.md)
- **The record is a paper chart.** The owner (2 Oct 2026) first asked for "one seamless page, where all details are
  shown, and a plus sign appears next to editable or addable", then: "its still too complicated, imagine that the
  patient records is a paper record, simple, uneventful but effective". Also 2 Oct: "make it less space consuming and
  more organized, like a real dental record", and "make the UI/HUD simpler and less spacious … in the patient records".
- **Three sheets (3 Oct 2026):** "make the patient records as simple as this, better a digital copy of the real form",
  then "make it a better but still simple like that": Page 1 (letterhead, the chart, patient information, dental and
  medical history), Page 2 (Informed consent), Page 3 (Treatment record), then the attached sheets, folded.
- **On paper (4 Oct 2026):** "make the patient record panel look like it's a paper record instead of the normal template
  design". The same paper in both themes, filled-in values in blue pen ink, allergies red. The owner (27 Sep): "make
  each specific detail more visible … their own pill": still so elsewhere; on the sheets, plain words and ruled lines.
- **The chart (4 Oct):** "in the baby teeth, put the chart on the right side so it's visible": from 1440 the baby arch
  sits under the permanent one, so the chart note and its mouth map stay on the right beside the teeth. "in the teeth
  chart, integrate a picture image of the teeth (or whole mouth image) for easy identification": each tooth's side view
  is drawn beside its box and a whole-mouth map heads the chart note, all drawn (`tooth-drawing.ts`), never an image.
  Baby teeth open under 13, or when a baby tooth has a finding or work; else behind one Baby teeth pill.
- **The visit panel:** "the full details of the patient's visit": a visit pops out the doctor, the consent form, the
  signature (the patient signs on an iPad), the procedure, the tooth, the time and the amount paid. **The Treatment
  record:** "rename the timeline to "Treatment record" and make it as such". **The paperless day (036):** "be the
  manager and the dentist owner, improve the experience for the clinic, the staff and the patient".

### Patients' own forms, the sample site and the plan (patient-forms.md, sample-sites.md)
- **Desk poster forms (028):** the owner asked for a QR code a clinic prints and posts at reception; Add patient offers
  it second of three, marked *Easiest*. Owner's call: the contact fields keep their autofill tokens for the patient's
  own phone (to trade that for a shared tablet, drop the tokens from `STEPS`).
- **The owner (29 Sep 2026): Add patient by QR or at the clinic, step by step** — before the QR the staff tick which
  consent forms the procedure needs; page 1 patient information, then the consent forms, then the profile is made. The
  owner's four answers: procedure forms are signed only after the named dentist records "I explained this"; the profile
  is made at Send unless the patient looks like one already on file; a fresh signature on every form with initials on
  the risks; the six scheduling features first. Signed forms show on the visit panel and the Treatment record.
- **The SwiftCare sample** is a concept redesign of a real clinic's site, made with the clinic's public branding,
  photographs and price list at the owner's direction; some photographs show people, because the no-faces rule governs
  Flossify's imagery, not a client's. If that relationship ever changes, swap the folder for a fictional clinic rather
  than editing it in place. Its own design, `noindex`, labelled a concept, no third-party fonts or scripts, motion on; a
  dentist reviews its health copy before any real client ships.
- **The plan (6 Oct):** "can you plan on simplifying the whole site" (`docs/simplify-plan.md`): one way to do each
  thing; one teal button; say it once; one word for each thing; show only what has something in it, but never hide
  safety alerts, consent gaps or legal lines; the first screen is for the task; measure before and after.

## Retired — do not bring back

Each was built and taken out, or proposed and refused; bringing one back undoes a decision. The source is in brackets.

- **Everything under Standing constraints**: 3D models (a Three.js scene, removed); human faces in Flossify's own images
  (three photographs deleted; a client's own photographs are the client's, as in the SwiftCare sample); a tooth chart on
  the home page (removed twice); invented clinic branding or third-party marks (two generated shots thrown away).
- **The Swiss rules** (no radius, no shadow, uppercase mono labels, Archivo), retired 26 Sep 2026 after the owner called
  the Swiss workspace "hard, angry and dark" (design.md, `docs/workspace-redesign.md`).
- **Black** buttons, blocks or words, and a pure-black dark mode (print pages and the record's paper excepted);
  **fetched web fonts, Google Fonts above all** (a third-party connection); uppercase typewriter labels (design.md).
- **White, roomy cards on the home page's film**: "make the pages in the home page more compact and make the panels
  translucent so more of the background can be seen" (26 Sep). On that glass, muted grey words and the deep teal
  `#0b5d5b` for links (3.5:1 over the blurred hedges) (home-film.md).
- **A house or stock photo behind a clinic's page**, the film behind its door (design.md; sign-in-and-people.md).
- **The film kept to the opening** ("a video that shoots all the page"); home-page section numbers (home-film.md).
- **The readout rail fixed to the bottom of the viewport, and the link footer after the last page**: "the footer takes
  too much space … label each page on the site itself" (home-film.md). Nothing fixed at the foot of any page.
- **A way to turn the motion down, in any form** (a film with no `src`, which showed the owner stills; dimmed motions; a
  `prefers-reduced-motion` block, the `force-motion` class or `?motion=on`), in Flossify or the sample: "THE CINEMATIC
  MOTION SHOULD ALWAYS BE ON, ITS NOT AN OPTION" (home-film.md, sample-sites.md).
- **A placeholder person in Know the team**, or a service or price that is not live. **A different video format for the
  film**: VP9 was larger (5.05MB against H.264's 4.77MB) at worse quality (home-film.md).
- **The four-tab record** (draft PR #52): the paper record replaced it at the owner's request; whether any piece of it
  carries over is still the owner's call (`docs/HANDOFF.md`).
- **The record's colour groups and banners** (27 Sep, kept on the one seamless page of 2 Oct: hue banners, group
  colours, `sections.ts`, icon tiles, lines saying what a part is for): "its still too complicated, imagine that the
  patient records is a paper record …" (2 Oct; record.md).
- **Twelve numbered parts**: "make the patient records as simple as this, better a digital copy …" (3 Oct; record.md).
- **On the record's screen** (record.md): number tiles, Health in short, Recent visits and Treatment in short (the paper
  chart, 2 Oct); the head's avatar, count lines ("1 on record"), lines that explain the page and the Findings line
  ("make the UI/HUD simpler and less spacious … in the patient records", 2 Oct); the facts line and the four numbers
  (the three sheets of 3 Oct: the paper says each fact once).
- **"Timeline"**: "rename the timeline to "Treatment record" and make it as such" (record.md, glossary).
- **A visit status form on the old Today page** that changed a visit without the schedule's checks (a post to
  `/c/<slug>/`, 6 Oct). **A "Clear chart" button on the record**: one tap wiped every finding (6 Oct; `clearAll` stays
  off). **A separate "Update the chart?" for baby teeth**: a baby tooth gets the same offer as any other (record.md).
- **"Sign on this tablet" as the per-visit button**: it is *Sign consent for this visit* (6 Oct, plan 1.5; record.md).
  "Sign another consent" is a retired word, still on the visit panel until 2.32 (glossary).
- **A bare "No such clinic"**: a missing clinic or dentist page is the site's 404 page (6 Oct; sign-in-and-people.md).
- **Retired words** (Team, appointment, Messages, Timeline, invoice for a statement, recall, odontogram, strip …): the
  Not column of `docs/glossary.md`; `npm run test:words` stops them coming back.

**Decided not to do**: `docs/simplify-plan.md` section 7 gives each, with its reason (the phone film held back until a
scroll, symptoms merged with services, Open now for urgent symptoms, phones defaulting to My own …).

## Rules that protect patients, consent and money

Breaking one could harm a patient, leak data, weaken consent or privacy, misstate money, break a deploy or lose data.

### Data and access
- **The app is never a superuser**: it connects as `flossify_app`; `src/lib/db.ts` refuses a superuser (backend.md).
- **Every clinic query goes through `withClinic(clinicId, fn)`**; RLS does the isolating, not a `where clinic_id = …`.
  **Staff is keyed by group and is not under RLS**: branch access is `staff_access`, re-checked on every request
  (`requireWorkspace`, `canOpen()`). At sign-in, branches are read through the definer `staff_branches()`; a clinic's
  door reads only `clinic_door(slug)`, and `authenticateAt()` lets in only someone with `staff_access` to that clinic
  (backend.md, sign-in-and-people.md).
- **Public reads go through security-definer functions** that return a clinic's public face only: a new public field is
  added there, never by opening a table. They never return a note, an author, or time away told apart from a day off.
  Operator reads are `admin_*` definers with exactly the columns a page shows, behind `requireAdmin()`.
- **The forms' public side has no tenant**: only its definers (`patient_form_submit`, `intake_*` through `intake_gate`,
  which locks the intake first, then its link, as every desk write does); the clinic comes from the key, never the page;
  answers are status words, so none reaches a log (patient-forms.md).
- **What someone may do is `can(ws, key)`**, never a role name (`staff_can()` in SQL); pages only show or hide, and each
  page and API refuses on its own. The rank rules (`src/lib/roles.ts`) are re-checked on the server: you change only
  people below your role and give only roles below yours whose every key you hold; never the Owner role, never your own.
  `DEFAULT_ROLES` and `clinic_default_roles()` change together (sign-in-and-people.md).
- **Sessions**: signed cookies, scrypt passwords; a password change bumps `staff.token_version` and signs out every
  other session. Every form post carries `<Csrf />` and checks `csrfOk()` first; JSON calls send `X-CSRF`; Astro's
  Origin check stays on. Rate limits are `hit()` with `LIMITS`; behind a proxy set `TRUST_PROXY=1` (backend.md).
- **A sign-in code is for the phone it was texted to**: nothing that renders `message_log.body` shows `reset` or
  `invite` rows (a dentist once could read the owner's reset code). `/auth/forgot/` never says whether a number is
  known; the reset and patient code pages never put a mobile number in a URL (backend.md).
- **One email and one mobile per staff account across the service.** A patient is their mobile number (`/me/`,
  `patient_visits(phone)`), matched on the number only, never on a name. `auth_event` never joins to a patient.
- **Every /c/ response is `Cache-Control: no-store`** (patient-forms.md). The service worker caches no API, upload or
  /c/ page but the open chart's record (marked, 4 hours at most, dropped at sign-in and sign-out: `public/sw.js`,
  backend.md). Patient files are served only by `patients/<id>/files/<file>/`, never `/uploads/` (record.md). Tasks hold
  no patient details (sign-in-and-people.md).
- **Every look at a record is logged**, as its foot says: its print (`record.print`), the Treatment record's and
  aftercare's prints, each file viewed or downloaded (record.md). Every standalone workspace page (a printout, a file
  view, the signing page) carries `ParkedGuard`, so it leaves when the desk's device is handed over (patient-forms.md).

### Consent and privacy
- **Consent is a record, not a boolean** (012): `patient_consent` names the `consent_version` agreed to, when and how.
  Every booking writes one. Never claim NPC registration before it is true (backend.md).
- **The privacy notice is versioned**: `/privacy/` hardcodes the version id, so publish both together; its two-year
  promise for text logs and `retention_purge()` change together (backend.md, open.md).
- **Desk poster forms stay closed live** until the notice in force is in `FORMS_PRIVACY_VERSIONS` (RA 10173 s.13(a)): a
  new `consent_version` (by migration; the app only reads them), the notice's words and that id, lawyer-read.
- **No consent form is offered in production until reviewed**: `CONSENT_REVIEWED` stays empty until a dentist and the
  owner's lawyer have read each; an entry is for the fingerprint printed with that form's sign-off in the review pack.
  The tablet's per-visit signing already offers `treatment-2026-09` live (plan 1.6).
- **Words are pinned**: `consent_version.body_sha256` equals `libraryHash(template)`; new words are a new version and a
  new row in one change (`npm run test:consent`), then `npm run review:pack`. Consent words, the privacy notice, the
  paper sheets' headings and the BIR wording are legal changes, made with the owner's lawyer and only with the owner's
  yes; the forms' questions, printed papers and aftercare also change only with the owner's yes.
- **What was signed is frozen**: a consent form's clinic part is fixed once the dentist attests it, it is signed or it
  is printed for paper; a signed form is never cancelled. The database computes the snapshot hash and the seal;
  `consent_chain` is written only by a definer trigger. Only the named treating dentist with a PRC licence attests,
  before any signing; Sign again never copies an attestation; adding forms to a patient on file re-checks the signer
  against the record's birth date (patient-forms.md). A signature is strokes, never an image (record.md).
- **"Consent signed for this visit" has one rule**, `visit_treatment_consented()`. A visit is signed only while it is
  going ahead (`canSign`); under 18, a parent or guardian signs; `signVisit()` re-checks in the transaction (record.md).
- **Going ahead without a consent form asks why and never blocks**, and nothing hides that it went ahead. Seating needs
  `schedule.edit` only and is never refused for paperwork (patient-forms.md; the door: schedule.md).
- **A form is not a patient**: one nobody added is deleted after 30 days. Added to a patient on file it fills only what
  is empty, never a name, and never a mobile or an email unless the desk ticks it; Use <it> is `TAKEABLE` only. A mobile
  alone never makes a match strong; the app writes a form's decision columns, never its answers; a resend with other
  answers is never told the first one's reference; a retired forms key accepts nothing and never comes back. On the
  step-by-step forms a patient on file types their birth date before anything of the record is drawn. A clinic tablet
  never holds a staff session; handing the desk's device over signs the desk out (`/auth/park/`).
- **The forms page brings back nothing one person typed for the next.** A real poster's link always opens. After any
  change to the QR drawing, decode it again (patient-forms.md).

### Records
- **Every record write is one post** with an `intent` in `RECORD_INTENTS`, `canEditRecords` in the same transaction,
  audited `record.*`; a refused post is rolled back (`Refused`). A new attached part goes in `PART_OF` (record.md).
- **Insert-only for the app** (never grant it update or delete): `clinical_note` (a signed note is never changed; a
  correction is an addendum, `amends_id`), `prescription`, `vital_sign`, `clinical_letter` (but its reply columns),
  `plan_adjustment`, `visit_consent`, the consent signings, attestations, confirmations, withdrawals and overrides,
  `capacity_note`, `intake_event` (never an answer), `day_close` (the newest counts), `appointment_contact`. Treatments
  done are never deleted; a removed file is hidden (`removed_at`); every health history save is an insert.
- **What a patient did not tick is not evidence it is gone**: allergies, conditions and medicines carry into a new
  version, and the form never pre-ticks Yes over a patient's newer No. A paper alias is only a real re-spelling, never a
  narrower or wider word (`paper-history.ts`). Allergies are red, alerts amber; safety alerts are never hidden.
- **A save reads a field only when the form says it carried it** (`has_paper`, `has_paper_fields`, `has_work_choices`,
  `ptr_seen`): an older form keeps what is saved, and one changing a PTR changed elsewhere since is refused.
- **Chart edits save as made** (`POST /api/chart`). Offline changes reach the server once (`sync_change`); when a
  colleague charted the same tooth first, their finding stays and the person is told, never resolved silently.
- **The chart after a treatment is an offer, applied only by a tap**: `procedure_catalog.chart_effect` (042), never
  guessed from a name; `chartFromRecord` checks the sign-in, takes the chart lock, then checks the tooth is unchanged. A
  picked tooth that differs from the typed one is refused (`pickedTooth()`).
- **Papers**: a prescriber or a letter's signer needs a PRC licence on file; the medicine box suggests generic names,
  never a dose; a PTR is copied at the save and only the copy prints; never join `staff.ptr_*` with `r.*` / `l.*`. Blood
  pressure bands are a guide, not a diagnosis. **PRC checks are a person's job**; no number, no check (046).
- **The letterhead names this clinic only**, no logo. Page 2 says "Dentist who explained", never a signature (none is
  stored); its foot shows the newest agreement still standing, never a withdrawn or refused one; a pointer to the
  consent to treatment is a reference, never a claim that it covers that treatment.

### Money
- **`patient_balance()` is the one definition of what a patient owes.** The Treatment record's last figure must equal
  it, else none shows and the server logs the patient id, never the name; screen and paper share `buildLedger`.
- **Only statements are charges** (a treatment's price is a fee-guide estimate), never matched by description.
  `createStatement` takes the `charge:<patient>` lock and refuses a treatment already on a statement that is not void. A
  payment plan's money is one statement, and a statement an active plan is built on cannot be voided.
- **Amounts need `finance.money`** (balances, takings, claim amounts: Finances, Close the day, claims, Texts);
  `finance.bill` opens Finances to charge and take payments. On the patient record (Account, the Treatment record on
  screen and paper, making or stopping a payment plan) money needs `finance.bill`: without it, no peso sign. A secretary
  has `finance.bill`, not `finance.money`, by default; the Flossify plan's strip needs `plan.pay`.
- **A senior or PWD discount is filled only from the latest statement neither void nor a draft** (`lastDiscountFor`),
  named, with the card to be checked; never for a patient found by search: `/api/patients` carries no ID numbers.
- **No clinic is invoiced while `BILLING_FINAL` is false**: flip it only when the prices, pay-to details, billing email
  and pause policy in `src/lib/billing.ts` are the owner's real ones. A late payment switches nothing off (backend.md).
- **Flossify is not a BIR invoicing system**: statements and acknowledgments only, and every paper keeps that line.
  Never invent PhilHealth rules (`coverage.astro`); HMO chips say "confirm with your HMO".

### Booking, the schedule and texts (find-a-clinic.md, schedule.md)
- **Only times the clinic can honour** (a request-only clinic gets no calendar); no account; undo after booking; a
  consent tick on every booking; status in Manila time, never colour alone. **Every trust claim names its source** ("PRC
  licence · checked <date>": a person looked it up); specialty only for the seven Board-recognised fields.
- **One booker at a time per clinic**: `/api/schedule` and `/api/bookings` take
  `pg_advisory_xact_lock(hashtext(clinic_id))` and re-check inside the transaction; `slotOpen()` is the one rule.
- **The status machine is the server's** (`NEXT_STATUS`, `applyStatus`). Every status change goes through
  `/api/schedule`; the Dashboard takes no posts. A clash always wins (`findClash`, no anyway) (schedule.md).
- **A request is not a booking until the desk sets a time**: `source = 'request' and moved_at is null` (018); gating on
  `source` alone locked patients out for good. Only a move stamps `moved_at`; an edit never does.
- **Blocked time is a soft stop for the desk** (`anyway` → `blocked_ok_at`) and a hard one online (`/api/bookings` never
  reads `anyway`). A block is only added or removed. The Unplaced lane is the inbox: never hide it.
- **The app never deletes a patient**: a web patient's chart number is `W-` + (patients + 1), so tests archive theirs.
- **Texts are queued, never sent, by the app** (`queueText()` in a clinic transaction); only `npm run sms:worker` sends.
- **No links in any text, and no text asks for a reply.** Name the day ("Thu 24 Sep, 9:00 am"), never "tomorrow";
  promise a reminder only when one will come (`willRemind`). Patient texts wait through 9 pm–8 am Manila.
- **A reply belongs to the clinic that last texted that number** (`sms_inbound()`); replies arrive as JSON with
  `X-Inbound-Secret`. The reminder's words live in migrations (019, 036), so new words are a new migration.
- **A move drops the texts that named the old time** (`dropStaleTexts`); `retellTexts` stays in step with
  `sms_enqueue_reminders`; a held reminder never touches a text already sent (schedule.md).

### Deploy, the database and working on this repo
- **Settings are read from `process.env` at run time, never `import.meta.env`** (a build once carried `DATABASE_URL` and
  `SESSION_SECRET`); `src/lib/env.ts` refuses an unsafe production start (backend.md).
- **`security.allowedDomains` in `astro.config.mjs`** lists the hosts (`EXTRA_HOSTS`), or every form post is 403.
- **Never edit an applied migration or `schema.sql`**: a change is a new numbered file (the newest is 046), with no
  BEGIN/COMMIT inside. Never put `--allow-late` in `render.yaml` or the `Procfile`.
- **`npm run db:setup` drops the database**: never run it, or a test, against `flossify_dev` or without `DB=` naming a
  throwaway database. `seed.ts` and `SHOW_DEMO_LOGINS` are local only. After a merge, check `/healthz` answers 200.
- **Never type the owner's passwords, API keys or tokens**: the owner enters secrets. Their email only identifies them.
- **Never open the SwiftCare admin links** or keep its screenshot; nothing from the photos of a real clinic's paper
  record goes in the repository, a test or a document. Both showed real patients.
- **Never delete audit rows** (`audit_log`, `auth_event`) to tidy up; archive test patients.
- **Work on a branch; merge only when the owner says "merge"**; the pull request says what changed and how it was
  measured. Tools go under `scripts/dev/` or `docs/`, never only in a scratchpad.
- **Code:** component rules stay inside `@layer components` in `global.css`, and the workspace must not change when the
  site's classes do (compare its computed styles before and after; design.md). A hook queried with `querySelector` gets
  a `data-*` name nothing else uses; scripts toggle the `hidden` attribute, never the class (find-a-clinic.md). A page
  at a new first path segment goes on `RESERVED` in `src/lib/slug.ts` (sign-in-and-people.md).

## Verification — measure, do not eyeball

Every bug that cost real time in this project was invisible in the markup and
invisible in a glance. Screenshots are for judging design; numbers are for
judging correctness.

- Read back `getBoundingClientRect()` after layout changes.
- Sample computed colours and compute contrast ratios; do not judge by eye.
  Small mono text is 12px, so it needs **4.5:1**, not 3:1.
- For video, extract real frames with ffmpeg and measure against those.
- `node scripts/film.mjs shots http://localhost:4399/` runs the film checks
  headlessly (document scroll → currentTime, frame luminance per stop, rail
  state, panes, rail clearance, 1440px, Reduce Motion, 390px). It needs a VP9
  copy at `dist/client/video/tour-test.webm`; the header of the script says
  how to make one. Copy it in after every build — `dist/` is rebuilt clean.
- Check `prefers-reduced-motion`, keyboard order, and 390px width every time.
- The owner's Mac has Reduce Motion on, and the site ignores it everywhere
  (see The tour). A headless check emulating `reducedMotion: 'reduce'` must
  now show the *same* motion as a normal one — that is the test.

## Traps already hit

- **`@layer components`** — unlayered, `.media { position: relative }` beat an
  `absolute` utility and parked the hero photo at intrinsic size in a corner.
- **`.gitignore` anchoring** — a bare `shots/` also matched `public/shots/`, so
  the screenshots the home page depends on were silently untracked. Anchor
  repo-root-only ignores with a leading slash.
- **Minified template literals** — the bundler emits `` `/video/x.mp4` ``.
  Path-rewriting that only handles `"` and `'` misses it and 404s the film.
- **CSS asset URLs are absolute and unquoted** — `url(/fonts/x.woff2)`. Rewriting
  the HTML is not enough; rewrite the stylesheet too.
- **Headless Chromium has no H.264**, so the shipped MP4 cannot be played in it.
  Verify the scrub mechanism with a VP9 copy and the visuals from decoded frames.
- **Screenshot selectors** — the first `<table>` on the workspace is HMO claims,
  not the day queue. Pin captures to heading text (`scripts/shoot.mjs`).
- Do not `pkill -f 'astro preview'`; it kills the agent's own shell. Use a new
  port instead.

## Open — read before shipping

`docs/features/open.md` lists what is still open: what waits on the owner (Semaphore's first live text, email, billing's
real values, the deploy log's `046:` line), on the lawyer (a new privacy notice, since privacy-2026-09 says texts let
patients "confirm or cancel by text", before the desk poster forms open live) and on a dentist (the consent forms and
the review pack), and the known limits. **The owner decides** the 25 questions (`docs/simplify-plan.md` section 5) and
PR #52 as a 26th: whether its pinned allergy line, Today's one-button visit lines and deep-link check come into the
paper record, or it closes (never merge it or resolve its conflicts mechanically); the empty baby arch on an adult's
print; an emergency hold and Philippine holidays.

## Where the detail lives

The `docs/features/` files keep old sections word for word under their old headings ("The tour", "Patient forms" …).
Where a rule here differs from one, this file wins; detail this file leaves out still holds.

| File | Old headings it holds | Read it before |
|---|---|---|
| `docs/features/design.md` | "Art direction — soft clinical, everywhere" (its "Frosted glass" paragraph too) | changing any page's look, colours, glass, theme or `global.css` |
| `docs/features/home-film.md` | "The tour" (its "The film" part too) | touching the home page, the film or the public bar's readout |
| `docs/features/sample-sites.md` | "Sample client sites — `public/samples/`" | touching the SwiftCare sample or /websites/ |
| `docs/features/sign-in-and-people.md` | "The staff entrance — `/auth/login/`, `/auth/forgot/`, `/auth/code/`"; "Clinic doors and usernames — `/<clinic>/sign-in/` (029)"; "Roles and permissions (030)"; "Members the owner makes (031)"; "Tasks (032)" | sign-in, a clinic's door or own site, roles, People, My page, tasks |
| `docs/features/find-a-clinic.md` | "The patient side — `/find/`" | Find a clinic, a clinic's page, online booking |
| `docs/features/backend.md` | "Backend — Postgres, RLS, sessions"; "Production — settings, database, deploy"; "Round three — operations, patients, billing, compliance, chart, PWA, claims" | the database, sessions, texts, settings, deploy, /admin/, /me/, billing, claims, offline |
| `docs/features/schedule.md` | "The schedule — `/c/<slug>/schedule/`"; "The dentist who runs the clinic (3 Oct) — the Dashboard as a dentist-owner's home"; "Blocked time (040) — lunch, closed days, a dentist's hours and leave, a chair out of use"; "How the day runs (044) — the owner's three questions, as each clinic's own choice" | touching the calendar, the Dashboard, Calls, blocked time or reminders |
| `docs/features/patient-forms.md`; `docs/intake-design.md` (the step-by-step forms as built, the owner's four answers) | "Patient forms — the QR code on the desk (028)"; "Add patient, step by step (039) — phase 1: the consent library and the data" | the desk poster forms, the step-by-step forms, consent forms, tablets |
| `docs/features/record.md` | "The clinical record (033) — Treatment record, Treatment, Notes, Prescriptions, Files, next check-up"; "The record's paperwork (034) — blood pressure, letters, HMO LOA, payment plans"; "The visit panel and the signed consent (035)"; "The Treatment record — page 4 of the PDA dental chart"; "The paperless day (036) — arrival, this visit, checkout, texts after, the desk's lists" | touching the patient record, the chart, papers, the visit panel, checkout, Close the day |
| `docs/features/open.md` | "Open — read before shipping" (condensed above) | shipping anything a clinic will rely on |
| `docs/features/layout.md` | "Layout" | looking for where a page, library or migration lives |
| `docs/glossary.md`, `docs/review/review-pack.html` | — | writing any word a patient or the staff will see (`npm run test:words`); changing words a patient signs or a dentist must read (`npm run review:pack`) |
| `docs/HANDOFF.md`, `docs/simplify-plan.md` (`.html`) | — | starting a session (where `main` stands, the checks to run first, the cloud recipe); any change (the plan, its build order, the owner's 25 questions; `docs/simplify/` has its evidence) |
| `docs/workspace-redesign.md` | — | the workspace shell, the soft template's tokens and the Site API |
| `docs/deploy.md`, `docs/launch.md` | — | deploying; the owner's launch checklist |
| `docs/generation.md`, `docs/service-map.md`, `docs/clinic-sites-design.md`, `docs/clinic-operations.md` | — | the film, the patient side, clinic doors and sites, the paperless day: the briefs they were built from |
