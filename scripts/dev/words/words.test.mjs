// The words check's tests (plan item 1.8; docs/glossary.md): what the reader reads and leaves out (the fixtures),
// what each rule catches and spares, that the rules and the glossary's table name the same ids, the check's own
// command, and the check itself over the repository: no retired word anywhere new, and nothing listed in
// known.json that is gone.
//
//   npm run test:words        (node --test scripts/dev/words/words.test.mjs)
//
// When the repository check fails it prints each line to fix, with what the glossary says instead. A place that
// was swept: npm run words:prune takes it off known.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, symlinkSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, FIXED, PUBLIC_FILES, SCANNED, SCREEN_BAR, extract, extractFile, listFiles, allSourceFiles, fixedEntry, isCodeLike, normalise } from './extract.mjs';
import { RULES, matches } from './rules.mjs';
import { scan, compare, readKnown, knownProblems, report, formatKnown, matchItems, pruned, collate, KNOWN_PATH } from './check.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const CHECK = join(HERE, 'check.mjs');
const fixture = (name) => readFileSync(join(HERE, 'fixtures', name), 'utf8');
const read = (name) => extract(name, fixture(name)).map(({ kind, text }) => [kind, text]);
const found = (name) => matchItems(name, extract(name, fixture(name))).map(({ rule, text }) => [rule, text])
  .sort((a, b) => collate(a[0], b[0]) || collate(a[1], b[1]));
const cli = (args, env) => spawnSync(process.execPath, [CHECK, ...args], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...env } });

// ── (a) The reader ─────────────────────────────────────────────────────────────────────────────────────────

test('an .astro page: text, attributes, props, aria-label, frontmatter, template literals, its script, a phrase across a tag', () => {
  assert.deepEqual(read('page.astro'), [
    ['code', 'Done'],
    ['code', 'Not paid yet'],
    ['code', 'Owes nothing at …'],               // a template literal: each ${…} is "…"
    ['code', 'Booking reference'],               // an object's value; its key 'No show' is not read
    ['attr', 'Closed days and time off'],        // a component prop
    ['attr', 'Open Team'],
    ['attr', 'Void this receipt?'],              // data-confirm: a page script says it
    ['text', 'Your appointments are below.'],
    ['attr', 'Open the call list'],
    ['attr', 'Booking reference'],               // aria-label
    ['text', 'Calls'],
    ['attr', 'Other notes'],                     // placeholder
    ['text', 'Saved on the'],
    ['text', 'Schedule'],
    ['text', 'page.'],
    ['joined', 'Saved on the Schedule page.'],
    ['text', 'Open'],
    ['text', 'Settings → Team'],
    ['text', 'now.'],
    ['joined', 'Open Settings → Team now.'],
    ['expr', 'Still owed'],
    ['text', 'Nothing owed'],
    ['script', 'In the lobby'],
    ['script', 'Paid ahead by …'],
    ['css', 'Recall'],
  ]);
});

test('an .astro page: never a comment, a type, a key, a class list, a hook, an id, a URL, SQL, a comparison, console, a selector, JSON, CSS', () => {
  const texts = extract('page.astro', fixture('page.astro')).map((i) => i.text).join('\n');
  for (const code of ['Team page', 'Team appointment', 'call list.', 'Messages', 'In chair', 'In lobby', 'No show',
    'pp-strip', 'recall-card', 'timeline', '/settings/team/', 'select id', '[data-recall]', 'is-strip', '"name"', 'Today page', 'color: red']) {
    assert.ok(!texts.includes(code), `read "${code}", which is code or a comment`);
  }
});

test('an .astro page: lines are the source lines, and a joined text covers its pieces', () => {
  const items = extract('page.astro', fixture('page.astro'));
  const at = (t) => items.find((i) => i.text === t);
  assert.equal(at('Not paid yet').line, 8);
  assert.equal(at('Your appointments are below.').line, 18);
  assert.equal(at('In the lobby').line, 30);
  assert.equal(at('Recall').line, 36);
  const joined = at('Saved on the Schedule page.');
  assert.deepEqual(joined.covers.map((c) => items[c].text), ['Saved on the', 'Schedule', 'page.']);
});

