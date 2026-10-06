// Verifier: every intent refused, posted with NO back (a form posted before its script ran, or with scripts off), to the
// form's own #anchor as written in the markup. Where does it land, and is the sentence on screen (in its panel or card)?
import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const BASE = 'http://127.0.0.1:4470';
const RICH = '7e57a1c0-0000-4000-8000-000000000001';
const URL_ = `${BASE}/c/session-road/patients/${RICH}/`;
const HOME = { 'plan-add': 'treatment', 'done-add': 'treatment-done', 'lab-add': 'treatment-lab', 'note-add': 'notes', 'rx-add': 'rx', 'file-add': 'files', 'recall-set': 'recall', 'vitals-add': 'vitals', 'letter-add': 'letters', 'letter-answer': 'letters', 'loa-add': 'loas', 'loa-approve': 'loas', 'loa-deny': 'loas', 'payplan-add': 'payplans', 'adjust-add': 'payplans', 'plan-status': 'treatment', 'plan-remove': 'treatment', 'lab-next': 'treatment-lab', 'file-remove': 'files', 'loa-cancel': 'loas', 'payplan-stop': 'payplans', 'recall-done': 'recall', 'recall-clear': 'recall' };
const PANEL = { 'plan-add': 'rec-plan-add', 'done-add': 'rec-done-add', 'lab-add': 'rec-lab-add', 'note-add': 'rec-note-add', 'rx-add': 'rec-rx-add', 'file-add': 'rec-file-add', 'recall-set': 'rec-recall-set', 'vitals-add': 'rec-vitals-add', 'letter-add': 'rec-letter-add', 'letter-answer': 'rec-letter-answer', 'loa-add': 'rec-loa-add', 'loa-approve': 'rec-loa-approve', 'loa-deny': 'rec-loa-deny', 'payplan-add': 'rec-payplan-add', 'adjust-add': 'rec-adjust-add' };
const ONLY = process.env.ONLY_ ? process.env.ONLY_.split(',') : null;
const REFUSE0 = { 'plan-add': {}, 'done-add': {}, 'lab-add': { lab: '' }, 'note-add': {}, 'rx-add': {}, 'file-add': { kind: 'xray_periapical' }, 'recall-set': { months: '99' },
  'vitals-add': { systolic: '400', diastolic: '80' }, 'letter-add': { kind: 'nonsense' }, 'letter-answer': { letter: '', answer: 'nonsense' }, 'loa-add': { payor: '' },
  'loa-approve': { loa: '' }, 'loa-deny': { loa: '' }, 'payplan-add': { title: '' }, 'adjust-add': { plan: '' }, 'plan-status': { item: '', to: 'done' },
  'plan-remove': { item: '' }, 'lab-next': { lab: '' }, 'file-remove': { file: '' }, 'loa-cancel': { loa: '' }, 'payplan-stop': { plan: '' }, 'recall-done': {}, 'recall-clear': {} };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let bad = 0;
const REFUSE = Object.fromEntries(Object.entries(REFUSE0).filter(([k]) => !ONLY || ONLY.includes(k)));
for (const [w, h] of [[1440, 900]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
  for (const [intent, fields] of Object.entries(REFUSE)) {
    await page.goto('about:blank'); await page.goto(URL_, { waitUntil: 'load' }); await page.waitForTimeout(200);
    await Promise.all([page.waitForNavigation(), page.evaluate(({ intent, fields, url, hash }) => {
      const f = document.createElement('form'); f.method = 'post'; f.action = `${url}#${hash}`;
      const add = (k, v) => { const i = document.createElement('input'); i.type = 'hidden'; i.name = k; i.value = v; f.append(i); };
      add('_csrf', document.querySelector('input[name=_csrf]').value); add('intent', intent);
      for (const [k, v] of Object.entries(fields)) add(k, v);
      document.body.append(f); f.submit();
    }, { intent, fields, url: URL_, hash: HOME[intent] })]);
    await page.waitForTimeout(500);
    const s = await page.evaluate((panel) => {
      const vis = (el) => !!el && el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && el.getClientRects().length > 0;
      const bar = document.querySelector('[data-rec-bar]').getBoundingClientRect();
      const tab = document.querySelector('[role=tab][aria-selected=true]')?.id.replace(/^rec-rec-|-tab$/g, '');
      const dlg = panel ? document.getElementById(panel) : null;
      const alerts = [...document.querySelectorAll('[data-rec-panel]:not([hidden]) .ws-callout[data-tone=alert], [data-rec-panel]:not([hidden]) .ws-callout')].filter((c) => vis(c) && /Nothing|not|No |Choose|Write|Pick|could|isn|cannot|must|Too/i.test(c.textContent));
      const on = alerts.filter((c) => { const r = c.getBoundingClientRect(); return r.top >= bar.bottom - 2 && r.top < innerHeight; });
      return { tab, url: location.search + location.hash, panelOpen: dlg ? dlg.open : null, panelText: dlg && dlg.open ? [...dlg.querySelectorAll('.ws-callout')].filter(vis).map((c) => c.textContent.replace(/\s+/g, ' ').trim().slice(0, 60)).join(' / ') : null, cardOn: on.map((c) => c.textContent.replace(/\s+/g, ' ').trim().slice(0, 60)), cardAny: alerts.length };
    }, PANEL[intent] ?? null);
    const fail = [];
    if (PANEL[intent]) { if (!s.panelOpen) fail.push('panel not open'); }
    else if (!s.cardOn.length) fail.push(`sentence not on screen (${s.cardAny} drawn on the tab shown)`);
    if (fail.length) bad++;
    console.log(`${w} ${intent.padEnd(14)} → ${String(s.tab).padEnd(17)} ${s.url.padEnd(16)} ${s.panelOpen ? 'panel: ' + s.panelText : 'card: ' + s.cardOn.join(' / ')} ${fail.length ? 'FAIL ' + fail.join('; ') : 'ok'}`.slice(0, 250));
  }
  await ctx.close();
}
await browser.close();
console.log(bad ? `${bad} failing` : 'all ok');
