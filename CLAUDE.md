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

The film is the ground of the **whole home page**: one continuous 30s take from
the pavement to the chair in a fixed layer (`.film-bg`) behind everything,
scrubbed by the document's own scroll (`scrollY / (scrollHeight − innerHeight)
→ video.currentTime`). The top of the page is the pavement, the footer is the
chair, and every section between is a `.page` standing in whichever room the
camera has reached, its content on a paper `.pane` so the footage shows in the
gaps. The owner asked for exactly this — "a video that shoots all the page" —
after a version that kept the film to the opening section. Do not go back to
that. Nothing scales; the forward motion is in the footage. The rail at the
foot of the viewport names the room — Outside, Reception, The corridor, The
chair — switching at the moments the footage arrives there (`from` fractions
on `stops` in `index.astro`, read off a frame sheet), not at equal quarters.
See `docs/generation.md` for how the film was made and how to regenerate it.

- Encoded with a **5-frame GOP** so scrubbing lands on a real frame. This is why
  the files are larger than a streaming encode, and why **VP9 loses** here — it
  was measured at 5.05MB against H.264's 4.77MB at worse quality. Ship H.264.
- Phones get `tour-960.mp4`.
- **The scrub is not gated by Reduce Motion.** It only moves when the visitor
  scrolls, so it is their motion, not the page's; the autonomous motions
  (reveals, the ticker, transitions) stay gated. An earlier version gave the
  film no `src` under Reduce Motion, and the owner — whose Mac has it on — saw
  a still and asked why the video was images.
- `--rail-h` is the rail's height; the hint and the footer clear it with it.
  Rail captions are two lines at 1024px: keep them under ~105 characters.

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
- The owner's Mac has Reduce Motion on. The film scrubs there regardless (see
  The tour); `?motion=on` on any page URL (class `force-motion` on `<html>`)
  turns the autonomous motions back on for that load. Test both states.

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
  `css/styles.css`. `?motion=on` on the URL forces the animations on for demos
  on a machine with Reduce Motion enabled.

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
- `npm run db:setup` is destructive: it drops the dev database. Migrations are
  additive files in `src/data/migrations/`, run in name order after `schema.sql`.
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
  — Philippine telcos drop them.
- **A clinic can create itself** at `/start/`, through the definer function
  `signup_clinic(jsonb)` (006), because nothing can insert a clinic under RLS
  before the tenant exists. It starts unlisted with request-mode booking,
  Mon–Sat 9–5, the default fee guide, and its owner as the only staff;
  `clinic.listed` is the owner's switch in Settings and `public_directory()`
  reads only listed clinics. Uploaded photos are `up:<uuid>` keys in
  `clinic.photo_keys`, stored under `UPLOAD_DIR` and served by
  `/uploads/[...path]` behind a strict path regex.

## Open — read before shipping

- The Semaphore provider is written to their v4 API but has not been run
  against a live key; the first real send needs a registered sender name and
  a check of the response shape.
- No email channel at all: reset, invitations and receipts are text-only.
- PRC licence checks are still a person's job; `prc_checked_on` stays null for
  self-added dentists until someone verifies, and the public profile says so.
- Subscription billing, the PhilHealth claims pipeline, patient accounts, the
  PWA, and the compliance items (NPC registration, a named DPO, consent
  records with versions) are not started.
- Odontogram edits are not persisted.

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
                               005 codes / auth events / throttle / text queue / listed, 006 signup_clinic
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
src/pages/api/                 availability, bookings (create / undo-or-cancel), sms/inbound
src/pages/auth/                sign-in, sign-out, forgot (text a code), code (set a password)
src/pages/start/               a clinic sets itself up
src/pages/c/[clinic]/settings/ profile + hours + HMOs + listing, fees, team (invites), photos
src/pages/c/[clinic]/messages/ the branch's texts, both directions; send again, cancel, text a patient
src/pages/uploads/             serves uploaded photos, path-checked
scripts/db/                    setup.sh (drop, create, schema, migrations, seed), seed.ts
scripts/sms/worker.ts          the sender: npm run sms:worker (loop) / sms:once
public/samples/swiftcare/       sample clinic website (see "Sample client sites")
src/components/Odontogram.astro  32 teeth, FDI/Universal/Palmer, surface-scoped
src/data/schema.sql            full multi-tenant Postgres model with RLS
src/data/lqip.json             blur placeholders, keyed by image name
src/data/shot-size.json        real screenshot dimensions (generated)
public/video/                  the tour film + poster
```

`lqip.json` and `shot-size.json` are generated. Regenerate them whenever the
images or screenshots change, or the reserved boxes drift out of step.
