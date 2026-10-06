// S2 fix check: after every save the saved line is on screen where the page lands (not under the stuck row, not above
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
  select $1, ${C}, 'T-LAND-' || $2, 'Land', 'Test', date '1981-03-04', 'female', 'Maxicare', 'MX-4001', ${OWNER}`, [PID, RUN]);
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
for (const tab of TABS) {
  for (const [intent, panel, fill] of PANEL_SAVES) {
    await open(tab);
    const x = await context(tab);
    const opened = await page.evaluate((panel) => { window.ws.openPanel(panel, null); return document.getElementById(panel)?.open ?? false; }, panel);
    if (!opened) { results.push({ kind: 'A panel', what: intent, from: tab, got: {}, fail: ['panel did not open'] }); continue; }
    await fillAndSend(panel, fill, x, false);
    const got = await seen();
    const treated = /[?&]treated=/.test(got.url);
    judge('A panel, back', intent, tab, got, treated ? 'chart-offer' : `rec-${tab}`);
  }
}
// --- B: the same panels posted without a back ---------------------------------------------------------------------
for (const [intent, panel, fill, card] of PANEL_SAVES) {
  await open('overview');
  const x = await context('overview');
  await page.evaluate((panel) => window.ws.openPanel(panel, null), panel);
  await fillAndSend(panel, fill, { ...x, high: false }, true);
  const got = await seen();
  judge('B panel, no back', intent, '-', got, /[?&]treated=/.test(got.url) ? 'chart-offer' : card);
}
// --- C: a card's own buttons, as drawn -------------------------------------------------------------------------------
const CARDS = [
  ['plan: patient agreed', 'chart', 'form:has(input[name=to][value=accepted]) button', 'treatment'],
  ['plan: back to planned', 'chart', 'form:has(input[name=to][value=planned]) button', 'treatment'],
  ['plan: declined', 'chart', 'form:has(input[name=to][value=declined]) button', 'treatment'],
  ['plan: take off', 'chart', 'form:has(input[name=intent][value=plan-remove]) button', 'treatment'],
  ['plan: mark done', 'chart', 'form:has(input[name=to][value=done]):not(:has(input[name=item][value="EXTRACTION"])) button', 'treatment'],
  ['plan: mark done (an offer)', 'chart', 'form:has(input[name=to][value=done]):has(input[name=item][value="EXTRACTION"]) button', 'chart-offer'],
  ['lab: next step', 'chart', 'form:has(input[name=intent][value=lab-next]):not(:has(input[name=to][value=remake])) button', 'treatment-lab'],
  ['lab: next step again', 'chart', 'form:has(input[name=intent][value=lab-next]):not(:has(input[name=to][value=remake])) button', 'treatment-lab'],
  ['lab: remake', 'chart', 'form:has(input[name=intent][value=lab-next]):has(input[name=to][value=remake]) button', 'treatment-lab'],
  ['file: remove', 'chart', 'form:has(input[name=intent][value=file-remove]) button', 'files'],
  ['loa: cancel', 'chart', 'form:has(input[name=intent][value=loa-cancel]) button', 'loas'],
  ['payplan: stop', 'chart', 'form:has(input[name=intent][value=payplan-stop]) button', 'payplans'],
  // S4: In 6 months is Today's own button (no back: its card); Came in, In 3 months and Clear are in the check-up's
  // panel (Change / Other…), which posts back=<the tab> and lands at that tab's top.
  ['recall: in 6 months', 'overview', 'form:has(input[name=intent][value=recall-set]):has(input[name=months][value="6"]) button', 'recall'],
  ['recall: came in (panel)', 'overview', 'form:has(input[name=intent][value=recall-done]) button', 'rec-overview', 'rec-recall-set'],
  ['recall: in 3 months (panel)', 'overview', 'form:has(input[name=intent][value=recall-set]):has(input[name=months][value="3"]) button', 'rec-overview', 'rec-recall-set'],
  ['recall: clear (panel)', 'overview', 'form:has(input[name=intent][value=recall-clear]) button', 'rec-overview', 'rec-recall-set'],
];
for (const [what, tab, sel0, card, panel] of CARDS) {
  if (what === 'recall: in 6 months') await q(`update recall set completed_at = now() where patient_id = $1 and completed_at is null`, [PID]);
  await open(tab);
  const sel = sel0.replace('EXTRACTION', EXTRACTION);
  if (panel) { const o = page.locator(`[data-rec-panel]:not([hidden]) [data-ws-open="${panel}"]`).first(); await o.scrollIntoViewIfNeeded(); await o.click(); await page.waitForTimeout(250); }
  const btn = panel ? page.locator(`dialog#${panel}[open] ${sel}`).first() : page.locator(`[data-rec-panel]:not([hidden]) ${sel}`).first();
  if (!(await btn.count())) { results.push({ kind: 'C card', what, from: tab, got: {}, fail: ['no button'] }); continue; }
  await btn.scrollIntoViewIfNeeded(); await page.waitForTimeout(100);
  await Promise.all([page.waitForNavigation(), btn.click()]); await settle();
  const got = await seen();
  judge('C card', what, tab, got, card ?? (/[?&]treated=/.test(got.url) ? 'chart-offer' : 'treatment'));
  // The chart's offer after Mark done: Update the chart, then its own "Chart updated" line (the offer's, not a saved line).
  if (/mark done/.test(what) && /[?&]treated=/.test(got.url)) {
    const up = page.locator('[data-chart-offer-form] button').first();
    if (await up.count()) {
      await Promise.all([page.waitForNavigation(), up.click()]); await settle();
      const g2 = await page.evaluate(() => { const o = document.getElementById('chart-offer'); const bar = document.querySelector('[data-rec-bar]').getBoundingClientRect(); const c = o?.querySelector('.ws-callout'); const r = c?.getBoundingClientRect(); const hit = r && document.elementFromPoint(r.left + 24, r.top + 20); return { url: location.search + location.hash, text: c?.innerText.replace(/\s+/g, ' ').slice(0, 70), top: r && Math.round(r.top), on: !!r && r.top >= bar.bottom - 1 && r.bottom <= innerHeight, hit: !!hit && c.contains(hit) }; });
      results.push({ kind: 'C card', what: 'chart offer: update the chart', from: 'chart', got: { url: g2.url, lines: [g2] }, fail: [...(g2.on ? [] : [`off screen ${g2.top}`]), ...(g2.hit ? [] : ['not hit'])] });
    }
  }
}
// --- D: a card's own buttons refused (a missing id), posted the way the card posts (its #hash, no back) ---------------
const post = (fields, action) => page.evaluate(({ fields, action }) => {
  const f = document.createElement('form'); f.method = 'post'; f.action = action;
  const add = (k, v) => { const i = document.createElement('input'); i.type = 'hidden'; i.name = k; i.value = v; f.append(i); };
  add('_csrf', document.querySelector('input[name=_csrf]').value);
  for (const [k, v] of Object.entries(fields)) add(k, v);
  document.body.append(f); f.submit();
}, { fields, action });
const treatedId = (await ids(`select id from procedure_done where patient_id = $1 and fdi is not null limit 1`))[0] ?? '00000000-0000-4000-8000-000000000000';
const REFUSED = [
  ['plan-status', { item: '', to: 'accepted' }, '#treatment', 'Choose what to do with that item', 'treatment'],
  ['plan-remove', { item: '' }, '#treatment', 'not on the plan any more', 'treatment'],
  ['lab-next', { lab: '', to: 'sent' }, '#treatment-lab', 'not on the record any more', 'treatment-lab'],
  ['file-remove', { file: '' }, '#files', '', 'files'],
  ['loa-cancel', { loa: '' }, '#loas', '', 'loas'],
  ['payplan-stop', { plan: '' }, '#payplans', '', 'payplans'],
  ['chart-apply', { treated: '', back: 'chart' }, `?treated=${treatedId}&back=chart#chart-offer`, '', 'chart-offer'],
];
for (const [intent, fields, hash, words, card] of REFUSED) {
  await open('overview');
  await Promise.all([page.waitForNavigation(), post({ intent, ...fields }, URL_ + hash)]); await settle();
  const got = await seen(words);
  judge('D refused card', intent, '-', got, card, true);
}
await browser.close(); await db.end();

const pad = (s, n) => String(s ?? '').padEnd(n).slice(0, n);
let bad = 0;
for (const r of results) {
  if (r.fail.length) bad++;
  const x = (r.kind.startsWith('D') ? r.got.sentences : r.got.lines)?.[0];
  console.log(`${W} ${pad(r.kind, 17)} ${pad(r.what, 26)} ${pad(r.from, 16)} ${pad(r.got.url?.replace(/[0-9a-f-]{36}/g, '…'), 44)} ${pad(x ? `#${x.where} ${x.top}–${x.bottom}` : '', 26)} ${pad(x?.text, 48)} ${r.fail.length ? 'FAIL ' + r.fail.join('; ') : 'ok'}`);
}
console.log(`page errors: ${errors.length ? errors.join(' | ') : 'none'}`);
console.log(`${W}x${H}: ${results.length} cases, ${bad} failing`);
if (bad || errors.length) process.exit(1);
