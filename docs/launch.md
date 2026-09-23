# Launch checklist

For the owner. What is ready, what only you can do, what happens on launch
day, and how the pilot runs. The technical steps are in `docs/deploy.md`;
you do not need to read it. Written 23 September 2026.

---

## Ready

- **The clinic workspace**: today's list, the schedule, patients and the
  tooth chart, texts to patients, HMO and PhilHealth claims, settings, team
  invitations, photos, billing.
- **The patient side**: find a clinic, book without an account, and "My
  visits" by mobile number.
- **Your operations pages** (`/admin/`): dentists' PRC checks, the clinics,
  and billing.
- **Safety**: each clinic's records are walled off by the database itself;
  sign-in is rate-limited; passwords are reset by texted code; the server
  refuses to start with an unsafe setting and has a health check.
- **The server kit**: a Docker image, a one-page deploy guide, database
  updates that never delete data, and a backup whose restore has been tried.

**Not built yet — tell every pilot clinic:**

- No email. Resets and invitations come by text, so every staff member needs
  a mobile number on their account.
- It needs the internet. There is no offline mode for brownouts; keep a
  mobile-data hotspot at the desk.
- Consent for walk-in patients stays on paper. Only online bookings record
  it.
- No BIR invoices. Clinics keep issuing receipts from their booklet or POS.
- Claims are **tracked, not submitted**. Flossify follows each HMO and
  PhilHealth claim from draft to paid; the clinic still files it with
  PhilHealth or the HMO the usual way.
- Patients' text replies do not arrive (see Semaphore below).

---

## Only you can do these

- [ ] **Hosting account and payment.** Recommended: Render, Singapore region
      (`docs/deploy.md` explains the choice). Put a card on it and turn on
      two-step sign-in. The monthly cost depends on who deploys:
  - **you deploy it yourself**: the free Hobby workspace is enough, about
    US$21 a month with Render's database (about US$30 with a DigitalOcean
    database);
  - **someone else deploys**: never share your password. Hobby allows only
    one person, so upgrade to Pro (US$25 a month more) and add them as a
    member: about US$46 a month (about US$55 with DigitalOcean). Pro also
    keeps 7 days of database restore points instead of 3.
- [ ] **Domain.** `flossify.ph` registered in your name, with access to its
      DNS settings for whoever deploys. The site is already set up for
      `flossify.ph` and `www.flossify.ph`. On 23 September 2026 the name is
      registered, its DNS is at Namecheap, and it shows Namecheap's parking
      page: nothing points at Flossify yet. That happens on launch day.
      Check that the registration is yours.
- [ ] **Semaphore** (semaphore.co), the text sender.
  - Open an account and buy credits: ₱0.56 per text before VAT.
  - Register a sender name (11 characters at most, for example `FLOSSIFY`)
    and wait for approval. Nothing goes out without it.
  - Give the API key to whoever deploys, privately.
  - On launch day, test it (below).
  - **Replies go nowhere.** Semaphore only sends, so no text asks a
    patient to reply. The day-before reminder names the visit and says
    *"To move it, call* (the clinic's number)*."* Patients confirm by
    calling or at "My visits". If you want replies one day, ask Semaphore
    or another gateway for a number that receives them.
