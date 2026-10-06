// S2 fix 2 check: every record post refused by the rate limit ("Too many saves at once") says so on screen, where the
// page lands: a panel's post reopens its panel over the tab it was opened on (or, posted with no back, over its own
// section's tab); a card's own button lands on its card's tab with the sentence in the card, under the stuck row.
// Nothing is written. Built from ../s2fix/landing.mjs (the fixture and the panel fills). node slowall.mjs <w> <h>
// (was: after every save the saved line is on screen where the page lands (not under the stuck row, not above
// or below the viewport, and elementFromPoint hits it), and there is exactly one. After a card's own refused button,
// its sentence is on screen the same way. On a fresh patient (T-LAND-<n>), at one width. node landing.mjs <w> <h>
//   A  panel saves, each panel opened over each tab (the page's script sets back): the line at the top of that tab, or
//      at the top of the chart's offer for ?treated=.
//   B  panel saves posted without a back (a page whose script did not aim it): the line inside the card it lands on.
//   C  a card's own buttons, clicked as the page draws them (no back): the line inside that card.
//   D  a card's own buttons refused (crafted: a missing id): the sentence inside that card.
import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
import pg from '/home/user/fl-simple/node_modules/pg/lib/index.js';
const W = +(process.argv[2] || 1440), H = +(process.argv[3] || 900);
const BASE = `http://127.0.0.1:${process.env.PORT_ || 4470}`;
const RUN = String(Date.now() % 65536);
const PID = `7e57a1c0-0000-4000-8000-0000000d${Number(RUN).toString(16).padStart(4, '0')}`;
const URL_ = `${BASE}/c/session-road/patients/${PID}/`;
const TABS = ['overview', 'patient', 'chart', 'treatment-record'];
const db = new pg.Client({ host: '/var/run/postgresql', user: 'root', database: 'flossify_simple' }); await db.connect();
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
await q(`delete from throttle where key like 'login:%' or key like 'record:%'`);
const C = `(select id from clinic where slug = 'session-road')`;
const OWNER = `(select id from staff where email = 'liwayway.domingo@example.com')`;
await q(`insert into patient (id, clinic_id, chart_no, first_name, last_name, birth_date, sex, hmo_name, hmo_member_no, created_by)
  select $1, ${C}, 'T-SLOW-' || $2, 'Land', 'Test', date '1981-03-04', 'female', 'Maxicare', 'MX-4001', ${OWNER}`, [PID, RUN]);
const plan = (await q(`insert into treatment_plan (clinic_id, patient_id, name) select ${C}, $1, 'Plan' returning id`, [PID]))[0].id;
for (const [n, fdi] of [['Composite filling', 16], ['Porcelain crown', 26], ['Extraction', 48], ['Root canal treatment', 46], ['Sealant', 17], ['Composite filling', 36]])
  await q(`insert into treatment_plan_item (clinic_id, plan_id, patient_id, name, fdi, price) select ${C}, $1, $2, $3, $4, 1000`, [plan, PID, n, fdi]);
// A treatment the chart could show: an extraction from the fee guide (chart_effect missing) on 38.
const EXTRACTION = (await q(`insert into treatment_plan_item (clinic_id, plan_id, patient_id, name, fdi, price, catalog_id)
  select ${C}, $1, $2, 'Extraction', 38, 800, (select id from procedure_catalog where clinic_id = ${C} and code = 'extraction') returning id`, [plan, PID]))[0].id;
for (const d of ['PFM crown 26', 'Night guard']) await q(`insert into lab_order (clinic_id, patient_id, lab_name, description) select ${C}, $1, 'Test Lab', $2`, [PID, d]);
const ids = async (sql) => (await q(sql, [PID])).map((r) => r.id);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|from origin 'null'/.test(m.text())) errors.push(`console: ${m.text()}`); });
page.on('dialog', (d) => d.accept());
await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDlnNqdQAAAABJRU5ErkJggg==', 'base64');
const later = new Date(Date.now() + 8 * 3600e3 + 40 * 864e5).toISOString().slice(0, 10);

/** Where the page stands: its tab, the stuck row's bottom, every saved line (and, with `words`, the alert sentences
 *  holding them) with where it is and whether it can be seen and hit. */
