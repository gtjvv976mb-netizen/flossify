// Are the allergies on screen? At each scroll position, either the head's safety line is fully visible below the top bar,
// or the pinned copy / phone line is shown.
import { browser, login, rec } from './lib.mjs';
const b = await browser();
const ids = { maria: '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', rich: '7e57a1c0-0000-4000-8000-000000000001', pin: '7e57a1c0-0000-4000-8000-000000000301', ask: '7e57a1c0-0000-4000-8000-000000000303' };
const check = (page) => page.evaluate(() => {
  const topb = document.querySelector('.ws-top, header')?.getBoundingClientRect().bottom ?? 0;
  const bar = document.querySelector('[data-rec-bar]'); const pin = document.querySelector('[data-rec-pin]'); const line = document.querySelector('.rec-pin-line');
  const vis = (e) => e && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none';
  const head = document.querySelector('[data-rec-safety]').getBoundingClientRect();
  const headSeen = head.top >= topb - 1 && head.bottom <= innerHeight;
  const headPart = head.bottom > topb + 4 && head.top < innerHeight;
  const pinSeen = bar.hasAttribute('data-pinned') && vis(pin);
  return { y: Math.round(scrollY), headSeen, headPart, pinSeen, lineSeen: vis(line), gap: !(headPart || pinSeen || vis(line)) };
});
for (const [w,h] of [[1440,900],[1366,768],[1024,768],[768,1024]]) {
  const { ctx, page } = await login(b, 'owner', { viewport: { width: w, height: h } });
  for (const [n, id] of Object.entries(ids)) {
    await page.goto(rec(id)); await page.waitForTimeout(500);
    const gaps = [];
    const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    for (let y = 0; y <= Math.min(max, 900); y += 10) {
      await page.evaluate((y) => scrollTo(0, y), y); await page.waitForTimeout(60);
      const r = await check(page); if (r.gap) gaps.push(y);
    }
    // landings
    const land = [];
    for (const hs of ['chart', 'treatment', 'files', 'patient', 'health', 'consent']) {
      await page.goto('about:blank'); await page.goto(rec(id, '#' + hs)); await page.waitForTimeout(700);
      const r = await check(page); if (r.gap) land.push(`#${hs}@${r.y}`);
    }
    // tab clicks from the top
    for (const t of ['chart', 'treatment-record', 'patient']) {
      await page.goto(rec(id)); await page.waitForTimeout(400);
      await page.evaluate(() => scrollTo(0, 400)); await page.waitForTimeout(200);
      await page.click(`#rec-rec-${t}-tab`); await page.waitForTimeout(500);
      const r = await check(page); if (r.gap) land.push(`click ${t}@${r.y}`);
    }
    console.log(w, n, 'scroll gaps (y):', gaps.length ? `${gaps[0]}..${gaps[gaps.length - 1]} (${gaps.length})` : 'none', '| landings with no allergies on screen:', land.join(' ') || 'none');
  }
  await ctx.close();
}
await b.close();
