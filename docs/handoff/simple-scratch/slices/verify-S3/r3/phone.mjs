import { browser, login, rec } from './lib.mjs';
const b = await browser();
for (const scheme of ['light', 'dark']) for (const w of [390, 360, 320, 767]) {
  const { ctx, page } = await login(b, 'owner', { viewport: { width: w, height: 800 }, colorScheme: scheme });
  for (const p of ['7e57a1c0-0000-4000-8000-00000000fc03', '7e57a1c0-0000-4000-8000-000000000301', '7e57a1c0-0000-4000-8000-000000000303', 'maria']) {
    await page.goto(rec(p)); await page.waitForTimeout(400);
    await page.evaluate(() => scrollTo(0, 1500)); await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const line = document.querySelector('.rec-pin-line');
      const lb = line?.getBoundingClientRect();
      const bar = document.querySelector('[data-rec-bar]').getBoundingClientRect();
      const top = document.querySelector('[data-ws-top]')?.getBoundingClientRect().bottom ?? 0;
      const clipped = line ? line.scrollWidth > line.clientWidth + 1 || line.scrollHeight > line.clientHeight + 1 : null;
      return { sw: document.documentElement.scrollWidth, iw: innerWidth, line: line ? line.innerText.slice(0, 200) : null, lineVis: lb ? [Math.round(lb.top), Math.round(lb.bottom)] : null, bar: [Math.round(bar.top), Math.round(bar.bottom)], top: Math.round(top), clipped };
    });
    const bad = r.sw > r.iw || r.clipped || (r.lineVis && r.lineVis[0] < r.top - 1);
    console.log(bad ? 'BAD' : 'ok ', scheme, w, p.slice(-4), JSON.stringify(r));
  }
  await ctx.close();
}
await b.close();
