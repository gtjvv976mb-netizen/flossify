# PTR number and year: a spec for migration 041

*Proposal p15, revised after review. Written against `18a4017` on `claude/funny-ritchie-ujucx6`: 036–038 are applied, and the Treatment record has replaced the Timeline. Migration number 041, as reserved. Line numbers below are at that commit.*

## 0. What this fixes, and the decisions taken

`staff.ptr_number` has been in the schema from the start (`schema.sql:70`), but nothing writes to it. No form, the seed, signup or the admin script sets it. So every prescription (`rx/[rx].astro:145`) and every letter (`letters/[letter].astro:195`) prints `PTR No. __________`.

The record's help lines also claim something false: "ready to print with the dentist's PRC licence and PTR numbers". This appears at `Prescriptions.astro:43` and `:81`, and in the record's quick menu at `[patient].astro:667` ("Ready to print, with PRC and PTR").

Decisions:

- **The migration is `041_ptr.sql`.** 036–038 are applied, 039 and 040 are reserved, and `schema.sql` is not edited.
- **The PTR is copied onto the paper when it is saved.**
  - `prescription` and `clinical_letter` are insert-only (033, 034). Each gets `ptr_number` and `ptr_year`, written once at insert.
  - The prints read the row's copy and **never** the live `staff` value. A 2026 paper reprinted in 2027 still shows the 2026 PTR.
  - Rows from before 041 have no copy and print the blank line, as today. No form ever wrote `staff.ptr_number`, so no output changes. Nothing is backfilled.
- **The PTR is written as the receipt prints it.**
  - Letters, digits, spaces, dots, slashes and dashes, with at least four digits. Manila's receipts read "MLA-…".
  - The value is trimmed, runs of spaces are collapsed and letters are upper-cased. Otherwise it is stored as typed.
  - There is no database format check, so a value that was on file already never blocks a save.
- **Where the year is compared:**
  - A print compares the copy's year with the paper's own issue day (`r.day` or `l.issued`), never with today.
  - The panels compare with today, because that is the day the paper will be issued.
- **Which years may be saved.** Last year and this year (Manila). Next year is offered only from 1 December, so a slip in September cannot put next year's PTR on this year's papers.
- **Amber only means "needs attention", and it never blocks.**
  - Amber: a missing PTR, a PTR with no year, last year's PTR from 1 February, or a PTR for a later year outside December.
  - Quiet ink-2 line: in January, last year's PTR (the renewal window runs to 31 January). In December, next year's PTR.
  - Saving a paper is never refused for any PTR state. The PRC rule for saving stays exactly as it is.
- **Two ways to write the PTR, and neither can silently undo the other.**
  - The person's page (Edit details) follows `people.manage` plus `mayManage`, as every field there does.
  - My page gets a PTR form with its own `action=ptr`. It is the one detail a person sets for themself, and it touches no sign-in path.
  - Both forms post the values they were drawn with (`ptr_seen`, `ptr_year_seen`). A form that did not touch the PTR leaves the row's current value alone.
  - A form that changes a PTR someone else changed after the form was drawn is refused, and the refusal says what is on file now.
- **My page's POST handler is split by `action`.** The password form already posts `action=password`. The handler takes `action === 'ptr'` for the PTR and sends everything else, unchanged, to the password branch.
- **The fix links open in a new tab.** A prescription or letter being typed is never thrown away to go and add a PTR. The note says the paper takes the PTR on file at the moment Save is pressed.
- **One teal button per screen.** My page's teal stays "Change password", and "Save my PTR" is `ws-btn-quiet`.
- **No statute is named in page copy.**
- **Out of scope:**
  - The PTR on Add member.
  - The PTR on the public dentist profile or the directory.
  - Any automated check of the number.
  - A copy of the PRC licence onto the paper. PRC stays live, as today.

---

## 1. What the clinic and the patient see

### 1.1 My page: `/c/<slug>/account/`

The pane `#prc` is renamed **"My PRC licence and PTR"**.

- **Who sees the PTR block:** anyone who signs papers, `signsPapers(me)`. That is a dentist or associate, or anyone with a PRC licence on file (an owner-dentist from /start/). A secretary, an assistant, or an owner with no PRC sees no PTR block.
- **Where it sits:** below the existing PRC state, as a sub-block with `id="ptr"` (the anchor the record links to). It holds:
  - **The state line**, in the pattern the PRC state uses:
    - the `ptrChip` chip;
    - `PTR no. {ptrLine}` when a number is on file;
    - the words from the table below, for every state except ok.
  - **The form `data-my-ptr-form`**, with `<Csrf />`, `action=ptr`, and hidden `ptr_seen` / `ptr_year_seen` holding the values the form is drawn with (`ptrDrawn`):
    - **PTR number** `name="ptr"`: `inputmode="text"`, `autocapitalize="characters"`, `spellcheck="false"`, `maxlength="24"`, `autocomplete="off"`, `tabular-nums`, placeholder `e.g. 8123456`.
    - **For the year** `name="ptr_year"`: a `<select>` built from `ptrYearOptions`.
      - It offers last year and this year, plus next year from 1 December (Manila).
      - A stored year outside that window is added as its own option, so it is never changed silently.
      - With nothing on file, this year is selected.
      - With a number on file but no year, a first option "Choose the year…" (value `''`) is drawn and selected, so saving it untouched stamps no year.
    - **The help line:** "As printed on your professional tax receipt, letters included. Renewed by 31 January; one PTR covers the whole country. It prints on the prescriptions and certificates you sign from now on. Leave the number empty to take it off."
    - **The button** Save my PTR (`ws-btn ws-btn-quiet`, check icon).
    - The two fields sit side by side from `sm` and stack at 390.
- **While the person must choose their own password** (`clinic.must_change`): the form is not drawn. Only the state line shows, with "Choose your own password first, then add your PTR."

**State words on My page** (`ptrState` for today; the words say "you"):