const SEEN = (words) => {
  const topBar = document.querySelector('[data-ws-top]')?.getBoundingClientRect();
  const bar = document.querySelector('[data-rec-bar]')?.getBoundingClientRect();
  const cover = Math.max(topBar?.bottom ?? 0, bar?.bottom ?? 0);
  const vis = (el) => el.getClientRects().length > 0 && !el.closest('[hidden]') && !el.closest('dialog');
  const one = (el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(Math.min(innerWidth - 4, r.left + 24), r.top + Math.min(r.height / 2, 22));
    const chain = []; for (let e = hit; e && chain.length < 4; e = e.parentElement) chain.push(e.tagName + (e.id ? '#' + e.id : '') + '.' + [...e.classList].slice(0, 2).join('.'));
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), on: r.top >= cover - 1 && r.bottom <= innerHeight + 1, hit: !!hit && el.contains(hit), chain: !!hit && el.contains(hit) ? undefined : chain.join(' < '),
      where: el.parentElement?.closest('[id]')?.id ?? null, text: el.innerText.replace(/\s+/g, ' ').trim().slice(0, 70) };
  };
  const all = [...document.querySelectorAll('[data-rec-saved]')];
  const sentences = words === undefined ? [] : [...document.querySelectorAll('.ws-callout[data-tone="alert"], .ws-callout[role="alert"]')].filter(vis).filter((c) => !words || c.innerText.includes(words)).map(one);
  const sel = document.querySelector('[role=tab][aria-selected=true]');
  return { url: location.search + location.hash, tab: sel?.id.replace(/^rec-rec-|-tab$/g, '') ?? null, cover: Math.round(cover), n: all.length, lines: all.filter(vis).map(one), sentences, sw: document.documentElement.scrollWidth, open: [...document.querySelectorAll('dialog[open]')].map((d) => d.id) };
};
const settle = async () => { await page.waitForLoadState('load'); await page.waitForTimeout(450); };
// Headless Chromium hit-tests nothing but <html> for a moment after a confirm() it accepted: look again before judging.
const seen = async (words) => { let g = await page.evaluate(SEEN, words); for (let i = 0; i < 3 && [...g.lines, ...g.sentences].some((x) => !x.hit); i++) { await page.waitForTimeout(500); g = await page.evaluate(SEEN, words); } return g; };
const open = async (hash) => { await page.goto('about:blank'); await page.goto(`${URL_}#${hash}`, { waitUntil: 'load' }); await page.waitForTimeout(300); };
const results = [];
const judge = (kind, what, from, got, want, sentence = false) => {
  const fail = [];
  const xs = sentence ? got.sentences : got.lines;
  if (!sentence && got.n !== 1) fail.push(`${got.n} saved lines`);
  if (!xs.length) fail.push(sentence ? 'no sentence' : 'no saved line drawn');
  else {
    const x = xs[0];
    if (!x.on) fail.push(`off screen ${x.top}–${x.bottom} (row ends ${got.cover}, screen ${H})`);
    if (!x.hit) fail.push(`not hit (${x.chain})`);
    if (want && x.where !== want) fail.push(`in #${x.where} ≠ #${want}`);
  }
  if (got.sw > W) fail.push(`sideways ${got.sw}`);
  results.push({ kind, what, from, got, fail });
};

