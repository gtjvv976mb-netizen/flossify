// Every saved word the record says something for: the success/warn callouts on the page (shown or not), with no back
// (a card's own button) and, on HEAD, with each back. Compared base vs HEAD by the words said.
import { browser, login, rec, db } from './lib.mjs';
import { writeFileSync } from 'node:fs';
const c = await db();
const q1 = async (sql, p) => (await c.query(sql, p)).rows[0];
const M = '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb';
const rx = (await q1(`select id from prescription where patient_id = $1 order by issued_at desc limit 1`, [M]))?.id;
const letter = (await q1(`select id from clinical_letter where patient_id = $1 order by created_at desc limit 1`, [M]))?.id;
const inv = (await q1(`select id from invoice where patient_id = $1 limit 1`, [M]))?.id;
await c.end();
const WORDS = ['plan', 'plan-accepted', 'plan-declined', 'plan-planned', 'plan-done', 'plan-removed', 'done', 'lab', 'lab-moved', 'note', 'addendum', 'file', 'file-removed', 'files:3',
  'recall', 'recall-done', 'recall-cleared', 'loa', 'loa-approved', 'loa-denied', 'loa-cancelled', 'payplan-stopped', 'answered', `rx:${rx}`, `letter:${letter}`, `payplan:${inv}`, 'adjusted:2026-11-02',
  'vitals', 'vitals-high', 'vitals-crisis', 'vitals-low', 'checked', 'checked-today', 'health', 'birth', 'nothing', 'consent', 'consent-already', 'paper', 'details', 'new', 'capacity', 'consent-removed', 'charted'];
const HEAD = process.env.MODE_ !== 'base';
const BACKS = HEAD ? ['', 'overview', 'patient', 'chart', 'treatment-record'] : [''];
const b = await browser();
const { ctx, page } = await login(b, process.env.WHO_ || 'owner');
const out = {};
for (const w of WORDS) {
  for (const back of BACKS) {
    const u = rec('maria', `?saved=${encodeURIComponent(w)}${back ? `&back=${back}#${back}` : ''}`);
    await page.goto('about:blank'); await page.goto(u, { waitUntil: 'load' }); await page.waitForTimeout(250);
    const r = await page.evaluate(() => {
      const cs = [...document.querySelectorAll('.ws-callout')].filter((e) => !e.closest('dialog') && ['success', 'warn', 'alert', 'info'].includes(e.dataset.tone));
      const sel = document.querySelector('[role=tab][aria-selected=true][id^=rec-rec-]')?.id.replace(/^rec-rec-|-tab$/g, '');
      return { tab: sel, callouts: cs.map((e) => ({ tone: e.dataset.tone, text: e.textContent.trim().replace(/\s+/g, ' ').slice(0, 160), shown: e.getClientRects().length > 0, inView: (() => { const r = e.getBoundingClientRect(); return e.getClientRects().length > 0 && r.top < innerHeight && r.bottom > 0; })() })) };
    });
    out[`${w}|${back}`] = r;
    const said = r.callouts.filter((x) => x.tone === 'success' || /saved|Saved/.test(x.text));
    console.log(`${w.padEnd(22)} back=${(back || '-').padEnd(16)} tab=${r.tab?.padEnd(16)} ${said.map((x) => `${x.shown ? (x.inView ? 'VIEW' : 'shown') : 'hidden'}:${x.text.slice(0, 70)}`).join(' || ') || '(nothing said)'}`);
  }
}
writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
await b.close();
