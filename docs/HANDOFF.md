# Handoff — where the work stopped (26 Sep 2026)

This note is for the next Claude session (a different account) so it can continue
exactly where the last one stopped. Read `CLAUDE.md` first (the owner's standing
rules and the architecture), then this file.

## The owner and how to work with them

- Flossify is the owner's startup: practice software for Philippine dental
  clinics, Baguio City. Mantra: **user experience and user-friendliness**.
- The owner writes short, excited messages ("do it", "make it live") and has
  authorised finishing work, opening PRs and **merging** them (Render deploys
  `main` to flossify.ph automatically, ~90 s). Check the live site after each merge
  and send screenshots.
- Standing decisions (do not re-open): motion always on everywhere (never gate on
  `prefers-reduced-motion`; the owner's own Mac has Reduce Motion on); no footer and
  nothing fixed to the bottom of the screen; soft, very simple UI (white rounded
  cards, teal #14908f, sentence-case, line icons); the clinic workspace has exactly
  four tabs in a left sidebar (Dashboard · Patients · Finances · Clinic settings).
- **Frosted glass** is the public look the owner loves: compact translucent cards
  over a photo of the clinic (see CLAUDE.md "Frosted glass where a clinic is the
  background"). Every line of text on glass is *measured* against the pixels behind
  it (tools below) in light and dark, 1920 → 390 wide, before shipping.
- Never enter passwords, API keys or tokens for the owner; they type secrets
  themselves (Render dashboard/shell). Their email is only for identification.
- Never touch the `flossify_dev` database in tests; never run `npm run db:setup`
  without `DB=`. Use a throwaway copy: `createdb -T flossify_t_final flossify_xyz`
  (`flossify_t_final` is a seeded test DB on the owner's Mac), then
  `DB=flossify_xyz npm run db:migrate`.
- Do not save or share the SwiftCare admin screenshot the owner once sent (it shows
  a real minor patient). The SwiftCare sample site under `public/samples/swiftcare/`
  keeps SwiftCare's own branding — do not restyle it.

## Production

- flossify.ph on Render (web + worker, Singapore, `render.yaml`), DigitalOcean
  Managed PostgreSQL 17 (SGP1). DNS at Namecheap. `/healthz` returns `{"ok":true}`.
- Everything below is merged and live: PRs #9–#22 (launch prep, features round 4,
  workspace redesign with Patients tab, site-wide soft template, frosted glass on the
  home page, `/start/`, `/find/`, `/coverage/`, `/me/` + `/me/visits/`, each clinic's
  page + booking over its own uploaded photo, `/websites/`, and "Staff sign-in"
  renamed **"Clinic sign-in"** everywhere).

## In progress 1 — QR patient forms (branch `patient-qr-forms`, draft PR #23)

The owner asked: in Add patient, a QR option the clinic can download (branded, with
the flossify.ph logo) and print for the reception desk, so patients fill in their
information **and the patient forms** on their phone.

Built and reviewed (two review/fix rounds; 31 round-1 findings and the round-2
verifier's 4 findings fixed). **Not yet done: the final re-verify** (it hit the
usage limit). What to do next:

1. Check out the branch (it already has `main` merged in), make a throwaway DB,
   `DB=<db> npm run db:migrate` (applies `028_patient_forms.sql`), run a dev server
   with `DATABASE_URL` pointing at that DB (app role `flossify_app`, see `.env`).
2. Run `scripts/dev/qr-forms/backend-test.mjs` (see its header; it needs
   `ts-resolve.mjs` and paths adjusted to your checkout) — expect all checks to pass.
3. Re-verify end to end: `/f/<key>/` (adult, minor with guardian, errors, no-JS),
   the QR page (PNG download + A4 print both decode to the exact link — use jsQR),
   "Make a new QR code" retires the old link, the review queue (add as new / add to
   existing / dismiss), the "Patient forms" section on the record, contrast 0 fails
   on `/f/<key>/` (tools below), no sideways scroll, no console errors.
4. Build, mark PR #23 ready, merge.
5. **The forms are closed on production on purpose** until a new privacy notice is
   published that covers what the forms collect (health/dental history, address,
   emergency contact, guardian, Facebook, PhilHealth PIN, HMO card, 30-day deletion
   of forms nobody adds). To open them: a new `consent_version` migration + new
   `/privacy/` wording and version id + add the id to `FORMS_PRIVACY_VERSIONS` in
   `src/lib/patient-forms.ts`, after the owner's lawyer (and a dentist, for the
   treatment consent `treatment-2026-09`) review the wording. Tell the owner this.
6. Open owner call: autofill tokens on the form (fast on a patient's own phone vs a
   shared clinic tablet suggesting the previous person's details) — see
   `scripts/dev/qr-forms/WORKFLOW-RESULTS.txt`.

All reviewer findings and fix summaries: `scripts/dev/qr-forms/WORKFLOW-RESULTS.txt`.

## In progress 2 — Clinic sites, member logins, custom roles, tasks (not started)

The owner's request (verbatim, two messages):

> change the clinic sign in, when people click clinic sign in, the clinic site (a
> generic templated site for ALL clinics, this is different from the custom clinic
> website services that we offer, (for that, we custom make a clinic's site which is
> different URL from flossify itself) after users open their clinic as the owner, he
> will make also the username and password for the clinic default website inside
> flossify, now on the clinic website - the owner and staff can log into that
> website so that they can access the features like for the owner: adds members and
> delegates them as he wants like, admin, staff, receptionist, etc anyway he like to
> name it so he can manage the hierchy, and he ALSO ASSIGNS the tasks and access
> authority for each of his members

The owner dismissed the clarifying questions; these **defaults were announced** to
them (they may still redirect):

- Each clinic's generic site at **flossify.ph/<clinic-slug>/** (path, no DNS work),
  with its own "Sign in"; the top bar's "Clinic sign-in" becomes "Find your clinic"
  (remembers the last clinic on this device) with the old email sign-in as fallback.
- **Every member has their own username + password** (created by the owner or whoever
  the owner allows) — per-person audit matters for health records (Data Privacy Act).
- **Custom roles**: the owner types any role name, ticks what it can see/do
  (permission checklist), and ranks roles in a hierarchy; a member can only grant
  what they hold and manage roles below theirs; the owner can't lock himself out.
  Keep "is a dentist" as a separate professional flag (PRC licence, chart sign-off).
- **Tasks**: the owner assigns to-dos (title, notes, due, assignee); members see them
  on their Dashboard. People & Roles live inside Clinic settings (still four tabs).

Next step: the design. Map (read-only) auth & sessions (`src/lib/auth.ts`,
`src/pages/auth/*`), every role check in the code (the existing enum:
owner, admin, dentist, associate, secretary, assistant → propose permission keys),
People/signup (`/start/`, `settings/_ui/PeopleSection.astro`, `_lib/people.ts`), and
root routing (a root `[clinic]` route + a reserved-slug list: find, start, me, c,
auth, admin, coverage, websites, privacy, offline, uploads, f, samples, video, img,
healthz, clinics, today, api, dentists …; `/start/` must refuse reserved slugs).
Then write `docs/clinic-sites-design.md` with a phased plan, each phase shippable:
P1 usernames + per-clinic sign-in + Find your clinic; P2 custom roles & permissions
(default roles mapped from the enum so existing clinics see no change) + a single
`can(session, key)` helper replacing scattered checks; P3 the owner's People & Roles
screens; P4 tasks; P5 the generic clinic site at `/<clinic>/` (reuse the clinic page
and booking; glass over the clinic's own photo). New migrations start at **029**
(028 is the QR forms). Send the owner a one-screen summary, then build phase by phase.

## Tools (in this repo)

- `scripts/dev/glass/contrast.mjs` — text contrast against the real pixels behind
  every line (hides text, screenshots, reads pixels under each text box; clip- and
  occlusion-aware; WCAG AA). `node contrast.mjs <home|start|find|any/path/> <light|dark>
  <desk|phone|wide|laptop|tablet> <base-url> [outdir]`. On the home page it redirects
  the tour MP4 to `/video/tour-test.webm` (a local VP9 copy, git-excluded; make it with
  the ffmpeg line in `scripts/film.mjs`).
- `scripts/dev/glass/measure-page.mjs <outdir> <path> [base]` — screenshots + card
  geometry at 1440×900 and 390×844; `measure.mjs` does home + `/start/`.
- `scripts/dev/glass/make-uploads.mjs` — test "uploaded photos" for clinics in a
  throwaway DB (a real room, all-black, all-white, harsh stripes, none).
- `scripts/dev/glass/book-e2e.mjs`, `signup-e2e.mjs` — a real booking + Undo, and a
  clinic sign-up, against a local server on a throwaway DB.
- `scripts/film.mjs` — the home page film walk check; `scripts/record-walkthroughs.mjs`
  — re-records the two "How to register" videos (`REC_BASE=<url>`).
- Commands on macOS: no `timeout`; wrap long commands as
  `perl -e 'alarm shift; exec @ARGV' 150 <cmd>`.
