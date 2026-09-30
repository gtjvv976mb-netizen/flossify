// The record's four tabs: every name that can pick what the patient record shows first must resolve to one of
// them through TAB_OF (src/pages/c/[clinic]/patients/_record/sections.ts). A name that does not would land a person
// on the wrong tab, or on nothing, without a word — so this fails, naming the value and where it came from.
//
//   npm run test:record-tabs     (node --experimental-strip-types --import ./scripts/ts-register.mjs scripts/dev/record-tabs-check.mjs)
//
// What it reads:
//   - the maps themselves: ANCHOR, EXTRA_ANCHOR, both SECTION_OF (record.ts, record-extra.ts), SAVED_TO, SAVED_WORD,
//     OPEN_PANEL, the old sections (SECTION_META), every `back` a form may carry (backOf);
//   - every saved word record.ts and record-extra.ts return, and every ?saved= the record page and the pages
//     around it redirect with (read from the source);
//   - landingSection() over every combination of a post's section, back=chart, a saved word, a panel to open and a
//     ?visit= (today's, another day's on the Treatment record, another day's that is not, none);
//   - every #hash into the record: the list in the spec (§5) and every one the source links to — record URLs in
//     any page, the record's own forms and redirects, data-rec-go / data-rec-show, the Dashboard's visit panel;
//   - every ?open= the source links to, which must be a panel the page opens (OPEN_PANEL).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const REC = 'src/pages/c/[clinic]/patients';
const S = await import(pathToFileURL(join(ROOT, REC, '_record/sections.ts')).href);
const R = await import(pathToFileURL(join(ROOT, 'src/lib/record.ts')).href);
const X = await import(pathToFileURL(join(ROOT, 'src/lib/record-extra.ts')).href);
const { TABS, TAB_OF, tabOf, SECTION_META, ANCHOR, SAVED_TO, SAVED_WORD, recordSaved, OPEN_PANEL, backOf, landingSection } = S;

const TAB_IDS = ['overview', 'patient', 'chart', 'treatment-record'];
const fails = [];
let checked = 0;
const fail = (what, value, got) => fails.push(`${what}: ${JSON.stringify(value)}${got !== undefined ? ` → ${JSON.stringify(got)}` : ''}`);
/** A name resolves when TAB_OF takes it to one of the four tabs. */
const resolves = (what, name) => { checked++; const t = tabOf(name); if (!t || !TAB_IDS.includes(t)) fail(what, name, t); };
/** A #hash resolves the way the page reads one: the name, or a panel's id (rec-<name>). */
const hashResolves = (what, h) => { checked++; const t = tabOf(h) ?? tabOf(h.replace(/^rec-/, '')); if (!t || !TAB_IDS.includes(t)) fail(what, `#${h}`, t); };

// --- the tabs and the map --------------------------------------------------------------------------------------
if (TABS.length !== 4) fail('TABS: four tabs', TABS.map((t) => t.id));
if (JSON.stringify(TABS.map((t) => t.id)) !== JSON.stringify(TAB_IDS)) fail('TABS: overview, patient, chart, treatment-record in that order', TABS.map((t) => t.id));
for (const t of TABS) {
  if (TAB_OF[t.id] !== t.id) fail('TAB_OF: a tab is its own tab', t.id, TAB_OF[t.id]);
  if (!t.label || !t.short || !t.hue || !t.icon) fail('TABS: label, short, hue and icon', t.id);
}
for (const [k, v] of Object.entries(TAB_OF)) if (!TAB_IDS.includes(v)) fail(`TAB_OF.${k}`, v);
for (const k of Object.keys(SECTION_META)) resolves('an old section (SECTION_META)', k);

