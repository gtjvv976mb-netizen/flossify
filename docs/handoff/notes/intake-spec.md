# Add patient, step by step: intake and consent forms (design, revised)

> Build spec for the owner's request of 29 Sep 2026, revised after the clinic-legal and data-security reviews ("Review notes" at the end). Migration **039**. Code: `src/lib/intake*.ts`, `consent-*.ts`, `patient-add.ts`, `refused.ts`, `park.ts`. Pages: `/c/<slug>/patients/new/`, `/c/<slug>/patients/intake/…`, `/f/i/<token>/`, `/f/t/`, `/auth/park/`, `/auth/unlock/`, `/c/<slug>/patients/<id>/consents/…`. Where this file and CLAUDE.md disagree, CLAUDE.md wins and this file is fixed.

The owner: *"Staff or any authorized staff will click Add patient, using QR or in-site … step by step. Before presenting the QR, the staff will go through a checklist to check which consent form should be signed for the procedure/operation. 1st page: Patient Information. 2nd page: Consent Form (clinic will fill up a formatted form created by you …). 3rd page: Consent form. 4th page: Consent form. End of profile creation."*

---

## 0. Decisions

1. **Add patient offers three ways:**
   - *On their phone*: a QR code for this one patient.
   - *At the clinic*: a registered clinic tablet, or hand this device over.
   - *Type it in yourself*: today's form, moved to `/patients/new/type/`.
   - Import and the poster stay as quiet links.
2. **The desk's steps:** 1 Who and which forms · 2 The clinic's part · 3 Check · 4 Hand over. Step 2 may come after the hand-over, because page 1 needs nothing from it.
3. **What the patient sees, in order:**
   - Page 1 *Patient information*, for new patients, where §5.5 allows it. It ends with the privacy notice and who agrees to it.
   - *Consent to examination and treatment*.
   - One page per chosen form, in a fixed order.
   - *Check and send*.
   - A thank-you that shows nothing of the record.
4. **Explain, then confirm, then sign.**
   - A procedure form can be read at any time. It can be signed only after the named dentist has confirmed its clinical part and recorded *I explained this*.
   - That record is a `consent_attestation` row, written before any signing. `intake_decide` refuses a signature without it.
   - At registration the page reads "Read before you see the dentist". It is signed at the chair, on a clinic device, or on the link while the link is still open.
   - The general consent and the photos form need no attestation.
5. **The forms are a versioned library.** Each form has a `consent_version` row: the new kind `document`, or kind `treatment` for the general consent. The words live in code, and the row holds their hash.
6. **The clinic types into fields, and each field has an owner.**
   - Desk fields (dentist, estimate, fees): anyone with `records.edit`.
   - Dentist fields (procedure, teeth, type, reason, findings, materials): the desk may propose them. The patient sees "to be confirmed by the dentist" until the named dentist's attestation confirms them. The attestation also freezes them.
7. **Decisions on a page:**
   - *I agree* is signed.
   - *I do not agree* is a signed refusal.
   - *Ask the dentist first* is not signed, and the form shows as *To sign* on the record.
   - The photos form has *Yes, with these choices* (signed) or *No, thank you*. *No, thank you* is an unsigned refusal: no alert, never *To sign*.
8. **Who may sign:**
   - A patient signs under the name the server holds.
   - For a minor, only someone with authority signs: a parent, a court-appointed guardian, substitute parental authority in the Family Code's order, or someone a parent authorised in writing.
   - An adult who cannot write signs by mark, with a staff witness.
   - For an adult who cannot decide, only a court-appointed guardian signs, or a representative after the dentist has recorded why.
   - Everyone except the patient or a parent signs only on a clinic device, and a staff member confirms it under their own sign-in.
9. **Signatures:**
   - A fresh signature on every page, stored as strokes, never as an image.
   - Initials on the risks sections of procedure forms.
10. **What was signed is frozen.**
    - The server renders a canonical `snapshot`. The database computes its SHA-256 and a seal.
    - Once a form is on a record, its seal is chained per clinic.
    - Reprints come from the snapshot only.
    - The patient's copy and the Close the day sheet carry short seals, kept outside the database.
11. **An intake is not a patient.**
    - A new patient's intake ends as *Sent*. The desk adds it with one tap after checking look-alikes (open question 1).
    - For a patient on file, the intake has consent pages only and is done at Send. On a phone, the patient first types the birth date on file.
12. **The link:**
    - 26 characters (about 129 bits), claimed by the first device that opens it.
    - It stops working after 15 minutes unclaimed, or 20 minutes idle.
    - Drafts stay on the server for 24 hours. Nothing reaches the record before Send.
13. **Handing this device over signs the desk out.** No cookie merely hides a live session. Unlocking is a new sign-in at `/auth/unlock/`. A clinic tablet never holds a staff session.
14. **Production gates:**
    - Page 1 and the phone link open only when the privacy notice in force is listed in `FORMS_PRIVACY_VERSIONS`.
    - Until then, production runs consents-only intakes, for patients on file, on clinic devices.
    - Only templates listed in `CONSENT_REVIEWED` are offered, the general consent included.
15. **Permissions:**
    - `records.edit`, checked with `can()` on pages and `canEditRecords` in every writing transaction.
    - Only the named treating dentist with a PRC licence confirms the clinical part and attests.
    - Staff confirmations are made under the confirmer's own sign-in.
16. **Treatment after a refusal, or with a form unsigned, asks first.** This applies to Mark done, In the chair and the visit strip. The staff member types a reason, which is stored and audited. It is never a hard block.
17. **No IP addresses or browser details** are stored with these consents.

---

## 1. The staff flow

Every staff screen uses the soft template and `ClinicLayout section="add-patient"`:
- one teal button per screen;
- sentence case and line icons;
- targets ≥ 44px and fields at 16px;
- `<Csrf />` on every form. A miss redirects with `?stale=1` and shows `CSRF_MESSAGE`.

### 1.1 Entry points
- **Add patient:** the Patients list's **+ Add patient**, the New menu, the search empty state and the booking panel hint all go to `/patients/new/`.
  - Fix while here: gate the New menu item with `can(ws, 'records.edit')`. `routes.ts` shows it to everyone today.
- **The record:** Consent → **Prepare consent forms**.
- **A visit's panel:** **Prepare consent forms for this visit** (phase 4).
- **A form on the record that was never signed, was refused or was withdrawn:** **Sign on this tablet**. This starts a one-form intake on a clinic device.
- **The named dentist:** **Explain and confirm** (§1.10).

### 1.2 Screen A: "How will they fill in their details and consent forms?"
Three radio cards, each 72px tall:

| Card | Line | Production, notice not listed |
|---|---|---|
| **On their phone** · *Easiest* | "A QR code only this patient can use. They fill in and sign on their own phone." | Disabled: "Opens when the clinic's privacy notice covers it." |
| **At the clinic** | "On the clinic's tablet, or hand this device to them." | For a new patient: "Type their details first, then prepare their consent forms", going to `/new/type/?next=consents` |
| **Type it in yourself** | "For a phone call or a paper form." | Open. With `?next=consents`, saving lands on the new record's *Prepare consent forms* |

- A teal **Continue**. For the first two cards it POSTs `intent=start` to `/patients/intake/`; for the third it redirects.
- Quiet links: import, the poster, and "a patient on file: their record → Consent".
- In production with no template reviewed yet, one blue line says so and only typing is open.
- "N patients sent their forms" counts poster forms plus sent intakes.
- Without `records.edit`, the page shows *Not allowed*.

### 1.3 Screen B, step 1: "Who and which forms?" (`/patients/intake/<id>/?step=consents`)
The step pills are import's `.imp-steps`: **1 Who and which forms · 2 The clinic's part · 3 Check · 4 Hand over**.

**Head**
- **A new patient:**
  - An optional first name to show under the code (at most 40 characters).
  - **Under 18?** *Yes · No · Not sure* (required).
  - Unless the answer is No: **Who came with them?** *A parent · A legal guardian · Another adult (a grandparent, relative, yaya …) · Nobody*.
- **A patient on file:** name pill, chart number, age, and an optional visit today.

**The checklist.** Cards at least 56px tall, each with a quiet **Preview** that opens a side panel at 390px.
- **Always included:** page 1 (new patients) and *Consent to examination and treatment*.
  - If the patient already signed the treatment version in force (in `visit_consent`, an agreed document, or channel `form`), the general consent is unticked and shows "Signed 12 Aug 2026". It can be ticked again.
- **Numbing:** local anaesthesia.
- **Treatment:** extraction and oral surgery · root canal · fillings, crowns, bridges and veneers · deep cleaning and gum treatment · dentures · implants · braces and aligners · whitening.
- **Records:** photos. Optional; saying no never changes care.

**Suggestions** (`suggestConsents`):
- *Planned by Dr Reyes: extraction 36* comes from plan items a treating dentist accepted. It is **pre-ticked**. Anaesthesia is pre-ticked with it, and "Often needed" shows beside fillings and crowns.
- *Booked for: extraction (not yet examined)* comes from the booking. It is **never pre-ticked**.

