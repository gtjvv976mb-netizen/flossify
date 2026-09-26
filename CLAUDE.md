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

## Art direction — soft clinical, everywhere

**One look for the whole site, by the owner's decision (26 Sep 2026).** The
workspace was redesigned in a soft template first (the owner had called the
Swiss workspace "hard, angry and dark" next to SwiftCare's "soft, friendly and
accommodating"); after seeing it the owner said: *"I love what you've done!
Now implement this kind of HUD/UI design and template to the whole site."* So
every page — the film home page, /find/ and booking, /dentists/, /coverage/,
/websites/, /privacy/, /start/, /me/, the staff sign-in, the workspace
(/c/<slug>/…) and the operator's page (/admin/) — uses the **soft template**
in `docs/workspace-redesign.md` ("The soft template", "The whole site, soft",
"Site API"). **The Swiss rules are retired** (no radius, no shadow, uppercase
mono labels, Archivo): do not bring them back on any page.

**Frosted glass where a clinic is the background** (the owner, 26 Sep 2026:
"make the panels translucent … so more of the background can be seen"): the
home page's cards on the film (`.pane.pane-glass`, see "The film"), the
clinic sign-up `/start/`, whose compact glass cards stand on a fixed photo of
the treatment room (`/img/ws/chair-*.webp`), and Find a clinic `/find/` (the
"I'm a Patient" page; its glass is scoped to `.pt-glass` in the page, over the
waiting area `/img/ws/waiting-*.webp`), PhilHealth & HMO `/coverage/` (over
the reception desk, `/img/ws/reception-*.webp`, scoped to its `cv-*` classes)
and My visits — the door `/me/` and `/me/code/` (`_Door.astro`) and the
signed-in `/me/visits/` (`_Shell.astro`, scoped to `.me-shell` so the clinic
workspace is untouched), over the waiting area. A clinic's own page and its
booking (`find/_ui/ClinicRoom.astro` + `clinic-glass.css`, scoped to
`.cl-glass`) stand on THAT clinic's own cover — its first uploaded photo
(`up:` key), never a house or stock photo, which behind a real clinic's page
would read as its interior — or, with no upload, a soft abstract blur. A
clinic can upload anything, so the room is washed/dimmed enough that every line
passes over an all-black, all-white and harshly striped cover, and
`room-tone.ts` looks at each upload once (cached; never throws) to calm busy or
dark ones further. A dentist's page still stands on opaque cards. Glass uses the `--glass-*`
tokens in global.css; every line on it is measured against the pixels behind
it (light and dark, 1440 and 390) — measure again before making it clearer.

- **Surfaces:** white cards with gently rounded corners — 12px cards, 16px big
  cards and sheets, 10px fields and buttons, 999px pills and avatars — a
  hairline (`#e6e9ee`) and at most a whisper of shadow. No black buttons, no
  black blocks.
- **Colour:** slate words, never black (`#1f2937`, `#475467`, muted
  `#667085`); one calm **teal** for the main action and the chosen thing (fill
  `#0e7471` under white words, `#0d706d` words); green for money in, amber for
  "needs attention", blue for information, a soft red for "blocked", each
  with a pale tint and its own darker words. Dark mode is soft charcoal
  (`#15191e` page, `#1d232a` cards), never pure black.
- **Type:** one friendly sans — Inter where the device has it, the system's
  own UI face otherwise. **No web font is fetched from anywhere**, and never
  Google Fonts: it is a third-party connection on a page about medical
  records, and it is blocked outright in some sandboxes. IBM Plex Mono
  (self-hosted in `public/fonts/`) only for reference numbers — chart and
  statement numbers, booking refs, a six-digit code. **Sentence case
  everywhere; no uppercase typewriter labels.**
- **Very simple:** one teal button per screen (the public bar's Open your
  clinic goes quiet, `cta="quiet"`, wherever the page has its own teal
  action); line icons (`src/components/ws/Icon.astro`) beside nav items,
  section titles and main actions; round initial avatars for people, a
  clinic's initials in a rounded square; tinted callouts with an icon, in
  plain words.
- **Frames:** public pages have a soft top bar
  (`src/components/site/SiteHeader.astro`; a drawer from the left on phones);
  the workspace a left sidebar with four tabs (Dashboard · Patients ·
  Finances · Clinic settings); My visits (/me/visits/) the workspace's
  sidebar pattern (`src/pages/me/_Shell.astro`), and the way in to it (/me/,
  /me/code/) the patients' bar over one card (`_Door.astro`); the staff
  entrance one white card on the film (`StaffEntrance.astro`).
- **Still true everywhere:** motion always on, nothing fixed to the bottom of
  the screen, targets ≥44px, fields ≥16px, and contrast **measured** (≥4.5:1
  against the worst pixel behind the words, light and dark; muted slate on a
  pale tint is 4.48 — use ink-2 or the tint's own ink there).
- **Exceptions:** the SwiftCare sample in `public/samples/` (its own design)
  and the paper of print pages (black on white).

`src/styles/global.css` is the whole system: the tokens on `:root` (both
themes; the utilities `text-ink`, `bg-teal-tint`, `rounded-card` … read them),
then the site's classes (`.btn`, `.meta`, `.chip`, `.field`, `.pane`, `.q` …,
drawn soft under their old names), the film, the staff entrance, the public
top bar and the workspace. Read the comment at the top of the `@layer
components` block before editing it — component rules **must** stay inside
that layer or they beat Tailwind utilities on equal specificity. The heading
rule is in `@layer base`, so utilities on headings work; the workspace and the
staff entrance keep their own unlayered heading rules, and the workspace must
not change when the site's classes do (compare computed styles before and
after, as the Site API section says).

