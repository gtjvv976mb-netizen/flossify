# The clinic workspace, redesigned

The owner's brief (25 Sep 2026), in their words: *"one dashboard where all
patients can be seen, the clinic's calendar inclusive to all possible
details — schedule, the type of service, price, bookings, dentist, patient
info, time, date — then the finances in one page. Three tabs only:
dashboard, finances, and clinic settings. A user experience like no other:
seamless, easy to understand and access, decluttered. The background should
be the dental clinic itself."* Also: an **Add patient** that lets a clinic
bring in everything about a patient and their past sessions; a **dedicated
page for each person** (owner, dentists, staff); and a **master page for the
site operator**.

Studied for contrast: Molarsoft (app.molarsoft.com) — a left sidebar with
Patients / Appointments (sub-menu) / Finance (sub-menu) / Settings, and a
plain patients table (name, next visit, last visit, tags). Ours has no
sub-menus and no page a person must hunt for.

## Principles

1. **Four tabs, nothing else to learn.** Dashboard · Patients · Finances ·
   Clinic settings (three until the owner asked for Patients, 26 Sep 2026 —
   "Patients tab" below). Everything else is reached from where you already
   are: a card, a row, a search result, the + button.
2. **One screen answers the morning.** The Dashboard shows today's calendar
   and today's patients at once; a click opens detail beside it, never a new
   maze. Every patient is the Patients tab.
3. **Every detail on the card.** A booking card carries time, patient,
   service, price, dentist, status and alerts. No opening to find out.
4. **Declutter by default, depth on demand.** Show the few things that
   decide the next action; the rest is one click away in a side panel.
5. **The clinic is the backdrop.** Each tab stands in a room of the clinic
   from the home page's film: Dashboard in reception, Patients in the
   waiting area (the bench beside the front desk), Finances in the corridor,
   Clinic settings in the treatment room.
6. **Built for the front desk between patients and a dentist with gloves
   off.** Big targets (≥44px), 16px fields, one clear primary action per
   view, keyboard shortcuts for people at a desk (`/` search, `N` new).
7. **House rules hold.** (The Swiss rules first listed here — no radius, no
   shadow, uppercase only in `.meta`/`.sec-no`, Archivo — gave way to the soft
   template, below, and then on the whole site.) Motion always on (never
   `prefers-reduced-motion`). No footer and nothing fixed to the bottom of
   the screen. Truthful copy. CSRF on every post, RLS via `withClinic`,
   roles re-checked on the server.

## The shell — `src/layouts/Clinic.astro`