| State | Chip (tone) | Words |
|---|---|---|
| ok | "PTR for 2026" (accent, check) | none (the number line says it) |
| renewing (January, last year's PTR) | "PTR for 2025" (muted) | "Fine until 31 January. Add your 2026 number once you renew." |
| old (last year's from 1 Feb, or older) | "PTR for 2025" (warn, alert) | "PTRs are renewed by 31 January. Add your 2026 number: what you sign prints the one on file." |
| ahead (December, next year's) | "PTR for 2027" (muted) | "What you sign before 1 January prints it too." |
| early (a later year outside December, or two or more years ahead) | "PTR for 2027" (warn, alert) | "What you sign in 2026 should carry your 2026 PTR. Add your 2026 number." |
| noyear (number, no year: legacy only) | "PTR year missing" (warn) | "Choose the year it is for and save." |
| none | "No PTR on file" (warn) | "What you sign prints a blank PTR line until you add it." |

**After a save** a green Note shows in the block, and the page lands on `?done=…#ptr`:

- `done=ptr`: "Your PTR is saved. Prescriptions and certificates you sign from now on carry it; papers already written keep what they printed with."
- `done=ptr-off`: "Your PTR is taken off. What you sign prints a blank PTR line until you add one."
- `done=ptr-same`: "Nothing changed in your PTR."

**Refused.** A red Note shows in the block (`refused`, so the page scrolls to it) and nothing is saved.

Sentences:

- "Type the PTR number as it is on the receipt."
- "Choose the year the PTR is for."
- "A PTR saved today is for 2025 or 2026." From 1 December: "…for 2025, 2026 or 2027."
- "Your PTR was changed while this page was open: it is now 7654321 for 2026. Check it and save again." When nothing is on file: "…it is now empty…". With no year: "…it is now 7654321, with no year…".
- "Only a dentist who signs prescriptions keeps a PTR here." (a forged post from someone who does not sign papers)
- "Choose your own password first, then add your PTR." (while `must_change_password`)
- `CSRF_MESSAGE`

What the form draws after a refusal:

- The typed values and the posted seen values are drawn again.
- After a "changed while this page was open" refusal, the fields and the seen values show what is on file now. Saving again without touching them keeps it.

**Unchanged on My page:**

- The password form: its errors, throttle, auth events and redirect. A PTR error never shows in the password pane, and a password error never shows in the PTR block.
- The "My details" wording ("ask the owner or an admin…"), which still covers name, username, email and mobile.

### 1.2 A person's page: `/c/<slug>/settings/people/<id>/`

- **The pane `#prc`** is renamed **"PRC licence and PTR"**.
  - It is shown, as now, when `treats(t.role) || t.prc_licence`.
  - Under the licence line, when `signsPapers(t) || t.ptr_number`: the `ptrChip` chip and `PTR no. {ptrLine}` (no number line when there is none).
  - Help, when `mayEdit`: "Change the PTR in Edit details. Flossify does not check it: it prints as it is written."
  - Help, when the viewer is on their own page without `people.manage` and `signsPapers(t)`: "Add yours on My page", linked to `/c/<slug>/account/#ptr`.
- **Edit details** (side panel). Directly after the "Specialty" field comes one wrapper, `<div class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]" data-team-dentist hidden={!showPtr}>`. It holds:
  - **PTR number** `(optional)`, `name="ptr"`, with the same attributes as on My page.
  - **For the year** `name="ptr_year"`, a select built as on My page (including the "Choose the year…" option for a number with no year).
  - Hidden `ptr_seen` and `ptr_year_seen`: what the fields were drawn with.
  - `set-help sm:col-span-2`: "As printed on the receipt, letters included. Renewed by 31 January; one PTR covers the whole country."
  - `showPtr` is `roleLocked ? signsPapers(t) : v.treats`. RoleField's existing script shows and hides the wrapper with "Treats patients", as it does the PRC fields.
  - It is **not** `data-prc-required`: the PTR is never required. The Tailwind preflight's `[hidden] { display: none !important }` beats the wrapper's `grid`.
- **After saving:**
  - The page shows the existing "Saved <name>'s details." A PTR change alone adds no sentence and signs nobody out.
  - A form that did not touch the PTR keeps whatever is on file now, including a PTR the dentist saved on My page after the panel was drawn.
  - A refusal comes back in the panel with the sentences of §1.1. The conflict sentence names the person ("Dr. Hazel Tabanao's PTR was changed while this was open: it is now 8123456 for 2026. Check it and save again."), and the PTR fields then show what is on file now.

### 1.3 The patient record

**New prescription panel** (`#rec-rx-add`) and **letter panel** (`#rec-letter-add`):

- **Where the notes sit.** The notes follow the `</label>` that wraps the "Prescribed by" or "Signed by" select. They are never inside it: a label takes phrasing content only, and a tap on the note must not open the picker.
  - They sit in one `<div aria-live="polite">`.
  - There is one note per clinician **with a PRC licence on file**: `<div id="rx-ptr-<id>" data-rx-ptr-for="<id>">`, or `lt-ptr-<id>` / `data-lt-ptr-for` in the letter panel.
  - A clinician with no PRC gets no PTR note. Their option is already disabled and says "no PRC licence on file", so the PRC is the blocker.
  - Only the note for the selected person is shown. With scripts off, the server draws the preselected one.
  - The select's `aria-describedby` points at the visible note's id. It is removed when no note is visible, because a hidden element named in `aria-describedby` is still read.
- **Which notes show.** There is no note for `ok`.
  - An amber note (`Callout tone="warn" role="none"`, alert icon) for none, noyear, old and early.
  - A quiet line (`text-[13px] leading-snug text-ink-2`) for renewing and ahead.

**Note words** (`ptrWords`, with "you" when the person chosen is the viewer):

| State | Words |
|---|---|
| none | "Dr. Ramon Cariño has no PTR number on file. It prints with a blank PTR line to write in by hand." (self: "You have no PTR number on file. …") |
| noyear | "Dr. X's PTR on file has no year." (self: "Your PTR on file has no year.") |
| old | "Dr. X's PTR on file is for 2025. PTRs are renewed by 31 January: add the 2026 number, or write it in by hand." |
| early | "Dr. X's PTR on file is for 2027: papers signed in 2026 should carry the 2026 PTR. Add the 2026 number, or write it in by hand." |
| renewing | "Dr. X's PTR on file is for 2025, which is fine until 31 January. Add the 2026 number once it is renewed." |
| ahead | "Dr. X's PTR on file is for 2027. Papers signed before 1 January print it too." (self: "…Papers you sign before 1 January print it too.") |

**The fix part of a note** comes from `ptrFix[x.id]`, worked out on the server (§3.9):

- **Self:** the link "Add yours on My page" → `/c/<slug>/account/#ptr`.
- **Someone else, when the viewer may change their details** (`people.manage` **and** `mayManage(viewer, their role, false)`, the rule that draws Edit details on their page): the link "Add it on their page in Clinic settings" → `/c/<slug>/settings/people/<id>/#prc`.
- **Otherwise:** the plain words "They can add it on their My page." (An admin looking at the owner is one such case: the owner's page has no Edit details for them.)
- **Every fix link** opens in a new tab: `target="_blank" rel="noopener"`, an sr-only " (opens in a new tab)", and `inline-flex min-h-[44px] items-center`. The prescription being typed stays where it is.
- **Amber notes end with** "This prescription takes the PTR on file at the moment you press Save." ("This letter…" in the letter panel.) This is true: `rx-add` and `letter-add` read the signer's staff row inside the insert's transaction.

**Saved callouts.** The existing green "Prescription saved." or "<Letter kind> saved." stays.

- When the **row's copy**, compared with the paper's own day, is in state none, noyear, old or early, a second, amber callout follows. The paper's own day is the Manila day of `issued_at` for an Rx and `issuedOn` for a letter.
- Titles:
  - none: "Printed without a PTR number"
  - noyear: "Printed with a PTR that has no year"
  - old: "Printed with the 2025 PTR"
  - early: "Printed with the 2027 PTR"
- In every case the text is: "Write it in by hand before signing. Papers written after the PTR is added carry it; this one keeps what it was saved with." It is followed by the same fix part as the panel note, which also opens in a new tab.

**Help lines that now say only what is true:**

- Prescriptions lead: "Medicines prescribed to {firstName}, printed with the dentist's PRC licence and the PTR on file."
- Under the prescriber select (the span already inside the label): "The printout carries their PRC licence and the PTR on file when it is saved."
- The record's quick menu hint (`[patient].astro:667`): "With the PRC and PTR on file"
- Letters lead: "Printed on the clinic's paper with the dentist's PRC licence and the PTR on file. A letter is never changed once saved."
- The header comments of `Prescriptions.astro` and `Letters.astro` say the PTR is the copy taken when the paper is saved.

**Rx cards in the list.** After "· PRC 0051234" the card adds "· PTR 8123456 (2026)" when the row has a copy.

### 1.4 The papers

- **Rx print** (`rx/[rx].astro`) prints from the row's copy:
  - `PTR No. 8123456 (2026)` when the copy has a year;
  - `PTR No. MLA-8123456` when it has no year;
  - `PTR No. __________` only when the copy is empty.
- **Letter print** (`letters/[letter].astro`) does the same.
- **The bar at the top** (which does not print) gets one amber line, `data-px-ptr-note`, when the copy compared with the paper's own issue day is none, noyear, old or early:
  - none: "This prescription was saved without a PTR number. Write it in by hand before signing." ("This letter…" on letters.)
  - noyear: "The PTR on this prescription has no year. Write the year in by hand before signing."
  - old: "The PTR on this prescription is for 2025, but it was written in 2026: write the 2026 number in by hand if the dentist has renewed."
  - early: "The PTR on this prescription is for 2027, but it was written in 2026: write the 2026 number in by hand."
- **The patient** sees only the paper: a PTR number and its year where a pharmacist, school or employer looks for it.

---

## 2. Data: `src/data/migrations/041_ptr.sql`

```sql
-- 041 — the PTR (professional tax receipt) a dentist renews by 31 January, so a prescription and a
-- letter stop printing "PTR No. __________".
--
--   - staff.ptr_year: the year the PTR on file is for. staff.ptr_number has been in the schema from the
--     start, but no form wrote it; a person's page (Clinic settings → People) and My page now write the
--     number and its year together. staff is group data outside row-level security, as before.
--   - prescription.ptr_number / ptr_year and clinical_letter.ptr_number / ptr_year: a copy of the
--     signer's PTR, taken when the paper is saved. Both tables are written once (033 revokes update and
--     delete on prescription; 034 grants clinical_letter select and insert, and update on the reply
--     columns only), so the copy is never changed: a 2026 prescription reprinted in 2027 still carries
--     the 2026 PTR. The table-level insert grants cover the new columns; nothing is granted here.
--     A paper saved before 041 has no copy and prints the blank line, as it did; it never borrows
--     today's PTR.
--
-- Nothing is backfilled: no form ever wrote staff.ptr_number, so there is nothing true to copy. No
-- format check on any ptr_number: PTR numbers differ by city (Manila's carry "MLA-"), and a value typed
-- in by hand before 041 would then refuse every later update of that staff row (last_seen_at
-- included). The app checks the format of a new value; a value on file that nobody touches is kept.

alter table staff           add column if not exists ptr_year   smallint check (ptr_year between 2000 and 2100);
alter table prescription    add column if not exists ptr_number text;
alter table prescription    add column if not exists ptr_year   smallint check (ptr_year between 2000 and 2100);
alter table clinical_letter add column if not exists ptr_number text;
alter table clinical_letter add column if not exists ptr_year   smallint check (ptr_year between 2000 and 2100);
```

- No BEGIN or COMMIT (the runner wraps the file). Idempotent through `if not exists`.
- RLS is unchanged. `prescription` and `clinical_letter` keep their `tenant_isolation` policies; `staff` stays outside RLS.
- Grants are unchanged, and §6 checks them:
  - `flossify_app` has no UPDATE on `prescription` and no UPDATE on `clinical_letter.ptr_*`.
  - It has INSERT on both tables at table level.

---

## 3. Server changes

### 3.1 New: `src/lib/ptr.ts` (no Node or database imports; days are `YYYY-MM-DD` Manila)

```ts
// The PTR (professional tax receipt): a dentist's number for the year, renewed by 31 January, printed on
// prescriptions and letters. One place for reading a post, the state on a day, and the words.
export interface PtrValue { number: string | null; year: number | null }
export type PtrState = 'ok' | 'none' | 'noyear' | 'renewing' | 'old' | 'ahead' | 'early';
/** What a PTR form draws: the number and year in the fields, and the same values again as "seen" (hidden). */
export interface PtrDrawn { ptr: string; ptrYear: string; ptrSeen: string; ptrYearSeen: string }
/** Where a record's PTR note sends someone to fix it: their own My page, or the person's page in Clinic settings. */
export interface PtrFix { self: boolean; href: string }

export const yearOf = (day: string) => Number(day.slice(0, 4));

/** As the receipt prints it: trimmed, runs of spaces made one, upper case. Dashes, dots and slashes stay. */
export const normPtr = (s: string) => s.trim().replace(/\s+/g, ' ').toUpperCase();
/** Letters, digits, spaces, dots, slashes and dashes, 4–24 long, at least four digits ("MLA-1234567", "8123456"). */
export const PTR_RE = /^[A-Z0-9][A-Z0-9 .\/-]{3,23}$/;
export const ptrNumberOk = (n: string) => PTR_RE.test(n) && (n.match(/\d/g)?.length ?? 0) >= 4;

/** The years a PTR may be saved for on `today`: last year and this year, and next year from 1 December. */
export const ptrYears = (today: string) => {
  const y = yearOf(today);
  return today.slice(5, 7) === '12' ? [y - 1, y, y + 1] : [y - 1, y];
};
const yearsText = (ys: number[]) => `${ys.slice(0, -1).join(', ')} or ${ys[ys.length - 1]}`;
/** The year select's options: ptrYears plus any stored or typed year outside them (never changed silently). */
export const ptrYearOptions = (today: string, ...extra: (number | null)[]) =>
  [...new Set([...ptrYears(today), ...extra.filter((y): y is number => Number.isInteger(y))])].sort((a, b) => a - b);

/** What a form draws for a value on file. A number with no year leaves the year empty ("Choose the year…"),
 *  never filled in; nothing on file offers this year. */
export const ptrDrawn = (v: PtrValue, today: string): PtrDrawn => ({
  ptr: v.number ?? '', ptrYear: v.year ? String(v.year) : v.number ? '' : String(yearOf(today)),
  ptrSeen: v.number ?? '', ptrYearSeen: v.year ? String(v.year) : '',
});

const yearIn = (s: string): number | null => { const t = s.trim(); if (!t) return null; const n = Number(t); return Number.isInteger(n) ? n : NaN; };
const readPair = (n: FormDataEntryValue | null, y: FormDataEntryValue | null): PtrValue =>
  ({ number: normPtr(String(n ?? '')) || null, year: yearIn(String(y ?? '')) });
/** The same PTR: both empty (the year does not count then), or the same number and year. */
const same = (a: PtrValue, b: PtrValue) => (!a.number && !b.number) || (a.number === b.number && a.year === b.year);

export interface PtrRead {
  /** What the row holds after this post: the row's own value, untouched, unless `changed`. */
  value: PtrValue;
  /** What to draw again on a refusal. */
  typed: PtrDrawn;
  problem: string | null;
  /** The row changed after the form was drawn, and this post changes it again: what is on file now. Save nothing. */
  conflict: PtrValue | null;
  changed: boolean;
}

/**
 * The PTR fields of a post.
 * - No 'ptr' field: what is on file, unchanged.
 * - The posted value equals what is on file, or what the form was drawn with ('ptr_seen'): untouched. The row
 *   keeps its current value, whatever its format, including a change someone else made after the form was drawn.
 * - Otherwise, when the row still holds what the form was drawn with, the new value is checked and saved. An
 *   empty number takes the PTR off, and the year goes too.
 * - Otherwise both sides changed it: a conflict, nothing saved.
 */
export function readPtr(form: FormData, onFile: PtrValue, today: string): PtrRead {
  const drawn = ptrDrawn(onFile, today);
  const file: PtrValue = { number: onFile.number ? normPtr(onFile.number) || null : null, year: onFile.year };
  if (!form.has('ptr')) return { value: onFile, typed: drawn, problem: null, conflict: null, changed: false };
  const posted = readPair(form.get('ptr'), form.get('ptr_year'));
  const hasSeen = form.has('ptr_seen');
  const seen = hasSeen ? readPair(form.get('ptr_seen'), form.get('ptr_year_seen')) : file;
  const typed: PtrDrawn = {
    ptr: String(form.get('ptr') ?? '').trim(), ptrYear: String(form.get('ptr_year') ?? '').trim(),
    ptrSeen: hasSeen ? String(form.get('ptr_seen') ?? '') : drawn.ptrSeen,
    ptrYearSeen: hasSeen ? String(form.get('ptr_year_seen') ?? '') : drawn.ptrYearSeen,
  };
  const keep: PtrRead = { value: onFile, typed, problem: null, conflict: null, changed: false };
  if (same(posted, file) || same(posted, seen)) return keep;
  if (!same(seen, file)) return { ...keep, conflict: onFile };
  if (!posted.number) return { value: { number: null, year: null }, typed, problem: null, conflict: null, changed: true };
  const years = ptrYears(today);
  const problem = !ptrNumberOk(posted.number) ? 'Type the PTR number as it is on the receipt.'
    : posted.year === null || Number.isNaN(posted.year) ? 'Choose the year the PTR is for.'
    : !years.includes(posted.year) ? `A PTR saved today is for ${yearsText(years)}.`
    : null;
  return { value: posted, typed, problem, conflict: null, changed: true };
}

/** "7654321 for 2026", "7654321, with no year", "empty". */
const said = (v: PtrValue) => (v.number ? (v.year ? `${v.number} for ${v.year}` : `${v.number}, with no year`) : 'empty');
/** The refusal when both sides changed it. who: the person's name, or null for "Your". */
export const ptrConflictText = (who: string | null, now: PtrValue) => who
  ? `${who}’s PTR was changed while this was open: it is now ${said(now)}. Check it and save again.`
  : `Your PTR was changed while this page was open: it is now ${said(now)}. Check it and save again.`;

/** Where a PTR stands for a paper issued on `onDay`. January keeps last year's PTR good (the renewal window);
 *  December lets next year's through quietly (renewed early). */
export function ptrState(v: PtrValue, onDay: string): PtrState {
  if (!v.number) return 'none';
  if (!v.year) return 'noyear';
  const y = yearOf(onDay), m = onDay.slice(5, 7);
  if (v.year === y) return 'ok';
  if (v.year === y + 1 && m === '12') return 'ahead';
  if (v.year > y) return 'early';
  if (v.year === y - 1 && m === '01') return 'renewing';
  return 'old';
}
export const PTR_AMBER: readonly PtrState[] = ['none', 'noyear', 'old', 'early'];

/** "8123456 (2026)" as the paper prints it; "8123456" with no year; null with no number. */
export const ptrLine = (v: PtrValue) => (v.number ? (v.year ? `${v.number} (${v.year})` : v.number) : null);

/** The chip for My page and a person's page (table in §1.1). */
export function ptrChip(s: PtrState, v: PtrValue): { label: string; tone: 'accent' | 'muted' | 'warn' } { /* §1.1 */ }
/** My page's words under the chip, "you" (table in §1.1); null for ok. */
export function ptrMine(s: PtrState, v: PtrValue, today: string): string | null { /* §1.1 */ }
/** The note under a panel's signer select; null for ok. who.self → "You have…", "Your PTR…" (table in §1.3). */
export function ptrWords(s: PtrState, v: PtrValue, onDay: string, who: { self: boolean; name: string }):
  { tone: 'warn' | 'quiet'; text: string } | null { /* §1.3 */ }
/** The amber saved callout's title (§1.3); null outside PTR_AMBER. */
export function ptrSavedTitle(s: PtrState, v: PtrValue): string | null { /* §1.3 */ }
/** The print bar's line, amber states only; noun 'prescription' | 'letter' (§1.4). */
export function ptrPrintNote(s: PtrState, v: PtrValue, onDay: string, noun: 'prescription' | 'letter'): string | null { /* §1.4 */ }
```

The word tables in §1 are the exact strings for `ptrChip`, `ptrMine`, `ptrWords`, `ptrSavedTitle` and `ptrPrintNote`.

### 3.2 `src/pages/c/[clinic]/settings/_lib/common.ts`

Add:

```ts
/** Signs prescriptions and letters: a dentist or associate, or anyone with a PRC licence on file (an owner-dentist). */
export const signsPapers = (p: { role: string; prc_licence: string | null }) => clinician(p.role) || !!p.prc_licence;
```

### 3.3 `src/pages/c/[clinic]/settings/_lib/people.ts`

- **Types and query.** `Person` gains `ptr_number: string | null; ptr_year: number | null`, and the `PERSON` select gains `s.ptr_number, s.ptr_year`.
- **Edit values.** `EditValues` gains `ptr: string; ptrYear: string; ptrSeen: string; ptrYearSeen: string`.
- **Imports.**
  - `treats` from `./common`.
  - `readPtr`, `ptrDrawn`, `ptrConflictText` from `../../../../../lib/ptr`.
  - `manilaToday` from `../../../../../lib/health`.
- **`personAction`, `action === 'edit'`:**
  - After `edit` is built:

    ```ts
    const today = manilaToday();
    const ptrOnFile = { number: t.ptr_number, year: t.ptr_year };
    const ptrIn = readPtr(form, ptrOnFile, today);
    Object.assign(edit, ptrIn.typed);
    const ptrConflict = ptrIn.conflict ? ptrConflictText(self ? null : t.full_name, ptrIn.conflict) : null;
    ```

  - In the validation chain, directly after the two PRC checks:

    ```ts
    else if (treats(edit.role) && ptrConflict) error = ptrConflict;
    else if (treats(edit.role) && ptrIn.problem) error = ptrIn.problem;
    ```

  - After the chain: `if (error && error === ptrConflict) Object.assign(edit, ptrDrawn(ptrOnFile, today));`
    - Only when the conflict is the refusal shown do the PTR fields redraw with what is on file now.
    - After any other refusal they come back as typed, with the posted seen values, so the next save still sees the conflict.
  - After `next` is built:

    ```ts
    const ptr = treats(edit.role) ? ptrIn.value : { number: null, year: null };   // someone who no longer treats keeps no PTR, as with the PRC
    ```

  - `changed` gains `ptr: treats(edit.role) ? ptrIn.changed : (t.ptr_number !== null || t.ptr_year !== null)`. It is audited as `staff.ptr` through the existing loop inside `withClinic`.
  - `ptr` is **not** part of `signOut`, `prcReset`, `mismatchKept` or `prcNote`.
  - The `update staff` statement writes the PTR only when it changed:

    ```sql
    ptr_number = case when $17::boolean then $15::text else ptr_number end,
    ptr_year   = case when $17::boolean then $16::smallint else ptr_year end
    ```

    Its parameters gain `[…, ptr.number, ptr.year, changed.ptr]`. Everything else in the statement and its parameters is unchanged.
  - `done=same` still happens when nothing (now including the PTR) changed.
- **Header comment.**
  - "Editing a person: name, role, mobile, email, PRC licence, specialty and PTR…"
  - Add: "A PTR change bumps nothing and resets no check: it only prints on papers signed from then on. The dentist can set it on My page too, so the form posts what it was drawn with (ptr_seen): a save that did not touch the PTR keeps what is on file now, and one that changes a PTR changed elsewhere since is refused and says what it is now."
  - The audit list gains `staff.ptr`.
- **Permissions.** Unchanged: `people.manage` at the page, then `mayManage` and "an owner's row by an owner only" in `personAction`.

### 3.4 `src/pages/c/[clinic]/settings/people/[id].astro`

- `v`'s default gains `...ptrDrawn({ number: t.ptr_number, year: t.ptr_year }, manilaToday())`.
- `const showPtr = !!t && !!v && (roleLocked ? signsPapers(t) : v.treats);`
- The year select is `ptrYearOptions(today, t.ptr_year, Number(v.ptrYear) || null)`, with the "Choose the year…" option when `v.ptrYear === ''`.
- It renders §1.2. `ptrState({ number: t.ptr_number, year: t.ptr_year }, manilaToday())` feeds the chip.
- The POST branch is unchanged: non-managers are still redirected, and `csrfOk` comes first. `member()` already reads `t` afresh on every request, so `readPtr` compares with the row as it is at the post.

### 3.5 `src/pages/c/[clinic]/account/index.astro` (My page)

- **Header comment.** Keep "Details are read only here…" and add:

  > The PTR is the one exception: a person sets their own. It is no sign-in detail (nothing finds a person by it, no code goes to it), and it only prints on the prescriptions and letters they sign, copied onto each when saved (041). Saving it bumps no token_version, signs nobody out, needs no throttle, and is audited as staff.ptr. The form posts what it was drawn with, so a PTR the owner changed meanwhile is never silently put back.

- **Data.** `Me` gains `ptr_number, ptr_year`, and `readMe` selects them.
- **The POST handler, split by action:**

  ```ts
  let error = '', ptrError = '';
  let ptrForm: PtrDrawn | null = null;          // what the PTR form draws again after a refusal
  if (Astro.request.method === 'POST') {
    const form = await Astro.request.formData();
    if (String(form.get('action') ?? '') === 'ptr') {
      const today = manilaToday();
      const row = (await pool.query('select role, prc_licence, ptr_number, ptr_year, must_change_password from staff where id = $1 and disabled_at is null', [session.staffId])).rows[0];
      const onFile = { number: row?.ptr_number ?? null, year: row?.ptr_year ?? null };
      const r = readPtr(form, onFile, today);
      ptrForm = r.conflict ? ptrDrawn(r.conflict, today) : r.typed;
      if (!csrfOk(Astro.cookies, form)) ptrError = CSRF_MESSAGE;
      else if (!row || !signsPapers(row)) ptrError = 'Only a dentist who signs prescriptions keeps a PTR here.';
      else if (row.must_change_password) ptrError = 'Choose your own password first, then add your PTR.';
      else if (r.conflict) ptrError = ptrConflictText(null, r.conflict);
      else if (r.problem) ptrError = r.problem;
      else if (!r.changed) return Astro.redirect(`${here}?done=ptr-same#ptr`, 303);
      else {
        // Written only if the row still holds what was just read: a change in between is a conflict, not a lost write.
        const w = await pool.query(
          `update staff set ptr_number = $2, ptr_year = $3
            where id = $1 and disabled_at is null and ptr_number is not distinct from $4 and ptr_year is not distinct from $5`,
          [session.staffId, r.value.number, r.value.year, onFile.number, onFile.year]);
        if (!w.rowCount) {
          const now = (await pool.query('select ptr_number, ptr_year from staff where id = $1', [session.staffId])).rows[0];
          const v = { number: now?.ptr_number ?? null, year: now?.ptr_year ?? null };
          ptrForm = ptrDrawn(v, today);
          ptrError = ptrConflictText(null, v);
        } else {
          await withClinic(clinic.id, (tx) => tx.query(
            `insert into audit_log (clinic_id, staff_id, action, entity, entity_id) values ($1, $2, 'staff.ptr', 'staff', $2)`, [clinic.id, session.staffId]));
          return Astro.redirect(`${here}?done=${r.value.number ? 'ptr' : 'ptr-off'}#ptr`, 303);
        }
      }
    } else {
      /* the existing password branch, byte-for-byte from `const current = …` (its form posts action=password) */
    }
  }
  ```

- **Drawing.**
  - The PTR form draws `ptrForm ?? ptrDrawn({ number: me.ptr_number, year: me.ptr_year }, manilaToday())`.
  - The year select is `ptrYearOptions(today, me.ptr_year, Number(drawn.ptrYear) || null)`, with the "Choose the year…" option when `drawn.ptrYear === ''`.
- **Imports.**
  - `withClinic` from `lib/db`.
  - `readPtr`, `ptrDrawn`, `ptrConflictText`, `ptrState`, `ptrChip`, `ptrMine`, `ptrLine`, `ptrYearOptions` and `type PtrDrawn` from `lib/ptr`.
  - `manilaToday` from `lib/health`.
  - `signsPapers` from `../settings/_lib/common`.
- **`done`.** It becomes `const done = Astro.url.searchParams.get('done')`. The password Note checks `done === 'password'`; the PTR Note checks `ptr`, `ptr-off` or `ptr-same`.
- **Rate limit:** none added. It is a signed-in, CSRF-checked write to the person's own row, with no enumeration and no cost.
- **Permission key:** none. It is the person's own row, gated by `signsPapers` as the PRC pane already is. `can()` is not involved, because no role name decides it.

### 3.6 `src/lib/record.ts`

- **Types.**
  - `Rx` gains `ptrYear: number | null`, and `ptr` now means **the row's copy**.
  - `Clinician` gains `ptrYear: number | null; rank: number | null; isOwner: boolean`.
- **The rx query:**

  ```sql
  select r.id, r.appointment_id, r.issued_at, r.items, r.notes, r.prescriber_id, s.full_name, s.prc_licence, r.ptr_number, r.ptr_year
    from prescription r left join staff s on s.id = r.prescriber_id where r.patient_id = $1 order by r.issued_at desc limit 200
  ```

  `s.ptr_number` is removed. Map: `ptr: r.ptr_number, ptrYear: r.ptr_year`.
- **The clinicians query:**

  ```sql
  select s.id, s.full_name, s.prc_licence, s.ptr_number, s.ptr_year, cr.rank, cr.is_owner
    from staff s join staff_access a on a.staff_id = s.id and a.clinic_id = $1 left join clinic_role cr on cr.id = s.role_id
   where s.disabled_at is null and s.role in ('owner', 'dentist', 'associate') order by s.full_name
  ```

  - Map: `ptr: r.ptr_number, ptrYear: r.ptr_year, rank: r.rank ?? null, isOwner: !!r.is_owner`.
  - The join is `left` so that nobody drops out of the list: `staff.role_id` has no NOT NULL. A null rank gets no settings link.
- **Inside `recordAction`,** the `clinician()` helper selects `s.id, s.full_name, s.prc_licence, s.ptr_number, s.ptr_year`.
- **`rx-add` inserts the copy** in the same transaction as today:

  ```sql
  insert into prescription (clinic_id, patient_id, prescriber_id, items, notes, appointment_id, ptr_number, ptr_year)
  values ($1, $2, $3, $4::jsonb, $5, $6, $7, $8) returning id
  ```

  It passes `prescriber.ptr_number, prescriber.ptr_year`. The PRC refusal is unchanged, and no PTR state refuses.

### 3.7 `src/lib/record-extra.ts`

- `Letter` gains `ptr: string | null; ptrYear: number | null`.
- The map reads `r.ptr_number` and `r.ptr_year` from `l.*`. The select does **not** add `d.ptr_number`: node-pg keeps the last column of a name, so that would overwrite `l.ptr_number` in the row object.
- In `letter-add`, the signer select adds `s.ptr_number, s.ptr_year`. The insert adds the columns `ptr_number, ptr_year` as `$15, $16` with `d.ptr_number, d.ptr_year`.

### 3.8 Print pages

**`src/pages/c/[clinic]/patients/[patient]/rx/[rx].astro`:**

- The select replaces `s.ptr_number` with `r.ptr_number, r.ptr_year`.
- `const ptr = { number: r.ptr_number, year: r.ptr_year }; const note = ptrPrintNote(ptrState(ptr, r.day), ptr, r.day, 'prescription');`
- Footer: `<p>PTR No. {ptrLine(ptr) ?? '__________'}</p>`

**`src/pages/c/[clinic]/patients/[patient]/letters/[letter].astro`:**

- **Remove `d.ptr_number`** from the select, so `l.ptr_number` is the row's copy from `l.*`.
- The same `ptrLine`, and `ptrPrintNote(…, l.issued, 'letter')`.

**Both pages:**

- **Markup.** Inside `.px-bar`, after `.px-bar-row`:

  ```astro
  {note && <div class="px-note-row"><p class="px-note" data-px-ptr-note><svg…alert/><span>{note}</span></p></div>}
  ```

- **CSS**, in the page's own `<style>`:
  - Tokens on `.px-body`:
    - light: `--px-warn-bg: #fff5e6; --px-warn-hair: #f3d9ad; --px-warn-ink: #8a4604`;
    - dark: `#3b2f1a / #5a4520 / #f3c47a`.
    - They go in **both** existing dark twins: the `@media screen and (prefers-color-scheme: dark) :root:not([data-theme="light"]) .px-body` block and the `@media screen { :root[data-theme="dark"] .px-body }` block.
  - `.px-note-row { max-width: 1280px; margin-inline: auto; padding: 0 1.25rem .75rem }`: the bar row's own box, so the note lines up with the back link and Print at every width (390, 768, 1024, 1440).
  - `.px-note { display: flex; gap: .5rem; align-items: flex-start; padding: .625rem .875rem; border: 1px solid var(--px-warn-hair); border-radius: 10px; background: var(--px-warn-bg); color: var(--px-ink); font-size: 14.5px; line-height: 1.45 }`, with the svg in `var(--px-warn-ink)`.
  - The bar is `print:hidden`, so the note never prints.
- **Header comments.** Each says "PTR from the copy on the row (041)".

### 3.9 `src/pages/c/[clinic]/patients/[patient].astro`

- Import `mayManage` from `lib/roles` and `type PtrFix` from `lib/ptr`.
- Build where each clinician's PTR is fixed, on the server:

  ```ts
  const ptrFix: Record<string, PtrFix | null> = Object.fromEntries(clin.clinicians.map((x) => [x.id,
    x.id === session.staffId ? { self: true, href: `/c/${clinic.slug}/account/#ptr` }
    : can(ws, 'people.manage') && x.rank !== null && mayManage(clinic, { role_rank: x.rank, role_owner: x.isOwner }, false)
      ? { self: false, href: `/c/${clinic.slug}/settings/people/${x.id}/#prc` }
      : null]));
  ```

- Pass `today` (which `<Prescriptions>` does not take yet) and `ptrFix` to `<Prescriptions>`, and `ptrFix` to `<Letters>`.
- Change the quick-menu hint text as in §1.3.

### 3.10 `scripts/db/seed.ts` (dev only; it already refuses production)

- In the dentist loop, the staff insert adds `ptr_number, ptr_year` as `$16, $17`:
  - `isOwner ? String(8100000 + staffIds.size + 1) : null`
  - `isOwner ? Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric' }).format(new Date())) : null`
