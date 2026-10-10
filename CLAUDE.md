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
  angry and dark" next to SwiftCare's "soft, friendly and accommodating"; after seeing the soft workspace: *"I love
  what you've done! Now implement this kind of HUD/UI design and template to the whole site."* Every page, public,
  workspace and /admin/, uses the soft template in `docs/workspace-redesign.md` ("The soft template", "Site API").
- **Surfaces:** white cards; corners 12px on cards, 16px on big cards and sheets, 10px on fields and buttons, 999px on
  pills and avatars; a hairline (`#e6e9ee`), at most a whisper of shadow. No black buttons, no black blocks.
- **Colour:** slate words, never black (`#1f2937`, `#475467`, muted `#667085`); one calm teal for the main action and
  the chosen thing (fill `#0e7471` under white words, `#0d706d` words); green for money in, amber for "needs
  attention", blue for information, a soft red for "blocked", each with a pale tint and its own darker words. Dark
  mode is soft charcoal (`#15191e` page, `#1d232a` cards), never pure black.
- **Type and pieces:** Inter where the device has it, else the system's UI face; no web font fetched from anywhere;
  IBM Plex Mono (self-hosted, `public/fonts/`) only for reference numbers; sentence case everywhere. One teal button
  per screen (the public bar's Open your clinic goes `cta="quiet"` where the page has its own); line icons
  (`ws/Icon.astro`); round initial avatars; tinted callouts with an icon, in plain words.
- **Frames:** a soft top bar on public pages (`SiteHeader.astro`, a drawer from the left on phones); in the workspace a
  left sidebar with **four tabs**: Dashboard · Patients · Finances · Clinic settings; My visits has the same.
- **Light or dark is the person's choice** (`ThemeSwitch.astro`, `localStorage.theme`). Every dark rule needs both
  twins: `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) … }` and `:root[data-theme="dark"] …`.
- **Measured everywhere:** targets ≥ 44px, fields ≥ 16px, contrast ≥ 4.5:1 against the worst pixel behind the words,
  light and dark, at 1440 and 390, no sideways scroll. Muted slate on a pale tint is 4.48: use ink-2 or the tint's ink.
- **Exceptions:** the SwiftCare sample (its own design), print pages (black on white), the record's sheets (paper).

### Frosted glass where a clinic is the background (design.md, "Frosted glass")
- The owner, 26 Sep 2026: "make the panels translucent … so more of the background can be seen". Glass on the home
  page, /start/, /find/, /coverage/, /me/, a clinic's page and booking, and /websites/; a dentist's page stays opaque.
  Glass uses the `--glass-*` tokens; measure again before making it clearer.
- A clinic's page stands on **that clinic's own** first uploaded photo (`up:` key) or a soft blur, never a house or
  stock photo, which would read as its interior. Every line passes over an all-black, all-white and striped cover
  (`room-tone.ts` calms busy uploads). On a clinic's own site keep words on glass (lowest 5.3:1).

### The home page and its film (home-film.md)
- **The owner's layout (25 Sep 2026):** *Your clinic, in the Web* — "Switch to paperless, seamless, effortless daily
  operations:" with *Open your clinic in the web* (/start/) and *I'm a Patient* (/find/); Services; How it works;
  Pricing, ₱800 a month per branch, everything included (`PRICE_PER_BRANCH`, the one number); Partners (clinics really
  listed); How to register; Know the team (real people only, left out while empty). Lists name only what is live.
- **The film is the ground of the whole home page**: the owner asked for "a video that shoots all the page". One 39.8s
  film, street to chair, scrubbed by the page's scroll; its times live only in `src/data/film.ts`. H.264, 5-frame GOP.
- The owner, 26 Sep 2026: "make the pages in the home page more compact and make the panels translucent so more of
  the background can be seen". Cards centred at 1160px; 60% white on a 24px blur (74% charcoal in dark mode); lowest
  4.7:1 over the film. On the glass: ink words, ink-2 small print (never muted grey), links in `#06403e`.
- **No footer and nothing fixed at the foot.** The owner removed the readout rail and the link footer: "the footer
  takes too much space … label each page on the site itself". Pages are labelled where they are: the bar's pill from
  1180px ("Services · Reception") and each section's title. The copyright is one line on the last page.
- **Motion is always on, for every visitor, with no switch.** The owner said it twice, the second time: "THE CINEMATIC
  MOTION SHOULD ALWAYS BE ON, ITS NOT AN OPTION". If accessibility comes up, raise it with the owner.

### Signing in (sign-in-and-people.md)
- **The staff entrance** is one compact white card on the film. The owner: "make the boxes translucent and compact so
  that the video background is still emphasized". 95% white on a light blur; every colour ≥ 5.2:1 over pure black and
  pure white; fields 50px at 16px, the button 52px. A clinic's door stands on its own cover, never the film.
- **Shared is the default**, on phones too: Shared signs out after 12 hours and remembers nothing; My own lasts 14 days.

### The Dashboard and the day (schedule.md)
- The owner (3 Oct): "imagine you're a dentist who also manages his own clinic, make the clinic site suitable for your
  operations with ease of access and better user experience". The Dashboard is the first screen of the day: Next for
  you, a slim row of four numbers, tasks and the website's lane only while something is open. One teal: New booking.
- **Blocked time (040)**, the owner's first ask of that round: blocked time that both the calendar and online booking
  respect. **How the day runs (044):** the owner's three questions (time between visits, holding reminders in closed
  time, where the consent question comes) are each clinic's own choice; every default is what shipped before.

