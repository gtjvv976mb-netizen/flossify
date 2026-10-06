// S2 check: every RECORD_INTENTS and EXTRA_INTENTS intent × the 4 back values.
//   save:    a panel intent is posted through its own panel, opened over each tab (so the page's script sets back and
//            the form's #hash); a card's own button (no back in the UI) is posted as written with a crafted back. It must
//            land on the tab (Chart & plan for ?treated=) with a saved line at the top of it, and ?back= in the address.
//   refused: every intent posted with a missing or wrong field and a back, the way the panel posts it (#<back>): a panel
//            intent comes back over that tab with its panel open and its sentence in it; a card's own intent comes back
//            to the card's tab with its sentence on screen. Nothing is written by a refusal (row counts before/after).
// All on "Back Test" (T-BACK), a patient made here. node backs.mjs [out.json]
import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
import pg from '/home/user/fl-simple/node_modules/pg/lib/index.js';
import { writeFileSync } from 'node:fs';
const BASE = `http://127.0.0.1:${process.env.PORT_ || 4470}`;
const OUT = process.argv[2] ?? '/tmp/fl-simple-scratch/s2/backs.json';
// A new patient each run (T-BACK-<n>), so every run starts from nothing.
const RUN = (process.env.RUN_ ?? String(Date.now() % 65536)).padStart(4, '0').slice(-4);
const BK = `7e57a1c0-0000-4000-8000-0000000b${Number(RUN).toString(16).padStart(4, '0')}`;
const URL_ = `${BASE}/c/session-road/patients/${BK}/`;
const TABS = ['overview', 'patient', 'chart', 'treatment-record'];
const db = new pg.Client({ host: '/var/run/postgresql', user: 'root', database: process.env.DB_ || 'flossify_simple' });
await db.connect();
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
await q(`delete from throttle where key like 'login:%' or key like 'record:%'`);
const C = `(select id from clinic where slug = 'session-road')`;
const OWNER = `(select id from staff where email = 'liwayway.domingo@example.com')`;
await q(`insert into patient (id, clinic_id, chart_no, first_name, last_name, birth_date, sex, phone, hmo_name, hmo_member_no, created_by)
  select $1, ${C}, 'T-BACK-' || $2, 'Back', 'Test', date '1985-06-02', 'male', null, 'Maxicare', 'MX-3001', ${OWNER}
  where not exists (select 1 from patient where id = $1)`, [BK, RUN]);
// What the refusals and the card buttons act on: clearance letters waiting, LOAs asked for (made through the panels below).
const counts = async () => (await q(`select (select count(*) from clinical_note where patient_id = $1) n, (select count(*) from treatment_plan_item where patient_id = $1) p,
  (select count(*) from vital_sign where patient_id = $1) v, (select count(*) from prescription where patient_id = $1) r, (select count(*) from clinical_letter where patient_id = $1) l,
  (select count(*) from hmo_loa where patient_id = $1) a, (select count(*) from payment_plan where patient_id = $1) pp, (select count(*) from lab_order where patient_id = $1) lab,
  (select count(*) from attachment where patient_id = $1) f, (select count(*) from procedure_done where patient_id = $1) d, (select count(*) from plan_adjustment where patient_id = $1) adj,
  (select count(*) from recall where patient_id = $1) rc`, [BK]))[0];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDlnNqdQAAAABJRU5ErkJggg==', 'base64');
const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const later = new Date(Date.now() + 8 * 3600e3 + 40 * 864e5).toISOString().slice(0, 10);