test('an .astro page: the rules see the joined phrase once, and never twice', () => {
  assert.deepEqual(found('page.astro'), [
    ['appointment', 'Your appointments are below.'],
    ['booking-ref', 'Booking reference'],
    ['booking-ref', 'Booking reference'],
    ['call-list', 'Open the call list'],
    ['closed-days-time-off', 'Closed days and time off'],
    ['in-lobby', 'In the lobby'],
    ['not-paid-yet', 'Not paid yet'],
    ['other-notes', 'Other notes'],
    ['owed', 'Owes nothing at …'],
    ['owed', 'Paid ahead by …'],
    ['owed', 'Still owed'],
    ['recall', 'Recall'],
    ['receipt', 'Void this receipt?'],
    ['schedule-place', 'Saved on the Schedule page.'],   // only the whole phrase says it
    ['team-place', 'Open Team'],
    ['team-place', 'Settings → Team'],                    // the piece, not "Open Settings → Team now." as well
  ]);
});

test('words made of pieces: each way a choice reads, a spacer, a + chain, a count helper, set:html, define:vars, a callback', () => {
  assert.deepEqual(read('pieces.astro'), [
    ['code', ', … new patient … waiting'],
    ['code', ', … new patient form waiting'],          // each way `${k === 1 ? 'form' : 'forms'}` reads
    ['code', ', … new patient forms waiting'],
    ['code', 'invoice'],                               // plural(n, 'invoice'): the word a count helper is given
    ['code', 'Open the call'],
    ['code', 'Open the call list'],                    // 'Open the call ' + 'list', whole
    ['code', 'That slot has just gone. Pick another.'], // inside JSON.stringify
    ['text', 'Owes'],
    ['joined', 'Owes …'],
    ['joined', 'Owes nothing'],                        // Owes <strong>{n === 0 ? 'nothing' : due}</strong>
    ['text', 'Open the call'],
    ['text', 'list'],
    ['text', 'first.'],
    ['joined', 'Open the call list first.'],           // {' '} is a space, not "…"
    ['text', 'You have'],
    ['text', 'left.'],
    ['joined', 'You have … … left.'],
    ['joined', 'You have … slot left.'],
    ['joined', 'You have … slots left.'],
    ['attr', 'Balance:'],                              // title={…}: always words, colon and all
    ['attr', 'Done:'],
    ['attr', 'Recall …'],
    ['text', 'Plain'],
    ['text', 'Saved on the Schedule.'],                // set:html, tags taken out
    ['expr', 'Booking reference'],                     // set:text
    ['text', 'In the lobby'],                          // inside headers.map(() => …)
    ['expr', 'Open the Team page'],                    // a script's define:vars
  ]);
  assert.deepEqual(found('pieces.astro'), [
    ['balance', 'Balance:'],
    ['booking-ref', 'Booking reference'],
    ['call-list', 'Open the call list'],
    ['call-list', 'Open the call list first.'],
    ['in-lobby', 'In the lobby'],
    ['invoice', 'invoice'],
    ['new-patient-forms', ', … new patient forms waiting'],
    ['owed', 'Owes nothing'],
    ['recall', 'Recall …'],
    ['schedule-place', 'Saved on the Schedule.'],
    ['slot', 'That slot has just gone. Pick another.'],
    ['slot', 'You have … slot left.'],                 // the first way that says it, not "slots" as well
    ['team-place', 'Open the Team page'],
  ]);
});

test('words made of pieces: a way covers its pieces and the ways before it', () => {
  const items = extract('pieces.astro', fixture('pieces.astro'));
  const at = (t) => items.findIndex((i) => i.text === t);
  assert.deepEqual(items[at('You have … slots left.')].covers.map((c) => items[c].text),
    ['You have', 'left.', 'You have … … left.', 'You have … slot left.']);
  assert.deepEqual(items[at(', … new patient forms waiting')].covers.map((c) => items[c].text),
    [', … new patient … waiting', ', … new patient form waiting']);
});