### The patient record (record.md)
- **The record is a paper chart.** The owner (2 Oct 2026) first asked for "one seamless page, where all details are
  shown, and a plus sign appears next to editable or addable", then: "its still too complicated, imagine that the
  patient records is a paper record, simple, uneventful but effective". Also 2 Oct: "make it less space consuming and
  more organized, like a real dental record", and "make the UI/HUD simpler and less spacious … in the patient records".
- **Three sheets (3 Oct 2026):** "make the patient records as simple as this, better a digital copy of the real form",
  then "make it a better but still simple like that". Page 1 (letterhead, the chart, patient information, dental and
  medical history), Page 2 (Informed consent), Page 3 (Treatment record), then the attached sheets, folded.
- **On paper (4 Oct 2026):** "make the patient record panel look like it's a paper record instead of the normal
  template design". The same paper in both themes, filled-in values in blue pen ink, allergies red; lowest 4.68:1.
- **The chart (4 Oct):** "in the baby teeth, put the chart on the right side so it's visible"; "in the teeth chart,
  integrate a picture image of the teeth (or whole mouth image) for easy identification". Baby teeth open under 13
  or with a finding, else behind one Baby teeth pill. The pictures are drawn (`tooth-drawing.ts`), never an image.
- The owner (27 Sep): "make each specific detail more visible … their own pill". Still so in the rest of the
  workspace; on the record's sheets details read as plain words and ruled lines.
- **The visit panel (035):** "the full details of the patient's visit". **The Treatment record:** "rename the timeline
  to "Treatment record" and make it as such". **The paperless day (036):** "be the manager and the dentist owner,
  improve the experience for the clinic, the staff and the patient" (`docs/clinic-operations.md`).

### Patients' own forms (patient-forms.md)
- **Desk poster forms (028):** the owner asked for a QR code a clinic prints and posts at reception; Add patient offers
  it second of three, marked *Easiest*. Owner's call: the contact fields keep their autofill tokens for the patient's
  own phone (to trade that for a shared tablet, drop the tokens from `STEPS`).
