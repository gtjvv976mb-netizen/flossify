# Deploy Flossify

One page, top to bottom, to put Flossify on a server. Prices and host facts
were checked on **23 September 2026**; check them again before paying.

---

## 1. What runs

| Piece | Command | Notes |
| --- | --- | --- |
| Web | `npm start` | Port 8080. Health check: `GET /healthz` answers 200 `{"ok":true}` when it can reach the database, 503 otherwise. |
| Text worker | `npm run sms:worker` | No port. Sends queued texts through Semaphore every 10 s, queues tomorrow's reminders, holds patient texts 9 pm–8 am Manila. One copy is enough. |
| Release step | `npm run db:migrate` | Before every new web version. Adds what is missing, never drops anything, safe to run twice. |
| Operations account | `npm run admin:create` | By hand, in the web service's Shell: once to create your `/admin/` account (first deploy, step 6), again whenever you need a new password (section 10). |
| PostgreSQL 17 | managed | In Singapore. Its admin role must be a superuser, or have `BYPASSRLS` and `CREATEROLE` (without `CREATEROLE`, create `flossify_app` in the provider's console first). See step 3 of the first deploy. |
| Disk | 1 GB at `/data` | Clinic photos (`UPLOAD_DIR=/data/uploads`). Only the web needs it. |
| Backups | host + `npm run db:backup` | The host's daily database backups, plus your own copy off the host every week. |

Every command above runs from the same Docker image (`Dockerfile`). It runs
as an unprivileged user, carries no settings inside it, and includes the
PostgreSQL 17 client tools for backups. Hosts that read a `Procfile` get the
web, worker and release lines there.

---

## 2. Settings

Set these in the host's dashboard, never in a file in the repository. The
web server checks them on its first request and refuses to serve (503 on
`/healthz`, every problem listed by name in its log) until they are safe.

| Variable | Web | Worker | Release | Value |
| --- | :-: | :-: | :-: | --- |
| `NODE_ENV` | ✓ | ✓ | ✓ | `production` (the image sets it) |
| `HOST`, `PORT` | ✓ | | | `0.0.0.0`, `8080` (the image sets both; a host may set `PORT` itself; with the `Procfile`, set `HOST=0.0.0.0` yourself) |
| `DATABASE_URL` | ✓ | ✓ | | `postgres://flossify_app:<APP_DB_PASSWORD>@<host>:<port>/flossify` — the app's own plain role, never the admin |
| `DATABASE_SSL` | ✓ | ✓ | ✓ | `1` for a managed Postgres reached over the internet. Remove any `?sslmode=require` from the URLs: this driver reads it as "verify the certificate" and refuses the provider |
| `DATABASE_ADMIN_URL` | | | ✓ | The provider's admin connection to the `flossify` database. Used only by `db:migrate`, `db:backup` and `admin:create` |
| `APP_DB_PASSWORD` | | | ✓ | `openssl rand -hex 24`. `db:migrate` gives it to `flossify_app` on every run |
| `SESSION_SECRET` | ✓ | | | `openssl rand -base64 48`. Changing it signs everyone out |
| `SMS_PROVIDER` | ✓ | ✓ | | `semaphore` |
| `SMS_API_KEY` | ✓ | ✓ | | From semaphore.co, Account → API |
| `SMS_SENDER` | ✓ | ✓ | | The sender name Semaphore approved, exactly (11 characters at most) |
| `SMS_INBOUND_SECRET` | ✓ | | | `openssl rand -hex 24`, different from every other secret (see section 7) |
| `UPLOAD_DIR` | ✓ | | | `/data/uploads` (the image sets it) — on the persistent disk |
| `TRUST_PROXY` | ✓ | | | `1` on every host below: they all put a proxy in front, and rate limits must see the real visitor |
| `BACKUP_DIR`, `BACKUP_KEEP` | | | | Optional, for `db:backup`: default `/data/backups` in the image, keep 14 |
| `ALLOW_CONSOLE_SMS` | ✓ | ✓ | | Normally unset. Only while Semaphore has not yet approved your sender name: `1` with `SMS_PROVIDER=console` lets you deploy and try everything else, but texts are only logged (without their contents), so nobody can reset a password or accept an invitation. Remove it before the first real clinic |
| `SHOW_DEMO_LOGINS` | never | never | never | Owner's Mac only. The server refuses to start with it set |

On a host that runs the release step inside the web service (Render,
Fly, Railway), put `DATABASE_ADMIN_URL` and `APP_DB_PASSWORD` on the web
service. Never put them on the worker.

Generate secrets on your own computer (`openssl` is on every Mac) and keep
them in a password manager. `APP_DB_PASSWORD` must be letters and digits
only, which `-hex` guarantees.

---

## 3. Choose a host

The owner picks and pays. Everything here is in **Singapore**, the closest
region to the Philippines. Checked 23 Sep 2026, prices in US dollars before
tax.

**Web + worker + disk**

| Host | Singapore | Disk for photos | Worker | From, per month | Source |
| --- | --- | --- | --- | --- | --- |
| Render | Yes | Yes, $0.25/GB. One instance; a few seconds down per deploy | Yes (background worker) | Starter web $7 + worker $7 (workers use the same plans). Hobby workspace: no fee, **one person only**; a second person needs Pro, $25 | [regions](https://render.com/docs/regions), [disks](https://render.com/docs/disks), [Starter](https://render.com/articles/render-vs-railway), [plans](https://render.com/docs/compute-plans), [pricing and seats](https://render.com/pricing), [members](https://render.com/docs/team-members) |
| Fly.io | Yes (`sin`) | Yes, volumes $0.15/GB, one machine each | Yes (second process group) | ~$4.05 (512 MB) + ~$2.47 (256 MB), Singapore prices | [pricing](https://fly.io/docs/about/pricing/) (the `sin` table), [regions](https://fly.io/docs/reference/regions/) |
| DigitalOcean App Platform | Yes (`SGP`) | **No** — files are lost on every deploy, so uploaded photos would vanish | Yes | $5 per container | [limits](https://docs.digitalocean.com/products/app-platform/details/limits/), [pricing](https://docs.digitalocean.com/products/app-platform/details/pricing/) |
| Railway | Yes | Yes, $0.15/GB (mounted as root; the image handles it) | Yes (another service) | Hobby $5, includes $5 of usage | [regions](https://docs.railway.com/reference/deployment-regions), [pricing](https://docs.railway.com/reference/pricing/plans), [volumes](https://docs.railway.com/reference/volumes) |

**PostgreSQL**

| Database | Singapore | Automatic backups | Admin can bypass RLS | From, per month | Source |
| --- | --- | --- | --- | --- | --- |
| Render Postgres | Yes | Restore to any moment: last 3 days (Hobby workspace), 7 (Pro, $25/mo) | Not documented: check (first deploy, step 3) | Basic-256mb $6 + $0.30/GB | [backups](https://render.com/docs/postgresql-backups), [prices](https://render.com/articles/how-much-does-cloud-application-hosting-cost-for-small-businesses) |
| DigitalOcean Managed PostgreSQL | Yes (`SGP1`) | Daily, kept 7 days, plus any moment in between | **Yes** (`doadmin` has Bypass RLS) | $15 (1 GiB, one node) | [pricing](https://docs.digitalocean.com/products/databases/postgresql/details/pricing/), [backups](https://docs.digitalocean.com/products/databases/postgresql/how-to/restore-from-backups/), [roles](https://docs.digitalocean.com/products/databases/postgresql/how-to/modify-user-privileges/) |
| Fly Managed Postgres | Yes (`sin`) | Included (details not published) | Not documented: check | Basic $38 + $0.28/GB | [mpg](https://fly.io/docs/mpg/) |
| Neon | Yes (`aws-ap-southeast-1`) | Restore window up to 7 days (Launch) | Through `neon_superuser` membership; check | $0.106 per compute-hour + $0.35/GB | [pricing](https://neon.com/pricing), [regions](https://neon.com/docs/introduction/regions), [roles](https://neon.com/docs/manage/roles) |
| Supabase | Yes (`ap-southeast-1`) | Daily, kept 7 days (Pro); moment-in-time +$100/mo | Not documented: check | Pro $25 (includes $10 of compute) | [pricing](https://supabase.com/pricing), [regions](https://supabase.com/docs/guides/platform/regions) |
| Railway Postgres | Yes | Volume backups, daily kept 6 days. A container, not a managed database | Yes (you hold the superuser) | Usage-based | [backups](https://docs.railway.com/reference/backups) |

**Recommendation for a 2–3 clinic pilot:** run the web service, the worker
and the photo disk on **Render** in Singapore — one dashboard, Docker
deploys, a pre-deploy step for `db:migrate`, health checks, a web Shell,
and daily disk snapshots — about $14 a month. Put the database on
**DigitalOcean Managed PostgreSQL 17** in Singapore (`SGP1`, $15): its
admin role `doadmin` has Bypass RLS and Create role
([documented](https://docs.digitalocean.com/products/databases/postgresql/how-to/modify-user-privileges/)),
which Flossify needs — the security-definer functions run as the admin,
and with forced row-level security an admin without Bypass RLS sees no
rows (measured: the directory went from 5 clinics to 0, sign-up failed,
and pg_dump refused to run). Render's own Postgres documents neither
(checked 23 Sep 2026: its default user can create users, it is not a
superuser, and Bypass RLS is not mentioned), and `db:migrate` refuses an
admin without it, so do not start there. About **$30 a month** in all,
with daily backups kept 7 days. All patient data sits in Singapore.

Those totals are for a **Hobby** workspace, which has one login: the owner's.
If someone else deploys, do not share that password: upgrade the workspace
to **Pro** (+$25 a month, any number of members, and Render Postgres keeps 7
days of restore points instead of 3). That makes about **$46** a month, or
about **$55** with the DigitalOcean database.

**A question for the owner's lawyer, not legal advice:** every option above
stores patient records outside the Philippines. Ask whether that is allowed
under the Data Privacy Act (RA 10173) and NPC rules for health information,
what the privacy notice at `/privacy/` and each clinic's data-processing
agreement must say about it, and whether the host, the database provider
and Semaphore must be named as subprocessors.

---

## 4. First deploy

1. **Push.** Push the repository to GitHub (private). The host builds the
   image from `Dockerfile`; no build happens on your Mac. Nothing to edit
   first: the host's proxy handles HTTPS and passes plain http to the
   container, and Astro trusts the proxy's "this was https" only for the
   names in `astro.config.mjs`, which already lists `flossify.ph` and
   `www.flossify.ph`. So the forms (sign-in, `/start/`, booking, photo
   upload) work on those two addresses. On the host's own address (for
   example `flossify.onrender.com`) they answer 403 *"Cross-site POST form
   submissions are forbidden"* — unless you add that address as the build
   argument `EXTRA_HOSTS` (for example `EXTRA_HOSTS=flossify.onrender.com`;
   comma-separated for several; it is read when the image is built, and
   the Dockerfile declares it). That lets you try the whole site before DNS
   is switched. Otherwise use the host's address for the health check only,
   and sign in once the domain works (step 7).
2. **Create the database** on DigitalOcean (section 3): Databases →
   PostgreSQL **17**, Singapore (`SGP1`), one node. Add a database named
   `flossify` and copy the `doadmin` connection string for it: that is
   `DATABASE_ADMIN_URL`. Write `DATABASE_URL` from it: same host, port and
   database, user `flossify_app`, password `APP_DB_PASSWORD`.
   - Remove `?sslmode=require` from both strings and set `DATABASE_SSL=1`.
   - Under Trusted Sources, add the web and worker's outbound addresses
     (Render: the service → Connect → Outbound).
   - (Render Postgres instead: use its **Internal** Database URL and leave
     `DATABASE_SSL` unset — but expect step 3 to stop at *"neither a
     superuser nor BYPASSRLS"*; see section 3.)
   - Any provider: pick PostgreSQL 17. The image's `pg_dump` is 17 and
     cannot back up a newer server.
3. **Create the web service** (Render: New → Web Service → the repo;
   Language: Docker; Region: Singapore; Instance: Starter).
   - Disk: mount path `/data`, 1 GB.
   - Health Check Path: `/healthz`.
   - Pre-Deploy Command: `npm run db:migrate`.
   - Environment: every ✓ in the Web and Release columns of section 2.
     (Render: put the shared ones in an Environment Group, and attach it to
     both services.)
   - Deploy. The release step builds the tables and creates `flossify_app`
     with your password. If it stops, nothing was changed; its log says why:
     - *"is neither a superuser nor BYPASSRLS"*: that database cannot run
       Flossify. Switch to DigitalOcean Managed PostgreSQL and deploy again.
     - *"may not create roles (no CREATEROLE)"*: in the provider's console,
       create a user named `flossify_app` whose password is
       `APP_DB_PASSWORD`, then deploy again.
     - *"may not change flossify_app's password"*: set that user's password
       to `APP_DB_PASSWORD` in the provider's console, then deploy again.
4. **Create the worker** (Render: New → Background Worker → same repo;
   Docker; Singapore; Starter; Docker Command `npm run sms:worker`;
   the Worker column of section 2). Its log should say
   `[sms] worker up, sending through semaphore every 10 s`.
   On Railway, whose start command replaces the image's entrypoint, write
   `flossify-entrypoint npm run sms:worker`.
5. **Check**: `curl https://<your-service>.onrender.com/healthz` →
   `{"ok":true}`. A 503 means the database cannot be reached or a setting is
   unsafe; the web service's log names each one.
6. **Your operations account** (for `/admin/`: PRC checks, billing). In the
   web service's Shell (Render: the web service → Shell), with your own
   email and name:

   ```sh
   cd /app && npm run admin:create -- ops@flossify.ph "Your Name"
   ```

   It asks for a password twice and shows nothing as you type. At least 12
   characters; a short sentence you will remember works well. Save it in
   your password manager. The last line it prints says *Operations account
   created for …*. Above it, npm repeats the command, and Node may say
   *.env not found. Continuing without it.* That is normal on the server,
   which has no `.env` file. The password is never printed or logged, and
   never goes on the command line. The command writes through the web
   service's `DATABASE_ADMIN_URL` (and `DATABASE_SSL`), so nothing else to
   set. Without a Shell (plain Docker, a VPS), run it from the image
   instead; `-it` gives it a terminal to ask in:
   `docker run --rm -it --env-file prod.env flossify npm run admin:create -- ops@flossify.ph "Your Name"`.

   If it answers *there is no terminal to type a password into*, nothing
   changed. Then, in the same shell, type `read -rs ADMIN_PASSWORD && export ADMIN_PASSWORD`,
   press Enter, type the password (nothing shows) and press Enter again.
   Run the command again, then `unset ADMIN_PASSWORD`. (If the shell says
   *Illegal option -s*, type `bash` first.) Never write the password into
   the command itself: the shell's history would keep it.

   The account has no mobile on purpose. **Each email and each mobile
   belongs to one staff account across the whole service**: `/start/`
   refuses one already in use, and Forgot password texts only the oldest
   account with that mobile, which for this account (no clinic) would send
   nothing. So use an email here that no clinic account will use; the
   command refuses to create an account with an email a clinic account
   already has. Forgot password cannot reach this account: run the same
   command again (section 10). (Tried on 23 Sep 2026 on a scratch database,
   with the same Node command outside the image: the new account signs in
   and opens `/admin/`; run again with a new password, the old password
   fails, the new one works, and the earlier sign-in is signed out.)
7. **Domain**: add `flossify.ph` and `www.flossify.ph` to the web service,
   create the DNS records the host shows you at your registrar, and wait for
   HTTPS. (On 23 Sep 2026 both names still point at the registrar's parking
   page: Namecheap DNS, `www` a CNAME to `parkingpage.namecheap.com`.
   Replace those records; do not add beside them.) The site already accepts
   both names (step 1). Then sign in at `https://flossify.ph/auth/login/`
   with the operations account, and add the security headers (section 9).
8. **First clinic**: open `https://flossify.ph/start/` and create a test
   clinic with your own mobile and an email that is not the operations
   account's. It stays unlisted. Then `/auth/forgot/` with that mobile: the
   code arriving on your phone proves the web, the worker and Semaphore end
   to end. On `/admin/billing/` set the test clinic's subscription to
   cancelled, so it is never invoiced once prices are final (until
   `BILLING_FINAL` is true in `src/lib/billing-config.ts`, nobody is). If any form answers 403 *"Cross-site
   POST form submissions are forbidden"*, look at the address bar: forms
   work only on `https://flossify.ph` and `https://www.flossify.ph`
   (step 1). If it is one of those, tell the developer.
9. **Never** run `npm run db:setup` or the seed against this database (both
   refuse a database that is not on this machine, and the seed refuses one
   that has staff), and never set `SHOW_DEMO_LOGINS`. Build on the host from
   the Dockerfile; settings are read when the server runs, never baked into
   the build.

Without a pre-deploy step (plain Docker, a VPS), run the release step by
hand before starting the new web version:
`docker run --rm --env-file prod.env flossify npm run db:migrate`.

---

## 5. Updating

1. Take a backup first if the update adds a migration (section 6).
2. Merge to the branch the host deploys. The host builds, runs
   `db:migrate`, then swaps the web to the new version. The worker redeploys
   from the same branch.
3. If `db:migrate` fails, the deploy stops and the old version keeps running
   (Render: "zero downtime"). Its log names the file and the line. Fix it
   in a **new** migration file; never edit one that already ran.
4. Deploy after clinic hours: with a disk attached, the web is down for a
   few seconds while the new version starts.

Migrations only add, so the old web keeps working against the new tables
for the moment both run. A change that renames or drops something is done
in two releases: add the new thing and use it, then remove the old one.

---

## 6. Backups, and a restore you have tried

**Every day, automatic.** The database host's backups (Render: restore to any
moment in the last 3 or 7 days; DigitalOcean: daily kept 7 days, plus any
moment in between) and Render's daily disk snapshots of `/data` (kept at
least 7 days). Nothing to run; check both are on.

**Every week, and before any update with a migration: your own copy, off
the host.** On your Mac (it has the PostgreSQL 17 tools), in the
repository folder, onto an encrypted drive:

```sh
export DATABASE_ADMIN_URL='postgres://…'   # the admin URL (Render: the External one)
DATABASE_SSL=1 UPLOAD_DIR=none BACKUP_DIR=/Volumes/<encrypted drive>/flossify npm run db:backup
unset DATABASE_ADMIN_URL
```

On DigitalOcean, whose Trusted Sources admit only the addresses listed
(section 4, step 2), first add your Mac's current public address to the
cluster's Trusted Sources, and remove it again afterwards; otherwise the
backup cannot connect. The same applies if you limited Render Postgres's
outside access to certain addresses.

It writes `flossify-db-<time>.dump`, checks that it reads back, and keeps
the newest 14. `UPLOAD_DIR=none` says the photos are not on this machine;
the disk snapshots cover them, and they are clinic photos anyone can
re-upload. These files are patient records: keep them on an encrypted
drive, never in email or a shared folder.

**Once a month, prove it restores** (ten minutes, on your Mac):

```sh
createdb flossify_restore_check
pg_restore --no-owner --no-privileges --single-transaction -d flossify_restore_check <the newest .dump>
psql -d flossify_restore_check -c "select (select count(*) from clinic) as clinics, (select count(*) from patient) as patients, (select max(starts_at) from appointment) as latest_visit"
dropdb flossify_restore_check
```

The numbers should match what the clinics see. This procedure was run on 23
Sep 2026 against a scratch copy: every table came back, row counts matched,
`db:migrate` found nothing to apply, and row-level security still isolated
clinics.

**Restoring for real** goes into a **new, empty** database, never over the
live one: follow the seven steps at the top of `scripts/db/backup.sh`
(stop web and worker, restore, `db:migrate`, point `DATABASE_URL` and
`DATABASE_ADMIN_URL` at the new database, start). The database host's own
"restore to a moment" also creates a new database; point the same two
settings at it.

---

## 7. Texts: Semaphore

- The worker sends through Semaphore's `v4/messages` API under your
  registered sender name. Standard texts are ₱0.56 each before VAT
  ([semaphore.co](https://semaphore.co/), 23 Sep 2026).
- This code has never sent through a live key. Test it once (section 4,
  step 8) and read the worker's log: `sent … ref <id>` is success; anything
  else names the reason.
- **Replies.** Flossify accepts a reply at

  ```
  POST https://flossify.ph/api/sms/inbound
  Content-Type: application/json
  X-Inbound-Secret: <SMS_INBOUND_SECRET>

  {"from": "09171234567", "text": "Y"}
  ```

  It answers `{"action": "confirmed" | "logged" | "unmatched"}`; a `Y`
  confirms that number's next visit. It must be JSON: a form-encoded post
  without an `Origin` header is refused before it arrives. **But Semaphore's
  API documents sending only — there is no inbound webhook to point here**
  ([docs](https://semaphore.co/docs), checked 23 Sep 2026), and replies to a
  sender name do not come back. Until a gateway that forwards replies is
  added, patients' replies reach nobody. So no text asks for one: the
  day-before reminder names the visit and says whom to call to move it
  (migration 019). The endpoint stays for that gateway.
- Check the endpoint yourself:
  `curl -X POST https://flossify.ph/api/sms/inbound -H 'content-type: application/json' -H "X-Inbound-Secret: $SMS_INBOUND_SECRET" -d '{"from":"09170000000","text":"test"}'`
  → `{"action":"unmatched"}`.

---

## 8. Behind the host's proxy

Render, Fly and Railway terminate HTTPS and forward to the container, so
set `TRUST_PROXY=1`. Without it every visitor looks like the proxy's one
address, so the limits meant for one person (40 sign-ins per 15 minutes,
20 bookings an hour per address) apply to everyone at once.

The server trusts only the last proxy's word for who the visitor is. Put
nothing else in front of the host's proxy (Cloudflare's orange cloud, a
CDN): every visitor would then look like that service's address, and people
who share nothing would share one limit.

---

## 9. Security headers on every page

The server adds these to every page it renders: sign-in, the workspace,
`/admin/`, booking, `/start/`, `/healthz`. Four pages are built ahead of
time and served as plain files, like the fonts and the film: the home page,
`/privacy/`, `/websites/` and `/offline/`, plus everything under
`/samples/`, `/fonts/`, `/img/`, `/video/` and `/assets/`. Those go out
**without** them, because the server's file handler answers before the app
sees the request (measured; see the top of `src/middleware.ts`). So the host
or the proxy in front adds these five to every response:

```
Strict-Transport-Security: max-age=31536000
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
Content-Security-Policy: frame-ancestors 'self'
Referrer-Policy: strict-origin-when-cross-origin
```

`SAMEORIGIN` and `'self'`, not `DENY` and `'none'`: `/websites/` shows the
sample clinic site in a frame from the same address, and `DENY` would blank
it. HSTS without `includeSubDomains` or `preload`: clinic sample sites may
one day live on subdomains that are not on HTTPS yet. Adding them beside the
server's own headers on rendered pages is fine; the stricter one still wins.

- **Fly.io**, in `fly.toml`
  ([configuration](https://fly.io/docs/reference/configuration/), checked
  23 Sep 2026):

  ```toml
  [http_service.http_options.response.headers]
  Strict-Transport-Security = "max-age=31536000"
  X-Content-Type-Options = "nosniff"
  X-Frame-Options = "SAMEORIGIN"
  Content-Security-Policy = "frame-ancestors 'self'"
  Referrer-Policy = "strict-origin-when-cross-origin"
  ```

- **Your own server** with Caddy or nginx in front: Caddy, the five lines
  in a `header { … }` block of the site; nginx, one
  `add_header <name> "<value>" always;` per line in the `server` block.
- **Render and Railway** have no setting for this on a web service (Render
  sets response headers only for static sites:
  [docs](https://render.com/docs/static-site-headers), checked 23 Sep 2026).
  Do not put Cloudflare in front to add them (section 8). On these hosts
  the four pages and the files go out without the five headers until the
  developer makes the server add them itself. That is a small change, not
  made yet. What it leaves open until then: another site can show the home
  page, `/privacy/` or `/websites/` inside a frame of its own, and a first
  visit to the home page gets no HSTS (the first page the server renders,
  such as sign-in, sets it for the whole address). No page that takes a
  password or a patient's details is affected.

**Check**, once the domain works:
`curl -sI https://flossify.ph/ | grep -iE 'strict-transport|nosniff|x-frame|frame-ancestors|referrer-policy'`
should print five lines. Try `/auth/login/` the same way; it always should.

---

## 10. Forgot the operations password

Forgot password cannot reach the operations account: it has no mobile. In
the web service's Shell, run the same command as on the first day, with the
same email:

```sh
cd /app && npm run admin:create -- ops@flossify.ph
```

Type a new password twice. It answers *New password set for …* (the npm
and *.env not found* lines above it are normal, as in step 6). The old
password stops working at once, every device signed in to that account
is signed out, and a lock from too many wrong tries is lifted. Leave the
name off to keep it, or add it in quotes to change it. Without a Shell:
`docker run --rm -it --env-file prod.env flossify npm run admin:create -- ops@flossify.ph`.
With no terminal to type into, see step 6 of the first deploy.

A clinic can still add your operations email to one of its staff (Settings
→ Team checks emails only inside that clinic). Your sign-in keeps working,
because the older account wins, and the reset still works; it then adds a
*Note:* naming that staff member, who cannot sign in with the email until
the developer changes the email on their account. If it says sign-in opens
a clinic's account instead, nothing changed: call the developer.
