// The words check's rules: one per row of docs/glossary.md's last table ("For the developer: the words check"), in
// its order. words.test.mjs checks that every id here is in that table and every id there is here. Plan item 1.8.
//
// Only those rows are checked. A few retired wordings are also ordinary English, so a pattern cannot tell them
// apart and the plan item that touches the file sweeps them by hand: "booking" for the event, "this clinic" (for the
// location on staff screens), "leave", "your page", "plan" alone, "Partly paid", "bill", "intake", "₱X from
// Maxicare", "consent" alone for the privacy notice, "Service" as a column that shows the reason, and "Money",
// "Files", "Health", "Left", "Notes" and "Consent:" as bare titles. The glossary says so too.
// Where a row's Not column holds a wording with the same say, its rule takes it too (each says so on its line).

// Each rule is { id, re, except?, files?, say, item }:
//   re      the retired wording. Text is normalised first (straight quotes, no hard spaces, one space between
//           words: extract.mjs normalise), so a pattern needs only the straight apostrophe.
//   except  phrases that use the same word for something else; a match inside one of them does not count.
//   files   only in files whose repo path matches (a wording that is right on patient pages, wrong on staff ones).
//   say     what to say instead, as the glossary's table says it.
//   item    the plan item (docs/simplify-plan.md) that sweeps it by default; known.json's todo entries name theirs.
//           null: kept out already (nothing on screen uses it), so a new one fails until it is reworded.
//
//   node scripts/dev/words/check.mjs --rules     prints this table
//
// Where a pattern goes past the glossary's own words it says why on its line.
// The staff screens: the workspace, its layout, and the staff-only components outside components/ws.
export const STAFF = /^src\/(pages\/c\/|components\/ws\/|components\/entry\/|layouts\/Clinic\.astro$|components\/(DeskConsent|Odontogram|BillingNotice|StaffEntrance)\.astro$)/;
// Staff screens and the shared lib, whose sentences staff read (visit-record.ts, health.ts); not the patient pages.
const STAFF_OR_LIB = new RegExp(STAFF.source.replace('^src\\/(', '^src\\/(lib\\/|'));