**Rules shown in place**
- Under 18 (the desk's answer or the record): "A parent or legal guardian signs every form." Whitening is disabled: "Not for under 18: the product label says so."
- Under 18 and the patient came with another adult or nobody: "Only a parent or legal guardian can agree. Page 1 can be filled in; the privacy consent and the forms wait for them."
- A patient on file with no birth date: every row is disabled with "Add their birth date first".
- In development, unreviewed templates carry an amber tag. In production only reviewed ones are listed, with a line saying more will open.
- A running line: "4 parts · about 10 minutes" (`PAGE_MINUTES`).

**Buttons**
- Teal **Continue** (`intent=consents`, with `rev`).
- Quiet **Hand over now** goes to step 4. The clinic's part can be filled in afterwards.

### 1.4 Screen C, step 2: "The clinic's part"
**Common block**
- **The dentist who explains:** treating staff with access here, not disabled. A dentist with no PRC licence shows an inline error that links to People.
  - Preselected: the visit's dentist, else the signed-in dentist, else the only one.
- **The language planned:** English · Filipino · other. The attestation records the language actually used.

**One card per form**
- Desk fields are editable. The estimate has quick-fill chips from the fee guide rows that `consentsForCatalog` maps to this form, multiplied by the number of teeth when the row is `tooth_scoped`.
- Dentist fields are prefilled from accepted plan lines and shown as "Proposed · Dr Reyes confirms".
  - If the named dentist is signed in, each card has **Confirm, and I explained this to them today** (§1.10).
- A quiet **See it as the patient will**.
- Amber warnings, never blocking: the clinic's address is missing; "Estimate left to the dentist".

**Saving.** Teal **Continue** runs `saveClinicPart`. A refused post comes back with every value and "Nothing was saved. N things to fix:".

### 1.5 Screen D, step 3: "Check"
- The pages in order, each with its minutes and *Change*. Examples:
  - "Page 3 Local anaesthesia · read now, signed after Dr Reyes explains"
  - "Page 4 Tooth extraction · 36 · ready to sign (confirmed 10:20)"
- **Device:** *Their phone* · each clinic tablet ("seen 2 min ago") · *This device*.
- The teal button follows the device:
  - **Show the QR code**
  - **Send to Tablet 1**
  - **Hand this device to Juan**, with the line "This device opens the clinic's pages again only after you sign in."

### 1.6 Screen E1 (phone): the QR code and live progress
**The QR card** (white in both themes)
- `qrSvg(url, { ecc: 'H', mark: true })` at 320px, never under 280px.
- Under it: "For: Juan D. · Only for this patient. Do not post or share it. · Opens until 10:46."
- `https://flossify.ph/f/i/<token>/` must measure as QR version ≤ 6 (§9).

**The progress panel** (beside the QR from 64rem)
- "Juan D. · waiting to be scanned", then "filling in on their phone · 4 min".
- **Link state**, in words plus a dot:
  - waiting (blue)
  - active 10 s ago (green)
  - idle 6 min, closed after 20 minutes, expired, or locked after three wrong birth dates (amber)
- **Parts**, each with a tag of words plus a dot: Not started · Filling in · Done · Reading · Read, waiting for the dentist · Has a question · Signed 10:36 · To confirm · Did not agree (soft red) · No photos · Will ask the dentist · Sign again · Updated words.

**Alerts**, each with one action:
- A question → **Seen**.
- Did not agree: "the dentist should talk to them".
- "Page 1 says born 2010; you said not under 18" → **Change my answer**.
- "Nobody with authority can sign".
- "Signed by mark" → **I saw this signed**.
- "Possible match on file: …" (`likelyMatches`). A mobile alone is never a strong match.
- "The words of Tooth extraction changed" → **Renew the form**.
- Not opened yet → **Show the code again**.

**Actions** (quiet)
- Show the code again: the old link retires as `replaced`.
- Use a clinic tablet instead (`switched`).
- Change the clinic's part (`stopped`).
- Stop (asks first).

**Never shown on this panel:** health answers, the address, the mobile, signatures or any typed answer. Desk monitors face the waiting room.

**Refresh**
- While the tab is visible, the page GETs `status/` every 4 s (limit `intake:poll:<staff>`).
- Changes toggle the `hidden` attribute and are announced in `aria-live` (`data-ik-live`).
- Without the script there is a **Refresh** link.
- After three failed polls: "Connection lost at 10:41. The patient's saved pages are safe."

### 1.7 Screen E2 (at the clinic)
**(a) A clinic tablet**
- **Registering:** Clinic settings → **Clinic tablets** → *Make this device a clinic tablet*. Needs `settings.edit` and a name.
  - This sets `fl_ctab`: a secret hashed in `clinic_tablet`; httpOnly, Secure, SameSite=Strict, `Path=/f/`, 180 days.
  - It signs that browser out of the workspace.
- **Waiting:** the tablet rests on `/f/t/`, "Ready for the next patient", showing only the clinic's face. It calls `tablet_poll` every 4 s.
- **Sending:** **Send to Tablet 1** inserts the link already claimed by that tablet, which opens it within 4 s. The desk stays signed in and watches the same panel.
- After the thank-you, the tablet returns to `/f/t/`.

**(b) This device.** **Hand this device to Juan** POSTs to `/auth/park/`. `sw.js` already treats a POST under `/auth/` as a session change, so it drops the kept record copy. In order:
1. `goLive` inserts the link, already claimed with a secret made for this browser, in its own transaction. No public claim is needed.
2. `clearSession()`.
3. A signed `fl_park` hint `{ s, c: slug, i: intake, exp: 24 h }`. It opens nothing.
4. The page posts `parked` and `{ who: null }` on the `flossify-offline` BroadcastChannel. Other tabs cover themselves with a locked card, and the offline queue stops.
5. 303 to `/f/i/<token>/`.

**Unlock** (`/auth/unlock/`), the staff entrance card. The thank-you's quiet **For the clinic** leads here.
- Heading: "This device was handed to a patient. Sign in to go back."
- The username is prefilled at the clinic's door (`clinicDoor(slug)`, `authenticateAt`). *Another way* uses email.
- A **Show** button, the Caps Lock line, and the password empties after a miss.
- Limits `login:u:<slug>:<login>` and `login:ip:`.
- On success: `authEvent('login.ok')`, audit `device.unlock`, the hint is cleared, and it returns to the intake.
- Anyone may sign in here as themself.

### 1.8 Screen F: "Add to the records" (once Sent)
- "Juan dela Cruz sent everything at 10:48", then each part's final tag.
- **Look-alikes:** `likelyMatches` on name, birth date and mobile (top 5), plus the patient of the visit the intake was started from.
  - Each has a quiet **Add to {name}'s record**.
  - That button is teal when the strongest match has the same name and birth date, or is that visit's walk-in record.
  - Otherwise **Add as a new patient** is teal, and it carries `seen=<every id>`.
- **Adding to a patient on file** asks first in `Confirm.astro`:
  - only empty fields are filled, never a name;
  - mobile and email only if ticked;
  - *Use* for each detail that differs (`compareWithRecord`, `TAKEABLE`).
- Success lands on `?saved=intake&intake=<id>` (§7).
- Quiet **Dismiss** asks for a reason (duplicate · test · other, at most 120 characters) and cancels the intake for the next purge.

### 1.9 The list, the Dashboard and the chair
- **`/patients/intake/`** (`records.edit` only) has three groups: **Sent: add to the records** · **Filling in now** · **Not finished**, with the time left of its 24 hours. Its POST `intent=start` is the one creation endpoint.
- **Dashboard:** a **Patient forms in progress** card above *Your tasks* when any intake is `out` or `sent`. It shows three and **See all**.
- **`inboxFor`** gains `intakes`, which drives the Patients tab dot.
- **At the chair:** when a sent intake likely matches the patient of a visit today (same name and birth date, or it was started from that visit), "Forms sent, not added: add them now" shows on the visit strip, the visit panel and *In the chair*. *In the chair* asks first.

### 1.10 The dentist's part and confirmations
**Explain and confirm.** Reached from the document, the strip's "Tooth extraction · 36: explain and confirm", or the intake's Check step.
- The dentist sees the patient's page in preview, with the dentist fields editable.
- **Explained in:** English · Filipino · Ilocano · Cebuano · other (at most 40 characters); an interpreter (at most 120).
- For a patient aged 7 to 17 on the Manila calendar: **What did {name} say?** agreed · objected · not asked.
- Teal **I explained this to {name}** writes the attestation and freezes the fields.
- Only the named dentist can do this: treating, with a PRC licence, with access here. Anyone else reads "Only Dr Reyes can confirm this. To change who explains, remove the form and prepare it again."
- The page then becomes signable on the open link, or with **Sign on this tablet**.

**Confirmations** (`consent_confirmation`)
- *I saw {name} make their mark* (a witness).
- *I checked {the court order | the ground | the parent's letter}*, naming the file in Files.
- Anyone with `records.edit` can confirm, under their own sign-in, but never the person who signed.
- Until it is confirmed, the signing shows *To confirm* and does not count as agreed.

**Capacity note.** Record → Consent → *Record that the patient cannot decide*.
- A treating dentist with a PRC licence records it, with a reason of at most 300 characters.
- For 30 days afterwards, a representative may sign on a clinic device (open question 13).

---

## 2. The patient flow (`/f/i/<token>/`)

### 2.0 The shell
- **Frame:** the `/f/` glass pattern with `ClinicRoom` behind (the clinic's own cover, or the soft blur) and `ClinicBadge`. A slim bar holds the initials, the clinic's name, "Part 3 of 5" and a quiet **Ask the desk**. There is no site nav.
- **The document card** is near-opaque paper: `--c-surface` at 97% with slate ink, charcoal in dark mode.
  - It is measured over all-black, all-white, harsh stripes and no photo.
  - Text is 17px/1.6 with a 68ch measure. Filipino lines carry `lang="fil"`, use ink-2, and are never under 16px.
- **Headers:** the middleware gives every `/f/` path `no-store`, `X-Robots-Tag: noindex` and `Referrer-Policy: no-referrer`, and logs errors as `/f/i/…`.
- **Posting:** every screen POSTs to the same URL with `at` and `intent`.
  - Success: a 303 to the next screen.
  - An error re-renders with the answers (422).
  - A CSRF miss re-renders with the answers (403), never a redirect.
  - With the script, posts go by `fetch` (`X-Intake-Script: 1`) and get JSON `{ next }` or `{ errors }`.
  - Offline, the screen keeps what was typed and the drawn signature, and says so.
  - Nothing is kept in browser storage or in the URL.
- **Shared-device hygiene**, taken from `/f/[key].astro`:
  - a restored page is hidden and reloaded;
  - `autocomplete="off"` except the contact fields' own tokens;
  - `HONEYPOT_FIELD` on every form.
- **Screens:** `welcome`, `verify`, `you`, `contact`, `health`, `privacy`, `c<sort>`, `check`, `done`.

### 2.1 Welcome, and who it is for
- "Hello. {Clinic} would like you to fill in **4 short parts**, about 10 minutes."
- The parts are listed, then "Your answers go only to {Clinic}." and "Prefer paper? Ask the desk."
- Teal **Start**. Before the link is claimed, the screen shows only the clinic's face and the number of parts.
- **On a phone, Start claims the link** (`intake_claim`). It sets `fl_idev`: httpOnly, Secure, SameSite=Lax, `Path=/f/i/<token>/`, 24 h.
  - A second device sees "These forms are already open on another phone. Ask the desk for a new code."
  - Links for clinic devices are claimed when they are made.
- **A patient on file, on a phone:** first "Type the patient's date of birth" (`intake_verify`).
  - Three misses lock the link: "Please ask the desk."
  - Nothing about the patient is drawn until the date matches.

### 2.2 Page 1: Patient information (new patients, where §5.5 allows it)
The fields are the forms' own `FieldDef`s from `STEPS`, referenced by name, so the wording, `ShowIf`, `need` sentences and the parser are shared. The form version is `INTAKE_FORM_VERSION = 'intake-2026-10'`.

| Screen | Fields | Left out |
|---|---|---|
| `you` | names, `suffix`, `birth_date`, `sex`, `occupation` (18 and over) | `civil_status` |
| `contact` | `mobile`, `email`, address; `guardian` (under 18); `emergency` | `facebook` |
| `health` | the whole `health` step | — |
| `privacy` | HMO (folded); the notice summary, DPO and `/privacy/` link; hidden `privacy_version`; **who is agreeing**; the tick | the teeth step, PhilHealth PIN, `hmo_company` |

- **Parsing:** `parseScreen` reads only that screen's fields on the server, then calls `intake_save_page1`.
  - The `privacy` screen re-reads the whole of page 1 with `parseForm(INTAKE_DEF, merged)`, and the definer checks it again.
  - Changing an earlier screen afterwards means passing `privacy` again.
- **Who is agreeing:**
  - *I am the patient* (18 and over only).
  - *I am their parent or court-appointed guardian*, with name, relation and which one.
  - For a minor only: *Nobody here can agree for them now*. Page 1 still saves, but the privacy consent is **not given**. The desk sees this and records a desk consent at Add when a parent comes (`recordDeskConsent`).
  - Stored as `privacy_as`, `privacy_by_name` and `privacy_relation`.
- **Age check:** a birth date that contradicts the desk's *Under 18?* answer stops page 1: "Please ask the desk before going on." That is No but under 18, or Yes but 18 and over.
  - The desk changes its answer, or the patient corrects the date.
  - *Not sure* never stops page 1.
- **If page 1 makes the patient a minor,** a whitening form is cancelled and the desk is told. It is never answered `invalid`.
- **If who they are changes** (any name, the birth date, or the guardian), signed pages and their `opened_at` are cleared: "Sign again: your details changed."

### 2.3 Consent pages
**Order:** general 10 · anaesthesia 20 · extraction 30 · root canal 40 · restoration 50 · periodontal 60 · denture 70 · implant 80 · ortho 90 · whitening 100 · photos 200. It comes from `Template.order`, never from the desk.

**A procedure form not confirmed yet** (no attestation):
- A blue banner: "Read before you see the dentist. You sign after Dr Reyes has explained it to you."
- The dentist's facts read "to be confirmed by the dentist".
- No ticks, no decision and no pad; one teal **Continue**. The state becomes `read`, and after Send the form is *To sign*.

**A page ready to sign**, top to bottom:
1. **Head:** "Part 3 of 5 · Consent form"; the English `h1` with the Filipino under it; "Explained by Dr Ana Reyes · PRC 0123456 · in Filipino"; "Form extraction-2026-10 · CF-7K2FQ".
2. **"For" box:** name, birth date and age; "Signed by: Maria dela Cruz, mother" for a minor; the facts as pills (teeth in `rp-tooth`, type, estimate); today's date (Manila).
3. **"In short":** a blue-tint callout, bilingual, at most 5 bullets: what, why, the main risks, other choices including none, the cost.
4. **The full text**, under fixed headings: What we will do · Why · Risks (common, then "less common but serious") · special sections · Other choices · If you do not have it · Before and after · Cost · Your rights.
   - The page scrolls; there is never an inner scroll box.
   - A section marked `initials` ends with an **Initials** box: 1 to 4 letters, 56px, the same letters in every box on the page.
5. **Patient questions.**
6. **Ticks**, 56px rows in English with the Filipino under:
   - *explained*, shown only on attested pages, so it is true;
   - *risks*;
   - *history*, on anaesthesia, extraction, periodontal and implant.
   - All are needed to agree; none is needed to refuse or ask first.
7. **How it reached you**, recorded in the snapshot and the print:
   - *Explained to me in*, preset to the attestation's language: English · Filipino · Ilocano · Cebuano · other (at most 40 characters).
   - *I read it myself*, or *It was read to me by* a staff member's name (at most 60).
8. **Decision:** **I agree** · **I want to ask the dentist first** · **I do not agree**, with an optional "Why?" (at most 200 characters).
9. **Who signs** (the table below). The chosen authority's statement sits above the pad.
10. **The meaning sentence** (`meaningSentence`):
    - "By signing, I, Juan dela Cruz, agree to the extraction of tooth 36 by Dr Ana Reyes as described above. 29 Sep 2026."
    - For a guardian: "… I, Maria dela Cruz, mother of Juan dela Cruz, agree for Juan dela Cruz to …".
11. **The pad** (`SignPad.astro`, taken out of the 035 page): a white slip, a dashed line, *Clear*, a 1000×400 box, and strokes in a hidden field. A hint says "Turn your phone sideways for more room."
12. **One teal button:** **Sign and continue**, or **Continue** for ask-first. A missing piece is said before posting, and again by the server.

**Who signs**

| Patient | Choice | Name | Also asked | Where | Staff confirms |
|---|---|---|---|---|---|
| 18 and over | *I am the patient* | from page 1 or the record, read-only | — | any device | — |
| | *The patient, by mark* (cannot write) | read-only | the mark on the pad | clinic device | witness |
| | *Court-appointed guardian* | typed | relation | clinic device | the court order |
| | *Representative* | typed | relation | clinic device, with a capacity note | — |
| Under 18 | *Parent* | typed | relation | any device | — |
| | *Court-appointed guardian* | typed | relation | clinic device | the court order |
| | *Substitute parental authority* (Family Code Arts. 214, 216) | typed | the ground: *the parents have died*, *are absent and cannot be found*, or *are unfit or a court has ruled*; the person, in order: *surviving grandparent*, *oldest brother or sister, 21 or over*, *the child's actual custodian, 21 or over*; the tick "I am 21 or older" for the last two | clinic device | the ground |
| | *Authorised in writing by a parent* | typed | relation | clinic device | the letter, in Files |

- A parent who is simply not here today is **not** substitute authority. The page says so under that choice.
- If nobody with authority is present: "Only a parent or legal guardian can sign. Please ask the desk." The page waits as *To sign*.
- A help line: "If the parents do not agree with each other, the clinic stops and talks with both."

**Photos**
- **Yes, with these choices:** one tick per use the clinic asks about, none pre-ticked, at least one needed. For social media, also *my face may show* and *my name may show*. Signed.
- **No, thank you:** stored as a refusal with no signature and no alert. The record says "No photos for publication".
- Under both: "To change your mind later, tell the clinic in person, by phone or by text."

**Refused.** "I do not agree" is signed like a consent. The page then says, in amber: "We have told the desk. The dentist will talk with you about what this means."

**Whitening stop answers.** Pregnant or could be · smokes or drinks often · a filling or crown in the last 2 weeks. Any of these removes *I agree* and says "Please talk to the dentist before whitening. The product label says it is not for …".

### 2.4 Check and send
- Page 1 and each consent, with its state: "Signed 10:36", "Did not agree", "No photos", "Will ask the dentist", or "Read · signed after the dentist explains".
- Each has *View* and *Change*. This is the WCAG 3.3.4 confirmation step.
- Teal **Send to {Clinic}**, carrying `NONCE_FIELD`.
- Unfinished parts are listed with links. A page waiting for the dentist is not unfinished.

### 2.5 Done
- **Phone, new patient:** "Thank you, Juan. The clinic adds your details to your record next. Please tell the desk you are finished."
- **Phone, patient on file:** "Thank you. Your forms are on your record."
- **The patient's own phone only:** each signed form's short seal, for example "Tooth extraction · seal 3F9A-KQ72-MD" in Plex Mono, with "The same seal is printed on your copy."
- **Clinic device:** "Please hand the tablet back to the clinic." After 20 s the screen turns neutral; a registered tablet returns to `/f/t/`. *For the clinic* leads to unlock (this device only).
- No reference, answers or record are shown. Afterwards, Back or a reload shows only "These forms are finished."
- The patient's copy is printed at the desk, with the seals. It is never sent as a link in a text.

---

## 3. The consent library

### 3.1 Shape (`src/lib/consent-library.ts`, no Node imports)
```ts
export interface Bi { en: string; fil?: string }                     // fil shown only when reviewed (§3.8)
export type Run = string | { f: string } | { dentist: true } | { patient: true } | { lang: true };
export interface Line { en: readonly Run[]; fil?: readonly Run[] }
export type Cond = { f: string; in: readonly string[] } | { teethIn: readonly number[] } | { minor: boolean } | { all: readonly Cond[] } | { not: Cond };
export interface Section { id: string; head: Bi; role: 'what' | 'why' | 'risks' | 'rare' | 'special' | 'choices' | 'without' | 'care' | 'cost'
  | 'rights' | 'records'; lines: readonly Line[]; list?: boolean; when?: Cond; initials?: true }
export type ClinicKind = 'teeth' | 'choice' | 'choices' | 'text' | 'number' | 'range' | 'money' | 'yesno';
export type Code = 'general' | 'anaesthesia' | 'extraction' | 'root_canal' | 'restoration' | 'periodontal'
                 | 'denture' | 'implant' | 'ortho' | 'whitening' | 'photos';
export interface ClinicField { name: string; kind: ClinicKind; who: 'desk' | 'dentist'; label: string; forBox?: string; required?: boolean;
  choices?: readonly Choice[]; other?: { max: number }; min?: number; max?: number; maxTeeth?: number; allowLater?: boolean;
  prefill?: 'plan_teeth' | 'fee_guide' | { value: unknown }; when?: Cond; help?: string }
export interface PatientField { name: string; kind: 'yesno' | 'yesnounsure' | 'choices'; label: Bi; required?: boolean;
  stop?: readonly string[]; choices?: readonly (Choice & { fil?: string })[]; when?: Cond }
export interface Template { code: Code; version: string; title: Bi; group: 'general' | 'numbing' | 'treatment' | 'records';
  order: number; minutes: number; attest: boolean; minors: 'guardian' | 'not_under_18'; validDays: number | null;
  refuseUnsigned: boolean; clinicFields: readonly ClinicField[]; patientFields: readonly PatientField[];
  inShort: readonly Line[]; sections: readonly Section[]; ticks: readonly TickId[] }
export const TEMPLATES: Readonly<Record<string, Template>>;   // by version id, the general consent included
export const CONSENT_REVIEWED: readonly { version: string; langs: readonly ('en' | 'fil')[]; by: string; on: string }[] = [];
export function readClinicPart(t, raw, ctx: { minor: boolean | null; dentist: boolean }): { fields; errors };
export function readPatientPart(t, raw, ctx: { minor: boolean; device: 'phone' | 'clinic' }): { answers; initials; signer; errors; stopped };
export function consentsForCatalog(code, name, category): Code[];
export function renderDocument(t: Template, fields: Fields, ctx: RenderCtx): Rendered;   // pure; the one renderer
export function meaningSentence(r: Rendered): string;
```
- `TEMPLATES['treatment-2026-09']` is built once from `TREATMENT_CONSENT`: six sections and one tick. It needs no special case anywhere.
- With `dentist: false`, `readClinicPart` keeps dentist fields as proposals.
- `consentsForCatalog` builds on `kindForCatalog`. It is used only for suggestions and fee-guide chips:
  - extraction or surgical extraction → extraction + anaesthesia
  - root canal → root canal + anaesthesia
  - filling, crown → restoration (anaesthesia "often")
  - denture → denture
  - braces adjustment → ortho (only when no ortho form is signed)
  - whitening → whitening
  - cleaning → none
  - `/implant/` → implant + anaesthesia
  - `/root planing|deep scal|periodont|curettage/` → periodontal + anaesthesia

### 3.2 Shared words (`SHARED`)
The Filipino is the research's draft. A native-speaking dentist and a translator review it before production shows it (§3.8). Lines marked *(to draft)* have no Filipino yet.

| Id | English | Filipino |
|---|---|---|
| `explained` | Dr {dentist} explained this to me in {language}, and my questions were answered. | Ipinaliwanag sa akin ni Dr {dentist} sa {language} ang gamutang ito, at nasagot ang aking mga tanong. |
| `risks` | I understand the risks above, and that no one can promise a particular result. | Naiintindihan ko ang mga panganib sa itaas, at na walang makapangangako ng tiyak na resulta. |
| `history` | I told the clinic truthfully about my health, medicines and allergies, and will tell them if anything changes. | Tapat kong sinabi sa klinika ang tungkol sa aking kalusugan, mga gamot, at mga allergy, at sasabihin ko kung may magbago. |
| `read_self` / `read_to` | I read this form myself. / This form was read to me by {name}. | *(to draft)* |
| `rights` | You may say no, or change your mind and stop at any time. The dentist will tell you what stopping may mean for your teeth. You may ask for a second opinion. | Maaari akong tumanggi, o magbago ng isip at ipahinto ang gamutan anumang oras; sasabihin sa akin ng dentista kung ano ang maaaring mangyari sa aking ngipin kapag itinigil ito. |
| `unexpected` | If the dentist finds something unexpected, they stop and explain before doing more, unless stopping would put you at risk. | Kung may matuklasang hindi inaasahan ang dentista, hihinto muna siya at magpapaliwanag bago gumawa ng iba pa, maliban kung makasasama sa akin ang paghinto. |
| `cost` / `cost_later` | The estimated fee is {estimate}. {includes} If it changes, the clinic tells you first. / The dentist tells you the cost before starting, and nothing starts until you agree to it. | Sinabi sa akin ang tinatayang bayad na {estimate} … / Sasabihin ng dentista ang halaga bago magsimula, at walang sisimulan hangga't hindi ako pumapayag. |
| `agree` / `refuse` | I agree to the treatment described above. / I do not agree to the treatment described above, and I understand what may happen without it. | Pumapayag ako sa gamutang nakasaad sa itaas. / Hindi ako pumapayag …, at naiintindihan ko ang maaaring mangyari kung hindi ako magpapagamot. |
| `as_parent` | I am the patient's parent, and I have the right to consent for them. | *(lawyer: "parent", Family Code Arts. 176, 213)* |
| `as_guardian` / `as_written` | I am the patient's guardian appointed by a court, and the order is with the clinic. / A parent of the patient authorised me in writing to consent to this treatment, and the letter is with the clinic. | *(to draft)* |
| `as_substitute` | The patient's parents {ground}. I am the patient's {who}, and 21 or older where the law requires it. | *(to draft)* |
| `as_representative` / `by_mark` | The dentist has recorded that the patient cannot decide for themself. I am their {relation}. / The patient cannot write and made this mark as their signature, in front of the clinic's staff. | *(to draft)* |
| `attest` | I confirmed the details above, explained them to the patient (or parent or guardian) in {language}, answered their questions, and believe they understood. | Ipinaliwanag ko ang nasa itaas … at naniniwala akong naintindihan nila ito. |
| labels | Patient's full name · Date of birth · Signature of the patient · Signature of the parent or legal guardian · Relation · Dentist (name, PRC licence no.) · Explained in · Interpreter · Date and time | Buong pangalan ng pasyente · Petsa ng kapanganakan · Lagda ng pasyente · Lagda ng magulang o legal na tagapag-alaga · Relasyon · Dentista (pangalan, numero ng lisensiya sa PRC) · Ipinaliwanag sa · Tagapagsalin · Petsa at oras |

Every procedure form ends with the same sections: Other choices (always including *No treatment*) · If you do not have it · Cost · Your rights (`rights` + `unexpected`).

### 3.3 Clinic fields (`readClinicPart`)
Every value is read with `visibleOnly` and `oneLine` on the server.

| Kind | Rules |
|---|---|
| `teeth` | FDI numbers, sorted, unique, each `isFdi`, 1 to `maxTeeth` (default 16) |
| `choice` / `choices` | from the list, plus `other` text; `none` is exclusive |
| `text` | 1 to `max` characters (default 160) |
| `number` / `range` | within the bounds |
| `money` | `{kind: amount \| range \| later, from, to, includes}` in centavos, at most ₱5,000,000; `later` only with `allowLater` |
| `yesno` | yes or no |

- Every form except photos carries `dentist_id` (treating, PRC required) and the planned language.
- `fields` holds declared names only, at most 8 KB. A field whose `when` is false is stored as null.
- **Desk fields:** money fields, `fees`, `breakage`, `included`, `relines`, `follow_up`, `visits`, `recheck_weeks`, `maintenance_months`, `visit_weeks`, `made_by`, and photos' `photo_types` and `uses`. Every other field is the dentist's.

### 3.4 The forms
- Fields are the dentist's unless marked *(desk)*.
- Risks list the common ones first, then **less common but serious**.
- Numbers marked *(review)* come from the research catalogue; the reviewing dentist keeps or drops them.
- "FIL: F03" names the catalogue's drafted Filipino lines.

**G. `treatment-2026-09`: Consent to dental examination and treatment**
- Kind `treatment`, already live on the 035 page.
- `TREATMENT_CONSENT`'s words, unchanged: six sections and one tick. No required fields.
- Attest no · guardian for minors · 2 min · English only (open question 5).
- Offered in production only once listed in `CONSENT_REVIEWED`.

**1. `anaesthesia-2026-10`: Local anaesthesia / Pahintulot sa pampamanhid**
- Numbing · order 20 · 2 min · attest · guardian · valid 180 days · ticks explained, risks, history.
- **Fields:**
  - `area` (teeth, from plan teeth) or `area_text` (at most 80); one of the two is required.
  - `technique`: infiltration · nerve block · decided at the visit.
  - `agent` (plus other, at most 60): lidocaine 2% with epinephrine 1:100,000 · mepivacaine 3% plain · articaine 4% with epinephrine 1:100,000.
  - `risk_factors`: heart disease · high blood pressure · pregnant or may be · a reaction to numbing before · blood thinners · none noted.
- **What:** an injection numbs {area}. Lips, cheek and tongue stay numb for a few hours.
- **Why:** so the treatment does not hurt.
- **Risks** (initials):
  - Common: soreness or bruising where the needle went in; a stiff jaw for a few days; a fast heartbeat or shakiness for a few minutes (the epinephrine); feeling faint; numbing may not work fully, most often on an infected tooth.
  - **Less common:** biting or burning the numb lip, cheek or tongue (children most); harder to control swallowing while numb; rarely an allergic or severe reaction needing emergency care; rarely numbness or tingling for weeks or months, very rarely for good (nerve injury).
- **For you:** {risk_factors}, when ticked.
- **Other choices:** no numbing (it may hurt); numbing gel only, for minor care; sedation or general anaesthesia elsewhere, by referral.
- **Afterwards:** while numb, do not bite, suck or scratch your lip, cheek or tongue, and avoid very hot food and drink. A child is watched until it wears off.
- **FIL:** three drafted lines.

**2. `extraction-2026-10`: Tooth extraction and oral surgery / Pahintulot sa pagbunot ng ngipin at operasyon sa bibig**
- Order 30 · 3 min · attest · guardian · 180 days · ticks explained, risks, history.
- **Fields:**
  - `teeth` (required, from plan teeth).
  - `type`: simple · surgical (the gum is opened, some bone may be removed, the tooth may be cut in parts, stitches).
  - `reason` (plus other, at most 120): decay that cannot be repaired · infection · gum disease · crowding or braces · a wisdom tooth causing problems · a broken tooth.
  - `xray`: root near the nerve canal · near the sinus · curved or joined roots · none noted.
  - `risk_factors`: smokes · blood thinners · bone medicines (bisphosphonate or denosumab) · radiotherapy to the head or neck · diabetes · none noted.
  - `follow_up` *(desk)*: at most 120, default "A check-up in 7 days".
  - `estimate` *(desk)*: from the fee guide; may be left for the dentist.
  - Patient question: `keep_tooth`, "Do you want to keep the tooth?"
- **What:** remove tooth {teeth} ({type}). Stitches if needed. You get an aftercare sheet.
- **Why:** {reason}.
- **Risks** (initials):
  - Common: pain, swelling, bruising and some bleeding for a few days (more with blood thinners); a stiff jaw and sore mouth corners; dry socket, a painful socket a few days later (more in smokers and after lower wisdom teeth); infection.
  - **Less common:** damage to a nearby tooth, filling or crown; a small root tip left when removing it is riskier; nerve injury (a numb or tingling lip, chin or tongue), usually temporary, rarely permanent; rarely a broken jaw; swallowing or breathing in a piece of tooth; bone that heals slowly or not at all with bone medicines or after radiotherapy.
- **Upper back teeth** (`teethIn` 14–18, 24–28): an opening into the sinus may happen and need more treatment.
- **Wisdom teeth** (`teethIn` 18, 28, 38, 48; initials): the nerves to the lip, chin and tongue run close to lower wisdom teeth. About 1 in 100 people are left with numbness that does not go away *(review: NHS Sussex, AAOMS)*. Dry socket is more likely. A gum pocket may stay behind the next tooth. Risks rise with age.
- **Findings on your X-ray:** {xray}. **For you:** {risk_factors}.
- **Other choices:** keep the tooth and watch it; a root canal and crown where possible; medicine or draining (only for now); for a wisdom tooth on the nerve, removing only its crown (coronectomy); an oral surgeon; no treatment. "The gap may need an implant, bridge or denture, at extra cost."
- **If you do not have it:** pain, spreading infection or swelling, a cyst, damage to the next tooth, harder surgery later.
- **Afterwards:** follow the aftercare sheet. No smoking, spitting or straws for 24 to 48 hours. {follow_up}.
- **FIL:** F03.

**3. `root-canal-2026-10`: Root canal treatment / Pahintulot sa root canal**
- Order 40 · 3 min · attest · guardian · 180 days · ticks explained, risks.
- **Fields:**
  - `teeth` (exactly 1).
  - `diagnosis` (plus other): an inflamed nerve that will not heal · a dead nerve with infection · an abscess · a failing old root canal (redo).
  - `visits` *(desk)*: 1 to 4, default 2.
  - `after`: a filling · a crown · a post and crown.
  - `estimate` *(desk)*.
  - `estimate_after` *(desk)*: may be left for later; label "The {after}, a separate fee".
  - `specialist`: yes shows "You may ask to see a root canal specialist (endodontist)."
- **What:** open tooth {teeth}, remove the nerve, clean, medicate and fill the canals over {visits} visits, then {after}.
- **Why:** keep the tooth and ease pain or infection ({diagnosis}).
- **Risks** (initials):
  - Common: pain, swelling or tenderness for a few days.
  - **Less common:** a small instrument breaks in a canal; a hole through the side of the root; canals blocked or too curved to finish; filling material past the root end; a crack found during treatment; damage to an existing crown or filling; it may fail and need redoing, root-end surgery or removal; the tooth is weaker and may break without a crown.
- **How it usually goes:** "In large studies, about 9 in 10 root-treated teeth are still in place 4 to 10 years later; a crown afterwards helps most." *(review: Ng et al. 2010; never print "95% successful".)*
- **Other choices:** removal (then an implant, bridge, denture or a gap); watch it; a specialist; no treatment.
- **If you do not have it:** pain, an abscess, losing the tooth.
- **Afterwards:** come back for the {after}; chew on the other side until then.
- **Cost:** two lines, the root canal and the {after}.
- **FIL:** F04.

**4. `restoration-2026-10`: Fillings, crowns, bridges and veneers / Pahintulot sa pasta, crown, bridge at veneer**
- Order 50 · 2 min · attest · guardian · 180 days · ticks explained, risks.
- **Fields:**
  - `kind` (required): filling · crown · bridge · veneer · inlay or onlay.
  - `teeth` (required).
  - `bridge_teeth` (for a bridge).
  - `material` (plus other, at most 60): composite · glass ionomer · porcelain fused to metal · zirconia · lithium disilicate · full metal.
  - `temporary` (for a crown, bridge, veneer or inlay).
  - `visits` *(desk)*: 1 to 6.
  - `estimate` *(desk)*.
- **What:** remove decay or the old filling and shape tooth {teeth}. For a crown, bridge, veneer or inlay: an impression or scan, a temporary, then the final one fitted after you approve its fit and colour.
- **Risks** (initials):
  - Common: sensitivity to cold, heat or biting for days to weeks; a high bite or sore jaw needing a small adjustment; a stiff jaw.
  - **Less common:** the nerve may need a root canal; deeper decay found once work starts (a bigger filling or a crown); chipping, breaking or coming loose; new decay at the edges; a sore gum at the edge; the colour may not match exactly; swallowing or breathing in a crown during a try-in.
- **Crowns and bridges:** the temporary can come off, so come back promptly. Delay lets teeth move. The teeth holding a bridge ({bridge_teeth}) are shaped down for good.
- **Veneers:** enamel removed cannot be put back. A chipped veneer usually cannot be repaired. The colour cannot change after bonding. Biting nails or ice, or grinding, can loosen one (a night guard may be advised).
- **Other choices:** no treatment; another material; a filling instead of a crown (less protection); removal; for a gap, an implant or denture; for looks, whitening, bonding or braces.
- **If you do not have it:** decay spreads, pain, losing the tooth.
- **Afterwards:** no chewing on a new filling until the numbness has gone.
- **FIL:** F05.

**5. `periodontal-2026-10`: Deep cleaning and gum treatment / Pahintulot sa malalim na paglilinis at gamutan sa gilagid**
- Order 60 · 2 min · attest · guardian · 180 days · ticks explained, risks, history.
- **Fields:**
  - `areas`: upper right · upper left · lower right · lower left · whole mouth.
  - `visits` *(desk)*: 1 to 4.
  - `numbing`.
  - `extras`: chlorhexidine mouthwash · antibiotic placed in the gum · none.
  - `recheck_weeks` *(desk)*: 4 to 12, default 6.
  - `maintenance_months` *(desk)*: 3 · 4 · 6.
  - `estimate` *(desk)*.
- **What:** remove tartar and bacteria below the gum and smooth the roots in {areas}, over {visits} visits.
- **Why:** reduce the infection and slow bone loss.
- **Risks** (initials): swelling, soreness and bleeding for a few days; as the swelling goes down the gums shrink, roots show, gaps look bigger and food catches; sensitivity to hot, cold and sweets; teeth may feel loose at first (most firm up, not all); infection.
- **Results:** no guarantee. Smoking, diabetes and home care change them. Without maintenance, gum disease usually returns.
- **Other choices:** no treatment (the disease goes on and teeth can be lost); an ordinary cleaning (it does not reach deep pockets); gum surgery or a periodontist; removing teeth that cannot be saved.
- **Afterwards:** brush and clean between your teeth every day. A recheck in {recheck_weeks} weeks, then maintenance every {maintenance_months} months.
- **FIL:** F07.

**6. `denture-2026-10`: Dentures / Pahintulot sa pustiso**
- Order 70 · 2 min · attest · guardian · 365 days · ticks explained, risks.
- **Fields:**
  - `arch`: upper · lower · both.
  - `type`: complete · partial acrylic · flexible · cast metal · immediate · overdenture.
  - `extract_first` (teeth, optional).
  - `visits` *(desk)*: text, default "Impression, try-in, fitting, then adjustments".
  - `included` *(desk)*: default "Adjustments for 3 months after fitting".
  - `relines` *(desk)*: default "Relines after that are a separate fee".
  - `estimate` *(desk)*.
- **Risks and limits** (initials): weeks to get used to; sore spots needing adjustment visits; speech changes at first; learning to eat again; looseness, most of all with a lower complete denture; gums and bone shrink, so relines or a new denture are needed; immediate dentures need more adjustments and are often temporary; a partial denture's clasps can raise decay and gum problems on the teeth holding them; it may not support the lips and face as natural teeth did; it can break (do not glue it at home); smell or stains without daily cleaning.
- **Other choices:** no replacement (teeth drift and the bite collapses); a bridge; implants; an implant-held denture.
- **Afterwards:** come to every fitting and adjustment. {included}. {relines}.
- The PDA chart's line "a delay of more than 30 days may mean a remake" is left out pending review (open question 9).
- **FIL:** F06.

**7. `implant-2026-10`: Dental implants / Pahintulot sa dental implant**
- Order 80 · 3 min · attest · guardian · 180 days · ticks explained, risks, history.
- **Fields:**
  - `teeth` (sites, required).
  - `timing`: right after an extraction · after healing.
  - `graft`: none · bone graft · sinus lift · both.
  - `scan`: a 3D scan (CBCT) was taken.
  - `healing_months`: 2 to 9.
  - `restoration`: crown · bridge · overdenture.
  - `made_by` *(desk)*: at most 120.
  - `estimate_surgery`, `estimate_restoration` *(desk)*.
  - `risk_factors`: smokes · diabetes · bone medicines · grinding · radiotherapy · none noted.
- **What:** with numbing, the gum is opened, the bone prepared and the implant placed. After {healing_months} months a {restoration} is attached.
- **Risks** (initials):
  - Common: pain, swelling, bruising; infection.
  - **Less common:** the implant does not join the bone and is removed (a retry may be possible); nerve injury (lower jaw), temporary or permanent; an opening into the sinus (upper jaw); injury to nearby teeth; a failed graft; rarely a broken jaw.
  - Later: gum recession or a grey edge showing; a loose screw; a chipped crown; infection around the implant with bone loss (peri-implantitis), in about 1 in 5 patients in studies *(review)*.
- **How it usually goes:** about 96 in 100 implants are still in place after 10 years in studies *(review: Howe 2019)*. Smoking, uncontrolled diabetes and some bone medicines raise the risk of failure.
- **Other choices:** no replacement; a bridge; a removable denture; a resin-bonded bridge.
- **Afterwards:** clean around it like a tooth, with regular reviews.
- **Cost:** two lines, the surgery and the restoration.
- **FIL:** F10.

**8. `ortho-2026-10`: Braces and orthodontic treatment / Pahintulot sa braces**
- Order 90 · 3 min · attest · guardian · 365 days · ticks explained, risks.
- **Fields:**
  - `appliance`: metal braces · ceramic braces · clear aligners · removable appliance · functional appliance.
  - `extractions` (teeth, optional).
  - `mini_screws`.
  - `months`: a range, 3 to 48.
  - `visit_weeks` *(desk)*: 2 to 12.
  - `fees` *(desk)*: at most 200.
  - `breakage` *(desk)*: at most 160.
  - `retainer`: at most 120.
  - `estimate` *(desk)*: the total.
- **Risks** (initials): discomfort after adjustments; white spots and decay without good cleaning; gum disease; roots may shorten (this cannot be predicted); a tooth hurt in the past may lose its nerve; mini-screws can loosen, break or irritate; jaw joint problems, with or without braces; impacted teeth may not move; injury from the appliance, or swallowing a part; allergy to a material; treatment may take longer and fees may change; smoking worsens results.
- **Results:** teeth tend to move back, so retainers are worn long-term. No one can promise straight teeth for life. Wisdom teeth may push teeth.
- **Records:** X-rays, photos and models are part of the treatment.
- **Other choices:** no treatment; limited treatment; crowns or veneers; jaw surgery (a specialist).
- **Cost:** {estimate}; {fees}; {breakage}. Moving to another dentist may change fees and time.
- **FIL:** F08.

**9. `whitening-2026-10`: Tooth whitening / Pahintulot sa pagpapaputi ng ngipin**
- Order 100 · 2 min · attest · not for under 18 · 90 days · ticks explained, risks.
- **Fields:**
  - `method`: in the clinic · trays at home · both.
  - `product`: at most 80.
  - `strength`: at most 40, for example "hydrogen peroxide 35%".
  - `sessions` *(desk)*: 1 to 10.
  - `shade_before`: at most 20.
  - `wont_change` (teeth, optional).
  - `estimate` *(desk)*.
- **Patient questions**, each able to stop the page:
  - `pregnant` (yes / no / not sure): stops on yes or not sure.
  - `smoke_drink`: stops on yes.
  - `recent_work`, "A filling or crown in the last 2 weeks?": stops on yes.
- **Before:** an examination, and treatment of decay and gum disease, come first. The product label says: not for anyone under 18, not while pregnant, not for people who smoke or drink often, and not within 2 weeks of a filling or crown *(ASEAN Cosmetic Directive, Annex III)*.
- **Risks:** sensitive teeth, usually mild and short; sore gums from the gel.
- **Limits:** only natural teeth whiten. Fillings, crowns, veneers and dentures ({wont_change}) do not, and may need replacing to match, at extra cost. Results vary and fade. White spots may look more visible for a while.
- **Other choices:** no treatment; cleaning and polishing; bonding, veneers or crowns.
- **FIL:** F09.

**10. `photos-2026-10`: Photos and use of records / Pahintulot sa litrato at paggamit ng rekord**
- Records · order 200 · 1 min · attest no · guardian · valid until withdrawn · `refuseUnsigned` · no ticks.
- **Fields** *(desk)*:
  - `photo_types`: inside the mouth · face.
  - `uses` (required): sharing with a specialist or laboratory for this treatment · teaching and journals without your name · the clinic's website or social media.
- **Patient questions:** one yes/no per use offered, none pre-ticked. For social media, also `face` and `name`, both defaulting to no.
- **For your record** (text, not a choice): photos, X-rays and scans for diagnosis and your record are part of your care. They are covered by the general consent's *Examination* point and the privacy notice.
- **Your choices:** "Saying no to any of these does not change your care." (NPC Circular 2023-04: granular, no bundling, no "Required" on an optional item.)
- **Withdrawing:** tell the clinic in person, by phone or by text. It stops future use; what was already published or printed may not be recalled.
- **FIL:** F12.

**Not in the library**
- Informed refusal: it is the signed *I do not agree* on each form.
- Minor and guardian: the signature rules of §2.3, plus assent recorded at attestation.
- Sedation (open question 8).

### 3.5 On screen
- **One renderer.** `ConsentDocument.astro` (`src/components/consent/`) draws a document in three modes:
  - `patient`: the page of §2.3, with inputs.
  - `preview`: read-only, in a 390px box inside a `SidePanel`. Not an iframe, because every page sends `frame-ancestors 'none'`.
  - `record`: read-only, drawn from the snapshot.
- **Styles** in `consent.css`, inside `@layer components`: headings 18px/700; risks under two sub-heads; the initials box right-aligned; Filipino in ink-2 under the English; "For" pills using the record's `.rp` classes.
- **Hooks** are `data-cd-*`. The desk's are `data-ik-*` and the patient pages' are `data-ip-*`.

### 3.6 A4 print (`…/consents/<doc>/print/`)
**Source and page**
- Drawn from the latest signing's snapshot (for paper, from the unsigned document). It is never re-rendered from the library.
- Black on white. Audit `consent.print`.
- `@page { size: A4; margin: 16mm 16mm 20mm }`. Bottom left: "CF-7K2FQ · extraction-2026-10". Bottom right: "Page x of y".

**Content**
- **Head:** the clinic's name, address and phone from the snapshot, with no logo and no invented letterhead; the reference, version and languages. Title 16pt; Filipino 12pt.
- **Patient box:** patient, born (age), chart number (labelled "from the record", outside the snapshot), who signed and as whom, relation, authority and ground, explained by (with PRC), in which language, interpreter, and whether they read it themself or it was read to them and by whom.
- **Body:** the facts, "In short" in a box, sections at 10.5pt ending "Initials: JDC", ticks as ☑, the decision as ☑/☐, and the patient's answers as a table.
- **Signature block** (`break-inside: avoid`):
  - the strokes as SVG (`Signature.astro`), the name and capacity;
  - where and how it was signed: "Signed 29 Sep 2026, 10:42, Manila, on the patient's phone", or "on the clinic's tablet", "by mark, witnessed by Liza Santos 10:44", or "on paper, recorded by …, scan: file";
  - the short seal.
- **Dentist line:** "Confirmed and explained in Filipino by Dr Ana Reyes, PRC 0123456, 29 Sep 2026, 10:20", plus assent for ages 7–17. Then a withdrawal line, if any.
- **Evidence footer** (8pt; hashes in Plex Mono), facts only:
  - "Link made by Liza Santos 10:31 · page opened 10:40 · decided 10:42 (open 2 min 10 s before deciding) · sent 10:48".
  - Nobody is called a witness unless they confirmed it.
  - The words' SHA-256, the seal, and "Chain no. 1432".

**The check**
- When the snapshot hash, the seal and its chain link all recompute (§4.6), the page says **"Unchanged since it was stored"** in green words.
- Otherwise a red callout, which also prints: "This copy does not match what was stored. Do not use it as the original."
- The seal can be compared with the patient's copy and with the Close the day sheets, which are kept outside the database.

**Paper for signing** (`records.edit`; a procedure form only once it is attested)
- Empty ☐ boxes and initials boxes, signature lines for the signer (name, relation, authority) and the dentist, and a date line.
- Sets `paper_printed_at`. Audit `consent.paper_print`.

### 3.7 Freezing what was signed
- **The snapshot.** `snapshotText` is the `canonicalJson` of:
  `{ schema: 1, document, ref, version, code, library, langs, clinic, patient, dentist, attested: {at, lang, interpreter, assent} | null, title, for, in_short, sections, ticks, answers, fields, decision, decision_words, signer: {name, as, method, relation, authority, ground, note}, read, explained_in, meaning, date }`
  - Canonical means keys sorted, no whitespace, NFC strings, integers, and `fields` exactly as stored.
  - The server renders it at the moment of the decision. It never comes from the browser.
- **Checks in the database.** The definer checks the snapshot's `document`, `version`, `decision`, `fields`, signer name and `attested.at` against the rows. The `consent_signing` trigger computes both hashes; callers cannot supply them. The chain row follows once the form is on a record (§4.6).
- **Library words are pinned.** `consent_version.body_sha256` is `sha256(canonicalJson(template))`.
  - `templatesInForce()` offers a template only when the two match, and `consent-library.test.ts` fails when they differ.
  - New words are a new version id and a new row, in one change.

### 3.8 Review gate and versions
- `CONSENT_REVIEWED` starts empty.
- In production a template, **the general consent included**, is offered only when it is listed. Filipino lines show only when its `langs` include `fil`, and the snapshot records `langs`.
- Development offers every template, with the "Not reviewed" tag.
- `treatment-2026-09` is already signed live on the 035 page without a review. The owner either lists it after the dentist and lawyer read it, or lists it now knowingly. Either way the decision is written in CLAUDE.md, not in code.
- Words the lawyer changes ship under new version ids (`-2026-11`, migration 040 or later).

### 3.9 Clauses never used
- Liability waivers, and making the patient pay the clinic's attorney's fees or collection costs (Civil Code Arts. 6, 1171, 1172).
- Blanket authority. The narrow `unexpected` line replaces it.
- A pre-printed "I have no further questions".
- Precise success claims such as "95%".
- "Noncompliant patients may be dismissed".
- "Required" on an optional item.
- The PDA chart's Religion field.

---

## 4. Data model: `src/data/migrations/039_patient_intake.sql`

- **Additive:** new tables, nullable columns, and one widened check each on `consent_version` and `patient_consent`.
- **Row-level security:** every new table has `clinic_id`, with RLS enabled and forced under the `tenant_isolation` policy.
- **The public side has no tenant.** The definers of §4.5 are the only way in, the clinic comes from the token, and none raises an error that contains an answer.
- **Limits:** names ≤ 120 characters; relation ≤ 60; notes ≤ 200 or 300; answers ≤ 4 KB; page 1 ≤ 24 KB; fields ≤ 8 KB; snapshot ≤ 64 KB; strokes 1–80 lines and ≤ 120,000 characters.

### 4.1 The library
- `consent_version` gains `code` and `body_sha256`. Its kinds become `privacy | treatment | document`.
- Checks: `(kind = 'document') = (code is not null)`, and a document's hash is 64 hex characters. The general consent gets its hash by an update in 039.
- `current_document_of(code)` (definer, stable) returns the row in force on the Manila day.
- Ten rows, `anaesthesia-2026-10` to `photos-2026-10`, in force from 2026-10-01. Their hashes come from `npm run consent:hash`. Placeholders are refused, so the file cannot be applied unfilled.

### 4.2 Tables

**`intake`**
- Columns: `ref` (`IN-` + 4), `target` (`new` | `existing`), `patient_id`, `appointment_id`, `label`, `form_version`, `desk_minor` (`yes` | `no` | `unsure`), `came_with` (`parent` | `guardian` | `other_adult` | `nobody`), `answers`, `page1_done_at`, `privacy_version`, `privacy_at`, `privacy_as` (`patient` | `parent` | `court_guardian` | `none`), `privacy_by_name`, `privacy_relation`, `id_tries` (0–3), `verified_at`, `status` (`preparing` | `out` | `sent` | `added` | `cancelled`), `rev`, `created_by`, `created_at`, `last_activity_at`, `sent_at`, `send_nonce`, `decided_by`, `decided_at`, `added_as`, `cancelled_by`, `cancelled_at`, `cancel_reason`.
- Checks:
  - `existing` has a patient and no page 1.
  - A privacy agreement names its person.
  - `added` has a patient and a decision.
  - `sent` and `added` have `sent_at`.
  - `cancelled` if and only if `cancelled_at` is set.
- Trigger:
  - identity columns never change;
  - `added` and `cancelled` are final;
  - allowed moves: preparing → out or cancelled; out → preparing, sent, added or cancelled; sent → added or cancelled;
  - the patient is set once, belongs to this clinic, and is not archived;
  - the visit is that patient's.

**`clinic_tablet`**: `name` (≤ 40), `secret_sha256` (unique), `created_by`, `created_at`, `last_seen_at`, `retired_at`, `retired_by`.

**`intake_link`**
- Columns: `token` (26 characters of `KEY_ALPHABET`), `intake_id` (on delete cascade), `device` (`phone` | `tablet` | `desk`), `tablet_id`, `created_by`, `created_at`, `open_by` (+15 min), `claimed_at`, `device_sha256`, `last_seen_at`, `retired_at`, `retired_why` (`replaced` | `stopped` | `switched` | `cancelled` | `sent` | `idle` | `expired` | `locked`).
- One live link per intake.
- `tablet` and `desk` links are inserted already claimed.
- A link can be made only for an intake that is `preparing` or `out`. After that it can be claimed once and retired once, and nothing else changes.

**`consent_document`**
- Columns: `ref` (`CF-` + 5), `version_id`, `intake_id` (on delete set null), `patient_id`, `appointment_id`, `plan_item_id`, `fields`, `dentist_id`, `dentist_name`, `dentist_prc`, `explained_in`, `explained_other`, `interpreter`, `sort`, `rev`, `prepared_by`, `prepared_at`, `changed_at`, `paper_printed_at`, `cancelled_by`, `cancelled_at`, `cancel_why` (`removed` | `renewed` | `minor` | `intake`).
- Trigger:
  - The version is of kind `treatment` or `document`.
  - Every form except general and photos names a dentist with a PRC licence.
  - The patient and the intake belong to this clinic.
  - `clinic_id`, `ref`, `version_id` and `prepared_*` never change. `patient_id` changes only from null to a value.
  - **Once attested, signed or printed for paper,** these are frozen: `fields`, `dentist_*`, `explained_*`, `interpreter`, `appointment_id`, `plan_item_id` and `sort`.
  - Once signed, the form cannot be cancelled, and `intake_id` changes only to a new intake that re-signs a refused or withdrawn form.
  - A change to the fields or the dentist bumps `rev`.

**`intake_page`** (written by the definers only; keyed on intake and document, both on delete cascade)
- `state` (`reading` | `read` | `question` | `agreed` | `refused` | `later`), `doc_rev`, `answers`, `signed_by_name`, `signed_as` (`patient` | `guardian`), `method` (`sign` | `mark`), `relation`, `authority` (`parent` | `court_guardian` | `substitute` | `written` | `representative`), `authority_ground`, `authority_note`, `explained_in`, `read_by`, `strokes`, `snapshot`, `opened_at` (nullable; reset with the page), `decided_at`.

**`consent_signing`** (insert-only)
- Columns: `document_id` (on delete restrict), `intake_id`, `decision`, `channel` (`phone` | `tablet` | `desk` | `paper`), `method`, `snapshot`, `snapshot_sha256`, `seal_sha256`, `answers`, the signer columns, `explained_in`, `read_by`, `strokes`, `signed_on`, `attachment_id`, `needs_confirm` (`witness` | `authority`), `link_by`, `opened_at`, `decided_at`, `recorded_by`, `signed_at`.
- Unique `(intake_id, document_id)` where `intake_id` is not null.
- Checks:
  - Paper has `signed_on`, `attachment_id` and `recorded_by`, and only paper has them.
  - Strokes may be absent only for paper or for a photos refusal.
  - `mark`, and every authority except `parent`, never on `phone`.
- Trigger:
  - the document is open and this clinic's;
  - an `attest` form was attested before `decided_at`;
  - a paper scan is this patient's and was uploaded after the print;
  - the snapshot matches the rows;
  - `needs_confirm` is computed here;
  - both hashes are computed here, whatever the caller passed: `consent_seal(snapshot_sha256, strokes | 'paper <date> <attachment>', name, as, method, signed_at)`.

**`consent_attestation`** (insert-only, one per document)
- `dentist_id`, `dentist_name`, `dentist_prc`, `explained_in`, `interpreter`, `assent` (required for ages 7–17), `fields_sha256`, `attested_at`.
- Only the document's own treating dentist, with a PRC licence and access here. Never for photos or the general consent.

**`consent_confirmation`** (insert-only, one per signing)
- `kind` (`witness` | `authority`), `staff_id` (with `records.edit` here), `attachment_id`, `note`, `confirmed_at`.
- It must match the signing's `needs_confirm`.

**`capacity_note`** (insert-only): `patient_id`, `dentist_id` (treating, with PRC), `reason`, `recorded_at`.

**`consent_withdrawal`** (insert-only, one per signing): `told_by_name`, `how`, `note`, `recorded_by`, `withdrawn_at`. Only the latest signing on a form, and only when it is agreed.

**`consent_override`** (insert-only): `document_id`, `context` (`plan_done` | `in_chair` | `strip`), `state_then`, `reason`, `staff_id`, `at`.

**`consent_chain`** (insert-only): `seq`, `signing_id` (unique), `seal_sha256`, `prev_sha256`, `chain_sha256`, `at`.

**`intake_event`** (insert-only)
- `kind`: `started`, `link`, `handover`, `opened`, `page1`, `reading`, `read`, `question`, `decided`, `resign`, `sent`, `stopped`, `switched`, `cancelled`, `added`, `seen`, `expired`, `idle`, `identity`, `locked`, `age_check`, `cancelled_doc`, `confirm`, `renewed`, `dismissed`.
- Also `document_id`, `detail` (≤ 120, never an answer), `staff_id`, `at`.

**Columns added to existing tables**
- `medical_history.intake_id`.
- `patient_consent.intake_id`, with the new channel `intake`. An `intake` row requires `recorded_by`, `agreed_as` and `given_by_name`, as a `form` row does.

### 4.3 Grants
First revoke the default privileges on every new table, then grant:
- `intake`: select, insert, and update of the desk's columns (status, patient, visit, label, desk answers, rev, decision, cancel).
- `intake_link`: select, insert, and update of the retirement columns.
- `clinic_tablet`: select, insert, and update of the name and retirement.
- `consent_document`: select, insert, and update of the columns in §4.2 (the trigger freezes them).
- `intake_page`: select only.
- Every insert-only table: select and insert.
- `intake_gate` is granted to nobody.

### 4.4 Locking
**The intake is locked first, then the link, everywhere.**
- `intake_gate` reads the link without a lock to find its intake, locks the intake `for update`, then locks the link `for update`, re-reading it after any wait.
- Every desk write also locks the intake first (§5.2).
- So a patient's Send and the desk's Stop never deadlock, and whichever comes second sees the result of the first.

### 4.5 The definers
`p_device` is the SHA-256 of the device's secret.

- **`intake_gate`** (internal): returns `unknown` · `welcome` · `verify` · `open` · `taken` · `expired` (15 min unclaimed, or 24 h since start) · `idle` (20 min unseen) · `replaced` · `locked` · `finished` · `closed`. It retires links past their time and touches `last_seen_at` when the link is open.
- **`intake_view`**: the clinic's face for every status; the number of parts at `welcome`; the pages only at `open`. Each page carries `signable` (general, photos, or attested) and the attestation's dentist, language and time.
- **`intake_claim`**: phone links only.
- **`intake_verify`**: the birth date must equal the record's. A miss adds one to `id_tries`; at 3 the link retires as `locked`.
- **`intake_ping`** and **`tablet_poll(secret)`**: `tablet_poll` returns the tablet's live link, or `ready`.
- **`intake_save_page1`**: only for `new` and `out`.
  - The privacy screen re-checks page 1, the notice version in force (`changed` otherwise) and who agrees: for a minor, a parent, a court-appointed guardian or `none`; for an adult, the patient.
  - The age check against `desk_minor` answers `age_check` until one side changes.
  - For a minor, whitening forms are cancelled (`minor`).
  - A change in who they are resets signed pages and `opened_at` (event `resign`).
- **`intake_mark_page`**: `opened` (sets `opened_at` if it is null) · `question` · `read`. A page drawn at an older `rev` starts again.
- **`intake_decide`**: returns `saved` · `not_ready` (an `attest` form with no attestation) · `changed` · `order` · `invalid` · or a gate status.
  - `later` clears the page.
  - Agree and refuse apply the rules of §2.3:
    - the patient's name must equal the server's;
    - on a phone, only the patient or a parent may sign;
    - substitute authority needs a ground, a category and 21 or over;
    - a representative needs an adult patient and a capacity note from the last 30 days;
    - a mark needs an adult patient on a clinic device;
    - photos may be refused without strokes.
  - Then the snapshot checks run.
- **`intake_send`**:
  - `again` for the same nonce.
  - `unfinished` when page 1 is not done, the privacy version is not in force, or a page has no decision. `read` and `later` count as decided.
  - `changed` when a page's version is no longer in force. Nothing is wiped.
  - Otherwise it inserts one `consent_signing` per agreed or refused page and retires the link as `sent`.
  - It then runs `update intake … where id = $1 and status = 'out'` and checks that exactly one row changed. The result is `sent` for a new patient, `added` for a patient on file.

### 4.6 The chain
- When a signing becomes part of a record (at insert if its document already has a patient, otherwise when Add sets `patient_id`), a trigger takes `pg_advisory_xact_lock(hashtext('consent-chain:' || clinic_id))` and inserts a chain row:
  - `seq` = the last one + 1;
  - `prev_sha256` = the previous row's `chain_sha256` (64 zeros for the first);
  - `chain_sha256 = sha256(prev ‖ seal ‖ seq)`.
- Signings that are never added are never chained, so the purge cannot break the chain.
- `consent_chain_head(clinic, day)` is printed on Close the day: "Consent forms: 1432 · 7C1E-09AB-44".
- `consent_chain_check(clinic)` walks the whole chain.

### 4.7 Record functions (invoker, under RLS)
- `consent_document_state(doc)`: `cancelled` · `to_sign` · `to_confirm` · `agreed` · `refused` · `no_photos` · `withdrawn`.
- `visit_treatment_consented(appointment)`: true for a `visit_consent` row, or when the visit's general consent form is `agreed`. Used by `cal/data.ts`, the visit strip and `panels.ts`.

### 4.8 Retention (`retention_purge()`, same signature)
1. Texts after 2 years, and poster forms not added after 30 days, as today.
2. Intakes, in their own `begin … exception when others then raise warning … end` block, so that step 1 always runs:
   - Purged: intakes `preparing`, `out` or `cancelled` that were started more than 24 hours ago, and intakes `sent` more than 30 days ago.
   - **A sent intake is held, not purged,** when it holds a signing and either a patient here likely matches it (same names and the same or no birth date, or the same mobile) or it is linked to a visit. A held intake waits for Add or Dismiss.
   - Delete order: the intakes' events, pages and links; then, for documents with no patient, their confirmations, signings, attestations and the documents themselves; then the intakes.
   - Documents that belong to a patient on file stay.

### 4.9 Where it meets the existing tables
- **`patient`:** a new patient's row is written only when the desk adds a sent intake, with `created_by` set to the person adding. The intake's documents get `patient_id` in the same transaction.
- **`patient_form`** (the poster, 028) is untouched. The two paths share `STEPS`, the parser engine, the gate list and `patient-add.ts`.
- **`patient_consent`:**
  - Page 1's privacy agreement becomes one row at Add: channel `intake`, `given_at = privacy_at`, `agreed_as` and `given_by_name` from the intake, and `recorded_by` the person adding.
  - `none` writes nothing.
  - Procedure consents are never `patient_consent` rows, and `readConsents()` stays privacy-only.
- **`visit_consent`** (035) is untouched and still read.
- **`medical_history`**, at Add: `answered_by 'patient'`, `recorded_by` null, `answered_at` the time it was added, `intake_id`, and `answers.intake = {id, ref, version, sent_at}`.

---

## 5. Server code

### 5.1 Modules
- **`consent-library.ts`**: §3.1.
- **`consent-seal.ts`**:
  - `canonicalJson`, `snapshotText`, `sha256Hex`, `libraryHash`, `shortSeal`.
  - `templatesInForce(q)`: the rows that are in `TEMPLATES` and whose hashes match.
  - `verifySigning(tx, id)` → `{ snapshotOk, sealOk, chainOk }`, recomputed in SQL.
  - `npm run consent:hash` prints the hashes.
- **`intake-def.ts`** (no Node imports): `INTAKE_FORM_VERSION` and `INTAKE_DEF`.
  - The parsing engine moves out of `parsePatientForm` into `patient-forms-def.ts`: `FormDef`, `indexFields`, `parseForm`, `parseScreen`.
  - `parsePatientForm = (f, o) => parseForm(FORMS_DEF, f, o)`, proven by the unchanged fixtures.
- **`refused.ts`**: one `Refused` class (`reasons: string[]`).
  - `intake.ts` and `consent-docs.ts` always **throw** it.
  - Pages catch it outside `withClinic`, so the transaction, including its rev bump, rolls back.
  - The four page-local copies move to it as those pages are touched.
- **`patient-add.ts`** (phase 1): the add path, taken out of `patient-forms.ts`, where these helpers are private today.
  - `insertPatientFromAnswers` (`nextChartNos` under `lockClinic`), `fillPatientFromAnswers` (`planFill`, `FILLABLE`, the mobile and email rule), `writeHealthFromAnswers`, `writePrivacyConsent`.
  - They take `PatientFormValues`-shaped answers and a source, `{ formId } | { intakeId }`.
  - The forms queue and `addIntake` both call them. `scripts/dev/qr-forms/backend-test.mjs` passes unchanged.
- **`intake.ts`** (the desk side, inside `withClinic`):
  - `startIntake`, `loadIntake`, `suggestConsents`, `saveChecklist`, `saveClinicPart`, `goLive`, `stopLink`, `cancelIntake`, `dismissIntake`, `renewDocuments`, `setDeskAnswers`, `intakeStatus`, `addIntake`, `markSeen`, `confirmSigning`, `registerTablet`, `removeTablet`.
  - `page1Open = phoneOpen = formsNoticeReady`.
  - `offered(t) = !isProduction() || CONSENT_REVIEWED.some((r) => r.version === t.version)`.
  - Tokens are 26 characters of `KEY_ALPHABET` from `crypto.randomInt`. Refs are retried on conflict up to 12 times.
- **`intake-public.ts`** (the patient side; each call is one `publicRead`):
  - `deviceSecret`, `lookupIntake`, `claimIntake`, `verifyIntake`, `savePage1`, `markPage`, `decidePage`, `sendIntake`, `pingIntake`, `pollTablet`, `INTAKE_WORDS`.
  - `lookupIntake` returns `welcome | verify | open | unavailable | expired | idle | taken | replaced | locked | closed | finished | unknown | wait`.
  - It is `unavailable` for a phone link while `!phoneOpen`, for page 1 while `!page1Open`, or when any page is not `offered`. Every public write checks these first.
- **`consent-docs.ts`** (the record side): `loadConsentDocuments`, `loadConsentDocument`, `attestDocument`, `recordCapacity`, `withdrawConsent`, `printForPaper`, `recordPaperSigning`, `cancelDocument`, `overrideConsent`, `consentGaps({ planItemId?, visitId? })`.
- **`park.ts`**: the `fl_park` hint (HMAC with `SESSION_SECRET`; httpOnly, Secure, SameSite=Strict, `Path=/auth/`, 24 h). It grants nothing, and `readSession` is unchanged.

### 5.2 Every staff write
Each write follows these steps:
1. `csrfOk`, else redirect with `?stale=1`.
2. `hit('record:s:'+staffId)`.
3. `withClinic`.
4. First line in the transaction: `canEditRecords`, else throw "Your account cannot add patients at this branch. Ask the owner."
5. Lock the intake `for update`, then its live link.
6. `update intake set rev = rev + 1 where id = $1 and rev = $2`. If no row changes: "Someone else changed these forms while you were working. Here they are as they are now."
7. Anything refused throws.

| Action | Checks inside the transaction | Audit |
|---|---|---|
| `startIntake` | A patient on file is not archived and has a birth date; the visit is theirs and going ahead. `new` needs `page1Open`; phone needs `phoneOpen`. Forms moved in are theirs, not cancelled, and never signed or last refused or withdrawn | `intake.start` |
| `saveChecklist` | Status `preparing`; the desk's answers; each code `offered` and in force; no whitening for a minor; new forms made and unticked unsigned ones cancelled; only accepted plan items pre-tick | `intake.consents` |
| `saveClinicPart` | `readClinicPart`; the dentist treats, has access and a PRC licence. Dentist fields stay proposals unless the named dentist ticks *Confirm*, which calls `attestDocument` | `intake.prepare` |
| `goLive` | Phone: `phoneOpen` and the `intake:m:` limit. Tablet: registered and seen in the last 2 min. Desk: this browser's new secret. The old link retires as `replaced`; status becomes `out` | `intake.link` / `intake.handover` |
| `/auth/park/` | `goLive` (desk), then `clearSession` and the hint | `intake.handover` |
| `stopLink` · `cancelIntake` · `dismissIntake` | Retire the link; `change` sets `preparing`. Cancel: not added; unsigned forms cancelled. Dismiss: status `sent`, and a reason | `intake.stop`, `intake.cancel`, `intake.dismiss` |
| `renewDocuments` | Unsigned forms whose version is no longer in force are cancelled (`renewed`) and remade at the version in force. Fields are copied when the field set is unchanged. They need attesting again | `consent.renew` |
| `setDeskAnswers` | Status `preparing` or `out` | `intake.age` |
| `confirmSigning` | The signing needs it; the confirmer is not the signer; an authority names a patient file | `consent.confirm` |
| `addIntake` (new patient) | `lockClinic`; status `sent`; every look-alike in `seen`; the `patient-add` helpers; the privacy row unless `none`; the forms go to the patient, and chain rows follow | `intake.add`, `patient.create`, `health.update`, `consent.intake` |
| `addIntake` (patient on file) | As above; the patient not archived; empty fields only, never a name; mobile and email only when in `use` | `intake.add`, `patient.update`, `health.update`, `consent.intake` |
| `attestDocument` | The named treating dentist with a PRC licence; the form open, unsigned and unprinted; assent for ages 7–17; freezes the fields | `consent.attest` |
| `recordCapacity` | A treating dentist with a PRC licence; an adult patient | `consent.capacity` |
| `withdrawConsent` | The latest signing is agreed | `consent.withdraw` |
| `printForPaper` | Unsigned; attested when the form requires it | `consent.paper_print` |
| `recordPaperSigning` | Printed; `signedOn` between the print day and today; the scan; the signer rules; channel `paper` | `consent.paper` |
| `cancelDocument` | No signing | `consent.cancel` |
| `overrideConsent` | A reason | `consent.override` |
| `registerTablet` · `removeTablet` | `settings.edit` | `tablet.add`, `tablet.remove` |
| `/auth/unlock/` | `authenticateAt` with the door's limits | `login.ok`, `device.unlock` |

- Viewing a document audits `consent.view`; printing audits `consent.print`.
- `suggestConsents` reads:
  - the booking, shown unticked as "not yet examined";
  - plan items a treating dentist accepted, pre-ticked;
  - the patient's age and signed forms.

### 5.3 The public side
- **Every POST:**
  - `readCappedForm(request, 192 KB)`; over the cap answers 413.
  - A CSRF miss re-renders with the answers and a 403.
  - A filled honeypot is answered as if saved, and nothing is written.
  - The device secret comes from `fl_idev`, `fl_ctab`, or the one the desk made. With none on a claimed link, the answer is `taken`.
- **Limits** (`LIMITS.intake`):
  - `make [60, 3600]`, key `intake:m:<staff>`.
  - `link [900, 3600]`, key `intake:l:<intake>`: posts and pings on one intake.
  - `ip [600, 3600]`, key `intake:ip:<clinic>:<ipBucket>`: posts only, per clinic, because carrier CGNAT carries many clinics' patients.
  - `poll [120, 60]`, key `intake:poll:<staff>`.
  - `tablet [1200, 3600]`.
  - Unknown tokens count `forms:miss:<ipBucket>`. A real, live link is never refused by it.
- **Idempotency:** decisions are keyed by (intake, document). Send carries a fresh `NONCE_FIELD`, and the same nonce again answers `again`.
- **Never logged:** answers, strokes, snapshots, tokens and secrets.
  - Errors log the intake id only; the middleware redacts `/f/i/<token>` and `/f/<key>`.
  - A token in a host's access log lives at most 24 hours and is bound to its device.

### 5.4 Deciding a page (`decidePage`)
1. `lookupIntake`: open, on this device. The answer is `not_ready` unless the page is signable.
2. `readPatientPart(t, raw, { minor, device })`. The patient's name comes from the view, never from the post.
3. `readStrokes`, except for a photos refusal.
4. `renderDocument(t, fields, { clinic, patient, dentist, attested, langs, answers, initials, decision, signer, read, explained_in, date: manilaToday() })`.
5. `snapshotText`.
6. `intake_decide`.

### 5.5 Production gate

| Path | Production, notice not listed | Notice listed in `FORMS_PRIVACY_VERSIONS` |
|---|---|---|
| Page 1, on any device | Closed. New patients are typed at `/new/type/?next=consents` (with desk consent), then get a consents-only intake | Open |
| The phone link | Closed: the card is disabled, `goLive` refuses, the link is `unavailable`, public writes refuse | Open |
| Clinic devices, consents only, patients on file | Open (like the live 035 page) | Open |
| Templates | Only those in `CONSENT_REVIEWED`, the general consent included | Same |
| Filipino lines | Only for `langs` that include `fil` | Same |

A development machine opens everything and tags unreviewed words.

---

## 6. Pages and routes

| Route | File | What |
|---|---|---|
| `/c/<slug>/patients/new/` | `patients/new/index.astro` (replaces `new.astro`) | Screen A |
| `…/patients/new/type/` | `patients/new/type.astro` | Today's Add patient, moved: paths, `here`, `?next=consents`. Fix the stale `canBill` comment |
| `…/patients/intake/` | `patients/intake/index.astro` | The list; POST `intent=start` |
| `…/patients/intake/<id>/` | `patients/intake/[intake].astro` | Screens B–F (`?step=`) |
| `…/patients/intake/<id>/status/` | `patients/intake/[intake]/status.ts` | The live panel's JSON (no-store) |
| `/auth/park/` | `auth/park.ts` | Hand this device over |
| `/auth/unlock/` | `auth/unlock.astro` | Sign in again (`StaffEntrance`, `SignInForm` pieces) |
| `/f/i/<token>/` | `f/i/[token].astro` | The patient's pages (the `/f/[key]` shell and no-leak script, `_Field`, `ClinicRoom`, `ClinicBadge`, `patient.css`, `clinic-glass.css`) |
| `/f/t/` | `f/t/index.astro`, `f/t/poll.ts` | A clinic tablet's waiting screen |
| `…/settings/` → Clinic tablets | A settings section | Register, name and remove tablets |
| `…/patients/<id>/consents/<doc>/` | `patients/[patient]/consents/[document].astro` | One form on the record |
| `…/consents/<doc>/print/` | `…/[document]/print.astro` | The A4 print |

- **Shared components:** `src/components/consent/ConsentDocument.astro`, `consent.css`, and `SignPad.astro`. `SignPad` is taken out of `sign/[visit].astro`, and that page's markup is compared before and after.
- **Styles:** `intake.css` (`ik-*`) and `f/i/_intake.css` (`ip-*`).
- No new first path segment is needed.

---

## 7. The record after

**Landing.** `?saved=intake&intake=<id>` shows a green callout on the Overview: "Juan is added. 2 consent forms signed · 2 to sign at the chair · 1 not agreed". Each part links to the Consent section.

**Head chips.** Each is a button to Consent, with colour plus words:
- "Not agreed: Tooth extraction" (soft red)
- "To sign: 2 consent forms" (amber)
- "To confirm: 1 signature" (amber)
- "Waiting for Dr Reyes to explain" (blue)

**Consent section.** A new **Consent forms** pane between *Privacy consent* and *Signed at visits*, newest first.
- Each row: title, teeth, a state pill from `consent_document_state` (Signed 29 Sep · Did not agree · No photos · To sign · To confirm · Withdrawn 3 Oct), the signer (`Who.astro`), a mini signature, the dentist line, **Open** and **Print**.
- Header actions: quiet **Prepare consent forms**, and *Record that the patient cannot decide*.
- A *To sign* row adds **Explain and confirm** (for the named dentist), **Sign on this tablet** and **Print for signing on paper**.
- The existing panes stay as they are.

**Asks first.** Mark done on a plan item, *In the chair* (`/api/schedule`) and the visit strip's done lines call `consentGaps`.
- If a linked form is refused, withdrawn, to sign, to confirm or not explained, it asks: "The patient did not agree to Tooth extraction · 36 on 29 Sep. Record it anyway?"
- A reason is required, stored in `consent_override` and audited as `consent.override`.
- It never blocks.

**Timeline and VisitPanels**
- Timeline (`loadVisits`): a signed form joins its visit's "Consent signed" line; otherwise it is a between-visits line (ref `cdoc:<id>`).
- VisitPanels gains a "Consent forms" block. "Read what they signed" is drawn from the snapshot. `TREATMENT_CONSENT` is looked up only for `visit_consent` rows.

**Visit strip and calendar**
- "Consent to treatment" uses `visit_treatment_consented()` in `cal/data.ts`, the strip and `panels.ts`.
- Procedure forms for today's visit show as lines: "Tooth extraction: explain and confirm", or "…: to sign → Sign on this tablet".

**The document page**
- Shows the snapshot (`ConsentDocument` in `record` mode), the signature, the signer and their capacity, the facts ("Signed on their phone 10:42 · open 2 min 10 s before deciding"), confirmations, the events, and the fingerprints with "Unchanged since it was stored".
- Actions:
  - **Explain and confirm**, teal for the named dentist until it is done.
  - **Sign on this tablet**, for a form never signed, refused or withdrawn.
  - **I saw this signed** / **I checked**.
  - **Record a paper signing**, with the scan.
  - **Withdraw**: who told us, how, and a note.
  - **Print**.

**Who sees it.** Anyone who may open the record. Intakes that are not added yet are visible only to `records.edit`.

---

## 8. Edge cases

- **A minor:**
  - The desk answers *Under 18?* before the QR.
  - Page 1 requires the guardian section.
  - Only the authorities of §2.3 sign. Substitute and written authority need a clinic device and a staff confirmation.
  - A yaya or driver cannot sign; the form waits as *To sign*.
  - Whitening is never offered, and is cancelled if page 1 makes the patient a minor.
  - Assent for ages 7–17 is recorded at attestation.
  - Born 2013 but the desk said adult: page 1 stops until the desk checks.
- **An adult who cannot write** signs by mark on a clinic device, and a staff witness confirms.
- **An adult who cannot decide:** a court-appointed guardian, or a representative after the dentist's capacity note. Clinic device or paper only.
- **Already a patient:**
  - Add needs a decision on every look-alike. A mobile alone never makes the teal match.
  - Nothing overwrites a name, nor a mobile or email unless ticked.
  - A walk-in record from "Here now" shows as a look-alike, and as the visit's own patient when the intake was started from that visit.
- **A patient on file with no birth date:** forms are refused until the date is added.
- **Links:**
  - An expired, idle or locked link shows "This code has expired. Please ask the desk for a new one." (410), with nothing typed.
  - **Show the code again** resumes at the first unfinished page, with saved screens kept.
  - An intake not sent within 24 hours is purged.
- **Show again, switch device, or change the clinic's part:** the old link retires, and its phone reads "This code was replaced. Please ask the desk for the new one." Saved screens stay. A form whose fields changed is signed again (`doc_rev`).
- **Two staff:** the rev check returns the second save as the page now is. A second Add reads "Already added by Liza Santos at 10:52".
- **Two phones:** the first Start wins.
- **Double Send:** `again`.
- **Send and Stop at the same time:** serialised by the intake lock (§4.4).
- **The words in force change:** the patient's page and Send answer "The clinic updated this form. Please ask the desk." The desk **Renews** (§5.2), and the page is explained and signed again.
- **The privacy notice changes before Send:** `unfinished`, and the privacy screen is shown again.
- **Offline:** each screen keeps what was typed and the signature. Nothing is cached by the service worker. Paper is the fallback, recorded with its scan.
- **Refused, then agreed after talking:** **Sign on this tablet** on the same form. It makes a new signing; the latest counts and both are kept.
- **Ask the dentist first:** the form is *To sign* after Send, and the desk is alerted.
- **The named dentist leaves before explaining:** the form reads "Not explained yet (Dr X is no longer at this branch)". Nobody else confirms for them; the form is removed and prepared again with another dentist.
- **A handed-over device** holds no staff session. Other open tabs show the locked card, and every `/c/` page and API answers as signed out.
- **Sent and treated but never added:** the intake is held, not purged, while a patient here matches it, and the chair shows "Forms sent, not added".

---

## 9. Verification (measure, do not eyeball)

**Playwright** (`scripts/intake-check.mjs`). Use a desk context at 1440×900 and a phone at 390×844 with `isMobile`, a new preview port and the seeded database. Read states back from the database and the pages.
1. **New patient, phone:**
   - Choose general, anaesthesia and extraction 36. jsQR decodes the QR.
   - Fill page 1 and sign the general consent. The procedure pages are read-only, and a crafted signing answers `not_ready`.
   - Send. The desk panel updates within 5 s. Add.
   - The dentist explains and confirms; then **Sign on this tablet**.
   - The record has three signed forms, and the print says "Unchanged since it was stored".
2. **This device:**
   - No `fl_session` after the hand-over, and deleting `fl_park` opens nothing.
   - `/c/…` and `/api/…` answer as signed out, and another tab shows the locked card.
   - The kept record copy is gone, also with the network slowed past 5 s.
   - Unlock by **username**; a wrong password empties the field.
3. **A clinic tablet:** after registering, `/f/t/` picks up the link within 4 s, and the desk stays signed in.
4. **Minor born 2013:**
   - The desk's "not under 18" stops page 1; the guardian section is forced.
   - Whitening is not offered, and is cancelled when page 1 makes a minor.
   - The definer refuses a crafted `as: 'patient'`, a substitute on a phone link, and a substitute without a ground or 21 or over.
5. **Mark and representative:** refused on a phone. The mark is *To confirm* until a staff member confirms under their own session. A representative without a capacity note is refused.
6. **Refuse and ask first:** alerts appear; *To sign* on the record; a refused form is re-signed; Mark done and *In the chair* ask first and store the reason.
7. **Photos:** *No, thank you* stores a refusal with no strokes and no alert.
8. **Patient on file, phone:** nothing is drawn before the birth date; three misses lock the link; `added` at Send.
9. **Look-alike:** *Add as new* is refused without `seen`; *Add to* fills only empty fields.
10. **Links:** a second device gets `taken`; expiry and idle (shift `open_by` and `last_seen_at`), then resume; Show again leaves the old link `replaced`.
11. **Changes:** fields changed after a page was signed show *Sign again*; words changed (a newer row in a scratch database) answer `changed`, then **Renew**.
12. **Concurrency:** two Sends in parallel with different nonces give one set of signings, and the other answers `finished`. Send against Stop: no deadlock, one final state.
13. **Idempotency and abuse:** double Send answers `again`; a public CSRF miss gives 403 with the answers kept; the honeypot writes nothing; the limits answer `wait`, and pings are not counted per address.
14. **Production** (`NODE_ENV=production`, a valid env): the phone card is disabled; `new` is refused on every device; phone links are `unavailable`; consents-only on the tablet works; only listed templates are offered, and with none listed only typing is open.
15. **Refused posts:** a refused staff post returns with what was typed; a refused public post redraws the signature.

**Database** (as `flossify_app`)
- Update and delete are refused on every insert-only table.
- `update intake set answers`, `insert into intake_page`, `insert into consent_version` and `execute intake_gate` are refused.
- Each frozen `consent_document` column raises after attestation, signing or paper print. `version_id` and `clinic_id` always raise; `patient_id` raises except from null to a value.
- Cross-clinic selects return nothing.
- A wrong device hash gives `taken`.
- Hashes the caller supplies are replaced.
- A paper signing without a scan is refused.
- `retention_purge()` deletes exactly the fixture rows: past 24 hours and 30 days, while keeping held intakes, documents with a patient, and added intakes. It still purges texts when the intake block fails.

**Hashes and chain**
- `libraryHash(t) === body_sha256` for every version, and the test fails when one word changes.
- `sha256Hex(snapshot)` equals the database's value, and `verifySigning` is all true.
- Editing a stored snapshot as superuser turns the check red and breaks the chain after it.
- The Close the day head matches `consent_chain_head`.
- After the library words change, an old signing's print body is byte-identical.

**QR:** version ≤ 6 for the live and dev URLs. jsQR decodes at 160, 240 and 360px, blurred 1px, turned 7°, and from desk screenshots in light and dark.

**Logs:** an error on `/f/i/<token>/` logs `/f/i/…`.

**Design**
- Contrast ≥ 4.5:1 for every text node on every new screen, including the document card over all-black, all-white, stripes and no photo; light and dark; 1440 and 390.
- Targets ≥ 44px, fields ≥ 16px, no sideways scroll at 390.
- Exactly one visible, enabled teal fill per screen (`.ws-btn-primary, .btn-primary, .entry-btn-primary`) on `/c/…/intake`, `/f/i/`, `/f/t/` and unlock.
- No `text-transform: uppercase`.
- Chosen dark equals device dark.
- Keyboard order through the steps, the pad's Clear and the decision cards; `aria-live` announces panel changes.
- A `reducedMotion: 'reduce'` run shows the same motion.

**Roles** (`snap.mjs` / `cmp.mjs`): 7 roles × the new pages. Only `records.edit` gets the steps, and only the named dentist gets *Explain and confirm*. APIs refuse everyone else. Existing pages are unchanged apart from the chooser, the Consent pane, the chips and the ask-first dialogs.

**Print:** a Chrome PDF of a 3-page form has "Page x of y", the signature block whole, black on white, measured point sizes, and the short seal.

**The 035 page after the `SignPad` extraction:** the same DOM fingerprint apart from the component boundary, and a signing still works.

---

## 10. Open questions for the owner (with the default used)
1. **"End of profile creation": is a new patient's profile made at Send?**
   - Default: no. The desk adds it with one tap after checking look-alikes, and the patient is told "the clinic adds your details next".
   - Alternative: add at Send when there is no look-alike, as the person who made the link.
   - Decide before phase 2.
2. **Procedure consents:** default, read at registration and signed after the dentist explains and confirms (§0.4).
3. **Signatures:** draw on every form (default), or draw once and reuse.
4. **Initials:** on the risks sections (default). The PDA chart initials every clause.
5. **Language:** default, bilingual key lines under full English. Full Filipino, Ilocano or Cebuano texts can come later as reviewed versions. The language used is always recorded.
6. **Health history on page 1:** the whole health step (default).
7. **Production before the new notice:** default, consents-only intakes for patients on file, on clinic devices. New patients are typed at the desk first.
8. **Sedation:** not included.
9. **The estimate:** required, as a range or "told before starting". The PDA's 30-day denture line is left out unless the lawyer wants it.
10. **How long a signed procedure consent covers treatment:** 180 days (dentures and braces 365, whitening 90). It is shown on the record, and treatment after that asks first.
11. **Witness:** only a staff member who saw the signing and confirms it under their own sign-in. Otherwise, facts only.
12. **Unlocking:** a full sign-in (default). A PIN would need new sign-in machinery.
13. **Authority** (for the lawyer to confirm): the Art. 216 order and grounds; "parent" under Arts. 176 and 213; written authorisation by a parent; the representative of an adult; the capacity note's 30 days.
14. **Times:** 15 minutes to scan, 20 minutes idle, drafts 24 hours, sent-not-added 30 days unless held. The new notice must state all of them.
15. **The patient's copy:** printed at the desk with its seals. Show signed forms on `/me/` later?
16. **The general consent's review:** list `treatment-2026-09` after the reading, or now knowingly. It is live on the 035 page either way.

## Build order
1. **Library and data:**
   - `consent-library.ts`, `consent-seal.ts` and `consent:hash`.
   - Migration 039 with the hashes filled.
   - The engine split and `patient-add.ts`, proven by the unchanged fixtures.
   - `refused.ts`.
   - Unit tests and the database grant checks.
   - Nothing visible yet.
2. **Desk and clinic devices:**
   - The chooser and `/new/type/?next=consents`.
   - Steps B–D.
   - Clinic tablets and `/f/t/`.
   - `/auth/park/` and `/auth/unlock/`.
   - The patient pages, Send and Add.
   - Explain and confirm, and confirmations.
   - The Consent pane, the document page, print and paper.
   - Gate the New menu item.
3. **The phone path:** live QR, claim, the birth-date check, the status poll, the Dashboard card and inbox counts. It works in development only until the notice is published.
4. **Record integration:**
   - Timeline, VisitPanels, the visit strip, the calendar flag and the head chips.
   - Ask first, and "Forms sent, not added".
   - The chain head on Close the day.
   - *Prepare consent forms for this visit* replaces the 035 entry points; the 035 page stays for old links.
5. **Reviews (the owner's side):**
   - A dentist and the lawyer read each form, which fills `CONSENT_REVIEWED`. Changed words ship as migration 040 or later.
   - A new privacy notice naming what page 1 collects, the 24-hour and 30-day deletions, the held rule and the signed forms fills `FORMS_PRIVACY_VERSIONS`.
   - Then update CLAUDE.md with a section "Add patient, step by step (039)" and the Layout lines.

---

## Review notes

**Clinic-legal review**
1. **A procedure consent was signed before any explanation** (blocker). **Accepted.** The attestation now comes first (§0.4, §1.10, §4.5). A booking never pre-ticks a form. Open question 2 changed.
2. **Page 1 was open in production** (blocker). **Accepted.** One gate for page 1 on every device (§5.5, Q7).
3. **The privacy tick recorded no signer.** **Accepted.** Page 1 now asks who is agreeing, and the `intake` channel check requires it (§2.2, §4.2).
4. **Substitute authority accepted any free text.** **Accepted.** The Art. 214/216 grounds and order, 21 or over, a parent's letter, a clinic device and a staff confirmation (§2.3). Family Code text checked.
5. **Cannot write and cannot decide were one case.** **Accepted.** A mark with a witness; a court-appointed guardian for adults; a representative only after a capacity note.
6. **Photos could not be refused.** **Accepted.** *No, thank you* is unsigned and raises no alert (§2.3).
7. **Treatment could go ahead after a refusal.** **Accepted.** It asks first, with a stored reason, and does not block (§7).
8. **The link-maker was named as witness.** **Accepted.** Facts only; a witness is whoever confirms under their own sign-in (§3.6).
9. **Seals could be checked only inside the database.** **Accepted.** A per-clinic chain, with short seals on the patient's copy and on the Close the day printout (§4.6). Sending the chain head to the owner waits for email (023).
10. **The language and who read it were not recorded.** **Accepted.** Recorded on every page and in the attestation. Civil Code Art. 1332 checked.
11. **A minor was known only from the typed date.** **Accepted.** The desk's two questions, the age check, and whitening cancelled rather than answered `invalid`.
12. **Signed forms for a treated walk-in were purged.** **Accepted.** Held intakes and chair prompts (§4.8, §1.9).
13. **The general consent was exempt from review.** **Accepted.** No exemption; the owner's decision goes in CLAUDE.md (§3.8, Q16).
14. **The desk was slowed and its computer parked.** **Accepted.** Hand-over is possible after step 1, and clinic tablets hold no staff session (§1.7).
15. **The secretary could type the clinical fields.** **Accepted.** Fields are split into desk and dentist fields, and the dentist's attestation confirms them. Verified that `can.ts` gives the secretary and dental assistant `records.edit`.
16. **A paper signing needed no scan.** **Accepted.** The scan is required (§4.2).
17. **The patient's name was free text.** **Accepted.** The server's name, read-only.
18. **"Read for …" overstated the evidence.** **Accepted.** Now "open … before deciding".
19. **A stranger could scan a patient on file's code.** **Accepted.** The birth date comes first, and three misses lock the link (§2.1).

**Data-security review**
1. **Page 1 gate** (blocker). **Accepted**, as legal 2.
2. **The park cookie hid a live 14-day session** (blocker). **Accepted.** Hand-over clears the session, and `fl_park` is only a hint (§1.7). `SESSION_HOURS` verified.
3. **The service-worker copy and open tabs survived hand-over.** **Accepted.** `/auth/park/` is a session POST for `sw.js`, and a BroadcastChannel message locks other tabs.
4. **The definers never locked.** **Partly rejected.**
   - The draft's `intake_gate` (outside the excerpt reviewed) already locked the link and the intake `for update`, so Sends serialise.
   - But its link-then-intake order could deadlock with the desk, so the order is now intake first (§4.4).
   - Added the `status = 'out'` guard and a unique `(intake_id, document_id)`.
5. **A change of words was a dead end.** **Accepted.** Nothing is wiped; the desk renews the form (§5.2).
6. **The purge and foreign keys.** **Partly rejected.** The draft already declared cascade and set-null keys. Accepted the explicit delete order and the isolated block. The return type stays `integer`.
7. **Refused or withdrawn forms could not be re-signed.** **Accepted** (`startIntake`).
8. **A patient on file's details showed on any phone.** **Accepted**, as legal 19.
9. **Unlock worked by email only.** **Accepted.** `authenticateAt` at the clinic's door. Verified that `authenticate` is email-only.
10. **The `consent_document` guard.** **Partly rejected.** The draft's trigger already froze the clinic, version, patient-once, fields and signed moves. Added `appointment_id`, `plan_item_id` and `sort`, and the §9 checks.
11. **Refused was thrown in some places and returned in others.** **Accepted.** `refused.ts`, always thrown. Four local copies verified.
12. **The add logic would be duplicated.** **Accepted.** `patient-add.ts`. Verified that the helpers are private today.
13. **The token appeared in error logs.** **Accepted.** Redacted, and the `/f/` headers are set in the middleware. `middleware.ts` verified.
14. **The hand-over spanned transactions.** **Accepted.** Clinic-device links are inserted already claimed.
15. **`intake:ip` counted across clinics.** **Accepted.** Now per clinic, with pings excluded.
16. **Photos refusal.** **Accepted**, as legal 6.
17. **"End of profile creation".** **Accepted** as open question 1, with honest words to the patient.
18. **`opened_at` was not reset.** **Accepted.**
19. **Two rules for "consent signed".** **Accepted.** One function, `visit_treatment_consented()`. `cal/data.ts` verified.
20. **The one-teal count missed `/f/` pages.** **Accepted.** Every teal fill class is counted. Verified that `/f/[key]` uses `btn-primary`.
---

## The owner's answers (29 Sep 2026, asked after the design)
1. **Procedure forms: signed after the dentist explains** (the spec's default, §0.4). Read at intake; signing opens once the named dentist records "I explained this" (`consent_attestation`), at the chair on the same tablet.
2. **The profile is made when they press Send** — changes the spec's default (open question 1). A new patient's record is created at Send, as the person who made the link, unless it looks like a patient already on file (same name and birth date, or the same mobile): then it waits for the desk to decide ("Add to <name>" / "Add as a new patient"), as the QR forms do. The patient's thank-you says their details are with the clinic.
3. **Sign each form** (default): a fresh signature on every consent page, initials on the risks sections.
4. **Order: build the six scheduling features first**, then this intake.
