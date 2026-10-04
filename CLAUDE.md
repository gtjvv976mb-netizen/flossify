# Flossify

> **Continuing work?** Read `docs/HANDOFF.md` (1 Oct 2026) next: where `main` and the open pull request stand, what to do first, and `scripts/dev/resume.sh`, the check to run before changing anything.


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
dark ones further. Clinic websites `/websites/` stands on the clinic's front
door (`/img/signin-door-*.webp`, scoped to `.wb-glass`); the SwiftCare sample in
its window stays an opaque page with its own branding. A dentist's page still
stands on opaque cards. Glass uses the `--glass-*`
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
- **Light or dark is the person's choice** (`src/components/ThemeSwitch.astro`):
  the site follows the device until someone chooses; the choice is
  `localStorage.theme` (`light` | `dark`, none = match the device), applied
  before first paint by the inline script in Base, Clinic and Admin, and it only
  sets `<html data-theme>`. The switch is in the public bar (a round 44px button;
  in the drawer on phones), on the staff entrance, in the workspace, operations
  and My visits sidebars, and My page has Match my device · Light · Dark. So
  **every dark rule needs both twins** — `@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) … }` and `:root[data-theme="dark"] …` — or a
  chosen theme misses it. Measured: on 12 kinds of page, chosen dark = device
  dark and chosen light = device light.
- **Still true everywhere:** motion always on, nothing fixed to the bottom of
  the screen, targets ≥44px, fields ≥16px, and contrast **measured** (≥4.5:1
  against the worst pixel behind the words, light and dark; muted slate on a
  pale tint is 4.48 — use ink-2 or the tint's own ink there).
- **Exceptions:** the SwiftCare sample in `public/samples/` (its own design),
  the paper of print pages (black on white), and the patient record's sheets,
  which are paper on screen too (record.css, "The record on paper").

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
the "Clinic sign-in" pill at the head of the sign-in card. The footer's links
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
Flossify mark and a small "Clinic sign-in" pill; top left, one quiet pill for
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

## Clinic doors and usernames — `/<clinic>/sign-in/` (029)

`docs/clinic-sites-design.md` is the plan; all five phases are shipped (P1
usernames and doors, P2 roles, P3 People & Roles, P4 tasks, P5 the clinic's
own site at `/<clinic>/`).

- **Every staff account has a username**, unique within its group
  (`staff.username`, `unique (group_id, username)`, `username_ok()` =
  `src/lib/username.ts`). A trigger fills one from the email (then the name)
  when an insert does not say one, so `signup_clinic()`, invitations,
  `admin:create` and the seed need no change. Owners and admins change it on a
  person's page; My page shows it.
- **A clinic's door** is `/<slug>/sign-in/` (`src/pages/[clinic]/`): the staff
  entrance's card (`StaffEntrance` with `door`, the form is
  `components/entry/SignInForm.astro`, shared with `/auth/login/`), the clinic's
  own cover photo behind or the soft blur, never the film. `clinic_door(slug)`
  (definer) is the only read before a tenant; `authenticateAt()` looks the
  username (or email) up in that clinic's group and lets in only someone with
  `staff_access` to THAT clinic. Rate limit `login:u:<slug>:<username>`.
- **The device remembers the last clinic** (`fl_clinic`, a year, public slug
  only): `/auth/login/` — the top bar's "Clinic sign-in" — redirects there,
  carrying `next` and `done`; `?any=1` ("Sign in another way") stays on the email
  door. `/auth/clinic/` is "Find your clinic": a typed address opens any door,
  words search listed clinics only.
- **`/<slug>/` is the clinic's own site** (P5): `SiteHeader clinic=…` (its
  initials and name, its sections as the links, Staff sign-in to its door, its
  booking as the quiet twin of the page's teal Book) over
  `find/_ui/ClinicPage.astro` — the same body `/find/<slug>/` draws (moved there
  byte-for-byte, measured) — in frosted glass on its own photo, with one line
  inside the last glass card: "© <year> <clinic> · Clinic page on Flossify".
  Contrast: 0 fails over a real room, all-black, all-white, harsh stripes and
  no photo, light and dark, desk and phone (lowest 5.3:1); anything added on
  the bare room fails — keep words on glass. A clinic not listed yet opens its
  door instead. An address that is no clinic answers `new Response(null,
  {status: 404})`, which renders the site's 404 page — `Astro.rewrite('/404/')`
  is refused (the 404 page is prerendered).
- **`RESERVED` in `src/lib/slug.ts`** lists first path segments no clinic slug
  may take (`uniqueClinicSlug` skips them: "Find" → `find-2`). A page at a new
  first segment goes on that list.

### Roles and permissions (030)

- **What someone may do is `can(ws, key)`** (`src/lib/can.ts`), never a role
  name. `requireWorkspace` returns `perms`; `canOpen()` reads them with branch
  access on every request, so a role change counts on the next click. The keys
  and their words are `PERMS`; SQL checks use `staff_can(staff, clinic, key)`,
  the same rule (`canEditRecords`, the inbox, the calendar, the patient list).
  The pages show or hide; each page and API refuses on its own.
- **Roles are rows** (`clinic_role`, per group, ranked, `perms text[]`), and
  every group starts with the six old roles ticked exactly as the pages allowed
  before — `clinic_default_roles()` and `DEFAULT_ROLES`, change both together.
  The Owner role holds every key whatever its row says. `staff.role_id` is the
  role; `staff.role` stays as the professional side (owner, a dentist who
  treats, the desk) and a trigger keeps `role_id` in step for code that only
  sets `staff.role`. `staff_access.can_view_finance` still adds Finances and
  amounts at one branch; `can_edit_records` false still takes editing away.
- **Verified by snapshot**: 7 roles × 20 workspace pages, structure identical
  before and after (`snap.mjs`/`cmp.mjs` in the session scratchpad; the
  approach: sign in as each, fingerprint tabs, headings, buttons, form fields
  and links, mask ids). Do the same when a check moves.
- **Roles screen** (Clinic settings → Roles, for `roles.manage`; by default
  the owner): the ranked list, Add role (at the bottom), Edit (name and the
  checklist in four groups; a key you do not hold is shown and cannot be
  changed), move up/down among roles below yours (the list is renumbered in
  one statement), Remove only when nobody holds it (disabled accounts count).
  The Owner row is fixed. Rules and sentences: `settings/_lib/roles.ts`.
- Without `schedule.edit` the calendar is to look at: nothing drags, New and
  a lane click open nothing, and `call()` refuses with the server's sentence
  (`boot.canSchedule`).

### Members the owner makes (031)

- **Add member** (Clinic settings → People) takes a name, a username, a role
  (`RoleField.astro`: the roles you may give, and "treats patients", which is
  the professional side — PRC licence, schedule column, public profile) and a
  first password; email and mobile are optional (`staff.email` is nullable). No
  password and a mobile → the old invitation code. A password someone else set
  sets `must_change_password`: `requireWorkspace` sends them to My page
  (`?first=1#password`) until they choose their own; `setPassword()` clears it.
  The owner's **Set a new password** on a person's page does the same and signs
  them out everywhere.
- **The rank rules are `src/lib/roles.ts`** (`mayManage`, `mayGive`,
  `staffRoleFor`): you change only people below your role, give only roles
  below yours whose every key you hold, never the Owner role, never your own
  role. Every person action re-checks them on the server (a forged post from an
  admin is refused — measured).
- A role change alone does not sign anyone out (perms are read live); a change
  of `staff.role` (the professional side, which the cookie carries) does. The
  030 trigger now only fills `role_id` on insert.
- A session made stale behind the person's back (a new password, disabled) is
  cleared by `requireWorkspace`, which sends them to `/auth/login/` and so to
  their clinic's door — not to "not for that branch".
- **The public profile's own lines (1 Oct).** `staff.pda_member`, `practising_since` and `about` (002,
  shown on `/dentists/<slug>` and the clinic page) are written by a **Public profile** pane on a person's
  page (for anyone with a slug; action `bio`, the Edit details rule: `mayManage` or yourself, `BioValues`,
  `readBio` / `saveBio` in `settings/_lib/people.ts`, audit `staff.bio`) and by the same form on **My page**
  (`#bio`, the person's own, like the PTR). The year is 1950 to this year or blank; the about is one
  paragraph of at most `BIO_MAX` (600) characters. PDA membership stays "as the clinic declared it; not
  checked by us" on the public page. **The clinic's founding year** (`clinic.founded`, "since 2009" on its
  page) is a Founded field beside Dental chairs on Clinic profile; a form drawn without the field keeps the
  saved year. Checked by `scripts/dev/settings/profile-check.mjs` (a bad year refused, saved and audited,
  nothing-changed, the public pages, My page, Founded kept, 390 px); measured: the panes' lines reuse
  measured classes, 0 fails on the phone runs; the desk runs' only fails are inside closed `<details>`
  (the tool measures hidden content).

### Tasks (032)

- `clinic_task` is clinic data under RLS: title, notes, due day, the member
  it is for, who gave it, done at/by, cancelled. `src/lib/tasks.ts`: anyone
  with `tasks.assign` gives tasks to anyone active at the branch; everyone may
  note one for themselves; the person it is for or whoever gave it ticks it
  done or back; only the giver takes it back. Checked in the same transaction.