- Owners print a real PTR in dev. The other dentists (Hazel Tabanao and Ramon Cariño at session-road) have none, so the empty path is always visible.

### 3.11 `CLAUDE.md`

Add a short "PTR (041)" paragraph under "The record's paperwork (034)":

- The copy is on the row and is never live.
- The year is compared with the paper's issue day.
- January and December are quiet, and nothing blocks.
- The number is taken as the receipt prints it.
- My page is the one self-service write, audited `staff.ptr`.
- Both writers post what they were drawn with (`ptr_seen`), so neither silently undoes the other.
- The fix links open in a new tab.
- The code is `src/lib/ptr.ts`.

Add `src/lib/ptr.ts` and `041` to the Layout list.

---

## 4. Client changes

**`src/pages/c/[clinic]/patients/_record/Prescriptions.astro`**

- **Props** gain `today: string; ptrFix: Record<string, PtrFix | null>`.
- **The select** gets `data-rx-prescriber`, and, when the preselected clinician has a note, `aria-describedby="rx-ptr-<id>"`.
- **After `</label>`:** `<div aria-live="polite">`, then one `<div id={`rx-ptr-${x.id}`} data-rx-ptr-for={x.id} hidden={x.id !== selectedId}>`.
  - There is one such div per clinician with `x.prc` whose `ptrWords(ptrState({ number: x.ptr, year: x.ptrYear }, today), …)` is not null.
  - It holds the words, the fix part from `ptrFix[x.id]` (new tab), and for amber, the "takes the PTR on file" sentence.
  - `selectedId` is `v?.prescriber ?? (meRx ? meId : '')`, the expression the select already uses.
