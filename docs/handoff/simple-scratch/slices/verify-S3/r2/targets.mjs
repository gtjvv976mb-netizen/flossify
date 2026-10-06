import { browser, login, rec } from './lib.mjs';
const b = await browser();
for (const [w,h] of [[1440,900],[390,844],[1366,768]]) {
  const { ctx, page } = await login(b, 'owner', { viewport: { width: w, height: h } });
  for (const id of ['1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', '7e57a1c0-0000-4000-8000-000000000302', '7e57a1c0-0000-4000-8000-000000000001']) {
    for (const tab of ['overview','patient','chart','treatment-record']) {
      await page.goto(rec(id, '#' + tab)); await page.waitForTimeout(400);
      const r = await page.evaluate(() => {
        const vis = (e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[hidden]') && !e.closest('dialog:not([open])');
        const head = document.querySelector('.rec-back').parentElement;
        const small = [...head.querySelectorAll('a, button, [role=button], input, select')].filter(vis).map((e) => { const r = e.getBoundingClientRect(); return { t: (e.innerText || e.getAttribute('aria-label') || '').trim().slice(0, 25), w: Math.round(r.width), h: Math.round(r.height) }; }).filter((x) => x.h < 44 || x.w < 44);
        const teal = [...document.querySelectorAll('.ws-btn, button, a')].filter((e) => vis(e) && !e.closest('dialog')).filter((e) => { const c = getComputedStyle(e).backgroundColor; return /rgb\(14, 116, 113\)/.test(c); }).map((e) => e.innerText.trim().slice(0, 25));
        return { small, teal };
      });
      console.log(w, id.slice(-4), tab, JSON.stringify(r));
    }
  }
  await ctx.close();
}
await b.close();