test('a .ts module: words handed to append, helpers, textContent, Object.assign, JSON and markup; prose with colons and hyphens', () => {
  assert.deepEqual(read('pieces.ts'), [
    ['code', 'In lobby'],                              // side.append(pill('In lobby', …))
    ['code', 'Open the Team page'],                    // el.append('…')
    ['code', '… today'],
    ['code', 'appointment'],                           // n(3, 'appointment', 'appointments')
    ['code', 'appointments'],
    ['code', 'Then 3 more … with you'],
    ['code', 'Then 3 more appointment with you'],
    ['code', 'Then 3 more appointments with you'],
    ['code', 'Open the call'],
    ['code', 'Open the call list'],
    ['code', 'Still owed'],                            // Object.assign(el, { textContent }), never onto a style
    ['code', 'Booking reference'],                     // the title and aria-label inside innerHTML
    ['code', 'Open the call list'],
    ['code', 'Go'],
    ['code', 'That slot has just gone. Pick another.'],
    ['code', 'No show'],                               // a callback passed to querySelectorAll(…).forEach
    ['code', 'balance: …'],
    ['code', '…: appointments only'],
    ['code', 'walk-in appointment'],
    ['code', 'Completed:'],
    ['code', '(Completed)'],
    ['code', 'Invoice/receipt'],
    ['code', 'slots'],                                 // make('span', 'unit', ' slots'): a word with a space beside it
    ['code', 'slot'],                                  // el.textContent = x ? 'slot' : 'slots': what textContent gets is words
    ['code', 'slots'],
  ]);
  const texts = read('pieces.ts').map(([, t]) => t);
  for (const code of ['booking_ref', 'amber', '0.5rem 0 1rem', 'ws-pill ws-tint-teal', 'cal-slot is-open', 'login:e:x', 'recall-set', '(max-width: 767px)'])
    assert.ok(!texts.includes(code), `read "${code}", which is code`);
  assert.equal(texts.filter((t) => t === 'appointment').length, 1, 'console.log(\'appointment\') is read');
  assert.deepEqual(found('pieces.ts'), [
    ['appointment', '…: appointments only'], ['appointment', 'appointment'], ['appointment', 'appointments'],
    ['appointment', 'Then 3 more appointment with you'],  // not "appointments" as well: a way after a way that said it
    ['appointment', 'walk-in appointment'], ['balance', 'balance: …'], ['booking-ref', 'Booking reference'],
    ['call-list', 'Open the call list'], ['call-list', 'Open the call list'], ['completed', '(Completed)'], ['completed', 'Completed:'],
    ['in-lobby', 'In lobby'], ['invoice', 'Invoice/receipt'], ['no-show', 'No show'], ['owed', 'Still owed'],
    ['receipt', 'Invoice/receipt'], ['slot', 'slot'], ['slot', 'slots'], ['slot', 'slots'], ['slot', 'That slot has just gone. Pick another.'],
    ['team-place', 'Open the Team page'],
  ]);
});

test('a .ts module: its strings, never imports, types, keys, SQL, hooks, console, attributes, URLSearchParams, RegExp, cases', () => {
  assert.deepEqual(read('module.ts'), [
    ['code', 'In lobby'],
    ['code', 'Arrived'],
    ['code', 'Owes nothing · …'],                // setAttribute('aria-label', …) is words
    ['code', 'Where it is from'],                // prose with SQL's words in it stays words
    ['code', 'One invoice'],
    ['code', '… invoices'],
    ['code', 'Book again'],
  ]);
  assert.deepEqual(found('module.ts'), [
    ['book-door', 'Book again'], ['in-lobby', 'In lobby'], ['invoice', '… invoices'], ['invoice', 'One invoice'], ['owed', 'Owes nothing · …'],
  ]);
  const lines = extract('module.ts', fixture('module.ts')).map((i) => i.line);
  assert.deepEqual(lines, [9, 9, 18, 23, 24, 24, 28]); // the source's own lines, not the wrapped ones
});

test('a print page: the repo check reads its screen bar only', () => {
  assert.deepEqual(extract('print.astro', fixture('print.astro'), { only: SCREEN_BAR }).map(({ text }) => text), ['Back to the record', '80 mm receipt']);
  assert.ok(read('print.astro').some(([, t]) => t === 'Official receipt'), 'read whole, the paper is there too');
  assert.ok(extractFile('src/pages/c/[clinic]/finances/[invoice]/print.astro').some((i) => i.text === '80 mm receipt'));
});

test('a stylesheet: only content: strings, CSS escapes decoded', () => {
  assert.deepEqual(extract('sheet.css', fixture('sheet.css')).map(({ kind, text, line }) => [kind, text, line]), [
    ['css', 'Show them', 3], ['css', 'Recall list', 4], ['css', '→ Next', 5],
  ]);
});