const STATE = () => {
  const vis = (el) => !!el && el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && el.getClientRects().length > 0;
  const sel = document.querySelector('[role="tab"][aria-selected="true"][id^="rec-rec-"]');
  const tab = sel ? sel.id.replace(/^rec-rec-|-tab$/g, '') : null;
  const shown = document.querySelector('[data-rec-panel]:not([hidden])');
  // The saved line: the callouts before the tab's first card (This visit, a pane, the chart's offer).
  const saved = [];
  for (const el of shown?.children ?? []) {
    if (el.matches('.rec-anchor')) continue;
    if (el.matches('.ws-callout, [data-ptr-words], .ptr-words') || el.querySelector?.(':scope > .ws-callout')) { if (vis(el)) saved.push(el.innerText.replace(/\s+/g, ' ').trim().slice(0, 110)); continue; }
    break;
  }
  const dlg = [...document.querySelectorAll('dialog[open]')];
  return {
    url: location.pathname.replace(/^.*\/patients\/[^/]+\//, '') + location.search + location.hash, tab, panels: [...document.querySelectorAll('[data-rec-panel]')].filter((p) => !p.hidden).map((p) => p.dataset.recPanel),
    saved, dialogs: dlg.map((d) => d.id), dialogBack: dlg.map((d) => { const f = d.querySelector('form:not([hidden]):not([data-plan-fdi]) input[name=back]')?.form; return f ? [f.querySelector('input[name=back]').value, new URL(f.action).hash] : null; }), dialogText: dlg.map((d) => [...d.querySelectorAll('.ws-callout')].filter(vis).map((c) => c.innerText.replace(/\s+/g, ' ').trim().slice(0, 90))).flat(),
    callouts: [...document.querySelectorAll('.ws-callout')].filter(vis).map((c) => c.innerText.replace(/\s+/g, ' ').trim().slice(0, 90)),
  };
};
const settle = async () => { await page.waitForLoadState('load'); await page.waitForTimeout(350); };
const open = async (tab) => { await page.goto(`${URL_}#${tab}`, { waitUntil: 'load' }); await page.waitForTimeout(250); };
const ids = async (sql) => (await q(sql, [BK])).map((r) => r.id);

// --- saves through the panels, each opened over each tab ---------------------------------------------------------------
// fill(): runs in the page with the open dialog; returns nothing. Values chosen so the save succeeds.
const PANEL_SAVES = [
  ['plan-add', 'rec-plan-add', (d) => { const s = d.querySelector('select[name=catalog_id]'); s.value = [...s.options].find((o) => o.value)?.value; s.dispatchEvent(new Event('change')); }],
  ['done-add', 'rec-done-add', (d) => { const f = d.querySelector('form[data-pick-form]'); f.querySelector('input[name=name]').value = 'Oral prophylaxis (test)'; }],
  ['lab-add', 'rec-lab-add', (d) => { d.querySelector('[name=lab]').value = 'Test Lab'; d.querySelector('[name=description]').value = 'PFM crown, 21'; }],
  ['note-add', 'rec-note-add', (d) => { d.querySelector('[name=complaint]').value = 'Checking the back of a save'; }],
  ['rx-add', 'rec-rx-add', (d) => { d.querySelector('[name=drug]').value = 'Amoxicillin'; d.querySelector('[name=sig]').value = '1 capsule every 8 hours for 7 days'; }],
  ['file-add', 'rec-file-add', null],
  ['recall-set', 'rec-recall-set', (d, x) => { d.querySelector('[name=due_on]').value = x.later; }],
  ['vitals-add', 'rec-vitals-add', (d, x) => { d.querySelector('[name=systolic]').value = x.tab === 'overview' ? '150' : '118'; d.querySelector('[name=diastolic]').value = x.tab === 'overview' ? '95' : '76'; }],
  ['letter-add', 'rec-letter-add', (d) => { d.querySelector('[name=diagnosis]').value = 'Tooth 36 restored'; }],
  ['letter-add(clearance)', 'rec-letter-add', (d) => { const f = d.querySelector('[data-letter-form]'); f.querySelector('[data-letter-kind-input]').value = 'clearance'; d.querySelector('[name=diagnosis]').value = 'Hypertension'; d.querySelector('[name=treatment]').value = 'Extraction of 38'; }],
  ['letter-answer', 'rec-letter-answer', (d, x) => { d.querySelector('[data-letter-answer-id]').value = x.letter; }],
  ['loa-add', 'rec-loa-add', (d) => { const s = d.querySelector('select[name=payor]'); s.value = [...s.options].find((o) => o.value)?.value; }],
  ['loa-add(second)', 'rec-loa-add', (d) => { const s = d.querySelector('select[name=payor]'); s.value = [...s.options].find((o) => o.value)?.value; }],
  ['loa-approve', 'rec-loa-approve', (d, x) => { d.querySelector('[data-loa-id]').value = x.loa; d.querySelector('[name=loa_number]').value = 'APP-' + x.tab; }],
  ['loa-deny', 'rec-loa-deny', (d, x) => { d.querySelector('[data-loa-id]').value = x.loa; d.querySelector('[name=reason]').value = 'Not covered'; }],
  ['payplan-add', 'rec-payplan-add', (d, x) => { d.querySelector('[name=title]').value = 'Braces ' + x.tab; d.querySelector('[name=total]').value = '30000'; d.querySelector('[name=down]').value = '0'; d.querySelector('[name=months]').value = '10'; }],
  ['adjust-add', 'rec-adjust-add', (d, x) => { d.querySelector('[data-adjust-plan]').value = x.plan; }],
];
const results = [];
const before = await counts();
for (const tab of TABS) {
  for (const [intent, panel, fill] of PANEL_SAVES) {
    await open(tab);
    // What the panel needs from earlier saves: a clearance letter waiting, an LOA asked for, a braces plan running.
    const x = { tab, later,
      letter: (await ids(`select id from clinical_letter where patient_id = $1 and kind = 'clearance' and answer is null order by created_at`))[0],
      loa: (await ids(`select id from hmo_loa where patient_id = $1 and status = 'requested' order by created_at`))[0],
      plan: (await ids(`select id from payment_plan where patient_id = $1 and kind = 'braces' and status = 'active' order by created_at`))[0] };
    const opened = await page.evaluate(({ panel }) => { window.ws.openPanel(panel, null); return document.getElementById(panel)?.open ?? false; }, { panel });
    if (!opened) { results.push({ kind: 'save', intent, tab, fail: ['panel did not open'] }); continue; }
    if (intent === 'file-add') await page.setInputFiles('#rec-file-add input[type=file]', { name: 'bitewing.png', mimeType: 'image/png', buffer: PNG });
    else await page.evaluate(({ panel, fill, x }) => { const d = document.getElementById(panel); new Function('d', 'x', `(${fill})(d, x)`)(d, x); }, { panel, fill: String(fill), x });
    const posted = await page.evaluate(({ panel }) => { const f = document.querySelector(`#${panel} form:not([hidden]):not([data-plan-fdi])`); return { back: f?.querySelector('input[name=back]')?.value ?? null, action: f?.getAttribute('action') ?? null }; }, { panel });
    await Promise.all([page.waitForNavigation(), page.evaluate(({ panel }) => { const f = document.querySelector(`#${panel} form:not([hidden]):not([data-plan-fdi])`); f.requestSubmit ? f.requestSubmit() : f.submit(); }, { panel })]);
    await settle();
    const got = await page.evaluate(STATE);
    const treated = /[?&]treated=/.test(got.url);
    const want = treated ? 'chart' : tab;
    const fail = [];
    if (posted.back !== tab) fail.push(`posted back=${posted.back}`);
    if (got.tab !== want) fail.push(`tab ${got.tab} ≠ ${want}`);
    if (!new RegExp(`[?&]back=${tab}(&|#|$)`).test(got.url)) fail.push(`no back=${tab} in ${got.url}`);
    if (!treated && !got.url.endsWith(`#${tab}`)) fail.push(`hash ${got.url}`);
    if (!got.saved.length && !(intent === 'vitals-add' && false)) fail.push('no saved line');
    if (got.dialogs.length) fail.push(`dialog open ${got.dialogs}`);
    results.push({ kind: 'save', intent, tab, posted, got, fail });
  }
}

// --- a card's own buttons: posted as written, with a crafted back (the UI sends none) ----------------------------------
const CARD_SAVES = [
  ['plan-status', async () => ({ item: (await ids(`select id from treatment_plan_item where patient_id = $1 and status in ('planned', 'accepted') order by created_at`))[0], to: 'accepted' })],
  ['plan-remove', async () => ({ item: (await ids(`select id from treatment_plan_item where patient_id = $1 and status in ('planned', 'accepted') order by created_at desc`))[0] })],
  ['lab-next', async () => ({ lab: (await ids(`select id from lab_order where patient_id = $1 and status = 'ordered' order by created_at`))[0], to: 'sent' })],
  ['file-remove', async () => ({ file: (await ids(`select id from attachment where patient_id = $1 and removed_at is null order by created_at`))[0] })],
  ['recall-done', async () => ({})],
  ['recall-set', async () => ({ months: '6' })],
  ['recall-clear', async () => ({})],
  ['loa-cancel', async () => ({ loa: (await ids(`select id from hmo_loa where patient_id = $1 and status in ('requested', 'approved') order by created_at`))[0] })],
  ['payplan-stop', async () => ({ plan: (await ids(`select id from payment_plan where patient_id = $1 and status = 'active' order by created_at desc`))[0] })],
];
const post = (fields, hash) => page.evaluate(({ fields, hash, url }) => {
  const f = document.createElement('form'); f.method = 'post'; f.action = url + (hash ? `#${hash}` : '');
  const add = (k, v) => { const i = document.createElement('input'); i.type = 'hidden'; i.name = k; i.value = v; f.append(i); };
  add('_csrf', document.querySelector('input[name=_csrf]').value);
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null) add(k, v);
  document.body.append(f); f.submit();
}, { fields, hash, url: URL_ });
for (const tab of TABS) {
  for (const [intent, make] of CARD_SAVES) {
    await open(tab);
    const f = await make();
    await Promise.all([page.waitForNavigation(), post({ intent, back: tab, ...f }, tab)]);
    await settle();
    const got = await page.evaluate(STATE);
    const fail = [];
    if (got.tab !== tab) fail.push(`tab ${got.tab} ≠ ${tab}`);
    if (!got.saved.length) fail.push('no saved line');
    results.push({ kind: 'save (card, crafted back)', intent, tab, fields: f, got, fail });
  }
}
const middle = await counts();