- The Dashboard shows "Your tasks" (compact, first three) above the calendar
  only while something is open (an empty card pushed the day down; 3 Oct), and
  **New → Task for the team** (or Task for yourself) opens the Tasks page with its
  form (`?new=1`); `/c/<slug>/tasks/`
  (Dashboard tab) has all of yours and the ones you gave. Every tick is a
  small form posting to the Tasks page with `back` (this branch's Dashboard
  or the Tasks page only), so it works with scripts off. Tasks hold no
  patient details (the form says so) and are not part of any record.

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
- **A time tapped on /find/ is held** (p32). The booking opens with it on a
  strip inside the wizard card and skips When while it fits. When it no longer
  fits, the strip turns amber with one sentence and the two nearest free times,
  or a Call button, and Continue goes to When. The steps are named and numbered
  from the ones in the flow (three to five), and the reason chosen on /find/
  carries over.
- **A clinic with one dentist on its public page books with her.**
  `soloDentist()` pins her in `openSlots`, and `/api/bookings` pins her for live
  bookings and requests. The re-check is `slotStillOpen` on her slug, which
  counts her visits, the unassigned ones and the chairs. There is no Dentist
  step. A request there never offers "any dentist", and the When step names her
  days away from the start. Her reminders then name her.
- Blocked time (lunch, closed days, a dentist's hours and leave, a chair out of
  use) is honoured by every slot and every request: "Blocked time (040)" below.

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
- **Free times (p24).** New booking (under Chair · Dentist) and a visit's Move
  form offer up to four free starts for the length on the day chosen, anchored
  on the form's own time, and with a dentist chosen her next two free days
  (`cal/free.ts`, `cal/FreeTimes.astro`). The arithmetic is pure, in `model.ts`:
  `holdsOf`, `freeAt`, `freeStarts`, `pickStarts`, `freeDays`, `blockHolds`. A tap
  fills Time and Chair (a next day's chip fills the Date too); nothing is saved
  until Save, and the server still decides under its lock. Suggestions keep the
  clinic's hours and blocked time (lunch and closures hold everything, a chair
  out of use its chair, a dentist their days, hours and leave), and every visit
  that holds its slot. They count visits with no chair or no dentist yet against
  the chairs and the day's dentists, as /find/ does, and never put a moved visit
  in its own way. The gap after each visit is the clinic's own choice
  (`clinic.turnover_min`, 044, `boot.turnover`; 0 by default, "How the day runs" below). `nextFree`, which feeds the count line and the walk-in's chair, is a
  wrapper with its old answer when nothing is blocked. A day not on screen is
  read eight days at a time (`ctx.rangeCards`, kept 60 s). After a clash 409
  the board reloads (`ctx.reload`) and the free times read the book again; a
  blocked 409 offers Anyway instead. The live refresh tells an open block which
  days changed and redraws keeping the focus. The block is hidden while Here now
  is ticked and for anyone without `schedule.edit`. A redraw keeps every chip
  that is still wanted, so a tap is not lost when a field's change fires on the
  press. Hooks are `data-bk-slots*`, `data-vp-slots*` and `data-ft-*`; classes
  `.ft-*`.
- At a clinic with one dentist on its calendar (`boot.staff`), New booking
  starts with her in Dentist, unless the desk tapped a dentist's column or
  "No dentist" (`openBook`). Dentist menus name a dentist's hours ("Dr. Cariño
  · in 1:00–6:00 pm").
- **Edit in place (p25).** PATCH `/api/schedule` tells a move from an edit.
  - A new start, chair or dentist is a move: it stamps `moved_at` and audits
    `appointment.move`. A new length alone, or a new service, reason or visit
    note, is an edit: it audits `appointment.edit` and never stamps `moved_at`,
    so a length cannot place a web request.
  - The Edit form sends `catalogCode` and `reason` together. A sent reason is
    final; an empty one takes the service's name. A retired service is refused
    unless the visit already has it. "No fee-guide service" is refused while the
    reason still names one, because data.ts reads a service from the words.
    Edits are refused on a visit in DONE and on an unplaced request. A visit
    booked online keeps the patient's note.
  - Texts follow what they name. Only a new start drops waiting texts and texts
    the new time. A new dentist, or a new reason, withdraws only the reminders
    the next reminder pass writes again, through `retellTexts` in `schedule.ts`:
    keep its conditions in step with `sms_enqueue_reminders`, and it stops at
    23:45 Manila. A new reason also replaces a waiting confirmation one for one.
    Sent, held-over and claimed texts are left, and nothing extra is sent. The
    answer carries `retold`.
  - The blocked-time soft stop runs on a move and on a resize (after the edit's
    refusals and the clash rule), and both mark `blocked_ok_at`. Words and status
    never look at blocks.
  - The desk note is `patient.notes` less the import's own two lines
    (`deskNoteOf` in `import.ts`, built from the same `oldPhoneNote` /
    `birthYearNote` the import writes with). The record's
    `?open=details&dash=<visit>` opens Edit details with the caret in Notes and
    drops `open` and `dash` from the address; a save returns to the Dashboard
    with that visit open (`?booking=`, with `date=` when not today), only when it
    is the patient's visit.
  - New charge fills a senior citizen or PWD discount only from the patient's
    latest statement that is neither void nor a draft (`lastDiscountFor`), says
    which statement and asks for the card to be checked. An older one is only
    named, and a birth date of 60 or more only brings a hint. Nothing is filled
    on a refused save or for a patient found through the search, because
    `/api/patients` carries no ID numbers.
  - **The visit panel (the calendar side).** Its actions are the teal next step, Move, Edit, Open record,
    then More. Edit is quiet, for `schedule.edit` only, on a visit that is not done, cancelled or a
    no-show, not an unplaced request and not a day-only visit; its form (`[data-vp-edit]`, drawn only for
    `schedule.edit`) is the Move form's sibling — `toEdit` hides Move and calls `vpFree.hide()`, `toMove`
    hides Edit then `vpFree.update()`, and FreeTimes lives only in Move. While either form is open its Save
    is the panel's one teal button and the step goes quiet (`tealFit`). Not now redraws the panel from the
    board (`unfold`), because the live refresh never refills the panel under an open form (`formOpen`). The
    form sends only what changed: `catalogCode` and `reason` together, `minutes`, and `notes` — never for a
    web or request visit, whose note is the patient's own words, shown read-only under "From the booking".
    A new length into blocked time is warned under Minutes, and the refusal offers a quiet Save anyway
    (`data-vp-edit-anyway`); the Move form says "Now …" for a length alone.
  - **The desk note** (`deskNote`, worked out in `data.ts`, never on the client) is a `note` icon on the
    card (in `--sub`, never a status colour), one line in Today's patients, and a Desk note row after Mobile
    with Edit or Add a note (`?open=details&dash=<visit>`, for `records.edit`). `formNervous` is a blue
    pill; `consentFor` names what the tablet consent covered, and the Edit form's amber line asks for a new
    signature when the service or reason changes; "Notes" is "Visit note". A visit's "consent signed" is
    `visit_treatment_consented()` (039): the tablet's signing or an agreed general consent form. `LIVE_KEYS`
    include `catalogId`, `deskNote`, `formNervous` and `consentFor`.

## The dentist who runs the clinic (3 Oct) — the Dashboard as a dentist-owner's home

The owner: "imagine you're a dentist who also manages his own clinic, make the clinic site suitable for your
operations with ease of access and better user experience". The Dashboard is the first screen of every day.

