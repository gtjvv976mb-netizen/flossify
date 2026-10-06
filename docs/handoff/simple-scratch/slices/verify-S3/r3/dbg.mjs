import { browser, login, rec } from './lib.mjs';
const b = await browser();
const { ctx, page } = await login(b, 'owner', { viewport: { width: 1366, height: 768 } });
await page.goto(rec('7e57a1c0-0000-4000-8000-00000000fc03'));
await page.waitForTimeout(500);
for (const y of [0, 100, 150, 200, 250, 300]) {
  await page.evaluate((y) => scrollTo(0, y), y); await page.waitForTimeout(150);
  console.log(y, JSON.stringify(await page.evaluate(() => {
    const q = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.bottom)]; };
    return { top: q('[data-ws-top]'), safety: q('[data-rec-safety]'), todo: q('.rec-todo'), note: q('.rec-desk-note'), bar: q('[data-rec-bar]'), pin: q('[data-rec-pin]'), pinned: document.querySelector('[data-rec-bar]').hasAttribute('data-pinned'), vis: getComputedStyle(document.querySelector('[data-rec-pin]')).visibility };
  })));
}
await page.screenshot({ path: 'dbg.png' });
await b.close();
