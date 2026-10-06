import { browser, login, rec } from './lib.mjs';
const b = await browser();
const ids = { maria: '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', rich: '7e57a1c0-0000-4000-8000-000000000001', pin: '7e57a1c0-0000-4000-8000-000000000301' };
let fails = 0;
for (const [w,h] of [[1440,900],[1366,768],[1024,768],[768,1024]]) {
  const { ctx, page } = await login(b, 'owner', { viewport: { width: w, height: h } });
  for (const [n, id] of Object.entries(ids)) for (const hash of ['chart','rx','consent','notes','treatment','money','health','files','letters','recall','visits','treatment-record','texts','loas','chart-offer', 'patient']) {
    await page.goto('about:blank');
    await page.goto(rec(id, '#' + hash)); await page.waitForTimeout(700);
    const r = await page.evaluate((hash) => {
      const bar = document.querySelector('[data-rec-bar]'); const pin = document.querySelector('[data-rec-pin]');
      const pinned = bar.hasAttribute('data-pinned');
      const bottom = Math.max(bar.getBoundingClientRect().bottom, pinned ? pin.getBoundingClientRect().bottom : 0);
      const el = document.getElementById(hash);
      const vis = el && el.getClientRects().length && !el.closest('[hidden]');
      const t = vis ? el.getBoundingClientRect().top : null;
      return { pinned, bottom: Math.round(bottom), top: t === null ? null : Math.round(t), y: Math.round(scrollY) };
    }, hash);
    const bad = r.top !== null && r.top < r.bottom - 1 && r.y > 0;
    if (bad) fails++;
    if (bad) console.log(w, n, hash, JSON.stringify(r), 'COVERED');
  }
  await ctx.close();
}
console.log('fails', fails); await b.close();