*(The first shell, a top bar on glass. It was rebuilt as the soft template
with the tabs in a left sidebar — see the two sections at the end; "Shell
API" describes the shell as it is now.)*

- **Background:** a fixed, full-bleed photograph of the room for the tab —
  `public/img/ws/reception-{960,1920}.webp`, `corridor-…`, `chair-…` (frames
  from the film) — softened (`blur(3px) saturate(1.05)`, scaled to hide the
  blurred edge) under a veil: light mode `rgb(246 246 242 / 0.55)`, dark
  mode `rgb(10 12 12 / 0.62)`. The photo shows around and between panes.
- **Glass panes:** content sits on frosted panes — light
  `rgb(252 252 249 / 0.88)` + `backdrop-filter: blur(16px) saturate(1.1)`,
  hairline `rgb(20 24 24 / 0.10)`; dark `rgb(20 22 22 / 0.84)`, hairline
  `rgb(242 242 239 / 0.12)`, light text. Contrast of every text style is
  measured against the brightest pixel behind it: ≥4.5:1 (≥3:1 for large).
- **Top bar (glass, sticky at the top):** left — Flossify mark and the
  clinic/branch (a switcher when the person has more than one branch);
  centre — the three tabs; right — search (`/`), **+ New** (booking,
  patient, charge), the inbox (texts that failed, patient replies, web
  requests to place — with a count), and the person menu (My page, sign
  out). Finances is shown only to people who may see money
  (owner, admin, finance access); for others the tab is absent, not
  disabled.
- **Phones (≤767px):** the brand row, then the three tabs as a full-width
  segmented control under it — still at the top. Search and + New as icons.
- The trial/plan notice becomes one quiet line in the top bar's person
  menu area, not a banner across every page.
- The development banner (`SHOW_DEMO_LOGINS=1` only) stays, as a thin line
  under the top bar.

## Dashboard — `/c/<slug>/`

Desktop: calendar (about 70%) and today's patients (about 30%) side by
side, a summary strip above both. Phone: summary → calendar (as a day list)
→ today's patients.

- **Summary strip:** Booked today · Waiting · In the chair · Done ·
  Expected today (₱, from the booked services' fee-guide prices) ·
  Collected today (finance roles only).
- **Calendar:** Day (default) or Week; by Chair or by Dentist; ‹ Today ›
  and a date picker; a now-line; a "Requests to place" lane for web
  requests. Drag to move (the existing `/api/schedule` rules: no clash,
  plain one-sentence refusals). **Each card:** time range, patient name and
  chart no., service, price, dentist, status chip, allergy/alert mark,
  source (web / desk / imported), and who booked it when not the patient.
- **Side panel (card or row click, stays on the Dashboard):** patient —
  age, mobile, HMO, alerts, balance (finance roles), last and next visit;
  visit — service, price, dentist, chair, notes, how and when booked;
  actions — Confirm, Arrived, In the chair, Done, No-show, Cancel, Move,
  Charge (opens Finances' new charge, pre-filled), Open record, Text
  patient.
- **Today's patients** (was the Patients panel, every patient, until the
  Patients tab took that job): only the people with a visit today, in the
  order they come — name and age, the time and what the visit is for, its
  status, mobile, alert pills, balance (finance roles) — and **See all
  patients** at its head, to the Patients tab. A dentist sees the patients of
  their own visits, with the calendar's Mine · Everyone. A row opens the
  patient beside it. No search or filters here any more: those are the tab's.
  An archived record's visit stays on the calendar but not in this list, so
  its count and the tab's Today agree; *New* and the balance read as on the
  tab (one rule, one format — "Patients tab" below).
- **Role defaults:** a dentist opens on *their* column/patients (one toggle
  to see everyone); the desk sees the whole clinic; owner/admin see the
  whole clinic and the money tiles.
- `/c/<slug>/schedule/` keeps working (it becomes the Dashboard's week/day
  calendar or redirects to it). `/c/<slug>/patients/` redirected to the
  Dashboard's patients panel until the Patients tab; now it *is* the tab, and
  the Dashboard's old `?pq=` / `?pf=` links go on to it with the same search
  and filter — unless the address was a calendar view as well (`date`,
  `view`, `by`, `dentist`, …): then it stays on that calendar, without them.

## Patients

- **Record** `/c/<slug>/patients/<id>/` (Patients tab lit, "Back to
  patients" above the header; it was the Dashboard tab before): a header of
  key facts (name, age, mobile, HMO, alerts, balance, next visit) and
  sections — Overview · Health · Chart · Visits · Money · Consent · Texts —
  reusing today's health history, desk consent, odontogram (its offline
  logic untouched), visits and statements.
- **Add patient** `/c/<slug>/patients/new/` (Patients tab lit, **Back to
  patients** on a small white card above the first): one page in clear sections —
  Person (name, birth date, sex, mobile, email, address, HMO + member no.,
  emergency contact), Health (allergies, conditions, medicines, note),
  Consent (record desk consent now, or "signed on paper on <date>"), Past
  visits (repeatable rows: date, dentist, service, teeth, notes, amount
  charged, amount paid), Opening balance. Before saving, a duplicate check
  ("This looks like Maria Santos, 0917 555 0142 — open her record?").
- **Import** `/c/<slug>/patients/import/` (Patients tab lit, **Back to
  patients** in the steps card on every step): upload CSV or Excel (.xlsx);
  downloadable templates for Patients and for Visits; columns matched
  automatically with a chance to fix; a preview with every problem in plain
  words per row; a dry-run count; then one transactional import with a
  summary and links. Re-importing the same file does not duplicate
  (matched by chart no., or mobile + name). Past visits become completed
  appointments marked *imported*; opening balances become a statement.

## Finances — `/c/<slug>/finances/`

One page: tiles (Collected today · This month · Unpaid balances · Stuck
with HMOs), then two sections switched in place — **Statements &
payments** (Today · Unpaid · All · Void, search, + New charge) and **HMO &
PhilHealth claims** (aging, file/approve/pay as today), plus CSV export.
Statement detail and print pages stay as sub-pages with the Finances tab
active. Old `/billing/` and `/claims/` URLs redirect.

## Clinic settings — `/c/<slug>/settings/`

One page with a section index that stays in view: Clinic profile & listing
· Hours · Services & fees · People · Photos · Privacy & consent · Your
Flossify plan (renamed from "Billing", which now means patient money).
**People:** owner, dentists and staff with role, mobile, PRC status; + Add
person; each person has a **dedicated page**
`/c/<slug>/settings/people/<id>/` — profile, role, contact, PRC and check
status, days at this branch, finance access, invite / reset / disable, and
their upcoming appointments.

## My page — `/c/<slug>/account/`

Every signed-in person: my details, change my password (current + new;
signs out my other sessions), my days and upcoming appointments
(dentists), my PRC status, sign out.

## The operator's master page — `/admin/`

"Flossify control", for the site operator only: tiles — clinics (total,
listed, on trial, active, past due), people, patients (a count only),
bookings today and 7 days, texts queued / failed / last sent, monthly
revenue at ₱800 per active branch and the trial pipeline; a clinics table
(name, area, owner and contact, created, listed, trial ends, plan status,
branches, last activity, bookings in 30 days) with search, filters and a
detail drawer; the PRC queue inline; billing (due, paid, online payments);
system (worker heartbeat, database, deployed version); recent sign-ups;
the operator's own audit log. **No patient-level data** — counts only.
Background: the clinic from the street.

## Shell API

What the shell gives every workspace page, and what it expects back — in the
soft, very simple template (the two sections at the end of this document).
The code is the reference: `src/layouts/Clinic.astro`, `src/components/ws/`
(each component opens with a comment and an example) and "The workspace —
the soft template" at the end of `src/styles/global.css`. (Since the whole
site went soft, its tokens live on `:root` and the rest of the site uses the
same pieces — "Site API" at the end.)

### The frame: a sidebar on the left, the page on the right

- **≥1024px — the sidebar** (244px from 1280, 220px from 1024): Flossify,
  the clinic (a card with its initials badge, name and area; a branch
  switcher when the person has more than one branch), the four tabs (icon +
  word, 48px rows, the chosen one a soft teal pill), and at the foot of the
  sidebar's own column the person (initials avatar, name, role pill), **My
  page**, the plan line (`BillingNotice`), *HMO & PhilHealth claims* for
  people without Finances, *Install on this device* (when the browser offers
  it) and **Sign out**. The sidebar is as tall as the page: its top (clinic
  and tabs) stays in view while the page scrolls, its foot sits at the end of
  the column — at the bottom of a short page, after the content of a long one.
  Nothing is fixed to the bottom of the screen. The clinic card always shows
  the area ("Baguio City"): a page may pass `clinic.area`, otherwise the
  layout reads it, so the card is the same height on every page. Sign out's
  button holds only its word (its icon is drawn by CSS): the sign-out guard in
  `src/lib/offline-queue.ts` rewrites that word with `textContent`.
- **768–1023px — an icon rail** (92px): the same items as icons with a small
  word under each (Dashboard · Patients · Finances · Settings; My page · Plan ·
  Sign out); the person is the avatar; the clinic is its badge (the branch
  switcher when there are several) and its name is also written small above
  the title at the top of the content.
- **≤767px — no sidebar on screen:** a slim top bar (menu button, the
  clinic's name, search, the inbox, **+ New**) and the tabs as a simple row
  under it (everyone has at least Dashboard and Patients now, so everyone has
  the row; with all four it carries words only — an icon beside each would cut
  "Dashboard" short at 390px). The menu button slides the same sidebar in from the left over
  a scrim; while it is open the rest of the page is inert, Tab stays inside,
  Escape / the scrim / its × close it and focus returns to the menu button.
- **The top of the content** (sticky, `[data-ws-top]`): the page's title,
  search (`/`, `/api/search`), the inbox and **+ New** — a quiet button
  (white, a hairline, a teal plus), because the one teal button on a screen is
  the page's own main action (*Text a patient*, *New charge*, *New booking*).
  From 768 to 1023px the search field takes the room the title leaves (up to
  20rem), so its placeholder is never cut. Its height is
  what a page measures (`[data-ws-top]`) to keep its own sticky parts under it
  — it is the slim bar on a phone (the tab row scrolls away under it).
- **The content column is the screen minus the sidebar** (minus 244px,
  220px, 92px or nothing). A page layout that switches at a viewport width
  (`@media (min-width: 1180px)`) now gets ~220–244px less than the viewport
  says; prefer a container query on the page's own wrapper
  (`container-type: inline-size`) or allow for the sidebar.
- The room stays behind the page — reception, the waiting area, corridor,
  treatment room —
  under a light veil (soft charcoal in dark mode, never black), with bright,
  almost opaque white cards on it.

### The layout — `<ClinicLayout …>`

| prop | |
|---|---|
| `clinic`, `title`, `staff`, `branches`, `groupId`, `finance` | as before (`groupId` feeds the plan line; `finance` = `clinic.can_view_finance` when the page has it, otherwise the layout reads it; `clinic.area` likewise — pass it when you have it, else the layout reads it for the sidebar's clinic card) |
| `section` | picks the tab: `dashboard` `today` `schedule` `messages` → **Dashboard**; `patients` (the list) `patient` (a record) `add-patient` `import` → **Patients**; `finances` `billing` `claims` → **Finances**; `settings` `people` → **Clinic settings**; `account` → no tab (My page is marked in the sidebar's foot) |
| `heading` | **new.** The title at the top of the content *is* the page's `<h1>` (on a phone it is drawn at the top of the page instead): draw no big title of your own. Without it the top shows `title` as a label only, and hides it when the page draws its own visible `<h1 class="ws-title">`, so nothing is said twice. Messages uses `heading`; a rebuilt page should too, and drop its own title card |
| `layout` | `'sheet'` (default): the page sits on one white card. `'panes'`: the page lays out its own `<Pane>`s on the room (every page does now) |
| `wide` | 1600px instead of 1280px (the Dashboard's calendar) |
| `room` | `'reception'` · `'waiting'` · `'corridor'` · `'chair'` — override the tab's room (rarely) |

Who sees which tab (the shell only decides what to show; every page still
re-checks on the server): **Dashboard** and **Patients** — everyone who may
open the branch (anyone who may open it may open its patients' records; Add
patient and Import are offered only with `staff_access.can_edit_records`, the
pages' own rule). **Finances** — `canBill(role, can_view_finance)`
from `src/lib/invoices.ts` (owner, admin, secretary, or the branch's finance
flag), the Billing pages' own rule. **Clinic settings** — owner and admin, the
settings pages' rule. People without Finances find **HMO & PhilHealth claims**
in the sidebar's foot, because claims were in everyone's menu before (the
claims page keeps amounts to finance, as it always has).

### Components — `src/components/ws/`

| component | props | notes |
|---|---|---|
| `Pane` | `title?` `icon?` `meta?` (a small line above the title) `id?` `level?` 2·3 `pad?` `'normal'`·`'tight'`·`'none'` `as?` `label?` · slot `actions` | a white rounded card (12px, hairline, a whisper of shadow; 24px padding). `icon` puts a line icon in a pale teal square beside the title. `pad="none"` for lists that run edge to edge (the head then gets a hairline) |
| `Tile` | `label` `value` `note?` `href?` `icon?` `tone?` `'default'`·`'accent'`·`'success'`·`'warn'`·`'alert'` `tint?` (`true` or `'teal'`·`'green'`·`'amber'`·`'blue'`·`'red'`) | one number on its own soft card. Put tiles in `<div class="ws-tiles">` (at most four on a screen). Tone colours the figure (and the icon's square); `tint` washes the card in a pale tint (labels turn ink-2 there, for contrast); the note says what is wrong in words. `.ws-tiles.ws-glass` from before still works (the row draws nothing itself) |
| `Chip` | `status?` (appointment.status) or `tone?` + `label?`/slot, `dot?`, `icon?` | a rounded pill on a pale tint of its colour (`status.ts` — the only status colours; import `STATUS`/`TONE` from it in client scripts). `dot` a round dot, `icon` a 14px icon |
| `Avatar` | `name` `size?` `'sm'`(28)·`'md'`(36)·`'lg'`(48) `label?` | **new.** Round, initials (first and last word, without "Dr."), on a pale tint picked from the name — the same person, the same colour. Decorative beside a written name; `label` when it stands alone |
| `Icon` | `name` `size?` (18) `label?` | **new.** Hand-written line icons, 24-unit paths, 1.75 stroke, `currentColor`: `dashboard` `wallet` `settings` `patients` `calendar` `plus` `search` `inbox` `user` `logout` `check` `alert` `info` `clock` `money` `file` `upload` `download` `chevron` `chevron-right` `chevron-left` `menu` `close` `message` `clinic` `arrow-right`. The paths live in `icons.ts`; `svgFor(name)` gives the markup for scripts that build rows in the browser. One icon per idea, the same everywhere |
| `SidePanel` | `id` `title` `meta?` `wide?` (40rem) `open?` · slot `actions` | a white rounded sheet that slides in from the right (12px from the edges; full screen ≤767px): modal `<dialog>`, Escape / scrim / × close, Tab stays inside, focus returns to the opener. Open with any `data-ws-open="<id>"` element or `ws.openPanel(id, opener)`; close with `data-ws-close` or `ws.closePanel(id)`. Fires `ws:panel-open` (`detail.opener`, before it shows — fill it here) and `ws:panel-close`. `[data-ws-title]`/`[data-ws-meta]` inside are settable. `open` = drawn open (a refused form comes back in it) |
| `Tabs` | `items` `{id,label,href?,count?}[]` `current` `label` `group?` `full?` `variant?` `'pills'`·`'underline'` | a small row of soft pills, the chosen one tinted teal with teal words (`full`: one segmented control across its container, on a pale track; when the words do not fit on one row the choices go on to a second row inside the track — a word is never cut short). `variant="underline"`: words with a teal line under the chosen one, for switching inside a card. With `href`s: links (state in the URL). Without: in-place tabs — each item id is its panel's id (`role="tabpanel"`, `aria-labelledby="<group>-<id>-tab"`, `hidden` on the others); arrows move; fires `ws:tab` (`detail.id`) |
| `Empty` | `text` `action?` `{label,href}` `icon?` (`info`) | a friendly empty state: a small icon in a pale teal circle, one line, and the next thing to do (a teal link). The words are the first `<span>` inside (`.ws-empty > span`) for a script that changes them |
| `Menu` | `id` `label?` `align?` `buttonClass?` `title?` `describedby?` `wide?` · slot `button` | a button with a short list (disclosure, not an ARIA menu): arrows/Tab walk it, Escape closes to the button, one open at a time. Items are `.ws-menu-item` links/buttons; inside one, `.ws-menu-icon` (a tinted square, `data-tint="teal|green|amber|blue|red"`) and `.ws-menu-words` (with `.ws-menu-hint` under the words); `.ws-menu-head`, `.ws-menu-sep` |
| `BillingNotice` (in `src/components/`) | `line` `slug` | the plan line: a small blue callout in the sidebar's foot (soft red when an invoice is overdue, and the words say so); on the icon rail an icon with the word "Plan" and a red dot when overdue. The layout reads it once with `planLine(groupId)` (`ws/plan.ts`) |

### CSS classes and tokens

- **Buttons.** `.ws-btn` + `.ws-btn-primary` (teal — the one main action of
  a screen), `.ws-btn-success` (green — money in: *Record payment*),
  `.ws-btn-quiet` (white with a hairline — everything else),
  `.ws-btn-danger` (white, red words). 44px, 10px corners; put an `<Icon>`
  first. The shell's own + New is quiet (`.ws-btn-quiet` with a teal plus), so
  a page's main action is the only teal button on the screen. Inside the
  workspace the site's `.btn`, `.btn-primary`, `.btn-quiet`
  look the same (no more black buttons); `.ws-btn-sm` is a 44px button with
  14.5px words. `.ws-tool` is a 44px icon button.
- **Words.** One friendly sans: Inter where the device has it, otherwise the
  system's own UI face (San Francisco, Segoe UI, Roboto) — no font is fetched
  from a third party (CLAUDE.md). Sentence case. `.ws-title` (the page's h1,
  24px semibold; 22px on a phone), `.ws-lede` (one paragraph under it).
  Inside the workspace `.meta` is a 13px medium slate label in sentence case
  (no uppercase typewriter labels; write the label as it should read) and
  `.sec-no` is quiet; `font-display` becomes the workspace face. Mono only
  for reference numbers (`font-mono`: chart no., SOA no.).
- **Surfaces.** `.ws-glass` is the card (white 94% over the room, 12px, a
  hairline, a whisper of shadow; drawn on `::before`, so `position: fixed`
  children still work — never nest cards in cards), `.ws-pane`, `.ws-sheet`.
  `.ws-callout` + `data-tone="info|warn|alert|success"`: a tinted box with an
  `<Icon>` first, in plain words (blue information, amber "needs attention",
  red "blocked", green done). `.ws-pill` + `.ws-tint-teal|green|amber|blue|red|slate`:
  a rounded label (a role, "Paid"). `.ws-avatar` (`<Avatar>`), `.ws-text-green`.
- **Switches.** `.ws-seg` / `.ws-seg-item` (pills) / `.ws-seg-full` (one
  segmented control) / `.ws-seg-line` (underline) / `.ws-seg-count` /
  `.ws-seg-label`; `.ws-count` (a red number badge; `data-zero` quiets it).
- **Lists.** `.ws-table` — columns from 1024px, a pale header row; below that
  each row stacks into a block, so a table never pushes the page sideways. Put
  `<span class="meta ws-cell-label">Who</span>` in a cell to label it when
  stacked; use `max-lg:` utilities for anything that changes with it. A table
  that must keep its columns everywhere goes in `<div class="ws-table-wrap">`,
  which scrolls sideways inside its card. A `.ws-table` wider than its card
  (from 1024px the sidebar takes 220–244px) scrolls sideways inside itself
  (`shell.ts` sets `data-ws-overflow`) and says so: a quiet line above it,
  *Scroll sideways to see every column →*, and a fade on the edge where more
  columns wait (`data-ws-more="right|left|both"`). That is a safety net, not a
  layout: a table that needs it at a common width should stack or lose
  columns there. `.ws-empty`, `.ws-chip`,
  `.ws-tiles` / `.ws-tile`.
- **Fields** in the workspace are 16px, 46px tall, 10px corners, a teal halo
  on focus (`.ws .field …`); every placeholder is muted slate (`.ws
  ::placeholder`, 4.97:1 on a white field, 7.3:1 dark — Tailwind's default,
  the text colour at 50%, was about 3:1); `.tab`, `.chip`, `.chip-radio`, `.slot-radio`,
  `.row-radio`, `.tag` and `.card` are softened there too (pills, teal tint
  when chosen). Utilities in the markup still beat all of it.
- **Tokens, both themes** (inside `.ws` at first; on `:root` for the whole
  site since "Site API", with the same values). The site's own tokens are
  drawn soft, so every utility follows with no change in the markup:
  `--c-ink` slate `#1f2937`, `--c-ink-2` `#475467`, `--c-muted` / `--c-faint`
  `#667085`, `--c-accent` teal `#0d706d`, `--c-caries` soft red `#ac3232`,
  `--c-crown` amber `#8a4604`, `--c-bg-soft`, `--c-line` hairline `#e6e9ee`
  (dark: soft charcoal `#15191e` page, `#1d232a` cards, `#2a323b` hairlines,
  the same hues lighter). The soft template's own:
  `--ws-teal|green|amber|blue|red` (a mark), `…-ink` (words), `--ws-teal-fill`
  / `--ws-green-fill` / `--ws-red-fill` (under white words), `…-tint` (pale
  backgrounds), `--ws-card`, `--ws-subtle` (an inset area inside a card),
  `--ws-field`, `--ws-field-line`, `--ws-r` (12px) `--ws-r-lg` (16px)
  `--ws-r-ctl` (10px) `--ws-r-pill`, `--ws-shadow`, `--ws-shadow-pop`,
  `--ws-font`. Kept for pages already on them: `--ws-glass`,
  `--ws-glass-strong` (menus, panels — opaque now), `--ws-hair`,
  `--ws-hair-strong`, `--ws-hover`, `--ws-scrim`, `--ws-max`.
- **The operator's top bar** (`Admin.astro`) keeps its classes —
  `.ws-top` / `.ws-top-row` / `.ws-brand` / `.ws-mark` / `.ws-branch` /
  `.ws-tabs` / `.ws-right` / `.ws-tools` / `.ws-person` / `.ws-initials` —
  restyled soft; it can move to a sidebar of its own later.

### Contracts the shell links to — the pages must answer them

Every link lives in `src/components/ws/routes.ts` (`shellLinks(slug)`,
used by the layout and by search). The shell can ship before the pages it
points at, so each rebuilt page has a flag in `LANDED` there: until it is
`true`, the link goes to the page that does that job today, and nothing a
clinic can do disappears in between. **When your page lands, set its flag
to `true`** (one line; if you do not own the file, report the change). All
five are on now: the Dashboard's flag was switched on by the shell once it
answered all three of its contracts (and `/schedule/` had become a redirect to
it, so the old + New → New booking link opened the Dashboard with no form). The
Patients tab's flag (`patients`) came on with the tab itself: before it, the
tab's link went to the Dashboard's list (`#patients`).

| URL once landed | until then | from | owner · flag |
|---|---|---|---|
| `/c/<slug>/?new=booking` | `/c/<slug>/schedule/` | + New → New booking | Dashboard: open its new-booking flow · `dashboard` (**on**) |
| `/c/<slug>/?date=YYYY-MM-DD&booking=<uuid>` | `/c/<slug>/schedule/?date=YYYY-MM-DD` | a booking in search | Dashboard: that day, that booking's side panel · `dashboard` |
| `/c/<slug>/#requests` | `/c/<slug>/#web-title` (Today's "From the website") | inbox → Web requests to place | Dashboard: the "Requests to place" lane has `id="requests"` · `dashboard` |
| `/c/<slug>/finances/` | `/c/<slug>/billing/` | the Finances tab | Finances (`/billing/` redirects there) · `finances` |
| `/c/<slug>/patients/` | `/c/<slug>/#patients` (the Dashboard's list) | the Patients tab | Patients tab · `patients` (**on**) |
| `/c/<slug>/patients/new/` | (item hidden: patients are added by booking today) | + New → Add patient; "Add a patient" under an empty search | Patients · `addPatient` |
| `/c/<slug>/account/` | (item hidden: new) | the sidebar's foot → My page | My page (`section="account"`) · `myPage` |
| `/c/<slug>/patients/<id>/` | | a patient in search | Patients (exists) |
| `/c/<slug>/billing/new/` | | + New → New charge (finance roles) | Finances (exists; keep it or redirect it) |
| `/c/<slug>/claims/` | | the sidebar's foot, for people without Finances | Finances: it must stay open to them (the list and notes, amounts kept to finance, as today), or redirect them somewhere that is |
| `/c/<slug>/settings/` | | the Clinic settings tab | Settings (exists) |
| `/c/<slug>/messages/?show=failed` · `?show=replies` | | inbox | Messages (done) |

`/c/<slug>/schedule/` keeps working after the Dashboard lands (the brief);
if it becomes a redirect, carry its query string along.

Keyboard: `/` focuses search (on a phone it opens the search row under the
bar), `N` opens + New — not while typing, not while the top bar is inert (a
phone's sidebar is open, or desk consent faces the patient), and not while
any panel is showing: an open
`<dialog>`, any visible `[role="dialog"]` / `[aria-modal="true"]` (the
Schedule's own New visit panel is one), or anything with `data-ws-busy`.
A page-owned panel should be a `<SidePanel>`, or carry one of those. Do not
bind those two keys on a page. A page that turns the screen to the patient
makes the rest inert (as desk consent does) and the shortcuts stop.

### Search — `GET /api/search?q=<text>&clinic=<slug>`

`src/pages/api/search.ts`. The shell sends `clinic` (the branch on screen);
without it, the branch the person signed in to (none for the operator: 403).
`canOpen()` first (403 JSON for a branch the person cannot open), every
query inside `withClinic()` (RLS), two characters minimum (shorter is an
empty answer, not a search), `hit()` 240 a minute per person (429 with a
sentence), `no-store`, never CORS. Answer: `{ q, patients: [{ id, name,
chartNo, mobile, href }] (≤6), bookings: [{ id, ref, patient, chartNo, when,
service, status, href }] (≤5) }`. Patients match first/last name either way
round, chart no., or the mobile's digits (0917… and +63 917… alike).
Bookings are the matched patients' coming visits, plus a ref match when the
text looks like a ref — a digit or a dash in it, or four characters — matched
from the start of the whole ref (`SE-7K`, `se7k2q`) or of its own part
(`7K2Q`), any date, newest first, never crowding out every coming visit.
Every ref at a clinic starts with the same two letters, so "se" (a name) never
lists them. Cancelled visits are left out. In the browser, Enter opens the
chosen (or first) row of the answer to what is in the field *now*: typing
forgets the rows on screen, and Enter before the answer arrives waits for it.

### The inbox

Three counts for this branch, one `withClinic()` query per page
(`src/components/ws/inbox.ts`): **texts that failed** in the last 7 days and
not sent again (sign-in codes left out: a code expires, so it is never sent
again — Messages says where a new one comes from); **replies** since this browser last opened Messages
(`fl_replies_seen`, set by Messages, path `/c/<slug>/`); **web requests to
place** (`source = 'request' and moved_at is null`, not cancelled, no-show
or completed, from yesterday on). If the counts cannot be read the inbox
shows no number and the page still renders.

### Contrast, measured

Each text colour over its surface composited on the veil over **pure black
and pure white** (both occur in the room frames in `public/img/ws/`; the
darkest blurred pixel is rgb(13 24 28), the brightest white), the worst case
reported — computed from the tokens, then sampled on the rendered pages (every
text node's colour against the layers behind it, light and dark). Card = white
94% (dark `#1d232a` 94%); side = the sidebar, 96%; bar = the top of the
content, 95% (dark 90%); pop = menus, search results and side panels (opaque).

| worst case | light card | light side | light bar | light pop | dark card | dark side | dark bar | dark pop |
|---|---|---|---|---|---|---|---|---|
| ink | 13.9 | 14.2 | 13.7 | 14.7 | 12.7 | 13.5 | 13.5 | 13.2 |
| ink-2 | 7.3 | 7.4 | 7.2 | 7.7 | 9.2 | 9.8 | 9.8 | 9.6 |
| muted (and faint) | 4.7 | 4.8 | 4.6 | 5.0 | 6.3 | 6.7 | 6.7 | 6.6 |
| teal words | 5.6 | 5.7 | 5.5 | 5.9 | 9.5 | 10.1 | 10.1 | 9.9 |
| red words (caries) | 6.1 | 6.2 | 6.0 | 6.4 | 7.3 | 7.7 | 7.8 | 7.6 |
| amber words (crown) | 6.7 | 6.9 | 6.6 | 7.1 | 8.9 | 9.5 | 9.5 | 9.3 |
| green words | 5.6 | 5.7 | 5.5 | 5.9 | 9.2 | 9.8 | 9.8 | 9.6 |
| blue words | 6.0 | 6.1 | 5.9 | 6.3 | 8.3 | 8.8 | 8.8 | 8.6 |
| amber chip (crown on crown/20) | 4.9 | 5.0 | 4.9 | 5.2 | 5.6 | 6.0 | 6.0 | 5.8 |
| red chip (caries on caries/15) | 4.8 | 4.9 | 4.8 | 5.1 | 5.4 | 5.8 | 5.8 | 5.7 |
| teal chip (accent-deep on accent/10) | 6.3 | 6.4 | 6.2 | 6.7 | 8.5 | 9.0 | 9.1 | 8.8 |

Opaque pairs: white on the teal fill 5.6, on the green fill 5.5, the red
count badge 5.2; each tint with its own words — teal 5.3, green 5.3, amber
6.6, blue 5.7, red 5.7 (dark 7.2–8.1); muted on the pale neutral chip 4.5,
so a label on a *tinted* tile is ink-2, never muted. The one title set on the
bare veil (a phone's page title, 22px semibold, `heading` pages) is 5.1 light
/ 6.3 dark at worst.

## The soft template (the owner, 26 Sep 2026) — replaces the Swiss look in the workspace

The owner compared our workspace with SwiftCare's admin patient page and
said: *"its soft, friendly and accommodating; our current template is hard,
angry and dark."* So the clinic workspace, the operator's page and the staff
sign-in move from the hard Swiss look to a **soft clinical** one. (The public
home page keeps its film; its panels may soften later.) What makes it soft:

- **Surfaces:** white cards (`#ffffff`, a hairline `#e6e9ee`) with gently
  rounded corners — 12px cards, 10px inputs and buttons, 999px pills and
  avatars — and at most a whisper of shadow
  (`0 1px 2px rgb(16 24 40 / 0.05)`). Generous padding (20–24px in cards).
  On the clinic backdrop the cards are bright, almost opaque white
  (`rgb(255 255 255 / 0.92)` + blur) — never dark glass.
- **Colour:** calm and light. Primary **teal** `#14908f` (hover `#0f7776`),
  success **green** `#1f9d63` (money in), warning **amber** `#d97706`
  (pending), info **blue** `#3b82f6`, danger a soft **red** `#dc4c4c`. Each
  has a pale tint for backgrounds and callouts (`#e8f6f5`, `#e9f7ef`,
  `#fff5e6`, `#eef4ff`, `#fdeeee`) with its own darker text. Text is
  slate, not black: `#1f2937` headings, `#475467` body, `#667085` muted.
  **No black buttons, no black tab blocks.**
- **Type:** one friendly sans (Inter, system-ui fallback) in sentence case.
  Titles 22–24px semibold, section heads 16–17px semibold, body 15px.
  **No uppercase typewriter labels** in the workspace; small labels are
  13px medium slate. Mono only for reference numbers (chart no., SOA no.).
- **Icons:** a small line icon (Lucide style, 18px, 1.75 stroke, inline SVG)
  beside every nav item, section title and primary action.
- **People:** round avatars with initials on a pale tint of a colour picked
  from the name; role and status as rounded pills.
- **Callouts:** tinted boxes with an icon — blue for information, amber
  for "needs attention", red for "blocked" — in plain words.
- **Buttons:** filled teal (or green for money-in actions) with white text
  for the one main action; white with a hairline for the rest; rounded.
- **Tabs:** soft segmented pills (the chosen one tinted teal with teal text),
  not black blocks; underline tabs inside cards.
- **Dark mode:** soft charcoal (`#15191e` page, `#1d232a` cards, `#2a323b`
  hairlines), the same tints dimmed; never pure black.
- Everything else in "Principles" holds: the tabs (four since the Patients
  tab), the clinic backdrop,
  big targets, 16px fields, motion always on, nothing fixed to the bottom,
  truthful copy, ≥4.5:1 contrast measured on the backdrop.

### Very simple, tabs on the left (the owner, 26 Sep 2026)

*"Make it more simple, very simple and easy to understand. Put the tabs on
the left instead of on top."*

- **A left sidebar** holds the tabs — Dashboard, Finances, Clinic settings,
  and since 26 Sep 2026 Patients after Dashboard — each an icon with its word, big (48px rows), the chosen one a
  soft teal pill. Above them the clinic's name (and a branch switcher only
  when there is more than one branch); at the bottom of the sidebar's own
  column (not fixed to the screen's bottom edge) the person: avatar, name,
  role, My page, Sign out. The top of the content area keeps only the page
  title, search and **+ New**.
- **Phones (≤767px):** no room for a sidebar: a slim top bar with the
  clinic name and a menu button that slides the same sidebar in from the
  left; the tabs also sit as a simple row under it. Nothing fixed to
  the bottom of the screen.
- **Tablets (768–1023px):** the sidebar narrows to icons with the word under
  each.
- **Very simple means:** one main action per screen, in teal. Fewer things
  on screen at once — at most four summary numbers; filters as one small
  row of pills; secondary controls behind "More" or in the side panel. Short,
  plain labels ("Add patient", "Record payment", "Save"). Friendly empty
  states that say what to do next. No jargon, no codes on screen unless the
  person needs them. When in doubt, leave it out.

## Patients tab — `/c/<slug>/patients/` (the owner, 26 Sep 2026)

*"Make also a 'patients' tab where the clinic can verify all their patients
and their records on the clinic, like in Molarsoft and SwiftCare."*
Molarsoft's Patients page is a plain table (name, next visit, last visit,
tags) with a search and New Patient; SwiftCare's patient pages have avatars,
status pills and a record with tabs. Ours is simpler and friendlier than
both: one card, one search, one row of filter pills with their counts, and
a row per patient that says in words what the record still lacks.

- **The tab.** Second in the sidebar — Dashboard · **Patients** · Finances ·
  Clinic settings — with the `patients` icon, for everyone who may open the
  branch (anyone who may open it may open its records). The list, a record,
  Add patient and Import all light it (`section` `patients` · `patient` ·
  `add-patient` · `import`); each of the last three has **Back to patients**,
  and it goes back to the list *as it was left* — the same search, filter
  and sort (the list keeps its address for this browser tab and branch in
  `sessionStorage`; `_list/back.ts` puts it on every `a[data-pts-back]`,
  taking only `q`, `f` and `sort`; with no storage the plain link stays). A
  secretary working through *Needs attention* opens a record, adds the birth
  date, goes back, and is where she was. The room is the **waiting area**:
  the green bench beside the front desk
  (`public/img/ws/waiting-{960,1920}.webp`, the frame at 20.2s of
  `tour-1440.mp4`, blurred and veiled like the others; no people).
- **The card's head:** the search (name either way round, mobile — 0917… and
  +63 917… alike — or chart no.; as you type, 180 ms after the last key),
  **Sort** (Last name A–Z · Last visit, most recent first · Next visit,
  soonest first), **Import** (quiet) and **+ Add patient** (teal: the one
  main action), the last two only with `can_edit_records`. On a narrow card
  (a phone, the tablet's rail) at most two rows come before the pills: the
  search, then **More** (the sort choices and Import, in one list) beside
  **+ Add patient** — on the search's row when the card has room; someone who
  may not add patients has the sort there instead. The line that says what is
  shown is for screen readers only on a phone when it would just repeat the
  All pill's count, so the first patient starts right under the pills.
- **Filter pills, with counts:** All (every record not archived) · Today (a
  visit today, not cancelled)
  · New (the first completed visit is within 30 days, or there is none yet
  and the record was added within them) · With balance
  (`patient_balance()` above zero; finance roles only — for anyone else the
  pill is absent and no balance is read) · Needs attention (the record check
  is not complete). *New* is one SQL expression, `isNewSql()` in
  `src/components/ws/cal/data.ts`, used by the tab and the Dashboard alike,
  so a patient is new on both or on neither. The owner's words were "first
  visit within 30 days or none yet"; read literally, every record imported or
  added long ago without a completed visit would stay New for ever, so "none
  yet" counts only for a record added in those 30 days. The counts are for
  the search in the field, so each pill says what it would show. One line
  under them says what is shown, and for New and Needs attention the rule,
  once.
- **A row:** round initials avatar, name (the link that opens the record; it
  stretches over the row), chart no. as a small mono pill, age and sex,
  mobile and HMO, allergy (red) and condition (amber) pills and *New*; next
  and last visit; the balance (finance roles: amber when owed, green
  "credit" when paid ahead, a quiet dash when nothing; whole pesos, the
  centavos only when there are any — "₱2,400", "₱1,075.50" — as the
  Dashboard writes it, `pesoBal` in `cal/model.ts`); and the **record
  check**: *Complete* with a check, or one short line — "Needs birth date,
  health history and consent".
- **The record check** — what the desk still has to ask for:
  **birth date** (none on file); **health history** (the newest
  `medical_history` version answers nothing — null lists and no note;
  "none known" is an answer); **consent** (no consent to the notice in
  force, `current_consent_version()`; under 18 by the birth date, none from a
  parent or guardian — the record page's own rule, `guardianStillNeeded`;
  not asked while no notice is in force); **mobile** (none on file).
- **Size.** One statement inside `withClinic()` (`_list/list.ts`): the
  searched patients, then each other table in one grouped pass joined to
  them (visits, the newest health history, consents to the notice in force,
  the latest HMO claim, and — finance roles only — who has money on file, so
  `patient_balance()` runs only for those), the counts and one page of rows
  (50, LIMIT/OFFSET) together. No query per row. 5,001 patients and 30,007
  visits: 20–70 ms a page on the dev server. **Show 50 more · N left** at
  the foot appends the next rows; `?show=` does the same without JavaScript.
- **The address is the state** (`?q=` `?f=` `?sort=`), so a reload, a link
  and Back return to the same view, and the old `/patients/?q=` links land
  on the search. With JavaScript the page asks itself for the changing part
  only (`?part=list`, `?part=rows&from=N`: no layout, `no-store`); the older
  request is aborted, the focus stays where the person is, and the count is
  said once to screen readers.
- **Phones and narrow cards** (a container query on the card, not the
  screen): from 1000px five columns; 700–999px the mobile and HMO fold under
  the name; narrower, each patient is a small card — who and what they owe on
  top, their visits, then the record check. Nothing scrolls sideways.
- **Empty states:** "No patients yet — add your first, or import your list."
  (with both links); no match ("Check the spelling, or search by mobile or
  chart no."); nobody today; nobody owes; "Every record is complete."
- **The Dashboard keeps the day:** its patients pane is now **Today's
  patients** (see Dashboard) with **See all patients**, and its old `?pq=` /
  `?pf=` links redirect here.

## The whole site, soft (the owner, 26 Sep 2026)

After seeing the redesigned workspace the owner said: *"I love what you've
done! Now implement this kind of HUD/UI design and template to the whole
site."* So **one soft design system for every page** — the public site, the
patient pages, clinic sign-up, patient accounts, the workspace, sign-in and
the operator page. The Swiss look is retired.

- **One set of tokens and pieces site-wide:** the workspace's colours, type,
  radii, hairlines, buttons (teal primary, green success, white quiet),
  pills, tinted callouts, line icons and initial avatars are the site's.
  The global component classes (`.btn`, `.btn-primary`, `.btn-quiet`,
  `.meta`, `.sec-no`, `.tag`, `.chip`, `.chip-radio`, `.slot-radio`,
  `.field`, `.pane`, `.check`, `.q`) become soft for every page: sentence
  case, rounded, no black blocks. The workspace keeps looking exactly as it
  does now.
- **Public pages keep a top bar, not a sidebar** (the film home page needs
  the full width): a soft white bar with the Flossify mark, a few plain links
  (Find a clinic, Pricing, Clinic websites), "Staff sign-in" and one teal
  **Open your clinic** button; on phones a menu button slides the same links
  in from the left, like the workspace. The patient account area (`/me/`)
  is app-like, so it uses the workspace's left-sidebar pattern (My visits,
  Find a clinic, Sign out) in the same soft style.
- **The home page keeps its film** — the owner's signature — and its scroll
  walk. Its pages become white rounded cards on the film; the opening and
  closing lines stay light on the film's scrim, with soft rounded buttons
  (teal, and white-outline quiet); section numbers become small quiet
  labels or go; services get line icons; pricing sits in a soft card with
  teal checks; partners as soft cards with initial avatars; the video tabs
  as soft pills.
- **Patient pages** (Find a clinic, clinic page, the five-step booking,
  dentist profile, coverage): soft cards, filters and slots as soft pills,
  the booking steps as a friendly numbered stepper, tinted callouts, one
  teal action per step.
- **Forms** (clinic sign-up, patient code pages, privacy): soft fields
  (16px, 10px corners, teal focus ring), sentence-case labels.
- **Unchanged:** the SwiftCare sample site in `public/samples/` (it is
  SwiftCare's own design), print pages (black on white), motion always on,
  nothing fixed to the bottom of the screen, truthful copy, measured
  contrast (≥4.5:1 on whatever is behind the text).

## Site API — the soft foundation for every page (26 Sep 2026)

What every page shares now, and how a page uses it. The code is the
reference: the top of `src/styles/global.css` (tokens, base, the site's
classes, "The film", "The public top bar"), `src/components/site/SiteHeader.astro`
and `src/components/PatientHeader.astro`. The workspace's own pieces
(`src/components/ws/`, "Shell API" above) work on any page too.

### Tokens — on `:root`, both themes

- The soft template's tokens moved from `.ws` to `:root`, with the same
  values: `--c-*` (the site's names, so `text-ink`, `text-ink-2`,
  `text-muted`, `bg-bg`, `bg-bg-soft`, `bg-surface`, `border-line`,
  `text-accent`, `text-caries`, `text-crown` are slate, teal, soft red and
  amber everywhere) and every `--ws-*` (colours, tints, fills, hairlines,
  radii, shadows, `--ws-font`). `.ws` keeps only its frame (`--ws-max`,
  `--ws-side-w`). Dark mode is the same swap as before, twice (the OS
  preference and `data-theme="dark"`): soft charcoal, never black.
- New for the public site: `--site-bar-bg` (the top bar, white 96% /
  charcoal 94%), `--site-pane` (the home page's cards on the film, 97% /
  95%), `--site-shadow-card` (their lift). Near-opaque because nothing veils
  the film there.
- The old inverted block (`--c-invert-*`, `.on-invert`) is a teal band with
  white words now, never black.
- **Utilities** (Tailwind, from the tokens): the old names above, plus
  `bg-card`, `bg-subtle`, `border-hair`, `bg-field`, `border-field-line`,
  and for each of teal · green · amber · blue · red: `bg-<c>-tint`,
  `text-<c>-ink`, `bg-<c>-fill` (teal, green, red), `bg-<c>`/`text-<c>` (the
  mark). Radii: `rounded-card` (12px), `rounded-ctl` (10px, fields and
  buttons), `rounded-pane` (16px, big cards), `rounded-full` for pills.
- **Type.** `font-display` and `font-body` are the one friendly sans (Inter
  where installed, the system UI face otherwise; nothing fetched). The body
  is 17px/1.55 on public pages (the workspace sets 15px on `body.ws`).
  `font-mono` (IBM Plex Mono, self-hosted, loaded only when used) is for
  reference numbers. Base.astro no longer preloads a web font.
- **Headings** (`h1`–`h3`, `.font-display`): semibold, -0.02em, balanced;
  `h1` line-height 1.1, the rest 1.2. The rule is in `@layer base` now (it
  was unlayered), so **a utility on a heading works** — `leading-tight`,
  `tracking-[-0.03em]`, `font-bold` — as it does on any other element. The
  workspace and the staff entrance keep their own unlayered heading rules, so
  they did not change.
- **Focus:** a 2px teal ring (`--ws-teal`), 2px out, following the control's
  corners (still unlayered: an `outline-none` does not remove it). Fields in
  `.field` show the soft teal halo instead.
- **Skip link:** Base.astro's is `.ws-skip` (a teal pill, top left, on focus).

### The public top bar — `<SiteHeader>` (`src/components/site/`)

| prop | |
|---|---|
| `current` | the page's own link, marked `aria-current` and tinted teal: an id from the links (`find` `pricing` `websites`, or `find` `coverage` `me`), or `signin` / `start` |
| `links` | `'site'` (default): Find a clinic (`/find/`) · Pricing (`/#pricing`) · Clinic websites (`/websites/`). `'patients'`: Find a clinic · PhilHealth & HMO (`/coverage/`) · My visits (`/me/`). Or your own `{ id, label, href, icon }[]` (icon: a `ws/icons.ts` name, for the drawer) |
| `cta` | `'primary'` (default): **Open your clinic** (`/start/`) is the teal button. `'quiet'`: white with a hairline, for pages whose own main action is the teal one (patient pages); on a phone a quiet one is in the drawer, not the bar |
| `wide` | 1480px (the home page's width) instead of 1280px; the bar's side padding is the pages' (`px-5 sm:px-8`), so the mark lines up with the content |
| `sticky` | sticky at the top (default `true`) |
| slot `aside` | beside the links, shown from 1180px (below that the links and the two actions need the bar) — the home page's "where you are" readout |
| default slot | inside the `<header>`, after the bar — e.g. the home page's progress line (`absolute inset-x-0 bottom-0`) |

- **From 960px:** mark · the links as soft pills · (aside) · Staff sign-in
  (`/auth/login/`, a quiet link with the user icon) · Open your clinic.
  68px tall; white 96% on blur with a hairline under it; every word ink or
  ink-2 (never muted: over a pure black film pixel muted would be 4.56).
- **Below 960px:** menu button · mark · Open your clinic (teal only). The menu
  button opens a `<dialog class="site-drawer">` from the left: the same links
  with icons as 48px rows, then Staff sign-in and Open your clinic. Modal (the
  page behind is inert, and the page does not scroll), focus starts on the
  current link, Tab and Shift+Tab stay inside, Escape / the scrim / × slide
  it out and focus goes back to the menu button (`aria-expanded` follows). A
  link to a part of the same page (`/#pricing` on the home page) closes it at
  once so the page can scroll there; growing past 960px closes it. Below
  380px the mark drops its word, so the bar fits a 360px phone.
- **Patient pages:** `<PatientHeader current="find|coverage|me" />` is
  `<SiteHeader links="patients" cta="quiet" />` plus, on the owner's machine
  only (`SHOW_DEMO_LOGINS=1`), the "Prototype…" line as an amber callout
  under the bar.
- **Staff find their workspace through Staff sign-in**, which opens each
  person's own branch. `/clinics/` (the list of every clinic's workspace
  link) is in no bar, and no page links to it now: it answers at its
  address only. **Open:** give it a way in from the sign-in card's "Other
  ways in" (e.g. "Find your clinic's workspace") or retire it with a redirect
  to `/auth/login/` — both are the pages' calls, not the bar's.
- **The home page** adopts it as `<SiteHeader wide cta="quiet">` — no
  `current` (the readout says where you are), and Open your clinic quiet
  because the opening's own "Open your clinic in the web" is the teal one —
  with its readout in `<span slot="aside">` and its progress line in the
  default slot. The bar is 68px, so `.page-hero`'s first screen is
  `100svh − 4.25rem`.
- **Who passes what** (today): `/websites/` `current="websites" cta="quiet"`,
  `/start/` `current="start" cta="quiet"`, the 404 `cta="quiet"`,
  `/clinics/` the defaults, patient pages through PatientHeader.

### The site's classes — the same names, drawn soft

Every page follows with no change in its markup. Inside the workspace these
classes keep the workspace's own variants (its block in global.css), which
did not change.

| class | now |
|---|---|
| `.btn` + `.btn-primary` / `.btn-quiet` / `.btn-success` | the workspace's buttons: 44px, 10px corners, 15px semibold. Teal fill with white words (5.6:1) for the one main action; white with a field hairline for the rest; green for money in. `.btn-lg` 52px. A trailing arrow steps forward on hover when the words are in their own element (`<span>Words</span><Icon name="arrow-right" />`) |
| `.btn-film` / `.btn-film-quiet` | on the film, both themes: the teal button with a soft lift; a white outline on a faint white wash |
| `.meta` | 13px medium slate (muted), sentence case, the page's font. `.meta-ink`, `.meta-accent` (teal). **On the film:** any `.meta` inside `.page-hero`, `.page-cta` or `.on-film` is white 86% (9:1 on the scrim) and `.meta-accent` there is the light teal `#7fdcd4`; elsewhere use `.meta-film`. No inline colour needed |
| `.sec-no` | a small pale teal pill with teal figures ("01", "2", "01 — The clinic"): the quiet section or step number. Drop it where a page does not need numbers |
| `.tag` / `.tag-accent` | a rounded fact pill on the pale neutral (ink-2) / on the teal tint (teal) |
| `.chip` (`aria-pressed`) / `.chip-urgent` | a 44px pill filter; chosen: teal tint, teal words. Urgent: a soft red dot, red tint when chosen |
| `.chip-radio` / `.slot-radio` / `.row-radio` | the hidden radio's label: 44px pills (rows: 10px cards); checked: teal tint, teal words (rows: a teal ring) |
| `.slot` | a next-open time link: 44px, 10px corners, teal tint on hover |
| `.field` | the first `.meta` is the label (14px ink-2); inputs, selects, textareas 46px at 16px, 10px corners, a field hairline, a teal halo on focus, soft red when invalid. Checkboxes and radios are left alone (use `.check`) |
| `.check` | a checkbox and its words, the whole line a 44px target, teal box |
| `.pane` | the home page's white card on the film: 16px corners, hairline, a soft lift, 97% white on blur (muted 4.66:1 over pure black) |
| `.card` / `.result` | a white card, 12px, hairline, whisper of shadow (`.result` keeps its two columns from 900px) |
| `.frame` / `.frame-bar` | a soft window for a screenshot or recording; the bar is a sentence-case 13px line on the subtle grey |
| `.q` (`<details>`) | hairline rows; the summary is 44px+ and a chevron at the right turns when it opens |
| `.tab` / `.rail-item` | soft pills / soft rows, the chosen one teal tint with teal words |
| `.rule` / `.rule-draw` | the hairline, still drawn in on entry |
| `.door` / `.idx-row` | a whole-area link with a soft wash on hover (12px), and a teal line that draws in / hairline rows that wash and indent on hover |
| `.status` + `.status-dot` | a round dot and words: open green, closing soon amber, closed slate |
| `.wiz-step` (in `.wiz` flows) | the booking stepper: each step's `.sec-no` is a 32px circle — outlined ahead, teal with white figures now, teal tint with a check when done — the word under it, a teal line under the current step |
| `table tr.is-today` | teal words and a small "Today" pill |
| `.grid-frame` | retired (no drawn grid); harmless |

The workspace's pieces work on any page now that their tokens are global:
`<Icon>`, `<Avatar>` (`.ws-avatar`), `.ws-pill` + `.ws-tint-*`,
`.ws-callout` + `data-tone` (tinted box with an icon), `.ws-btn*`,
`<Tabs>` (`.ws-seg`), `.ws-empty`, `.ws-table` / `.ws-table-wrap`,
`.ws-mark` (the Flossify mark).

### Frames and pieces the pages added

Built by the pages' own passes on the tokens and classes above; the pages
own them. Reuse one before drawing a new one.

| file | what it is | used by |
|---|---|---|
| `src/pages/me/_Door.astro` | The way in to My visits: `<PatientHeader current="me">`, one white card holding the page's form (the slot) and a "How it works" card with three numbered steps, the one you are on marked (`step={1}` the number, `{2}` the code). Side by side from 1024px, stacked below | `/me/`, `/me/code/` |
| `src/pages/me/_Shell.astro` | My visits' frame: the workspace's left sidebar (`.ws`, `.ws-side`, the `ws/shell.ts` script) for a patient — the waiting-room backdrop, My visits · Find a clinic, the signed-in number, the privacy notice and Sign out at the foot, one quiet "Book a visit" by the title. Not `Clinic.astro` (a patient has no clinic session); the workspace's sizes: the sidebar from 1024px, an icon rail at 768–1023px, a slim bar and the slide-in sidebar below | `/me/visits/` |
| `src/pages/404.astro` | Not found: `<SiteHeader cta="quiet">` and one card — Go to the home page (teal), Find a clinic — with quiet rows to My visits and Staff sign-in. Sent with the 404 status for any address with no page | unknown addresses |
| `src/pages/find/_ui/patient.css` | The patient pages' own classes, all `pt-*` (title, lede, back link, `.pt-card` on a `<Pane>`, rows, insets, facts, filters, slots, the booking's steps and summary, the bookings on this device …), in `@layer components`, only what global.css does not already draw. A plain stylesheet, because the pages' scripts write some of its classes | `/find/`, a clinic's page and booking, a dentist, `/coverage/` |
| `src/pages/find/_ui/ClinicBadge.astro` | A clinic's initials (the first letters of its first two words) in a pale teal rounded square — the sidebar's `.ws-branch-badge`, 38px; `size="lg"` 56px. Decorative beside the written name; round initials (`<Avatar>`) are for people | the patient pages, the home page's partners, `/clinics/` |

### Contrast, measured (the tokens, worst case)

Each text colour on each public surface; a translucent surface composited
over pure black and pure white, the lower reported.

| light | bar 96% | pane 97% | page | bg-soft | white | teal tint |
|---|---|---|---|---|---|---|
| ink | 13.4 | 13.7 | 13.4 | 13.3 | 14.7 | 13.2 |
| ink-2 | 7.0 | 7.2 | 7.0 | 7.0 | 7.7 | 6.9 |
| muted | 4.56 | 4.66 | 4.55 | 4.51 | 4.97 | **4.48** |
| teal words | 5.4 | 5.5 | 5.4 | 5.4 | 5.9 | 5.3 |
| red / amber / green / blue words | 5.9 / 6.5 / 5.4 / 5.8 | 6.0 / 6.7 / 5.5 / 5.9 | 5.9 / 6.5 / 5.4 / 5.8 | | | |

| dark | bar 94% | pane 95% | page | bg-soft | surface | teal tint |
|---|---|---|---|---|---|---|
| ink | 11.1 | 11.4 | 14.7 | 11.6 | 13.2 | 10.3 |
| ink-2 | 8.0 | 8.3 | 10.7 | 8.4 | 9.6 | 7.5 |
| muted | 5.5 | 5.7 | 7.3 | 5.8 | 6.6 | 5.1 |
| teal words | 8.3 | 8.5 | 11.0 | 8.7 | 9.9 | 7.7 |

White on the teal fill 5.6; the film captions (white 86%) 9.0 and the light
teal 7.2 on the scrim's 82% over white. **Muted on a tint fails (4.48):** on a
tinted surface use ink-2 or the tint's own ink (the slot does this on hover).
Rendered pages were sampled too — every text node against the layers behind
it, light and dark: `/`, `/find/`, a clinic page, its booking, a dentist,
`/coverage/`, `/websites/`, `/clinics/`, `/privacy/`, `/start/`, `/me/`,
`/me/code/`, `/offline/` — none below 4.5:1 (3:1 for large text).

### The workspace did not change

Checked by the computed style of every element (colour, background, borders,
radius, shadow, font, spacing, size) on the Dashboard, Patients, a record,
Add patient, Finances, New charge, Settings, Messages, My page, the
operator's overview, clinics and PRC pages and the sign-in pages, light and
dark, at 1440 and 390, before and after: identical, apart from the
visually-hidden skip link on sign-in and a time-dependent "Joined … ago".
