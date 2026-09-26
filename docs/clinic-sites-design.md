# Clinic sites, member logins, custom roles and tasks — design

26 Sep 2026. The owner's request (HANDOFF.md, "In progress 2"), in short: every
clinic on Flossify gets its own generic site; the owner makes a username and
password for each member of the clinic; owner and staff sign in on that site;
the owner names roles as he likes, ranks them, decides what each role may see
and do, and assigns tasks to members. This is separate from the custom clinic
websites service (`/websites/`, a different address per clinic).

The defaults below were announced to the owner and stand unless he redirects.

## What is there today (mapped, read-only)

- **Sign-in** is one door, `/auth/login/`, by email + password
  (`authenticate()` in `src/lib/auth.ts`). The session is a signed cookie with
  staff id, group, branch, name, `role` and the token version; `canOpen()`
  re-reads branch access on every workspace request (`requireWorkspace`).
- **Staff** rows are per group (not under RLS), `unique (group_id, email)`, and
  the app keeps email and mobile unique across the service. Invitations and
  resets are six-digit codes texted to `staff.phone`.
- **Roles** are a fixed enum in `staff.role`: owner, admin, dentist, associate,
  secretary, assistant. Per branch, `staff_access` adds `can_view_finance`,
  `can_edit_records` (true for everyone) and `can_manage_staff` (unused by
  pages). The checks are spread over ~20 files:

  | What | Rule today | Where |
  |---|---|---|
  | Finances tab, statements, payments, claims list | owner, admin, secretary, or finance at this branch | `canBill()` in `lib/invoices.ts`; Clinic.astro and every finances/claims/patients page |
  | See amounts (balances, takings, claim amounts) | owner, admin, or finance at this branch | `canMoneyOf()` in `finances/_claims.ts`; `can_view_finance` |
  | Void a statement | owner, admin | `canVoid()` |
  | Add / edit patients, health, consent, patient forms, import | `can_edit_records` (everyone) | health.ts, patient-forms.ts, patients pages, cal/ |
  | Schedule and chart | anyone who may open the branch | `api/schedule`, `api/chart` |
  | Clinic settings (profile, hours, fees, photos, privacy) | owner, admin | `canSetUp` in settings, Clinic.astro |
  | People: add, edit, disable | owner, admin; only an owner touches an owner; only an owner gives finance | `settings/_lib/people.ts`, `people/[id].astro` |
  | Messages page extras | owner, admin | `messages/index.astro` |
  | Flossify plan, pay an invoice | owner, admin | `api/payments/checkout.ts`, plan line |
  | "Treats patients" (schedule column, dentist dashboard) | owner, dentist, associate | `treats()`, `clinician()`, `api/schedule` |

- **Routing**: pages live under fixed first segments (`/find/`, `/start/`,
  `/me/`, `/c/`, `/auth/`, `/admin/`, `/f/` …); nothing is served at
  `/<anything>/`. `uniqueClinicSlug()` makes a clinic's slug at `/start/`.

## Decisions

1. **Each clinic's site is `flossify.ph/<clinic-slug>/`** — a path, so no DNS
   work and it works the day a clinic signs up. Its sign-in is
   `flossify.ph/<clinic-slug>/sign-in/`.
2. **Every member has their own username and password.** A health record's
   audit trail needs a person, not a shared desk login (Data Privacy Act).
   Usernames are unique within the clinic's group; the clinic's address says
   which group, so two clinics may both have a "rosa". The owner (or anyone he
   allows) makes the account and sets a first password; the member is asked to
   choose their own at first sign-in. Email and mobile become optional for a
   member; without a mobile, a forgotten password is reset by the owner.