- **The saved callout.**
  - `const savedRx = justSaved ? c.rx.find((r) => r.id === justSaved) : null;`
  - Add the amber callout of §1.3 when `PTR_AMBER.includes(ptrState({ number: savedRx.ptr, year: savedRx.ptrYear }, manilaToday(new Date(savedRx.at))))`.
- **Rx cards.** `nt-who` gains the PTR line.
- **Help lines and the header comment** change as in §1.3.
- **The script** adds:

  ```ts
  const rxSel = document.querySelector<HTMLSelectElement>('[data-rx-prescriber]');
  const rxNotes = document.querySelectorAll<HTMLElement>('[data-rx-ptr-for]');
  const rxSync = () => {
    let shown: HTMLElement | null = null;
    rxNotes.forEach((n) => { n.hidden = n.dataset.rxPtrFor !== rxSel?.value; if (!n.hidden) shown = n; });
    if (shown) rxSel?.setAttribute('aria-describedby', (shown as HTMLElement).id); else rxSel?.removeAttribute('aria-describedby');
  };
  rxSel?.addEventListener('change', rxSync); rxSync();
  ```

**`src/pages/c/[clinic]/patients/_record/Letters.astro`**

- The same pattern with `data-lt-signer`, `id="lt-ptr-<id>"` and `data-lt-ptr-for` (`dataset.ltPtrFor`), plus the prop `ptrFix`. It already takes `today`.
- `selectedId = v.dentist ?? (meSigns ? meId : '')`.
- The notes go after the select's `</label>`.
- The saved amber callout reads `made.ptr`, `made.ptrYear` and `made.issuedOn`.
- The sync runs in its own few lines. It does not hook `ws:panel-open`: the signer does not change with the letter kind.

