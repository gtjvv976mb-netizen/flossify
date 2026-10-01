# Add patient, step by step: intake and consent forms (design)

> The build spec for the owner's request of 29 Sep 2026. Migration **039**. Code: `src/lib/intake*.ts`, `src/lib/consent-*.ts`. Pages: `/c/<slug>/patients/new/`, `/c/<slug>/patients/intake/…`, `/f/i/<token>/`, `/c/<slug>/patients/<id>/consents/…`. It follows CLAUDE.md throughout. Where this file and CLAUDE.md disagree, CLAUDE.md wins, and this file gets fixed.

The owner: *"Staff or any authorized staff will click Add patient, using QR or in-site. This will be a process done step by step. Before presenting the QR, the staff will go through a checklist to check which consent form should be signed for the procedure/operation. 1st page: Patient Information. 2nd page: Consent Form (clinic will fill up a formatted form created by you so the consent will be presented correctly in the correct format and proper way …). 3rd page: Consent form. 4th page: Consent form. End of profile creation."*

---

## 0. Decisions

1. **Add patient opens on a choice of three:** *On the patient's phone* (a QR code for this one patient), *Here, on this device* (hand the tablet over) and *Type it in yourself*. The third is today's one-page form, moved to `/patients/new/type/`. Import and the clinic's poster remain as quiet links.
2. **The desk goes through four steps before anything reaches the patient:** Consent forms (a checklist) · The clinic's part · Check · Hand over.
3. **Pages the patient sees:**
   - Page 1 is *Patient information*, for new patients only.
   - Page 2 is always the *Consent to examination and treatment*: the treatment version in force, today `treatment-2026-09`.
   - Pages 3 onward are one page per chosen form, in a fixed order.
   - Then *Check and send*, then a thank-you that shows nothing of the record.
4. **Every consent form is data in a versioned library.** Each form has a `consent_version` row of the new kind `document`. Its words live in code, and the row holds a hash of those words, so the words cannot drift.
5. **The clinic fills only typed fields.** Examples: teeth, type, reason, material, estimate, dentist. The words around those fields are fixed, so no form can come out malformed.
6. **Each consent page records one of three decisions:** *I agree* (signed), *I do not agree* (a signed informed refusal) or *I want to ask the dentist first* (not signed; the form waits on the record to be signed at the chair).
7. **Signatures:**
   - A fresh finger signature on every consent page, stored as strokes, never as an image.
   - Typed initials only where a form's risks section asks for them.
8. **The exact document signed is frozen at signing:**
   - The rendered words, the filled fields and the signer go into one canonical JSON text (`snapshot`).
   - The database computes its SHA-256 and a seal over snapshot + strokes + signer + time.
   - Reprints are drawn from the snapshot only, never from the current library.
9. **The dentist confirms the conversation.**
   - The patient's first tick says the dentist explained the form.
   - The named dentist confirms on the record, with a one-tap attestation under their own sign-in.
   - A dentist who prepares the form themselves attests while preparing.
10. **An intake is not a patient.**
    - A new patient's intake ends in *Sent*. The desk adds it with one tap, after seeing any look-alikes. Nothing is ever added silently.
    - An intake for a patient on file has consent pages only, and completes when the patient presses Send.
11. **The phone link:**
    - Its token is 26 characters, about 129 bits.
    - It is claimed by the first device that presses Start. It opens nothing after 15 minutes unclaimed, or after 20 minutes idle once claimed.
    - Drafts are kept on the server. Nothing enters the record before Send.
12. **The tablet hand-over parks the staff session.** No `/c/` page or API opens on that browser until the same person enters their password again. The kept record copy in the service worker cache is dropped at hand-over.
13. **Production gates:**
    - The phone path stays closed until the privacy notice in force is listed in `FORMS_PRIVACY_VERSIONS`. This is the same list that opens the poster forms.
    - The tablet path is open, on the same footing as today's Add patient.
    - Only templates that a dentist and the owner's lawyer have read (`CONSENT_REVIEWED`) are offered. The general consent is already live.
14. **Permission is `records.edit`,** read with `can(ws, 'records.edit')` on pages and with `canEditRecords` inside every writing transaction. No role names.
15. **IP addresses and browser details are not stored** with these consents. The notice in force does not cover them; see "Open" in CLAUDE.md.

---

## 1. The staff flow, screen by screen

All staff screens use `ClinicLayout` with `section="add-patient"` (the Patients tab lights up) and the soft template. Each screen has one teal button, sentence case, line icons, targets of at least 44px and fields at 16px. Every form carries `<Csrf />`. A stale token redirects with `?stale=1` and the page shows `CSRF_MESSAGE`. Every `/c/` response is `no-store`, which the middleware already does.

### 1.1 Entry points
- The Patients list's teal **+ Add patient** (unchanged link) goes to `/c/<slug>/patients/new/`.
- The shell's New menu, the search empty state and the booking panel hint link to the same place.
  - Fix while here: gate the New menu's *Add patient* with `can(ws, 'records.edit')`. `routes.ts` shows it to everyone today.
- **The record:** Consent section → **Prepare consent forms** (quiet). This starts an intake for a patient on file.
- **A visit's panel** (VisitPanels): **Prepare consent forms for this visit** (quiet). This starts an intake for a patient on file with the visit set (phase 4).
- **A waiting document on the record:** **Sign on this tablet**. This starts a one-document intake on this device and goes straight to hand-over.

### 1.2 Screen A: "Add a patient" (`/patients/new/`, rewritten)
One card, one question: **"How will they fill in their details and consent forms?"** Three radio cards, each 72px tall with an icon, a title and one line:

| Card | Line | Notes |
|---|---|---|
| **On their phone** · *Easiest* pill | "Show a QR code only this patient can use. They fill in and sign on their own phone." | Default. In production while the notice is not ready, the card is disabled and says "Opens when the clinic's privacy notice covers it. Use this device for now." |
| **Here, on this device** | "Hand this tablet or computer to them. The clinic's pages lock until you sign in again." | Default in production until the phone path opens. |
| **Type it in yourself** | "For a phone call or a paper form. No consent forms." | Goes to `/patients/new/type/`, today's page moved byte-for-byte apart from paths. |

- Below the cards: a teal **Continue**. It POSTs `intent=start` to `/c/<slug>/patients/intake/` (§1.9) for the first two cards, and redirects for the third.
- Quiet links under it:
  - *Import a spreadsheet* (`./import/`)
  - *The clinic's QR poster for walk-ins* (`./qr/`)
  - *For a patient on file, open their record → Consent → Prepare consent forms.*
- The "N patients sent their forms" line stays. It now counts poster forms plus sent intakes.
- Without `records.edit`, the page shows the same *Not allowed* pane as today.

### 1.3 Screen B, step 1 of 4: "Which consent forms?" (`/patients/intake/<id>/?step=consents`)
The step pills are import's `.imp-steps`: **1 Consent forms · 2 The clinic's part · 3 Check · 4 Hand over**, with `aria-current="step"` and done steps as links.

**Head**
- "For: a new patient". For a patient on file it is their name pill and chart no.
- For a new patient, an optional **Their first name, to show under the code** (at most 40 characters, `autocomplete="off"`).
- For a patient on file, **For a visit today** (optional): today's going visits, preselected when started from a visit.

**The checklist.** Each row is a checkbox card of at least 56px with the title, a one-line summary and a quiet **Preview** that opens a side panel with the patient's page at 390px (§3.5).
- **Always included** (ticked, not changeable, a lock icon and the words "Always included"):
  - *Patient information (page 1)*, for new patients.
  - *Consent to examination and treatment*.
  - For a patient on file who already signed the treatment version in force (in `visit_consent`, a `consent_document`, or `patient_consent` channel `form`), the row is unticked with the words "Signed 12 Aug 2026". It can be ticked again.
- **Numbing:** Local anaesthesia.
- **Treatment:**
  - Tooth extraction and oral surgery
  - Root canal
  - Fillings, crowns, bridges and veneers
  - Deep cleaning and gum treatment
  - Dentures
  - Dental implants
  - Braces and aligners
  - Tooth whitening
- **Records:** Photos and use of records (optional; saying no never changes care).

**Suggestions** come from `suggestConsents()` (§5.2) and appear as a blue pill on the row: "Suggested: Extraction, booked 2:30 pm", or "Suggested: plan line 36 extraction".
- Suggestions from the visit's `catalog_id` and from open plan lines are pre-ticked.
- Anaesthesia is pre-ticked for extraction, root canal, deep cleaning and implant.
- For fillings and crowns it shows "Often needed", unticked.

**Rules shown in place** (blue info callout with icon):
- "Under 18: a parent or guardian signs every form."
- Whitening, for a patient whose birth date says under 18: the row is disabled with "Not for under 18: the product label says so."
- A patient on file with no birth date: every row is disabled with "Add their birth date first", linking to the record's Edit details. The minor rule cannot be applied without it.

**Other lines on the screen**
- In development, an unreviewed template shows an amber "Not reviewed yet (development only)" tag. In production it is not listed, and one quiet line says "More forms open once Flossify's dentist and lawyer have read their words."
- A running line at the end of the list (not fixed to the screen): "4 parts · about 10 minutes for the patient". The minutes are in `PAGE_MINUTES` (§3.1).
- Teal **Continue**. It POSTs `intent=consents` with `rev`.

### 1.4 Screen C, step 2: "The clinic's part" (`?step=clinic`)
**Common block at the top** (applies to every form, and each card can override it):
- **Dentist who explains.** A select of treating staff at this branch (`staff.role in ('owner','dentist','associate')`, `staff_access` here, not disabled).
  - Preselection order: the visit's dentist, else the signed-in person if they treat, else the only treating dentist.
  - A dentist without `prc_licence` shows an inline error with a link to People: "Dr Reyes has no PRC licence on file. Add it in Clinic settings → People."
- **Explained in:** English · Filipino · Other (a text field, at most 40 characters).
- **Interpreter** (optional, at most 120 characters).

**One card per chosen form**, in page order, with the template's `clinicFields` (§3.3), prefilled:
- **Teeth**: from the visit's and plan's lines for that kind. Shown as tooth pills and typed as FDI ("36, 37", read by `readTeeth`). A clinic whose `notation` is Universal sees the Universal number in brackets.
- **Estimate**: the fee guide rows that `consentsForCatalog` maps to this form are quick-fill chips, "From the fee guide: Simple extraction ₱1,500–₱2,500 per tooth". A tap fills from/to, multiplied by the number of teeth when the row is `tooth_scoped`.
- **Defaults** from the template, for example "A check-up in 7 days".

**On each card**
- A quiet **See it as the patient will** opens the same preview panel, now with the fields filled.
- **"I explained this to the patient today"** appears only when the signed-in person is the card's dentist. Ticked, it writes the attestation at hand-over (§4).
- Amber warnings, never blocking:
  - "The clinic's address is not in Clinic settings, so the form will print without it."
  - "Estimate left to the dentist: the form will say the cost is told before starting."

**Saving**
- Teal **Continue** POSTs `intent=clinic`, which runs `saveClinicPart`.
- A refused post returns with every value and one callout: "Nothing was saved. N things to fix:" with focus on load, as `new.astro` does.

### 1.5 Screen D, step 3: "Check" (`?step=check`)
- **"What {label | the patient} will see"**: an ordered list, each item with minutes and a *Change* link:
  - "Page 1 Patient information · 5 min"
  - "Page 2 Consent to examination and treatment · 2 min"
  - "Page 3 Local anaesthesia · lower left, lidocaine 2% with epinephrine · 2 min"
  - "Page 4 Tooth extraction · 36 simple · ₱1,500–₱2,500 · 3 min"
  - "Check and send · 1 min"
- **Who explains:** "Dr Ana Reyes · PRC 0123456 · in Filipino". Each form shows either "Dr Reyes will confirm on the record after they sign" or "Confirmed by you".
- **Device:** the two cards from Screen A in a compact form, switchable here.
- One blue line: "If the dentist has not explained a form yet, the patient can choose *Ask the dentist first* and sign it at the chair."
- The teal button:
  - **Show the QR code** POSTs `intent=live`, `device=phone`.
  - **Hand this device to {label | the patient}** POSTs `intent=live`, `device=tablet`. The line under it reads "This device will open the clinic's pages again only after you enter your password."

### 1.6 Screen E1, step 4 (phone): the QR on screen and live progress (`/patients/intake/<id>/`)

**The QR card** (white in both themes, so it scans):
- `qrSvg(url, { ecc: 'H', mark: true })` at 320px, never smaller than 280px.
- Under it: **For: Juan D.**, then "Only for this patient. Do not post or share it.", then "Scan with the phone's camera. Opens until 10:46."
- `url` is `https://flossify.ph/f/i/<token>/`, which is 51 bytes. That is QR version 6 at H, the largest that keeps the centre mark (`qr.ts`). This must be measured (§9).

