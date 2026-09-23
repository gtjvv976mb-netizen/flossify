# Flossify

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

## Art direction — Swiss clinical

Three rules govern everything. Breaking any one collapses the page back into a
generic SaaS template, which is what the owner rejected.

1. **Nothing is rounded.** `border-radius: 0` everywhere.
2. **Nothing casts a shadow.** Separation is 1px rules and whitespace.
3. **Uppercase lives in the mono face alone** (`.meta`, `.sec-no`).

Type is **Archivo** (variable, display + body) and **IBM Plex Mono** (all
metadata), both self-hosted from `public/fonts/`. Do not re-add Google Fonts:
it is a third-party connection on a page about medical records, and it is
blocked outright in some sandboxes, which silently renders everything in
Helvetica.

`src/styles/global.css` is the whole system. Read the comment at the top of the
`@layer components` block before editing it — component rules **must** stay
inside that layer or they beat Tailwind utilities on equal specificity.

## The tour

The film is the ground of the **whole home page**: one continuous 39.8s film
from the street to the chair in a fixed layer (`.film-bg`) behind everything.
It opens on the clinic building from outside — a white single-storey clinic
with a backlit tooth sign, a dental chair seen through a window, Baguio pines
behind — walks through the hedge gap and across the forecourt, through the
door, and continues as the original 30s interior take. The two shots are
joined on the same frame with no cut (docs/generation.md, "The exterior
approach"); the interior begins at `LEAD` (9.767s) in `src/data/film.ts`,
which is the only place the film's times live. It is
scrubbed by the document's own scroll (`scrollY / (scrollHeight − innerHeight)
→ video.currentTime`). The top of the page is the pavement, the last page is
the chair, and every section between is a `.page` standing in whichever room the
camera has reached, its content on a paper `.pane` so the footage shows in the
gaps. The owner asked for exactly this — "a video that shoots all the page" —
after a version that kept the film to the opening section. Do not go back to
that. Nothing scales; the forward motion is in the footage. The header names
the page and the room — "04 / What it does · Reception" — the room switching
at the moments the footage arrives there (`ROOM_FROM` in `src/data/film.ts`,
from times read off a frame sheet), not at equal quarters.

**No footer and nothing fixed at the foot** — on the home page or the staff
entrance. There used to be a readout rail fixed to the bottom of the viewport
and a link footer after the last page; the owner removed both ("the footer
takes too much space … label each page on the site itself"). Pages are
labelled where they are: the header readout, each section's own number, and
the staff entrance's top bar ("Staff entrance / Sign in"). The footer's links
are in the header nav; the copyright is one line on the last page. Do not put
a footer or a bottom bar back.
See `docs/generation.md` for how the film was made and how to regenerate it.

- Encoded with a **5-frame GOP** so scrubbing lands on a real frame. This is why
  the files are larger than a streaming encode, and why **VP9 loses** here — it
  was measured at 5.05MB against H.264's 4.77MB at worse quality. Ship H.264.
- Phones get `tour-960.mp4`.
- **Nothing on this site is gated by Reduce Motion, and there is no switch.**
  The walk, the rises, the drawn rules, the clipped headlines and the queue
  ticker run for every visitor on every machine. The owner said it twice: the
  first time after a version that gave the film no `src` under Reduce Motion
  (they saw stills), the second — "THE CINEMATIC MOTION SHOULD ALWAYS BE ON,
  ITS NOT AN OPTION" — after a version that still dimmed the autonomous
  motions. `prefers-reduced-motion` blocks, a `force-motion` class and the
  `?motion=on` parameter are all gone from Flossify **and** from the sample
  site. Do not put them back; if accessibility comes up, raise it with the
  owner rather than quietly re-adding a media query.

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

## Sample client sites — `public/samples/`

`public/samples/swiftcare/` is a self-contained clinic website (plain HTML, CSS
and JS, no build step) that shows the site-building service. It is framed on
`/websites/` and served as-is, so it is exactly the folder a clinic would
receive.

It is a **concept redesign of a real clinic's site** — SwiftCare Dental Clinic,
Tarlac City (swiftcaredental.com) — made with the clinic's public branding,
photographs and price list at the owner's direction. Its Book and Staff links
open the clinic's real booking flow and staff login. If that relationship ever
changes, swap the folder for a fictional clinic rather than editing it in place.

It is a **client deliverable, not a Flossify page**, and it deliberately does
not follow the Swiss rules above: a patient expects a clinic site to feel warm,
so the sample is rounded, shadowed and set in a serif, in the clinic's own gold
and espresso. Keep that exception inside the folder. Its CSS is scoped to its
own document and imports nothing from `global.css`. The clinic's service
photographs are its own stock images and some show people; the no-faces rule
governs Flossify's imagery, not a client's.

Rules that still hold there:

- **No third-party fonts or scripts.** Fraunces and Plus Jakarta Sans are
  self-hosted in `assets/fonts/` (latin subset, variable). The one embed is the
  Google Maps iframe in the contact section, lazy-loaded.
- **`noindex`, and labelled as a concept** in the top bar, footer and on
  `/websites/`, so it never competes with or passes for the clinic's live site.
- Health copy (first aid, aftercare, the Smile Finder) is general guidance and
  says so on the page. A dentist reviews it before any real client ships.
- Content lives in `js/data.js`; the palette is the token block at the top of
  `css/styles.css`. Its animations run for everyone too: `reduceMotion` in
  `js/app.js` is a constant `false` (kept rather than deleted at twenty call
  sites) and the stylesheet has no reduced-motion block.

## The staff entrance — `/auth/login/`, `/auth/forgot/`, `/auth/code/`

All three share `src/components/StaffEntrance.astro`: the clinic from the
home page's film behind, a compact pane of dark smoked glass with the form
on the right (the owner: "make the boxes translucent and compact so that the
video background is still emphasized"), and nothing along the foot. On sign-in the camera walks from the front door
(2.0s) to the reception desk (9.0s) at 0.85× and holds there — you sign in
at the front desk; a form shown again after a miss, and the other two pages,
open already at the desk (`signin-door-1440.webp`, `signin-desk-*.webp` are
the film's own frames).

Built for a front desk between patients and a dentist with gloves just off:
- **Fields 50px tall at 16px** (phones do not zoom), the button 59px, all
  measured. Text on the glass is light in both themes (≥5.3:1 measured against
  the brightest pixel behind it). Use `.entry-dim` / `.entry-rule` inside the
  pane, never `text-ink-2` / `border-line`: utilities outrank the component
  layer, so a theme utility paints dark grey on the dark glass (it did: 1.2:1). A **Show** button on every password, a **Caps Lock** line.
- **This device: Shared at the clinic / My own**, a two-half switch with one
  line under it saying what the chosen half does. Shared signs out after 12
  hours and remembers nothing; own lasts 14 days and remembers the email on
  that device only (`SESSION_HOURS` in `auth.ts`, the cookie's `maxAge`
  follows). Shared is the default, because a clinic computer usually is.
- After a wrong password the email stays, the password empties, the cursor
  is in it, and the sentence sits right above the button.
- Offline disables the button and says why in the pane — brownouts are real.
- Fits a 1366×768 clinic monitor without scrolling to the button, and 1440×900
  without scrolling at all.
- `entrance-check.mjs` in the session scratchpad measures all of it.

## The patient side — `/find/`

Built from `docs/service-map.md`. Rules that shaped it, and that hold:

- **Only availability the clinic can honour.** Slots come from the clinic's
  hours, the chosen dentist's days and the service's chair time; clinics not on
  the workspace get a labelled *request* path, never a calendar. The "taken"
  slots are a stable hash of the slot until a real schedule exists.
- **No account.** Name, mobile, reason. A known mobile is greeted by name.
- **Status is Manila time and never colour alone** — the dot changes and the
  words change with it (`statusFor` in `src/lib/availability.ts`).
- **Every trust claim names its source.** "PRC licence · checked <date>" means a
  person looked it up; there is no API. Specialty is shown only for the seven
  Board-recognised fields. HMO chips are what the clinic reported and say
  "confirm with your HMO".
- **Hooks are `data-*` attributes and must not collide.** Two bugs came from
  `$('[data-tip]')` matching the chips' own `data-tip` and `$('[data-done]')`
  matching progress marks. A hook that is queried with `querySelector` gets a
  name nothing else uses.
- **Toggle the `hidden` attribute, never the `hidden` utility class**, on
  anything JavaScript shows later; the class wins and the element stays gone.
- Bookings live in `localStorage` (`flossify:bookings`) with a three-minute
  undo. On a live clinic the same submit lands in the workspace.

## Backend — Postgres, RLS, sessions

The workspace and the patient directory read from PostgreSQL. Rules:

- **The app is never a superuser.** It connects as `flossify_app`; superusers
  bypass row-level security and `src/lib/db.ts` refuses to start as one.
- **Every clinic query goes through `withClinic(clinicId, fn)`.** It sets
  `app.clinic_id` for one transaction; RLS does the isolating. Do not add a
  `where clinic_id = …` and think that is the protection — the policy is.
- **Public reads go through security-definer functions** in
  `src/data/migrations/003_public_read.sql`, which return a clinic's public
  face only. Adding a public field means adding it there, not opening a table.
- **Staff is keyed by group, not clinic**, and is not under RLS; branch access
  is `staff_access`, re-checked on every workspace request (`requireWorkspace`).
  Before a tenant exists (sign-in), branches are read through the definer
  function `staff_branches(staff_id)`, which puts `staff.home_clinic_id` first —
  that is where sign-in lands when the link did not ask for a branch.
- Sessions are HMAC-signed cookies (`src/lib/auth.ts`); passwords are scrypt.
  `SESSION_SECRET` rotation signs everyone out.
- `npm run db:setup` is destructive: it drops the dev database (and refuses a
  database that is not on this machine). Migrations are additive files in
  `src/data/migrations/`, applied by `npm run db:migrate`
  (`scripts/db/migrate.ts`), which setup.sh also uses: each file once, in its
  own transaction, recorded in `schema_migrations`. So **never edit an
  applied migration or `schema.sql`** — a change is a new numbered file. No
  BEGIN/COMMIT inside a file (the runner refuses them). A database built
  before the runner existed is adopted with
  `npm run db:migrate -- --baseline=<newest file it really has>`.
- Two schema bugs were fixed on the way in: `citext` was used but never
  enabled, and the RLS policy on `clinic` referenced `clinic_id` (it has `id`).
- **Every form post carries `<Csrf />`** (`src/components/Csrf.astro`) and its
  handler checks `csrfOk()` before touching anything; a miss redirects back
  with `?stale=1` and the page shows `CSRF_MESSAGE`. Astro's Origin check also
  runs. JSON APIs are covered by CORS preflight instead.
- **Rate limits are `hit(key, limit, window)`** (`src/lib/throttle.ts`), a
  fixed window counted in Postgres by `throttle_hit()` so every instance sees
  one number. The limits live in `LIMITS`; keys are `what:by:who`
  (`login:e:<email>`, `book:p:<phone>`). Sign-in, forgot, code, booking,
  cancel, sign-up and the inbound webhook are all limited. Behind a proxy set
  `TRUST_PROXY=1` or every caller is one address.
- **A password change bumps `staff.token_version`**; the session carries `tv`
  and `canOpen()` compares them on every workspace request, so a reset signs
  out every other session at once. Sign-in events (ok, fail, locked, logout,
  reset, invite, signup) go to `auth_event`, which has no tenant and never
  joins to a patient.
- **Reset and invitation are six-digit codes texted to `staff.phone`**
  (`src/lib/codes.ts`: HMAC-stored, 15 min / 24 h, five tries, one live code
  per purpose). `/auth/forgot/` never says whether a number is known;
  `/auth/code/` serves both purposes (invite when the row has no password).
  No email channel exists — a staff member with no mobile on file is reset by
  the owner from Settings → Team.
- **A sign-in code is for the phone it was texted to, never for a page.** The
  Messages page blanks the body of `reset` and `invite` rows (the review
  found a dentist could read the owner's reset code there and take the
  account). Nothing that renders `message_log.body` may show those kinds.
- **A reply belongs to the clinic that last texted that number**
  (`sms_inbound()` in 007 looks the sender up in outgoing texts first), and a
  sender with fewer than ten digits matches nothing. `clinic.slug` is unique
  across the service (007), not per group.
- **Texts are queued, never sent, by the app** (`queueText()` in
  `src/lib/messages.ts`, inside a clinic transaction). `npm run sms:worker`
  sends them through `SMS_PROVIDER` (`console` in dev, `semaphore` live),
  claiming and marking rows only through `sms_claim_due()` / `sms_mark()`,
  enqueues tomorrow's reminders once each (`sms_enqueue_reminders()`,
  `dedupe_key = reminder:<appointment id>`), holds patient texts between
  9 pm and 8 am Manila, and retries 1 m / 5 m / 30 m before `failed`. Replies
  land on `POST /api/sms/inbound` **as JSON** with header `X-Inbound-Secret`
  (Astro's Origin check refuses a form-encoded post that carries no Origin,
  which is what a gateway sends — keep the check on and point the gateway at
  JSON) and go through `sms_inbound()`: Y confirms the sender's next visit. **No links in any text**
  — Philippine telcos drop them. **And no text asks for a reply**: Semaphore
  sends one-way from a sender name, so a reply reaches nobody. The reminder
  (019) names the day ("Thu 24 Sep, 9:00 am", never "tomorrow": quiet hours
  can hold it to the visit day), says to call the clinic to move it, and
  skips requests the desk has not placed; confirmations promise a reminder
  only when one will come (`willRemind` in `src/lib/availability.ts`). The
  inbound route stays for a future two-way gateway.
- **A clinic can create itself** at `/start/`, through the definer function
  `signup_clinic(jsonb)` (006), because nothing can insert a clinic under RLS
  before the tenant exists. It starts unlisted with request-mode booking,
  Mon–Sat 9–5, the default fee guide, and its owner as the only staff;
  `clinic.listed` is the owner's switch in Settings and `public_directory()`
  reads only listed clinics. Uploaded photos are `up:<uuid>` keys in
  `clinic.photo_keys`, stored under `UPLOAD_DIR` and served by
  `/uploads/[...path]` behind a strict path regex.

## Production — settings, database, deploy

`docs/deploy.md` is the procedure and `docs/launch.md` the owner's checklist.
The rules that live in code:

- **Settings are read from `process.env` when the server runs, never from
  `import.meta.env`.** Astro writes `import.meta.env.X` into the build as a
  literal: a build on the Mac carried its `DATABASE_URL` and
  `SESSION_SECRET` in `dist/server` (measured), and on a server the host's
  values were ignored. `src/lib/dotenv.ts` loads `.env` into `process.env`
  at runtime on the owner's machine (never overriding the environment);
  import it first in any module that reads a setting when it loads.
  `import.meta.env.DEV` / `PROD` are fine — they are build facts, not settings.
- **`src/lib/env.ts` refuses an unsafe production start** — the dev database
  password, a short or placeholder `SESSION_SECRET` / `SMS_INBOUND_SECRET`,
  console SMS (unless `ALLOW_CONSOLE_SMS=1`), `SHOW_DEMO_LOGINS`, no
  `UPLOAD_DIR` — with one error listing every problem. Production means
  `NODE_ENV=production`, or the built server (`npm start`) unless NODE_ENV
  says development; never the astro CLI. The middleware calls it before any
  page; the SMS worker calls `assertEnv('worker')` at start.
- `src/middleware.ts` adds the security headers (HSTS in production, nosniff,
  `frame-ancestors 'none'` + X-Frame-Options, Referrer-Policy,
  Permissions-Policy) to every page the server renders. Prerendered pages and
  public files come from the adapter's static handler and do not get them
  (docs/deploy.md section 9). `GET /healthz` is 200/503 on a `select 1`.
- **Behind the host's HTTPS proxy** Astro trusts X-Forwarded-Proto/Host only
  for `security.allowedDomains` in `astro.config.mjs` (flossify.ph, www, plus
  `EXTRA_HOSTS` read at build time). Without that every form post was 403
  (measured). The domain is **flossify.ph**.
- `SHOW_DEMO_LOGINS=1` (local `.env` only) shows the seeded logins on the
  sign-in page and the "development database" banners; production refuses it.
  `seed.ts` refuses production, a non-local host, and a database with staff.
- Flossify's own operations account on a server comes from
  `npm run admin:create -- <email> "<Name>"` (prompts for the password; run
  again to reset it). It stores no mobile, so a forgotten operations
  password is reset that way, not by text.
- **No clinic is invoiced while `BILLING_FINAL` is false**
  (`src/lib/billing-config.ts`): the worker skips `billing_issue_invoices`,
  `/admin/billing/` hides the issue button, and every price is labelled "not
  final yet". Flip it only when the prices, pay-to details, billing email
  and pause policy in `src/lib/billing.ts` are the owner's real ones.
- The reset / patient code pages never put a mobile number in a URL: it rides
  in a 15-minute httpOnly cookie (`fl_code_phone`, `fl_me_phone`) scoped to
  the code page and cleared once the code works.
- One email and one mobile per staff account **across the whole service**
  (sign-in finds people by email, resets by mobile); Settings → Team and
  `/start/` both check globally.

## Round three — operations, patients, billing, compliance, chart, PWA, claims

- **Flossify's own people are `platform_admin` rows** (008) in a group with no
  clinic; `requireAdmin()` gates `/admin/`, sign-in lands them there. They have
  no tenant, so every cross-clinic read is a definer function named `admin_*`
  that returns exactly the columns a page shows. Seeded: `ops@flossify.example`.
- **PRC licences are checked by a person** on `/admin/prc/`: `staff.prc_status`
  pending → checked (sets `prc_checked_on`) or mismatch (clears it and texts the
  owner). Public pages say "PRC check pending" until then.
- **A patient is their mobile number** (`/me/`): a texted code (`phone_code`,
  `issuePhoneCode`), a separate cookie (`fl_patient`), and visits across every
  clinic through `patient_visits(phone)` / `patient_act(phone, id, action)` —
  matched on the number only, never on a name.
- **Billing is a subscription per group** (011): 30-day trial, monthly
  invoices, manual payment (GCash / Maya / bank) marked paid by operations.
  Prices and pay-to details are **placeholders** in `src/lib/billing.ts`.
  Nothing is switched off for a late payment; patients' records come first.
- **Consent is a record, not a boolean** (012): `patient_consent` says which
  `consent_version` a patient agreed to, when, how. Booking writes one. The
  notice is `/privacy/`; the DPO and NPC registration number live on the
  group (`Settings → Privacy`). Do not claim NPC registration before it is true.
- **Chart edits save as they are made** (`POST /api/chart`, CSRF in the
  `X-CSRF` header, `tooth_state` rows superseded, audit `chart.update`).
- **The workspace installs** (`/manifest.webmanifest`, `/sw.js`): the service
  worker caches the shell and fonts only — **never patient data or /c/ pages**
  — and shows `/offline/` when the line is gone. Offline charting is not built;
  the home page says so.
- **Claims have their own page** (`/c/<slug>/claims/`, 013): HMO and
  PhilHealth providers, draft → filed → approved / partly / denied → paid,
  aging against `expected_days`, CSV export. Coverage wording comes from
  `coverage.astro`; do not invent PhilHealth rules. One payor per name per
  clinic and one PhilHealth payor, enforced by index (017); the accreditation
  trigger switches the PhilHealth payor on and off.
- **A request is not a booking until the desk sets a time.** `patient_act`
  and `sms_inbound` refuse to confirm a request the desk has not placed —
  `source = 'request' and moved_at is null` (018); `patient_visits` exposes
  that as `placed` so `/me/` shows Confirm the moment the clinic gives the
  request a real time. Gating on `source` alone (017) locked the patient out
  for good, because nothing ever clears it. The billing strip in the
  workspace is owner/admin only, like the Billing page. The sign-in lock
  counts first, atomically, and refunds on success (`throttle_refund`).
- The privacy notice promises text logs go after two years; `retention_purge()`
  runs on every worker pass to keep that true. Change the words and the
  function together.

## The schedule — `/c/<slug>/schedule/`

- **The status machine is the server's.** `NEXT_STATUS` in
  `src/lib/schedule.ts` says where a visit may go from where it is, and
  `applyStatus` refuses the rest: a cancelled or completed visit cannot walk
  back into a chair another patient now holds, and cannot be moved. The
  pages' buttons follow it; they do not define it.
- **One booker at a time per clinic.** `/api/schedule` *and* `/api/bookings`
  take `pg_advisory_xact_lock(hashtext(clinic_id))` and re-check the slot
  **inside** the transaction. The public booking API used to check with
  `openSlots()` before opening one, so a patient and the front desk could
  both take a dentist's minute — measured, twice.
- **A move drops the texts that named the old time** (`dropStaleTexts`),
  including the reminder's dedupe key, so the day-before pass writes a fresh
  one for the new day.
- One day, one column per chair (or per dentist with `?by=dentist`), 15-minute
  rows over the clinic's hours; a week view for the shape of the week. Web
  bookings and seeded visits arrive with `chair = null` and sit in an
  **Unplaced** lane until the desk drags them onto a chair — that lane is the
  inbox, do not hide it.
- Every change is one JSON call to `/api/schedule` (POST create, PATCH
  move/status) with the `X-CSRF` header; `findClash()` in `src/lib/schedule.ts`
  refuses a chair or a dentist double-booking with one sentence naming who is
  in the way. Status changes follow the Today page's state machine; copy it,
  do not fork it. Moving a future visit texts the patient the new time.
- Molarsoft's calendar is behind a login; what clinics praise in any scheduler
  is few taps, colours that mean status, a visible flow, and never a slot the
  clinic cannot honour. The `QUEUE` colour classes on the Today page are the
  only status colours; the schedule reuses them exactly.

## Open — read before shipping

- The Semaphore provider is written to their v4 API but has not been run
  against a live key; the first real send needs a registered sender name and
  a check of the response shape.
- No email channel at all: reset, invitations and receipts are text-only.
- PRC licence checks are still a person's job; `prc_checked_on` stays null for
  self-added dentists until someone verifies, and the public profile says so.
- Billing is manual payment marked paid by operations; no gateway. Prices,
  pay-to details and the pause policy are placeholders in
  `src/lib/billing.ts`, and `BILLING_FINAL` (`src/lib/billing-config.ts`)
  stays false until the owner sets them: nothing is invoiced before that.
- **Not recordable yet, for real patients:** medical history / allergies,
  birth date, and patient invoices and payments (only `seed.ts` writes
  `medical_history`, `birth_date`, `invoice`, `payment`). The screens hide
  what would be empty (balances tile, Balance column) and the marketing copy
  no longer claims them. These are the next features a clinic will ask for.
- Nothing is deployed: no host is chosen, flossify.ph is parked at Namecheap.
- "Any available dentist" slots count chairs, not which days dentists work.
- Settings → Team cannot edit a staff member's name, email or PRC number after
  the invite, and the clinic's founding year / PDA membership / staff bios
  have no form (the public pages hide them when empty).
- The privacy notice (consent version privacy-2026-09) says texts let patients
  "confirm or cancel by text" and does not mention the IP address stored with
  consent: a new consent version, reviewed by the owner's lawyer, is needed.
- `/privacy/` hardcodes the current `consent_version` id; publish a new
  version and the page together.
- Offline charting with catch-up sync is not built; the service worker
  caches the shell only.
- Desk-side consent capture (walk-ins) is paper for now; only web bookings
  write `patient_consent`.

## Layout

```
src/pages/index.astro          the marketing page (tour, product, services, FAQ)
src/pages/clinics.astro        workspace directory
src/pages/c/[clinic]/…         prototype clinic workspace
src/pages/websites.astro       the clinic-website service, with the sample framed
src/pages/find/index.astro     patients: find a clinic by symptom, service, HMO, PhilHealth, open now
src/pages/find/[clinic]/…      the clinic's public page, and its five-step booking (no account)
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
src/lib/messages.ts            queueText(), phone normalising, the text wording
src/lib/sms.ts                 provider seam: console (dev), semaphore (live)
src/lib/uploads.ts             clinic photos: sharp → 1600/640 webp under UPLOAD_DIR
src/lib/workspace.ts           requireWorkspace: session + branch access, every request
src/lib/directory-db.ts        public_directory() → the shapes the pages render; real open slots
src/lib/availability.ts        Manila-time status and slot arithmetic
src/pages/api/                 availability, bookings (create / undo-or-cancel), chart (tooth_state), sms/inbound
src/pages/auth/                sign-in, sign-out, forgot (text a code), code (set a password)
src/pages/start/               a clinic sets itself up
src/pages/c/[clinic]/settings/ profile + hours + HMOs + listing, fees, team (invites), photos, privacy (DPO), billing
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
scripts/sms/worker.ts          the sender: npm run sms:worker (loop) / sms:once
public/samples/swiftcare/       sample clinic website (see "Sample client sites")
docs/service-map.md            what to build for patients, dentists and clinics, and why (Sept 2026)
src/components/Odontogram.astro  32 teeth, FDI/Universal/Palmer, surface-scoped
src/data/schema.sql            full multi-tenant Postgres model with RLS
src/data/lqip.json             blur placeholders, keyed by image name
src/data/shot-size.json        real screenshot dimensions (generated)
public/video/                  the tour film + poster
```

`lqip.json` and `shot-size.json` are generated. Regenerate them whenever the
images or screenshots change, or the reserved boxes drift out of step.
