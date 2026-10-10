# Signing in, clinic doors, roles, members and tasks

*Moved here from `CLAUDE.md` word for word on 10 Oct 2026 (plan item 1.9). `CLAUDE.md` holds the rules; this file holds the detail. Where they differ, `CLAUDE.md` wins.*

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
- `entrance-check.mjs` measured all of it; it lived in a session scratchpad and is gone (docs/HANDOFF.md).
  `node scripts/dev/glass/contrast.mjs auth/login/ <light|dark> <desk|phone> <base>` covers only the text contrast
  (4.5:1 against the pixels behind); the field and button heights, the 44 px targets, the 5.2:1 over black and white,
  and the 1366×768 and 1440×900 fit need a check written again.

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
  is refused (the 404 page is prerendered). So do `/find/<slug>/`, its booking and
  `/dentists/<slug>` (6 Oct; they answered a bare "No such clinic"), and the 404
  page's teal button is Find a clinic, the home page the quiet one.
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
  before and after (`snap.mjs`/`cmp.mjs`, from a session scratchpad, now gone; the
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
