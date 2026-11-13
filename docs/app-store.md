# Flossify on the App Store: what to submit

Everything here is ready to paste into App Store Connect except what only the owner can supply, marked **Owner**.
Brought up to date after the polish round of 13 Nov 2026 (`docs/features/ios-app.md`, "The polish round").
Words follow `docs/glossary.md` (a *visit*, never an appointment; *statement*, never an invoice). Prices and claims
name only what is live (`CLAUDE.md`, "Lists name only what is live").

## The account (Owner)

- **The Apple Developer account is now an organisation** (the owner, 13 Nov 2026). Apple asks that apps holding
  health records come from an organisation, not a person (guideline 5.1.1(ix)), so this was the first thing to settle.
  Only the owner signs in to it and enters its password or keys.
- In App Store Connect, a new app: platform iOS, name **Flossify**, primary language English (U.S.), bundle id
  `ph.flossify.app`, SKU `flossify-ios`.
- In Xcode: *App* target → Signing & Capabilities → Team. Then Product → Archive → Distribute App → App Store Connect.

## The listing

**Name:** Flossify

**Subtitle** (30 characters at most): `Your dental clinic, paperless`

**Promotional text** (170 at most):
> Book a visit at a dental clinic near you, or run your clinic's day from your phone: the calendar, patient records,
> consent on the iPad and statements, in one app.

**Description:**
> Flossify is dental clinic software made for clinics in the Philippines, and the place their patients book.
>
> For patients
> • Find a clinic near you by what you need, your HMO or PhilHealth.
> • Book a visit at a time the clinic can honour, with no account.
> • See your visits, and add one to your calendar.
>
> For clinics
> • The day on one screen: the calendar, who is next for you, and what waits.
> • A patient record like the paper chart: the tooth chart, medical history and allergies, the Treatment record.
> • Consent signed on the clinic's iPad, kept with the visit.
> • Statements and acknowledgments of payment, prescriptions and letters, printed from the phone.
> • Works through a brownout: a chart open in the last four hours keeps working, and changes are sent when the line
>   is back.
>
> Flossify is not a BIR invoicing system. A clinic opens its account at flossify.ph.

**Keywords** (100 characters, commas): `dentist,dental,clinic,teeth,booking,visit,patient,record,chart,Philippines,HMO,PhilHealth`

**Category:** Medical (primary), Business (secondary). Medical draws closer review, but it is what the app is.

**Support URL** (Owner): a page that reaches a person at Flossify. The site has none yet.

**Marketing URL:** `https://flossify.ph/`

**Privacy policy URL:** `https://flossify.ph/privacy/`. Before submitting (Owner, with the lawyer): no unfilled
placeholders, who to contact, and how to ask for data to be deleted (guideline 5.1.1(i)). The notice's words are a legal
change (`CLAUDE.md`).

**Copyright:** `© 2026 <the company's legal name>` (Owner).

**Age rating:** answer the questionnaire; *Medical/Treatment Information* applies. Nothing else does.

**Availability:** the Philippines (add others only with the owner). Turn off *Apple silicon Mac* and *Apple Vision Pro*
availability: the app is made for iPhone and iPad.

**Price:** free. Clinics pay for Flossify outside the app (see *Paying* below).

## App Privacy (the "nutrition label")

Data collected through the app's web view counts as the app's. Nothing is used for tracking; no data goes to a third
party for advertising.

| Data type | Collected | Linked to the person | Tracking | Purpose |
|---|---|---|---|---|
| Health and fitness → Health | Yes (clinic staff record it; patients answer the medical history) | Yes | No | App functionality |
| Contact info → Name, Phone number, Email address | Yes | Yes | No | App functionality |
| User content → Photos or videos (X-rays and files), Other user content (notes, signatures) | Yes | Yes | No | App functionality |
| Identifiers → User ID | Yes (staff accounts) | Yes | No | App functionality |
| Usage data, Diagnostics, Location, Financial info (card numbers) | No | | | |