## The tour

**The home page's pages** (the owner's layout, 25 Sep 2026), in this order,
all standing on the film (no section numbers any more: after the opening,
each page has a title with a line icon): *Your clinic, in the Web* —
"Switch to paperless, seamless, effortless daily operations:" and the buttons *Open your clinic in the web*
(/start/) and *I'm a Patient* (/find/); Services, for clinics and for
patients; How it works, both ways in; Pricing — ₱800 a month per
branch, everything included (`PRICE_PER_BRANCH` in `src/lib/billing.ts`, the
one number); Partners — the clinics really listed, read live from the
directory (the page is server-rendered for this); How to register — two
walkthroughs recorded from the real product with sample data
(`scripts/record-walkthroughs.mjs`, `public/video/register-*.mp4`); Know
the team — from `src/data/team.ts`, and left out while that list is empty:
real people only, never a placeholder person. The service and price lists
name only what is live (billing, health history and desk consent went in
once they shipped).


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
camera has reached, its content on a compact **frosted glass** card
(`.pane.pane-glass`; the owner, 26 Sep 2026: "make the pages in the home page
more compact and make the panels translucent so more of the background can be
seen"). The cards are centred at 1160px so the film shows on both sides, with
compact padding and rows; the footage shows through them (60% white on a 24px
blur; 74% charcoal in dark mode) and in full in the gaps between them. Cards
on the glass are lighter glass with no blur of their own (on a phone the long
lists and steps sit on the bare glass). Because the room shows through, every
line is measured against the pixels actually behind it, over the frame the
film is showing there (light and dark, 1440 and 390, every 110px of scroll,
and over the poster alone): all AA, lowest 4.7:1. So on the glass: ink for
words, ink-2 for small print (never the muted grey), links and the keyboard
ring in the deepest teal (#06403e; the deep teal #0b5d5b fell to 3.5:1 over
the blurred hedges; the pale #98e3dc in dark mode), numbers and checks white on the teal fill; do not make
the glass more transparent without measuring again. Only the home page uses
`.pane` (the other pages stand on `.card` or `.ws-pane`). The owner asked for exactly this — "a video that
shoots all the page" — after a version that kept the film to the opening section. Do not go back to
that. Nothing scales; the forward motion is in the footage. From 1180px the
bar names the page and the room in a small pill beside its links —
"Services · Reception" — the page from the section in view (its `data-sec`),
the room switching at the moments the footage arrives there (`ROOM_FROM` in
`src/data/film.ts`, from times read off a frame sheet), not at equal quarters.

**No footer and nothing fixed at the foot** — on the home page or the staff
entrance. There used to be a readout rail fixed to the bottom of the viewport
and a link footer after the last page; the owner removed both ("the footer
takes too much space … label each page on the site itself"). Pages are
labelled where they are: the bar's readout, each section's own title, and
the "Staff entrance" pill at the head of the sign-in card. The footer's links
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
not follow Flossify's own design system above: a patient expects a clinic site to feel warm,
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
home page's film behind, and on the right one compact white card with soft
12px corners holding the form — the soft template, so the door into the
workspace looks like the workspace (95% white on a light blur; soft charcoal
in dark mode, where a light charcoal veil also dims the film). The film stays
the ground around it (the owner: "make the boxes translucent and compact so
that the video background is still emphasized"). The card's head is the
Flossify mark and a small "Staff entrance" pill; top left, one quiet pill for
a patient at the wrong door ("Patients: find a clinic"); nothing along the
foot. On sign-in the camera walks from the front door
(2.0s) to the reception desk (9.0s) at 0.85× and holds there — you sign in
at the front desk; a form shown again after a miss, and the other two pages,
open already at the desk (`signin-door-1440.webp`, `signin-desk-*.webp` are
the film's own frames).

Built for a front desk between patients and a dentist with gloves just off:
- **Fields 50px tall at 16px** (phones do not zoom), the button 52px, every
  target at least 44px, all measured. Slate words on the white card (light
  words on the charcoal one in dark mode), every colour at least 5.2:1 with
  the card composited over pure black and over pure white, since the film
  reaches both; small words are ink-2, never muted. The card has its own
  tokens (`--en-*` on `.entrance`) and pieces (`.entry-*`, the staff-entrance
  section of `global.css`): build on those inside it. A **Show** button on
  every password, a **Caps Lock** line.
- **This device: Shared at the clinic / My own**, two soft pills with one
  line under them saying what the chosen one does. Shared signs out after 12
  hours and remembers nothing; own lasts 14 days and remembers the email on
  that device only (`SESSION_HOURS` in `auth.ts`, the cookie's `maxAge`
  follows). Shared is the default, because a clinic computer usually is.
- After a wrong password the email stays, the password empties, the cursor
  is in it, and the sentence sits right above the button.
- Offline disables the button and says why on the card — brownouts are real.
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
  With `EMAIL_PROVIDER` set (023, `src/lib/email.ts`) the same codes can also
  go by email; with it unset there is no email channel, and a staff member with
  no mobile on file is reset by the owner from Settings → Team.
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
  worker caches the shell, the fonts and `/offline/` (shown when the line is
  gone) — **never the API, uploads or a /c/ page, but one**: the patient
  record whose chart is open, kept as a marked copy for at most 4 hours and
  dropped at every sign-in and sign-out (the rules are at the top of
  `sw.js`). **Offline charting is built (025):** an open chart keeps working
  through a brownout; its changes wait on the device (IndexedDB,
  `src/lib/offline-queue.ts`) and reach `POST /api/chart` when the line is
  back, each once (`sync_change`); when a colleague charted the same tooth
  first, their finding stays and the person is told which tooth — never
  resolved silently. The home page and `/offline/` say so.
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
- "Any available dentist" slots count chairs, not which days dentists work.
- Settings → Team cannot edit a staff member's name, email or PRC number after
  the invite, and the clinic's founding year / PDA membership / staff bios
  have no form (the public pages hide them when empty).
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
- Patient forms throttles are estimates: 40 an hour per address and poster,
  8 a day per mobile, 300 a day per poster, 200 missed links an hour per
  address; 500 waiting forms per poster answers "full".

## Layout

```
src/pages/index.astro          the marketing page (tour, product, services, FAQ)
src/pages/clinics.astro        workspace directory (no bar or page links to it now; see "Site API")
src/pages/c/[clinic]/…         prototype clinic workspace
src/pages/c/[clinic]/patients/ the Patients tab (Dashboard · Patients · Finances · Clinic settings): every patient + a record check, one query (_list/list.ts)
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
src/pages/f/[key].astro        patients: the patient forms from the QR code on a clinic's desk (five steps, no account)
src/lib/patient-forms.ts       forms key, public submit, the "New patient forms" queue, adding a form to the records
src/lib/patient-forms-def.ts   the questions as data, reading a post, labelling the answers (no Node imports)
src/lib/qr.ts                  QR codes as SVG: error correction H, the Flossify mark in the middle
src/pages/c/[clinic]/patients/qr/     the QR poster: page, print/, _poster.ts (the drawing steps), _draw.ts (the PNG)
src/pages/c/[clinic]/patients/forms/  "New patient forms": the queue, one form (<id>/) and its printout (<id>/print/)
src/pages/c/[clinic]/patients/_forms/ the forms' shared pieces: Answers, Confirm, forms.css, words, fit
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
