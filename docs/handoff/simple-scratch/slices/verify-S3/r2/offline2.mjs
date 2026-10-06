// The real kept copy: the service worker keeps the record, the line goes, the page reloads from the copy.
import { browser, login, rec, state } from './lib.mjs';
const b = await browser();
const out = [];
const cases = [
  { name: 'bare', url: rec('maria') },
  { name: 'saved note on treatment-record', url: rec('maria', '?saved=note&back=treatment-record#treatment-record') },
  { name: 'hash #rx', url: rec('maria', '#rx') },
  { name: 'hash #consent (patient)', url: rec('maria', '#consent') },
  { name: 'visit past (ledger panel)', url: rec('maria', '?visit=1b9c069c-4521-41fc-b079-559aaa843e6a') },
];
for (const vw of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  for (const c of cases) {
    const { ctx, page } = await login(b, 'owner', { sw: true, viewport: vw });
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    await page.goto(rec('maria'));
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.goto(c.url);
    await page.waitForTimeout(800);
    const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
    const kept = await page.evaluate(async () => { const n = await caches.keys(); const r = n.find((k) => k.startsWith('flossify-record')); if (!r) return []; return (await (await caches.open(r)).keys()).map((q) => q.url); });
    await ctx.setOffline(true);
    await page.reload({ waitUntil: 'load' }).catch((e) => errs.push('reload ' + e.message));
    await page.waitForTimeout(900);
    const st = await state(page);
    const more = await page.evaluate(() => {
      const add = document.querySelector('.rec-add');
      const addBtn = add?.querySelector(':scope > button');
      const vis = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
      const pal = [...document.querySelectorAll('[data-pick-open]')].filter(vis).length;
      const chart = document.getElementById('rec-chart');
      const cr = chart?.getBoundingClientRect();
      const barEl = document.querySelector('[data-rec-bar]'); const bar = barEl?.getBoundingClientRect(); const pinB = barEl?.hasAttribute('data-pinned') ? Math.round(document.querySelector('[data-rec-pin]').getBoundingClientRect().bottom) : null; const oc = document.getElementById('chart'); const ocTop = oc ? Math.round(oc.getBoundingClientRect().top) : null;
      return { copy: document.documentElement.dataset.offlineCopy ?? null, addHiddenAttr: add?.hidden ?? null, addVisible: vis(addBtn), palVisible: pal,
        chartTop: cr ? Math.round(cr.top) : null, barBottom: bar ? Math.round(bar.bottom) : null, pinB, ocTop, scrollY: Math.round(scrollY), sideways: document.documentElement.scrollWidth > innerWidth };
    });
    const ok = !!more.copy && st.tab === 'chart' && st.shown.join() === 'chart' && !more.addVisible && more.palVisible === 0 && !more.sideways;
    const line = `${vw.width} ${c.name.padEnd(34)} controlled=${controlled} kept=${kept.length} → ${JSON.stringify({ ...st, ...more })} errs=${errs.length ? errs.join('|') : 0} ${ok ? 'ok' : 'FAIL'}`;
    console.log(line);
    out.push({ vw: vw.width, ...c, controlled, kept, st, more, errs, ok });
    await ctx.close();
  }
}
await b.close();
console.log(out.filter((x) => !x.ok).length, 'failing of', out.length);