**The progress panel.** Beside the QR from 64rem; under it on narrow screens.
- **Head:** a round initial avatar and "Juan D. · waiting to be scanned" (a blue dot plus the words).
  - Once claimed: "Juan D. is filling in on their phone · started 10:31 · 4 min". Once page 1 is done, the first name and last initial come from page 1 when there is no label.
  - Link state, as words plus a dot:
    - *Waiting to be scanned, until 10:46* (blue)
    - *Active 10 s ago* (green)
    - *Idle 6 min* (amber)
    - *Closed after 20 minutes idle* (amber)
    - *Expired* (amber)
- **Parts**, one line each, with a tag of words and a dot. Colour is never the only signal.

  | Tag | Colour |
  |---|---|
  | Not started | grey |
  | Filling in | blue |
  | Done 10:34 | green |
  | Reading · 1 min | blue |
  | Has a question | amber |
  | Signed 10:36 | green |
  | Did not agree 10:44 | soft red |
  | Will ask the dentist | amber |
  | Sign again (the clinic changed it) | amber |

- **Alerts**, one line each with one action:
  - "Asked a question about Tooth extraction" → **Seen** (quiet)
  - "Did not agree to Tooth extraction. The dentist should talk to them."
  - "Under 18: a parent is signing (Maria dela Cruz, mother)"
  - "Possible match on file: Juan S. dela Cruz, P-0132." Computed from page 1 with `likelyMatches`. A mobile number alone is never shown as the strong match.
  - "Link not opened yet" → **Show the code again**
- **Actions** (all quiet; this screen has no teal button until Send):
  - **Show the code again**: a new token; the old one retires as `replaced`.
  - **Use this device instead**: retires the phone link as `switched` and goes to hand-over.
  - **Change the clinic's part**: retires the link as `stopped`, returns to step 2, and needs a new code afterwards.
  - **Stop** (asks first): cancels the intake and its unsigned documents.
- **Never on this panel:** health answers, the address, the mobile, a signature or any typed answer. Front-desk monitors face the waiting room.
- **Refresh:**
  - While the tab is visible, the script GETs `status/` every 4 s. It swaps the QR for progress by toggling the `hidden` attribute and announces changes in an `aria-live="polite"` region (`data-ik-live`).
  - Without the script there is a quiet **Refresh** link.
  - After 3 failed polls: "Connection lost at 10:41. The patient's saved pages are safe."

### 1.7 Screen E2, step 4 (tablet): hand-over
The teal button on Screen D does all of the following in one POST:
1. Makes a tablet link.
2. Claims it with this browser's device secret.
3. Sets `fl_park`.
4. Redirects to `/f/i/<token>/`.

The patient then holds the device (§2). On that first render, the patient page's inline script deletes every `flossify-record-*` cache, the one record copy `sw.js` keeps.

The thank-you screen has one quiet button, **For the clinic**. It goes to `/c/<slug>/patients/intake/<id>/`, which leads to the unlock page because the session is parked.

**Unlock** (`/c/<slug>/unlock/`) is the staff entrance card:
- "This device was handed to a patient. Enter your password to go back to the clinic's pages."
- The name is shown, with a password field of 50px at 16px and a **Show** button.
- Teal **Unlock**. Quiet "Not you? Sign out".
- It follows the staff entrance rules: the password empties on a miss, the cursor goes back into it, there is a Caps Lock line, and the `login:e:` limits apply.