export const RULES = [
  // ── Visits
  { id: 'appointment', re: /\bappointments?\b|\bappts?\b/i, except: /\bby appointment\b/i, say: 'visit (By appointment stays)', item: '2.32' },
  { id: 'booking-ref', re: /\bbooking ref(erence)?\b/i, say: 'Ref', item: '2.32' },
  // A whole label (a button or a link), never words inside a sentence.
  { id: 'book-door', re: /^(rebook|book it|book again|book the first one|book here|book online|book a slot)[.!]?$/i, say: 'New booking (staff), Book a visit (patients)', item: '2.32' },
  // "Book a visit" is the patients' own door; on a staff screen it is a door to the booking panel.
  { id: 'staff-book-a-visit', re: /^book a visit( for …)?[.!]?$/i, files: STAFF, say: 'New booking (on staff screens only)', item: '2.32' },
  { id: 'slot', re: /\bslots?\b/i, say: 'time', item: '2.2' },
  // "Request here" is "Book here"'s twin on a clinic that takes requests (a whole label).
  { id: 'request-a-time', re: /\brequest a time\b|^request here[.!]?$/i, say: 'Request a visit', item: '2.2' },
  { id: 'asked-online', re: /\basked for online\b/i, say: 'Web request', item: '2.32' },
  // The place has a capital S; "the schedule" in lower case is the ordinary word. "The Schedule" opens a sentence.
  { id: 'schedule-place', re: /\b[Tt]he Schedule\b/, say: 'the calendar', item: '1.18' },
  // "this book" and "this branch's book" are the same place as "the book".
  { id: 'the-book', re: /\b(the|this|branch's) book\b/i, say: 'the calendar', item: '2.32' },
  // The glossary's Arrived row retires the two longer ways of saying it too.
  { id: 'in-lobby', re: /\bin (the )?lobby\b|\bnot seated yet\b|\bwaiting to be seated\b/i, say: 'Arrived', item: '1.34' },
  { id: 'in-chair', re: /\bin chair\b(?!\s*\d)/i, say: 'In the chair', item: '1.34' },
  { id: 'completed', re: /\bCompleted\b/, say: 'Done', item: '1.34' },
  { id: 'no-show', re: /\bno show\b/i, say: 'No-show', item: '1.34' },
  { id: 'did-not-come', re: /\bdid not come\b/i, say: 'No-show (staff), Missed (patients)', item: '1.34' },
  // ── Places
  { id: 'team-place', re: /\bTeam\b/, say: 'People', item: '1.18' },
  // The place is "Messages" with a capital; "all messages" in any case is its link. Lower-case "messages" alone is
  // the ordinary word (text messages).
  { id: 'messages-place', re: /\bMessages\b|\b[Aa]ll messages\b/, say: 'Texts', item: '1.18' },
  { id: 'services-fees', re: /services\s*(&|and)\s*fees/i, say: 'Services & prices', item: '1.18' },
  // "→ HMOs" only when the place is not named in full: "Clinic profile → HMOs you accept" is the glossary's own.
  { id: 'hmos-place', re: /→\s*HMOs\b(?! you accept)|\bHMOs you take\b|\bthe HMOs (the clinic|this branch) takes?\b/, say: 'Clinic profile → HMOs you accept', item: '1.18' },
  { id: 'closed-days-time-off', re: /\bclosed days and time off\b/i, say: 'Closed days', item: '1.18' },
  { id: 'call-list', re: /\bthe call list\b/i, say: 'Calls', item: '1.18' },
  { id: 'today-page', re: /\bToday page\b/i, say: 'the Dashboard', item: '1.47' },
  // The places have a capital; "in health" or "in files" in lower case is ordinary words. "In Health, …" opens a
  // sentence.
  { id: 'health-place', re: /\b[Ii]n Health\b|\b[Tt]he Health section\b/, say: 'Medical history (on the record), health history', item: '1.18' },
  { id: 'files-place', re: /\b[Ii]n Files\b/, say: 'X-rays and files', item: '1.18' },
  { id: 'timeline', re: /\btimeline\b/i, say: 'Treatment record', item: null },
  // The page's name, as a whole label or the end of its eyebrow ("Patients · Coverage"); "coverage" in a sentence is
  // the ordinary word.
  { id: 'coverage-name', re: /^Coverage$|·\s*Coverage$/, say: 'PhilHealth & HMO', item: '1.31' },
  // Cannot match "HMO & PhilHealth claims".
  { id: 'hmo-claims', re: /\bHMO claims\b/, say: 'HMO & PhilHealth claims', item: '1.18' },
  // ── People and branches
  // "Clinic page on Flossify" is what patients read at the foot of a clinic's page; it stays. "Listing" is the act of
  // showing on Find a clinic ("switch on your listing"), not the page, so it is not here.
  { id: 'public-page', re: /\b[Yy]our (clinic page|clinic's own page)\b|\bClinic page\b(?! on Flossify)/, say: 'your public page', item: '2.32' },
  { id: 'the-group', re: /\bthe group\b/i, say: 'All your branches', item: '2.24' },
  // ── Forms and consent
  { id: 'desk-poster-forms', re: /\bpatients fill it in\b|\bthe QR forms\b/i, say: 'desk poster forms', item: '1.11' },
  // On staff screens (and the lib's sentences); the patient's own pages keep "New patient forms" and their words.
  { id: 'patient-forms', re: /\bpatient forms\b/i, except: /\bnew patient forms\b|\bpatient forms in progress\b/i, files: STAFF_OR_LIB, say: 'desk poster forms, step-by-step forms', item: '1.12' },
  // The glossary's Forms to add row also retires "Forms sent" and the step-by-step forms' group "Sent: add to the
  // records".
  { id: 'new-patient-forms', re: /\bnew patient forms\b|\bsent: add to the records\b|\bforms sent\b/i, say: 'Forms to add', item: '1.12' },
  { id: 'forms-in-progress', re: /\bpatient forms in progress\b|\bfilling in now\b/i, say: 'Forms being filled in', item: '1.12' },
  { id: 'privacy-consent', re: /\bprivacy consents?\b/i, say: 'privacy notice', item: '2.32' },
  { id: 'consent-no-dental', re: /(?<!dental )\bconsent to examination and treatment\b/i, say: 'the consent to treatment', item: '2.32' },
  { id: 'general-consent', re: /\bgeneral consent\b|\btreatment consent\b/i, say: 'the consent to treatment', item: '2.32' },
  { id: 'sign-another-consent', re: /\bsign another consent\b/i, say: 'Sign consent for this visit', item: '2.32' },
  // ── Money
  { id: 'not-paid-yet', re: /\bnot (yet )?paid( yet)?\b/i, say: 'Unpaid', item: '1.29' },
  // "left to pay" is the glossary's Still to pay row (Money): the same amount, and this rule's say names it.
  { id: 'balance', re: /\bbalances?\b|\bleft to pay\b/i, except: /\bopening balances?\b|\bbalance as of\b|\bbalance brought forward\b/i, say: 'Owes, Still to pay', item: '1.29' },
  // "₱X credit" ("… credit" where the amount is a ${…}) is in the same row: say In credit ₱X.
  { id: 'owed', re: /\bstill owed\b|\bleft owing\b|\bowes nothing\b|\bpaid ahead\b|\boutstanding\b|(?<!nothing )\bowed\b|(?:₱\s?[\d.,]+|…)\s?credit\b/i, say: 'Owes ₱X, In credit ₱X, Nothing owed', item: '1.29' },
  { id: 'payor-part', re: /\btheir part\b|\bHMO or PhilHealth pays\b/i, say: "the HMO's part, PhilHealth's part", item: '1.29' },
  // BIR's own papers keep their names (the field's label is bir-field's).
  { id: 'receipt', re: /\breceipts?\b/i, except: /\bBIR invoice or receipts?\b|\bBIR receipts?\b|\bofficial receipts?\b|\bprofessional tax receipt\b/i, say: 'Acknowledgment of payment', item: '1.29' },
  // The field is "BIR invoice or receipt no." everywhere on screen.
  { id: 'bir-field', re: /\bBIR (receipt|invoice) (no\b|number\b)|\bBIR no\b/, say: 'BIR invoice or receipt no.', item: '2.17' },
  { id: 'invoice', re: /\binvoices?\b/i, except: /\bBIR invoices?\b|\binvoicing system\b|\bBIR invoice or receipt\b/i, say: 'statement', item: '1.29' },
  // ── The record
  { id: 'recall', re: /\brecalls?\b/i, say: 'Next check-up', item: null },
  { id: 'odontogram', re: /\bodontogram\b|\bdental chart\b|\btooth chart\b/i, say: 'the chart', item: null },
  { id: 'strip', re: /\bstrip\b/i, say: 'This visit checklist', item: null },
  { id: 'other-notes', re: /\bother notes\b/i, say: 'desk note', item: '2.32' },
  { id: 'dentists-notes', re: /\bthe dentist's notes\b/i, say: 'clinical notes', item: '2.32' },
  { id: 'health-answers', re: /\bhealth answers\b|\bhealth form\b/i, say: 'health history', item: '2.32' },
  // A patient's text says "your lab work"; staff screens say lab case.
  { id: 'lab-work', re: /\blab work\b/i, say: 'lab case', item: '2.32' },
];

const seen = new Map();
/** The pattern with the g flag, made once. */
const allOf = (re) => {
  if (!seen.has(re)) seen.set(re, new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'));
  return seen.get(re);
};

/** True when the rule's wording is in the text, outside every phrase its `except` names. */
export function matches(rule, text) {
  if (!rule.re.test(text)) return false;
  const spared = rule.except ? [...text.matchAll(allOf(rule.except))].map((m) => [m.index, m.index + m[0].length]) : [];
  for (const m of text.matchAll(allOf(rule.re))) {
    const from = m.index, to = m.index + m[0].length;
    if (!spared.some(([a, b]) => from >= a && to <= b)) return true;
  }
  return false;
}
