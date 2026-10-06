// Focus after closing a panel the server drew open (a refused post), for every form panel of the record × the 4 tabs
// it can be posted from: a refused post (as its panel posts it: back=<tab>, #<tab>) comes back with the panel open;
// Escape (or its Close button) closes it; focus must land on a control on screen — never <body>, never hidden,
// never under the sticky row. Writes nothing (refusals; the throttle rows are cleared at login).
//   node panel-focus.mjs <out.json>
import { browser, login, rec, P } from '/tmp/fl-simple-scratch/verify-S2/r3/lib.mjs';
import { writeFileSync } from 'node:fs';
const OUT = process.argv[2];
const TABS = ['overview', 'patient', 'chart', 'treatment-record'];
const PANEL_OF = { 'plan-add': 'rec-plan-add', 'done-add': 'rec-done-add', 'lab-add': 'rec-lab-add', 'note-add': 'rec-note-add', 'rx-add': 'rec-rx-add', 'file-add': 'rec-file-add',
  'recall-set': 'rec-recall-set', 'vitals-add': 'rec-vitals-add', 'letter-add': 'rec-letter-add', 'letter-answer': 'rec-letter-answer', 'loa-add': 'rec-loa-add', 'loa-approve': 'rec-loa-approve',
  'loa-deny': 'rec-loa-deny', 'payplan-add': 'rec-payplan-add', 'adjust-add': 'rec-adjust-add', 'plan-status': 'rec-done-add', details: 'details' };
const REFUSE = {
  'plan-add': {}, 'done-add': {}, 'lab-add': { lab: '' }, 'note-add': {}, 'rx-add': {}, 'file-add': { kind: 'xray_periapical' }, 'recall-set': { months: '99' },
  'vitals-add': { systolic: '400', diastolic: '80' }, 'letter-add': { kind: 'nonsense' }, 'letter-answer': { letter: '', answer: 'nonsense' }, 'loa-add': { payor: '' },
  'loa-approve': { loa: '' }, 'loa-deny': { loa: '' }, 'payplan-add': { title: '' }, 'adjust-add': { plan: '' }, 'plan-status': { item: '', to: 'done' },
  details: { first_name: '', last_name: '' },
};
const RUNS = [
  { who: 'owner', vw: { width: 1440, height: 900 }, pats: ['maria', 'rich'] },
  { who: 'owner', vw: { width: 390, height: 844 }, pats: ['maria'] },
  { who: 'dentist', vw: { width: 1440, height: 900 }, pats: ['rich'] },
];
const b = await browser();
const results = [];
const errors = [];
for (const run of RUNS) {
  const { ctx, page } = await login(b, run.who, { viewport: run.vw });
  page.on('pageerror', (e) => errors.push(String(e)));
  for (const pat of run.pats) {
    const url = rec(pat);
    let n = 0;
    for (const tab of TABS) for (const [intent, fields] of Object.entries(REFUSE)) {
      const panel = PANEL_OF[intent];
      await page.goto('about:blank');
      await page.goto(`${url}#${tab}`, { waitUntil: 'load' }); await page.waitForTimeout(250);
      await Promise.all([page.waitForNavigation(), page.evaluate(({ fields, tab, url, intent }) => {
        const f = document.createElement('form'); f.method = 'post'; f.action = `${url}#${tab}`;
        const add = (k, v) => { const i = document.createElement('input'); i.type = 'hidden'; i.name = k; i.value = v; f.append(i); };
        add('_csrf', document.querySelector('input[name=_csrf]').value); add('intent', intent); add('back', tab);
        for (const [k, v] of Object.entries(fields)) add(k, v);
        document.body.append(f); f.submit();
      }, { fields, tab, url, intent })]);
      await page.waitForLoadState('load'); await page.waitForTimeout(400);
      const before = await page.evaluate((panel) => ({ open: !!document.getElementById(panel)?.open, tab: document.querySelector('[role=tab][aria-selected=true][id^=rec-rec-]')?.id.replace(/^rec-rec-|-tab$/g, '') }), panel);
      if (!before.open) { results.push({ who: run.who, w: run.vw.width, pat, tab, intent, fail: [`panel ${panel} not open (none for this person?)`], skip: true }); continue; }
      const how = n++ % 2 ? 'close-button' : 'escape';
      if (how === 'escape') await page.keyboard.press('Escape');
      else await page.locator(`#${panel} [data-ws-close]:visible`).first().click();
      await page.waitForTimeout(500);
      const f = await page.evaluate(() => {
        const a = document.activeElement;
        const bar = document.querySelector('[data-rec-bar]')?.getBoundingClientRect();
        if (!a || a === document.body) return { what: 'BODY' };
        const r = a.getBoundingClientRect();
        const inBar = !!a.closest('[data-rec-bar]');
        const cx = Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 1), cy = Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 1);
        const hit = document.elementFromPoint(cx, cy);
        const covered = !(hit && (hit === a || a.contains(hit) || hit.contains(a)));
        return { covered, hitWhat: hit ? `${hit.tagName.toLowerCase()}.${String(hit.className).slice(0, 30)}` : null, what: `${a.tagName.toLowerCase()}${a.id ? '#' + a.id : ''}${a.dataset.wsOpen ? `[open=${a.dataset.wsOpen}]` : ''} "${(a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28)}"`,
          vis: a.getClientRects().length > 0, top: Math.round(r.top), bottom: Math.round(r.bottom), ih: innerHeight, inBar, barBottom: bar ? Math.round(bar.bottom) : null,
          dialogs: [...document.querySelectorAll('dialog[open]')].map((d) => d.id) };
      });
      const fail = [];
      if (f.what === 'BODY') fail.push('focus on <body>');
      else {
        if (!f.vis) fail.push('focus on a hidden element');
        if (f.bottom <= 0 || f.top >= f.ih) fail.push('focus off screen');
        if (f.covered) fail.push(`focus covered by ${f.hitWhat} (under the sticky row?)`);
        if (f.dialogs.length) fail.push(`dialog still open ${f.dialogs}`);
      }
      if (before.tab !== tab) fail.push(`reopened over ${before.tab}, not ${tab}`);
      results.push({ who: run.who, w: run.vw.width, pat, tab, intent, how, focus: f, fail });
      console.log(`${fail.length ? 'FAIL' : 'ok  '} ${run.who} ${run.vw.width} ${pat.padEnd(6)} ${tab.padEnd(16)} ${intent.padEnd(13)} ${how.padEnd(12)} → ${f.what}${f.top != null ? ` y=${f.top}` : ''}${fail.length ? '  ' + fail.join('; ') : ''}`);
    }
  }
  await ctx.close();
}
await b.close();
writeFileSync(OUT, JSON.stringify({ errors, results }, null, 1));
const real = results.filter((r) => !r.skip);
console.log(`${real.length} cases, ${real.filter((r) => r.fail.length).length} failing; ${results.filter((r) => r.skip).length} skipped (no such panel for the person); page errors: ${errors.length ? errors.join(' | ') : 'none'}`);