- **Add patient, step by step (29 Sep 2026):** the staff tick the consent forms the procedure needs, then patient
  information, then the consent forms, then the profile is made. The owner's four answers (`docs/intake-design.md`):
  procedure forms are signed only after the named dentist records "I explained this"; the profile is made at Send
  unless the patient looks like one already on file; a fresh signature on every form with initials on the risks; the
  six scheduling features first. Signed forms show on the visit panel and the Treatment record (the owner's first pick).

### The sample site and the plan
- **The SwiftCare sample** (sample-sites.md) is a concept redesign of a real clinic's site, made at the owner's
  direction: its own design, `noindex`, labelled a concept, no third-party fonts or scripts, motion always on.
- **The plan (6 Oct):** "can you plan on simplifying the whole site" (`docs/simplify-plan.md`): one way to do each
  thing; one teal button; say it once; one word for each thing; show only what has something in it, but never hide
  safety alerts, consent gaps or legal lines; the first screen is for the task; measure before and after.

## Retired — do not bring back

Each was built and taken out, or proposed and refused; bringing one back undoes a decision. The source is in brackets.

- **3D models**: a Three.js scene was built and deliberately removed (Standing constraints).
- **Human faces in any image**: three photographs deleted for containing people (Standing constraints).
- **A tooth chart on the home page**: removed twice; the chart lives on the patient record only (Standing constraints).
- **Invented clinic branding or third-party marks**: two generated shots thrown away, one lettering a fictional clinic
  name on a wall, one with a real autoclave maker's logo (Standing constraints).
- **The Swiss rules** (no radius, no shadow, uppercase mono labels, Archivo), retired 26 Sep 2026 after the owner
  called the Swiss workspace "hard, angry and dark" (design.md, `docs/workspace-redesign.md`).
- **Black** buttons, blocks or words, and a pure-black dark mode; **fetched web fonts, Google Fonts above all** (a
  third-party connection on a page about medical records); uppercase typewriter labels (design.md).
- **On the glass**: muted grey words, the deep teal `#0b5d5b` for links (3.5:1 over the blurred hedges), and glass made
  more transparent without measuring again (home-film.md).
- **A house or stock photo behind a real clinic's page**, and the film behind a clinic's door (design.md).
- **The film kept to the opening section**: the owner asked for "a video that shoots all the page" (home-film.md).
- **Section numbers on the home page's pages** (home-film.md).
- **The readout rail fixed to the bottom of the viewport, and the link footer after the last page**: "the footer
  takes too much space … label each page on the site itself" (home-film.md). Nothing fixed at the foot of any page.
- **Reduce Motion gating, in any form**: the film with no `src` (the owner saw stills), dimmed autonomous motions,
  `prefers-reduced-motion` blocks, the `force-motion` class, the `?motion=on` parameter, in Flossify and the sample:
  "THE CINEMATIC MOTION SHOULD ALWAYS BE ON, ITS NOT AN OPTION" (home-film.md, sample-sites.md).
- **A placeholder person in Know the team**, or a service or price that is not live (home-film.md).
- **VP9 for the shipped film**: 5.05MB against H.264's 4.77MB at worse quality (home-film.md).
- **The four-tab patient record** (draft PR #52, 30 Sep–1 Oct), replaced by the paper record at the owner's request.
  On hold: the owner decides; do not merge it or resolve its conflicts mechanically (`docs/HANDOFF.md`).
- **The record's colour groups of 27 Sep** (hue banners, group colours, `sections.ts` deleted, icon tiles, lines saying
  what a part is for), reversed 2 Oct by the paper chart the owner asked for (record.md).
- **The twelve numbered parts on one sheet** (2 Oct): history since the three sheets of 3 Oct (record.md).
- **On the record's screen**: the facts line, the four numbers, number tiles, Health in short, Recent visits, Treatment
  in short, the Findings line, the head's avatar, count lines ("1 on record"), lines that explain the page (record.md).
- **"Timeline"**: it is the Treatment record; an old `#timeline` link is rewritten (record.md, glossary).
- **The Today page's status form**, posting to `/c/<slug>/` past the schedule's checks (6 Oct; record.md).
- **"Clear chart" on the record**: one tap wiped every finding (6 Oct); `clearAll` stays off (record.md).
- **The chart offer's separate "baby" offer and its sentence** (record.md).
- **"Sign on this tablet" or "Sign another consent" for the per-visit signing**: *Sign consent for this visit*.
- **A bare "No such clinic"**: a missing clinic or dentist page is the site's 404 page (6 Oct; sign-in-and-people.md).
- **Retired words** (Team, appointment, Messages, Timeline, invoice for a statement, recall, odontogram, strip …): the
  Not column of `docs/glossary.md`; `npm run test:words` stops them coming back.

**Decided not to do** (`docs/simplify-plan.md` section 7 gives each reason):
- Holding back the phone film until a scroll (it would show the still frames the owner objected to; measure on a real
  phone first). Opening the calendar on whoever is still in the clinic.
- Merging symptoms and services on Find a clinic (urgent symptoms stay red and trigger call-now); Open now for urgent
  symptoms (at night it would hide every clinic and its phone number).
- Removing Today's patients on a desk; drawing each consent only on page 2; putting planned work on page 3.
- Dropping "type it again" on sign-up and My page; "Code sent to …" on the code page; defaulting phones to My own.
- Counting tomorrow's calls and what patients owe in the inbox, for now; a setting to hide replies; picking the statement
  for a payment automatically; removing Calls from Today's patients, renaming "Not at <clinic>?", dropping "New clinic?".
- Hiding the forms' condition list behind None / Yes; adding the paper record's other health questions to the forms
  now (the privacy notice does not name them); shortening the patient's own form pages, for now.

## Rules that protect patients, consent and money

Breaking one could harm a patient, leak data, weaken consent or privacy, misstate money, break a deploy or lose data.

### Data and access
- **The app is never a superuser**: it connects as `flossify_app`; `src/lib/db.ts` refuses a superuser (backend.md).
- **Every clinic query goes through `withClinic(clinicId, fn)`**; RLS does the isolating, not a `where clinic_id = …`.
  An insert-only table revokes update and delete, as 033 does for `clinical_note` (backend.md, record.md).
- **Public reads go through security-definer functions** that return a clinic's public face only: a new public field
  is added there, never by opening a table. They never return a note, an author, or time away told apart from a day
  off. Operator reads are `admin_*` definers with exactly the columns a page shows, behind `requireAdmin()`.
- **The forms' public side has no tenant**: only its definers (`patient_form_submit`, `intake_*` through `intake_gate`);
  the clinic comes from the key, never the page; answers are status words, so none reaches a log (patient-forms.md).
- **What someone may do is `can(ws, key)`**, never a role name (`staff_can()` in SQL). Pages only show or hide; each
  page and API refuses on its own. Branch access (`requireWorkspace`, `canOpen()`) and the rank rules
  (`src/lib/roles.ts`: never the Owner role, never your own) are re-checked on the server (sign-in-and-people.md).
- **Sessions**: signed cookies, scrypt passwords; a password change bumps `staff.token_version` and signs out every
  other session. Every form post carries `<Csrf />` and checks `csrfOk()` first; JSON calls send `X-CSRF`; Astro's
  Origin check stays on. Rate limits are `hit()` with `LIMITS`; behind a proxy set `TRUST_PROXY=1` (backend.md).
- **A sign-in code is for the phone it was texted to**: nothing that renders `message_log.body` shows `reset` or
  `invite` rows (a dentist once could read the owner's reset code). `/auth/forgot/` never says whether a number is
  known, and no page puts a mobile number in a URL (`fl_code_phone`, `fl_me_phone` cookies) (backend.md).
- **One email and one mobile per staff account across the service.** A patient is their mobile number (`/me/`,
  `patient_visits(phone)`), matched on the number only, never on a name. `auth_event` never joins to a patient.
- **Every /c/ response is `Cache-Control: no-store`.** The service worker caches no API, upload or /c/ page but the open
  chart's record (marked, 4 hours at most, dropped at sign-in and sign-out: `public/sw.js`). Patient files are served
  only by `patients/<id>/files/<file>/`, never `/uploads/` (record.md). Tasks hold no patient details.

### Consent and privacy
- **Consent is a record, not a boolean** (012): `patient_consent` names the `consent_version` agreed to, when and how.
  Every booking writes one. Never claim NPC registration before it is true (backend.md).
- **The privacy notice is versioned**: `/privacy/` hardcodes the version id, so publish both together; its two-year
  promise for text logs and `retention_purge()` change together (backend.md, open.md).
- **The desk poster forms stay closed on the live site** until the notice in force is in `FORMS_PRIVACY_VERSIONS`
  (RA 10173 s.13(a)): a new `consent_version`, the notice's words and that id, after the lawyer reads it.
- **No consent form is offered in production until reviewed**: `CONSENT_REVIEWED` stays empty until a dentist and the
  owner's lawyer have read each. The tablet's per-visit signing already offers `treatment-2026-09` live (plan 1.6).
- **Words are pinned**: `consent_version.body_sha256` equals `libraryHash(template)`; new words are a new version and a
  new row in one change (`npm run test:consent`), then `npm run review:pack`. Consent words, the privacy notice, the
  forms' questions, paper labels, printed papers, aftercare and the not-BIR line change only with the owner's yes.
- **What was signed is frozen**: the database computes the snapshot hash and the seal; `consent_chain` is written only
  by a definer trigger. `visit_consent`, signings, attestations (only by the named treating dentist with a PRC licence,
  before any signing), withdrawals and overrides are insert-only; a signed form is never cancelled; `intake_event`
  never holds an answer. A signature is strokes, never an image (patient-forms.md).
- **"Consent signed for this visit" has one rule**, `visit_treatment_consented()`. A visit is signed only while it is
  going ahead (`canSign`); under 18, a parent or guardian signs; `signVisit()` re-checks in the transaction (record.md).
- **Going ahead without a consent form asks why and never blocks**, and nothing hides that it went ahead
  (`overrideConsent`). Seating needs `schedule.edit` only and is never refused for paperwork (record.md, schedule.md).
- **A form is not a patient**: one nobody added is deleted after 30 days. Added to a patient on file it fills only
  what is empty, never a name, and never a mobile or an email unless the desk ticks it; Use <it> is `TAKEABLE` only.
  On the step-by-step forms a patient on file types their birth date before anything of the record is drawn. A
  clinic tablet never holds a staff session; handing the desk's device over signs the desk out (`/auth/park/`).
- **The forms page brings back nothing one person typed for the next.** A real poster's link always opens. After any
  change to the QR drawing, decode it again (patient-forms.md).

### Records
- **Every record write is one post** with an `intent` in `RECORD_INTENTS`, `canEditRecords` in the same transaction,
  audited `record.*`; a refused post is rolled back (`Refused`). A new attached part goes in `PART_OF` (record.md).
- **A signed clinical note is never changed**: a correction is an addendum (`amends_id`). Prescriptions and treatments
  done are never deleted; a removed file is hidden (`removed_at`). Every health history save is an insert.
- **What a patient did not tick is not evidence it is gone**: allergies, conditions and medicines carry into a new
  version, and the form never pre-ticks Yes over a patient's newer No. A paper alias is only a real re-spelling, never
  a narrower or wider word (`paper-history.ts`). Allergies are red, alerts amber; safety alerts are never hidden.
- **Chart edits save as made** (`POST /api/chart`). Offline changes reach the server once (`sync_change`); when a
  colleague charted the same tooth first, their finding stays and the person is told, never resolved silently.
- **The chart after a treatment is an offer, applied only by a tap**: `procedure_catalog.chart_effect` (042), never
  guessed from a name; `chartFromRecord` checks the sign-in, takes the chart lock, then checks the tooth is unchanged.
- **Papers**: a prescriber or a letter's signer needs a PRC licence on file; the medicine box suggests generic names,
  never a dose; a PTR is copied at the save and only the copy prints; never join `staff.ptr_*` with `r.*` / `l.*`.
- **PRC checks are a person's job** (`/admin/prc/`); no number, no check (046). Until then: "PRC check pending".
- **The letterhead names this clinic only**, no logo. Page 2 says "Dentist who explained", never a signature (none is
  stored); a pointer to the consent to treatment is a reference, never a claim that it covers that treatment.

### Money
- **`patient_balance()` is the one definition of what a patient owes.** The Treatment record's last figure must equal
  it, else none shows and the server logs the patient id, never the name; screen and paper share `buildLedger`.
- **Only statements are charges** (a treatment's price is a fee-guide estimate), never matched by description.
  `createStatement` takes the `charge:<patient>` lock and refuses a treatment already on a statement that is not void.
- **A payment plan's money is one statement**, and a statement an active plan is built on cannot be voided.
- **Amounts need `finance.bill`**: a dentist without it sees no peso sign, on screen or on paper.
- **No clinic is invoiced while `BILLING_FINAL` is false**, and a late payment switches nothing off (backend.md).
- **Flossify is not a BIR invoicing system**: statements and acknowledgments only, and every paper keeps that line.
  Never invent PhilHealth rules (`coverage.astro`); HMO chips say "confirm with your HMO".

### Texts
- **Texts are queued, never sent, by the app** (`queueText()` in a clinic transaction); only `npm run sms:worker` sends.
- **No links in any text, and no text asks for a reply.** Name the day ("Thu 24 Sep, 9:00 am"), never "tomorrow";
  promise a reminder only when one will come (`willRemind`). Patient texts wait through 9 pm–8 am Manila.
- **A reply belongs to the clinic that last texted that number** (`sms_inbound()`); replies arrive as JSON with
  `X-Inbound-Secret`. The reminder's words live in migrations (019, 036), so new words are a new migration.
- **A move drops the texts that named the old time** (`dropStaleTexts`); `retellTexts` stays in step with
  `sms_enqueue_reminders`; a held reminder never touches a text already sent (schedule.md).

### Booking and the schedule
- **Only times the clinic can honour**; a request-only clinic is never shown a calendar. No account; undo after
  booking; the consent tick on every booking. Status is Manila time and never colour alone (find-a-clinic.md).
- **Every trust claim names its source**: "PRC licence · checked <date>" means a person looked it up.
- **One booker at a time per clinic**: `/api/schedule` and `/api/bookings` take
  `pg_advisory_xact_lock(hashtext(clinic_id))` and re-check inside the transaction; `slotOpen()` is the one rule.
- **The status machine is the server's** (`NEXT_STATUS`, `applyStatus`). Every status change goes through
  `/api/schedule`; the Dashboard takes no posts. A clash always wins (`findClash`, no anyway) (schedule.md).
- **A request is not a booking until the desk sets a time**: `source = 'request' and moved_at is null` (018); gating
  on `source` alone locked patients out for good. Only a move stamps `moved_at`; an edit never does.
- **Blocked time is a soft stop for the desk** (`anyway` → `blocked_ok_at`) and a hard one online (`/api/bookings`
  never reads `anyway`). A block is only added or removed. The Unplaced lane is the inbox: never hide it.
- **The app never deletes a patient**: a web patient's chart number is `W-` + (patients + 1), so tests archive theirs.

### Deploy and the database
- **Settings are read from `process.env` at run time, never `import.meta.env`** (a build once carried `DATABASE_URL`
  and `SESSION_SECRET`); `src/lib/env.ts` refuses an unsafe production start (backend.md).
- **`security.allowedDomains` in `astro.config.mjs`** lists the hosts (`EXTRA_HOSTS`), or every form post is 403.
- **Never edit an applied migration or `schema.sql`**: a change is a new numbered file (the newest is 046), with no
  BEGIN/COMMIT inside. Never put `--allow-late` in `render.yaml` or the `Procfile`.
- **`npm run db:setup` drops the database**: never run it, or a test, against `flossify_dev` or without `DB=` naming
  a throwaway database. `seed.ts` and `SHOW_DEMO_LOGINS` are local only. After a merge, check `/healthz` answers 200.

### People working on this repo
- **Never type the owner's passwords, API keys or tokens**: the owner enters secrets. Their email only identifies them.
- **Never open the SwiftCare admin links** or keep its screenshot; nothing from the photos of a real clinic's paper
  record goes in the repository, a test or a document. Both showed real patients.
- **Never delete audit rows** (`audit_log`, `auth_event`) to tidy up; archive test patients.
- **Work on a branch; merge only when the owner says "merge"**; the pull request says what changed and how it was
  measured. Tools go under `scripts/dev/` or `docs/`, never only in a scratchpad.

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

Still open, one line each. `docs/features/open.md` has the full text.

- Semaphore has not sent a live text: the first needs a registered sender name and a check of the response's shape.
- Email (023) is off until `EMAIL_PROVIDER` and a verified sending domain are set; until then codes go by text only.
- Billing is manual payment, and its prices, pay-to details and pause policy are placeholders: `BILLING_FINAL` is false.
- The privacy notice (privacy-2026-09) says texts let patients "confirm or cancel by text" and does not name the IP
  address stored with consent, the desk's health history or the paper's extra questions: a new version, lawyer-read.
- The desk poster forms are closed live until that notice names all they collect (`FORMS_PRIVACY_VERSIONS` is empty).
- The ten consent forms and the consent to treatment are unreviewed drafts; nine forms' Filipino lines are not written.
- A dentist reads, in the review pack: the chart-effect mapping, our codes F, RCT, Impl and V, the consent pointers,
  the baby teeth's two questions, the chart's drawings and the aftercare sheets.
- The owner decides: PR #52; the 25 questions (`docs/simplify-plan.md` section 5); an adult's printed record with the
  empty baby arch; a protected emergency hold and Philippine holidays. The deploy log's `046:` line is the owner's.
- Offline covers only a chart that was already open. A long archwire spec can wrap mid-spec in the printed Wire column.
- The forms' rate limits are estimates (40 an hour per address and poster, 8 a day per mobile, 300 a day per poster).
- `scripts/dev/qr-forms/` does not run from a clone; the staff entrance's measurements need a check written again.

## Where the detail lives

The `docs/features/` files keep old sections word for word under their old headings ("The tour", "Patient forms" …).
Where one differs from this file, this file wins.

| File | Old headings it holds | Read it before |
|---|---|---|
| `docs/features/design.md` | "Art direction — soft clinical, everywhere" (its "Frosted glass" paragraph too) | changing any page's look, colours, glass, theme or `global.css` |
| `docs/features/home-film.md` | "The tour" (its "The film" part too) | touching the home page, the film or the public bar's readout |
| `docs/features/sample-sites.md` | "Sample client sites — `public/samples/`" | touching the SwiftCare sample or /websites/ |
| `docs/features/sign-in-and-people.md` | "The staff entrance — `/auth/login/`, `/auth/forgot/`, `/auth/code/`"; "Clinic doors and usernames — `/<clinic>/sign-in/` (029)"; "Roles and permissions (030)"; "Members the owner makes (031)"; "Tasks (032)" | sign-in, a clinic's door or own site, roles, People, My page, tasks |
| `docs/features/find-a-clinic.md` | "The patient side — `/find/`" | Find a clinic, a clinic's page, online booking |
| `docs/features/backend.md` | "Backend — Postgres, RLS, sessions"; "Production — settings, database, deploy"; "Round three — operations, patients, billing, compliance, chart, PWA, claims" | the database, sessions, texts, settings, deploy, /admin/, /me/, billing, claims, offline |
| `docs/features/schedule.md` | "The schedule — `/c/<slug>/schedule/`"; "The dentist who runs the clinic (3 Oct) — the Dashboard as a dentist-owner's home"; "Blocked time (040) — lunch, closed days, a dentist's hours and leave, a chair out of use"; "How the day runs (044) — the owner's three questions, as each clinic's own choice" | touching the calendar, the Dashboard, Calls, blocked time or reminders |
| `docs/features/patient-forms.md` | "Patient forms — the QR code on the desk (028)"; "Add patient, step by step (039) — phase 1: the consent library and the data" | the desk poster forms, the step-by-step forms, consent forms, tablets |
| `docs/features/record.md` | "The clinical record (033) — Treatment record, Treatment, Notes, Prescriptions, Files, next check-up"; "The record's paperwork (034) — blood pressure, letters, HMO LOA, payment plans"; "The visit panel and the signed consent (035)"; "The Treatment record — page 4 of the PDA dental chart"; "The paperless day (036) — arrival, this visit, checkout, texts after, the desk's lists" | touching the patient record, the chart, papers, the visit panel, checkout, Close the day |
| `docs/features/open.md` | "Open — read before shipping" (condensed above) | shipping anything a clinic will rely on |
| `docs/features/layout.md` | "Layout" | looking for where a page, library or migration lives |
| `docs/glossary.md` | — | writing any word a patient or the staff will see (`npm run test:words`) |
| `docs/HANDOFF.md` | — | starting a session: where `main` stands, the checks to run first, the cloud recipe |
| `docs/simplify-plan.md` (`.html`) | — | any change: the plan, its build order, the owner's 25 questions; `docs/simplify/` has its evidence |
| `docs/workspace-redesign.md` | — | the workspace shell, the soft template's tokens and the Site API |
| `docs/deploy.md`, `docs/launch.md` | — | deploying; the owner's launch checklist |
| `docs/intake-design.md` | — | the step-by-step forms as built, and the owner's four answers |
| `docs/review/review-pack.html` | — | changing words a patient signs or a dentist must read (`npm run review:pack`) |
| `docs/generation.md`, `docs/service-map.md`, `docs/clinic-sites-design.md`, `docs/clinic-operations.md` | — | the film, the patient side, clinic doors and sites, the paperless day: the briefs they were built from |