**Hook names.**

- `data-rx-ptr-for`, `data-rx-prescriber`, `data-lt-ptr-for`, `data-lt-signer`, `data-my-ptr-form`, `data-px-ptr-note` and the ids `rx-ptr-*` and `lt-ptr-*` are all unused today. A grep found only `data-rx-form|line|more` and `data-person-page`.
- The Rx and letter panels live on the same page, hence the distinct `rx`/`lt` prefixes.
- `[data-rx-line]` selectors do not match `data-rx-ptr-for`, which is a different attribute name.
- `data-team-dentist` is **deliberately** reused on the PTR wrapper, so RoleField's existing sync hides it with "Treats patients". Hidden inputs still post their drawn values, `readPtr` treats them as untouched, and the server ignores them when the person no longer treats (§3.3).
- `data-my-ptr-form` is for measurement only; no page script queries it.

**My page and the person page.** No new script. The PTR block is plain forms. The existing refused-scroll (`[data-set-refused]`) and hash-scroll (`#ptr`, `#prc`) code already covers them, and the removal of the `done` param already runs.

---

## 5. What must not change

- **Password change on My page:** the same sentences, the `pwchange:s:<id>` throttle, the `password.*` auth events, `setPassword`, the `one_time_code` spend and the redirect. Any post whose `action` is not `ptr` is a password change, as its form's `action=password` already says.
- **A PTR write, on either page, never:**
  - bumps `token_version`;
  - touches `prc_status`, `prc_checked_on`, `prc_checked_by`, `prc_note`, `one_time_code` or `message_log`;
  - sets a session cookie;
  - signs anyone out.
