// A panel refused and drawn open again by the server, then closed with Escape: where focus goes. Works on the base
// (S1: the panel comes back over its own section) and on HEAD (over the tab it was opened from; FROM_ picks the tab).
import { browser, login, rec, state } from './lib.mjs';
const b = await browser();
const REFUSE = {
  'rec-vitals-add': (f) => { f.querySelectorAll('input').forEach((i) => { if (['sys', 'dia', 'pulse'].includes(i.name)) i.value = ''; }); },
  'rec-rx-add': (f) => { f.querySelectorAll('input[name=drug]').forEach((i) => { i.value = ''; }); },
  'rec-letter-add': (f) => { const t = f.querySelector('textarea'); if (t) t.value = ''; f.querySelectorAll('input[type=date]').forEach((i) => { i.value = '1900-01-01'; }); },
  'rec-lab-add': (f) => { f.querySelectorAll('input[type=text], input:not([type])').forEach((i) => { if (i.name !== 'back') i.value = ''; }); },
  'rec-file-add': () => {},
  'rec-loa-add': (f) => { f.querySelectorAll('select').forEach((s) => { s.value = ''; }); },
  'rec-plan-add': (f) => { f.querySelectorAll('select').forEach((s) => { s.value = ''; }); const n = f.querySelector('input[name=name]'); if (n) n.value = ''; },
  'rec-done-add': (f) => { f.querySelectorAll('select').forEach((s) => { s.value = ''; }); const n = f.querySelector('input[name=name]'); if (n) n.value = ''; },
  'rec-note-add': (f) => { f.querySelectorAll('textarea').forEach((t) => { t.value = ''; }); },
  'rec-recall-set': (f) => { f.querySelectorAll('input[type=date]').forEach((i) => { i.value = '1990-01-01'; }); f.querySelectorAll('input[type=radio]').forEach((i) => { i.checked = false; }); },
};
const { ctx, page } = await login(b, 'owner');
let bad = 0;
for (const [panel, spoil] of Object.entries(REFUSE)) {
  await page.goto('about:blank');
  await page.goto(rec('maria'), { waitUntil: 'load' }); await page.waitForTimeout(300);
  // the natural opener: the first [data-ws-open] for it anywhere (a hidden one is shown by clicking its section's tab first)
  const how = await page.evaluate((panel) => {
    const all = [...document.querySelectorAll(`[data-ws-open="${panel}"]`)];
    const vis = all.find((e) => e.getClientRects().length > 0);
    if (vis) { vis.click(); return 'visible ' + (vis.textContent || '').trim().slice(0, 25); }
    const e = all.find((x) => !x.closest('.ws-menu-pop')) ?? all[0];
    const sec = e?.closest('[role=tabpanel]');
    if (sec) document.getElementById(sec.getAttribute('aria-labelledby'))?.click();
    if (e && e.getClientRects().length) { e.click(); return 'section ' + sec?.id + ' ' + (e.textContent || '').trim().slice(0, 25); }
    window.ws.openPanel(panel, null); return 'ws.openPanel';
  }, panel);
  await page.waitForTimeout(400);
  const before = await state(page);
  await page.evaluate(([panel, src]) => { const f = document.querySelector(`#${panel} input[name=intent][value="${panel.replace(/^rec-/, '')}"]`).form; f.querySelectorAll('[required]').forEach((x) => x.removeAttribute('required')); f.noValidate = true; (0, eval)(`(${src})`)(f); }, [panel, spoil.toString()]);
  await Promise.all([page.waitForNavigation(), page.evaluate((panel) => document.querySelector(`#${panel} input[name=intent][value="${panel.replace(/^rec-/, '')}"]`).form.requestSubmit(), panel)]);
  await page.waitForTimeout(500);
  const st = await state(page);
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  const a = await page.evaluate(() => { const a = document.activeElement; return a === document.body ? 'BODY' : `${a.tagName}#${a.id}[${a.dataset.wsOpen ?? ''}] "${(a.textContent || '').trim().slice(0, 25)}" vis=${a.getClientRects().length > 0}`; });
  const ok = st.dialogs.includes(panel) && a !== 'BODY';
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${panel.padEnd(16)} opened by ${how.padEnd(40)} (tab ${before.tab}) → refused on tab ${st.tab}, open=${st.dialogs.includes(panel)}; closed → ${a}`);
}
console.log(bad, 'with focus lost');
await b.close();