// --- refused, every intent × every back ------------------------------------------------------------------------------
const PANEL_OF = { 'plan-add': 'rec-plan-add', 'done-add': 'rec-done-add', 'lab-add': 'rec-lab-add', 'note-add': 'rec-note-add', 'rx-add': 'rec-rx-add', 'file-add': 'rec-file-add',
  'recall-set': 'rec-recall-set', 'vitals-add': 'rec-vitals-add', 'letter-add': 'rec-letter-add', 'letter-answer': 'rec-letter-answer', 'loa-add': 'rec-loa-add', 'loa-approve': 'rec-loa-approve',
  'loa-deny': 'rec-loa-deny', 'payplan-add': 'rec-payplan-add', 'adjust-add': 'rec-adjust-add', 'plan-status': 'rec-done-add' };
const CARD_TAB = { 'plan-remove': 'chart', 'lab-next': 'chart', 'file-remove': 'chart', 'loa-cancel': 'chart', 'payplan-stop': 'chart', 'chart-apply': 'chart' };
const REFUSE = {
  'plan-add': {}, 'done-add': {}, 'lab-add': { lab: '' }, 'note-add': {}, 'rx-add': {}, 'file-add': { kind: 'xray_periapical' }, 'recall-set': { months: '99' },
  'vitals-add': { systolic: '400', diastolic: '80' }, 'letter-add': { kind: 'nonsense' }, 'letter-answer': { letter: '', answer: 'nonsense' }, 'loa-add': { payor: '' },
  'loa-approve': { loa: '' }, 'loa-deny': { loa: '' }, 'payplan-add': { title: '' }, 'adjust-add': { plan: '' }, 'plan-status': { item: '', to: 'done' },
  'plan-remove': { item: '' }, 'lab-next': { lab: '' }, 'file-remove': { file: '' }, 'loa-cancel': { loa: '' }, 'payplan-stop': { plan: '' }, 'chart-apply': { treated: '' },
};
for (const tab of TABS) {
  for (const [intent, fields] of Object.entries(REFUSE)) {
    await open(tab);
    await Promise.all([page.waitForNavigation(), post({ intent, back: tab, ...fields }, tab)]);
    await settle();
    const got = await page.evaluate(STATE);
    const panel = PANEL_OF[intent];
    const fail = [];
    if (panel) {
      if (got.tab !== tab) fail.push(`tab ${got.tab} ≠ ${tab}`);
      if (!got.dialogs.includes(panel)) fail.push(`panel ${panel} not open (${got.dialogs})`);
      if (!got.dialogText.length) fail.push('no sentence in the panel');
      const fb = got.dialogBack[got.dialogs.indexOf(panel)];
      if (!fb || fb[0] !== tab || fb[1] !== `#${tab}`) fail.push(`reopened form back ${JSON.stringify(fb)}`);
    } else {
      if (got.tab !== CARD_TAB[intent]) fail.push(`tab ${got.tab} ≠ ${CARD_TAB[intent]}`);
      if (!got.callouts.length) fail.push('no sentence on screen');
    }
    results.push({ kind: 'refused', intent, tab, got, fail });
  }
}
const after = await counts();
await browser.close(); await db.end();

writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), errors, before, middle, after, results }, null, 1));
const pad = (s, n) => String(s ?? '').padEnd(n).slice(0, n);
let bad = 0;
for (const r of results) {
  if (r.fail.length) bad++;
  console.log(`${pad(r.kind, 26)} ${pad(r.intent, 22)} ${pad(r.tab, 17)} → ${pad(r.got?.tab, 17)} ${pad((r.got?.dialogs ?? []).join(','), 18)} ${pad((r.got?.saved?.[0] ?? r.got?.dialogText?.[0] ?? r.got?.callouts?.[0] ?? ''), 70)} ${r.fail.length ? 'FAIL ' + r.fail.join('; ') : 'ok'}`);
}
console.log(`\nrows before ${JSON.stringify(before)}\nafter saves ${JSON.stringify(middle)}\nafter refusals ${JSON.stringify(after)} (${JSON.stringify(middle) === JSON.stringify(after) ? 'nothing written by a refusal' : 'A REFUSAL WROTE SOMETHING'})`);
console.log(`page errors: ${errors.length ? errors.join(' | ') : 'none'}`);
console.log(`${results.length} cases, ${bad} failing`);
if (bad || errors.length || JSON.stringify(middle) !== JSON.stringify(after)) process.exit(1);