// --- A: panel saves over each tab ---------------------------------------------------------------------------------
const PANEL_SAVES = [
  ['plan-add', 'rec-plan-add', (d) => { const s = d.querySelector('select[name=catalog_id]'); s.value = [...s.options].find((o) => o.value)?.value; s.dispatchEvent(new Event('change')); }, 'treatment'],
  ['done-add', 'rec-done-add', (d) => { const f = d.querySelector('form[data-pick-form]'); f.querySelector('input[name=name]').value = 'Oral prophylaxis (test)'; }, 'treatment-done'],
  ['done-add(offer)', 'rec-done-add', (d) => { const f = d.querySelector('form[data-pick-form]'); const s = f.querySelector('select[name=catalog_id]'); s.value = [...s.options].find((o) => /^Extraction/.test(o.textContent.trim()))?.value; s.dispatchEvent(new Event('change')); const t = f.querySelector('input[type=radio][value="28"]'); t.checked = true; t.dispatchEvent(new Event('change', { bubbles: true })); }, 'chart-offer'],
  ['lab-add', 'rec-lab-add', (d) => { d.querySelector('[name=lab]').value = 'Test Lab'; d.querySelector('[name=description]').value = 'PFM crown, 21'; }, 'treatment-lab'],
  ['note-add', 'rec-note-add', (d) => { d.querySelector('[name=complaint]').value = 'Checking where a save lands'; }, 'notes'],
  ['rx-add', 'rec-rx-add', (d) => { d.querySelector('[name=drug]').value = 'Amoxicillin'; d.querySelector('[name=sig]').value = '1 capsule every 8 hours for 7 days'; }, 'rx'],
  ['file-add', 'rec-file-add', null, 'files'],
  ['recall-set', 'rec-recall-set', (d, x) => { d.querySelector('[name=due_on]').value = x.later; }, 'recall'],
  ['vitals-add', 'rec-vitals-add', (d, x) => { d.querySelector('[name=systolic]').value = x.high ? '165' : '118'; d.querySelector('[name=diastolic]').value = x.high ? '102' : '76'; }, 'vitals'],
  ['letter-add', 'rec-letter-add', (d) => { d.querySelector('[name=diagnosis]').value = 'Tooth 36 restored'; }, 'letters'],
  ['letter-add(clearance)', 'rec-letter-add', (d) => { const f = d.querySelector('[data-letter-form]'); f.querySelector('[data-letter-kind-input]').value = 'clearance'; d.querySelector('[name=diagnosis]').value = 'Hypertension'; d.querySelector('[name=treatment]').value = 'Extraction of 38'; }, 'letters'],
  ['letter-answer', 'rec-letter-answer', (d, x) => { d.querySelector('[data-letter-answer-id]').value = x.letter; }, 'letters'],
  ['loa-add', 'rec-loa-add', (d) => { const s = d.querySelector('select[name=payor]'); s.value = [...s.options].find((o) => o.value)?.value; }, 'loas'],
  ['loa-add(2)', 'rec-loa-add', (d) => { const s = d.querySelector('select[name=payor]'); s.value = [...s.options].find((o) => o.value)?.value; }, 'loas'],
  ['loa-add(3)', 'rec-loa-add', (d) => { const s = d.querySelector('select[name=payor]'); s.value = [...s.options].find((o) => o.value)?.value; }, 'loas'],
  ['loa-approve', 'rec-loa-approve', (d, x) => { d.querySelector('[data-loa-id]').value = x.loa; d.querySelector('[name=loa_number]').value = 'APP-' + x.tab; }, 'loas'],
  ['loa-deny', 'rec-loa-deny', (d, x) => { d.querySelector('[data-loa-id]').value = x.loa; d.querySelector('[name=reason]').value = 'Not covered'; }, 'loas'],
  ['payplan-add', 'rec-payplan-add', (d, x) => { d.querySelector('[name=title]').value = 'Braces ' + x.tab; d.querySelector('[name=total]').value = '30000'; d.querySelector('[name=down]').value = '0'; d.querySelector('[name=months]').value = '10'; }, 'payplans'],
  ['adjust-add', 'rec-adjust-add', (d, x) => { d.querySelector('[data-adjust-plan]').value = x.plan; }, 'payplans'],
];
const context = async (tab) => ({ tab, later, high: tab === 'overview',
  letter: (await ids(`select id from clinical_letter where patient_id = $1 and kind = 'clearance' and answer is null order by created_at`))[0],
  loa: (await ids(`select id from hmo_loa where patient_id = $1 and status = 'requested' order by created_at`))[0],
  plan: (await ids(`select id from payment_plan where patient_id = $1 and kind = 'braces' and status = 'active' order by created_at`))[0] });
const fillAndSend = async (panel, fill, x, noBack) => {
  if (panel === 'rec-file-add') await page.setInputFiles('#rec-file-add input[type=file]', { name: 'bitewing.png', mimeType: 'image/png', buffer: PNG });
  else await page.evaluate(({ panel, fill, x }) => { const d = document.getElementById(panel); new Function('d', 'x', `(${fill})(d, x)`)(d, x); }, { panel, fill: String(fill), x });
  await Promise.all([page.waitForNavigation(), page.evaluate(({ panel, noBack }) => {
    const f = document.querySelector(`#${panel} form:not([hidden]):not([data-plan-fdi])`);
    if (noBack) f.querySelectorAll('input[name=back]').forEach((b) => { b.value = ''; });
    f.requestSubmit ? f.requestSubmit() : f.submit();
  }, { panel, noBack })]);
  await settle();
};