- **Someone who treats** is a dentist or associate, **or an owner or admin with a column here** (`staff_schedule` at
  this clinic, the calendar's `data.staff`): `treats` in `index.astro`, `boot.me.treats`. Before, an owner who treats
  never had Mine · Everyone, because only `role` dentist/associate counted. A dentist's Dashboard still opens on their
  own column (`me.dentist`, `?dentist=` empty); an owner's opens on the whole clinic, and her Mine is
  `?dentist=<her id>&by=dentist` (`setWhose` and the seg's hrefs in `board.ts` follow `me.dentist`).
- **Next for you** (`[data-pt-next]`, `renderNext` in `patients.ts`, drawn with Today's patients and kept in step with
  every change the calendar takes): the patient in your chair, else your next visit today not done — the time (or the
  minutes waiting), name and age, what for, the chair, every allergy (red) and alert (amber), "Then N more with you
  today", **Open record** (the record on that visit, `?visit=`, so This visit is there) and the visit's next step (the
  row's same one press, `stepOf` / `takeStep`; the focus stays on the card). "All done for you today" when every visit
  of yours is done; away when you have none. Quiet buttons: New booking stays the screen's one teal.
- **The first screen gives way to the day**: the four numbers are a slim strip (two by two on a phone, no note or
  icon there); the tasks card only while a task is open; the website's lane only while something waits for the desk
  (`.cal-lane[data-reqs]:not([data-some]):not(:target)`, so the inbox's `#requests` still shows it). Measured at
  1440 × 900: the calendar's grid starts at 613 px (it was below the first screen).
- Checked by `scripts/dev/schedule/dash-check.mjs` (the first screen, Next for you and Open record, Mine · Everyone for
  the owner, Done on the card moving it on, a dentist, someone with no column, New → Task, `#requests`; the strip and
  the card ≥ 4.5:1 light and dark at 1440 and 390 — lowest 4.95:1 — 44 px, no sideways scroll). Reseed before it.
  `choices-check.mjs` now opens tomorrow's weekday for its reminder test when tomorrow is a closed day (a Saturday
  run), and closes it after.

## Blocked time (040) — lunch, closed days, a dentist's hours and leave, a chair out of use

The owner's first ask of the round: blocked time that both the calendar and online booking respect.
The weekly shape lives with the week — lunch is a break on `clinic_hours` (`break_from_min`/`break_to_min`),
a dentist's hours are `staff_schedule.from_min`/`to_min` (null = the clinic's hours) — and dated exceptions
live in `clinic_block` (kinds `closed`, `leave`, `chair_out`; no weekly rows, no lunch kind). A protected
emergency hold and a list of Philippine holidays are deferred for the owner; the turnover gap and holding
reminders in closed time are each clinic's own choice since 044 (below, "How the day runs").

- **One reader.** `clinic_unavailable(clinic, from, to)` turns all of it into dated ranges: the hours
  (`shut`), lunch, a treating dentist's days and hours (`hours`), and the live blocks. The desk reads it
  under RLS; the public reads `public_blocked_ranges()` and `public_busy_ranges()` (definers: times, a slug
  or a chair, a collapsed kind and whether a visit has a dentist — never a note, an author, or leave told
  apart from a day off).
- **The desk's side is `src/lib/blocks.ts`**, always inside `withClinic`: `loadBlocks` (every range but
  shut, with names and notes; throws past 400 days), `findBlock` (the first range a visit sits in, in its
  scope — the clinic, its dentist, its chair — by priority closed, shut, lunch, leave, hours, chair_out),
  `addBlock` / `removeBlock` (under the book's lock `pg_advisory_xact_lock(hashtext(clinic id))`, audit
  `schedule.block` / `schedule.unblock`), `closedIds`, `reopenNewlyClosed`, `visitsInClosedTime`,
  `keepInClosedTime`, `upcomingBlocks`, `readBlock` / `readWholeDays`, and `IN_SCOPE_SQL` /
  `VISIT_AHEAD_SQL`. A block is only added or removed: the app has insert and `update (removed_at,
  removed_by)`, and a trigger refuses the rest.
- **The soft stop.** `/api/schedule` POST, and PATCH when it moves or resizes, run `findBlock` after
  `findClash`. In closed time the answer is 409 `{ error: <one sentence>, blocked: true, kind }`;
  `anyway: true` books it and sets `appointment.blocked_ok_at` (audit `appointment.anyway`), and a move out
  clears it. A walk-in (`status: 'arrived'`) is never asked — the patient is at the desk — and is marked
  the same way. A clash always wins: a hard 409 with today's sentence and no anyway. A status-only or
  words-only PATCH never looks at blocks. GET's Range adds `blocks` and `staff[].hours`.
- **`blocked_ok_at`** means someone saw the visit in closed time and kept it there (Book, Move or Place
  anyway, a walk-in, Calls → Keep it). Null means nobody has looked, and such a visit belongs on Calls → In
  closed time. A new block clears the mark on the visits inside it. A weekly change clears it only on
  visits it newly put in closed time (`closedIds` before, `reopenNewlyClosed` after, under the lock). 040
  marked the visits already booked in the old weekly closed time as seen.
- **`/api/schedule/blocks`**: POST `{ kind, dentistId?, chair?, startsAt, endsAt, note? }` → 201 `{ block,
  inside }`; PATCH `{ id, remove: true }` → 200 `{ removed }`. It uses the schedule's gate and limit,
  `X-CSRF`, and `schedule.edit`. `inside` lists the visits already booked there with their reminder's
  state; nothing is done to them, and no text is queued or changed by a block. Reminders still go, unless
  the clinic holds them (044, below): then a block withdraws the reminders waiting for the visits it puts in
  closed time, and `inside` says "Reminder held".
- **The words are `src/lib/block-words.ts`** (pure; the calendar imports it too): `blockSentence`,
  `blockLabel(r, 'chip' | 'strip', { day })`, `blockListed`, `whyWords` (the Calls pill), `blockDone`. Whole
  Manila days are written as days; a block already under way says when it ends.
  `src/lib/reminder-state.ts` is the one wording of a visit's reminder (Calls, the Block panel).
  `src/lib/schedule-api.ts` holds the schedule API's gate, body readers and refusal (a refusal may carry
  extra fields). `isDentistHere` is in `schedule.ts`.