### 1.8 Screen F: "Add to the records" (the same URL once the intake is Sent)
- **"Juan dela Cruz sent everything at 10:48."** Then the parts with their final tags.
- **Look-alikes** (`likelyMatches` on page 1's name, birth date and mobile, top 5). Each shows name, birth date, chart no., mobile and last visit, with a quiet **Add to {name}'s record**.
  - When the strongest match has the same name and birth date, that button is teal and *Add as a new patient* is quiet. This is the forms queue's rule.
- **Add as a new patient** (teal when there is no strong match):
  - With look-alikes shown, it must carry `confirm_new=<ids of every look-alike>`, as `new.astro` does ("It is someone else: add as new").
- **Adding to a patient on file** opens a confirm side panel (the forms' `Confirm.astro`):
  - It fills only empty fields and never a name.
  - The mobile and email are used only if ticked.
  - Each differing detail is listed with *Use* (`compareWithRecord`, `TAKEABLE`).
- On success the desk lands on the record `?saved=intake&intake=<id>`. A green callout reads "Juan is added. 3 consent forms signed, 1 to sign at the chair." (§7).

### 1.9 The intake list and the Dashboard card
- **`/c/<slug>/patients/intake/`** is the list of intakes, for `records.edit` only. It has three groups:
  - **Sent: add to the records** (status `sent`)
  - **Filling in now** (status `out`)
  - **Not finished** (status `preparing`, "deleted 24 h after it was started", with the time left)
  - Each row: label or name, device, parts done x/y, started by, time, and **Open**.
  - Its POST `intent=start` is the one creation endpoint (§5.2).
- **Dashboard:** a compact **Patient forms in progress** card above *Your tasks*, shown when any intake is `out` or `sent`. It lists the first three and **See all**.
- **`inboxFor(…, staffId)`** gains `intakes`, the count of sent intakes, for people with `records.edit`. It also drives the Patients tab dot.

---

## 2. The patient flow (`/f/i/<token>/`)

### 2.0 The shell
- **The frame:** the `/f/` glass pattern with `ClinicRoom` behind (the clinic's own cover, or the soft blur) and `ClinicBadge`. There is no site nav and no `PatientHeader`: a slim bar holds the clinic's initials, its name, "Part 3 of 5" and a quiet **Ask the desk** (it only says "Please tell the desk you have a question").
- **The document card** that holds consent text is near-opaque paper: `--c-surface` at 97% and slate ink, with the charcoal card in dark mode.
  - Every line is measured composited over all-black, all-white, harsh stripes and no photo, as the ClinicRoom rule requires.
  - Consent body text is 17px/1.6 with a 68ch measure. Filipino lines carry `lang="fil"`, sit in ink-2, and are never under 16px.
- **Headers:** no-store, `X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer` (also as a meta tag), so the token never rides a Referer.
- **Motion** always on: step changes slide as the site's rises do.
- **Every screen is a form POST** to the same URL with `at=<screen>` and `intent`.
  - Success redirects 303 to the next screen.
  - An error re-renders with the answers and a 422.
  - A CSRF miss re-renders with the answers and a 403, never a redirect.
  - With the script, posts go by `fetch` with `X-Intake-Script: 1` and get JSON `{ next }` or `{ errors }`. On a network failure the screen stays as typed (the signature too) and says: "No connection. Your answers on this screen are still here. Press Continue again when the line is back."
  - Nothing is ever put in `localStorage`, `sessionStorage` or the URL.
- **Shared-device hygiene** is copied from `/f/[key].astro`:
  - The inline `pageshow` / back-forward script hides a restored page and reloads it. The server then answers from the link's state, "finished" after Send.
  - Forms are `autocomplete="off"` except the contact fields' own tokens (the `_Field` rule).
  - The honeypot `HONEYPOT_FIELD` is on every form.
- **Screens** are `welcome`, `you`, `contact`, `health`, `privacy`, `c<sort>` (one per consent page), `check` and `done`. A GET without `at` opens the first unfinished screen.

### 2.1 Welcome
- "Hello. {Clinic} would like you to fill in **4 short parts**, about 10 minutes."
- The parts are listed with their tags (Not started · Done · Signed).
- "Your answers go only to {Clinic}."
- "Prefer paper? Ask the desk."
- Teal **Start**.
  - On a phone, Start is the claim: `intake_claim` sets `fl_idev` (httpOnly, Secure, SameSite=Lax, `Path=/f/i/<token>/`, 24 h). A second device gets "These forms are already open on another phone. Ask the desk for a new code."
  - A tablet link was claimed at hand-over.
- Before the claim this screen shows only the clinic's face and the number of parts. It never shows the label or a name.

### 2.2 Page 1: Patient information (new patients only)
Four screens, one topic each. The field definitions are the forms' own `FieldDef`s from `STEPS`, referenced by name, so wording, `ShowIf`, `need` sentences and the server parser are shared.

The form version is `INTAKE_FORM_VERSION = 'intake-2026-10'` (§5.1).

| Screen | Fields (all from `STEPS`) | Dropped from the poster forms, and why |
|---|---|---|
| `you`: About you | `first_name`, `middle_name`, `last_name`, `suffix`, `birth_date`, `sex`, `occupation` (18+, optional) | `civil_status`: not a patient column, not needed |
| `contact`: How to reach you | `mobile`, `email`; `address`, `city`, `province`; section `guardian` (under 18: `guardian_name`, `guardian_relation`, `guardian_mobile`, `guardian_is_emergency`); section `emergency` | `facebook`: not needed (data minimisation) |
| `health`: Your health | the whole `health` step: general, medicines, allergies, habits, pregnancy (not male, 12+), numbers (folded), conditions | — (anaesthesia and extraction depend on it) |
| `privacy`: Cards and privacy | `hmo`, `hmo_other`, `hmo_card_no` (folded: "Have an HMO card?"); the privacy notice summary, DPO and a `/privacy/` link; hidden `privacy_version`; the `consent_privacy` tick (`PRIVACY_TICK`; for a minor, "I, the parent or guardian, agree …") | `teeth` step, PhilHealth PIN, `hmo_company`: not needed for intake |

- **Each screen's POST is parsed by `parseScreen`** (§5.1). It reads only that screen's fields on the server whatever the script did, with `ShowIf` evaluated against the draft plus this post. It then calls `intake_save_page1`.
- **The `privacy` screen re-validates the whole of page 1** with `parseForm(INTAKE_DEF, merged)`, which the definer checks again (§4). Only then is page 1 done.
- **Changing an earlier screen after page 1 is done** makes the patient pass the privacy screen again.
- **If who they are changes** (any name part, birth date, or guardian name or relation) after a consent page was signed, those signatures are cleared and the pages say "Sign again: your details changed."

### 2.3 Consent pages (pages 2, 3, 4 …)

**Order:** general 10 · anaesthesia 20 · extraction 30 · root canal 40 · restoration 50 · periodontal 60 · denture 70 · implant 80 · ortho 90 · whitening 100 · photos 200. The order comes from `Template.order` and is never chosen by the desk.

**Anatomy of every page, top to bottom**
1. **Head.**
   - The pill "Part 3 of 5 · Consent form".
   - `h1` with the English title, and the Filipino title under it in `lang="fil"`.
   - "Explained by Dr Ana Reyes · PRC 0123456 · in Filipino (interpreter: …)".
   - A small grey line: "Form extraction-2026-10 · CF-7K2FQ".
2. **"For" box** (white, hairline): the patient's full name, birth date and age, and "Signed by: Maria dela Cruz, mother" when the patient is a minor. Then the facts from the clinic's part as pills (teeth in `rp-tooth` blue, type, estimate) and today's date (Manila).
3. **"In short"** (a blue-tint callout with an icon, bilingual): at most five bullets. What will be done · why · the main risks · the other choices, including no treatment · the cost.
4. **The full text** under fixed headings, in this order:
   - What we will do · Why · Risks (common, then "less common but serious", one line each) · the template's special sections · Other choices · If you do not have it · Before and after · Cost · Your rights.
   - The page itself scrolls; there is never an inner scroll box.
   - A section with `initials: true` ends with an **Initials** box: 1 to 4 letters, 56px tall, `autocomplete="off"`, the same letters in every box of one page.
5. **Patient questions** (`patientFields`): for example "Do you want to keep the tooth?", whitening's screening questions, or photos' choices.
6. **Ticks.** Each is a 56px row with a 26px box, the English line with the Filipino under it. Procedure forms have:
   - *explained*: "Dr {dentist} explained this to me in words I understand, and my questions were answered."
   - *risks*: "I understand the risks above, and that no one can promise a particular result."
   - *history*, on anaesthesia, extraction, periodontal and implant.
   - All ticks are needed to agree. They are not needed to refuse or to ask first.
7. **Decision.** Three radio cards:
   - **I agree** (`decisionWords.agree`, bilingual)
   - **I want to ask the dentist first**
   - **I do not agree** (`decisionWords.refuse`, bilingual; an optional "Why? (optional, at most 200 characters)")
   - Photos has only *These are my choices* and *Ask first*.
8. **Who signs** (for agree or refuse):
   - The name is prefilled from page 1 (the patient, or the guardian for a minor) or from the record, and editable.
   - Under 18, only *A parent or guardian* is offered, with a relation field (at most 60 characters) and an authority choice:
     - Parent · Court-appointed guardian · Grandparent, brother or sister over 21, or another adult caring for the child, when the parents cannot sign.
     - The last choice requires "Why the parents cannot sign" (at most 200 characters).
     - The guardian's statement is shown above the pad (§3.2).
   - An adult may be signed for by a representative, with the relation and "Why the patient is not signing" required.
9. **The meaning sentence**, right above the pad, generated by `meaningSentence` and part of the snapshot:
   - "By signing, I, Juan dela Cruz, agree to the extraction of tooth 36 by Dr Ana Reyes as described above. 29 Sep 2026."
   - For a guardian: "… I, Maria dela Cruz, mother of Juan dela Cruz, agree for him …". Use no pronoun, instead: "agree for Juan dela Cruz to …".
10. **The pad.** `SignPad.astro`, extracted from the 035 sign page: canvas on a white slip, a dashed line, a quiet *Clear*, a 1000×400 box, and strokes in a hidden field. There is a hint "Turn your phone sideways for more room."
11. **One teal button:** **Sign and continue**. The words follow the decision: **Continue** for ask-first, **Save my choices** for photos.
    - A missing piece is said on the page, in one alert, before posting. The server says it again.

**Two page events are recorded:**
- Opening the page calls `intake_mark_page(…, 'opened')`, which records `opened_at`.
- Choosing *ask first* and pressing Continue marks `question` (the desk sees it), then records the page as `later`.
- Time spent reading is `decided_at − opened_at`, measured on the server.

**Refused.** "I do not agree" is signed like consent and becomes a signed informed refusal (`decision = 'refused'`). The page then says, in amber: "We have told the desk. The dentist will talk with you about what this means."

**Whitening stop answers.** Pregnant or could be · smokes or drinks often · a filling or crown in the last 2 weeks. On any of these, the page removes *I agree* and says "Please talk to the dentist before whitening. The product label says it is not for …". Under 18 the whole page is blocked the same way.

### 2.4 Check and send
- "Patient information · Done" with *Change*. Then each consent: "Signed 10:36", "Did not agree 10:44" or "Will ask the dentist", each with *View* (the page read-only) and *Change* (re-open it).
- This is the WCAG 3.3.4 confirmation. Nothing is final before it.
- Teal **Send to {Clinic}** posts `NONCE_FIELD` for idempotency (`intake_send`).
- If anything is unfinished, the button stays and a list says what to finish, with links.

### 2.5 Done
- **Phone:** "Thank you, Juan. Please tell the desk you are finished. You can close this page."
- **Tablet:** "Thank you, Juan. Please hand the tablet back to the clinic." After 20 s it clears to a neutral "Please hand this tablet to the clinic" with no name. The quiet **For the clinic** button leads to unlock.
- It shows no reference, no answers and no record. After Send the link is retired, so Back or a reload shows only "These forms are finished."
- **The patient's copy** is printed at the desk (§3.6). It is never sent by a link in a text (CLAUDE.md), and `/me/` is later work.

---

## 3. The consent library

### 3.1 Shape (`src/lib/consent-library.ts`, no Node imports, so the page scripts may import it)

```ts
export type Code = 'anaesthesia' | 'extraction' | 'root_canal' | 'restoration' | 'periodontal'
                 | 'denture' | 'implant' | 'ortho' | 'whitening' | 'photos';
export interface Bi { en: string; fil?: string }               // fil only where drafted; shown only when reviewed (§3.8)
export type Run = string | { f: string } | { dentist: true } | { patient: true };  // f = a clinic or patient field
export interface Line { en: readonly Run[]; fil?: readonly Run[] }
export type Cond =
  | { f: string; in: readonly string[] }                       // a clinic field's answer
  | { teethIn: readonly number[] }                              // any chosen tooth is one of these (FDI)
  | { minor: boolean } | { all: readonly Cond[] } | { not: Cond };
export interface Section {
  id: string; head: Bi;
  role: 'what' | 'why' | 'risks' | 'rare' | 'special' | 'choices' | 'without' | 'care' | 'cost' | 'rights' | 'records';
  lines: readonly Line[];                                        // one paragraph or one list item per line
  list?: boolean; when?: Cond; initials?: true;
}
export type ClinicKind = 'teeth' | 'choice' | 'choices' | 'text' | 'number' | 'range' | 'money' | 'yesno';
export interface ClinicField {
  name: string; kind: ClinicKind; label: string; forBox?: string; // forBox: its label in the "For" box and print
  required?: boolean; choices?: readonly Choice[]; other?: { max: number };
  min?: number; max?: number; maxTeeth?: number; allowLater?: boolean;   // money: "the dentist tells you"
  prefill?: 'plan_teeth' | 'fee_guide' | { value: unknown }; when?: Cond; help?: string;
}
export interface PatientField {
  name: string; kind: 'yesno' | 'yesnounsure' | 'choices'; label: Bi; required?: boolean;
  stop?: readonly string[];                                      // answers that remove "I agree" (whitening)
  choices?: readonly (Choice & { fil?: string })[]; when?: Cond;
}
export interface Template {
  code: Code; version: string;                                   // a consent_version id of kind 'document'
  title: Bi; checklist: string; group: 'numbing' | 'treatment' | 'records';
  order: number; minutes: number; attest: boolean;
  minors: 'guardian' | 'not_under_18'; validDays: number | null;
  decisions: readonly ('agreed' | 'refused')[];                  // photos: ['agreed']
  clinicFields: readonly ClinicField[]; patientFields: readonly PatientField[];
  inShort: readonly Line[];                                      // ≤ 5
  sections: readonly Section[];
  ticks: readonly TickId[];
}
export const TEMPLATES: Readonly<Record<string, Template>>;       // by version id
export const PAGE_MINUTES = { page1: 5, check: 1 } as const;
export function generalTemplate(versionId: string): Template | null;   // wraps TREATMENT_CONSENT (§3.4 G)
export function consentsForCatalog(code: string | null, name: string | null, category: string | null): Code[];
export function readClinicPart(t: Template, raw: RawValues, ctx: { minor: boolean | null }): { fields: Fields; errors: Record<string, string> };
export function readPatientPart(t: Template, raw: RawValues, ctx: { minor: boolean }): { answers: Answers; initials: string | null; errors: Record<string, string>; stopped: string | null };
export function renderDocument(t: Template, fields: Fields, ctx: RenderCtx): Rendered;   // pure; the one renderer
export function meaningSentence(r: Rendered): string;
```

- `Template` is pure data with no functions, so `libraryHash(t)` in §3.7 is stable.
- `consentsForCatalog` builds on `kindForCatalog` from `aftercare.ts`:

  | Kind or words | Codes |
  |---|---|
  | `extraction`, `surgical_extraction` | `['extraction','anaesthesia']` |
  | `root_canal` | `['root_canal','anaesthesia']` |
  | `filling`, `crown` | `['restoration']` (anaesthesia "often") |
  | `denture` | `['denture']` |
  | `braces_adjustment` | `['ortho']` (only when no signed ortho document) |
  | `whitening` | `['whitening']` |
  | `cleaning` | `[]` (the general consent covers it) |
  | `/implant/` | `['implant','anaesthesia']` |
  | `/root planing\|deep scal\|periodont\|curettage/` | `['periodontal','anaesthesia']` |

### 3.2 Shared words (`SHARED`)
The Filipino text is the research's draft. A native-speaking dentist and a translator review it before it shows in production (§3.8).

| Id | English | Filipino |
|---|---|---|
| `explained` (tick) | Dr {dentist} explained this to me in words I understand, and my questions were answered. | Ipinaliwanag sa akin ni Dr {dentist}, sa mga salitang naiintindihan ko, ang gamutang ito, at nasagot ang aking mga tanong. |
| `risks` (tick) | I understand the risks above, and that no one can promise a particular result. | Naiintindihan ko ang mga panganib sa itaas, at na walang makapangangako ng tiyak na resulta. |
| `history` (tick) | I told the clinic truthfully about my health, medicines and allergies, and will tell them if anything changes. | Tapat kong sinabi sa klinika ang tungkol sa aking kalusugan, mga gamot, at mga allergy, at sasabihin ko kung may magbago. |
| `rights` (text) | You may say no, or change your mind and stop at any time. The dentist will tell you what stopping may mean for your teeth. You may ask for a second opinion. | Maaari akong tumanggi, o magbago ng isip at ipahinto ang gamutan anumang oras; sasabihin sa akin ng dentista kung ano ang maaaring mangyari sa aking ngipin kapag itinigil ito. |
| `unexpected` (text) | If the dentist finds something unexpected, they stop and explain before doing more, unless stopping would put you at risk. | Kung may matuklasang hindi inaasahan ang dentista, hihinto muna siya at magpapaliwanag bago gumawa ng iba pa, maliban kung makasasama sa akin ang paghinto. |
| `cost` (text) | The estimated fee is {estimate}. {includes} If it changes, the clinic tells you first. | Sinabi sa akin ang tinatayang bayad na {estimate} at kung ano ang kasama rito. Kung magbabago ang halaga, sasabihin muna ito sa akin ng klinika. |
| `cost_later` (text) | The dentist tells you the cost before starting, and nothing starts until you agree to it. | Sasabihin ng dentista ang halaga bago magsimula, at walang sisimulan hangga't hindi ako pumapayag. |
| `agree` | I agree to the treatment described above. | Pumapayag ako sa gamutang nakasaad sa itaas. |
| `refuse` | I do not agree to the treatment described above, and I understand what may happen without it. | Hindi ako pumapayag sa gamutang nakasaad sa itaas, at naiintindihan ko ang maaaring mangyari kung hindi ako magpapagamot. |
| `guardian` (above the pad) | I am the patient's parent or legal guardian, and I have the right to consent for them. | Ako ang magulang o legal na tagapag-alaga ng pasyente, at may karapatan akong pumayag sa kanyang gamutan. |
| `attest` (the dentist) | I explained the above to the patient (or parent or guardian), answered their questions, and believe they understood. | Ipinaliwanag ko ang nasa itaas sa pasyente (o sa kanyang magulang o tagapag-alaga), sinagot ko ang kanilang mga tanong, at naniniwala akong naintindihan nila ito. |
| labels | Patient's full name · Date of birth · Signature of the patient · Signature of the parent or legal guardian · Relation to the patient · Dentist (name and PRC licence no.) · Interpreter · Date and time | Buong pangalan ng pasyente · Petsa ng kapanganakan · Lagda ng pasyente · Lagda ng magulang o legal na tagapag-alaga · Relasyon sa pasyente · Dentista (pangalan at numero ng lisensiya sa PRC) · Tagapagsalin · Petsa at oras |

**Every procedure form ends with the same sections:** Other choices (always including *No treatment*, which cannot be removed) · If you do not have it · Cost · Your rights (`rights` + `unexpected`).

### 3.3 Clinic field types and validation (`readClinicPart`)
Every value is read with `visibleOnly` and `oneLine` on the server, whatever the page sent.

| Kind | Stored as | Rules |
|---|---|---|
| `teeth` | `number[]` FDI, sorted, unique | `readTeeth`; each `isFdi`; 1..`maxTeeth` (default 16); `required` means at least 1 |
| `choice` | `string` | one of `choices` (plus `other` text ≤ `other.max` when "other") |
| `choices` | `string[]` | each of `choices`; ≤ choices.length; `none` exclusive |
| `text` | `string` | 1..`max` (default 160) |
| `number` | `integer` | `min`..`max` |
| `range` | `{from, to}` integers | `min` ≤ from ≤ to ≤ `max` |
| `money` | `{kind:'amount'\|'range'\|'later', from?, to?, includes?}` centavos | from ≥ 0, to ≥ from, ≤ ₱5,000,000; `includes` ≤ 160; `later` only when `allowLater` |
| `yesno` | `'yes'\|'no'` | — |

- **Every non-photos form** also carries `dentist_id` from the common block, checked against the treating-staff list with a PRC licence required. It carries `explained_in` and `interpreter` too.
- **`fields` holds only the declared names** (unknown keys dropped) and is at most 8 KB.
- **A field whose `when` is false** is stored as null and is not required.

### 3.4 The forms

**G. Consent to examination and treatment**: `treatment-2026-09` (kind `treatment`, already in force, already live)
- The words are `TREATMENT_CONSENT['treatment-2026-09']`, unchanged. Its six points become six sections, and its tick is the only tick.
- **Clinic fields:** none required. `dentist_id` is optional, and when set the head says "Explained by …".
- **Attestation:** no.
- **Filipino:** none in this version. Adding Filipino means a new treatment version with reviewed words (open question 5).
- **Minors:** guardian. **Minutes:** 2.

For the forms below, *Risks* lists common first, then **less common but serious**, one line each. Numbers marked *(review)* come from the research catalogue's sources. The reviewing dentist keeps or removes them before `CONSENT_REVIEWED` lists the form.

**1. `anaesthesia-2026-10`: Consent to local anaesthesia / Pahintulot sa pampamanhid (local anaesthesia)**
- **Group** numbing · **order** 20 · **minutes** 2 · **attest** yes · **minors** guardian · **valid** 180 days · **ticks** explained, risks, history.
- **Clinic fields:**
  - `area` (teeth, `prefill: plan_teeth`) or `area_text` (text ≤ 80); one of the two is required.
  - `technique` (choice): infiltration · nerve block (for example, the lower jaw) · the dentist decides at the visit.
  - `agent` (choice + other ≤ 60): lidocaine 2% with epinephrine 1:100,000 · mepivacaine 3% plain · articaine 4% with epinephrine 1:100,000.
  - `risk_factors` (choices): heart disease · high blood pressure · pregnant or may be · a reaction to numbing before · blood thinners · none noted.
- **What:** An injection numbs {area}. Lips, cheek and tongue stay numb for a few hours.
- **Why:** So the treatment does not hurt.
- **Risks** (initials):
  - Common: soreness or bruising where the needle went in; a stiff jaw for a few days; a fast heartbeat or feeling shaky for a few minutes (the epinephrine); feeling faint; numbing sometimes does not work fully, most often on an infected tooth.
  - Less common: biting or burning the numb lip, cheek or tongue (children most of all); harder to control swallowing while numb; rarely an allergic or severe reaction needing emergency care; rarely numbness or tingling that lasts weeks or months, and very rarely for good (nerve injury).
- **Things that raise the risk for you:** {risk_factors} (shown only when ticked).
- **Other choices:** no numbing (the treatment may hurt); numbing gel only, for minor care; sedation or general anaesthesia elsewhere, by referral.
- **Afterwards:** while numb, do not bite, suck or scratch your lip, cheek or tongue, and avoid very hot food and drink. A child is watched until the numbness goes.
- **In short (FIL):**
  - "Pamamanhirin ang bahaging gagamutin gamit ang pampamanhid (local anesthesia). Mananatiling manhid ang labi, pisngi o dila nang ilang oras."
  - "Habang manhid, huwag kagatin, sipsipin o kamutin ang labi, pisngi o dila, at iwasan ang napakainit na pagkain o inumin."
  - "Maaaring magkapasa o sumakit ang tinurukan, bumilis ang tibok ng puso, o mahirapang ibuka ang bibig nang ilang araw. Bihira ang allergy. Bihira rin ang pamamanhid na tumatagal nang ilang linggo o buwan, at napakabihirang permanente."

**2. `extraction-2026-10`: Consent to tooth extraction and oral surgery / Pahintulot sa pagbunot ng ngipin at operasyon sa bibig**
- **Group** treatment · **order** 30 · **minutes** 3 · **attest** yes · **minors** guardian · **valid** 180 days · **ticks** explained, risks, history.
- **Clinic fields:**
  - `teeth` (required, `plan_teeth`).
  - `type` (choice): simple · surgical (the gum is opened, some bone may be removed, the tooth may be cut in parts, stitches).
  - `reason` (choice + other ≤ 120): decay that cannot be repaired · infection · gum disease · crowding or braces · a wisdom tooth causing problems · a broken tooth.
  - `xray` (choices): root near the nerve canal · root near the sinus · curved or joined roots · none noted.
  - `risk_factors` (choices): smokes · blood thinners · bone medicines (bisphosphonate or denosumab) · radiotherapy to the head or neck · diabetes · none noted.
  - `follow_up` (text ≤ 120, default "A check-up in 7 days").
  - `estimate` (money, `fee_guide`, `allowLater`).
- **Patient fields:** `keep_tooth` (yesno): "Do you want to keep the tooth?" / "Gusto mo bang itabi ang ngipin?"
- **What:** Remove tooth {teeth} ({type}). Stitches if needed. You get an aftercare sheet.
- **Why:** {reason}.
- **Risks** (initials):
  - Common: pain, swelling, bruising and some bleeding for a few days (more with blood thinners); a stiff jaw and sore mouth corners; dry socket, a painful socket a few days later, more common in smokers and after lower wisdom teeth; infection.
  - Less common: damage to a nearby tooth, filling or crown; a small root tip left when removing it is riskier; nerve injury (numbness or tingling of lip, chin or tongue), usually temporary and rarely permanent; rarely a broken jaw; swallowing or breathing in a piece of tooth; bone that heals slowly or not at all with bone medicines or after radiotherapy.
- **Upper back teeth** (`when: { teethIn: [14–18, 24–28] }`): an opening into the sinus may happen and may need more treatment.
- **Wisdom teeth** (`when: { teethIn: [18, 28, 38, 48] }`, initials): the nerves to the lip, chin and tongue run close to lower wisdom teeth. After removing a lower wisdom tooth, about 1 in 100 people are left with numbness that does not go away *(review: NHS Sussex leaflet, AAOMS)*. Dry socket is more likely. A gum pocket may stay behind the next tooth. Risks rise with age.
- **Findings on your X-ray:** {xray} (shown when not "none noted"). **Things that raise the risk for you:** {risk_factors}.
- **Other choices:**
  - keep the tooth and watch it;
  - a root canal and crown to save it, where possible;
  - medicine or draining (only for now);
  - for a wisdom tooth on the nerve, removing only its crown (coronectomy);
  - an oral surgeon;
  - no treatment.
  - "After removal, the gap may need an implant, bridge or denture, at extra cost."
- **If you do not have it:** pain, infection or swelling may spread; a cyst; damage to the next tooth; harder surgery later.
- **Afterwards:** follow the aftercare sheet. No smoking, spitting or straws for 24 to 48 hours. {follow_up}.
- **In short (FIL):** the research's F03 lines ("Pagkatapos ng bunot …", "dry socket …", "maliit na dulo ng ugat …", "sinus …", "nerve … 1 sa 100 …").

**3. `root-canal-2026-10`: Consent to root canal treatment / Pahintulot sa root canal (paggamot sa ugat ng ngipin)**
- **Group** treatment · **order** 40 · **minutes** 3 · **attest** yes · **valid** 180 days · **ticks** explained, risks.
- **Clinic fields:**
  - `teeth` (required, `maxTeeth: 1`).
  - `diagnosis` (choice + other): an inflamed nerve that will not heal · a dead nerve with infection · an abscess · an old root canal that is failing (redo).
  - `visits` (number 1–4, default 2).
  - `after` (choice): a filling · a crown · a post and crown.
  - `estimate` (money).
  - `estimate_after` (money, `allowLater`, label "The {after}, a separate fee").
  - `specialist` (yesno, default yes → "You may ask to see a root canal specialist (endodontist).").
- **What:** Open tooth {teeth}, remove the nerve, clean, medicate and fill the canals, over {visits} visits. Then {after}.
- **Why:** Keep the tooth and ease pain or infection ({diagnosis}).
- **Risks** (initials):
  - Common: pain, swelling or tenderness for a few days.
  - Less common: a small instrument breaks in a canal; a hole through the side of the root; canals blocked or too curved to finish; filling material past the root end; a crack found during treatment; damage to an existing crown or filling; it may fail and need redoing, surgery at the root end, or removal; the tooth is weaker and may break without a crown.
- **How it usually goes:** "In large studies, about 9 in 10 root-treated teeth are still in place 4 to 10 years later, and a crown afterwards helps most." *(review: Ng et al. 2010. Never print "95% successful".)*
- **Other choices:** remove the tooth (then an implant, bridge, denture or a gap); watch it; a specialist; no treatment.
- **If you do not have it:** pain, an abscess, losing the tooth.
- **Afterwards:** come back for the {after}. Until then, chew on the other side.
- **Cost:** two lines, the root canal and the {after}.
- **In short (FIL):** the F04 lines.

**4. `restoration-2026-10`: Consent to fillings, crowns, bridges and veneers / Pahintulot sa pasta, crown, bridge at veneer**
- **Group** treatment · **order** 50 · **minutes** 2 · **attest** yes · **valid** 180 days · **ticks** explained, risks.
- **Clinic fields:**
  - `kind` (choices, required): filling · crown · bridge · veneer · inlay or onlay.
  - `teeth` (required).
  - `bridge_teeth` (teeth, `when: kind in [bridge]`, required there).
  - `material` (choice + other ≤ 60): tooth-coloured composite · glass ionomer · porcelain fused to metal · zirconia · lithium disilicate · full metal.
  - `temporary` (yesno, when crown, bridge, veneer or inlay).
  - `visits` (number 1–6).
  - `estimate`.
- **What:** Remove decay or the old filling and shape tooth {teeth}. For a crown, bridge, veneer or inlay: an impression or scan, a temporary, then the final one fitted after you approve its fit and colour.
- **Risks** (initials):
  - Common: sensitivity to cold, heat or biting, usually for days to weeks; a high bite or sore jaw that needs a small adjustment; a stiff jaw.
  - Less common: the nerve may get irritated and need a root canal; deeper decay found once work starts, needing a bigger filling or a crown; chipping, breaking or coming loose; new decay at the edges; a sore gum at the edge; the colour may not match exactly; swallowing or breathing in a crown during a try-in.
- **Crowns and bridges** (when): the temporary can come off, so come back promptly. Delaying the final crown lets teeth move. The teeth holding a bridge ({bridge_teeth}) are shaped down for good.
- **Veneers** (when): some enamel is removed and cannot be put back. A chipped veneer usually cannot be repaired. The colour cannot change after bonding. Biting nails or ice, or grinding, can loosen one, and a night guard may be advised.
- **Other choices:** no treatment; another material; a filling instead of a crown (less protection); removing the tooth; for a gap, an implant or denture; for looks, whitening, bonding or braces.
- **If you do not have it:** decay spreads, pain, losing the tooth.
- **Afterwards:** do not chew on a new filling until the numbness has gone.
- **In short (FIL):** the F05 lines.

**5. `periodontal-2026-10`: Consent to deep cleaning and gum treatment / Pahintulot sa malalim na paglilinis (deep scaling) at gamutan sa gilagid**
- **Group** treatment · **order** 60 · **minutes** 2 · **attest** yes · **valid** 180 days · **ticks** explained, risks, history.
- **Clinic fields:**
  - `areas` (choices): upper right · upper left · lower right · lower left · whole mouth.
  - `visits` (number 1–4).
  - `numbing` (yesno).
  - `extras` (choices): chlorhexidine mouthwash · antibiotic placed in the gum · none.
  - `recheck_weeks` (number 4–12, default 6).
  - `maintenance_months` (choice 3 · 4 · 6).
  - `estimate`.
- **What:** Remove tartar and bacteria below the gum and smooth the roots in {areas}, over {visits} visits.
- **Why:** Reduce the infection and slow bone loss.
- **Risks** (initials): swelling, soreness and bleeding for a few days; as the swelling goes down the gums shrink, roots show, gaps between teeth look bigger and food catches; sensitivity to hot, cold and sweets; teeth may feel loose at first (most firm up, not all); infection.
- **Results:** no guarantee. Smoking, diabetes and cleaning at home change the result. Without regular maintenance, gum disease usually comes back.
- **Other choices:** no treatment (the disease goes on and teeth can be lost); an ordinary cleaning only (it does not reach deep pockets); gum surgery or a periodontist; removing teeth that cannot be saved.
- **Afterwards:** brush and clean between your teeth every day. A recheck in {recheck_weeks} weeks, then maintenance every {maintenance_months} months.
- **In short (FIL):** the F07 lines.

**6. `denture-2026-10`: Consent to dentures / Pahintulot sa pustiso**
- **Group** treatment · **order** 70 · **minutes** 2 · **attest** yes · **valid** 365 days · **ticks** explained, risks.
- **Clinic fields:**
  - `arch` (choice): upper · lower · both.
  - `type` (choice): complete · partial acrylic · flexible · cast metal · immediate (worn right after extractions) · overdenture.
  - `extract_first` (teeth, optional).
  - `visits` (text, default "Impression, try-in, fitting, then adjustments").
  - `included` (text ≤ 160, default "Adjustments for 3 months after fitting").
  - `relines` (text ≤ 160, default "Relines after that are a separate fee").
  - `estimate`.
- **Risks and limits** (initials): weeks to get used to; sore spots and ulcers that need adjustment visits; speech changes at first; learning to eat again; looseness, most of all a lower complete denture; gums and bone shrink over time, so relines or a new denture are needed; immediate dentures need more adjustments and relines and are often temporary; the clasps of a partial denture can raise decay and gum problems on the teeth holding them; it may not support the lips and face as natural teeth did; it can break (do not glue it at home); smell or stains without daily cleaning.
- **Other choices:** no replacement (teeth drift, the bite collapses); a bridge; implants; an implant-held denture.
- **Afterwards:** come to every fitting and adjustment. {included}. {relines}.
- **In short (FIL):** the F06 lines.
- The PDA chart's "more than 30 days' delay may mean a remake" line is left out pending review (open question 9).

**7. `implant-2026-10`: Consent to dental implants / Pahintulot sa dental implant**
- **Group** treatment · **order** 80 · **minutes** 3 · **attest** yes · **valid** 180 days · **ticks** explained, risks, history.
- **Clinic fields:**
  - `teeth` (sites, required).
  - `timing` (choice): right after an extraction · after healing.
  - `graft` (choice): none · bone graft · sinus lift · both.
  - `scan` (yesno: a 3D scan (CBCT) was taken).
  - `healing_months` (number 2–9).
  - `restoration` (choice): crown · bridge · overdenture.
  - `made_by` (text ≤ 120, optional).
  - `estimate_surgery`, `estimate_restoration` (money).
  - `risk_factors` (choices): smokes · diabetes · bone medicines · grinding · radiotherapy · none noted.
- **What:** With numbing, the gum is opened, the bone prepared and the implant placed. After {healing_months} months a {restoration} is attached.
- **Risks** (initials):
  - Common: pain, swelling, bruising; infection.
  - Less common: the implant does not join the bone and is removed (a retry may be possible); nerve injury (numbness of lip, chin or tongue, lower jaw), temporary or permanent; an opening into the sinus (upper jaw); injury to nearby teeth; a graft that fails; rarely a broken jaw.
  - Later: gum recession or a grey edge showing; a loose screw; a chipped crown; infection around the implant with bone loss (peri-implantitis), in about 1 in 5 patients in studies *(review)*.
- **How it usually goes:** about 96 in 100 implants are still in place after 10 years in studies *(review: Howe 2019)*. Smoking, diabetes not under control and some bone medicines raise the risk of failure.
- **Other choices:** no replacement; a bridge; a removable denture; a resin-bonded bridge.
- **Afterwards:** clean around it like a tooth, with regular reviews. Photos and X-rays of the treatment are kept in your record.
- **Cost:** two lines.
- **In short (FIL):** the F10 lines.

**8. `ortho-2026-10`: Consent to braces and orthodontic treatment / Pahintulot sa braces / gamutang orthodontic**
- **Group** treatment · **order** 90 · **minutes** 3 · **attest** yes · **valid** 365 days · **ticks** explained, risks.
- **Clinic fields:**
  - `appliance` (choice): metal braces · ceramic braces · clear aligners · removable appliance · functional appliance.
  - `extractions` (teeth, optional).
  - `mini_screws` (yesno).
  - `months` (range 3–48).
  - `visit_weeks` (number 2–12).
  - `fees` (text ≤ 200: down payment and monthly adjustments).
  - `breakage` (text ≤ 160: a broken bracket or lost aligner).
  - `retainer` (text ≤ 120).
  - `estimate` (money, the total).
- **Risks** (initials): discomfort after adjustments; white spots and decay if teeth are not cleaned well; gum disease; roots may get shorter (this cannot be predicted); a tooth hurt in the past may lose its nerve; mini-screws can loosen, break or irritate; jaw joint problems can happen with or without braces; impacted teeth may not move; injury from the appliance, or swallowing a part; allergy to a material; treatment may take longer than planned, and fees may change; smoking worsens results.
- **Results:** teeth tend to move back, so retainers are worn long-term. No one can promise perfectly straight teeth for life. Wisdom teeth may push teeth.
- **Records:** X-rays, photos and models before, during and after are part of the treatment.
- **Other choices:** no treatment; limited treatment; crowns or veneers to hide crooked teeth; jaw surgery for a jaw problem (specialist).
- **Cost:** {estimate}; {fees}; {breakage}. Moving to another dentist may change fees and time.
- **In short (FIL):** the F08 lines.

**9. `whitening-2026-10`: Consent to tooth whitening / Pahintulot sa pagpapaputi ng ngipin**
- **Group** treatment · **order** 100 · **minutes** 2 · **attest** yes · **minors** `not_under_18` · **valid** 90 days · **ticks** explained, risks.
- **Clinic fields:**
  - `method` (choice): in the clinic · trays at home · both.
  - `product` (text ≤ 80).
  - `strength` (text ≤ 40, e.g. "hydrogen peroxide 35%").
  - `sessions` (number 1–10).
  - `shade_before` (text ≤ 20).
  - `wont_change` (teeth, optional; "fillings, crowns or veneers that will not whiten").
  - `estimate`.
- **Patient fields**, each with `stop`:
  - `pregnant` (yes/no/not sure; stop on yes or not sure)
  - `smoke_drink` (yesno: "Do you smoke or drink alcohol often?"; stop on yes)
  - `recent_work` (yesno: "A filling or crown in the last 2 weeks?"; stop on yes)
- **Before:** an examination, and treatment of decay and gum disease, come first. The product label says: not for anyone under 18; not while pregnant; not for people who smoke or drink often; not within 2 weeks of a filling or crown *(ASEAN Cosmetic Directive, Annex III labels)*.
- **Risks:** sensitive teeth, usually mild and short; sore gums from the gel.
- **Limits:** only natural teeth whiten. Fillings, crowns, veneers and dentures ({wont_change}) do not, and may need replacing to match, at extra cost. Results vary. The shade fades over time. White spots may look more visible for a while.
- **Other choices:** no treatment; cleaning and polishing; bonding, veneers or crowns.
- **In short (FIL):** the F09 lines.

**10. `photos-2026-10`: Consent to photos and use of records / Pahintulot sa litrato at paggamit ng rekord**
- **Group** records · **order** 200 · **minutes** 1 · **attest** no · **minors** guardian · **valid** until withdrawn · **decisions** `['agreed']` ("These are my choices") · **ticks** none.
- **Clinic fields:**
  - `photo_types` (choices): inside the mouth · face.
  - `uses` (choices, required): sharing with a specialist or laboratory for this treatment · teaching and journals without your name · the clinic's website or social media. These are the uses this clinic asks about.
- **Patient fields:**
  - One yes/no per offered use, `when` it was offered.
  - For social media, `face` (yesno) and `name` (yesno, default unticked).
  - Nothing is pre-ticked yes.
- **For your record** (text, not a choice): photos, X-rays and scans for diagnosis and your record are part of your care. The privacy notice covers them.
- **Your choices:** "Saying no to any of these does not change your care." Each use has its own yes and no (NPC Circular 2023-04: granular, no bundling, no "Required" on an optional item).
- **Withdrawing:** tell the clinic any time. It stops future use. What was already published or printed may not be recalled.
- **In short (FIL):** the F12 lines.

**Not in the library:**
- **Informed refusal** is not a form. It is the *I do not agree* decision on the form itself, signed.
- **Minor and guardian** is not a form. It is the signature block's rules (§2.3) plus the dentist's assent record (§4, `consent_attestation.assent`).
- **Sedation** is not offered (open question 8).

### 3.5 On screen
- **One renderer.** `ConsentDocument.astro` (`src/components/consent/`) draws a `Rendered` value in three modes:
  - `patient`: the page of §2.3, with inputs.
  - `preview`: read-only in a 390px box inside a `SidePanel` on the staff steps. This is not an iframe, because every page sends `frame-ancestors 'none'`.
  - `record`: read-only on the record, drawn from the snapshot.
- **Styles** live in `src/components/consent/consent.css`, inside `@layer components`: headings 18px/700 with 1.25rem space above, list items with 0.5rem gaps, the risk lists split under two sub-heads, the initials box right-aligned at the end of its section, Filipino lines in ink-2 under the English, and the "For" pills using the record's `.rp` classes.
- **Hooks** are `data-cd-*` and never collide with `data-ik-*` (desk) or `data-ip-*` (patient pages).

### 3.6 A4 print (`/c/<slug>/patients/<id>/consents/<doc>/print/`)
- **Source:** the latest signing's snapshot, or for paper the unsigned document. The print never re-renders from the library. Paper is black on white. Audit `consent.print`.
- **`@page`:** `size: A4; margin: 16mm 16mm 20mm`. Bottom-left page box: `"CF-7K2FQ · extraction-2026-10"`. Bottom-right: `"Page " counter(page) " of " counter(pages)`, checked in Chrome's print-to-PDF.
- **Head.**
  - Left: the clinic's name (13pt bold), then address and phone from the snapshot (9.5pt). No logo and no invented letterhead: only what Clinic settings holds.
  - Right: "Consent form CF-7K2FQ · Version extraction-2026-10 · English and Filipino".
- **Title:** 16pt English, then 12pt Filipino.
- **Patient box** (a two-column table): patient · born (age) · chart no. (printed from the record and labelled "from the record", outside the snapshot) · signed by and relation · explained by Dr, PRC · explained in, interpreter.
- **Body:**
  - The "For" facts table.
  - "In short" in a 0.5pt-ruled box.
  - Sections at 10.5pt with bullet lists, and initials printed at the section's end: "Initials: JDC".
  - Ticks as ☑ lines.
  - The decision as ☑ / ☐ lines.
  - Patient answers as a table.
- **Signature block** (`break-inside: avoid`, kept with the decision):
  - The strokes as SVG (`Signature.astro`).
  - Name, as whom, relation and authority.
  - "Signed 29 Sep 2026, 10:42, Manila, on the patient's phone" (or "on the clinic's tablet", or "on paper, 29 Sep 2026, recorded by …").
- **Dentist line:**
  - "Explained by Dr Ana Reyes, PRC 0123456. Confirmed in Flossify on 29 Sep 2026, 11:02." plus assent for ages 7–17.
  - Or "Not confirmed by the dentist yet."
- **Withdrawal line**, if any.
- **Evidence footer** (8pt; the hashes in IBM Plex Mono):
  - "One-time link made by Liza Santos (desk) · opened 10:39 · this page read for 2 min 10 s · signed 10:42 · sent 10:48."
  - "Fingerprint of the words (SHA-256): 3f9a…" (all 64 characters), and "Seal: …".
- **If the stored snapshot does not hash to its `snapshot_sha256`,** or the seal does not recompute (§5.4), the page shows a red callout, "This copy does not match its fingerprint. Do not use it as the original", and prints that line too.
- **Paper for signing** (*Print for signing on paper*, `records.edit`):
  - The same page with empty ☐ decision boxes, initials boxes, signature lines for the patient or guardian (name, relation) and the dentist, and a date line.
  - It sets `paper_printed_at`, which fixes the fields (§4), and audits `consent.paper_print`.

### 3.7 Freezing what was signed
- **`snapshotText(rendered)`** is `canonicalJson` of:

  ```
  { schema: 1, document, ref, version, code, library: <body_sha256|null>, langs,
    clinic: {name, address, phone}, patient: {name, birth}, dentist: {name, prc},
    explained_in, interpreter, title, for: [[label, text]…], in_short, sections: [{head, lines, initials?}],
    ticks: [{en, fil, ticked}], answers: [[label, text]…], fields: <the raw fields object>,
    decision, decision_words, signer: {name, as, relation, authority, note}, meaning, date }
  ```

  - Canonical means keys sorted, no whitespace, strings NFC, numbers as integers, and `fields` exactly as stored.
  - The server renders it at the moment of the decision, from the template, the document's fields and the patient's answers. It never comes from the browser.
- **The database hashes it.** The `consent_signing` trigger sets `snapshot_sha256 = sha256(convert_to(snapshot,'UTF8'))`. It also sets `seal_sha256 = consent_seal(snapshot_sha256, strokes, signed_on, signer name, signed_as, signed_at)`. Callers cannot supply either.
- **The draft is checked when the page is signed.** The definer checks the snapshot's `document`, `version`, `decision`, `fields` and signer name against the rows (§4).
- **Library words are pinned.** `consent_version.body_sha256` is `sha256(canonicalJson(template))`, which covers the words, labels and choices.
  - `templatesInForce()` offers a template only when its code hash equals the row's.
  - `consent-library.test.ts` fails when they differ, so editing the words of a version patients may have signed breaks the build.
  - A change of words is a new version id plus a new row (a new migration), in one change.

### 3.8 Review gate and versions
- **`CONSENT_REVIEWED`** in `src/lib/consent-library.ts`:

  ```ts
  export const CONSENT_REVIEWED: readonly { version: string; langs: readonly ('en' | 'fil')[]; by: string; on: string }[] = [];
  ```

  - In production a template is offered only when listed.
  - Filipino lines show only when `langs` includes `fil`. The English stays alone otherwise, and the snapshot records `langs`.
  - Development offers everything, with the amber "Not reviewed" tag.
  - The general consent (`treatment-2026-09`) is exempt; it is live today.
- **If the lawyer changes words** for any 039 version, those words ship under new ids (`-2026-11`, migration 040+). A 039 row whose words were never listed is simply never offered in production.

### 3.9 Clauses never used
- Liability waivers, and paying the clinic's attorney's fees or collection costs (Civil Code Arts. 6, 1171, 1172).
- Blanket authority ("any and all treatment deemed necessary", "any/all changes"). The narrow `unexpected` line replaces it.
- A pre-printed "I have no further questions".
- Precise success claims such as "95%".
- "Noncompliant patients may be dismissed".
- An optional item labelled "Required".
- The PDA page 1's Religion field.

---

## 4. Data model: `src/data/migrations/039_patient_intake.sql`

```sql
-- 039 — Add patient, step by step (docs/patient-intake-design.md).
--
--   - consent_version gains the kind 'document': one consent form of the library (anaesthesia, extraction … photos),
--     named by `code`, its words in src/lib/consent-library.ts under the same id, `body_sha256` the hash of those words.
--     The app still only reads consent_version (028): words change by migration only.
--   - intake: one "Add patient" the desk starts — the checklist, the clinic's part, page 1's answers as the patient
--     types them (drafts), and the desk's decision. NOT a patient: a new patient's intake waits until someone who may
--     edit records adds it. A patient on file's intake (consent forms only) completes when the patient sends it.
--   - intake_link: the one-time link a patient opens (flossify.ph/f/i/<token>/). 26 random characters (~129 bits);
--     claimed by the first device (its own secret cookie, hashed here); opens nothing 15 minutes after it was made if
--     nobody claimed it, 20 minutes after the claimed device was last seen, or once the intake is sent or stopped.
--   - consent_document: one consent form prepared for one patient: the template version and the clinic's fields.
--     Changeable only until it is signed or printed for paper.
--   - intake_page: the patient's draft of one consent page (their decision, signer, strokes, the rendered snapshot)
--     until they press Send. Written by the definer functions only.
--   - consent_signing: what was signed — the frozen snapshot of the words and fields, its SHA-256, a seal over the
--     snapshot, strokes, signer and time, the decision (agreed or refused). Insert-only: never changed or deleted by the app.
--   - consent_attestation: the dentist's "I explained this", once per document. Insert-only.
--   - consent_withdrawal: a patient withdrawing an agreement. Insert-only.
--   - intake_event: what happened when (made, opened, read, asked, decided, sent, stopped …). Never an answer.
--
-- The public side has no tenant: the definer functions below are the only way in, and the clinic, the intake and the
-- forms come from the token, never from the page. They never raise with a patient's answers in the error.
-- Retention (retention_purge): an intake not sent is deleted 24 hours after it was started, a sent one nobody added
-- 30 days after it was sent, with its drafts, links, events and the documents no patient holds.
-- Additive: new tables, nullable columns, one widened check each on consent_version and patient_consent.

-- ---------------------------------------------------------------------------
-- The consent library
-- ---------------------------------------------------------------------------
alter table consent_version add column if not exists code text;
alter table consent_version add column if not exists body_sha256 text;
alter table consent_version drop constraint if exists consent_version_kind_check;
alter table consent_version add constraint consent_version_kind_check check (kind in ('privacy', 'treatment', 'document'));
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'consent_version_document_shape') then
    alter table consent_version add constraint consent_version_document_shape check (
      (kind = 'document') = (code is not null)
      and (code is null or code ~ '^[a-z][a-z_]{1,30}$')
      and (kind <> 'document' or coalesce(body_sha256, '') ~ '^[0-9a-f]{64}$'));
  end if;
end $$;

create or replace function current_document_of(p_code text)
returns consent_version
language sql security definer stable set search_path = public as $$
  select * from consent_version
   where kind = 'document' and code = p_code and effective_from <= (now() at time zone 'Asia/Manila')::date
   order by effective_from desc, id desc limit 1
$$;

-- body_sha256: the value `npm run consent:hash` prints for the words in src/lib/consent-library.ts. The shape check above
-- refuses the placeholders, so this file cannot be applied until they are filled; consent-library.test keeps them equal.
insert into consent_version (id, title, summary, effective_from, kind, code, body_sha256) values
  ('anaesthesia-2026-10', 'Consent to local anaesthesia', 'An injection numbs the area for treatment: what it does, its risks and the other choices.', '2026-10-01', 'document', 'anaesthesia', '<hash:anaesthesia-2026-10>'),
  ('extraction-2026-10', 'Consent to tooth extraction and oral surgery', 'Removing a tooth: why, the risks (including nerves and the sinus), the other choices and the cost.', '2026-10-01', 'document', 'extraction', '<hash:extraction-2026-10>'),
  ('root-canal-2026-10', 'Consent to root canal treatment', 'Treating the inside of a tooth to keep it: the risks, the crown after it, the other choices and the cost.', '2026-10-01', 'document', 'root_canal', '<hash:root-canal-2026-10>'),
  ('restoration-2026-10', 'Consent to fillings, crowns, bridges and veneers', 'Repairing or covering teeth: the risks, the materials, the other choices and the cost.', '2026-10-01', 'document', 'restoration', '<hash:restoration-2026-10>'),
  ('periodontal-2026-10', 'Consent to deep cleaning and gum treatment', 'Cleaning below the gum: what to expect, the risks, maintenance and the cost.', '2026-10-01', 'document', 'periodontal', '<hash:periodontal-2026-10>'),
  ('denture-2026-10', 'Consent to dentures', 'Removable teeth: getting used to them, adjustments, relines, the other choices and the cost.', '2026-10-01', 'document', 'denture', '<hash:denture-2026-10>'),
  ('implant-2026-10', 'Consent to dental implants', 'Placing an implant and its crown: the risks, healing, care and the cost.', '2026-10-01', 'document', 'implant', '<hash:implant-2026-10>'),
  ('ortho-2026-10', 'Consent to braces and orthodontic treatment', 'Moving teeth: how long, the risks, retainers, the fees and the other choices.', '2026-10-01', 'document', 'ortho', '<hash:ortho-2026-10>'),
  ('whitening-2026-10', 'Consent to tooth whitening', 'Whitening natural teeth: who it is not for, the risks, the limits and the cost.', '2026-10-01', 'document', 'whitening', '<hash:whitening-2026-10>'),
  ('photos-2026-10', 'Consent to photos and use of records', 'Your choices about photos beyond your record: sharing, teaching, the clinic''s pages. Saying no does not change your care.', '2026-10-01', 'document', 'photos', '<hash:photos-2026-10>')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- The intake
-- ---------------------------------------------------------------------------
create table if not exists intake (
  id               uuid primary key default gen_random_uuid(),
  clinic_id        uuid not null references clinic(id) on delete restrict,
  ref              text not null check (ref ~ '^IN-[A-HJKMNP-Z2-9]{4}$'),
  -- 'new': page 1 and the consent forms; the desk adds it. 'existing': consent forms only, for patient_id.
  target           text not null check (target in ('new', 'existing')),
  patient_id       uuid references patient(id) on delete restrict,
  appointment_id   uuid references appointment(id) on delete set null,
  label            text check (label is null or char_length(btrim(label)) between 1 and 40),
  form_version     text not null check (char_length(form_version) between 1 and 40),
  answers          jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object' and octet_length(answers::text) <= 24576),
  page1_done_at    timestamptz,
  privacy_version  text references consent_version(id),
  privacy_at       timestamptz,
  status           text not null default 'preparing' check (status in ('preparing', 'out', 'sent', 'added', 'cancelled')),
  rev              integer not null default 0 check (rev >= 0),
  created_by       uuid not null references staff(id),
  created_at       timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  sent_at          timestamptz,
  send_nonce       text check (send_nonce is null or send_nonce ~ '^[A-Za-z0-9_-]{16,64}$'),
  decided_by       uuid references staff(id) on delete set null,
  decided_at       timestamptz,
  added_as         text check (added_as in ('new', 'existing')),
  cancelled_by     uuid references staff(id) on delete set null,
  cancelled_at     timestamptz,
  unique (clinic_id, ref),
  check (target = 'new' or patient_id is not null),
  check (target = 'new' or (answers = '{}'::jsonb and page1_done_at is null and privacy_version is null)),
  check ((privacy_version is null) = (privacy_at is null)),
  check (page1_done_at is null or privacy_version is not null),
  check ((decided_at is null) = (added_as is null)),
  check (status <> 'added' or (patient_id is not null and decided_at is not null)),
  check (status not in ('sent', 'added') or sent_at is not null),
  check ((status = 'cancelled') = (cancelled_at is not null))
);
create index if not exists intake_list on intake (clinic_id, status, created_at desc);
create index if not exists intake_patient on intake (clinic_id, patient_id) where patient_id is not null;
create index if not exists intake_purge on intake (created_at) where status <> 'added';

create or replace function intake_check() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.clinic_id <> old.clinic_id or new.ref <> old.ref or new.target <> old.target
       or new.created_by <> old.created_by or new.created_at <> old.created_at or new.form_version <> old.form_version then
      raise exception 'intake: that cannot change' using errcode = 'check_violation';
    end if;
    if old.status in ('added', 'cancelled') and new.status is distinct from old.status then
      raise exception 'intake: % is final', old.status using errcode = 'check_violation';
    end if;
    if new.status is distinct from old.status and not (
         (old.status = 'preparing' and new.status in ('out', 'cancelled'))
      or (old.status = 'out' and new.status in ('preparing', 'sent', 'added', 'cancelled'))
      or (old.status = 'sent' and new.status in ('added', 'cancelled'))) then
      raise exception 'intake: % cannot follow %', new.status, old.status using errcode = 'check_violation';
    end if;
    if old.patient_id is not null and new.patient_id is distinct from old.patient_id then
      raise exception 'intake: the patient is set once' using errcode = 'check_violation';
    end if;
  end if;
  if new.patient_id is not null and not exists (
       select 1 from patient p where p.id = new.patient_id and p.clinic_id = new.clinic_id and p.archived_at is null) then
    raise exception 'intake: the patient is not this clinic''s' using errcode = 'check_violation';
  end if;
  if new.appointment_id is not null and not exists (
       select 1 from appointment a where a.id = new.appointment_id and a.clinic_id = new.clinic_id and a.patient_id = new.patient_id) then
    raise exception 'intake: the visit is not this patient''s here' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists intake_check on intake;
create trigger intake_check before insert or update on intake for each row execute function intake_check();

-- ---------------------------------------------------------------------------
-- The one-time link
-- ---------------------------------------------------------------------------
create table if not exists intake_link (
  token         text primary key check (token ~ '^[a-hjkmnp-z2-9]{26}$'),
  clinic_id     uuid not null references clinic(id) on delete restrict,
  intake_id     uuid not null references intake(id) on delete cascade,
  device        text not null check (device in ('phone', 'tablet')),
  created_by    uuid not null references staff(id),
  created_at    timestamptz not null default now(),
  open_by       timestamptz not null default now() + interval '15 minutes',
  claimed_at    timestamptz,
  device_sha256 text check (device_sha256 is null or device_sha256 ~ '^[0-9a-f]{64}$'),
  last_seen_at  timestamptz,
  retired_at    timestamptz,
  retired_why   text check (retired_why in ('replaced', 'stopped', 'switched', 'cancelled', 'sent', 'idle', 'expired')),
  check ((claimed_at is null) = (device_sha256 is null)),
  check ((retired_at is null) = (retired_why is null))
);
create unique index if not exists intake_link_live on intake_link (intake_id) where retired_at is null;
create index if not exists intake_link_intake on intake_link (clinic_id, intake_id, created_at desc);

create or replace function intake_link_check() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from intake i where i.id = new.intake_id and i.clinic_id = new.clinic_id and i.status in ('preparing', 'out')) then
      raise exception 'intake_link: no open intake for it' using errcode = 'check_violation';
    end if;
    return new;
  end if;
  if new.token <> old.token or new.clinic_id <> old.clinic_id or new.intake_id <> old.intake_id or new.device <> old.device
     or new.created_by <> old.created_by or new.created_at <> old.created_at or new.open_by <> old.open_by then
    raise exception 'intake_link: a link cannot be changed' using errcode = 'check_violation';
  end if;
  if old.claimed_at is not null and (new.claimed_at is distinct from old.claimed_at or new.device_sha256 is distinct from old.device_sha256) then
    raise exception 'intake_link: a link is claimed once' using errcode = 'check_violation';
  end if;
  if old.retired_at is not null and (new.retired_at is distinct from old.retired_at or new.retired_why is distinct from old.retired_why) then
    raise exception 'intake_link: a retired link stays retired' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists intake_link_check on intake_link;
create trigger intake_link_check before insert or update on intake_link for each row execute function intake_link_check();

-- ---------------------------------------------------------------------------
-- A prepared consent form
-- ---------------------------------------------------------------------------
create table if not exists consent_document (
  id               uuid primary key default gen_random_uuid(),
  clinic_id        uuid not null references clinic(id) on delete restrict,
  ref              text not null check (ref ~ '^CF-[A-HJKMNP-Z2-9]{5}$'),
  version_id       text not null references consent_version(id),
  -- The intake it is signed through (it may move to a later one while unsigned: "Sign on this tablet").
  intake_id        uuid references intake(id) on delete set null,
  patient_id       uuid references patient(id) on delete restrict,
  appointment_id   uuid references appointment(id) on delete set null,
  fields           jsonb not null default '{}'::jsonb check (jsonb_typeof(fields) = 'object' and octet_length(fields::text) <= 8192),
  dentist_id       uuid references staff(id) on delete set null,
  -- As they were when prepared: a renamed or departed dentist does not change an old form.
  dentist_name     text check (dentist_name is null or char_length(btrim(dentist_name)) between 1 and 120),
  dentist_prc      text check (dentist_prc is null or char_length(btrim(dentist_prc)) between 1 and 20),
  explained_in     text not null default 'en' check (explained_in in ('en', 'fil', 'other')),
  explained_other  text check (explained_other is null or char_length(btrim(explained_other)) between 1 and 40),
  interpreter      text check (interpreter is null or char_length(btrim(interpreter)) between 1 and 120),
  sort             smallint not null check (sort between 1 and 999),
  rev              integer not null default 0,
  prepared_by      uuid not null references staff(id),
  prepared_at      timestamptz not null default now(),
  changed_at       timestamptz,
  paper_printed_at timestamptz,
  cancelled_by     uuid references staff(id) on delete set null,
  cancelled_at     timestamptz,
  unique (clinic_id, ref),
  check (intake_id is not null or patient_id is not null),
  check ((explained_in = 'other') = (explained_other is not null))
);
create index if not exists consent_document_patient on consent_document (clinic_id, patient_id, prepared_at desc) where patient_id is not null;
create index if not exists consent_document_intake on consent_document (intake_id) where intake_id is not null;
create index if not exists consent_document_visit on consent_document (appointment_id) where appointment_id is not null;

create or replace function consent_document_check() returns trigger
language plpgsql set search_path = public as $$
declare
  v consent_version;
  signed boolean;
begin
  select * into v from consent_version where id = new.version_id;
  if v.kind not in ('treatment', 'document') then
    raise exception 'consent_document: % is not a consent form', new.version_id using errcode = 'check_violation';
  end if;
  if v.kind = 'document' and v.code <> 'photos' and (new.dentist_name is null or new.dentist_prc is null) then
    raise exception 'consent_document: a treatment form names the dentist and their PRC licence' using errcode = 'check_violation';
  end if;
  if new.patient_id is not null and not exists (select 1 from patient p where p.id = new.patient_id and p.clinic_id = new.clinic_id) then
    raise exception 'consent_document: the patient is not this clinic''s' using errcode = 'check_violation';
  end if;
  if new.intake_id is not null and not exists (select 1 from intake i where i.id = new.intake_id and i.clinic_id = new.clinic_id) then
    raise exception 'consent_document: the intake is not this clinic''s' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' then return new; end if;

  if new.id <> old.id or new.clinic_id <> old.clinic_id or new.ref <> old.ref or new.version_id <> old.version_id
     or new.prepared_by <> old.prepared_by or new.prepared_at <> old.prepared_at then
    raise exception 'consent_document: that cannot change' using errcode = 'check_violation';
  end if;
  if old.patient_id is not null and new.patient_id is distinct from old.patient_id then
    raise exception 'consent_document: the patient is set once' using errcode = 'check_violation';
  end if;
  if old.cancelled_at is not null and new.cancelled_at is distinct from old.cancelled_at then
    raise exception 'consent_document: a cancelled form stays cancelled' using errcode = 'check_violation';
  end if;
  signed := exists (select 1 from consent_signing s where s.document_id = old.id);
  if signed or old.paper_printed_at is not null then
    if (new.fields, new.dentist_id, new.dentist_name, new.dentist_prc, new.explained_in, new.explained_other, new.interpreter)
       is distinct from (old.fields, old.dentist_id, old.dentist_name, old.dentist_prc, old.explained_in, old.explained_other, old.interpreter) then
      raise exception 'consent_document: signed or printed for paper, its words are fixed' using errcode = 'check_violation';
    end if;
  end if;
  if signed and (new.intake_id is distinct from old.intake_id or (new.cancelled_at is not null and old.cancelled_at is null)) then
    raise exception 'consent_document: a signed form is withdrawn, not moved or cancelled' using errcode = 'check_violation';
  end if;
  if (new.fields, new.dentist_id, new.explained_in, new.explained_other, new.interpreter)
     is distinct from (old.fields, old.dentist_id, old.explained_in, old.explained_other, old.interpreter) then
    new.rev := old.rev + 1;
    new.changed_at := now();
  else
    new.rev := old.rev;
    new.changed_at := old.changed_at;
  end if;
  return new;
end $$;
-- (created after consent_signing below, which it reads)

-- ---------------------------------------------------------------------------
-- The patient's draft of a consent page (definer functions only)
-- ---------------------------------------------------------------------------
create table if not exists intake_page (
  intake_id      uuid not null references intake(id) on delete cascade,
  document_id    uuid not null references consent_document(id) on delete cascade,
  clinic_id      uuid not null references clinic(id) on delete restrict,
  state          text not null default 'reading' check (state in ('reading', 'question', 'agreed', 'refused', 'later')),
  doc_rev        integer not null,
  answers        jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object' and octet_length(answers::text) <= 4096),
  signed_by_name text check (signed_by_name is null or char_length(btrim(signed_by_name)) between 1 and 120),
  signed_as      text check (signed_as in ('patient', 'guardian')),
  relation       text check (relation is null or char_length(btrim(relation)) between 1 and 60),
  authority      text check (authority in ('parent', 'court_guardian', 'substitute', 'representative')),
  authority_note text check (authority_note is null or char_length(btrim(authority_note)) between 1 and 200),
  strokes        jsonb check (strokes is null or (jsonb_typeof(strokes) = 'array' and jsonb_array_length(strokes) between 1 and 80 and length(strokes::text) <= 120000)),
  snapshot       text check (snapshot is null or octet_length(snapshot) <= 65536),
  opened_at      timestamptz not null default now(),
  decided_at     timestamptz,
  primary key (intake_id, document_id),
  check ((state in ('agreed', 'refused', 'later')) = (decided_at is not null)),
  check (state not in ('agreed', 'refused') or (strokes is not null and snapshot is not null and signed_by_name is not null and signed_as is not null))
);

-- ---------------------------------------------------------------------------
-- What was signed (insert-only)
-- ---------------------------------------------------------------------------
create table if not exists consent_signing (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references clinic(id) on delete restrict,
  document_id     uuid not null references consent_document(id) on delete restrict,
  intake_id       uuid references intake(id) on delete restrict,
  decision        text not null check (decision in ('agreed', 'refused')),
  channel         text not null check (channel in ('phone', 'tablet', 'paper')),
  snapshot        text not null check (octet_length(snapshot) <= 65536),
  snapshot_sha256 text not null check (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  seal_sha256     text not null check (seal_sha256 ~ '^[0-9a-f]{64}$'),
  answers         jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object' and octet_length(answers::text) <= 4096),
  signed_by_name  text not null check (char_length(btrim(signed_by_name)) between 1 and 120),
  signed_as       text not null check (signed_as in ('patient', 'guardian')),
  relation        text check (relation is null or char_length(btrim(relation)) between 1 and 60),
  authority       text check (authority in ('parent', 'court_guardian', 'substitute', 'representative')),
  authority_note  text check (authority_note is null or char_length(btrim(authority_note)) between 1 and 200),
  strokes         jsonb check (strokes is null or (jsonb_typeof(strokes) = 'array' and jsonb_array_length(strokes) between 1 and 80 and length(strokes::text) <= 120000)),
  signed_on       date,
  opened_at       timestamptz,
  read_seconds    integer check (read_seconds is null or read_seconds >= 0),
  recorded_by     uuid references staff(id),
  signed_at       timestamptz not null default now(),
  check ((channel = 'paper') = (strokes is null)),
  check ((channel = 'paper') = (signed_on is not null)),
  check (channel <> 'paper' or recorded_by is not null),
  check (channel = 'paper' or intake_id is not null),
  check ((signed_as = 'guardian') = (relation is not null and authority is not null)),
  check (authority is null or authority in ('parent', 'court_guardian') or authority_note is not null)
);
create index if not exists consent_signing_document on consent_signing (document_id, signed_at desc);

create or replace function consent_seal(p_snapshot_sha256 text, p_strokes jsonb, p_signed_on date, p_name text, p_as text, p_at timestamptz)
returns text language sql stable set search_path = public as $$
  select encode(sha256(convert_to(concat_ws(E'\n',
           p_snapshot_sha256,
           coalesce(p_strokes::text, 'paper ' || to_char(p_signed_on, 'YYYY-MM-DD')),
           p_name, p_as,
           to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')), 'UTF8')), 'hex')
$$;

create or replace function consent_signing_check() returns trigger
language plpgsql set search_path = public as $$
declare
  d consent_document;
  s jsonb;
begin
  select * into d from consent_document where id = new.document_id;
  if not found or d.clinic_id <> new.clinic_id then
    raise exception 'consent_signing: the form is not this clinic''s' using errcode = 'check_violation';
  end if;
  if d.cancelled_at is not null then
    raise exception 'consent_signing: the form was cancelled' using errcode = 'check_violation';
  end if;
  s := new.snapshot::jsonb;
  if s ->> 'document' is distinct from d.id::text or s ->> 'version' is distinct from d.version_id
     or s ->> 'decision' is distinct from new.decision or (s -> 'fields') is distinct from d.fields
     or s #>> '{signer,name}' is distinct from new.signed_by_name then
    raise exception 'consent_signing: the words do not belong to this form' using errcode = 'check_violation';
  end if;
  -- Nobody supplies the fingerprints: they are computed here, from what is stored.
  new.snapshot_sha256 := encode(sha256(convert_to(new.snapshot, 'UTF8')), 'hex');
  new.seal_sha256 := consent_seal(new.snapshot_sha256, new.strokes, new.signed_on, new.signed_by_name, new.signed_as, new.signed_at);
  return new;
end $$;
drop trigger if exists consent_signing_check on consent_signing;
create trigger consent_signing_check before insert on consent_signing for each row execute function consent_signing_check();

drop trigger if exists consent_document_check on consent_document;
create trigger consent_document_check before insert or update on consent_document for each row execute function consent_document_check();

-- ---------------------------------------------------------------------------
-- The dentist's "I explained this" (insert-only)
-- ---------------------------------------------------------------------------
create table if not exists consent_attestation (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references clinic(id) on delete restrict,
  document_id  uuid not null references consent_document(id) on delete restrict,
  dentist_id   uuid not null references staff(id),
  dentist_name text not null check (char_length(btrim(dentist_name)) between 1 and 120),
  dentist_prc  text not null check (char_length(btrim(dentist_prc)) between 1 and 20),
  -- A child of 7 to 17: what they said when it was explained to them.
  assent       text check (assent in ('agreed', 'objected', 'not_asked')),
  attested_at  timestamptz not null default now(),
  unique (document_id)
);

create or replace function consent_attestation_check() returns trigger
language plpgsql set search_path = public as $$
declare d consent_document; v consent_version;
begin
  select * into d from consent_document where id = new.document_id;
  select * into v from consent_version where id = d.version_id;
  if d.id is null or d.clinic_id <> new.clinic_id or d.cancelled_at is not null then
    raise exception 'consent_attestation: no such open form here' using errcode = 'check_violation';
  end if;
  if v.kind <> 'document' or v.code = 'photos' then
    raise exception 'consent_attestation: this form is not confirmed by a dentist' using errcode = 'check_violation';
  end if;
  if new.dentist_id is distinct from d.dentist_id or not exists (
       select 1 from staff s join staff_access a on a.staff_id = s.id and a.clinic_id = new.clinic_id
        where s.id = new.dentist_id and s.disabled_at is null and s.role in ('owner', 'dentist', 'associate')) then
    raise exception 'consent_attestation: only the dentist named on the form confirms it' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists consent_attestation_check on consent_attestation;
create trigger consent_attestation_check before insert on consent_attestation for each row execute function consent_attestation_check();

-- ---------------------------------------------------------------------------
-- Withdrawing an agreement (insert-only)
-- ---------------------------------------------------------------------------
create table if not exists consent_withdrawal (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references clinic(id) on delete restrict,
  signing_id   uuid not null references consent_signing(id) on delete restrict,
  told_by_name text not null check (char_length(btrim(told_by_name)) between 1 and 120),
  how          text not null check (how in ('in_person', 'phone', 'writing')),
  note         text check (note is null or char_length(note) <= 300),
  recorded_by  uuid not null references staff(id),
  withdrawn_at timestamptz not null default now(),
  unique (signing_id)
);

create or replace function consent_withdrawal_check() returns trigger
language plpgsql set search_path = public as $$
declare s consent_signing;
begin
  select * into s from consent_signing where id = new.signing_id;
  if s.id is null or s.clinic_id <> new.clinic_id or s.decision <> 'agreed' or exists (
       select 1 from consent_signing later where later.document_id = s.document_id and later.signed_at > s.signed_at) then
    raise exception 'consent_withdrawal: only the latest agreement on a form is withdrawn' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists consent_withdrawal_check on consent_withdrawal;
create trigger consent_withdrawal_check before insert on consent_withdrawal for each row execute function consent_withdrawal_check();

-- ---------------------------------------------------------------------------
-- What happened when (insert-only; never an answer)
-- ---------------------------------------------------------------------------
create table if not exists intake_event (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinic(id) on delete restrict,
  intake_id   uuid not null references intake(id) on delete cascade,
  document_id uuid references consent_document(id) on delete cascade,
  kind        text not null check (kind in ('started', 'link', 'handover', 'opened', 'page1', 'reading', 'question', 'decided',
                                            'resign', 'sent', 'stopped', 'switched', 'cancelled', 'added', 'seen', 'expired', 'idle')),
  detail      text check (detail is null or char_length(detail) <= 120),
  staff_id    uuid references staff(id) on delete set null,
  at          timestamptz not null default now()
);
create index if not exists intake_event_intake on intake_event (intake_id, at);

create or replace function intake_event_check() returns trigger
language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from intake i where i.id = new.intake_id and i.clinic_id = new.clinic_id) then
    raise exception 'intake_event: the intake is not this clinic''s' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists intake_event_check on intake_event;
create trigger intake_event_check before insert on intake_event for each row execute function intake_event_check();

-- ---------------------------------------------------------------------------
-- What adding an intake writes
-- ---------------------------------------------------------------------------
alter table medical_history add column if not exists intake_id uuid references intake(id) on delete restrict;
create index if not exists medical_history_intake on medical_history (intake_id) where intake_id is not null;

alter table patient_consent add column if not exists intake_id uuid references intake(id) on delete restrict;
alter table patient_consent drop constraint if exists patient_consent_channel_check;
alter table patient_consent add constraint patient_consent_channel_check
  check (channel in ('web', 'desk', 'sms', 'paper', 'form', 'intake'));
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'patient_consent_intake_shape') then
    alter table patient_consent add constraint patient_consent_intake_shape
      check ((channel = 'intake') = (intake_id is not null)
             and (channel <> 'intake' or (recorded_by is not null and agreed_as is not null and coalesce(btrim(given_by_name), '') <> '')));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Row-level security: the 035 fence on every new table
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['intake', 'intake_link', 'consent_document', 'intake_page', 'consent_signing',
                           'consent_attestation', 'consent_withdrawal', 'intake_event'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'tenant_isolation') then
      execute format($p$create policy tenant_isolation on %I
        using (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid)
        with check (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid)$p$, t);
    end if;
  end loop;
end $$;

-- 002's default privileges gave the app every right on a new table: take them back, then give exactly these.
revoke all on intake, intake_link, consent_document, intake_page, consent_signing, consent_attestation,
              consent_withdrawal, intake_event from flossify_app;
grant select, insert on intake to flossify_app;
grant update (status, patient_id, appointment_id, label, rev, decided_by, decided_at, added_as, cancelled_by, cancelled_at) on intake to flossify_app;
grant select, insert on intake_link to flossify_app;
grant update (retired_at, retired_why) on intake_link to flossify_app;
grant select, insert on consent_document to flossify_app;
grant update (intake_id, patient_id, appointment_id, fields, dentist_id, dentist_name, dentist_prc, explained_in, explained_other,
              interpreter, sort, paper_printed_at, cancelled_by, cancelled_at) on consent_document to flossify_app;
grant select on intake_page to flossify_app;
grant select, insert on consent_signing, consent_attestation, consent_withdrawal, intake_event to flossify_app;

-- ---------------------------------------------------------------------------
-- The public side (no tenant). p_device: the SHA-256 (hex) of the device's secret cookie for this link, or null.
-- ---------------------------------------------------------------------------
-- Internal: the link and its intake, locked, and what the link is to this device. Retires a link it finds past its time.
--   'unknown' | 'welcome' (live, not claimed) | 'open' (claimed by this device) | 'taken' | 'expired' | 'idle'
--   | 'replaced' (the desk made another, switched device or stopped to change something) | 'finished' | 'closed'
create or replace function intake_gate(p_token text, p_device text, out v_status text, out v_link intake_link, out v_intake intake)
language plpgsql security definer volatile set search_path = public as $$
declare v_now timestamptz := now();
begin
  v_status := 'unknown';
  if p_token is null or p_token !~ '^[a-hjkmnp-z2-9]{26}$' then return; end if;
  select l.* into v_link from intake_link l join clinic c on c.id = l.clinic_id and c.archived_at is null
   where l.token = p_token for update of l;
  if not found then return; end if;
  select i.* into v_intake from intake i where i.id = v_link.intake_id for update;
  if v_link.retired_at is not null then
    v_status := case v_link.retired_why when 'sent' then 'finished' when 'cancelled' then 'closed'
                  when 'idle' then 'idle' when 'expired' then 'expired' else 'replaced' end;
    return;
  end if;
  if v_intake.status = 'cancelled' then v_status := 'closed'; return; end if;
  if v_intake.created_at < v_now - interval '24 hours' or (v_link.claimed_at is null and v_now > v_link.open_by) then
    update intake_link set retired_at = v_now, retired_why = 'expired' where token = p_token;
    insert into intake_event (clinic_id, intake_id, kind) values (v_intake.clinic_id, v_intake.id, 'expired');
    v_status := 'expired'; return;
  end if;
  if v_link.claimed_at is null then v_status := 'welcome'; return; end if;
  if p_device is null or v_link.device_sha256 is distinct from p_device then v_status := 'taken'; return; end if;
  if v_link.last_seen_at < v_now - interval '20 minutes' then
    update intake_link set retired_at = v_now, retired_why = 'idle' where token = p_token;
    insert into intake_event (clinic_id, intake_id, kind) values (v_intake.clinic_id, v_intake.id, 'idle');
    v_status := 'idle'; return;
  end if;
  update intake_link set last_seen_at = v_now where token = p_token;
  update intake set last_activity_at = v_now where id = v_intake.id;
  v_status := 'open';
end $$;

-- What the page draws. 'welcome': the clinic's face and how many parts, nothing about the patient.
-- 'open': everything the pages need, for the device that holds the link. Any other status: the clinic's face only.
create or replace function intake_view(p_token text, p_device text)
returns table (status text, body jsonb)
language plpgsql security definer volatile set search_path = public as $$
declare g record; c record; b jsonb; pv consent_version;
begin
  select * into g from intake_gate(p_token, p_device);
  if g.v_status = 'unknown' then return query select 'unknown'::text, null::jsonb; return; end if;
  select cl.name, cl.area, cl.city, cl.phone, cl.photo_keys, gr.dpo_name into c
    from clinic cl join clinic_group gr on gr.id = cl.group_id where cl.id = (g.v_intake).clinic_id;
  b := jsonb_build_object('clinic', jsonb_build_object('name', c.name, 'area', c.area, 'city', c.city, 'phone', c.phone,
         'photo_keys', to_jsonb(coalesce(c.photo_keys, '{}'::text[])), 'dpo', c.dpo_name));
  if g.v_status not in ('welcome', 'open') then return query select g.v_status, b; return; end if;
  b := b || jsonb_build_object('device', (g.v_link).device, 'page1', (g.v_intake).target = 'new',
         'consents', (select count(*) from consent_document d where d.intake_id = (g.v_intake).id and d.cancelled_at is null));
  if g.v_status = 'welcome' then return query select 'welcome'::text, b; return; end if;
  pv := current_consent_of('privacy');
  b := b || jsonb_build_object(
    'intake', jsonb_build_object('id', (g.v_intake).id, 'ref', (g.v_intake).ref, 'target', (g.v_intake).target,
       'form_version', (g.v_intake).form_version, 'answers', (g.v_intake).answers,
       'page1_done', (g.v_intake).page1_done_at is not null, 'privacy_version', (g.v_intake).privacy_version),
    'patient', (select jsonb_build_object('first_name', p.first_name, 'middle_name', p.middle_name, 'last_name', p.last_name,
                  'suffix', p.suffix, 'birth_date', p.birth_date) from patient p where p.id = (g.v_intake).patient_id),
    'privacy', case when pv.id is null then null else jsonb_build_object('id', pv.id, 'title', pv.title, 'summary', pv.summary) end,
    'pages', coalesce((
      select jsonb_agg(jsonb_build_object(
               'document', d.id, 'ref', d.ref, 'sort', d.sort, 'rev', d.rev, 'version', d.version_id, 'kind', v.kind, 'code', v.code,
               'in_force', d.version_id = coalesce(case v.kind when 'treatment' then (current_consent_of('treatment')).id
                                                               else (current_document_of(v.code)).id end, ''),
               'fields', d.fields, 'dentist', d.dentist_name, 'prc', d.dentist_prc, 'explained_in', d.explained_in,
               'explained_other', d.explained_other, 'interpreter', d.interpreter,
               'state', case when p.doc_rev = d.rev then p.state end,
               'answers', case when p.doc_rev = d.rev then p.answers end,
               'signer', case when p.doc_rev = d.rev and p.signed_by_name is not null then jsonb_build_object(
                           'name', p.signed_by_name, 'as', p.signed_as, 'relation', p.relation, 'authority', p.authority, 'note', p.authority_note) end,
               'strokes', case when p.doc_rev = d.rev then p.strokes end,
               'opened_at', case when p.doc_rev = d.rev then p.opened_at end,
               'decided_at', case when p.doc_rev = d.rev then p.decided_at end) order by d.sort)
        from consent_document d join consent_version v on v.id = d.version_id
        left join intake_page p on p.intake_id = d.intake_id and p.document_id = d.id
       where d.intake_id = (g.v_intake).id and d.cancelled_at is null), '[]'::jsonb));
  return query select 'open'::text, b;
end $$;

-- Start: the first device to press it holds the link. 'claimed' | 'already' | a gate status | 'invalid'.
create or replace function intake_claim(p_token text, p_device text)
returns text language plpgsql security definer volatile set search_path = public as $$
declare g record;
begin
  if p_device is null or p_device !~ '^[0-9a-f]{64}$' then return 'invalid'; end if;
  select * into g from intake_gate(p_token, p_device);
  if g.v_status = 'open' then return 'already'; end if;
  if g.v_status <> 'welcome' then return g.v_status; end if;
  update intake_link set claimed_at = now(), device_sha256 = p_device, last_seen_at = now() where token = p_token and claimed_at is null;
  if not found then return 'taken'; end if;
  update intake set last_activity_at = now() where id = (g.v_intake).id;
  insert into intake_event (clinic_id, intake_id, kind, detail) values ((g.v_intake).clinic_id, (g.v_intake).id, 'opened', (g.v_link).device);
  return 'claimed';
end $$;

-- One screen of page 1, already read by the server's parser. The privacy screen finishes page 1 and is checked again
-- here. 'saved' | 'changed' (the notice in force is another) | 'invalid' | a gate status.
create or replace function intake_save_page1(p_token text, p_device text, p_screen text, p_answers jsonb, p_privacy text)
returns text language plpgsql security definer volatile set search_path = public as $$
declare
  g record; v_old jsonb; v_new jsonb; v_birth date; v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  select * into g from intake_gate(p_token, p_device);
  if g.v_status <> 'open' then return g.v_status; end if;
  if (g.v_intake).target <> 'new' or (g.v_intake).status <> 'out' then return 'invalid'; end if;
  if p_screen is null or p_screen not in ('you', 'contact', 'health', 'privacy')
     or p_answers is null or jsonb_typeof(p_answers) <> 'object' then return 'invalid'; end if;
  v_old := (g.v_intake).answers;
  v_new := v_old || p_answers;
  if octet_length(v_new::text) > 24576 then return 'invalid'; end if;
  if p_screen = 'privacy' then
    begin
      if coalesce(v_new ->> 'birth_date', '') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception using errcode = 'check_violation'; end if;
      v_birth := (v_new ->> 'birth_date')::date;
      if coalesce(char_length(btrim(v_new ->> 'first_name')), 0) not between 1 and 60
         or coalesce(char_length(btrim(v_new ->> 'last_name')), 0) not between 1 and 60
         or coalesce(v_new ->> 'mobile', '') !~ '^09[0-9]{9}$'
         or v_birth > v_today or v_birth < date '1900-01-01'
         or coalesce(p_answers ->> 'consent_privacy', '') <> 'true'
         or (extract(year from age(v_today, v_birth)) < 18
             and (coalesce(btrim(v_new ->> 'guardian_name'), '') = '' or coalesce(btrim(v_new ->> 'guardian_relation'), '') = '')) then
        raise exception using errcode = 'check_violation';
      end if;
    exception when check_violation or invalid_datetime_format or datetime_field_overflow then
      return 'invalid';
    end;
    if p_privacy is distinct from (current_consent_of('privacy')).id then return 'changed'; end if;
  end if;
  -- A page signed on this intake names the person as page 1 did: when who they are changes, it is signed again.
  if (v_old ->> 'first_name', v_old ->> 'middle_name', v_old ->> 'last_name', v_old ->> 'suffix', v_old ->> 'birth_date',
      v_old ->> 'guardian_name', v_old ->> 'guardian_relation')
     is distinct from
     (v_new ->> 'first_name', v_new ->> 'middle_name', v_new ->> 'last_name', v_new ->> 'suffix', v_new ->> 'birth_date',
      v_new ->> 'guardian_name', v_new ->> 'guardian_relation') then
    with reset as (
      update intake_page set state = 'reading', decided_at = null, strokes = null, snapshot = null, signed_