const OWNER_ID = (await q(`select id from staff where email = 'liwayway.domingo@example.com'`))[0].id;
const KEY = 'record:s:' + OWNER_ID;
const choke = () => q(`insert into throttle (key, hits, window_start) values ($1, 100000, now()) on conflict (key) do update set hits = 100000, window_start = now()`, [KEY]);
const free = () => q(`delete from throttle where key = $1`, [KEY]);
const WORDS = 'Too many saves at once';
const TAB_OF = { treatment: 'chart', 'treatment-lab': 'chart', 'treatment-done': 'chart', loas: 'chart', payplans: 'chart', files: 'chart', chart: 'chart', 'chart-offer': 'chart',
  notes: 'treatment-record', rx: 'treatment-record', letters: 'treatment-record', overview: 'overview', recall: 'overview', health: 'patient', vitals: 'patient' };
const SECTION = { 'plan-add': 'treatment', 'done-add': 'treatment', 'lab-add': 'treatment', 'note-add': 'notes', 'rx-add': 'rx', 'file-add': 'files', 'recall-set': 'overview',
  'vitals-add': 'health', 'letter-add': 'rx', 'letter-answer': 'rx', 'loa-add': 'treatment', 'loa-approve': 'treatment', 'loa-deny': 'treatment', 'payplan-add': 'treatment', 'adjust-add': 'treatment' };
/** Every row's count, before and after: a refused post writes nothing. */
const COUNT = async () => (await q(`select
  (select count(*) from treatment_plan_item where patient_id = $1) || '/' || (select count(*) from treatment_plan_item where patient_id = $1 and status = 'planned') || ' plan',
  (select count(*) from procedure_done where patient_id = $1) || ' done', (select count(*) from lab_order where patient_id = $1) || '/' || (select string_agg(status, ',' order by created_at) from lab_order where patient_id = $1) || ' lab',
  (select count(*) from clinical_note where patient_id = $1) || ' notes', (select count(*) from prescription where patient_id = $1) || ' rx',
  (select count(*) from attachment where patient_id = $1 and removed_at is null) || ' files', (select count(*) from vital_sign where patient_id = $1) || ' bp',
  (select count(*) from clinical_letter where patient_id = $1) || ' letters', (select string_agg(status, ',' order by created_at) from hmo_loa where patient_id = $1) || ' loa',
  (select string_agg(status, ',' order by created_at) from payment_plan where patient_id = $1) || ' plans', (select count(*) from plan_adjustment a join payment_plan p on p.id = a.plan_id where p.patient_id = $1) || ' adj',
  (select coalesce(string_agg(due_on::text || ':' || coalesce(completed_at::text, '-'), ','), 'none') from recall where patient_id = $1) || ' recall',
  (select count(*) from tooth_state where patient_id = $1) || ' teeth'`, [PID]))[0];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** The refusal: its sentences, shown or not, in a panel or on the page; the page's stuck row. */