- **Settings.** Opening hours has lunch on each day (blank for none; both ends or neither, inside the
  day); a script-only "Same lunch every open day" copies the first lunch where it fits and names the days
  it skipped. **Closed days** (`settings/_lib/closed-days.ts`, `_ui/ClosedSection.astro`, `settings.edit`)
  lists every dated block ahead with a quiet Remove, and adds the clinic closed or a dentist away for whole
  Manila days (its own teal Add closed days; posts `form=closed-add` / `closed-remove`, mapped to `closed`
  in `SECTION_OF`). A person's page has their hours on their days here, for people who treat. Every weekly
  save (hours, a person's days) takes the book's lock, reads `closedIds` before, writes, and runs
  `reopenNewlyClosed`; the note after it counts only the visits it newly put in closed time and links to
  Calls. Nothing is texted, held, moved or cancelled.
- **The Dashboard** hatches blocked time like closed hours, with its words on a solid slate chip, and the
  hatch takes no clicks. Lunch and a closure show in every column; a chair out of use in its chair's
  column; a dentist's time away or not in in their column, or on a week filtered to them. A phone's list
  reads each as a line among the cards. The **Blocked** strip lists the dated blocks on screen as pills
  that open `cal/BlockPanel.astro` in view mode (Remove for `schedule.edit`, asking first). Its add form
  (More → Block time, + New → `?new=block`) is `schedule.edit` only and lists the visits already inside.
  New booking and Move say before saving when a time falls in blocked time ("Saving asks you to
  confirm."); the 409 offers a quiet Book / Move / Place anyway; a drag into blocked time goes back with
  Move anyway in its toast. The count line says "lunch 12–1 pm" and "closed all day".
- **Calls → In closed time** (`#closed-time`, first when not empty): each visit ahead in closed time that
  nobody kept, with why, its reminder in Calls' words, the number, Move (`/?date=&booking=`) and Keep it
  (`intent=keep`, `schedule.edit`, audit `appointment.keep_blocked`). The next two open days skip a day a
  closure covers whole; a kept visit on such a day stays on Still to confirm under its own day; the printed
  sheet has an In closed time table first. The inbox's "In closed time, next 2 weeks" (for
  `schedule.edit`, shown when above 0) counts the same rule over 14 days.
- **Patients.** One rule, `slotOpen()` in `src/lib/availability.ts`, decides both what a patient is
  offered (`openSlots`) and the re-check inside the booking's transaction after the clinic's lock
  (`slotStillOpen`). A slot is open when nothing clinic-wide touches it (outside the hours, lunch, a
  closure); a chair in service is free after every visit then; a named dentist is listed and neither away
  nor booked; and the listed dentists who are in and free outnumber the visits booked then with no
  dentist. A visit whose dentist is not listed here holds a chair but no listed dentist. `/api/bookings`
  never reads `anyway`: a blocked slot gets today's 409 "That slot has just gone. Pick another." A request
  (`placeRequest`) is refused on a day or part of a day a closure shuts, or, with a dentist chosen, that
  dentist is not in ("Dr. Cariño is not in on Tue 6 Oct. Pick another day, or any dentist."); its
  placeholder never lands in lunch or the dentist's time away, and "No word by" skips closed days.
- **The status pill** reads `closuresFor(l)`: the clinic's closures and lunch for 31 days, per Manila day,
  the same on a Find a clinic card and on the clinic's page ("Open now · lunch at 12 pm", "Lunch · back at 1
  pm", "Closed today · opens Mon 9 am"). With none, every string is the pre-040 one. The hours card shows
  each day's lunch and "Closed days ahead" (30 days, never a note). A dentist's days carry their hours
  ("Here Tue 1–6 pm · Thu") on the clinic page, the booking and `/dentists/<slug>`. A request's Preferred
  day says "Closed on: …" and, with a dentist chosen, "Dr. Cariño is not in on: …" (`dentistsAway`).
- Fewer online slots, on purpose: "any dentist" is offered only while a dentist who is in is free, and the
  named-dentist path now respects chairs, chairs out of use and visits with no dentist.

## How the day runs (044) — the owner's three questions, as each clinic's own choice

Clinic settings → Clinic profile → **How the day runs** (`id="work"`, `settings.edit`). Every default is what
shipped before, so nothing changes for a clinic until it chooses. The save reads the three only when the form
carries `has_work_choices` (an older tab keeps what is saved); a gap not on the list is refused.

- **Time between visits** (`clinic.turnover_min`: 0, 5, 10, 15, 20 or 30). Online booking keeps it after each
  visit on the chair count (`slotOpen`'s `turnover`; `openSlots` and `slotStillOpen` read it through the definer
  `public_clinic_turnover()`, listed clinics only, and the re-check pads its busy read by it), and so do the
  calendar's suggested times (`boot.turnover` → `freeStarts` / `freeDays`, the note says so). Dentists and blocked
  time are never padded, and `findClash` never refuses on it: the desk can still book back to back by hand.
- **Hold the reminder** (`clinic.hold_closed_reminders`, p07 §7.1). While a visit sits in closed time nobody kept
  (`appointment_reminder_held()`: the switch, `blocked_ok_at` null, a range of `clinic_unavailable()` in its
  scope), `sms_enqueue_reminders()` writes neither of its reminders, and `holdClosedReminders()` (blocks.ts)
  withdraws one already queued — after `addBlock`, after `reopenNewlyClosed`, and when the switch is turned on.
  Keep it (Calls) or a move out of closed time, and the next pass writes it. Calls (its lede, the line, the sheet)
  and the Block panel say "Reminder held" (`reminderWords`' `held`); sent texts are never touched.
- **Ask about a consent form not signed** (`clinic.consent_ask_at`: `chair` or `arrived`). At the door,
  `PATCH /api/schedule` to `arrived` or `in_lobby` asks as In the chair does (409 `{ consent: true }`, "Say why
  they are checked in without it, or have it signed while they wait."), the panel's button reads **Check in
  anyway**, and the reason is kept as `consent_override.context = 'arrived'` ("checked in"); In the chair then asks
  only about what nobody answered that day (`seatingGaps`). At the chair, as before.
- Checked by `scripts/dev/schedule/choices-check.mjs` (each choice end to end, the old-form keep, the forged gap,
  the block → withdrawn → pass → Calls → Keep it → written again round, the door in the API and from one tap, and
  the new block measured light and dark at 1440 and 390: lowest 4.55:1, targets ≥ 44 px, no sideways scroll).

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

## The clinical record (033) — Treatment record, Treatment, Notes, Prescriptions, Files, next check-up

The patient record (`patients/[patient].astro`) is **a paper chart** (2 Oct 2026). The owner first asked for "one
seamless page, where all details are shown, and a plus sign appears next to editable or addable", then, on seeing it:
"its still too complicated, imagine that the patient records is a paper record, simple, uneventful but effective".
Built from standard dental practice and the PDA's patient record — the real SwiftCare admin record the owner linked
was **not** opened, twice (another clinic's patient data behind its login; on 2 Oct the owner sent
`/admin/patients/<id>?tab=workspace` again and was asked to describe it, or send screenshots with the patient's
details covered, instead).

- **The paper record (3 Oct 2026) — this is the record now; the bullets after it are its history.** The owner sent a
  Philippine clinic's real three-page paper record and asked: "make the patient records as simple as this, better a
  digital copy of the real form", then "make it a better but still simple like that". The photos showed a real minor
  patient's details: they were used for the form's layout only and nothing from them is in the repository (as with the
  SwiftCare admin screenshot: do not save or share them). The record is one page of **three paper sheets**, then the rest
  folded:
  - **Page 1** (`article.pp-sheet.pp-page`): `_record/Letterhead.astro` — THIS clinic's own name, address, phone and
    email from its row (never another clinic's branding, no logo), Chart # (`chart_no`, opens Edit details) and Date (the
    day the chart was opened); the **Patient's chart** (Odontogram with `codes`: each finding's paper code drawn on its
    tooth by CSS from the attributes `paint()` already sets, and the paper's legend "C – Caries · Ex – Extraction · …"
    under the arches; and `primary`: the baby teeth as a small arch of their own, below); the **Patient information record**: Basic information in the paper's order (Patient name |
    Occupation; Date of birth | Age | Gender | Contact number | Email address; Address | Parent's or guardian's name; a
    six-column `.pf-grid`), HMO · Emergency contact · Desk note in a second grid, **Dental history** and **Medical
    history** (`_record/PaperHistory.astro`, `paper-history.css`), then blood pressure. Edit details gains Occupation and
    Parent or guardian (name, relation, mobile) behind `has_paper_fields` (`readPersonForm` / `updateDetails` in
    import.ts; Add patient never sends the flag).
  - **Page 2: Informed consent** — the privacy notice first (one ruled line once on record: DeskConsent's opt-in `line`;
    the desk's form otherwise, unchanged), the clinic's paper forms on file, then the paper's **ten paragraphs in its
    order** (`PARAS` in ConsentForms.astro, a UI-only map — never in consent-library.ts; `_record/ConsentRow.astro` per
    form: the signature slip or "Signed on paper", state, date — a paper signing's own date —, signed by, "Explained by
    Dr …", withdrawals and overrides in full). Changes in treatment plan, Radiograph and Drugs and medications point to
    their point in the general consent ("No form of its own. See …") — a reference, never a claim that it covers them.
    Then the general consent (its words folded, printed in full) and the paper's foot: Patient's signature (parent or
    guardian if a minor) · **Dentist who explained** (never called a signature: no dentist's signature is stored) · Date —
    the newest agreement still standing (a withdrawn or refused one is not shown as standing). No consent word changed.
  - **Page 3: Treatment record** — Date · Procedure (teeth first, "36 MO · Composite filling") · **Wire** · Next visit ·
    Dentist · Amount · Balance · **Sign** with `finance.bill`, and Date · Procedure · Wire · Next visit · Dentist · Sign
    without it (no money row is read then). Wire is `plan_adjustment.wire` (045; "Adjustment done" has the field, ≤ 60
    characters, shown in the adjustments list, the visit panel and the ledger). Sign is who entered the line
    (`procedure_done.created_by`, `plan_adjustment.done_by`, `invoice.created_by` and `payment.received_by` inside
    `loadLedgerMoney`, so behind finance.bill), blank for imported and unknown rows, and on a signed consent row the
    signer's own small signature. The printed record's foot says what Sign means (print only: no explaining lines on
    screen). The balance rule is `patient_balance()`'s, untouched. Screen and A4 paper share `buildLedger`.
  - **Attached to this record** (`_record/Attached.astro`): Treatment (plan, done, lab cases, LOAs, payment plans),
    Clinical notes, Prescriptions and letters, X-rays and files, Appointments (with the next check-up), Account
    (finance.bill), Texts — each a closed `details.pp-att` with one status line ("2 on the plan", "₱1,200 owed"). Every id,
    hash, opener and post landing still works: the server draws a sheet open when the page lands there or a panel in it
    is drawn open (`PART_OF` / `partOf`); `show()` opens a region's fold; a capturing `ws:panel-open` listener and a
    post-load net open the sheet around any panel opened from outside it — **a dialog inside a closed `<details>` is drawn
    0×0 while still making the page inert** (measured), so a new part must be in `PART_OF`.
  - **The head** keeps ‹ Patients, the actions (New booking the one teal, Edit details, **Print the record**, More), the
    safety chips and the contents grouped Page 1 · Page 2 · Page 3 · Attached. The facts line and the four numbers are
    gone (the paper says each fact once). Pages are numbered ("Page 1 of 3"), not the parts. Headings: h2 per sheet,
    h3 per section, h4 for the cards inside (Pane and Head take `level` 4).
  - **Print the record** prints the three sheets like the paper: black on white whatever the screen theme, no shell,
    pluses, contents, strip or attached sheets, each sheet on its own A4 page with "<name> · Chart # <no> · Page N" at
    its foot (no "of 3": a very long history can still spill onto a second sheet), ticks drawn in ink (they print without
    background graphics). Audited `record.print` by a beacon on beforeprint, at most once a minute.
- **On paper (4 Oct 2026).** The owner: "make the patient record panel look like it's a paper record instead of the normal
  template design". Every `.pp-sheet` (the three pages and the attached sheets) is a sheet of paper on the desk, screen
  only (`@media screen` in record.css, "The record on paper"; print is unchanged): warm off-white `--pp-paper` with a grain
  too faint to cost a word its contrast (2.5% at most), square-cut with a paper's shadow, the letterhead's name in a printed
  serif from the device's own fonts (`--pp-serif`, nothing fetched) over a double rule, each section's title (`.pp-head`)
  in a shaded band `--pp-band` between ink rules (a block inside a section, `.pp-head-sub`, is not banded), the boxes ruled
  in `--ws-hair-strong`, and what was filled in (`.pf-v`, the ledger's cells, the history's ticks) in blue pen ink
  `--pp-pen`; "Not on file" stays printed ink-2 and an allergy red. **The same paper in both themes**: the sheet carries the
  light values of every colour token, so it is drawn and measured as in light mode, and global.css's dark blocks also
  name `.pp-sheet :is(.ws-panel, [popover])`, so a side panel or the chart's palette opened inside a sheet is in the
  person's theme (measured). The head above the sheets (‹ Patients, the actions, the contents) stays the workspace.
  paper-check passes unchanged (lowest 4.68:1, light and dark: the sheet's words are the light ones in both).
- **The dental and medical history (3 Oct)** — `src/lib/paper-history.ts` (pure): the paper's 12 problems and 23
  conditions in its order and words, stored under the words the record already uses (High blood pressure →
  "Hypertension"; aliases are only real re-spellings, never a narrower or wider word), and everything else the paper asks
  in `medical_history.answers.paper` (`{v:'paper-2026-10', …}`: former dentist's name, location and number; last dental
  care and last X-ray as partial dates; flossing and brushing; problems; physician's name, location and last visit; a
  blood transfusion and when; pregnant, nursing, birth control pills; other serious illnesses or operations). No
  migration; every save is still an insert; a form without `has_paper` keeps what is saved; lists compare by meaning, so
  a re-spelling is not a change. `showsPregnancy()` is the one rule for where the pregnancy questions appear (asked, or
  an answer on file), and the form never pre-ticks Yes over a patient's newer No. After a save conflict the paper fields
  are rebased (`rebasePaper`): only this person's own changes are kept. A box with no desk answer shows the patient's
  own words and where they came from ("From the patient forms (QR-…)" or "From the forms the patient filled in (IN-…)").
  The QR forms' and the intake's questions are unchanged. Unit tests: `node --experimental-strip-types --no-warnings
  --import ./scripts/ts-register.mjs --test src/lib/paper-history.test.ts`.
- **The chart's codes (045)** — tooth_state gains extraction (Ex), root_fragment (RF), abutment (Ab), pontic (P),
  denture (Rm) and the surface restorations amalgam (Am) and inlay (I), in every list that names conditions (demo.ts
  `CONDITION_LABEL` / `CONDITION_CODE` / `SURFACE_SCOPED`, api/chart.ts, the palette in the paper legend's order, the
  swatch, global.css). Crown is J and bridge Fx, as on paper; our extras are F (filled), RCT (root canal), Impl (implant)
  and V (veneer) — for a dentist to confirm (review pack, "The chart's codes").
- **The baby teeth (A–T) on the chart (3 Oct)** — Odontogram's `primary` draws them as a small arch of their own: 55–51 |
  61–65 over 85–81 | 71–75, labelled in the notation in use (FDI; Universal A–J across the upper arch from the patient's
  right and K–T back across the lower, 55 = A, 65 = J, 75 = K, 85 = T; Palmer A–E in each quadrant, "URA"). Beside the
  permanent arches where the card holds all 26 teeth at 32 px or more (`@container pt-chart (width >= 62rem)`: 1366,
  33–36 px teeth, the chart note under both); from a 68rem chart (1440 and up) under the permanent arch at 44 px, so the
  chart note and its mouth map stay on the right beside the teeth, as an adult's (the owner, 4 Oct: "in the baby teeth,
  put the chart on the right side so it's visible"); under them otherwise (30 px teeth at 390, the arch whole); printed
  beside them on page 1 (22 px teeth, codes at 7 pt so Impl and RCT clear a neighbour, the arch's name left on screen;
  page 1 still one A4 sheet, 1009 px with a full history). Open for a patient under 13 by the birth date (`primaryOpen`,
  `babyOpen` in the record) or when a baby tooth has a finding or work (the component reads its own marks); otherwise
  behind one quiet **Baby teeth** pill beside the notation (a real button, 44 px, `aria-expanded`, `data-odo-baby-toggle`;
  open, the chosen thing's tint); hidden, the arch prints hidden too. A baby tooth is charted exactly like a permanent
  one (palette, surfaces, codes, legend, chart note, work marks, offline), saved by `POST /api/chart`, whose tooth set is
  the 52 (`isOnChart` in chart-offer.ts is the same set; `tooth_state.fdi` always allowed 11..85, no migration). The
  script changed only where it had to: `pips()` maps quadrant q to ((q − 1) % 4) + 1, and the arrow keys walk the teeth
  as laid out (`stepFrom`: Right and Left along each line and on to the next, Up and Down to the next line's nearest
  tooth; with the baby arch hidden exactly the old ±16 step); the toggle is its own handler. The record's scroll-sync
  pairs the rows within a set (`data-odo-set`). Measured: the arch's name, numbers, midline, codes and the toggle ≥ 4.5:1
  light and dark at 1440 and 390 (lowest 4.97:1 light, 6.58:1 dark), no sideways scroll from 1920 to 360.
- **The chart's pictures (4 Oct)** — the owner: "in the teeth chart, integrate a picture image of the teeth (or whole mouth
  image) for easy identification". Each tooth's box has its **side view** drawn beside it on the outside of the arch
  (`.odo-pic`, roots away from the midline), and the **whole mouth from above** ("Where it is") heads the chart note.
  - **Drawn here, never an image**: `src/lib/tooth-drawing.ts` (pure) hand-draws the 26 kinds (16 permanent, 10 baby) once,
    crown up with the mesial side on the right, as path data in one hidden `<defs>` that every tooth `<use>`s;
    `flipFor(fdi)` turns a picture for its quadrant (upper crown down, the patient's left mirrored, so the mesial side
    always faces the midline) and `tiltFor(fdi)` leans an impacted one toward the midline; `MOUTH` is the map, worked out
    once (both arches as a chart reads them — the patient's right on the left, the upper arch on top — each tooth at an
    average crown's size, the baby arch inside). `src/lib/tooth-name.ts`: "lower left first molar", "upper right first baby
    molar" (`toothName`, `toothTitle`), in each tooth's label, the palette's title ("Tooth 36 · Lower left first molar") and
    the map's line. Unit tests: `src/lib/tooth-name.test.ts` (all 52 names, the turns, the map's places).
  - **What a picture shows is read by CSS from the box's own attributes** (`.odo-col:has(> .tooth[data-state=…])`, the
    component's `<style is:global>`): `paint()` and the stored data are untouched. A whole-tooth finding fills the crown in
    the box's colour; missing, unerupted and impacted are dashed; extraction is crossed; a root fragment is the roots only,
    hatched; a root canal a line down each root; an implant a threaded post; a pontic and a denture tooth have no root. A
    surface finding leaves the picture alone (the pips say which surface). A click on a picture opens the tooth as its box
    does (the button stays the only control).
  - **The map is a picture only** (`aria-hidden` as a whole, nothing in it a control: its shapes were 10–17 px). It lights the
    tooth pointed at or focused, whichever the person did last, and the open one, and its line names it in the notation in
    use; the findings show faintly. Where the note runs under the arches (below a 68rem chart)
    the map is a compact 192 px picture beside the note (patients.css, `[data-odo-note]`, from a 28rem chart; small over it
    on a phone); there it is too far below the upper teeth to follow the pointer, so patients.css hides its line and the
    map follows the open tooth only (the script reads the line's display). Beside the arches it heads the 272 px column and
    follows the pointer and the keyboard. The **palette** has the same map, small (88 px), the open tooth lit, so wherever a
    tooth is opened its place in the mouth is in view. The pictures print small (18 px, a hairline); page 1 still fits one
    A4 sheet. A dentist reads the drawings' simplifications in the review pack ("The chart's pictures").
- Checked by `scripts/dev/record/paper-check.mjs` (rewritten for the three sheets and the attached sheets: order, the
  letterhead names this clinic, basic information in the paper's order, Edit details saves occupation and guardian and an
  older form keeps them, sheets closed on a plain load and opened by their hashes, a history box puts the caret in view,
  the print shows only the three sheets; contrast ≥ 4.5:1 light and dark at 1440 and 390 with every sheet opened —
  lowest 4.68:1 light, 5.59:1 dark —, 44 px, no sideways scroll), phone-e2e (all paths), the history unit tests and the
  QR forms backend test. A 63-agent review (five angles, two skeptics per finding) confirmed 23 defects; all fixed and
  re-checked.
- *(History, 2 Oct: the twelve numbered parts on one sheet, below. The ids and openers they name all still exist.)*
- **One sheet** (`<article class="pp-sheet">`, 64rem, the card colour in both themes) under the head (`.pp-top`, the
  same width): the name line, the allergy and safety chips, and one line of facts (Next visit · Last visit · Balance ·
  Consent: `.pp-facts`, no number tiles). Then **Contents** (`RecordNav.astro`: numbered links `#rec-<id>`,
  `data-rec-link`, nothing sticky), today's visit as a note set apart (`.vs`), and the **twelve parts in the paper
  chart's order, numbered**: 1 Patient information · 2 Medical history · 3 Dental chart · 4 Treatment · 5 Treatment
  record · 6 Clinical notes · 7 Consent · 8 Prescriptions and letters · 9 X-rays and files · 10 Appointments · 11
  Account (with `finance.bill`'s money view) · 12 Texts. Ids stay (`rec-overview`, `rec-health`, …). Each part is a
  `role="region"` under `Banner.astro`: its number and name over a rule (`.pp-head`, `h2#rec-<id>-title`), its adds
  on the right. **No colour groups, no icons, no explanations**: the hue banners, the group colours (`sections.ts`,
  deleted), the cards' icon tiles and the lines saying what a part is for are gone (the record's colour-coding of
  27 Sep is reversed by this request); the parts' cards are flattened into the sheet in record.css ("The record as a
  paper chart"), pills read as plain words, and only what must stand out keeps colour (an allergy in red, a warning
  in amber, money owed). A card titled as its part keeps its title for a screen reader only.
- **Lines, not tiles.** Patient information is label-and-value lines (`.pp-lines` / `.pp-line`, two to a row from
  640 px), the desk note, the next check-up and the patient forms' answers. The medical history is lines too (birth
  date, allergies, conditions, medicines, the note for the dentist, who updated it); its form is folded under
  **Change the medical history** (`<details data-pp-edit>`, open after a post that needs it). Health in short,
  Recent visits and Treatment in short are gone: the parts follow on the same sheet.
- **The plus** (`_record/Plus.astro`: a soft teal ring, round 44 px beside a value, or a quiet pill with words —
  "Add" on an empty line) is beside everything that can be added or changed, for someone who may: each detail (Edit
  details opens with the caret in that field, `data-rec-field`; the birth date goes to the medical history), each
  medical-history line (its form unfolds with the caret in that list's box; the record's `show()` opens a closed
  `<details>` around its target), and every part's add in its card's heading (Add to plan, Record a treatment, New
  lab case, New note, New prescription, Add files, Take a reading, Ask for an LOA, New plan, Pick a day, New charge,
  Book a visit). New booking is the page's one teal button in view.
- **Compact, like a printed record** (the owner, 2 Oct: "make it less space consuming and more organized, like a
  real dental record"). Patient information and the medical history are **boxed form cells** (`_record/FormCell.astro`,
  `.pf-grid`: four to a row, two on a phone; a small label over the value; Full name, Address, HMO, Emergency
  contact, the desk note and each health list take two). A box that can be changed is its own 44 px button
  (`.pf-go`, the whole box) with a small plus in its corner: Edit details with the caret in that field, or the
  medical history's folded form. A card with nothing in it is one line (its name, the words, its plus: the
  `:has(> .ws-empty)` rule in record.css); the next check-up is one line with its choices; the chart's findings are
  one line ("Findings 47 D Caries · 11 Veneer …") instead of tiles; the sheet is 72rem with tighter type, rows,
  tables and callouts. Measured on one patient: 9082 → 6800 px tall at 1440, 13145 → 11606 at 390.
- **Simpler and closer** (the owner, 2 Oct: "make the UI/HUD simpler and less spacious … in the patient records"). No line
  that explains the page (the chart's "saved as you make it" and how-to, the Treatment record's balance note — the
  mismatch and the 300 cap still show —, Signed at visits', the patient forms', the letters', the desk hint under
  privacy consent on the sheet only), and no count lines ("1 on record", "0 about this patient"). Each part's buttons are
  in its heading: Print on the Treatment record, In Finances and New charge on Account, All messages on Texts, and the
  letters' three kinds as pluses (Certificate · Referral · Clearance, `data-letter-kind`). The head is one row (‹
  Patients · chart no. and facts · the actions; no avatar), the facts inline; the contents use short names
  (`SECTIONS[].short`, the full name for a screen reader) on one line from 1366 px and one sideways-scrolling row on a
  phone (its links are `position: relative`, or their sr-only words widen the page); This visit's done line and extras
  share a row; the medical history's updated line, Change and Earlier versions share a row; the Findings line is gone
  (the chart note lists them). Account is one line. The "every look is logged" line is the sheet's foot. Measured on the
  same data: 6005 → 4630 px at 1440, 10119 → 8392 at 390; paper-check passes (lowest 4.75:1 light, 5.59:1 dark), and
  counts the teal button in the first screen only.
- The script is small: measure the workspace bar into `--rec-top` (`scroll-margin-top`), a contents link scrolls its
  part under the bar and puts its name in the address, an address with a part's name or any id opens there, and
  with none the server's choice (`data-rec-start`, the part a post came from).
- Checked by `scripts/dev/record/paper-check.mjs` (the parts in order and numbered, none hidden, no banners, icon
  tiles or number tiles, a plus on every changeable detail, the contents land under the bar, `#consent`, the pluses
  do what they say, none for someone without editing; every line on the sheet ≥ 4.5:1 — lowest 4.75:1 light, 6.27:1
  dark — 44 px, no sideways scroll at 1440 and 390). A fix found on the way: Consent's buttons sat in a `<p>` that
  held `<form>`s, which a browser closes, so they fell one under another; it is a `<div>`.

`src/lib/record.ts` is the whole back end (`loadClinical`, `loadChartChanges`,
`recordAction`, `readRecordFile`); the sections are `patients/_record/*.astro` + `record.css`.

- **Every write is one post** with an `intent` in `RECORD_INTENTS`, checked by `canEditRecords` in the same
  transaction, audited `record.*`. A refused post is thrown out of the transaction (`Refused` in the page),
  so nothing half-done stays, and comes back in its side panel with what was typed (`PANEL_OF`).
- **Treatment plan items** walk planned → accepted → done (or declined); Mark done writes the
  `procedure_done` row. Prices are fee-guide estimates, not statements. Lab cases: ordered → sent →
  back → fitted, or remake.
- **A signed clinical note is never changed**: the app has select/insert only on `clinical_note` (033
  revokes the rest; the database's default privileges would otherwise grant them). A correction is an
  addendum (`amends_id`). Prescriptions and treatments done cannot be deleted by the app either.
- **Prescriptions** print at `patients/<id>/rx/<rx>/` (A5, the clinic's head, the patient, ℞, the
  prescriber's PRC and PTR). The medicine box suggests generic names only, never a dose. A prescriber needs
  a PRC licence on file.
- **Patient files** (JPEG/PNG/WebP/PDF, 25 MB, 10 at a time) are stored under
  `UPLOAD_DIR/records/<clinic id>/`, checked by their first bytes, and served **only** by
  `patients/<id>/files/<file>/` behind `requireWorkspace` + RLS (no-store; views and downloads audited).
  The public `/uploads/` route cannot reach them. Remove hides a file (`removed_at`), never deletes it.
- **Next check-up** (recall) sits on the Overview: 3/6/12 months in one tap, or a day.
- **Tooth-first entry (p01, step 1).** Add to plan, Record a treatment, the clinical note and Add files
  pick the tooth on `_ui/ToothPick.astro`: FDI tiles in the chart's order, mirrored at the midline from
  400px and stacked below it, baby teeth behind a toggle, Whole mouth or No tooth, and M O D B L toggles (I
  on an anterior). A typed box sits under the grid; the server reads it too (`pickedTooth()`): when the
  radios hold nothing the typed box wins, and a picked tooth that differs from the typed one is refused.
  Old text posts still read the same. For people with `records.edit`, the chart's palette adds "For 26 MO"
  with Add to plan, Treatment done and Clinical note — `data-pick-open`, never `data-ws-open`, so the shell
  never takes a hidden palette button as the opener of a panel it draws open. They open the panels over
  the Chart on that tooth; those panels live outside the sections (`_record/TreatmentPanels.astro`,
  `NotePanel.astro`, `pickpanel.ts`), because a dialog in a hidden section is not drawn. Treatment done lists
  that tooth's open plan items as one-tap Mark done forms, so planned work is never recorded twice. A save
  from the palette posts `back=chart`, lands on the chart with its line, and gives focus back to the tooth.
  The actions hide offline, on a kept copy, or when the tooth's server check gets no answer. The chart shows
  a ring under a tooth for open plan items and a dot for work done in the past year, with a legend and a
  work sentence in each tooth's label. A new note opens with today's treated teeth ticked; an addendum with
  none. `Odontogram.astro` changes only additively (props `actions`, `work`, `codes` and `primary`, and the pictures, which
  read the boxes' attributes); its offline logic is untouched.
- **The chart after a treatment (p01 step 2) is an offer, applied only by a tap.** What a treatment does
  to the chart is `procedure_catalog.chart_effect` (042; the seven default codes, set by a trigger when an
  insert says nothing), never guessed from a name. `chart-offer.ts` is the table, pure and shared by page
  and server. Mark done and Record a treatment land on `?treated=<procedure_done id>#chart-offer`, in the
  section the post came from, when the offer has something worth a word: "Update the chart?" with one quiet
  Update the chart (intent `chart-apply`, hidden fields only) and Leave the chart as it is; the uncovered,
  other and no-surfaces cases say why and open that tooth on the chart; nothing to change gets no callout.
  A baby tooth gets the same offer as a permanent one (`isOnChart`; the "baby" offer and its sentence are gone). Record a treatment's chart line is never ticked as drawn, and its box and hidden fields
  are disabled unless it is an `apply` offer on a tooth with nothing waiting. Every write is
  `chartFromRecord` (`src/lib/chart-write.ts`) inside the record post's transaction, in this order: the
  page's sign-in (`sid`, else `chartskip=ended`), the chart lock `'chart:' + lower-case patient id` (the
  same as `/api/chart`), then the check that the tooth still shows what the page showed (else
  `chartskip=changed`, naming who charted it and when). Applied writes the ledger row with `clinic_id`,
  `tooth_state` with `change_id` and `procedure_id`, and `chart.update`. Offline or on the kept copy, the
  button hides and one line says the update needs the connection (`ChartOffer.astro`). A dentist still reads
  the chart-effect mapping and its sentences before a clinic depends on them.
- The Treatment record (below) is the PDA's ledger, built from the visits (035); the chart's own history
  (who charted which teeth, when) is under Chart, "Changes to the chart" (`loadChartChanges`).
- **Colour-coded by group (27 Sep) — reversed on 2 Oct** by the paper chart above: the parts are numbered instead,
  and the hue classes (`.hue-*` in record.css) survive only where a component still uses one inside a card.
- **Every detail was its own pill or tile** (the owner, 27 Sep: "make each specific detail more visible … their own
  pill"): `.rp` pills, `.rk` tags and `.rf-grid` tiles are still the markup inside the cards, and still drawn so in the
  rest of the workspace; on the record's sheet they read as plain words and ruled lines (the paper chart, above).
  Long lists (treatments done, lab cases) show the newest few and a "Show N more" button (`data-fold-list`).

## The record's paperwork (034) — blood pressure, letters, HMO LOA, payment plans

`src/lib/record-extra.ts` (`loadExtra`, `extraAction`, `planState`), the same rules as 033
(canEditRecords in the transaction, audited `record.*`, a refused post comes back in its panel).
Components: `_record/Vitals`, `Letters`, `Loas`, `PayPlans`. The head shows the safety chips (BP today
or out of range, clearance needed/waiting/cleared, an LOA waiting, a plan behind), each a button to its section.

- **Blood pressure and pulse** (`vital_sign`, insert-only) top the Health section. `bpWords`
  (`record-extra-words.ts`, no Node imports, so the panel's script says it while typing) uses the bands
  dental guides commonly use: 180/110 postpone and refer; 160/100 ask for medical clearance; 140/90
  take again; under 90/60 low. The page says it is a guide, not a diagnosis.
- **Letters** (`clinical_letter`): dental certificate, referral, request for medical clearance, in
  "Rx & letters". Printed at `patients/<id>/letters/<id>/` (A5, PRC and PTR; a clearance carries the
  latest BP and a part for the physician). Insert-only, except the clearance reply columns
  (column grant). The signer needs a PRC licence on file.
- **HMO LOA** (`hmo_loa`, `treatment_plan_item.loa_id`): asked → approved (code required) or denied →
  used when every item it covers is done (record.ts plan-status). A plan item waiting for its LOA says
  so and Mark done asks first. HMOs are the branch's (`payorOptions`, kind hmo).
- **Payment plans** (`payment_plan`, `plan_adjustment`): the money is ONE statement the plan makes
  (`createStatement`), paid in Finances like any other, so no balance is counted twice. The plan adds
  the schedule and braces adjustments. Missed = scheduled payments due by today that what was paid does
  not cover (the down payment counts as one). Making or stopping one needs finance.bill; amounts show
  only with it; anyone with records.edit records an adjustment.
- `ws:panel-open` now carries `auto: true` when the server drew a panel open (a refused post): a page
  must not refill that form from the first matching opener (`src/components/ws/shell.ts`).
- **PTR (041).** `staff.ptr_number` / `ptr_year` is the PTR on file. A prescription and a letter take a copy
  (`prescription.ptr_*`, `clinical_letter.ptr_*`) inside the save's transaction and print only that copy,
  never the live value: a 2026 paper reprinted in 2027 keeps its 2026 PTR, and a paper from before 041
  prints the blank line. Never join `staff.ptr_*` into a select that also has `r.*` / `l.*`: node-pg keeps
  the last column. The year is compared with the paper's own issue day, and the panels compare with today.
  Amber means none, no year, last year's from 1 February, or a later year outside December; last year's in
  January and next year's in December are a quiet line. Nothing blocks a save; the PRC still does. The
  number is taken as the receipt prints it: trimmed, spaces collapsed, upper case; letters, digits, spaces,
  dots, slashes and dashes, with at least four digits (widen `PTR_RE` if a city's format is refused). A PTR
  may be saved for last year or this year, and next year from 1 December. Two writers: Edit details on a
  person's page (`people.manage` and `mayManage`), and My page's own PTR form (`action=ptr`, for
  `signsPapers`: the one detail a person sets for themself, audited `staff.ptr`, bumping no token). Both post
  what they were drawn with (`ptr_seen`, `ptr_year_seen`): a form that did not touch the PTR keeps what is
  on file, and one that changes a PTR changed elsewhere since is refused with what it is now. The fix links
  in the panels' notes open in a new tab, so a paper being typed is never lost. The code is
  `src/lib/ptr.ts`; the record's words are `_record/PtrWords.astro`.

## The visit panel and the signed consent (035)

The owner asked for "the full details of the patient's visit" — a visit is clickable and pops out the
doctor, the consent form, the signature (the patient signs on an iPad), the procedure, the tooth, the time
and the amount paid. (It was drawn as the Timeline's cards; the Timeline is now the Treatment record, below.)

- **A visit opens in a side panel** (`_record/VisitPanels.astro`, rendered outside the sections) from its
  date on the Treatment record, Visits' "See the whole visit" and Consent's "See the visit": the visit,
  consent and signature, treatment done, the dentist's notes, BP, Rx and letters (Print), payment
  (charged, paid, HMO share, still owed, each statement's lines, each payment), files, texts.
- **What belongs to a visit** is `loadVisits()` in `src/lib/visit-record.ts`: its `appointment_id`, else
  the Manila day (the visit that had started by then). Treatment, notes, prescriptions or a statement
  on a day with nothing booked make an "At the clinic" day of their own; BP, files, letters and payments
  only join an existing one; a payment follows its statement. The per-visit balance is
  `patient_balance()`'s rule, statement by statement. `Visit.bookedAt` (the appointment's `created_at`)
  is what the Treatment record's Next appt. reads.
- **The consent is signed by hand on the clinic's tablet** at `/c/<slug>/patients/<id>/sign/<visit>/`, its
  own page (no workspace sidebar for a patient to wander into): step 1 for the clinic (tick the plan's
  open lines the dentist explained, anything else, the dentist), "Hand the tablet to <name>", step 2 for
  the patient (the treatment, `TREATMENT_CONSENT`'s words in force, who signs — only a parent or guardian,
  with relation, when the birth date says under 18 — name, finger signature, one tick). Saved, it shows
  only "Thank you — please hand the tablet back"; the desk's button returns to the record with the visit
  open (`?visit=<id>`). Offered for a visit going ahead today or later, or one the patient is
  at now (`canSign`); never for a cancelled, missed or past visit.
- **`visit_consent` (035) is insert-only for the app** (select, insert; measured: update and delete are
  refused) and a trigger checks the visit is this patient's at this clinic and the version is a
  treatment consent. `signVisit()` in `src/lib/visit-consent.ts` re-checks everything in the transaction
  (canEditRecords, visit status, the words in force, the minor rule, the strokes), audit `consent.sign`.
- **The signature is strokes, never an image**: `[[x, y], …]` lines of whole numbers in a 1000 × 400 box
  (`readStrokes`: ≤ 80 strokes, ≤ 6000 points, enough ink to be a signature), drawn back as one SVG path
  (`_record/Signature.astro`) in dark ink on a white slip in both themes, like paper.

## The Treatment record — page 4 of the PDA dental chart

The owner: "rename the timeline to "Treatment record" and make it as such". The record's second section is
the Philippine treatment record ledger — Date · Tooth no./s · Procedure · Dentist/s · Amount charged ·
Amount paid · Balance · Next appt. — oldest first, one row per treatment, charge and payment.
`src/lib/treatment-record.ts` builds it (`buildLedger`, `loadLedgerMoney`, `loadRecallsSet`) for both
`_record/TreatmentRecord.astro` and the paper at `patients/<id>/treatment-record/` (A4 portrait, the heads
repeat, black on white; audit `record.treatment_record_print`), so the screen and the paper never differ.

- **Clinical rows come from `loadVisits()`'s placement**, so the ledger and the visit panel agree. A visit
  with nothing done is still a row (did not come, not marked yet, cancelled with something in it); a
  statement alone is not a visit. A date opens that visit's panel; "Also <time>" a second visit that day.
- **Only statements are charges** (a treatment's price is a fee-guide estimate). Every line of a counted
  statement (issued, partly paid, paid) appears exactly once: on its treatment's row when linked by
  `procedure_id` and issued that day (or on the visit's row for a one-line statement naming the visit, whose
  line then names the procedure — "Consultation"), else as a charge row on the statement's day ("done
  <day>"). Never matched by description. Discounts, the HMO or PhilHealth part and payments are rows; a
  payment dated before its statement sits on the statement's day ("paid <day>").
- **Balance is `patient_balance()`'s rule** through `sumsOf()`, on the last row of each day money moved.
  The last one must equal `patient_balance()`; if not, no balance shows, the section says so and the server
  logs the patient id (`treatment-record balance mismatch`, no name). Void statements and voided payments
  are not counted; they stay in Money. The money columns and rows need `finance.bill`, on screen and paper.
- **Next appt.** (on a day with a visit): the next appointment booked by the end of that day, else a
  check-up set that day, else a braces adjustment's next date.
- A table where the section is 54rem or wider (fits at 1440, not at 1366 with a wide system font); below
  that each day is a card with labelled lines (`@container trec`). Over 14 days, all but the last 10 fold
  behind "Show N earlier days" (the hidden attribute; `.trec tbody[hidden]` is declared, since a display
  rule on tbody beats it). An old `#timeline` link lands here and the address is rewritten to
  `#treatment-record`; `?visit=<id>` opens on the Treatment record when the visit is on it, else on Visits.
- Measured: the last balance equals `patient_balance()` for every dev patient and a crafted one (a part
  payment finished later, a senior discount, an HMO share part-paid by the HMO, a statement two days after
  its treatment, a payment dated before its statement, a void statement, a voided payment, a consultation
  charged by one line, money on account); every word ≥ 4.5:1 light and dark at 1440 and 390; no target
  under 44px; no sideways scroll at 1440 · 1366 · 1280 · 1200 · 1024 · 390; the paper fits A4 with no cell
  overflowing; a dentist without `finance.bill` sees no peso sign on screen or paper.
- Measured: every line on the cards, the panel, Consent's list and both signing steps ≥ 4.5:1 light and
  dark at 1440 and 390; no target under 44px on the signing page; no sideways scroll at 390.

## The paperless day (036) — arrival, this visit, checkout, texts after, the desk's lists

Built from `docs/clinic-operations.md` (how a dental clinic runs, from the call the day before to the archive;
the owner: "be the manager and the dentist owner, improve the experience for the clinic, the staff and the
patient"). One migration, 036; the pieces in the order of a visit:

- **Arrival.** A visit's card shows the minutes waited (`waitMinutes`, amber past `WAIT_ALERT_MIN` = 15) and
  Today's patients rows have one tap for the next step (`stepOf` in `patients.ts`: Arrived · In the chair · Done,
  through `/api/schedule` like the panel, `boot.canSchedule`). A walk-in is a tick on the booking panel ("Here
  now"): `POST /api/schedule` takes `status: 'arrived'` only as that first step, sends no confirmation text and
  runs `applyStatus` to arrived in the same transaction. The board refreshes itself every 30 s while visible
  (`refresh()` in `board.ts`: `LIVE_KEYS` decide what counts as a change; a status change flashes the card and is
  said in the `data-cal-live` region; a card gone from the range is drawn cancelled; nothing moves under a drag).
- **The visit panel's checklist** (`fillCheck` in `panels.ts`, `data.ts`'s EXTRA subselects): "Before we start"
  on a visit today — health history asked (and how long ago), blood pressure today, the consent signed for THIS
  visit, under 18, a clearance or lab case still out — and "Before they leave" on a done one: the statement (or
  Charge this visit, which pre-fills the visit), the aftercare sheet, the next visit or check-up (In 3 months · 6
  months · A year → `POST /api/recall`, the same `recall-set` as the record) or Book a visit. Every line is
  words plus its one action, never a blocked step.
- **This visit on the record** (`_record/VisitStrip.astro`, above the sections, for today's going visit:
  `?visit=` else the one under way, else the next, else the one just done). Lines for what is missing in the
  order a visit runs, pills for what is done, "All done" when nothing is. Every chairside form it opens — a
  reading, a note, a treatment (and a plan item's Mark done), a prescription, files, the health form — carries a
  hidden `visit`, read by `visitOf()` in `record.ts` (this patient's, not cancelled, else null) and written to
  `appointment_id` (036 added it to `prescription`, `vital_sign` and `attachment`), so the visit panel and the
  Treatment record place it under the visit instead of matching it by the day (`visit-record.ts` still falls back to the day for old rows).
  "No change" is `intent=health-checked` → `recheckHealth()`: a copy of the latest answers under the person who
  asked (audit `health.checked`), so "last checked" is today; a history over a year old is an amber chip on the
  head. `?open=vitals|note|rx|done|file` opens that panel as the page loads (its section shown behind it); a
  post from the strip comes back with `?visit=` kept, so the strip is still there. A signing comes back to
  `?visit=<id>` (no hash): today's visit shows the strip, a later one opens on Visits.
- **Checkout.** `finances/new/?visit=<id>` pre-fills every treatment recorded at the visit (stamped, or that day
  with no visit named) that no non-void statement charges yet, at the price the dentist wrote, the tooth in the
  words; the statement stores `appointment_id` and each line `procedure_id` (`LineIn.procedureId`,
  `ChargeIn.visitId`, checked to be the patient's own), so the panel's `unbilled` count and the visit panel's Paid
  are right and nothing is charged twice: `createStatement` takes a per-patient advisory lock (`charge:<patient>`)
  and refuses a treatment already on a non-void statement, naming it. A recorded price of 0 is left blank for the
  desk; one outside the fee guide's range is pre-filled as a line of its own, so the save is never refused on a line
  nobody typed. "Paid now" (a Payment card) records the payment in the statement's own transaction
  (`saveStatement(…, after)`: a refused payment rolls the statement back and the page says so) and lands on
  `?done=paid&p=<payment>`, where the acknowledgment prints. The booking panel's new patient is named by
  `splitName()` (the import's Filipino-name rule: particles, suffixes), not split on the first space.
- **Recall that acts.** `applyStatus('completed')` closes the open recall due within 60 days of the visit. Clinic
  settings → Clinic profile has two switches, `clinic.remind_48h` (a second reminder two days before; on by
  default) and `clinic.recall_texts` (off by default): `sms_enqueue_reminders()` now writes both passes
  (`remind48:<id>`), and `sms_enqueue_recalls()` (definer, called by the worker every pass, acting only Tuesday
  and Wednesday 9–11 am Manila) texts one open recall due within 14 days or up to 60 days overdue, no future
  visit, a `09` mobile, at most once in 60 days (`recall.last_sent_at`, shown on the Next check-up card). Texts
  of kind `recall` and `aftercare` wait through quiet hours like reminders.
- **Aftercare** (`src/lib/aftercare.ts`, no Node imports; a dentist reads the words before a clinic ships them).
  Nine sheets (extraction, surgical extraction, root canal, filling, cleaning, crown, denture, braces adjustment,
  whitening), English and Filipino, printed at `patients/<id>/aftercare/<kind>/` (A5, `?lang=en|fil|both`, audit
  `record.aftercare_print`); `kindForCatalog(code, name, category)` finds the sheet from the fee guide's code,
  else the words, else an ortho category. On Done, `queueAftercare` in `schedule.ts` texts the check-in
  (`aftercareText`, GSM-safe, no link, "call <clinic number>") `AFTERCARE[kind].hours` later (`queueText`'s
  `sendAfter` → `next_attempt_at`), once per visit (`aftercare:<id>`), only with a Philippine mobile on file.
- **The desk's lists.** `/c/<slug>/calls/` (Dashboard → Today's patients → Calls): tomorrow's and the next open
  day's `booked` visits grouped by mobile, the reminder's state, Confirmed / Left message / No answer / Will call
  back (`appointment_contact`, 038, insert-only), no-shows and cancellations to call back, a printable sheet.
  `/c/<slug>/finances/close/` (Finances → Close the day, and the Dashboard's Collected today tile): payments
  today by method, the drawer count against the cash expected (`day_close`, 037, insert-only, many closes a day
  and the newest counts), what is still open (in the clinic, done and not charged, charged and unpaid, left
  owing, did not come), tomorrow in three numbers. `finance.bill` opens it; `finance.money` shows amounts.
  Messages → Text a patient lists anyone with a reason (on the book, seen lately, a check-up due, lab work back,
  owes) and fills a template (`src/lib/text-templates.ts`, eight, GSM-safe, no link, no reply asked). The
  Patients tab has Due for check-up and Not seen in a year, and Needs attention includes a health history older
  than a year.
- Measured: every new line ≥ 4.5:1 light and dark at 1440 and 390 against its composited background, no target
  under 44 px, no sideways scroll; the strip's done pills sit in 44 px hit boxes (`.vs-go`, as the head's chips).

## Add patient, step by step (039) — phase 1: the consent library and the data

The owner (29 Sep 2026): Add patient by QR or at the clinic, step by step — before the QR the staff tick which
consent forms the procedure needs; page 1 patient information, then the consent forms, then the profile is
made. The design is the intake spec (session scratchpad `intake-spec.md`, with the owner's four answers at its
end: procedure forms are signed only after the named dentist records "I explained this"; the profile is made
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
  of them, the general consent included, until a dentist and the owner's lawyer have read each. Filipino shows
  only where drafted and reviewed.
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
src/lib/messages.ts            queueText(), phone normalising, the text wording
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
src/lib/roles.ts, tasks.ts     the rank rules for people and roles; tasks (032). Pages: settings Roles section, /c/<slug>/tasks/
src/pages/c/[clinic]/settings/ profile + hours (lunch) + closed days + HMOs + listing, fees, team (invites), photos, privacy (DPO), billing
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
src/lib/text-templates.ts      the eight texts Messages → Text a patient fills in (GSM-safe, no link, no reply asked)
src/pages/c/[clinic]/calls/    the desk's call list: visits in closed time (Keep it), tomorrow's visits to confirm, a call log, no-shows to call back, a print sheet
src/pages/c/[clinic]/finances/close/  Close the day: payments by method, the drawer count, what is still open, tomorrow
src/pages/api/recall.ts        POST: the next check-up in one tap from the Dashboard's visit panel (recall-set)
docs/clinic-operations.md      how a dental clinic runs, front door to archive: the brief the paperless day was built from
public/samples/swiftcare/       sample clinic website (see "Sample client sites")
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
