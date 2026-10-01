# Add patient, step by step: intake and consent forms (design, revised)

> Build spec for the owner's request of 29 Sep 2026, revised after the clinic-legal and data-security reviews ("Review notes" at the end). Migration **039**. Code: `src/lib/intake*.ts`, `consent-*.ts`, `patient-add.ts`, `refused.ts`, `park.ts`. Pages: `/c/<slug>/patients/new/`, `/c/<slug>/patients/intake/…`, `/f/i/<token>/`, `/f/t/`, `/auth/park/`, `/auth/unlock/`, `/c/<slug>/patients/<id>/consents/…`. Where this file and CLAUDE.md disagree, CLAUDE.md wins and this file is fixed.

The owner: *"Staff or any authorized staff will click Add patient, using QR or in-site … step by step. Before presenting the QR, the staff will go through a checklist to check which consent form should be signed for the procedure/operation. 1st page: Patient Information. 2nd page: Consent Form (clinic will fill up a formatted form created by you …). 3rd page: Consent form. 4th page: Consent form. End of profile creation."*

---

## 0. Decisions

1. **Add patient offers three ways:** *On their phone* (a QR for this one patient), *At the clinic* (a registered clinic tablet, or hand this device over), *Type it in yourself* (today's form, moved to `/patients/new/type/`). Import and the poster stay as quiet links.
2. **Desk steps:** 1 Who and which forms · 2 The clinic's part · 3 Check · 4 Hand over. Step 2 may follow the hand-over: page 1 needs nothing from it.
3. **The patient sees:** page 1 *Patient information* (new patients, where §5.5 opens it, ending with the privacy notice and who agrees) · *Consent to examination and treatment* · one page per chosen form, fixed order · *Check and send* · a thank-you showing nothing of the record.
4. **Explain, then confirm, then sign.** A procedure form can be read any time but signed only after the named dentist has confirmed its clinical part and recorded *I explained this* (`consent_attestation`, written before any signing; `intake_decide` refuses otherwise). At registration it is "Read before you see the dentist"; it is signed at the chair, on a clinic device or on the link while open. The general consent and photos need no attestation.
5. **Forms are a versioned library:** a `consent_version` row per form (new kind `document`; the general consent keeps kind `treatment`), words in code, the row holding their hash.
6. **Typed fields, each with an owner.** Desk fields (dentist, estimate, fees) are anyone's with `records.edit`; dentist fields (procedure, teeth, type, reason, findings, materials) may be proposed by the desk but read "to be confirmed by the dentist" until the named dentist's attestation confirms and freezes them.
7. **Decisions:** *I agree* (signed) · *I do not agree* (signed refusal) · *Ask the dentist first* (unsigned; *To sign* on the record). Photos: *Yes, with these choices* (signed) or *No, thank you* (unsigned refusal, no alert, never *To sign*).
8. **Who signs.** A patient signs under the name the server holds. A minor only through someone with authority: parent, court-appointed guardian, substitute parental authority in the Family Code's order, or someone a parent authorised in writing. An adult who cannot write signs by mark with a staff witness; an adult who cannot decide only through a court-appointed guardian, or a representative after the dentist records why. All but a parent or the patient: clinic device only, confirmed by a staff member under their own sign-in.
9. **Signatures:** fresh strokes on every page, never an image; initials on procedure forms' risks sections.
10. **Frozen:** the server renders a canonical `snapshot`; the database computes its SHA-256 and a seal, and chains seals per clinic once a form is on a record. Reprints come from the snapshot. The patient's copy and the Close the day sheet carry short seals, held outside the database.
11. **An intake is not a patient.** A new patient's intake ends *Sent*; the desk adds it in one tap after look-alikes (open question 1). A patient on file: consent pages only, done at Send; on a phone the patient first types the birth date on file.
12. **The link:** 26 characters (~129 bits), claimed by the first device; dead after 15 minutes unclaimed or 20 idle; drafts 24 hours on the server; nothing reaches the record before Send.
13. **Handing this device over signs the desk out** (no cookie that merely hides a live session); unlocking is a sign-in at `/auth/unlock/`. A clinic tablet holds no staff session.
14. **Production:** page 1 and the phone link open only when the notice in force is in `FORMS_PRIVACY_VERSIONS`; until then, consents-only intakes for patients on file on clinic devices. Only `CONSENT_REVIEWED` templates, the general consent included.
15. **Permission `records.edit`** (`can()` on pages, `canEditRecords` in every writing transaction); confirming and attesting only by the named treating dentist with PRC; confirmations under the confirmer's own sign-in.
16. **Treating after a refusal, or with a form unsigned, asks first** (Mark done, In the chair, the visit strip): a typed reason, stored and audited; never a hard block.
17. **No IP address or browser details** are stored with these consents.

---

## 1. The staff flow

Soft template, `ClinicLayout section="add-patient"`: one teal button per screen, sentence case, line icons, targets ≥ 44px, fields 16px, `<Csrf />` on every form (a miss → `?stale=1`, `CSRF_MESSAGE`).

### 1.1 Entry points
- **+ Add patient** (Patients list), the New menu (gate it with `can(ws, 'records.edit')`; `routes.ts` shows it to all today), the search empty state and the booking panel hint → `/patients/new/`.
- Record → Consent → **Prepare consent forms**; a visit panel → **Prepare consent forms for this visit** (phase 4).
- A form on the record never signed, refused or withdrawn → **Sign on this tablet** (a one-form intake on a clinic device).
- The named dentist → **Explain and confirm** (§1.10).

### 1.2 Screen A: "How will they fill in their details and consent forms?"
Three radio cards (72px):

| Card | Line | Production, notice not listed |
|---|---|---|
| **On their phone** · *Easiest* | "A QR code only this patient can use. They fill in and sign on their own phone." | disabled: "Opens when the clinic's privacy notice covers it." |
| **At the clinic** | "On the clinic's tablet, or hand this device to them." | a new patient: "Type their details first, then prepare their consent forms" → `/new/type/?next=consents` |
| **Type it in yourself** | "For a phone call or a paper form." | open; `?next=consents` lands on the new record's *Prepare consent forms* |

Teal **Continue** POSTs `intent=start` to `/patients/intake/` (or redirects, third card). Quiet links: import, the poster, "a patient on file: their record → Consent". In production with no template reviewed, one blue line says so and only typing is open. "N patients sent their forms" counts poster forms and sent intakes. No `records.edit`: *Not allowed*.

### 1.3 Screen B, step 1: "Who and which forms?" (`/patients/intake/<id>/?step=consents`)
Steps as import's `.imp-steps` (**1 Who and which forms · 2 The clinic's part · 3 Check · 4 Hand over**).
- **A new patient:** optional first name to show under the code (≤ 40); **Under 18?** *Yes · No · Not sure* (required); if not No, **Who came with them?** *A parent · A legal guardian · Another adult (a grandparent, relative, yaya …) · Nobody*. **On file:** name pill, chart no., age; optional visit today.
- **Checklist** (cards ≥ 56px, a quiet **Preview** side panel at 390px). Always: page 1 (new) and *Consent to examination and treatment* (for someone who signed the version in force — `visit_consent`, an agreed document or channel `form` — unticked, "Signed 12 Aug 2026", tickable). Numbing: local anaesthesia. Treatment: extraction and oral surgery · root canal · fillings, crowns, bridges and veneers · deep cleaning and gum treatment · dentures · implants · braces and aligners · whitening. Records: photos (optional; no never changes care).
- **Suggestions** (`suggestConsents`): *Planned by Dr Reyes: extraction 36* from plan items a treating dentist accepted, **pre-ticked** (anaesthesia with it; "Often needed" beside fillings and crowns); *Booked for: extraction (not yet examined)* from the booking, **never pre-ticked**.
- **In place:** under 18 (desk answer or record): "A parent or legal guardian signs every form"; whitening disabled ("Not for under 18: the product label says so"). Under 18 with another adult or nobody: "Only a parent or legal guardian can agree. Page 1 can be filled in; the privacy consent and the forms wait for them." On file with no birth date: every row disabled, "Add their birth date first". Development tags unreviewed templates amber; production lists only reviewed ones and says more will open. "4 parts · about 10 minutes" (`PAGE_MINUTES`).
- Teal **Continue** (`intent=consents`, `rev`); quiet **Hand over now** (step 4; the clinic's part can follow).

### 1.4 Screen C, step 2: "The clinic's part"
- **Common:** the dentist who explains (treating staff with access here, not disabled; no PRC → inline error to People); preselected from the visit, the signed-in dentist, or the only one. The language planned (English · Filipino · other); the attestation records the one used.
- **One card per form:** desk fields editable (estimate chips from the fee guide rows `consentsForCatalog` maps, × teeth when `tooth_scoped`); dentist fields prefilled from accepted plan lines, shown "Proposed · Dr Reyes confirms" unless the named dentist is signed in, who gets **Confirm, and I explained this to them today** per card (§1.10). Quiet **See it as the patient will**. Amber, never blocking: no clinic address; "Estimate left to the dentist".
- Teal **Continue** (`saveClinicPart`); a refused post returns with every value and "Nothing was saved. N things to fix:".

### 1.5 Screen D, step 3: "Check"
- The pages in order with minutes and *Change*: "Page 3 Local anaesthesia · read now, signed after Dr Reyes explains", "Page 4 Tooth extraction · 36 · ready to sign (confirmed 10:20)".
- Device: *Their phone* · each clinic tablet ("seen 2 min ago") · *This device*. The teal button follows it: **Show the QR code** · **Send to Tablet 1** · **Hand this device to Juan** ("This device opens the clinic's pages again only after you sign in.").

### 1.6 Screen E1 (phone): QR and live progress
- **QR** (white both themes): `qrSvg(url, { ecc: 'H', mark: true })` at 320px (≥ 280); "For: Juan D. · Only for this patient. Do not post or share it. · Opens until 10:46." `https://flossify.ph/f/i/<token>/` must measure as version ≤ 6 (§9).
- **Progress** beside the QR from 64rem: "Juan D. · waiting to be scanned" → "filling in on their phone · 4 min". Link state, words plus a dot: waiting (blue) · active 10 s ago (green) · idle 6 min / closed after 20 minutes / expired / locked after three wrong birth dates (amber).
- **Parts** tags (words plus a dot): Not started · Filling in · Done · Reading · Read, waiting for the dentist · Has a question · Signed 10:36 · To confirm · Did not agree (soft red) · No photos · Will ask the dentist · Sign again · Updated words.
- **Alerts**, one action each: a question → **Seen** · did not agree ("the dentist should talk to them") · "Page 1 says born 2010; you said not under 18" → **Change my answer** · "Nobody with authority can sign" · "Signed by mark" → **I saw this signed** · "Possible match on file: …" (`likelyMatches`; a mobile alone is never strong) · "The words of Tooth extraction changed" → **Renew the form** · not opened → **Show the code again**.
- **Actions** (quiet): Show the code again (`replaced`) · Use a clinic tablet instead (`switched`) · Change the clinic's part (`stopped`) · Stop (asks first).
- **Never shown:** health answers, address, mobile, signatures, any typed answer (desk monitors face the waiting room).
- **Refresh:** `status/` every 4 s while visible (`intake:poll:<staff>`), `hidden` toggles, `aria-live` (`data-ik-live`); no script → **Refresh**; three failures → "Connection lost at 10:41. The patient's saved pages are safe."

### 1.7 Screen E2 (at the clinic)
**(a) A clinic tablet.** Clinic settings → **Clinic tablets** → *Make this device a clinic tablet* (`settings.edit`, a name): sets `fl_ctab` (a secret hashed in `clinic_tablet`; httpOnly, Secure, SameSite=Strict, `Path=/f/`, 180 days) and signs the browser out of the workspace. It rests on `/f/t/` ("Ready for the next patient", the clinic's face only), calling `tablet_poll` every 4 s. **Send to Tablet 1** inserts the link already claimed by it; it opens within 4 s; the desk stays signed in and watches the panel. After the thank-you it returns to `/f/t/`.

**(b) This device.** **Hand this device to Juan** POSTs to `/auth/park/` (`sw.js` already treats `/auth/` posts as a session change and drops the kept record copy): `goLive` inserts the link already claimed with a secret made for this browser (its own transaction; no public claim); `clearSession()`; a signed `fl_park` hint `{ s, c: slug, i: intake, exp: 24 h }` that opens nothing; the page first posts `parked` and `{ who: null }` on the `flossify-offline` BroadcastChannel, so other tabs cover themselves with a locked card and the offline queue stops; then 303 to `/f/i/<token>/`.

**Unlock** (`/auth/unlock/`, the staff entrance card; the thank-you's quiet **For the clinic** leads here): "This device was handed to a patient. Sign in to go back." Username prefilled at the clinic's door (`clinicDoor(slug)`, `authenticateAt`; *another way* is email), **Show**, Caps Lock line, password empties on a miss, limits `login:u:<slug>:<login>` and `login:ip:`. Success: `authEvent('login.ok')`, audit `device.unlock`, the hint cleared, back to the intake. Anyone may sign in there as themself.

### 1.8 Screen F: "Add to the records" (Sent)
- "Juan dela Cruz sent everything at 10:48", the parts' final tags.
- **Look-alikes** (`likelyMatches` on name, birth date, mobile; top 5; plus the patient of the visit it was started from): a quiet **Add to {name}'s record** each; teal when the strongest has the same name and birth date, or is that visit's walk-in record; otherwise **Add as a new patient** is teal and carries `seen=<every id>`.
- Adding to someone on file confirms in `Confirm.astro`: empty fields only, never a name, mobile and email only if ticked, *Use* per differing detail (`compareWithRecord`, `TAKEABLE`).
- Lands on `?saved=intake&intake=<id>` (§7). Quiet **Dismiss** (a reason: duplicate · test · other ≤ 120) cancels it for the next purge.

### 1.9 The list, the Dashboard and the chair
- `/patients/intake/` (`records.edit`): **Sent: add to the records** · **Filling in now** · **Not finished** (time left of 24 h). Its POST `intent=start` is the one creation endpoint.
- Dashboard: **Patient forms in progress** above *Your tasks* when any is `out` or `sent` (three, **See all**). `inboxFor` gains `intakes` (the Patients tab dot).
- A visit today whose patient a sent intake likely matches (name and birth date, or its visit): "Forms sent, not added: add them now" on the visit strip, the visit panel and *In the chair* (which asks first).

### 1.10 The dentist's part and confirmations
- **Explain and confirm** (the document, the strip's "Tooth extraction · 36: explain and confirm", the intake's Check): the patient's page in preview with dentist fields editable; **Explained in** (English · Filipino · Ilocano · Cebuano · other ≤ 40; interpreter ≤ 120); for 7–17 on the Manila calendar **What did {name} say?** (agreed · objected · not asked). Teal **I explained this to {name}** writes the attestation and freezes the fields. Only the named dentist (treating, PRC, access here); anyone else reads "Only Dr Reyes can confirm this. To change who explains, remove the form and prepare it again." The page is then signable on the open link or with **Sign on this tablet**.
- **Confirmations** (`consent_confirmation`): *I saw {name} make their mark* (witness), or *I checked {the court order | the ground | the parent's letter}* naming the file in Files. Anyone with `records.edit`, under their own sign-in, never the signer; until then the signing is *To confirm* and does not count as agreed.
- **Capacity note:** record → Consent → *Record that the patient cannot decide* (treating dentist with PRC, a reason ≤ 300); a representative may sign on a clinic device for 30 days after (open question 13).

---

## 2. The patient flow (`/f/i/<token>/`)

### 2.0 The shell
- The `/f/` glass pattern, `ClinicRoom` behind (the clinic's own cover or the soft blur), `ClinicBadge`; a slim bar: initials, name, "Part 3 of 5", a quiet **Ask the desk**. No site nav.
- The document card is near-opaque paper (`--c-surface` 97%, slate ink; charcoal in dark), measured over all-black, all-white, harsh stripes and no photo. Text 17px/1.6, 68ch; Filipino `lang="fil"`, ink-2, ≥ 16px.
- The middleware gives every `/f/` path `no-store`, `X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer` and logs errors as `/f/i/…`.
- Every screen is a POST to the same URL (`at`, `intent`): success 303 onward; errors re-render with the answers (422); a CSRF miss re-renders (403), never redirects. With the script, `fetch` (`X-Intake-Script: 1`, JSON `{ next }`/`{ errors }`); offline, the screen keeps what was typed and the drawn signature and says so. Nothing in storage or the URL.
- From `/f/[key].astro`: a restored page is hidden and reloaded; `autocomplete="off"` except contact tokens; `HONEYPOT_FIELD` everywhere. Screens: `welcome`, `verify`, `you`, `contact`, `health`, `privacy`, `c<sort>`, `check`, `done`.

### 2.1 Welcome, and who it is for
- "Hello. {Clinic} would like you to fill in **4 short parts**, about 10 minutes." The parts; "Your answers go only to {Clinic}."; "Prefer paper? Ask the desk."; teal **Start**. Before the claim: the clinic's face and the count only.
- On a phone Start claims the link (`intake_claim`, `fl_idev`: httpOnly, Secure, SameSite=Lax, `Path=/f/i/<token>/`, 24 h); a second device: "These forms are already open on another phone. Ask the desk for a new code." Clinic-device links are claimed when made.
- **A patient on file, on a phone:** "Type the patient's date of birth" first (`intake_verify`); three misses lock the link ("Please ask the desk"). Nothing about them is drawn before it matches.

### 2.2 Page 1: Patient information (new patients; where §5.5 opens it)
The fields are the forms' `FieldDef`s from `STEPS` by name (wording, `ShowIf`, `need`, the parser shared). `INTAKE_FORM_VERSION = 'intake-2026-10'`.

| Screen | Fields | Left out |
|---|---|---|
| `you` | names, `suffix`, `birth_date`, `sex`, `occupation` (18+) | `civil_status` |
| `contact` | `mobile`, `email`, address; `guardian` (under 18); `emergency` | `facebook` |
| `health` | the whole `health` step | — |
| `privacy` | HMO (folded); notice summary, DPO, `/privacy/`; hidden `privacy_version`; **who is agreeing**; the tick | teeth step, PhilHealth PIN, `hmo_company` |

- `parseScreen` reads only that screen's fields on the server, then `intake_save_page1`; `privacy` re-reads all of page 1 (`parseForm(INTAKE_DEF, merged)`), checked again by the definer. Changing an earlier screen means passing `privacy` again.
- **Who is agreeing:** *I am the patient* (18+ only) · *I am their parent or court-appointed guardian* (name, relation, which) · for a minor, *Nobody here can agree for them now*: page 1 saves, privacy consent **not given**, the desk sees it and records a desk consent at Add when a parent comes (`recordDeskConsent`). Stored as `privacy_as`, `privacy_by_name`, `privacy_relation`.
- **Age check:** a birth date contradicting the desk's *Under 18?* (No but under 18, Yes but 18+) stops page 1 ("Please ask the desk before going on"); the desk changes its answer or the patient the date. *Not sure* never stops.
- Page 1 making the patient a minor cancels a whitening form (event, the desk is told), never `invalid`. A change of who they are (names, birth date, guardian) clears signed pages and their `opened_at` ("Sign again: your details changed").

### 2.3 Consent pages
**Order:** general 10 · anaesthesia 20 · extraction 30 · root canal 40 · restoration 50 · periodontal 60 · denture 70 · implant 80 · ortho 90 · whitening 100 · photos 200 (`Template.order`).

**Not confirmed yet** (a procedure form with no attestation): blue banner "Read before you see the dentist. You sign after Dr Reyes has explained it to you."; dentist facts read "to be confirmed by the dentist"; no ticks, decision or pad; teal **Continue** (state `read`; *To sign* after Send).

**Ready to sign**, top to bottom:
1. **Head:** "Part 3 of 5 · Consent form"; English `h1`, Filipino under it; "Explained by Dr Ana Reyes · PRC 0123456 · in Filipino"; "Form extraction-2026-10 · CF-7K2FQ".
2. **"For" box:** name, birth date, age; "Signed by: Maria dela Cruz, mother" for a minor; the facts as pills (teeth `rp-tooth`, type, estimate); today (Manila).
3. **"In short"** (blue tint, bilingual, ≤ 5 bullets): what, why, main risks, other choices including none, cost.
4. **Full text:** What we will do · Why · Risks (common, then "less common but serious") · special sections · Other choices · If you do not have it · Before and after · Cost · Your rights. No inner scroll box. `initials` sections end with an **Initials** box (1–4 letters, 56px, the same letters on a page).
5. **Patient questions.** 6. **Ticks** (56px, English and Filipino): *explained* (only on attested pages, so it is true), *risks*, *history* (anaesthesia, extraction, periodontal, implant); all needed to agree, none to refuse or ask first.
7. **How it reached you:** *Explained to me in* (preset to the attestation's language; English · Filipino · Ilocano · Cebuano · other ≤ 40) and *I read it myself* or *It was read to me by* (staff name ≤ 60); both into the snapshot and the print.
8. **Decision:** **I agree** · **I want to ask the dentist first** · **I do not agree** (optional "Why?" ≤ 200).
9. **Who signs** (below), the chosen authority's statement above the pad. 10. **Meaning sentence** (`meaningSentence`): "By signing, I, Juan dela Cruz, agree to the extraction of tooth 36 by Dr Ana Reyes as described above. 29 Sep 2026."; a guardian "… I, Maria dela Cruz, mother of Juan dela Cruz, agree for Juan dela Cruz to …".
11. **The pad** (`SignPad.astro`, from the 035 page): white slip, dashed line, *Clear*, 1000×400, strokes in a hidden field; "Turn your phone sideways for more room." 12. Teal **Sign and continue** (**Continue** for ask-first); a missing piece is said before posting, and again by the server.

**Who signs**

| Patient | Choice | Name | Also | Where | Staff confirms |
|---|---|---|---|---|---|
| 18+ | *I am the patient* | from page 1 or the record, read-only | — | any | — |
| | *The patient, by mark* (cannot write) | read-only | mark on the pad | clinic | witness |
| | *Court-appointed guardian* | typed | relation | clinic | the order |
| | *Representative* | typed | relation | clinic, with a capacity note | — |
| Under 18 | *Parent* | typed | relation | any | — |
| | *Court-appointed guardian* | typed | relation | clinic | the order |
| | *Substitute parental authority* (Family Code Arts. 214, 216) | typed | ground: *the parents have died* · *are absent and cannot be found* · *are unfit or a court has ruled*; in order: *surviving grandparent* · *oldest brother or sister, 21+* · *actual custodian, 21+*; "I am 21 or older" for the last two | clinic | the ground |
| | *Authorised in writing by a parent* | typed | relation | clinic | the letter, in Files |

A parent simply not here today is **not** substitute authority (said under that choice). Nobody with authority: "Only a parent or legal guardian can sign. Please ask the desk." (the page waits *To sign*). "If the parents do not agree with each other, the clinic stops and talks with both."

**Photos:** **Yes, with these choices** (a tick per use asked about, none pre-ticked, at least one; for social media *my face may show*, *my name may show*; signed) or **No, thank you** (a refusal, no signature, no alert; the record says "No photos for publication"). Under both: "To change your mind later, tell the clinic in person, by phone or by text."
**Refused:** signed like consent; amber "We have told the desk. The dentist will talk with you about what this means."
**Whitening stops** (pregnant or could be · smokes or drinks often · a filling or crown in 2 weeks) remove *I agree*: "Please talk to the dentist before whitening. The product label says it is not for …".

### 2.4 Check and send
Page 1 and each consent with its state ("Signed 10:36", "Did not agree", "No photos", "Will ask the dentist", "Read · signed after the dentist explains"), *View* and *Change* (WCAG 3.3.4). Teal **Send to {Clinic}** with `NONCE_FIELD`. Unfinished parts are listed; a page waiting for the dentist is not unfinished.

### 2.5 Done
- Phone, new: "Thank you, Juan. The clinic adds your details to your record next. Please tell the desk you are finished." On file: "Thank you. Your forms are on your record."
- On the patient's own phone only, each signed form's short seal ("Tooth extraction · seal 3F9A-KQ72-MD", Plex Mono): "The same seal is printed on your copy."
- Clinic device: "Please hand the tablet back to the clinic", neutral after 20 s (a tablet returns to `/f/t/`); *For the clinic* → unlock (this device only).
- No reference, answers or record; afterwards Back or reload shows only "These forms are finished." The copy is printed at the desk with the seals; never a link in a text.

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
- `TEMPLATES['treatment-2026-09']` is built once from `TREATMENT_CONSENT` (six sections, one tick); no special case anywhere. With `dentist: false`, dentist fields stay proposals.
- `consentsForCatalog` (on `kindForCatalog`): extraction/surgical → extraction + anaesthesia · root canal → + anaesthesia · filling, crown → restoration ("often" anaesthesia) · denture · braces adjustment → ortho (none signed) · whitening · cleaning → none · `/implant/` → + anaesthesia · `/root planing|deep scal|periodont|curettage/` → periodontal + anaesthesia. For suggestions and fee chips only.

### 3.2 Shared words (`SHARED`)
Filipino is the research's draft; a native-speaking dentist and a translator review it (§3.8); lines marked *(to draft)* have none yet.

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

Every procedure form ends: Other choices (always *No treatment*) · If you do not have it · Cost · Your rights (`rights` + `unexpected`).

### 3.3 Clinic fields (`readClinicPart`)
Read with `visibleOnly` and `oneLine`. `teeth`: FDI, sorted, unique, `isFdi`, 1..`maxTeeth` (16) · `choice`/`choices` from the list (+ `other`; `none` exclusive) · `text` 1..`max` (160) · `number`/`range` within bounds · `money` `{kind: amount|range|later, from, to, includes}` centavos, ≤ ₱5,000,000, `later` only with `allowLater` · `yesno`. Each form but photos carries `dentist_id` (treating, PRC) and the planned language; `fields` ≤ 8 KB, declared names only; a false `when` is null. **Desk fields:** money, `fees`, `breakage`, `included`, `relines`, `follow_up`, `visits`, `recheck_weeks`, `maintenance_months`, `visit_weeks`, `made_by`, photos' `photo_types` and `uses`; every other field is the dentist's.

### 3.4 The forms
Fields are the dentist's unless marked *(desk)*. Risks: common first, then **less common but serious**. *(review)* numbers come from the research catalogue; the reviewing dentist keeps or drops them. "FIL: F03" names the catalogue's drafted Filipino lines.

**G. `treatment-2026-09`: Consent to dental examination and treatment** (kind `treatment`, live on the 035 page): `TREATMENT_CONSENT`'s words unchanged, six sections, one tick; no required fields; attest no · guardian · 2 min · English only (open question 5); in production only once in `CONSENT_REVIEWED`.

**1. `anaesthesia-2026-10`: Local anaesthesia / Pahintulot sa pampamanhid** · numbing · 20 · 2 min · attest · guardian · valid 180 days · ticks explained, risks, history.
- Fields: `area` (teeth, plan_teeth) or `area_text` (≤ 80), one required · `technique`: infiltration · nerve block · decided at the visit · `agent` (+ other ≤ 60): lidocaine 2% with epinephrine 1:100,000 · mepivacaine 3% plain · articaine 4% with epinephrine 1:100,000 · `risk_factors`: heart disease · high blood pressure · pregnant or may be · a reaction to numbing before · blood thinners · none noted.
- What: an injection numbs {area}; lips, cheek and tongue stay numb for a few hours. Why: so the treatment does not hurt.
- Risks (initials): soreness or bruising where the needle went in; a stiff jaw for a few days; a fast heartbeat or shakiness for a few minutes (the epinephrine); feeling faint; numbing may not work fully, most often on an infected tooth. **Less common:** biting or burning the numb lip, cheek or tongue (children most); harder to control swallowing while numb; rarely an allergic or severe reaction needing emergency care; rarely numbness or tingling for weeks or months, very rarely for good (nerve injury).
- For you: {risk_factors} (when ticked). Other choices: no numbing (it may hurt); gel only, for minor care; sedation or general anaesthesia elsewhere, by referral. Afterwards: while numb, do not bite, suck or scratch your lip, cheek or tongue, and avoid very hot food and drink; a child is watched until it wears off. FIL: three drafted lines.

**2. `extraction-2026-10`: Tooth extraction and oral surgery / Pahintulot sa pagbunot ng ngipin at operasyon sa bibig** · 30 · 3 min · attest · guardian · 180 days · explained, risks, history.
- Fields: `teeth` (required, plan_teeth) · `type`: simple · surgical (the gum is opened, some bone may be removed, the tooth may be cut in parts, stitches) · `reason` (+ other ≤ 120): decay that cannot be repaired · infection · gum disease · crowding or braces · a wisdom tooth causing problems · a broken tooth · `xray`: root near the nerve canal · near the sinus · curved or joined roots · none noted · `risk_factors`: smokes · blood thinners · bone medicines (bisphosphonate or denosumab) · radiotherapy to the head or neck · diabetes · none noted · `follow_up` *(desk)* (≤ 120, "A check-up in 7 days") · `estimate` *(desk)* (fee_guide, allowLater). Patient: `keep_tooth` "Do you want to keep the tooth?".
- What: remove tooth {teeth} ({type}); stitches if needed; an aftercare sheet. Why: {reason}.
- Risks (initials): pain, swelling, bruising and some bleeding for a few days (more with blood thinners); a stiff jaw and sore mouth corners; dry socket, a painful socket a few days later (more in smokers and after lower wisdom teeth); infection. **Less common:** damage to a nearby tooth, filling or crown; a small root tip left when removing it is riskier; nerve injury (numb or tingling lip, chin or tongue), usually temporary, rarely permanent; rarely a broken jaw; swallowing or breathing in a piece of tooth; bone that heals slowly or not at all with bone medicines or after radiotherapy.
- Upper back teeth (`teethIn` 14–18, 24–28): an opening into the sinus may happen and need more treatment. Wisdom teeth (`teethIn` 18, 28, 38, 48; initials): the nerves to the lip, chin and tongue run close to lower wisdom teeth; about 1 in 100 people are left with numbness that does not go away *(review: NHS Sussex, AAOMS)*; dry socket is likelier; a gum pocket may stay behind the next tooth; risks rise with age. X-ray findings: {xray}; for you: {risk_factors}.
- Other choices: keep the tooth and watch it; a root canal and crown where possible; medicine or draining (only for now); for a wisdom tooth on the nerve, removing only its crown (coronectomy); an oral surgeon; no treatment. "The gap may need an implant, bridge or denture, at extra cost." Without it: pain, spreading infection or swelling, a cyst, damage to the next tooth, harder surgery later. Afterwards: the aftercare sheet; no smoking, spitting or straws for 24 to 48 hours; {follow_up}. FIL: F03.

**3. `root-canal-2026-10`: Root canal treatment / Pahintulot sa root canal** · 40 · 3 min · attest · guardian · 180 days · explained, risks.
- Fields: `teeth` (1) · `diagnosis` (+ other): an inflamed nerve that will not heal · a dead nerve with infection · an abscess · a failing old root canal (redo) · `visits` *(desk)* (1–4, 2) · `after`: a filling · a crown · a post and crown · `estimate` *(desk)* · `estimate_after` *(desk)* (allowLater, "The {after}, a separate fee") · `specialist` (yes → "You may ask to see a root canal specialist (endodontist).").
- What: open tooth {teeth}, remove the nerve, clean, medicate and fill the canals over {visits} visits, then {after}. Why: keep the tooth and ease pain or infection ({diagnosis}).
- Risks (initials): pain, swelling or tenderness for a few days. **Less common:** a small instrument breaks in a canal; a hole through the side of the root; canals blocked or too curved to finish; material past the root end; a crack found during treatment; damage to an existing crown or filling; it may fail and need redoing, root-end surgery or removal; the tooth is weaker and may break without a crown.
- How it usually goes: "In large studies, about 9 in 10 root-treated teeth are still in place 4 to 10 years later; a crown afterwards helps most." *(review: Ng et al. 2010; never "95% successful")*. Other choices: removal (then an implant, bridge, denture or a gap); watch it; a specialist; no treatment. Without it: pain, an abscess, losing the tooth. Afterwards: come back for the {after}; chew on the other side until then. Cost: two lines. FIL: F04.

**4. `restoration-2026-10`: Fillings, crowns, bridges and veneers / Pahintulot sa pasta, crown, bridge at veneer** · 50 · 2 min · attest · guardian · 180 days · explained, risks.
- Fields: `kind` (required): filling · crown · bridge · veneer · inlay or onlay · `teeth` (required) · `bridge_teeth` (when bridge) · `material` (+ other ≤ 60): composite · glass ionomer · porcelain fused to metal · zirconia · lithium disilicate · full metal · `temporary` (when crown, bridge, veneer, inlay) · `visits` *(desk)* (1–6) · `estimate` *(desk)*.
- What: remove decay or the old filling and shape tooth {teeth}; for a crown, bridge, veneer or inlay an impression or scan, a temporary, then the final one fitted after you approve its fit and colour.
- Risks (initials): sensitivity to cold, heat or biting for days to weeks; a high bite or sore jaw needing a small adjustment; a stiff jaw. **Less common:** the nerve may need a root canal; deeper decay found once work starts (a bigger filling or a crown); chipping, breaking or coming loose; new decay at the edges; a sore gum at the edge; the colour may not match exactly; swallowing or breathing in a crown during a try-in.
- Crowns and bridges: the temporary can come off, so come back promptly; delay lets teeth move; the teeth holding a bridge ({bridge_teeth}) are shaped down for good. Veneers: enamel removed cannot be put back; a chipped veneer usually cannot be repaired; the colour cannot change after bonding; nails, ice or grinding can loosen one (a night guard may be advised).
- Other choices: none; another material; a filling instead of a crown (less protection); removal; for a gap an implant or denture; for looks whitening, bonding or braces. Without it: decay spreads, pain, losing the tooth. Afterwards: no chewing on a new filling until the numbness has gone. FIL: F05.

**5. `periodontal-2026-10`: Deep cleaning and gum treatment / Pahintulot sa malalim na paglilinis at gamutan sa gilagid** · 60 · 2 min · attest · guardian · 180 days · explained, risks, history.
- Fields: `areas`: upper right · upper left · lower right · lower left · whole mouth · `visits` *(desk)* (1–4) · `numbing` · `extras`: chlorhexidine mouthwash · antibiotic placed in the gum · none · `recheck_weeks` *(desk)* (4–12, 6) · `maintenance_months` *(desk)* (3 · 4 · 6) · `estimate` *(desk)*.
- What: remove tartar and bacteria below the gum and smooth the roots in {areas} over {visits} visits. Why: reduce the infection and slow bone loss.
- Risks (initials): swelling, soreness and bleeding for a few days; as swelling goes down the gums shrink, roots show, gaps look bigger and food catches; sensitivity to hot, cold and sweets; teeth may feel loose at first (most firm up, not all); infection. Results: no guarantee; smoking, diabetes and home care change them; without maintenance gum disease usually returns.
- Other choices: none (the disease goes on, teeth can be lost); an ordinary cleaning (it does not reach deep pockets); gum surgery or a periodontist; removing teeth that cannot be saved. Afterwards: brush and clean between teeth daily; a recheck in {recheck_weeks} weeks, maintenance every {maintenance_months} months. FIL: F07.

**6. `denture-2026-10`: Dentures / Pahintulot sa pustiso** · 70 · 2 min · attest · guardian · 365 days · explained, risks.
- Fields: `arch`: upper · lower · both · `type`: complete · partial acrylic · flexible · cast metal · immediate · overdenture · `extract_first` (teeth, optional) · `visits` *(desk)* (text, "Impression, try-in, fitting, then adjustments") · `included` *(desk)* ("Adjustments for 3 months after fitting") · `relines` *(desk)* ("Relines after that are a separate fee") · `estimate` *(desk)*.
- Risks and limits (initials): weeks to get used to; sore spots needing adjustment visits; speech changes at first; learning to eat again; looseness, most of all a lower complete denture; gums and bone shrink, so relines or a new denture are needed; immediate dentures need more adjustments and are often temporary; a partial's clasps can raise decay and gum problems on the teeth holding them; it may not support the lips and face as natural teeth did; it can break (do not glue it at home); smell or stains without daily cleaning.
- Other choices: no replacement (teeth drift, the bite collapses); a bridge; implants; an implant-held denture. Afterwards: every fitting and adjustment; {included}; {relines}. The PDA's "30 days' delay may mean a remake" line is left out pending review (open question 9). FIL: F06.

**7. `implant-2026-10`: Dental implants / Pahintulot sa dental implant** · 80 · 3 min · attest · guardian · 180 days · explained, risks, history.
- Fields: `teeth` (sites, required) · `timing`: right after an extraction · after healing · `graft`: none · bone graft · sinus lift · both · `scan` (a CBCT was taken) · `healing_months` (2–9) · `restoration`: crown · bridge · overdenture · `made_by` *(desk)* (≤ 120) · `estimate_surgery`, `estimate_restoration` *(desk)* · `risk_factors`: smokes · diabetes · bone medicines · grinding · radiotherapy · none noted.
- What: with numbing the gum is opened, the bone prepared and the implant placed; after {healing_months} months a {restoration} is attached.
- Risks (initials): pain, swelling, bruising; infection. **Less common:** the implant does not join the bone and is removed (a retry may be possible); nerve injury (lower jaw), temporary or permanent; an opening into the sinus (upper jaw); injury to nearby teeth; a failed graft; rarely a broken jaw. Later: gum recession or a grey edge; a loose screw; a chipped crown; infection around the implant with bone loss (peri-implantitis), about 1 in 5 patients in studies *(review)*.
- How it usually goes: about 96 in 100 implants are in place after 10 years in studies *(review: Howe 2019)*; smoking, uncontrolled diabetes and some bone medicines raise the risk of failure. Other choices: none; a bridge; a removable denture; a resin-bonded bridge. Afterwards: clean around it like a tooth, with regular reviews. Cost: two lines. FIL: F10.

**8. `ortho-2026-10`: Braces and orthodontic treatment / Pahintulot sa braces** · 90 · 3 min · attest · guardian · 365 days · explained, risks.
- Fields: `appliance`: metal braces · ceramic braces · clear aligners · removable appliance · functional appliance · `extractions` (teeth, optional) · `mini_screws` · `months` (range 3–48) · `visit_weeks` *(desk)* (2–12) · `fees` *(desk)* (≤ 200) · `breakage` *(desk)* (≤ 160) · `retainer` (≤ 120) · `estimate` *(desk)* (total).
- Risks (initials): discomfort after adjustments; white spots and decay without good cleaning; gum disease; roots may shorten (unpredictable); a tooth hurt in the past may lose its nerve; mini-screws can loosen, break or irritate; jaw joint problems with or without braces; impacted teeth may not move; injury from the appliance or swallowing a part; allergy to a material; treatment may take longer and fees may change; smoking worsens results.
- Results: teeth tend to move back, so retainers are worn long-term; no one can promise straight teeth for life; wisdom teeth may push teeth. Records: X-rays, photos and models are part of the treatment. Other choices: none; limited treatment; crowns or veneers; jaw surgery (specialist). Cost: {estimate}; {fees}; {breakage}; moving to another dentist may change fees and time. FIL: F08.

**9. `whitening-2026-10`: Tooth whitening / Pahintulot sa pagpapaputi ng ngipin** · 100 · 2 min · attest · `not_under_18` · 90 days · explained, risks.
- Fields: `method`: in the clinic · trays at home · both · `product` (≤ 80) · `strength` (≤ 40, "hydrogen peroxide 35%") · `sessions` *(desk)* (1–10) · `shade_before` (≤ 20) · `wont_change` (teeth, optional) · `estimate` *(desk)*. Patient (each `stop`): `pregnant` (yes/no/not sure; stop on yes or not sure) · `smoke_drink` (stop on yes) · `recent_work` "A filling or crown in the last 2 weeks?" (stop on yes).
- Before: an examination, and treatment of decay and gum disease, come first. The product label says not for anyone under 18, not while pregnant, not for people who smoke or drink often, not within 2 weeks of a filling or crown *(ASEAN Cosmetic Directive, Annex III)*. Risks: sensitive teeth, usually mild and short; sore gums from the gel. Limits: only natural teeth whiten; fillings, crowns, veneers and dentures ({wont_change}) do not and may need replacing to match, at extra cost; results vary and fade; white spots may look more visible for a while. Other choices: none; cleaning and polishing; bonding, veneers or crowns. FIL: F09.

**10. `photos-2026-10`: Photos and use of records / Pahintulot sa litrato at paggamit ng rekord** · records · 200 · 1 min · attest no · guardian · until withdrawn · `refuseUnsigned` · no ticks.
- Fields *(desk)*: `photo_types`: inside the mouth · face · `uses` (required): sharing with a specialist or laboratory for this treatment · teaching and journals without your name · the clinic's website or social media.
- Patient: one yes/no per offered use, none pre-ticked; for social media, `face` and `name` (default no).
- For your record (text, not a choice): photos, X-rays and scans for diagnosis and your record are part of your care, under the general consent's *Examination* point and the privacy notice. Your choices: "Saying no to any of these does not change your care" (NPC Circular 2023-04: granular, no bundling, no "Required" on an optional item). Withdrawing: tell the clinic in person, by phone or by text; it stops future use; what was already published or printed may not be recalled. FIL: F12.

**Not in the library:** informed refusal (it is *I do not agree*, signed); minor and guardian (the signature rules of §2.3 plus assent at attestation); sedation (open question 8).

### 3.5 On screen
`ConsentDocument.astro` (`src/components/consent/`) is the one renderer, in three modes: `patient` (§2.3), `preview` (read-only, 390px, in a `SidePanel`; no iframe, every page sends `frame-ancestors 'none'`), `record` (from the snapshot). `consent.css` in `@layer components`: headings 18px/700, risks under two sub-heads, initials right-aligned, Filipino in ink-2 under the English, "For" pills with `.rp`. Hooks `data-cd-*` (desk `data-ik-*`, patient `data-ip-*`).

### 3.6 A4 print (`…/consents/<doc>/print/`)
- From the latest signing's snapshot (paper: the unsigned document); never re-rendered from the library. Black on white; audit `consent.print`. `@page { size: A4; margin: 16mm 16mm 20mm }`, bottom-left "CF-7K2FQ · extraction-2026-10", bottom-right "Page x of y".
- Head: the clinic's name, address and phone from the snapshot (no logo, no invented letterhead); ref, version, languages. Title 16pt, Filipino 12pt.
- Patient box: patient, born (age), chart no. ("from the record", outside the snapshot), signed by, as whom, relation, authority and ground, explained by (PRC), in which language, interpreter, read themself or read to them by.
- Body: the facts, "In short" boxed, sections at 10.5pt with "Initials: JDC", ticks ☑, the decision ☑/☐, answers as a table.
- Signature block (`break-inside: avoid`): strokes as SVG (`Signature.astro`), name and capacity, "Signed 29 Sep 2026, 10:42, Manila, on the patient's phone" (or "on the clinic's tablet", "by mark, witnessed by Liza Santos 10:44", "on paper, recorded by …, scan: file"), the short seal.
- Dentist line: "Confirmed and explained in Filipino by Dr Ana Reyes, PRC 0123456, 29 Sep 2026, 10:20" (+ assent, 7–17). Withdrawal line, if any.
- Evidence footer (8pt; hashes in Plex Mono), facts only: "Link made by Liza Santos 10:31 · page opened 10:40 · decided 10:42 (open 2 min 10 s before deciding) · sent 10:48". Nobody is called a witness who did not confirm it. The words' SHA-256, the seal, "Chain no. 1432".
- Check: **"Unchanged since it was stored"** (green words) when the snapshot hash, the seal and its chain link recompute (§4.6); otherwise a red callout "This copy does not match what was stored. Do not use it as the original", printed too. The seal is compared with the patient's copy and the Close the day sheets, which live outside the database.
- **Paper for signing** (`records.edit`; a procedure form only once attested): empty ☐ boxes, initials boxes, lines for the signer (name, relation, authority) and the dentist, a date. Sets `paper_printed_at`; audit `consent.paper_print`.

### 3.7 Freezing what was signed
- `snapshotText` = `canonicalJson` (keys sorted, no whitespace, NFC, integers, `fields` as stored) of `{ schema: 1, document, ref, version, code, library, langs, clinic, patient, dentist, attested: {at, lang, interpreter, assent} | null, title, for, in_short, sections, ticks, answers, fields, decision, decision_words, signer: {name, as, method, relation, authority, ground, note}, read, explained_in, meaning, date }`, rendered by the server at the decision, never taken from the browser.
- The definer checks `document`, `version`, `decision`, `fields`, the signer's name and `attested.at` against the rows; the `consent_signing` trigger computes both hashes (callers cannot supply them); the chain row follows once the form is on a record (§4.6).
- `consent_version.body_sha256 = sha256(canonicalJson(template))`; `templatesInForce()` offers a template only when they match, and `consent-library.test.ts` fails otherwise. New words are a new version id and row, in one change.

### 3.8 Review gate and versions
`CONSENT_REVIEWED` starts empty. Production offers a template, **the general consent included**, only when listed, and Filipino only when `langs` has `fil` (recorded in the snapshot); development offers all, tagged. `treatment-2026-09` is already signed live on the 035 page without a review: the owner lists it after the dentist and lawyer read it, or knowingly now, and the decision is written in CLAUDE.md, not in code. Words the lawyer changes ship as new ids (`-2026-11`, 040+).

### 3.9 Clauses never used
Liability waivers and paying the clinic's attorney's fees or collection costs (Civil Code Arts. 6, 1171, 1172) · blanket authority (the narrow `unexpected` line replaces it) · a pre-printed "I have no further questions" · precise success claims ("95%") · "noncompliant patients may be dismissed" · "Required" on an optional item · the PDA's Religion field.

---

## 4. Data model: `src/data/migrations/039_patient_intake.sql`

Additive: new tables, nullable columns, one widened check each on `consent_version` and `patient_consent`. Every new table has `clinic_id`, RLS enabled and forced with the `tenant_isolation` policy. The public side has no tenant: the definers of §4.5 are the only way in, the clinic comes from the token, and none raises with an answer in the error. Limits: names ≤ 120, relation ≤ 60, notes ≤ 200/300, answers ≤ 4 KB, page 1 ≤ 24 KB, fields ≤ 8 KB, snapshot ≤ 64 KB, strokes 1–80 lines, ≤ 120,000 characters.

### 4.1 The library
`consent_version` gains `code` and `body_sha256`; kinds `privacy | treatment | document`; `(kind = 'document') = (code is not null)`, a document's hash 64 hex (the general consent gets its hash by update). `current_document_of(code)` (definer, stable) is the row in force on the Manila day. Ten rows `anaesthesia-2026-10` … `photos-2026-10` from 2026-10-01, hashes from `npm run consent:hash` (placeholders are refused, so the file cannot apply unfilled).

### 4.2 Tables
- **`intake`**: `ref` (`IN-` + 4), `target` (`new`|`existing`), `patient_id`, `appointment_id`, `label`, `form_version`, `desk_minor` (`yes`|`no`|`unsure`), `came_with` (`parent`|`guardian`|`other_adult`|`nobody`), `answers`, `page1_done_at`, `privacy_version`, `privacy_at`, `privacy_as` (`patient`|`parent`|`court_guardian`|`none`), `privacy_by_name`, `privacy_relation`, `id_tries` (0–3), `verified_at`, `status` (`preparing`|`out`|`sent`|`added`|`cancelled`), `rev`, `created_by/at`, `last_activity_at`, `sent_at`, `send_nonce`, `decided_by/at`, `added_as`, `cancelled_by/at`, `cancel_reason`. Checks: `existing` has a patient and no page 1; a privacy agreement names its person; `added` has a patient and a decision; `sent`/`added` have `sent_at`; `cancelled` ⇔ `cancelled_at`. Trigger: identity columns fixed; `added`/`cancelled` final; preparing→out|cancelled, out→preparing|sent|added|cancelled, sent→added|cancelled; the patient set once, this clinic's, not archived; the visit theirs.
- **`clinic_tablet`**: `name` (≤ 40), `secret_sha256` (unique), `created_by/at`, `last_seen_at`, `retired_at/by`.
- **`intake_link`**: `token` (26 of `KEY_ALPHABET`), `intake_id` (cascade), `device` (`phone`|`tablet`|`desk`), `tablet_id`, `created_by/at`, `open_by` (+15 min), `claimed_at`, `device_sha256`, `last_seen_at`, `retired_at`, `retired_why` (`replaced`|`stopped`|`switched`|`cancelled`|`sent`|`idle`|`expired`|`locked`). One live link per intake. `tablet` and `desk` links are inserted claimed. Only for an intake `preparing`/`out`; afterwards one claim and one retirement, nothing else.
- **`consent_document`**: `ref` (`CF-` + 5), `version_id`, `intake_id` (set null), `patient_id`, `appointment_id`, `plan_item_id`, `fields`, `dentist_id`, `dentist_name`, `dentist_prc`, `explained_in`, `explained_other`, `interpreter`, `sort`, `rev`, `prepared_by/at`, `changed_at`, `paper_printed_at`, `cancelled_by/at`, `cancel_why` (`removed`|`renewed`|`minor`|`intake`). Trigger: a `treatment` or `document` version; forms other than general and photos name a dentist with PRC; patient and intake this clinic's. `clinic_id`, `ref`, `version_id`, `prepared_*` never change; `patient_id` only null → value. **Once attested, signed or printed:** `fields`, `dentist_*`, `explained_*`, `interpreter`, `appointment_id`, `plan_item_id` and `sort` are frozen. Once signed: `intake_id` moves only to a new intake re-signing a refused or withdrawn form; no cancel. Field or dentist changes bump `rev`.
- **`intake_page`** (definers only; key intake + document, both cascade): `state` (`reading`|`read`|`question`|`agreed`|`refused`|`later`), `doc_rev`, `answers`, `signed_by_name`, `signed_as` (`patient`|`guardian`), `method` (`sign`|`mark`), `relation`, `authority` (`parent`|`court_guardian`|`substitute`|`written`|`representative`), `authority_ground`, `authority_note`, `explained_in`, `read_by`, `strokes`, `snapshot`, `opened_at` (nullable, reset with the page), `decided_at`.
- **`consent_signing`** (insert-only): `document_id` (restrict), `intake_id`, `decision`, `channel` (`phone`|`tablet`|`desk`|`paper`), `method`, `snapshot`, `snapshot_sha256`, `seal_sha256`, `answers`, the signer columns, `explained_in`, `read_by`, `strokes`, `signed_on`, `attachment_id`, `needs_confirm` (`witness`|`authority`), `link_by`, `opened_at`, `decided_at`, `recorded_by`, `signed_at`. Unique `(intake_id, document_id)` where `intake_id` is not null. Paper ⇔ `signed_on`, `attachment_id`, `recorded_by`; strokes absent only for paper or a photos refusal; `mark` and every authority but `parent` never on `phone`. Trigger: the document open and this clinic's; an `attest` form attested before `decided_at`; a paper scan this patient's, uploaded after the print; the snapshot matching the rows; `needs_confirm` computed; both hashes computed here (`consent_seal(snapshot_sha256, strokes | 'paper <date> <attachment>', name, as, method, signed_at)`), whatever the caller passed.
- **`consent_attestation`** (insert-only, one per document): `dentist_id`, `dentist_name`, `dentist_prc`, `explained_in`, `interpreter`, `assent` (required 7–17), `fields_sha256`, `attested_at`; only the document's own treating dentist with PRC and access here; not photos or general.
- **`consent_confirmation`** (insert-only, one per signing): `kind` (`witness`|`authority`), `staff_id` (with `records.edit` here), `attachment_id`, `note`, `confirmed_at`; must match `needs_confirm`.
- **`capacity_note`** (insert-only): `patient_id`, `dentist_id` (treating, PRC), `reason`, `recorded_at`.
- **`consent_withdrawal`** (insert-only, one per signing; only the latest, agreed): `told_by_name`, `how`, `note`, `recorded_by`, `withdrawn_at`.
- **`consent_override`** (insert-only): `document_id`, `context` (`plan_done`|`in_chair`|`strip`), `state_then`, `reason`, `staff_id`, `at`.
- **`consent_chain`** (insert-only): `seq`, `signing_id` (unique), `seal_sha256`, `prev_sha256`, `chain_sha256`, `at`.
- **`intake_event`** (insert-only): `kind` (`started`, `link`, `handover`, `opened`, `page1`, `reading`, `read`, `question`, `decided`, `resign`, `sent`, `stopped`, `switched`, `cancelled`, `added`, `seen`, `expired`, `idle`, `identity`, `locked`, `age_check`, `cancelled_doc`, `confirm`, `renewed`, `dismissed`), `document_id`, `detail` (≤ 120, never an answer), `staff_id`, `at`.
- `medical_history.intake_id`; `patient_consent.intake_id` with channel `intake`, which requires `recorded_by`, `agreed_as` and `given_by_name` (as `form`).

### 4.3 Grants
Revoke the default privileges, then: `intake` select, insert, update of the desk's columns (status, patient, visit, label, desk answers, rev, decision, cancel) · `intake_link` select, insert, update of the retirement · `clinic_tablet` select, insert, update of name and retirement · `consent_document` select, insert, update of the columns above (the trigger freezes them) · `intake_page` select · insert-only tables select, insert. `intake_gate` is granted to nobody.

### 4.4 Locking
**Intake first, then link, everywhere.** `intake_gate` finds the intake through an unlocked read of the link, locks the intake `for update`, then the link `for update` (re-read after any wait). Every desk write locks the intake first (§5.2). A patient's Send and the desk's Stop therefore never deadlock, and the second sees the first's result.

### 4.5 The definers (`p_device`: SHA-256 of the device secret)
- **`intake_gate`** (internal): `unknown` · `welcome` · `verify` · `open` · `taken` · `expired` (15 min unclaimed, or 24 h since start) · `idle` (20 min unseen) · `replaced` · `locked` · `finished` · `closed`; retires links past their time; touches `last_seen_at` when open.
- **`intake_view`**: the clinic's face always; the part count at `welcome`; the pages at `open` only, each with `signable` (general, photos, or attested) and the attestation's dentist, language and time.
- **`intake_claim`** (phone), **`intake_verify`** (birth date = the record's, else `id_tries + 1`; at 3 the link retires `locked`), **`intake_ping`**, **`tablet_poll(secret)`** (the tablet's live link or `ready`).
- **`intake_save_page1`**: `new`, `out`. The privacy screen re-checks page 1, the version in force (`changed`) and who agrees (minor: parent, court guardian or `none`; adult: patient). The age check against `desk_minor` answers `age_check` until one side changes. A minor: whitening forms cancelled (`minor`). Who they are changing resets signed pages and `opened_at` (`resign`).
- **`intake_mark_page`**: `opened` (sets `opened_at` if null) · `question` · `read`; a page at an older `rev` starts again.
- **`intake_decide`**: `saved` · `not_ready` (an `attest` form with no attestation) · `changed` · `order` · `invalid` · gate status. `later` clears the page. Agree or refuse applies §2.3's rules: the patient's name equals the server's; on a phone only the patient or a parent; substitute needs ground, category and 21+; representative an adult with a capacity note in 30 days; mark an adult on a clinic device; photos may refuse without strokes; then the snapshot checks.
- **`intake_send`**: `again` (same nonce) · `unfinished` (page 1, the privacy version, or a page with no decision; `read` and `later` count as decided) · `changed` (a version not in force; nothing wiped) · else one `consent_signing` per agreed or refused page, the link retired `sent`, and `update intake … where id = $1 and status = 'out'` checked for one row: `sent` for new, `added` for on file.

### 4.6 The chain
When a signing belongs to a record (at insert if its document has a patient, else when Add sets `patient_id`), a trigger takes `pg_advisory_xact_lock(hashtext('consent-chain:' || clinic_id))` and inserts `seq = last + 1`, `prev_sha256` (64 zeros first), `chain_sha256 = sha256(prev ‖ seal ‖ seq)`. Signings never added are never chained, so the purge cannot break it. `consent_chain_head(clinic, day)` is printed on Close the day ("Consent forms: 1432 · 7C1E-09AB-44"); `consent_chain_check(clinic)` walks it.

### 4.7 Record functions (invoker, under RLS)
`consent_document_state(doc)`: `cancelled` · `to_sign` · `to_confirm` · `agreed` · `refused` · `no_photos` · `withdrawn`. `visit_treatment_consented(appointment)`: a `visit_consent` row, or the visit's general-consent form `agreed`; used by `cal/data.ts`, the visit strip and `panels.ts`.

### 4.8 Retention (`retention_purge()`, same signature)
1. Texts after 2 years, poster forms not added after 30 days, as today.
2. In its own `begin … exception when others then raise warning … end`, so step 1 always runs: intakes `preparing`/`out`/`cancelled` over 24 hours old, and `sent` over 30 days **unless held** (it holds a signing and a patient here likely matches it — same names and the same or no birth date, or the same mobile — or it has a visit; a held intake waits for Add or Dismiss). Delete their events, pages and links; for documents with no patient, confirmations, signings, attestations and the documents; then the intakes. Documents for a patient on file stay.

### 4.9 Where it meets the existing tables
- **`patient`** is written only when the desk adds a sent intake (`created_by` the adder); the documents get `patient_id` in that transaction. **`patient_form`** is untouched; the paths share `STEPS`, the parser engine, the gate list and `patient-add.ts`.
- **`patient_consent`**: page 1's agreement becomes one row at Add (channel `intake`, `given_at = privacy_at`, `agreed_as` and `given_by_name` from the intake, `recorded_by` the adder); `none` writes nothing. Procedure consents are never `patient_consent` rows; `readConsents()` stays privacy-only.
- **`visit_consent`** (035) untouched and still read. **`medical_history`** at Add: `answered_by 'patient'`, `recorded_by` null, `answered_at` the time added, `intake_id`, `answers.intake = {id, ref, version, sent_at}`.

---

## 5. Server code

### 5.1 Modules
- **`consent-library.ts`** (§3.1). **`consent-seal.ts`**: `canonicalJson`, `snapshotText`, `sha256Hex`, `libraryHash`, `templatesInForce(q)` (rows ∩ `TEMPLATES` ∩ hash match), `verifySigning(tx, id)` → `{ snapshotOk, sealOk, chainOk }` (recomputed in SQL), `shortSeal`. `npm run consent:hash` prints the hashes.
- **`intake-def.ts`** (no Node imports): `INTAKE_FORM_VERSION`, `INTAKE_DEF`. The engine moves out of `parsePatientForm` into `patient-forms-def.ts` (`FormDef`, `indexFields`, `parseForm`, `parseScreen`); `parsePatientForm = (f, o) => parseForm(FORMS_DEF, f, o)`, proven by the unchanged fixtures.
- **`refused.ts`**: one `Refused` (`reasons: string[]`), always **thrown** by `intake.ts` and `consent-docs.ts` and caught outside `withClinic`, so the transaction and its rev bump roll back. The four page-local copies move to it as they are touched.
- **`patient-add.ts`** (phase 1, from `patient-forms.ts`, where these are private today): `insertPatientFromAnswers` (`nextChartNos` under `lockClinic`), `fillPatientFromAnswers` (`planFill`, `FILLABLE`, the mobile/email rule), `writeHealthFromAnswers`, `writePrivacyConsent`, taking `PatientFormValues`-shaped answers and `{ formId } | { intakeId }`. The forms queue and `addIntake` both call them; `scripts/dev/qr-forms/backend-test.mjs` passes unchanged.
- **`intake.ts`** (desk, in `withClinic`): `startIntake`, `loadIntake`, `suggestConsents`, `saveChecklist`, `saveClinicPart`, `goLive`, `stopLink`, `cancelIntake`, `dismissIntake`, `renewDocuments`, `setDeskAnswers`, `intakeStatus`, `addIntake`, `markSeen`, `confirmSigning`, `registerTablet`, `removeTablet`; `page1Open = phoneOpen = formsNoticeReady`; `offered(t) = !isProduction() || CONSENT_REVIEWED.some((r) => r.version === t.version)`. Tokens `KEY_ALPHABET` × 26 (`crypto.randomInt`); refs retried on conflict ≤ 12 times.
- **`intake-public.ts`** (patient; each call one `publicRead`): `deviceSecret`, `lookupIntake` (`welcome | verify | open | unavailable | expired | idle | taken | replaced | locked | closed | finished | unknown | wait`), `claimIntake`, `verifyIntake`, `savePage1`, `markPage`, `decidePage`, `sendIntake`, `pingIntake`, `pollTablet`, `INTAKE_WORDS`. `unavailable` for a phone link while `!phoneOpen`, page 1 while `!page1Open`, or any page not `offered`; every public write checks first.
- **`consent-docs.ts`** (record): `loadConsentDocuments`, `loadConsentDocument`, `attestDocument`, `recordCapacity`, `withdrawConsent`, `printForPaper`, `recordPaperSigning`, `cancelDocument`, `overrideConsent`, `consentGaps({ planItemId?, visitId? })`.
- **`park.ts`**: the `fl_park` hint (HMAC with `SESSION_SECRET`, httpOnly, Secure, SameSite=Strict, `Path=/auth/`, 24 h) grants nothing; `readSession` unchanged.

### 5.2 Every staff write
`csrfOk` (else `?stale=1`) → `hit('record:s:'+staffId)` → `withClinic` → first line `canEditRecords`, else throw "Your account cannot add patients at this branch. Ask the owner." → the intake `for update`, then its live link → `update intake set rev = rev + 1 where id = $1 and rev = $2` (no row: "Someone else changed these forms while you were working. Here they are as they are now.") → anything refused throws.

| Action | Checks in the transaction | Audit |
|---|---|---|
| `startIntake` | on file: not archived, a birth date, the visit theirs and going ahead; `new` needs `page1Open`, phone `phoneOpen`; moved forms: theirs, not cancelled, never signed or latest refused/withdrawn | `intake.start` |
| `saveChecklist` | `preparing`; desk answers; each code `offered` and in force; no whitening for a minor; new forms made, unticked unsigned ones cancelled; only accepted plan items pre-tick | `intake.consents` |
| `saveClinicPart` | `readClinicPart`; the dentist treats, has access and PRC; dentist fields stay proposals unless the named dentist ticks *Confirm* (→ `attestDocument`) | `intake.prepare` |
| `goLive` | phone: `phoneOpen`, `intake:m:`; tablet: registered, seen in 2 min; desk: this browser's new secret; the old link `replaced`; status `out` | `intake.link` / `intake.handover` |
| `/auth/park/` | `goLive` (desk), `clearSession`, the hint | `intake.handover` |
| `stopLink` · `cancelIntake` · `dismissIntake` | retire the link; `change` → `preparing`; cancel: not added, unsigned forms cancelled; dismiss: `sent`, a reason | `intake.stop/cancel/dismiss` |
| `renewDocuments` | unsigned forms whose version left force are cancelled (`renewed`) and remade in force; fields copied when the field set is unchanged; attestation again | `consent.renew` |
| `setDeskAnswers` | `preparing`/`out` | `intake.age` |
| `confirmSigning` | needed; not the signer; an authority names a patient file | `consent.confirm` |
| `addIntake` (new) | `lockClinic`; `sent`; every look-alike in `seen`; `patient-add`; privacy row unless `none`; forms → the patient (chain follows) | `intake.add`, `patient.create`, `health.update`, `consent.intake` |
| `addIntake` (on file) | as above; not archived; empty fields only, never a name, mobile/email only in `use` | `intake.add`, `patient.update`, … |
| `attestDocument` | the named treating dentist with PRC; open, unsigned, unprinted; assent 7–17; freezes fields | `consent.attest` |
| `recordCapacity` · `withdrawConsent` | a treating dentist with PRC, an adult · latest signing agreed | `consent.capacity` · `consent.withdraw` |
| `printForPaper` · `recordPaperSigning` | unsigned, attested when required · printed; `signedOn` from the print day to today; the scan; the signer rules; channel `paper` | `consent.paper_print` · `consent.paper` |
| `cancelDocument` · `overrideConsent` | no signing · a reason | `consent.cancel` · `consent.override` |
| `registerTablet` · `removeTablet` | `settings.edit` | `tablet.add` · `tablet.remove` |
| `/auth/unlock/` | `authenticateAt`, the door's limits | `login.ok`, `device.unlock` |

Viewing audits `consent.view`, printing `consent.print`. `suggestConsents` reads the booking (unticked, "not yet examined"), plan items a treating dentist accepted (ticked), the patient's age and signed forms.

### 5.3 The public side
- Every POST: `readCappedForm(request, 192 KB)` (413 over); CSRF miss → re-render with answers, 403; honeypot → answered as saved, nothing written; the device secret (`fl_idev`, `fl_ctab`, or the desk-made one); none on a claimed link → `taken`.
- `LIMITS.intake`: `make [60, 3600]` (`intake:m:<staff>`), `link [900, 3600]` (`intake:l:<intake>`, posts and pings), `ip [600, 3600]` (`intake:ip:<clinic>:<ipBucket>`, posts only: CGNAT carries many clinics' patients), `poll [120, 60]` (`intake:poll:<staff>`), `tablet [1200, 3600]`. Unknown tokens count `forms:miss:<ipBucket>`; a live link is never refused by it.
- Decisions are keyed by (intake, document); Send carries a fresh `NONCE_FIELD`; the same nonce answers `again`.
- Never logged: answers, strokes, snapshots, tokens, secrets. Errors log the intake id; the middleware redacts `/f/i/<token>` and `/f/<key>`. A token in a host's access log lives ≤ 24 h and is bound to its device.

### 5.4 Deciding a page (`decidePage`)
`lookupIntake` (open, this device; `not_ready` unless signable) → `readPatientPart(t, raw, { minor, device })` (the patient's name from the view, never the post) → `readStrokes` (not for a photos refusal) → `renderDocument(t, fields, { clinic, patient, dentist, attested, langs, answers, initials, decision, signer, read, explained_in, date: manilaToday() })` → `snapshotText` → `intake_decide`.

### 5.5 Production gate

| Path | Production, notice not listed | Listed in `FORMS_PRIVACY_VERSIONS` |
|---|---|---|
| Page 1, any device | closed; new patients are typed at `/new/type/?next=consents` (desk consent), then a consents-only intake | open |
| The phone link | closed: card disabled, `goLive` refuses, `unavailable`, public writes refuse | open |
| Clinic devices, consents only, on file | open (as the live 035 page) | open |
| Templates / Filipino | `CONSENT_REVIEWED` only, the general consent included / `langs` with `fil` | same |

Development opens everything and tags unreviewed words.

---

## 6. Pages and routes

| Route | File | What |
|---|---|---|
| `/c/<slug>/patients/new/` | `patients/new/index.astro` (replaces `new.astro`) | Screen A |
| `…/patients/new/type/` | `patients/new/type.astro` | today's Add patient moved (paths, `here`, `?next=consents`; fix the stale `canBill` comment) |
| `…/patients/intake/` · `…/intake/<id>/` · `…/<id>/status/` | `patients/intake/index.astro`, `[intake].astro`, `[intake]/status.ts` | the list (POST `intent=start`); Screens B–F (`?step=`); the panel's JSON (no-store) |
| `/auth/park/` · `/auth/unlock/` | `auth/park.ts`, `auth/unlock.astro` | hand this device over; sign in again (`StaffEntrance`, `SignInForm` pieces) |
| `/f/i/<token>/` | `f/i/[token].astro` | the patient's pages (`/f/[key]` shell and no-leak script, `_Field`, `ClinicRoom`, `ClinicBadge`, `patient.css`, `clinic-glass.css`) |
| `/f/t/` | `f/t/index.astro`, `f/t/poll.ts` | a clinic tablet's waiting screen |
| `…/settings/` → Clinic tablets | a settings section | register, name, remove |
| `…/patients/<id>/consents/<doc>/` (+ `print/`) | `patients/[patient]/consents/[document].astro`, `print.astro` | one form; A4 |

Shared: `src/components/consent/ConsentDocument.astro`, `consent.css`, `SignPad.astro` (out of `sign/[visit].astro`, markup compared before and after); `intake.css` (`ik-*`), `f/i/_intake.css` (`ip-*`). No new first path segment.

---

## 7. The record after
- **Landing** `?saved=intake&intake=<id>`: a green callout on the Overview, "Juan is added. 2 consent forms signed · 2 to sign at the chair · 1 not agreed", each part linking to Consent.
- **Head chips** (buttons to Consent, colour plus words): "Not agreed: Tooth extraction" (soft red) · "To sign: 2 consent forms" (amber) · "To confirm: 1 signature" (amber) · "Waiting for Dr Reyes to explain" (blue).
- **Consent section:** a **Consent forms** pane between *Privacy consent* and *Signed at visits*, newest first: title, teeth, a state pill from `consent_document_state` (Signed 29 Sep · Did not agree · No photos · To sign · To confirm · Withdrawn 3 Oct), signer (`Who.astro`), a mini signature, the dentist line, **Open**, **Print**. Header: quiet **Prepare consent forms**; *Record that the patient cannot decide*. A *To sign* row: **Explain and confirm** (the named dentist), **Sign on this tablet**, **Print for signing on paper**. The existing panes stay.
- **Asks first:** Mark done on a plan item, *In the chair* (`/api/schedule`) and the strip's done lines call `consentGaps`; a linked form that is refused, withdrawn, to sign, to confirm or not explained asks "The patient did not agree to Tooth extraction · 36 on 29 Sep. Record it anyway?" with a required reason (`consent_override`, `consent.override`). Never a block.
- **Timeline** (`loadVisits`): a signed form joins its visit's "Consent signed" line, else a between-visit line (ref `cdoc:<id>`). **VisitPanels**: a "Consent forms" block, "Read what they signed" from the snapshot (`TREATMENT_CONSENT` only for `visit_consent` rows).
- **Visit strip and calendar:** "Consent to treatment" is `visit_treatment_consented()` in `cal/data.ts`, the strip and `panels.ts`; procedure forms for today's visit show as lines ("Tooth extraction: explain and confirm", "…: to sign → Sign on this tablet").
- **The document page:** the snapshot (`ConsentDocument`, `record`), signature, signer and capacity, the facts ("Signed on their phone 10:42 · open 2 min 10 s before deciding"), confirmations, the events, the fingerprints with "Unchanged since it was stored". Actions: **Explain and confirm** (teal for the named dentist until done), **Sign on this tablet** (never signed, refused or withdrawn), **I saw this signed / I checked**, **Record a paper signing** (with the scan), **Withdraw** (who told us, how, a note), **Print**.
- **Who sees it:** anyone who may open the record; intakes not yet added only `records.edit`.

---

## 8. Edge cases
- **A minor:** the desk answers *Under 18?* before the QR; page 1 needs the guardian section; only the authorities of §2.3 sign, the substitute and written ones on a clinic device with a staff confirmation; a yaya or driver cannot sign (the form waits *To sign*); whitening never offered, and cancelled if page 1 makes them a minor; assent for 7–17 at attestation. Born 2013 but the desk said adult: page 1 stops until the desk checks.
- **An adult who cannot write:** signs by mark on a clinic device, a staff witness confirms. **Cannot decide:** a court-appointed guardian, or a representative after the dentist's capacity note; clinic device or paper only.
- **Already a patient:** Add needs a decision on every look-alike; a mobile alone never makes the teal match; nothing overwrites a name, nor a mobile or email unless ticked. A walk-in record from "Here now" is a look-alike (and the visit's own patient when started from it).
- **On file, no birth date:** forms are refused until it is added.
- **Links:** expired, idle or locked links show "This code has expired. Please ask the desk for a new one." (410) and nothing typed; **Show the code again** resumes at the first unfinished page with saved screens kept; not sent in 24 h → purged.
- **Show again, switch, change the clinic's part:** the old link retires; its phone reads "This code was replaced. Please ask the desk for the new one."; saved screens stay; a form whose fields changed is signed again (`doc_rev`).
- **Two staff:** the rev check returns the second save as it now is; a second Add reads "Already added by Liza Santos at 10:52". **Two phones:** the first Start wins. **Double Send:** `again`. **Send and Stop together:** serialised (§4.4).
- **Words in force change:** the patient's page and Send answer "The clinic updated this form. Please ask the desk."; the desk **Renews** (§5.2) and the page is explained and signed again. **The privacy notice changes before Send:** `unfinished`, the privacy screen again.
- **Offline:** each screen keeps what was typed and the signature; nothing is cached by the service worker; paper is the fallback, recorded with its scan.
- **Refused, then agreed after talking:** **Sign on this tablet** on the same form: a new signing, the latest counts, both kept. **Ask the dentist first:** *To sign* after Send; the desk is alerted.
- **The named dentist leaves before explaining:** "Not explained yet (Dr X is no longer at this branch)"; nobody confirms for them; remove and prepare again with another dentist.
- **A handed-over device:** it holds no staff session; other open tabs show the locked card; every `/c/` page and API answers as signed out.
- **Sent, never added, but treated:** the intake is held (not purged) while a patient here matches it, and the chair prompts "Forms sent, not added".

---

## 9. Verification (measure, do not eyeball)
- **Playwright** (`scripts/intake-check.mjs`; desk 1440×900, phone 390×844 `isMobile`, a new preview port, the seeded database; read states back from the DB and pages):
  1. New patient, phone: general, anaesthesia, extraction 36; jsQR decodes the QR; page 1; sign the general; procedure pages read-only, a crafted signing `not_ready`; Send; the panel updates in 5 s; Add; the dentist explains and confirms; **Sign on this tablet**; three signed forms; print "Unchanged since it was stored".
  2. This device: no `fl_session` after hand-over; deleting `fl_park` opens nothing; `/c/…` and `/api/…` answer signed out; another tab shows the locked card; the record copy is gone, also with the network slowed past 5 s; unlock by **username** (a miss empties the password).
  3. A clinic tablet: registered, `/f/t/` picks up the link in ≤ 4 s; the desk stays signed in.
  4. Minor born 2013: the desk's "not under 18" stops page 1; guardian forced; whitening not offered, and cancelled when page 1 makes a minor; the definer refuses a crafted `as: 'patient'`, a substitute on a phone link, and a substitute without ground or 21+.
  5. Mark and representative: refused on a phone; the mark is *To confirm* until a staff member confirms under their own session; a representative without a capacity note is refused.
  6. Refuse and ask-first: alerts; *To sign*; re-sign a refused form; Mark done and *In the chair* ask first and store the reason.
  7. Photos: *No, thank you* stores a refusal with no strokes and no alert.
  8. On file, phone: nothing drawn before the birth date; three misses lock; `added` at Send.
  9. Look-alike: *Add as new* refused without `seen`; *Add to* fills only empty fields.
  10. Second device `taken`; expiry and idle (shift `open_by`, `last_seen_at`) then resume; Show again → `replaced`.
  11. Fields changed after a page was signed → *Sign again*; words changed (a newer row in a scratch DB) → `changed`, then **Renew**.
  12. Concurrency: two Sends in parallel with different nonces → one set of signings, the other `finished`; Send against Stop → no deadlock, one final state.
  13. Double Send `again`; public CSRF miss → 403, answers kept; honeypot writes nothing; the limits answer `wait` (pings not counted per address).
  14. Production (`NODE_ENV=production`, a valid env): the phone card disabled; `new` refused on every device; phone links `unavailable`; consents-only on the tablet works; only listed templates (none listed → only typing).
  15. A refused staff post returns with what was typed; a refused public post redraws the signature.
- **Database** (as `flossify_app`): update/delete refused on every insert-only table; `update intake set answers`, `insert into intake_page`, `insert into consent_version`, `execute intake_gate` refused; each frozen `consent_document` column raises after attestation, signing or paper print, `version_id`/`clinic_id` always, `patient_id` except null → value; cross-clinic selects empty; a wrong device hash `taken`; caller-supplied hashes replaced; paper without a scan refused; `retention_purge()` deletes exactly the fixtures (24 h, 30 d, held, with a patient, added) and still purges texts when the intake block fails.
- **Hashes and chain:** `libraryHash(t) === body_sha256` for every version (fails when one word changes); `sha256Hex(snapshot)` equals the DB's; `verifySigning` all true; editing a stored snapshot as superuser turns the check red and breaks the chain after it; the Close the day head matches `consent_chain_head`; an old signing's print body is byte-identical after library words change.
- **QR:** version ≤ 6 for the live and dev URLs; jsQR at 160, 240, 360px, blurred 1px, turned 7°, from desk screenshots light and dark. **Logs:** an error on `/f/i/<token>/` logs `/f/i/…`.
- **Design:** ≥ 4.5:1 for every text node on every new screen, the document card over all-black, all-white, stripes and no photo, light and dark, 1440 and 390; targets ≥ 44px; fields ≥ 16px; no sideways scroll at 390; exactly one visible, enabled teal fill per screen (`.ws-btn-primary, .btn-primary, .entry-btn-primary`) on `/c/…/intake`, `/f/i/`, `/f/t/` and unlock; no `text-transform: uppercase`; chosen dark = device dark; keyboard order through steps, the pad's Clear and the decision cards; `aria-live` on panel changes; a `reducedMotion: 'reduce'` run shows the same motion.
- **Roles** (`snap.mjs`/`cmp.mjs`): 7 roles × the new pages; only `records.edit` gets the steps, only the named dentist *Explain and confirm*; APIs refuse the rest; existing pages unchanged but the chooser, the Consent pane, the chips and the ask-first dialogs.
- **Print:** Chrome PDF of a 3-page form: "Page x of y", the signature block whole, black on white, measured point sizes, the short seal.
- **035 after the `SignPad` extraction:** the same DOM fingerprint but the component boundary; a signing still works.

---

## 10. Open questions for the owner (with the default used)
1. **"End of profile creation": is a new patient's profile made at Send?** Default: no; the desk's one tap after look-alikes, and the patient is told "the clinic adds your details next". Alternative: add at Send when there is no look-alike, as the person who made the link. Decide before phase 2.
2. **Procedure consents:** default read at registration, signed after the dentist explains and confirms (§0.4).
3. Draw on every form (default) or once and reuse. 4. Initials on the risks sections (default); the PDA initials every clause.
5. **Language:** bilingual key lines under full English (default); full Filipino, Ilocano or Cebuano texts later as reviewed versions; the language used is always recorded.
6. Health history on page 1: the whole health step (default).
7. **Production before the new notice:** consents-only intakes for patients on file on clinic devices (default); new patients are typed at the desk first.
8. Sedation: not included. 9. Estimate required as a range or "told before starting"; the PDA's 30-day denture line left out unless the lawyer wants it.
10. How long a signed procedure consent covers treatment: 180 days (dentures, braces 365, whitening 90), shown on the record, asks first after.
11. **Witness:** only a staff member who saw it and confirms under their own sign-in; otherwise the facts only.
12. Unlocking: a full sign-in (default); a PIN would need new machinery.
13. **Authority** (the lawyer confirms): the Art. 216 order and grounds, "parent" under Arts. 176 and 213, written authorisation by a parent, the representative of an adult, the capacity note's 30 days.
14. **Times:** 15 minutes to scan, 20 idle, drafts 24 hours, sent-not-added 30 days unless held; the new notice must say all of them.
15. **The patient's copy:** printed at the desk with its seals; signed forms on `/me/` later?
16. **The general consent's review:** list `treatment-2026-09` after the reading, or now knowingly (it is live on the 035 page either way).

## Build order
1. **Library and data:** `consent-library.ts`, `consent-seal.ts`, `consent:hash`, migration 039 with hashes; the engine split and `patient-add.ts`, proven by the unchanged fixtures; `refused.ts`; unit tests and DB grant checks. Nothing visible.
2. **Desk and clinic devices:** the chooser and `/new/type/?next=consents`; steps B–D; clinic tablets and `/f/t/`; `/auth/park/` and `/auth/unlock/`; the patient pages; Send; Add; Explain and confirm; confirmations; the Consent pane, document page, print and paper; gate the New menu.
3. **The phone path:** live QR, claim, birth-date check, the status poll, the Dashboard card, inbox counts (development only until the notice).
4. **Record integration:** Timeline, VisitPanels, visit strip, calendar flag, chips, ask-first, "Forms sent, not added", the chain head on Close the day; *Prepare consent forms for this visit* replaces the 035 entry points (the 035 page stays for old links).
5. **Reviews (owner):** a dentist and the lawyer read each form (fills `CONSENT_REVIEWED`; changed words as 040+); a new privacy notice naming page 1's categories, the 24-hour and 30-day deletions, the held rule and signed forms fills `FORMS_PRIVACY_VERSIONS`. Then CLAUDE.md: "Add patient, step by step (039)" and the Layout lines.

---

## Review notes
Clinic-legal review:
1. Procedure consent signed before any explanation (blocker): **accepted**. Attestation first (§0.4, §1.10, §4.5); a booking never pre-ticks; Q2 changed.
2. Page 1 in production (blocker): **accepted**. One gate on every device (§5.5, Q7).
3. Privacy tick records no signer: **accepted**. *Who is agreeing*, required by the `intake` channel check (§2.2, §4.2).
4. Free-text substitute authority: **accepted**. Arts. 214/216 grounds and order, 21+, a parent's letter, clinic device, staff confirmation (§2.3); Family Code text checked.
5. Cannot write vs cannot decide: **accepted**. Mark with a witness; court guardian for adults; representative only after a capacity note.
6. Photos cannot be refused: **accepted**. *No, thank you*, unsigned, no alert (§2.3).
7. Treatment after a refusal: **accepted**. Asks first with a stored reason, not a block (§7).
8. Link-maker named as witness: **accepted**. Facts only; a witness confirms under their own sign-in (§3.6).
9. Seals checkable only inside the database: **accepted**. Per-clinic chain, short seals on the patient's copy and on the Close the day printout (sending it to the owner waits for email, 023) (§4.6).
10. Language and who read it: **accepted**. On every page and in the attestation; Civil Code Art. 1332 checked.
11. Minors known only from the typed date: **accepted**. The desk's two questions, the age check, whitening cancelled, not `invalid`.
12. Signed forms purged for a treated walk-in: **accepted**. Held intakes, chair prompts (§4.8, §1.9).
13. General consent exempt from review: **accepted**. No exemption; the owner's decision goes in CLAUDE.md (§3.8, Q16).
14. Desk slowed and parked: **accepted**. Hand over after step 1; clinic tablets with no staff session (§1.7).
15. Clinical fields typed by the secretary: **accepted**. Desk and dentist fields, confirmed by the dentist's attestation; `can.ts` gives secretary and assistant `records.edit` (verified).
16. Paper without a scan: **accepted**. The scan is required (§4.2).
17. Free-text patient name: **accepted**. The server's name, read-only.
18. "Read for …": **accepted**. "Open … before deciding".
19. A stranger scans a patient on file's code: **accepted**. Birth date first, three misses lock (§2.1).

Data-security review:
1. Page 1 gate (blocker): **accepted**, as legal 2.
2. Park cookie hides a live 14-day session (blocker): **accepted**. Hand-over clears the session; `fl_park` is a hint (§1.7); `SESSION_HOURS` verified.
3. Service-worker copy and open tabs: **accepted**. `/auth/park/` is a session POST for `sw.js`; BroadcastChannel lock.
4. Definers never lock: **partly rejected**. The draft's `intake_gate` (outside the reviewed excerpt) locked link and intake `for update`, so Sends serialise; its link-then-intake order could deadlock with the desk, so it is now intake first (§4.4), with the `status = 'out'` guard and a unique `(intake_id, document_id)` added.
5. Dead end when words change: **accepted**. Nothing wiped; the desk renews (§5.2).
6. Purge and foreign keys: **partly rejected**. The draft already declared cascade and set-null keys; accepted the explicit order and the isolated block; the return type stays `integer`.
7. Refused or withdrawn forms cannot be re-signed: **accepted** (`startIntake`).
8. A patient on file's details on any phone: **accepted**, as legal 19.
9. Unlock by email only: **accepted**. `authenticateAt` at the clinic's door (verified `authenticate` is email-only).
10. `consent_document` guard: **partly rejected**. The draft's trigger already froze clinic, version, patient-once, fields and signed moves; added `appointment_id`, `plan_item_id`, `sort` and the §9 checks.
11. Refused thrown or returned: **accepted**. `refused.ts`, always thrown (four local copies verified).
12. Duplicated add logic: **accepted**. `patient-add.ts` (the helpers are private today, verified).
13. Token in error logs: **accepted**. Redacted, `/f/` headers in the middleware (`middleware.ts` verified).
14. Hand-over across transactions: **accepted**. Clinic-device links are inserted claimed.
15. `intake:ip` across clinics: **accepted**. Per clinic, pings excluded.
16. Photos refusal: **accepted**, as legal 6.
17. "End of profile creation": **accepted** as open question 1, with honest words to the patient.
18. `opened_at` not reset: **accepted**.
19. One rule for "consent signed": **accepted**. `visit_treatment_consented()` (`cal/data.ts` verified).
20. One-teal count missed `/f/`: **accepted**. Every teal class counted (`/f/[key]` uses `btn-primary`, verified).