// --- the maps a post or a link lands through ------------------------------------------------------------------
for (const [k, v] of Object.entries(ANCHOR)) hashResolves(`ANCHOR[${k}]`, v);
for (const [k, v] of Object.entries(X.EXTRA_ANCHOR)) hashResolves(`EXTRA_ANCHOR[${k}]`, v);
for (const [k, v] of Object.entries(R.SECTION_OF)) resolves(`record.ts SECTION_OF[${k}]`, v);
for (const [k, v] of Object.entries(X.SECTION_OF)) resolves(`record-extra.ts SECTION_OF[${k}]`, v);
for (const [k, v] of Object.entries(SAVED_TO)) resolves(`SAVED_TO[${k}]`, v);
for (const [k, v] of Object.entries(SAVED_WORD)) resolves(`SAVED_WORD[${k}]`, v);
for (const [k, v] of Object.entries(OPEN_PANEL)) resolves(`OPEN_PANEL[${k}]`, v);
for (const i of [...R.RECORD_INTENTS, ...X.EXTRA_INTENTS]) {
  const section = R.SECTION_OF[i] ?? X.SECTION_OF[i];
  if (!section) fail('an intent with no section', i);
  // Where the post redirects (the page: treated → chart-offer, back=chart → chart, else ANCHOR / EXTRA_ANCHOR / section).
  hashResolves(`the redirect of ${i}`, ANCHOR[i] ?? X.EXTRA_ANCHOR[i] ?? section);
}
hashResolves('the redirect of a treatment with a chart offer', 'chart-offer');
for (const b of ['chart', 'treatment', 'overview', 'patient', 'treatment-record']) { const v = backOf(b); if (v) resolves(`back=${b}`, v); }
if (backOf('chart') !== 'chart') fail('backOf: the palette\'s back=chart', 'chart', backOf('chart'));