(Amounts on statements are not "financial info" in Apple's sense, which is card and bank details; Flossify stores none.)

## Screenshots

Required: 6.9-inch iPhone (1320 × 2868) and 13-inch iPad (2064 × 2752). To get them: Actions → iOS app → Run workflow,
tick *App Store sizes* (`.github/workflows/ios-app.yml`). The run photographs the public screens on the biggest iPhone
(the 6.9-inch Pro Max) and the 13-inch iPad Pro simulators at their native sizes; its artifact `ios-simulator` holds
them. Without the tick it uses the newest iPhone Pro, which is not the App Store's size. Screens of a clinic's workspace must show a demo clinic with made-up patients, never a real
clinic's, and no invented clinic branding in imagery (`CLAUDE.md`, standing constraints).

## App Review

**Sign-in for review** (Owner): a clinic made for review on flossify.ph. Never a real clinic's (it would show real
patients): not listed (it never appears on /find/ or among the home page's partners), with made-up patients, a staff
account for the reviewer, and texts not needed (the review account signs in with a password).

**Notes for the reviewer** (paste, then fill the two blanks):
> Flossify is practice software for dental clinics in the Philippines and the place their patients book visits. The
> app is the same service as flossify.ph, with what a phone adds:
> • Haptics: picking a finding on a tooth, a save, a refusal, a booking.
> • Printing through iOS's print sheet, on the paper each page is made for (A4, A5, a receipt roll).
> • Files through the share sheet; patient files are never offered to Photos.
> • Offline: a patient chart open in the last four hours keeps working and sends its changes when the line is back.
>   When the line drops as a link is tapped or a form is sent, the page stays with the words typed on it and says that
>   nothing was sent. When the site cannot be reached at all, the app shows its own offline page; Try again returns to
>   the page the person was on.
> • Privacy: the app switcher shows the Flossify mark instead of a patient record.
> • Home Screen quick actions (long-press the app's icon): Find a clinic, My visits, Clinic sign-in.
> • Larger Text: on an iPhone the app follows the size chosen in iOS's Settings.
> • VoiceOver: a two-finger scrub goes back, and a save or a refusal is spoken.
>
> To see it: sign in with Clinic sign-in → Email ____ / Password ____. On the Dashboard, open a patient, tap a tooth on
> the chart and pick a finding (haptic); tap Print the record (iOS print sheet); open X-rays and files and download one
> (share sheet). For the patient side, tap I'm a Patient on the first screen. With Airplane Mode on, tap a link: the
> page stays and says nothing was sent.
>
> Deleting an account: My page, at the foot, Delete my account. It sends a request that Flossify confirms. An owner's
> request closes the whole clinic; anyone else's closes only their own sign-in.
>
> Clinics open their account and pay for Flossify at flossify.ph, outside the app.

## Questions only the owner can answer before submitting

- **Deleting an account from inside the app (5.1.1(v)): built, no longer a question** (047, `src/lib/deletion.ts`).
  A clinic can be opened from inside the app (/start/), so Apple requires a way to start deleting the account in the
  app. It is on My page, at the foot: *Delete my account* sends a request (an owner's closes the whole clinic, anyone
  else's only their own sign-in), and Flossify confirms it on `/admin/accounts/`. The reviewer's notes above say where
  it is. What the privacy notice says about what the law keeps is still the lawyer's (see the checklist below).
- **Paying (3.1.1, 3.1.3(c)).** The plan is paid with PayMongo from Clinic settings. Selling to a clinic for its staff
  is usually "enterprise services" (3.1.3(c)), which may pay outside Apple, but Apple decides. Nothing is paid while
  `BILLING_FINAL` is false. If Apple objects, the app can leave the payment button out and say to pay at flossify.ph.
- **The SwiftCare sample (5.2.1).** A real clinic's name and photographs are reachable from /websites/ in the app: the
  clinic's written permission for the review notes, or /websites/ left out of the app.
- **Password AutoFill:** the Team ID, then `/.well-known/apple-app-site-association` and the Associated Domains
  capability (`webcredentials:flossify.ph`).

## What is left before Submit for Review

The owner's, first. Each is a blank only the owner can fill; nothing here is made up for them.

- [ ] **The privacy notice's placeholders, with the lawyer** (`/privacy/`): the data protection officer's name and
      email, and the NPC registration number, or that line removed until registration is true. The notice's words are
      a legal change, so the notice and its version are published together.
- [ ] **A support URL that reaches a person** at Flossify. The site has none yet.
- [ ] **The review clinic and its sign-in**: made for review, not listed, made-up patients, a staff account with a
      password. Its email and password go in the two blanks of the reviewer's notes.
- [ ] **Screenshots**: Actions → iOS app → Run workflow, tick *App Store sizes*; take them from the `ios-simulator`
      artifact. Workspace screens come from the review clinic, never a real one.
- [ ] **App Privacy answers** as in the table above, matching `mobile/ios/App/App/PrivacyInfo.xcprivacy`. If one
      changes, the other changes with it.
- [ ] **The age rating** questionnaire (*Medical/Treatment Information* applies).
- [ ] **Availability**: the Philippines; *Apple silicon Mac* and *Apple Vision Pro* turned off.
- [ ] **The SwiftCare permission**: the clinic's written permission ready for the review notes, or /websites/ left out
      of the app.

Then the rest:

- [ ] The copyright line's legal name, and the Team in Xcode (Signing & Capabilities).
- [ ] A build uploaded (Actions → iOS release → Run workflow, or Product → Archive on a Mac) and tried on a real
      iPhone through TestFlight: the list in `mobile/README.md`, "What to check on a real device".
- [ ] Paying: nothing is paid while `BILLING_FINAL` is false; the answer to Apple's question is above.
- [ ] Password AutoFill, if wanted for the first release: the Team ID and the Associated Domains capability.
- [ ] The reviewer's notes pasted, with both blanks filled.