- **A form that did not touch the PTR never writes it.** Edit details writes the PTR columns only when `changed.ptr`.
- **Person-page rules as they are:**
  - `people.manage` at the page, then `mayManage`.
  - An owner's row by an owner only; nobody changes their own role.
  - One email and one mobile per account.
  - A PRC reset on a number or name change.
  - `done=same`, and every existing audit line.
- **`prescription` and `clinical_letter` stay insert-only.** No grant is added, the copies are never updated by the app, and papers from before 041 print the blank line, not today's PTR.
- **PRC stays read live** from `staff` on the prints and in the panels. Saving a prescription or letter still requires a PRC licence and nothing else. No PTR state refuses or disables anything, including the select options (`disabled={!x.prc}` stays as it is).
- **One teal button per screen:**
  - My page: "Change password".
  - Person page: "Edit details" (and "Save changes" in its panel).
  - Rx panel: "Save prescription".
  - Letter panel: "Save and print".
  - Print bar: "Print".
- **No public read changes:** no definer function changes; the dentist profile, `/find/` and the directory show no PTR.
- **Nothing else changes:**
  - The Treatment record and its paper, VisitPanels, the This visit strip (`?open=rx` still opens the panel) and offline charting.
  - No texts are sent.
  - No motion is added or gated.
  - The workspace's computed styles are untouched outside the new elements.

---

## 6. Verification plan

**Setup**

- `npm run db:setup`: a destructive dev rebuild with the new seed. On an existing dev database, `npm run db:migrate` then re-seed.
- `npm run build`, then `npm run preview -- --port 4431`. Use a new port; never `pkill`.
- Scripts go in the session scratchpad: `ptr-check.mjs` (Playwright, `executablePath: '/opt/pw-browsers/chromium'`) and `ptr-unit.mts` (tsx).
- Logins (password `flossify`), clinic `session-road`:
  - owner Liwayway Domingo, `liwayway.domingo@example.com`, whose seed PTR is for this year;
  - dentist Hazel Tabanao, `hazel.tabanao@example.com`, with no PTR;
  - Ramon Cariño, a dentist at session-road with no PTR.

### 6.1 SQL (as the admin role unless noted)

1. `select column_name, data_type from information_schema.columns where column_name in ('ptr_number','ptr_year') and table_name in ('staff','prescription','clinical_letter')` returns 6 rows. `ptr_year` is `smallint` everywhere.
2. `select conname from pg_constraint where conname in ('staff_ptr_year_check','prescription_ptr_year_check','clinical_letter_ptr_year_check')` returns 3 rows.
3. Grants:
   - `has_table_privilege('flossify_app','prescription','UPDATE')` is **false**.
   - `has_column_privilege('flossify_app','clinical_letter','ptr_number','UPDATE')` is **false**.
   - `has_column_privilege('flossify_app','clinical_letter','ptr_number','INSERT')` is **true**.
   - `has_table_privilege('flossify_app','prescription','INSERT')` is **true**.
4. As `flossify_app`, inside `set app.clinic_id`:
   - `update prescription set ptr_number = '1'` fails with *permission denied*.
   - `update staff set ptr_year = 1999 where …` fails with a *check violation*.
5. Running `npm run db:migrate` a second time applies nothing. `schema_migrations` has `041_ptr.sql` once.

### 6.2 Date and format logic (`npx tsx ptr-unit.mts`, importing `src/lib/ptr.ts`)

**`ptrState`:**

| Value | Day | Result |
|---|---|---|
| `8123456` / 2025 | 2026-01-15 | `renewing` |
| `8123456` / 2025 | 2026-01-31 | `renewing` |
| `8123456` / 2025 | 2026-02-01 | `old` |
| `8123456` / 2024 | 2026-01-10 | `old` |
| `8123456` / 2026 | 2026-12-31 | `ok` |
| `8123456` / 2027 | 2026-12-01 | `ahead` |
| `8123456` / 2027 | 2026-11-30 | `early` |
| `8123456` / 2028 | 2026-12-15 | `early` |
| no number, no year | any | `none` |
| `8123456`, no year | any | `noyear` |

**`readPtr`** (on `2026-09-29`, nothing on file, form drawn empty, unless the case says otherwise). Each case builds a `FormData` with `ptr`, `ptr_year`, `ptr_seen` and `ptr_year_seen`.

| Case | Result |
|---|---|
| `' mla-8123456 '` + `2026` | value `MLA-8123456`/2026, changed, no problem |
| `'mla   1234567'` + `2026` | `MLA 1234567` |
| `'8123456'` + `2026` | `8123456` |
| `'12a'` + `2026` | "Type the PTR number as it is on the receipt." |
| `'ABCD-12'` + `2026` | the same sentence (two digits) |
| `2027` on 2026-09-29 | "A PTR saved today is for 2025 or 2026." |
| `2027` on 2026-12-01 | accepted |
| a number with `ptr_year=''` | "Choose the year the PTR is for." (not the years sentence) |
| `ptr_year='abc'` | "Choose the year the PTR is for." |
| legacy 2023 on file, posted as drawn | `changed: false`, no problem |
| number with no year on file, posted as drawn (year `''`) | `changed: false`, the year stays null |
| a non-conforming legacy `'PTR#12'` on file, posted as drawn | `changed: false`, no problem |
| legacy `'PTR#12'` with a year newly chosen | "Type the PTR number as it is on the receipt." |
| an empty number, form drawn with the value on file | `{null,null}`, changed |
| no `ptr` field | the on-file value, unchanged |
| **stale form:** on file `7654321`/2026, drawn empty, posted `''`/`2026` | value `7654321`/2026, `changed: false`, no conflict |
| **conflict:** on file `7654321`/2026, drawn empty, posted `1111111`/2026 | `conflict` = `7654321`/2026, `changed: false` |
| **same value from both sides:** on file `7654321`/2026, drawn empty, posted `7654321`/2026 | unchanged, no conflict |

**Other helpers:**

- `ptrLine({'8123456',2026})` is `8123456 (2026)`, and `ptrLine({null,null})` is `null`.
- `ptrYearOptions('2026-09-29', 2023)` is `[2023, 2025, 2026]`, and `ptrYearOptions('2026-12-02', null)` is `[2025, 2026, 2027]`.
- `ptrDrawn({'8123456', null}, '2026-09-29').ptrYear` is `''`, and `ptrDrawn({null, null}, …).ptrYear` is `'2026'`.

### 6.3 Playwright flows (1440 × 900 unless noted)

**A. Hazel's My page, first look.** Sign in, then go to `/c/session-road/account/`.

- `#prc` heading "My PRC licence and PTR".
- `[data-my-ptr-form]` is present, and the chip reads "No PTR on file".
- The year select's options are `2025, 2026` (September), with 2026 selected.
- The number input has `inputmode="text"` and `autocapitalize="characters"`.
- `document.querySelectorAll('.ws-btn-primary').length === 1` ("Change password").

