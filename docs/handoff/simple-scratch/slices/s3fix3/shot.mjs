import { browser, login, rec } from '/tmp/fl-simple-scratch/verify-S3/r4/lib.mjs';
const b = await browser();
const { page } = await login(b, 'owner', { viewport: { width: 1366, height: 768 } });
await page.goto(rec('rich')); await page.waitForTimeout(500);
for (const y of [300, 700]) { await page.evaluate((y) => scrollTo(0, y), y); await page.waitForTimeout(200); await page.screenshot({ path: `rich-1366-${y}.png` });
  console.log(y, await page.evaluate(() => { const bar = document.querySelector('[data-rec-bar]'), p = bar.querySelector('[data-rec-pin]'); const r = bar.getBoundingClientRect(), q = p.getBoundingClientRect(); return { pinned: bar.hasAttribute('data-pinned'), bar: [r.top, r.bottom], pin: [q.top, q.bottom], stick: getComputedStyle(document.documentElement).getPropertyValue('--rec-stick') }; })); }
await b.close();
