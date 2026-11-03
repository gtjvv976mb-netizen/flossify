# Layout: where things are

*Moved here from `CLAUDE.md` word for word on 10 Oct 2026 (plan item 1.9), with cross-references re-pointed to the file that now holds them. `CLAUDE.md` holds the rules; this file holds the detail. Where they differ, `CLAUDE.md` wins.*

## Layout

```
src/pages/index.astro          the marketing page (tour, product, services, FAQ)
src/pages/clinics.astro        workspace directory (no bar or page links to it now; see "Site API")
src/pages/c/[clinic]/…         prototype clinic workspace
src/pages/c/[clinic]/patients/ the Patients tab (Dashboard · Patients · Finances · Clinic settings): every patient + a record check, one query (_list/list.ts)
src/pages/websites.astro       the clinic-website service, with the sample framed
src/pages/find/index.astro     patients: find a clinic by symptom, service, HMO, PhilHealth, open now
src/pages/find/[clinic]/…      the clinic's public page, and its booking (three to five steps, no account)
src/pages/dentists/[dentist]   dentist profile: PRC licence checked by a person, dated
src/pages/coverage.astro       PhilHealth's preventive dental benefit and HMO cards, explained
src/data/directory.ts          services, symptoms, HMOs, dentists, listings — types, and the seed's source
src/data/migrations/           002 public booking, 003 public read functions, 004 staff_branches,
                               005 codes / auth events / throttle / text queue / listed, 006 signup_clinic,
                               007 review fixes (inbound tenant, global slug, listed-only dentist profiles),
                               008 platform admins + phone codes, 009 PRC checks, 010 patient visits, 011 billing,
                               012 consent + DPO, 013 claims, 014 DPO on the public listing, 015–018 review
                               fixes + schedule, 019 truthful reminders, 020 request wording
src/lib/db.ts                  pool, withClinic (RLS transaction), publicRead
src/lib/auth.ts                scrypt passwords, signed session cookie with token version, auth events
src/lib/csrf.ts + components/Csrf.astro   the double-submit token every form carries
src/lib/throttle.ts            hit(): fixed-window rate limits in Postgres; LIMITS; clientIp
src/lib/codes.ts               six-digit one-time codes (reset, invite)
src/lib/messages.ts            queueText(), phone normalising, the text wording; gsmName / smsLength / oneText keep a text to one GSM-7 message where a wording fits (messages.test.ts)
src/lib/sms.ts                 provider seam: console (dev), semaphore (live)
src/lib/uploads.ts             clinic photos: sharp → 1600/640 webp under UPLOAD_DIR
src/lib/workspace.ts           requireWorkspace: session + branch access, every request
src/lib/directory-db.ts        public_directory() → the shapes the pages render; real open slots
src/lib/availability.ts        Manila-time status and slot arithmetic
src/pages/api/                 availability, bookings (create / undo-or-cancel), chart (tooth_state), sms/inbound
src/pages/auth/                sign-in, sign-out, forgot (text a code), code (set a password)
src/pages/start/               a clinic sets itself up
src/pages/[clinic]/            a clinic's own site (index) and its staff sign-in (its door)
src/lib/clinic-door.ts, username.ts  the remembered clinic, Find your clinic; username rules
src/lib/can.ts                 permission keys, default roles, can(ws, key); roles are clinic_role rows (030)
src/lib/places.ts              every place by its name on screen (docs/glossary.md, Places): the tabs, Clinic settings' SECTIONS, PLACE, settingsPlace / settingsAt / inText (no imports)
src/lib/roles.ts, tasks.ts     the rank rules for people and roles; tasks (032). Pages: settings Roles section, /c/<slug>/tasks/
src/pages/c/[clinic]/settings/ the one Clinic settings page: profile + HMOs + listing, hours (lunch), closed days, services & prices, people (and their pages), roles, photos, privacy (DPO), tablets, the plan
src/pages/c/[clinic]/claims/   HMO and PhilHealth claims: file, approve, deny, pay, notes, aging, CSV
src/pages/me/                  patients: my visits by mobile (code → list; confirm / cancel / calendar)
src/pages/admin/               Flossify operations: overview, PRC checks, clinics, billing
src/pages/privacy.astro        the versioned privacy notice; src/pages/offline.astro the PWA's offline page
src/lib/billing.ts             plans and pay-to placeholders; src/lib/admin.ts requireAdmin; src/lib/patient-auth.ts
src/pages/c/[clinic]/messages/ the branch's texts, both directions; send again, cancel, text a patient
src/pages/uploads/             serves uploaded photos, path-checked
scripts/db/                    setup.sh (dev: drop, create, migrate, seed), migrate.ts (npm run db:migrate),
                               backup.sh (db:backup), admin-create.ts (admin:create), seed.ts (dev only)
src/lib/env.ts, dotenv.ts      production settings check; .env into process.env at runtime
src/middleware.ts              security headers + the settings check; src/pages/healthz.ts
src/lib/billing-config.ts      BILLING_FINAL — no invoice is issued until it is true
Dockerfile, Procfile           one image: web (npm start), worker (sms:worker), release (db:migrate)
render.yaml                    Render Blueprint (web + worker + disk, Singapore); scripts/deploy/render-values.sh
                               hands its secret values over through the clipboard
docs/deploy.md, docs/launch.md how to deploy; the owner's launch checklist
docs/workspace-redesign.md     the clinic workspace's design: tabs, soft template, Shell API
src/layouts/Clinic.astro, src/components/ws/   the workspace shell (sidebar, cards, icons, panels)
src/components/site/SiteHeader.astro  the public top bar (soft; a drawer from the left on phones); PatientHeader wraps it
src/pages/me/_Door.astro, _Shell.astro  the way in to My visits (the patients' bar, one card) and My visits' sidebar frame
src/pages/find/_ui/            patient.css (the patient pages' pt-* classes) and ClinicBadge (a clinic's initials)
src/pages/404.astro            not found: the site's bar, one card, the ways on
src/components/ws/cal/         the Dashboard's calendar (day/week, drag, panels)
src/pages/c/[clinic]/patients/ Patients tab (list + record check), record, new (add), import (CSV/XLSX)
src/pages/c/[clinic]/finances/ Finances tab: statements, payments, claims, new charge, print
src/pages/c/[clinic]/account/  My page (details, password, my schedule)
src/data/migrations/026, 027   patient import (past visits, paper consent), operator aggregates (counts only)
src/data/migrations/028        patient forms: forms keys, submissions, the treatment consent version, consent channel 'form'
src/data/migrations/035        visit_consent: the consent signed by hand on the clinic's tablet, per visit
src/lib/visit-record.ts, visit-consent.ts  the visits (everything per visit); signing, strokes → SVG
src/lib/treatment-record.ts    the Treatment record (the PDA ledger): rows, charges, the running balance, next appt.
src/pages/c/[clinic]/patients/[patient]/treatment-record.astro  the Treatment record on A4 paper
src/pages/c/[clinic]/patients/[patient]/sign/  the tablet signing page (clinic step, patient step, thank you)
src/pages/f/[key].astro        patients: the patient forms from the QR code on a clinic's desk (five steps, no account)
src/lib/patient-forms.ts       forms key, public submit, the "New patient forms" queue, adding a form to the records
src/lib/patient-forms-def.ts   the questions as data, reading a post, labelling the answers (no Node imports)
src/lib/qr.ts                  QR codes as SVG: error correction H, the Flossify mark in the middle
src/pages/c/[clinic]/patients/qr/     the QR poster: page, print/, _poster.ts (the drawing steps), _draw.ts (the PNG)
src/pages/c/[clinic]/patients/forms/  "New patient forms": the queue, one form (<id>/) and its printout (<id>/print/)
src/pages/c/[clinic]/patients/_forms/ the forms' shared pieces: Answers, Confirm, forms.css, words, fit
scripts/sms/worker.ts          the sender: npm run sms:worker (loop) / sms:once; every pass also runs sms_enqueue_recalls()
src/data/migrations/036, 037, 038  the paperless day: visit links, reminder passes, recall texts, clinic switches; day_close; appointment_contact
src/pages/c/[clinic]/patients/_record/VisitStrip.astro  This visit: today's visit checklist above the record's sections
src/lib/aftercare.ts           the nine aftercare sheets (en + fil), kindForCatalog, the evening text; printed at patients/<id>/aftercare/<kind>/
src/lib/text-templates.ts      the eight texts Texts → Text a patient fills in (GSM-safe, no link, no reply asked)
src/pages/c/[clinic]/calls/    Calls, the desk's list: visits in closed time (Keep it), tomorrow's visits to confirm, a call log, no-shows to call back, a print sheet
src/pages/c/[clinic]/finances/close/  Close the day: payments by method, the drawer count, what is still open, tomorrow
src/pages/api/recall.ts        POST: the next check-up in one tap from the Dashboard's visit panel (recall-set)
docs/clinic-operations.md      how a dental clinic runs, front door to archive: the brief the paperless day was built from
public/samples/swiftcare/       sample clinic website (see docs/features/sample-sites.md)
docs/service-map.md            what to build for patients, dentists and clinics, and why (Sept 2026)
src/components/Odontogram.astro  32 teeth and the 20 baby teeth (A–T), FDI/Universal/Palmer, surface-scoped, each drawn beside its box, and the mouth map
src/lib/tooth-drawing.ts, tooth-name.ts  the chart's pictures (26 kinds, the turns, the mouth map MOUTH) and the teeth's names (pure; tooth-name.test.ts)
src/data/schema.sql            full multi-tenant Postgres model with RLS
src/data/lqip.json             blur placeholders, keyed by image name
src/data/shot-size.json        real screenshot dimensions (generated)
src/data/migrations/039        the patient intake and the consent library: intakes, links, tablets, consent forms, signings, attestations, the chain
src/data/migrations/043        the intake's review fixes (phase 2)
scripts/dev/intake/phone-e2e.mjs  the phone path end to end in two browsers (phase 3) and the record's phase 4 (B2, D, E); --keep leaves screens for contrast.mjs
docs/intake-design.md          the intake as built (phases 1–3) and what phase 4 is to settle with the owner
src/pages/f/i/, f/t/, auth/park.ts, auth/unlock.astro, auth/tablet.ts  the patient's intake pages, the clinic tablet, handing a device over
src/lib/intake.ts, intake-public.ts, consent-docs.ts, park.ts  the desk's intake, its public side, consent documents, hand-over
src/lib/consent-library.ts, consent-seal.ts  the consent forms as data and the one renderer; canonical JSON, snapshot, seal, chain (npm run consent:hash)
src/lib/intake-def.ts, patient-add.ts, refused.ts  the intake's page 1; adding a patient's own answers (forms and intakes); the one Refused class
scripts/dev/intake/db-test.mjs the intake database checks; scripts/ts-register.mjs runs a script that imports src/lib
scripts/dev/settings/profile-check.mjs  the public profile's lines and the clinic's founding year, end to end
scripts/dev/schedule/seat-check.mjs     In the chair asks why for a consent form not agreed (API, Dashboard, 390 px)
scripts/dev/record/paper-check.mjs      the record as a paper chart: the parts in order, contents, plus signs, contrast, 390 px
scripts/dev/schedule/choices-check.mjs  How the day runs (044): settings, the gap online and on the calendar, held reminders, the question at the door
scripts/dev/schedule/dash-check.mjs     the Dashboard for a dentist who runs the clinic: first screen, Next for you, Mine · Everyone, tasks, contrast
src/data/migrations/045        the paper record: tooth_state's paper codes (Ex, RF, Ab, P, Rm, Am, I), plan_adjustment.wire
src/data/migrations/046        a PRC check needs a PRC number: admin_prc_mark() refuses checked without one; old ones back to pending
src/lib/paper-history.ts       the paper's dental and medical history: choices, aliases, answers.paper, the boxes (pure; .test.ts beside it)
src/pages/c/[clinic]/patients/_record/Letterhead.astro, PaperHistory.astro, PaperHistoryFields.astro, ConsentRow.astro, Attached.astro  the paper record's pieces
src/data/migrations/044        clinic.turnover_min, hold_closed_reminders, consent_ask_at; public_clinic_turnover(), appointment_reminder_held(), the reminder pass
scripts/dev/review/review-pack.ts       npm run review:pack → docs/review/review-pack.html: every consent form, the chart's offer, aftercare, the privacy gaps, for the dentist and lawyer
src/data/migrations/040        blocked time: lunch, dentist hours, clinic_block, blocked_ok_at, clinic_unavailable(), public_blocked/busy_ranges()
src/lib/blocks.ts, block-words.ts   blocked time: the desk's reads and writes over clinic_unavailable(), and the words (pure)
src/lib/schedule-api.ts, reminder-state.ts  the schedule API's gate and body readers; a visit's reminder in words
src/pages/api/schedule/blocks.ts   add or remove a dated block
src/pages/c/[clinic]/settings/_lib/closed-days.ts, _ui/ClosedSection.astro  Closed days (040)
src/components/ws/cal/free.ts, FreeTimes.astro, BlockPanel.astro  free-time chips (p24); the Block time panel (040)
src/data/migrations/041, src/lib/ptr.ts  the PTR: staff.ptr_year, the copy on prescriptions and letters; reading, checking, words
src/data/migrations/042        procedure_catalog.chart_effect: what a treatment does to the chart
src/lib/chart-offer.ts, chart-write.ts  the chart's offer after a treatment (pure), and the write after a tap
src/pages/c/[clinic]/patients/_ui/ToothPick.astro, toothpick.ts  the tooth picker (p01)
src/pages/c/[clinic]/patients/_record/TreatmentPanels.astro, NotePanel.astro, pickpanel.ts, ChartOffer.astro  the panels the chart's palette opens; the chart offer
public/video/                  the tour film + poster
```

`lqip.json` and `shot-size.json` are generated. Regenerate them whenever the
images or screenshots change, or the reserved boxes drift out of step.