3. **The top bar keeps "Clinic sign-in"** (the owner's own rename, 26 Sep). It
   opens the last clinic signed in to on this device; the first time, it asks
   which clinic ("Find your clinic": the clinic's name or its address), and
   the email sign-in stays underneath for owners who prefer it.
4. **Custom roles, per clinic group.** The owner types any role name, ticks what
   it may see and do, and orders roles top to bottom. Rules:
   - someone who manages people can only hand out roles *below* their own, and
     only change people whose role is below theirs;
   - a role can only be given permissions its editor holds;
   - the Owner role is fixed (everything, top of the list, cannot be edited or
     removed), and there is always at least one active owner — the owner cannot
     lock himself out;
   - existing clinics get six roles named and ticked exactly as today (Owner,
     Admin, Dentist, Associate dentist, Secretary, Dental assistant), so nothing
     changes for anyone on the day it ships.
5. **"Is a dentist" stays a professional fact, not a role.** It carries the PRC
   licence, the public profile and a column on the schedule. A clinic may name a
   role "Resident" or "Orthodontist" and tick "treats patients" on the person.
6. **One check, `can(ws, key)`.** Permissions are read with branch access on
   every request (the query `canOpen()` already runs), so a change to a role
   takes effect on the member's next click without signing them out.
7. **Tasks** are to-dos the owner (or anyone allowed) assigns: title, notes, due
   date, assignee. Members see theirs on the Dashboard and tick them done; the
   assigner sees who has done what. People, Roles and Tasks sit inside Clinic
   settings and the Dashboard — still exactly four tabs.

### Permission keys

Plain words in the checklist, grouped; the key is what the code checks.

| Group | Checklist line | Key | Default roles |
|---|---|---|---|
| Patients | Add and edit patients, health history, consent, charts | `records.edit` | all six |
| Patients | Book, move and check in visits | `schedule.edit` | all six |
| Patients | Text patients from the Messages page | `messages.send` | owner, admin |
| Money | Open Finances: statements and payments | `finance.bill` | owner, admin, secretary |
| Money | See amounts: balances, takings, claim amounts | `finance.money` | owner, admin |
| Money | Void a statement | `finance.void` | owner, admin |
| Clinic | Change clinic settings: profile, hours, prices, photos, privacy | `settings.edit` | owner, admin |
| Clinic | Pay the Flossify plan | `plan.pay` | owner, admin |
| People | Add members, reset passwords, give roles | `people.manage` | owner, admin |
| People | Make and change roles | `roles.manage` | owner |
| People | Assign tasks to others | `tasks.assign` | owner, admin |

`staff_access.can_view_finance` stays as a per-branch extra: "sees money at
this branch" adds `finance.bill` + `finance.money` there, as today.

## Reserved addresses

A clinic's slug may not be a first path segment the site already uses. The
list lives in `src/lib/slug.ts` (`RESERVED`) and `uniqueClinicSlug()` skips
them (a clinic called "Find" becomes `find-2`): find, start, me, c, f, auth,
admin, api, coverage, websites, privacy, offline, uploads, samples, video, img,
icons, fonts, shots, healthz, clinics, today, dentists, sign-in, login, logout,
account, settings, help, about, contact, terms, pricing, blog, www, mail, app,
sitemap, 404, 500. (A slug is lowercase letters, digits and hyphens, so a file
such as `sw.js` can never collide.) Astro serves its own pages before a dynamic route, so a clinic that already
held a reserved slug before this list existed keeps what it has: its page at
`/find/<slug>/`, its workspace at `/c/<slug>/`, and its staff sign in by email
at `/auth/login/` as before.

## Phases — each one ships on its own

### P1 — usernames and the clinic's own sign-in
- Migration **029**: `staff.username citext` (`^[a-z0-9][a-z0-9._-]{2,31}$`),
  `unique (group_id, username)`, backfilled for every existing account from
  the email's local part (deduplicated); `staff.email` nullable (a member may
  have none); `staff.must_change_password boolean`; definer
  `clinic_door(slug)` → the clinic's id, group, name, slug and (if listed) its
  cover photo — enough to draw a sign-in page for a clinic that is not listed
  yet, nothing more.
- `/<slug>/sign-in/`: the clinic's name and its own photo behind a compact
  glass card (the booking's `ClinicRoom`); username (or email) + password,
  Show, Caps Lock, This device: Shared / My own — the staff entrance's rules
  (50px fields, 16px text, ≥44px targets, measured contrast). Rate limits
  `login:u:<clinic>:<username>` + per address; `auth_event` as today.
- `/<slug>/` redirects to the clinic's page (`/find/<slug>/`) until P5.
- The device remembers the last clinic (`fl_clinic`, a year); "Clinic sign-in"
  in the top bar goes there. `/auth/login/` gains "Find your clinic" above the
  email form.
- Username shown on My page and on a person's page; owner/admin can change it.

### P2 — roles and permissions underneath
- Migration **030**: `clinic_role (id, group_id, name, rank, perms text[],
  is_owner, archived_at)`, six default roles per group, `staff.role_id`
  backfilled from `staff.role`; `signup_clinic()` makes the six for a new
  clinic. `staff_branches()` / `canOpen()` return the role's perms.
- `src/lib/can.ts`: the key list, the defaults, `can(ws, key)`; every check in
  the table above moves to it. `staff.role` stays for the profile words until
  P3 removes its last readers.
- Verified by comparing, for each seeded person, what every page shows before
  and after (no change is the test).

### P3 — People and Roles screens (Clinic settings)
- **People**: Add member — name, username, first password (or "make one for
  me", shown once), role, "treats patients" (+ PRC licence), mobile and email
  optional. Reset password (owner sets a new one; the member chooses their own
  at next sign-in). Change role within the rules above.
- **Roles**: the ranked list; Add role; rename; tick permissions; move up/down;
  remove a role nobody holds. The Owner row is shown locked.

### P4 — tasks
- Migration: `clinic_task` under RLS (clinic, title, notes, due, assignee,
  created by, done at / by). Dashboard card "Your tasks" (due and overdue first,
  tick to finish, undo); "Assign a task" for `tasks.assign`; the assigner sees
  the ones they gave out. An assignee can only be someone at this branch.

### P5 — the clinic's site at `/<slug>/`
- The clinic's page as a small site: its name and top bar (Services, Hours,
  Dentists, Find us, **Book a visit**, Sign in), over its own cover photo in
  frosted glass (`clinic-glass.css`), reusing the clinic page's data
  (`public_directory()`) and linking to its booking. A clinic not listed yet
  shows its name, "Not open for online booking yet" and Sign in — its staff can
  always get in.
- The owner's Settings shows the address ("Your clinic's site:
  flossify.ph/<slug>/ — your team signs in there") with Copy.

## Open for the owner
- Usernames for existing accounts are made from their email; the owner can
  change any of them in People.
- Whether a member may keep signing in by email as well as username (proposed:
  yes, both work at the clinic's door).
