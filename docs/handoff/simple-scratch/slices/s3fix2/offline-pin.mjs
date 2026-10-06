import { browser, login, rec } from '/tmp/fl-simple-scratch/verify-S3/r2/lib.mjs';
const b = await browser();
for (const vw of [{ width: 1440, height: 900 }, { width: 1366, height: 768 }, { width: 390, height: 844 }]) {
  const { ctx, page } = await login(b, 'owner', { sw: true, viewport: vw });
  await page.goto(rec('rich')); await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.goto(rec('rich', '#chart')); await page.waitForTimeout(800);
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(1000);
  const r = await page.evaluate(() => {
    const topb = document.querySelector('[data-ws-top]').getBoundingClientRect().bottom;
    const bar = document.querySelector('[data-rec-bar]'), pin = bar.querySelector('[data-rec-pin]'), line = bar.querySelector('.rec-pin-line');
    const vis = (e) => e && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none';
    const head = document.querySelector('[data-rec-safety]').getBoundingClientRect();
    const tab = document.querySelector('[role=tab][aria-selected=true]')?.id;
    const panel = document.querySelector('[data-rec-panel]:not([hidden])').getBoundingClientRect();
    return { kept: document.documentElement.dataset.offlineCopy ?? null, tab, y: Math.round(scrollY), pinned: bar.hasAttribute('data-pinned') && !!vis(pin), line: !!vis(line),
      headSeen: head.bottom > topb + 4 && head.top < innerHeight, rowBottom: Math.round(bar.getBoundingClientRect().bottom), panelTop: Math.round(panel.top) };
  });
  console.log(vw.width, JSON.stringify(r), (r.pinned || r.line || r.headSeen) && r.panelTop >= r.rowBottom ? 'ok' : 'FAIL');
  await ctx.close();
}
await b.close();