const SAW = (words) => {
  const topBar = document.querySelector('[data-ws-top]')?.getBoundingClientRect();
  const bar = document.querySelector('[data-rec-bar]')?.getBoundingClientRect();
  const cover = Math.max(topBar?.bottom ?? 0, bar?.bottom ?? 0);
  const all = [...document.querySelectorAll('.ws-callout')].filter((c) => c.innerText.includes(words));
  const shown = all.filter((c) => c.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && c.getClientRects().length && !c.closest('[hidden]'));
  const one = (c) => {
    const d = c.closest('dialog');
    const r = c.getBoundingClientRect();
    const hit = document.elementFromPoint(Math.min(innerWidth - 4, r.left + 24), r.top + Math.min(r.height / 2, 20));
    const top = d ? d.getBoundingClientRect().top : cover;
    return { dialog: d?.id ?? null, where: d ? d.id : (c.parentElement?.closest('[id]:not(.rec-anchor)')?.id ?? null), top: Math.round(r.top), bottom: Math.round(r.bottom),
      on: r.top >= top - 1 && r.bottom <= innerHeight + 1, hit: !!hit && c.contains(hit) };
  };
  const sel = document.querySelector('[role=tab][aria-selected=true][id^="rec-rec-"]');
  return { url: location.search + location.hash, tab: sel?.id.replace(/^rec-rec-|-tab$/g, '') ?? null, cover: Math.round(cover), drawn: all.length, shown: shown.map(one),
    open: [...document.querySelectorAll('dialog[open]')].map((d) => d.id), sw: document.documentElement.scrollWidth };
};
const saw = async () => { let g = await page.evaluate(SAW, WORDS); for (let i = 0; i < 3 && g.shown.some((x) => !x.hit); i++) { await page.waitForTimeout(500); g = await page.evaluate(SAW, WORDS); } return g; };
const verdict = (kind, what, from, got, want, before, after) => {
  const fail = [];
  if (got.shown.length !== 1) fail.push(`${got.shown.length} shown of ${got.drawn}`);
  const x = got.shown[0];
  if (x) {
    if (!x.on) fail.push(`off screen ${x.top}–${x.bottom} (row ends ${got.cover}, screen ${H})`);
    if (!x.hit) fail.push('not hit');
    if (want.where && x.where !== want.where) fail.push(`in #${x.where} ≠ #${want.where}`);
  }
  if (want.tab && got.tab !== want.tab) fail.push(`tab ${got.tab} ≠ ${want.tab}`);
  if (!same(before, after)) fail.push(`wrote: ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
  if (got.sw > W) fail.push(`sideways ${got.sw}`);
  results.push({ kind, what, from, got, x, fail });
};

// --- set up what the cards' buttons need (not refused): a file, an LOA, a braces plan, a clearance letter, a check-up
for (const [intent, panel, fill] of PANEL_SAVES.filter(([i]) => ['file-add', 'loa-add', 'payplan-add', 'letter-add(clearance)', 'recall-set'].includes(i))) {
  await open('overview');
  const x = await context('overview');
  await page.evaluate((panel) => window.ws.openPanel(panel, null), panel);
  await fillAndSend(panel, fill, { ...x, high: false }, false);
}
// A treatment the chart could show, for the offer's Update the chart: Mark done on the extraction, not refused.
await open('chart');
{ const b = page.locator(`[data-rec-panel]:not([hidden]) form:has(input[name=to][value=done]):has(input[name=item][value="${EXTRACTION}"]) button`).first();
  await b.scrollIntoViewIfNeeded(); await Promise.all([page.waitForNavigation(), b.click()]); await settle(); }
const offerUrl = await page.evaluate(() => location.pathname + location.search + location.hash);

// --- A: panel posts refused, each panel opened over each tab: the panel again, over that tab --------------------------
for (const tab of TABS) {
  for (const [intent, panel, fill] of PANEL_SAVES.filter(([i]) => !/\(\d\)/.test(i))) {
    await open(tab);
    const x = await context(tab);
    const opened = await page.evaluate((panel) => { window.ws.openPanel(panel, null); return document.getElementById(panel)?.open ?? false; }, panel);
    if (!opened) { results.push({ kind: 'A panel, back', what: intent, from: tab, got: {}, fail: ['panel did not open'] }); continue; }
    const before = await COUNT();
    await choke();
    await fillAndSend(panel, fill, x, false);
    await free();
    verdict('A panel, back', intent, tab, await saw(), { tab, where: panel }, before, await COUNT());
  }
}
// --- B: the same posted with no back: the panel again, over its own section's tab ---------------------------------------
for (const [intent, panel, fill] of PANEL_SAVES.filter(([i]) => !/\(\d\)/.test(i))) {
  await open('overview');
  const x = await context('overview');
  await page.evaluate((panel) => window.ws.openPanel(panel, null), panel);
  const before = await COUNT();
  await choke();
  await fillAndSend(panel, fill, { ...x, high: false }, true);
  await free();
  const base = intent.replace(/\(.*\)$/, '');
  verdict('B panel, no back', intent, '-', await saw(), { tab: TAB_OF[SECTION[base]], where: panel }, before, await COUNT());
}
// --- C: a card's own buttons, clicked as drawn: the card's tab, the sentence in the card -------------------------------
const CARDS = [
  ['plan: patient agreed', 'chart', 'form:has(input[name=to][value=accepted]) button', 'treatment'],
  ['plan: declined', 'chart', 'form:has(input[name=to][value=declined]) button', 'treatment'],
  ['plan: take off', 'chart', 'form:has(input[name=intent][value=plan-remove]) button', 'treatment'],
  ['plan: mark done', 'chart', 'form:has(input[name=to][value=done]) button', 'treatment'],
  ['lab: next step', 'chart', 'form:has(input[name=intent][value=lab-next]):not(:has(input[name=to][value=remake])) button', 'treatment-lab'],
  ['lab: remake', 'chart', 'form:has(input[name=intent][value=lab-next]):has(input[name=to][value=remake]) button', 'treatment-lab'],
  ['file: remove', 'chart', 'form:has(input[name=intent][value=file-remove]) button', 'files'],
  ['loa: cancel', 'chart', 'form:has(input[name=intent][value=loa-cancel]) button', 'loas'],
  ['payplan: stop', 'chart', 'form:has(input[name=intent][value=payplan-stop]) button', 'payplans'],
  // S4: Came in and Clear are in the check-up's panel (Change); refused, the sentence is in the card on Today.
  ['recall: came in (panel)', 'overview', 'form:has(input[name=intent][value=recall-done]) button', 'recall', 'rec-recall-set'],
  ['recall: clear (panel)', 'overview', 'form:has(input[name=intent][value=recall-clear]) button', 'recall', 'rec-recall-set'],
  ['recall: in 6 months', 'overview', 'form:has(input[name=intent][value=recall-set]):has(input[name=months][value="6"]) button', 'rec-recall-set'],
];
// A lab case back from the lab (Needs a remake is offered then); no check-up set for the last case (In 6 months).
await q(`update lab_order set status = 'received', received_on = current_date where id = (select id from lab_order where patient_id = $1 order by created_at limit 1)`, [PID]);
for (const [what, tab, sel, card, panel] of CARDS) {
  if (what === 'recall: in 6 months') await q(`delete from recall where patient_id = $1`, [PID]);
  for (const from of [tab, ...TABS.filter((t) => t !== tab)].slice(0, 2)) {
    // From the card's own tab (as drawn), and from another tab's address (the card's form still posts its own #hash).
    await open(tab);
    if (panel) { const o = page.locator(`[data-rec-panel]:not([hidden]) [data-ws-open="${panel}"]`).first(); if (await o.count()) { await o.scrollIntoViewIfNeeded(); await o.click(); await page.waitForTimeout(250); } }
    const btn = panel ? page.locator(`dialog#${panel}[open] ${sel}`).first() : page.locator(`[data-rec-panel]:not([hidden]) ${sel}`).first();
    if (!(await btn.count())) { results.push({ kind: 'C card', what, from, got: {}, fail: ['no button'] }); continue; }
    if (from !== tab) await page.evaluate((t) => history.replaceState(null, '', `${location.pathname}#${t}`), from);
    await btn.scrollIntoViewIfNeeded(); await page.waitForTimeout(100);
    const before = await COUNT();
    await choke();
    await Promise.all([page.waitForNavigation(), btn.click()]); await settle();
    await free();
    verdict('C card', what, from, await saw(), { tab: card.startsWith('rec-') ? 'overview' : TAB_OF[card], where: card }, before, await COUNT());
  }
}
// --- D: the chart's offer: Update the chart refused -------------------------------------------------------------------
{
  await page.goto('about:blank'); await page.goto(BASE + offerUrl, { waitUntil: 'load' }); await page.waitForTimeout(300);
  const up = page.locator('[data-chart-offer-form] button').first();
  if (!(await up.count())) results.push({ kind: 'D offer', what: 'update the chart', from: 'chart', got: {}, fail: ['no offer'] });
  else {
    const before = await COUNT();
    await choke();
    await Promise.all([page.waitForNavigation(), up.click()]); await settle();
    await free();
    verdict('D offer', 'update the chart', 'chart', await saw(), { tab: 'chart', where: 'chart-offer' }, before, await COUNT());
  }
}
await free();
await browser.close(); await db.end();

const pad = (s, n) => String(s ?? '').padEnd(n).slice(0, n);
let bad = 0;
for (const r of results) {
  if (r.fail.length) bad++;
  const x = r.x;
  console.log(`${W} ${pad(r.kind, 16)} ${pad(r.what, 24)} ${pad(r.from, 16)} → ${pad(r.got.tab, 16)} ${pad(r.got.url?.replace(/[0-9a-f-]{36}/g, '…'), 40)} ${pad(x ? `#${x.where} ${x.top}–${x.bottom}` : '', 30)} ${r.fail.length ? 'FAIL ' + r.fail.join('; ') : 'ok'}`);
}
console.log(`page errors: ${errors.length ? errors.join(' | ') : 'none'}`);
console.log(`${W}x${H}: ${results.length} cases, ${bad} failing`);
if (bad || errors.length) process.exit(1);