// --- the source: saved words, hashes and ?open= links ---------------------------------------------------------
const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(astro|ts|mjs)$/.test(f) && !/\.test\.ts$/.test(f)) files.push(p); } };
walk(join(ROOT, 'src'));
const at = (file, src, index) => `${relative(ROOT, file)}:${src.slice(0, index).split('\n').length}`;
const found = { saved: new Map(), hash: new Map(), open: new Map(), go: new Map() };
const note = (kind, v, where) => { if (!found[kind].has(v)) found[kind].set(v, []); found[kind].get(v).push(where); };
const scan = (file, src, re, kind, pick = (m) => m[1]) => { for (const m of src.matchAll(re)) { const v = pick(m); if (v) note(kind, v, at(file, src, m.index)); } };
const RECORD_VARS = {
  [`${REC}/[patient].astro`]: ['here', 'recHere'],
  [`${REC}/[patient]/consents/[document].astro`]: ['base'],
  [`${REC}/[patient]/consents/index.astro`]: ['record'],
  [`${REC}/[patient]/sign/[visit].astro`]: ['record'],
  [`${REC}/new/index.astro`]: ['recordHref'],
};
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const rel = relative(ROOT, file);
  // The record page and the pieces it is drawn from (not the pages under a record: rx/, sign/, consents/ …).
  const inRecord = rel === `${REC}/[patient].astro` || rel.startsWith(`${REC}/_record/`);
  // Saved words the record libraries return: done('plan'), done(`plan-${to}`), saved: `rx:${id}`.
  if (rel === 'src/lib/record.ts' || rel === 'src/lib/record-extra.ts') {
    scan(file, src, /\bdone\(\s*(?:[^'`)]*\?\s*)?['`]([a-z]+)/g, 'saved');
    scan(file, src, /\bdone\([^)]*:\s*['`]([a-z]+)/g, 'saved');
    scan(file, src, /\bsaved:\s*['`]([a-z]+)/g, 'saved');
  }
  // ?saved= in a redirect to the record, and a record URL with a hash. Which variable holds the record's address
  // differs by file: the record page's `here`, a form's `action` in _record/, the consent pages' `base` / `record`.
  const recVars = RECORD_VARS[rel] ?? (rel.startsWith(`${REC}/_record/`) ? ['action'] : []);
  for (const v of recVars) {
    scan(file, src, new RegExp(`\\$\\{${v}\\}\\?(?:[^'"\`#\\s]*&)?saved=([a-z][a-z-]*)`, 'g'), 'saved');
    scan(file, src, new RegExp(`\\$\\{${v}\\}(?:\\?[^'"\`#\\s]*)?#([a-z][a-z0-9-]*)`, 'g'), 'hash');
  }
  scan(file, src, /\/patients\/\$\{[^}]+\}\/\?(?:[^'"`#\s]*&)?saved=([a-z][a-z-]*)/g, 'saved');
  // The forms queue and the intake: `${base}${r.patientId}/?saved=form`, `${base}/${id}/?saved=intake`.
  if (rel.startsWith(`${REC}/`)) scan(file, src, /\$\{\w+\}\/?\$\{[\w.()]+\}\/\?(?:[^'"`#\s]*&)?saved=([a-z][a-z-]*)/g, 'saved');
  // The record page's own redirects: to('saved=nothing', 'health'), to(`saved=${r.answers ? 'health' : 'birth'}`, 'health').
  if (rel === `${REC}/[patient].astro`) {
    for (const m of src.matchAll(/\bto\(\s*(?:`saved=([^`]*)`|'saved=([^']*)')/g)) {
      const w = m[1] ?? m[2];
      for (const x of w.includes('${') ? [...w.matchAll(/'([a-z][a-z-]*)'/g)].map((y) => y[1]) : [w]) note('saved', x, at(file, src, m.index));
    }
    scan(file, src, /\bto\([^;]*?,\s*'([a-z][a-z-]*)'\)/g, 'hash');
  }
  // A record URL with a hash: /patients/${id}/#x, /patients/${id}/?…#x, ${base}/${id}/#x (the intake page).
  scan(file, src, /\/patients\/\$\{[^}]+\}\/(?:\?[^'"`#\s]*)?#([a-z][a-z0-9-]*)/g, 'hash');
  scan(file, src, /\$\{\w+\}\/\$\{[\w.]+\}\/#([a-z][a-z0-9-]*)/g, 'hash');
  // A patient link with a hash added: patientHref(id) + '#treatment'.
  scan(file, src, /[Pp]atient\w*\([^)]*\)\s*\+\s*'#([a-z][a-z0-9-]*)'/g, 'hash');
  // import.astro: `/patients/${p.id}/${d.kind === 'visits' ? '#visits' : ''}`.
  scan(file, src, /\/patients\/\$\{[^}]+\}\/\$\{[^}]*'#([a-z][a-z0-9-]*)'/g, 'hash');
  // The record's own hash links and buttons.
  if (inRecord) {
    scan(file, src, /href(?:=|:\s*)['"]#([a-z][a-z0-9-]*)['"]/g, 'hash');
    scan(file, src, /data-rec-(?:go|show)="([a-z][a-z0-9-]*)"/g, 'go');
    scan(file, src, /\b(?:go|show):\s*'([a-z][a-z0-9-]*)'/g, 'go');
    scan(file, src, /\bhref=\{`#([a-z][a-z0-9-]*)`\}/g, 'hash');
  }
  // The Dashboard's visit panel: rec('health'), rec('vitals', 'vitals') → #health, ?open=vitals.
  scan(file, src, /\brec\('([a-z][a-z0-9-]*)'/g, 'hash');
  scan(file, src, /\brec\('[a-z-]+',\s*'([a-z]+)'\)/g, 'open');
  // ?open=x in a record link.
  if (/patients\//.test(src) || inRecord || /recordHref/.test(src)) scan(file, src, /[?&]open=([a-z]+)\b/g, 'open');
}

// The page's own saved words that land on the default tab on purpose (This visit's "No change": the strip is on Today).
const DEFAULT_OK = new Set(['checked', 'checked-today']);
for (const [w, where] of found.saved) {
  checked++;
  const s = Object.hasOwn(SAVED_TO, w) ? SAVED_TO[w] : recordSaved(w);
  if (s === null) { if (!DEFAULT_OK.has(w)) fail(`?saved=${w} (${where[0]}) has no section in SAVED_TO or SAVED_WORD`, w); }
  else resolves(`?saved=${w} (${where[0]})`, s);
}
for (const [h, where] of found.hash) hashResolves(`#${h} (${where.join(', ')})`, h);
for (const [g, where] of found.go) resolves(`data-rec-go / show "${g}" (${where[0]})`, g);
for (const [o, where] of found.open) { checked++; if (!Object.hasOwn(OPEN_PANEL, o)) fail(`?open=${o} (${where.join(', ')}) is not a panel the record opens (OPEN_PANEL)`, o); }

// --- the inbound links of spec §5 -----------------------------------------------------------------------------
const SPEC_HASHES = ['treatment-record', 'timeline', 'rx', 'letters', 'treatment', 'money', 'visits', 'consent', 'consent-paper', 'consent-forms', 'visit-consents',
  'patient-forms', 'details-card', 'chart-offer', 'chart', 'health', 'vitals', 'recall', 'treatment-done', 'treatment-lab', 'loas', 'payplans', 'files', 'notes', 'texts',
  'overview', 'this-visit', 'patient', 'rec-overview', 'rec-patient', 'rec-chart', 'rec-treatment-record'];
for (const h of SPEC_HASHES) hashResolves('an inbound hash of spec §5', h);

// --- the first tab, over every combination ---------------------------------------------------------------------
const sections = [...new Set([...Object.values(R.SECTION_OF), ...Object.values(X.SECTION_OF), 'overview', 'health', 'consent', 'chart', 'treatment'])];
const savedWords = [null, ...Object.keys(SAVED_TO), ...found.saved.keys(), 'rx:0f0f0f0f-1111-4222-8333-444444444444', 'files:3', 'vitals-crisis', 'plan-done', 'nonsense', 'constructor', '__proto__'];
const opens = [null, ...Object.keys(OPEN_PANEL)];
const visits = [null, 'today', 'ledger', 'other'];
let combos = 0;
const lost = new Map(); // a section landingSection gave that is no tab → [how often, the first combination]
for (const backTo of [null, ...sections]) for (const fromChart of [false, true]) for (const saved of savedWords) for (const openNow of opens) for (const visit of visits) {
  combos++;
  const s = landingSection({ backTo, fromChart, saved, openNow, visit });
  const t = tabOf(s);
  if (!t || !TAB_IDS.includes(t)) { const x = lost.get(s) ?? [0, { backTo, fromChart, saved, openNow, visit }]; x[0]++; lost.set(s, x); }
}
for (const [s, [n, first]] of lost) fail(`landingSection gave a section that is no tab, in ${n} of the combinations, first`, first, s);
// ?visit= by itself (today, another day's on the Treatment record, a future or cancelled one that is not, an unknown id).
for (const visit of visits) resolves(`?visit= (${visit ?? 'none or unknown'})`, landingSection({ backTo: null, fromChart: false, saved: null, openNow: null, visit }));

// --- the report -----------------------------------------------------------------------------------------------
const list = (m) => [...m.keys()].sort().join(' ');
console.log(`tabs: ${TABS.map((t) => `${t.id} (${t.label})`).join(' · ')}`);
console.log(`TAB_OF: ${Object.keys(TAB_OF).length} names`);
console.log(`from the source — saved words (${found.saved.size}): ${list(found.saved)}`);
console.log(`from the source — hashes (${found.hash.size}): ${list(found.hash)}`);
console.log(`from the source — data-rec-go / show (${found.go.size}): ${list(found.go)}`);
console.log(`from the source — ?open= (${found.open.size}): ${list(found.open)}`);
console.log(`${checked} names checked, ${combos} landing combinations`);
if (fails.length) {
  console.log(`\n${fails.length} did not resolve to one of the four tabs:`);
  for (const f of fails) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log('every name resolves to one of the four tabs');