**B. Hazel saves a PTR.**

- Fill `mla-8123456`, choose 2026, and click Save my PTR.
- The URL ends `?done=ptr#ptr`, a Note shows "Your PTR is saved…", and the chip reads "PTR for 2026".
- SQL:
  - `ptr_number = 'MLA-8123456'`, `ptr_year = 2026`;
  - `token_version` and `prc_status` unchanged;
  - one `audit_log` row `staff.ptr` with `entity_id` = Hazel;
  - no new `auth_event`.
- A second, already signed-in context for Hazel still loads `/c/session-road/` with 200.
- Save `8123456` / 2026 next (the later flows use it).

**C. Refusals on My page.** Nothing is saved in any of these.

- `12a` gives "Type the PTR number as it is on the receipt." in the PTR block. The typed `12a` is shown again, and the password pane shows no error.
- A forged `ptr_year=2030` is refused with the years sentence.
- A forged empty `ptr_year` with a number gives "Choose the year the PTR is for."
- A post with a wrong `_csrf` shows `CSRF_MESSAGE` in the PTR block.
- The password form (it posts `action=password`) still changes the password with its usual Note, and a wrong current password shows only in the password pane.

**D. Taking it off.**

- An empty number lands on `done=ptr-off`. SQL: both columns null, and one more `staff.ptr` audit row.
- Save `8123456` / 2026 again.

**E. A person who must change their password.**

- Liwayway opens Hazel's page and uses Set a new password.
- Hazel's open context: its next request is cleared by `requireWorkspace` (the token version moved) and lands on sign-in.
- Sign Hazel in at `/session-road/sign-in/` with the owner-set password. She lands on `/c/session-road/account/?first=1#password`.
- `[data-my-ptr-form]` is absent, and the state line says "Choose your own password first, then add your PTR."
- A forged `action=ptr` post gives the same sentence, and SQL shows no change.
- Hazel chooses her own password. The form appears.

**F. Someone who does not sign papers.**

- Liwayway uses Add member to create "Test Assistant", role Dental assistant, with a password.
- Sign them in at `/session-road/sign-in/` and choose their own password on My page.
- Their My page then has no `[data-my-ptr-form]` and no `#prc` pane.
- A forged `action=ptr` post gives "Only a dentist who signs prescriptions keeps a PTR here." SQL shows no change.

**G. The owner edits Hazel's page.**

- Liwayway opens Edit details on Hazel's page. The PTR fields are visible under Specialty and show `8123456` / 2026.
- Save `7654321` / 2026:
  - `done=edit`, SQL shows the new values, and there is one `staff.ptr` audit row;
  - Hazel's context is still signed in;
  - `prc_status` and `prc_checked_on` are unchanged.
- Change only Hazel's mobile and save. SQL: the PTR is unchanged, and there is no new `staff.ptr` row.
- Untick "Treats patients": the PTR wrapper becomes `hidden` (read the property).
- As Hazel, a forged `action=edit` post to Liwayway's page gets a 303 back to the page, and SQL shows no change.

**G2. A stale Edit details form keeps the PTR saved meanwhile.**

- SQL-clear Hazel's PTR.
- Context A (Liwayway) opens Hazel's page and Edit details: the PTR is empty.
- Context B (Hazel) saves `8123456` / 2026 on My page.
- Context A changes Hazel's mobile and saves. The result is "Saved…", and SQL shows `8123456` / 2026 kept, with no `staff.ptr` row from A.
- Context A reloads the page, then context B saves `8123456` / 2025.
- Context A types `5555555` / 2026 in the drawn form and saves:
  - the panel refuses with "Dr. Hazel Tabanao's PTR was changed while this was open: it is now 8123456 for 2025. Check it and save again.";
  - the fields show `8123456` / 2025;
  - SQL is unchanged.
- **The reverse on My page:** context B's My page is open; A saves `7654321` / 2026 on Hazel's page.
  - B presses Save my PTR untouched: `done=ptr-same`, and SQL keeps `7654321`.
  - B types `1111111` on the stale page: refused with "Your PTR was changed while this page was open: it is now 7654321 for 2026…".

**H. Prescriptions.** Liwayway opens the first patient at `/c/session-road/patients/` and clicks New prescription.

- With the prescriber preselected as Liwayway (PTR for this year), no `[data-rx-ptr-for]` is visible, and the select has no `aria-describedby`.
- Select Ramon:
  - the visible `#rx-ptr-<ramon>` reads "Dr. Ramon Cariño has no PTR number on file…";
  - it has the link "Add it on their page in Clinic settings" (`target="_blank"`, href ending `/settings/people/<ramon>/#prc`) and "This prescription takes the PTR on file at the moment you press Save.";
  - the select's `aria-describedby` is `rx-ptr-<ramon>`;
  - the note is not inside a `label` (`note.closest('label') === null`);
  - the Save button is enabled.
- Type Amoxicillin in Medicine 1 and click the link. A new page opens, and the first page's Medicine 1 still reads Amoxicillin with the panel open.
- Save one line (Amoxicillin / 1 capsule every 8 hours for 7 days):
  - the page shows the green "Prescription saved." and the amber "Printed without a PTR number", whose link has `target="_blank"`;
  - the print page shows `PTR No. __________` and a visible `[data-px-ptr-note]`;
  - `page.emulateMedia({ media: 'print' })` makes that note invisible.
- Save another as Liwayway:
  - the print shows `PTR No. 81xxxxx (2026)` and no note;
  - SQL: `prescription.ptr_number`/`ptr_year` equal Liwayway's staff values.

**I. The copy stays true.**

- Liwayway sets her PTR to `9999999` / 2026 on My page.
- Reprint the Liwayway prescription from H. It still shows the old number. SQL: that row is unchanged.
- On the record, that prescription's card still reads "· PTR 81xxxxx (2026)", not 9999999.
- SQL-set Liwayway's `ptr_year = 2027` (September). The Rx panel shows the amber "early" note for her. The print of H's prescription still has no note.

**J. Letters.**

