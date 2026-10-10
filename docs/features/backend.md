# Backend, production and operations

*Moved here from `CLAUDE.md` word for word on 10 Oct 2026 (plan item 1.9). `CLAUDE.md` holds the rules; this file holds the detail. Where they differ, `CLAUDE.md` wins.*

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
  owner). Public pages say "PRC check pending" until then. **No number, no
  check** (046, 6 Oct): `admin_prc_mark()` refuses `checked` while the dentist
  has no `prc_licence` (`markPrc` → `nonumber`), the queue has no Matches for
  them and says how many wait for a number, and 046 put anyone already checked
  with no number back to pending — its NOTICE in the deploy log names the
  clinics.
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