- [ ] **NPC and a Data Protection Officer.** Name Flossify's DPO. Ask the
      lawyer whether Flossify must register with the National Privacy
      Commission (it holds patients' health records for clinics). Give the
      developer the DPO's name and email, and the NPC number once the
      registration is real: they go into the privacy page (`/privacy/`)
      before launch. Today that page shows bracketed placeholders in their
      place, which must not go live. Never claim registration early.
      (Settings → Privacy, inside each clinic's workspace, is for the
      clinic's own DPO, not Flossify's.)
- [ ] **Lawyer review**, before any real patient's data goes in:
  - the privacy notice (`/privacy/`), including the DPO's name and email,
    which are still placeholders;
  - terms of service — there are none yet;
  - a **data-processing agreement with each clinic** (the clinic owns its
    patients' records; Flossify keeps them on its behalf);
  - storing patient records in **Singapore**, outside the Philippines, and
    naming the host, the database provider and Semaphore as subprocessors.
- [ ] **SwiftCare.** The sample website on `/websites/` is a redesign of
      SwiftCare Dental Clinic's real site, using their name, photos and
      price list. Get their written permission before launch, or have it
      replaced with an invented clinic.
- [ ] **Prices and where clinics pay.** These are placeholders in
      `src/lib/billing.ts`. Until the developer marks them final
      (`BILLING_FINAL` in `src/lib/billing-config.ts`), clinics see them
      labelled "not final yet", the pay-to details and billing email are
      hidden, and **no invoice is issued to anyone**, even after a trial
      ends. Invoicing starts the day they are marked final. Give the
      developer:
  - plans, per branch per month: Starter ₱990, Clinic ₱1,990, Group ₱1,490
    (placeholder numbers);
  - your GCash number, Maya number, and bank account;
  - the email address for billing questions;
  - the policy sentence "may pause the public listing after 30 days
    unpaid" — nothing enforces it, and records are never switched off;
  - the free trial: every new clinic gets 30 days. For one clinic, change
    its end date on `/admin/billing/`. A different length for everyone is
    a small database change for the developer, not a setting.
- [ ] **BIR — ask an accountant**: registering the business, the official
      invoice or receipt you must give clinics for each payment (the
      numbers Flossify puts on its invoices are not a BIR series), VAT or
      percentage tax, and withholding tax if clinics deduct it.
- [ ] **PRC checks.** You (or someone you trust) check each dentist's licence
      on verification.prc.gov.ph and mark it on `/admin/prc/`. Until then
      their public profile says "PRC check pending".

---

## Launch day

In this order. Stop at any step that fails.

1. The developer deploys by `docs/deploy.md`. The health check says OK.
2. `https://flossify.ph` opens with the padlock. The developer has added
   the security headers (`docs/deploy.md`, section 9), or has told you
   why the host cannot yet.
3. **Your operations account.** One command on the server creates it:
   `npm run admin:create`, with your email and your name. You type the
   password yourself, twice; nothing shows as you type. Use at least 12
   characters (a short sentence works well) and keep it in a password
   manager. The account has **no mobile**, so your mobile stays free for
   the test clinic. Sign in at `https://flossify.ph/auth/login/` and open
   `/admin/`. If sign-in answers "Cross-site POST form submissions are
   forbidden", check that the address bar says `flossify.ph`. If it does,
   stop and call the developer.

   **Forgot this password?** A text cannot reset it. Run the same command
   on the server with the same email, and type a new one. The old one
   stops working, and every device signed in to it is signed out.
4. **Test clinic.** Create one at `/start/` with your own mobile and a
   different email from your operations account (one email and one mobile
   per account). It stays unlisted, so the public never sees it. On
   `/admin/billing/`, set its subscription to cancelled so it is never
   invoiced.
5. **Texts work.** On the sign-in page choose "Forgot password" and enter
   your mobile. The code should arrive within a minute.
6. **A booking works.** Switch the test clinic to "Listed on Find a clinic"
   for a few minutes (unlisted clinics have no public page). From your
   phone, book a visit on its page; see it arrive in the workspace; cancel
   it; switch the listing off again.
7. **First backup** taken and its restore check done (`docs/deploy.md`,
   section 6).
8. Real prices and pay-to details are in and marked final, and the privacy
   page's placeholders are filled in.
9. Only now invite the first pilot clinic.

---

## The pilot: 2–3 clinics in Baguio

**Who.** Two or three clinics of different sizes — a solo dentist, a clinic
with two or three chairs, and if possible a group with two branches — each
with a front-desk person who texts patients today.

**Free period.** Pick a length (for example 60 days) and write it, and what
happens after it, into the agreement. Then on `/admin/billing/` set each
pilot clinic's trial to end on that date. Once prices are marked final, a
clinic whose trial has ended is invoiced on the next monthly run, so set
the trial dates before that day.

**Setting each clinic up** (an hour, in person):

- Create the clinic at `/start/` together: hours, dentists, fees, photos.
- Invite the staff from Settings → Team. Each needs their own mobile.
- Check the dentists' PRC licences on `/admin/prc/`.
- Keep the clinic unlisted until its page is complete; then the owner
  switches on "Listed on Find a clinic".
- Show the front desk the paper consent form for walk-ins, and the offline
  plan for brownouts.
- Agree on one group chat for problems, and a 15-minute call each week.

**What to watch, every week:**

- **Texts**: on `/admin/`, the "Texts failed, 7 days" and "Texts waiting"
  numbers (your account cannot open a clinic's Messages page). Ask each
  front desk to look at their Messages page for failed texts, whether
  reminders went out the day before, and any patient who says they
  replied to a text (nobody receives replies).
- **Bookings** made through Find a clinic, compared with phone and walk-in.
- **No-shows**, compared with before Flossify.
- **The front desk**: how long check-in and finding a patient take;
  anyone locked out or unable to reset a password.
- **The server**: the health check stayed up (a free uptime monitor on
  `/healthz` will email you), the weekly backup was taken, the host's bill.
- **Stop everything and call the developer at once** if a clinic ever sees
  another clinic's patient, or a record goes missing.

**At the end.** Ask each clinic what they would pay and what they would miss.
Set the real prices from that, then offer each pilot clinic the plan, and
ask permission before quoting any of them.