- A Dental certificate signed by Hazel (`7654321` / 2026 after G2's reverse) prints `PTR No. 7654321 (2026)`.
- Change Hazel's PTR, then check that the letter keeps its copy:
  - Reprint it: the print is unchanged, which proves `d.ptr_number` is gone from the letter print's select.
  - Reload the record with `?saved=letter:<id>`: its callout state follows the copy (no amber callout).
  - This proves `loadExtra` reads `l.*`.
- A certificate signed by Ramon gives the amber saved callout and the blank line.

**K. Old year.**

- SQL-set Hazel's `ptr_year = 2025` (today is September 2026).
- In the Rx panel, selecting Hazel gives the amber "…is for 2025. PTRs are renewed by 31 January…".
- The January and December quiet cases are covered by the unit script (6.2). The server's date is not faked.

**L. Who gets a settings link.**

- Liwayway adds "Test Admin" (role Admin, a password), who signs in and chooses their own password.
- SQL-clear Liwayway's PTR. As the admin, open New prescription:
  - selecting Liwayway (the owner) gives the note with the plain words "They can add it on their My page." and no link;
  - selecting Ramon gives the "Add it on their page in Clinic settings" link, and that page shows Edit details to the admin.
- Restore Liwayway's PTR.

**M. An owner with no PRC.**

- SQL-set Liwayway's `prc_licence = null`. As Liwayway, open New prescription:
  - her option is preselected and disabled, and says "no PRC licence on file";
  - no `[data-rx-ptr-for]` is visible;
  - her My page has no `[data-my-ptr-form]`.
- Restore the PRC.

**N. Legacy values.**

- SQL-set Hazel's `ptr_number = 'PTR#12', ptr_year = null`.
- Her page shows "PTR year missing". Edit details draws "Choose the year…" selected.
- Saving only a mobile change as Liwayway succeeds. SQL keeps `'PTR#12'` and null.
- Choosing 2026 without fixing the number is refused with "Type the PTR number as it is on the receipt."

### 6.4 Measurements

Pages measured:

- My page with a PTR, without one, refused, and after the conflict refusal;
- Hazel's person page, with the Edit details panel open;
- the record with the Rx panel open and the amber note showing;
- the letter panel with the amber note showing;
- the record after a save, with both callouts;
- the Rx and letter prints with `[data-px-ptr-note]`, at 390, **768, 1024** and 1440.

Each is measured in light and dark at 1440 and 390 (and the print widths above). The theme is chosen through `localStorage.theme` **and** through the emulated device `colorScheme`; the two must give equal computed colours. That is the dark-twins test.

- **Contrast:** every text line's computed colour against the composited pixels behind it is ≥ 4.5:1. No muted slate on the amber tint: callout words are `--c-ink`, quiet lines `text-ink-2`.
- **Targets:** every link, button, input and select that can be tapped has `getBoundingClientRect()` ≥ 44 × 44. That includes the fix links inside notes and callouts. Fields render at font-size ≥ 16px.
- **Width:** `document.documentElement.scrollWidth <= innerWidth` at 390 on every page above.
- **Print bar alignment:** the note's left edge equals the back link's box left edge (± 1px), and its right edge equals the Print button's right edge, at 768, 1024 and 1440.
- **Keyboard order:**
  - My page: PTR number → year → Save my PTR.
  - Rx panel: the prescriber select, then its note's link, then Medicine 1.
- **Reduced motion:** no motion is added. A `reducedMotion: 'reduce'` run shows the same page.
- **Role snapshot:** re-run it the way CLAUDE.md's Roles section describes (7 roles × 20 workspace pages, fingerprinting tabs, headings, buttons, fields and links, with ids masked). The only allowed differences are:
  - My page for roles that sign papers (the PTR block);
  - person pages (the PTR row and the Edit details fields);
  - the record (the PTR notes, the new help wording, "· PTR …" on Rx cards).
  - Anything else is a regression.

---

## 7. Effort and risks

**Effort: S+, about a day and a quarter.**

| Piece | Time |
|---|---|
| Migration | 0.5 h |
| `ptr.ts` (reading, seen/conflict, states, words) and its unit script | 2 h |
| `people.ts` and the person page | 2.5 h |
| My page split | 1.5 h |
| `record.ts`, `record-extra.ts`, `[patient].astro`, the two panels and the two prints | 2.5 h |
| Seed and CLAUDE.md | 0.5 h |
| Flows, measurements and the snapshot | 2.5 h |

**Risks**

- **Merge order.** The runner refuses a pending file that sorts before the newest applied one, and Render's `preDeployCommand` is a plain `npm run db:migrate`.
  - If 041 is deployed before 039 or 040, their later deploy fails. Merge 039 and 040 first.
  - If PTR must ship first, the owner applies the late files once by hand with `--allow-late`. Do not add that flag to the deploy command.
- **The `l.*` collision.** Any future join of `staff` into a `prescription` or `clinical_letter` select must not pull `ptr_number` or `ptr_year` from both tables: node-pg keeps the last column, and a live value would quietly replace the copy. §3.7 and §3.8 remove the two joins that exist today, and flows I and J prove it on the prints, the cards and the saved callout.
- **PTR format.** Letters, digits, spaces, dots, slashes and dashes, with at least four digits. If some city prints something else, widen `PTR_RE`: there is no database check to migrate.
- **A paper saved without a PTR stays that way.** That is the point of the copy, and it is why the panel note (the main defence) says the paper takes the PTR on file at Save and opens its fix link in a new tab.
  - After saving, the remedy is to write it in by hand, as the saved callout says.
  - A second prescription or letter cannot be deleted (insert-only), so writing one again leaves two on the record and the Treatment record.
- **The January and December rules are heuristics.** Last year's PTR is quiet until 31 January, and next year's is quiet only in December. This matches the owner's stated tolerance ("never a blocked step"). If a pharmacy in practice refuses January prescriptions carrying last year's PTR, change `ptrState` only.
- **Legacy values.** A `staff.ptr_number` typed in by SQL before 041 shows as "PTR year missing" (amber) until someone chooses a year. It is never touched by a save that does not change it, whatever its format.
- **Two writers for one row** (the owner on the person page, the dentist on My page).
  - A form that did not touch the PTR keeps the current value, and a change against a value changed elsewhere is refused and says what it is now.
  - My page's write is also conditional in SQL.
  - The person page's combined `update staff` is not. A save landing in the milliseconds between its read and its write is last-write-wins, and both are audited as `staff.ptr`.

---

## Review notes

The draft was written at `d07558b`. `18a4017` (the Treatment record) moved the quick-menu hint to `[patient].astro:667` and retired the Timeline; no PTR code changed. Each objection was checked against the code at `18a4017`. **All nine hold and are fixed; none is rejected.**

1. **Stale Edit details form wipes a PTR saved on My page (major): holds.**
   - Evidence:
     - The hidden wrapper still posts `ptr`, so `form.has('ptr')` is always true.
     - `[id].astro` re-reads `t` on every POST, and the draft `readPtr` returned `changed` for an empty post against a filled row.
     - The draft's `update staff` wrote `$15/$16` unconditionally.
   - Fixed:
     - Both forms post `ptr_seen`/`ptr_year_seen`. `readPtr` treats "equal to on file or to seen" as untouched and "seen ≠ on file" plus a new value as a conflict (§3.1).
     - The columns are written only when `changed.ptr` (§3.3). My page's write is conditional in SQL (§3.5).
     - Flow G2 covers both directions.
2. **The fix link throws away the prescription being typed (major): holds.**
   - Evidence: no `beforeunload` guard covers `#rec-rx-add` (the only ones are the health form, `new.astro`, `/f/`, settings and the Odontogram's queue), and prescriptions are insert-only (033).
   - Fixed:
     - Every fix link opens in a new tab, with the sr-only words.
     - Amber notes say the paper takes the PTR on file at Save. This is true: `clinician()` and the letter's signer are read inside the insert's transaction.
     - §7 no longer advises writing a second paper.
   - The `back`-parameter alternative was not taken: a new tab keeps the panel's state with no new redirect to validate.
3. **Digits-only refuses real receipts (major): holds.**
   - Evidence:
     - The source cited (filipiknow.net, "MLA -" on Manila receipts) was confirmed by a search.
     - §2 adds no database check, so strictness protected nothing.
   - Fixed: normalisation, `PTR_RE` and the four-digit rule, `inputmode="text"` with `autocapitalize="characters"`, the new refusal sentence, and new unit cases.
4. **Fix links to pages where the PTR cannot be added (minor): holds, both parts.**
   - (a) Evidence:
     - `meRx` preselects any clinician, including an owner with no PRC (`Prescriptions.astro:26`).
     - `signsPapers` is false for that owner, so My page draws no form.
   - (a) Fixed: no PTR note for a clinician without a PRC.
   - (b) Evidence: `mayEdit` needs `mayManage` (`[id].astro:79–80`), and `personAction` refuses an owner's row to a non-owner.
   - (b) Fixed:
     - The clinicians query adds `cr.rank, cr.is_owner` (a left join, since `staff.role_id` is nullable).
     - `ptrFix` gates the link on `people.manage` plus `mayManage`.
     - Flows L and M cover both.
5. **Legacy or yearless PTR stamped or refused on unrelated saves; the empty year gives the wrong sentence (minor): holds.**
   - Evidence:
     - The draft default filled this year for a number with no year.
     - The format check ran whether or not anything had changed.
     - `Number('')` is 0, and `Number.isInteger(0)` is true.
   - Fixed:
     - Untouched values return early whatever their format.
     - `''` parses to null, and junk to NaN, which gives "Choose the year…".
     - A number with no year draws a selected "Choose the year…" option (`ptrDrawn`).
     - New unit cases, and flow N.
6. **Next year's PTR prints on this year's papers quietly (minor): holds.**
   - Evidence: the draft `ptrYears` always included y+1, and 'ahead' was quiet with no print note.
   - Fixed:
     - Next year is offered only from 1 December.
     - A new amber state `early` covers a later year outside December (chip, panel, saved callout, print note).
     - `ahead` stays quiet in December, with "…before 1 January print it too."
7. **Note inside the `<label>` (minor): holds.**
   - Evidence: `Prescriptions.astro:77–82` and `Letters.astro:95–98` wrap the select in `<label class="field">`, and `Callout.astro` renders a `<div>`.
   - Fixed: the notes follow `</label>`, the select's `aria-describedby` tracks the visible note (and is removed when none is visible), and the keyboard order is checked.
8. **Print-bar note misaligned (minor): holds.**
   - Evidence: `.px-bar-row` is `max-width: 1280px` with 1.25rem of inline padding, and the draft note had `margin: 0 auto` with an inset only at 390.
   - Fixed: a `.px-note-row` wrapper with the bar row's box, an alignment measurement, and the 768 and 1024 widths added.
9. **Verification steps that fail or prove nothing (minor): holds.**
   - Flow E evidence: Set a new password bumps `token_version` (`people.ts:301`), and `requireWorkspace` sends the stale session to sign-in, not to My page. Fixed: Hazel signs in again first.
   - Flow F evidence: Add member with a password sets `must_change_password` (`people.ts:241`). Fixed: the assistant chooses their own password first.
   - Flow C evidence: the password form already posts `action=password` (`account/index.astro:139`). Fixed: the action-less claim is dropped from §0 and §5.
   - Flow J fixed: the record's card and `?saved=letter:` callout are now asserted after the staff PTR changes.
   - Flows G2, L, M and N were added for objections 1, 4 and 5.