test('the installed app: name, short name, description and shortcuts', () => {
  const m = JSON.stringify({ name: 'Flossify', short_name: 'Flossify', description: 'The clinic workspace: Messages', start_url: '/today/', shortcuts: [{ name: 'Today page', url: '/today/' }] }, null, 2);
  assert.deepEqual(extract('manifest.webmanifest', m).map(({ kind, text, line }) => [kind, text, line]), [
    ['manifest', 'Flossify', 2], ['manifest', 'Flossify', 3], ['manifest', 'The clinic workspace: Messages', 4], ['manifest', 'Today page', 8],
  ]);
  assert.throws(() => extract('public/manifest.webmanifest', '{ "name": "x",\n}'), /public\/manifest\.webmanifest is not JSON/);
});

test('a file that does not parse fails loudly, at its own line', () => {
  assert.throws(() => extract('broken.astro', '<p>{oops</p>\n'), /does not parse/);
  assert.throws(() => extract('broken.ts', 'const a = 1;\nconst b = 2;\nconst x = ;\n'), /broken\.ts does not parse \(3:/);
  assert.throws(() => extract('notes.md', '# Team'), /notes\.md is not a kind of file the words check reads/);
});

test('entities and a doctype in strings with no other markup are read as a person reads them', () => {
  assert.deepEqual(read('entities.ts'), [
    ['code', 'No show · call them back'],                            // &nbsp; and &middot; decoded with no tags around
    ['code', 'Offline Your appointments are kept on this device.'],  // the <!doctype> goes with the tags
    ['code', 'Owes \ufffd on the account'],                           // &#x110000; is past U+10FFFF: no RangeError
  ]);
  assert.deepEqual(found('entities.ts'), [['appointment', 'Offline Your appointments are kept on this device.'], ['no-show', 'No show · call them back']]);
});

test('the code test: words stay words, code goes', () => {
  for (const words of ['Where it is from', 'Select a dentist from the list.', 'a no-show', 'Save', 'No-show', '₱800 a month',
    'Owes ₱…', 'e.g. 2012', 'Saving checks the book again.', 'Settings → Team', 'PRC',
    'Balance:', 'Outstanding:', '(Completed)', 'Appointment(s)', 'Invoice/receipt', 'allergy: …', 'desk note: …', '…: nothing booked',
    '…: more than … items.', 'check-up due …', 'no-show balance', 'walk-in appointments', 'x-ray files', '… slots/day',
    'on flossify.ph/your-clinic', 'or e.g. 2012', 'or email billing@flossify.ph']) assert.equal(isCodeLike(words), false, words);
  for (const code of ['team', 'recall-set', 'appointment_id', '#timeline', '/settings/team/', '[data-recall] .strip', 'rec-ahead-…',
    'ws-pill ws-tint-teal', 'flex items-center gap-2', 'https://flossify.ph/team', 'patientHref', 'login:e:…',
    'select a.id from appointment a where a.status = $1', 'r.balance > 0', "('issued', 'partly_paid', 'paid')",
    'from appointment a join patient p on p.id = a.patient_id', 'text/plain; charset=utf-8', 'width="…" height="…"', 'POST', '…', '· …',
    '(max-width: 767px)', '(prefers-color-scheme: dark)', 'Asia/Manila', 'balance', 'cal-slot is-open', 'bg-accent/10 text-accent-deep'])
    assert.equal(isCodeLike(code), true, code);
});

test('normalising: straight quotes, no hard spaces, one space between words', () => {
  assert.equal(normalise('  Sign in at your clinic’s page “now”​\n'), 'Sign in at your clinic\'s page "now"');
});

// ── (b) The rules ──────────────────────────────────────────────────────────────────────────────────────────

/** For each rule: wordings it must catch, and legitimate uses it must spare (the glossary's notes, the survey). */
const EXAMPLES = {
  'appointment': [['My coming appointments', 'Appointments only', 'Next appt.'], ['By appointment', 'Walk-ins welcome · By appointment', 'Sunday reads "by appointment"']],
  'booking-ref': [['Booking ref BK-7F2Q', 'Booking reference'], ['Ref BK-7F2Q', 'Bookings by reference']],
  'book-door': [['Rebook', 'Book it', 'Book again', 'Book the first one', 'Book here', 'Book online', 'Book a slot'], ['New booking', 'Save booking', 'Book anyway', 'Book a visit', 'Book a visit at the desk or online']],
  'staff-book-a-visit': [['Book a visit', 'Book a visit for …'], ['New booking', 'Book a visit at the desk or online', 'Book anyway']],
  'slot': [['That slot has just gone. Pick another.', 'Real open slots'], ['That time has just gone. Pick another.', 'Next open']],
  'request-a-time': [['Request a time', 'Request here'], ['Request a visit', 'Request for medical clearance', 'LOA request', 'Send a request here when you are ready']],
  'asked-online': [['Asked for online'], ['Web request', 'Booked online']],
  'schedule-place': [['Add them from the Schedule first', 'The Schedule shows every chair.'], ['Your role cannot change the schedule here.', 'the live schedule']],
  'the-book': [['Nothing on the book.', 'That visit is not on this book.', "That visit is not on this branch's book any more."], ['Book the visit', 'the booking', 'Book a visit']],
  'in-lobby': [['In the lobby', 'In lobby', 'Dana is in the lobby.', 'here, not seated yet', 'Checked in, waiting to be seated'], ['Arrived', 'Check in anyway', 'Waiting 12 min']],
  'in-chair': [['In chair'], ['In the chair', 'Seated in chair 2']],
  'completed': [['Completed', 'Completed a visit today'], ['Done', 'Nobody who completed a visit today owes anything.']],
  'no-show': [['No show'], ['No-show', 'No no-shows today.']],
  'did-not-come': [['Did not come', 'They did not come'], ['No-show', 'Missed']],
  'team-place': [['Settings → Team', 'Open Team to send a new code', 'Check it in Settings, Team.'], ['Task for the team', 'Know the team.', 'Your whole team', 'No longer on the team']],
  'messages-place': [['Messages', 'All messages', 'the Messages page'], ['Texts', 'Text a patient', 'text messages']],
  'services-fees': [['Clinic settings → Services & fees', 'Services and fees'], ['Services & prices', 'fee guide']],
  'hmos-place': [['The ones this branch takes are in Clinic settings → HMOs.', 'Tick the HMOs you take', 'the HMOs the clinic takes'], ['Clinic profile → HMOs you accept', 'HMOs you accept']],
  'closed-days-time-off': [['Closed days and time off'], ['Closed days', 'time away']],
  'call-list': [['It is on the call list.'], ['It shows on Calls.', 'Open Calls']],
  'today-page': [['the Today page’s state machine'], ["Today's patients", 'Today']],
  'health-place': [['Keep health details in Health.', 'A birth date changes in the Health section.', 'In Health, tick the allergies.', 'The Health section has it.'], ['health history', 'Health history: not asked yet', 'Your health']],
  'files-place': [['Upload it in Files first.', 'In Files, pick the X-ray.'], ['X-rays and files', 'Add files', 'in files of the clinic']],
  'timeline': [['Timeline'], ['Treatment record']],
  'coverage-name': [['Coverage', 'Patients · Coverage'], ['PhilHealth & HMO', 'How coverage works', 'Coverage for braces varies by HMO.']],
  'hmo-claims': [['HMO claims', 'Open HMO claims'], ['HMO & PhilHealth claims', 'Claims', 'an HMO claim']],
  'public-page': [['Your clinic page on Find a clinic.', "Your clinic's own page:", 'Clinic page'], ['your public page', 'Clinic page on Flossify', 'My page', 'Switch on your listing.', 'switch on the listing']],
  'desk-poster-forms': [['Patients fill it in', 'the QR forms'], ['desk poster forms', 'New patient? Scan to fill in your forms.']],
  'patient-forms': [['Patient forms', 'Added from the patient forms (QR-7K2F).', 'cannot add or dismiss patient forms'], ['New patient forms', 'Patient forms in progress', 'desk poster forms', 'step-by-step forms']],
  'privacy-consent': [['Privacy consent', 'the privacy consent waits'], ['Privacy notice: agreed', 'Privacy notice: not agreed yet']],
  'consent-no-dental': [['the consent to examination and treatment'], ['Consent to dental examination and treatment', 'the consent to treatment']],
  'general-consent': [['the general consent', 'Treatment consent version'], ['the consent to treatment']],
  'sign-another-consent': [['Sign another consent'], ['Sign consent for this visit', 'Sign on this tablet']],
  'new-patient-forms': [['New patient forms', '3 new patient forms are waiting.', 'Sent: add to the records', 'Forms sent'], ['Forms to add', 'New patient? Scan to fill in your forms.', 'Add to the records']],
  'forms-in-progress': [['Patient forms in progress', 'Filling in now'], ['Forms being filled in', 'Forms to add', 'Forms sent']],
  'not-paid-yet': [['Not paid yet', 'not paid yet', 'Not yet paid'], ['Unpaid', 'Part paid', 'Paid']],
  'balance': [['Balance', 'With balance', 'more than the balance of ₱500', 'with whatever is left to pay'], ['Opening balance', 'Opening balances', 'Balance as of', 'Balance brought forward from the clinic’s earlier records', 'Still to pay']],
  'owed': [['₱1,200 owed', 'Still owed', 'Left owing', 'Owes nothing', 'Paid ahead', 'outstanding', '₱500 credit', '… credit'], ['Nothing owed', 'Owes ₱1,200', 'In credit ₱200', 'a credit card']],
  'payor-part': [['Their part', 'Their part, in pesos', 'HMO or PhilHealth pays'], ["Maxicare's part ₱900", "PhilHealth's part", 'HMO or PhilHealth']],
  'receipt': [['80 mm receipt', 'Print the receipt', 'A receipt printer'], ['BIR invoice or receipt no.', 'BIR receipt no.', 'Statements of account, not BIR receipts.', 'Flossify does not issue BIR receipts', 'As printed on your professional tax receipt', 'official receipt']],
  'bir-field': [['BIR receipt no.', 'Date and BIR receipt no.', 'BIR receipt number', 'Add BIR no.', 'BIR invoice no.'], ['BIR invoice or receipt no.', 'Statements of account, not BIR receipts.', 'BIR invoices still come from your own registered booklet.']],
  'invoice': [['Invoice', 'Print the invoice'], ['Flossify is not a BIR-registered invoicing system. The clinic’s BIR invoice or receipt is a separate paper.', 'BIR invoices still come from your own registered booklet.', 'BIR invoice or receipt no.']],
  'recall': [['Recall', 'recalls due'], ['Next check-up', 'Due for check-up']],
  'odontogram': [['Odontogram', 'the dental chart', 'Tooth chart'], ['the chart', 'Chart no.', 'Patient’s chart']],
  'strip': [['the strip', 'This visit strip'], ['This visit', 'stripe', 'stripped']],
  'other-notes': [['Other notes'], ['Desk note', 'Notes', 'Note for the dentist']],
  'dentists-notes': [["The dentist's notes", 'The dentist’s notes'], ['Clinical notes', 'clinical note']],
  'health-answers': [['No health answers yet.', 'Save the health answers', 'the health form'], ['health history', 'Health history: not asked yet', 'Your health']],
  'lab-work': [['Lab work back', 'No lab work is marked back for them.'], ['Lab cases', 'lab case', 'laboratory']],
  'the-group': [['What the group pays Flossify', 'Open branches in the group'], ['All your branches', 'Group', 'a group of patients']],
};

for (const rule of RULES) {
  test(`rule ${rule.id}: catches the retired wording, spares the legitimate ones`, () => {
    const ex = EXAMPLES[rule.id];
    assert.ok(ex, `no examples for ${rule.id}`);
    for (const t of ex[0]) assert.equal(matches(rule, normalise(t)), true, `should catch "${t}"`);
    for (const t of ex[1]) assert.equal(matches(rule, normalise(t)), false, `should spare "${t}"`);
  });
}

test('a rule with files counts only in those files: Book a visit is the patients\u2019 door, a staff screen\u2019s retired one', () => {
  const item = [{ text: 'Book a visit', line: 1, kind: 'text' }];
  const ids = (file) => matchItems(file, item).map((m) => m.rule);
  assert.deepEqual(ids('src/pages/c/[clinic]/patients/[patient].astro'), ['staff-book-a-visit']);
  assert.deepEqual(ids('src/components/ws/cal/panels.ts'), ['staff-book-a-visit']);
  assert.deepEqual(ids('src/layouts/Clinic.astro'), ['staff-book-a-visit']);
  assert.deepEqual(ids('src/pages/find/[clinic]/book.astro'), []);
  assert.deepEqual(ids('src/pages/me/_Shell.astro'), []);
});

test('a match inside an except phrase is spared, one outside it still counts', () => {
  const receipt = RULES.find((r) => r.id === 'receipt');
  assert.equal(matches(receipt, 'Statements of account, not BIR receipts.'), false);
  assert.equal(matches(receipt, 'Statements of account, not BIR receipts. Print the receipt'), true);
});

// ── (c) The rules and the glossary name the same ids ───────────────────────────────────────────────────────

test('every rule id is in docs/glossary.md’s rule table, in its order and with its words, and every id there has a rule', () => {
  const md = readFileSync(join(ROOT, 'docs/glossary.md'), 'utf8');
  const part = md.slice(md.indexOf('## For the developer: the words check'));
  assert.ok(part.length > 40, 'the glossary has no "For the developer: the words check" section');
  const rows = [...part.matchAll(/^\|\s*`([a-z-]+)`\s*\|\s*(.+?)\s*\|\s*$/gm)].map((m) => [m[1], m[2].replace(/[*`]/g, '').trim()]);
  assert.deepEqual(RULES.map((r) => r.id), rows.map(([id]) => id));
  for (const [id, say] of rows) assert.equal(RULES.find((r) => r.id === id).say, say, `say for ${id}`);
});

// ── The files and the list ─────────────────────────────────────────────────────────────────────────────────

test('every fixed file entry still names a file, and every print page is fixed with its screen bar read', () => {
  const all = allSourceFiles({ all: true });
  for (const f of FIXED) assert.ok(all.some((p) => fixedEntry(p)?.glob === f.glob), `nothing (or only an earlier entry) matches ${f.glob}`);
  for (const p of all.filter((x) => /^src\/pages\/.*(\/print\.astro|\/print\/)/.test(x) || /\/patients\/\[patient\]\/(rx|letters|aftercare)\//.test(x) || /\/patients\/\[patient\]\/treatment-record\.astro$/.test(x))) {
    assert.ok(fixedEntry(p)?.bar, `${p} is a print page but is not fixed with its bar read`);
  }
  for (const p of PUBLIC_FILES) assert.ok(existsSync(join(ROOT, p)), `${p} is gone`);
});

test('every file under src is read or fixed: a new kind of page fails until the reader reads it or FIXED names it', () => {
  for (const p of allSourceFiles({ all: true })) {
    assert.ok(SCANNED.test(p) || fixedEntry(p), `${p} is neither read (${SCANNED}) nor in FIXED (extract.mjs): add a reader for it or a FIXED entry with why`);
  }
});

test('the repo scan reads src and the public files, never the fixtures, SQL, tests or the privacy notice', () => {
  const files = listFiles();
  assert.ok(files.length > 200);
  assert.ok(!files.some((f) => f.includes('scripts/dev/words/fixtures')));
  assert.ok(!files.some((f) => f.startsWith('src/data/migrations/') || f.endsWith('.sql') || f.endsWith('.test.ts') || f === 'src/pages/privacy.astro' || f === 'src/lib/consent-library.ts'));
  assert.ok(files.includes('src/data/directory.ts'), 'directory.ts holds sentences patients read (the symptoms’ tips)');
  for (const p of PUBLIC_FILES) assert.ok(files.includes(p));
});

test('known.json: every entry usable, sorted, every todo a plan item that exists', () => {
  const raw = readFileSync(KNOWN_PATH, 'utf8');
  const known = JSON.parse(raw);
  assert.deepEqual(knownProblems(known), [], 'known.json has entries the check cannot use');
  assert.equal(raw, formatKnown(known), 'known.json is not in its written order (npm run words:prune rewrites it)');
  const plan = readFileSync(join(ROOT, 'docs/simplify-plan.md'), 'utf8');
  for (const e of known.todo) {
    assert.ok(new RegExp(`^\\*\\*${e.item.replace('.', '\\.')} `, 'm').test(plan), `todo ${e.file} names plan item ${e.item}, which docs/simplify-plan.md does not have`);
  }
});

test('known.json: an entry with no count, no why, no item or no such rule is refused, by name', () => {
  const problems = knownProblems({
    allowed: [{ file: 'a.astro', rule: 'slot', text: 'Pick a slot', why: 'a legitimate other meaning' }, { file: 'b.astro', rule: 'slot', text: 'x', count: 1 }],
    todo: [{ file: 'c.astro', rule: 'nope', text: 'y', count: 1, item: '2.2' }, { file: 'd.astro', rule: 'slot', text: 'z', count: 0.5 }],
  });
  assert.equal(problems.length, 5, problems.join('\n'));
  assert.match(problems[0], /^allowed\[0\] a\.astro \[slot\] "Pick a slot": "count" must be a whole number/);
  assert.match(problems[1], /^allowed\[1\] b\.astro .*needs a one-line "why"/);
  assert.match(problems[2], /^todo\[0\] c\.astro \[nope\].*there is no rule nope/);
  assert.match(problems.slice(3).join('\n'), /todo\[1\] d\.astro .*"count" must be a whole number[\s\S]*todo\[1\] d\.astro .*needs the plan "item"/);
});

test('--prune only lowers and drops, never adds', () => {
  const known = { allowed: [{ file: 'a', rule: 'slot', text: 'x', count: 2, why: 'w' }], todo: [{ file: 'a', rule: 'slot', text: 'x', count: 1, item: '2.2' }, { file: 'b', rule: 'slot', text: 'y', count: 1, item: '2.2' }] };
  const now = [{ file: 'a', rule: 'slot', text: 'x' }, { file: 'a', rule: 'slot', text: 'x' }, { file: 'c', rule: 'slot', text: 'z' }];
  assert.deepEqual(pruned(known, now), { allowed: [{ file: 'a', rule: 'slot', text: 'x', count: 2, why: 'w' }], todo: [] });
  assert.equal(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts['words:prune'], 'node scripts/dev/words/check.mjs --prune');
});

test('known.json is written in one order whatever the machine’s locale', () => {
  const entries = ['Zero slots', 'Aabenraa slot', 'Chant a slot', 'Changes to the slot'].map((text) => ({ file: 'a', rule: 'slot', text, count: 1, item: '2.2' }));
  const probe = `import { formatKnown } from ${JSON.stringify(new URL('./check.mjs', import.meta.url).href)};
    process.stdout.write(formatKnown({ allowed: [], todo: ${JSON.stringify(entries)} }));`;
  const run = (lang) => spawnSync(process.execPath, ['--input-type=module', '-e', probe], { encoding: 'utf8', env: { ...process.env, LC_ALL: lang, LANG: lang } });
  const en = run('en_US.UTF-8'), da = run('da_DK.UTF-8');
  assert.equal(en.status, 0, en.stderr);
  assert.equal(da.stdout, en.stdout);
  assert.deepEqual(JSON.parse(en.stdout).todo.map((e) => e.text), ['Aabenraa slot', 'Changes to the slot', 'Chant a slot', 'Zero slots']);
});

// ── The command ────────────────────────────────────────────────────────────────────────────────────────────

test('the command refuses what it does not know, with one sentence and exit 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'words-'));
  try {
    for (const [args, says] of [
      [['--prnue'], /unknown option --prnue/],
      [['--file', 'x.ts'], /unknown option --file/],
      [['x.ts'], /unexpected x\.ts/],
      [['--files'], /--files needs at least one file/],
      [['--files', join(dir, 'nope.ts')], /nope\.ts: no such file/],
      [['--files', dir], /is a folder/],
    ]) {
      const r = cli(args);
      assert.equal(r.status, 2, `${args.join(' ')}: ${r.stdout}${r.stderr}`);
      assert.match(r.stderr, says);
      assert.doesNotMatch(r.stderr, /\n\s+at /, 'no stack trace');
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the command runs through a symbolic link to the repository', () => {
  const dir = mkdtempSync(join(tmpdir(), 'words-'));
  try {
    symlinkSync(ROOT, join(dir, 'link'));
    const r = spawnSync(process.execPath, [join(dir, 'link', 'scripts/dev/words/check.mjs'), '--rules'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^appointment\b/m);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── (d) The repository: nothing new, nothing stale ─────────────────────────────────────────────────────────

test('the repository: no retired word anywhere new, and nothing listed that is gone', () => {
  const result = scan();
  const cmp = compare(result.found, readKnown());
  const lines = report(cmp);
  assert.deepEqual(lines, [], `\n${lines.join('\n')}\n`);
});
