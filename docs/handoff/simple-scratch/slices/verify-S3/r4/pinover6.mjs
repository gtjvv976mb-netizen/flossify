import { browser, login, rec } from './lib.mjs';
const b = await browser();
const out = [];
for (const [w, h] of [[1366, 768], [1440, 900], [1024, 768], [768, 1024]]) {
  const { ctx, page } = await login(b, 'owner', { viewport: { width: w, height: h } });
  await page.goto(rec('7e57a1c0-0000-4000-8000-00000000fc03'));
  await page.waitForTimeout(500);
  // Controls in the head below the safety line
  const n = await page.locator('.rec-todo button, .rec-head-row ~ * a, .rec-head-row ~ * button').count();
  for (let y = 0; y <= 400; y += 5) {
    await page.evaluate((y) => scrollTo(0, y), y);
    await page.waitForTimeout(60);
    const r = await page.evaluate(() => {
      const bar = document.querySelector('[data-rec-bar]');
      const pinned = bar.hasAttribute('data-pinned');
      const top = document.querySelector('[data-ws-top]').getBoundingClientRect().bottom;
      const pane = document.querySelector('.rec-back').closest('section,div');
      const ctrls = [...document.querySelectorAll('.rec-todo button, .rec-back ~ * a, .rec-back ~ * button')].filter((e) => !e.closest('[data-rec-bar]') && e.getBoundingClientRect().height > 0);
      const bad = [];
      for (const c of ctrls) {
        const b = c.getBoundingClientRect();
        const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
        if (cy < top || cy > innerHeight) continue; // off screen or under top bar
        const at = document.elementFromPoint(cx, cy);
        if (at && !c.contains(at) && !at.contains(c)) bad.push({ ctl: (c.textContent || '').trim().slice(0, 50), cy: Math.round(cy), at: at.className?.toString().slice(0, 40), inPin: !!at.closest('[data-rec-pin]'), inBar: !!at.closest('[data-rec-bar]') });
      }
      return { pinned, stuck: Math.round(bar.getBoundingClientRect().top), bad };
    });
    if (r.bad.length) out.push({ w, h, y, ...r });
  }
  await ctx.close();
}
console.log(JSON.stringify(out.slice(0, 40), null, 1));
console.log('cases with covered head controls:', out.length);
await b.close();
