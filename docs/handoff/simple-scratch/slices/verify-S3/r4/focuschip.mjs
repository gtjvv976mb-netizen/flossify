import { browser, login, rec } from './lib.mjs';
const b = await browser();
for (const [w,h,y] of [[1366,768,250],[1440,900,260],[1366,768,230]]) {
const { ctx, page } = await login(b, 'owner', { viewport: { width: w, height: h } });
await page.goto(rec('7e57a1c0-0000-4000-8000-00000000fc03'));
await page.waitForTimeout(500);
await page.evaluate((y) => scrollTo(0, y), y); await page.waitForTimeout(200);
await page.evaluate(() => [...document.querySelectorAll('.rec-actions a')].pop().focus({ preventScroll: true }));
await page.keyboard.press('Tab'); await page.waitForTimeout(300);
const r = await page.evaluate(() => {
  const a = document.activeElement; const b = a.getBoundingClientRect(); const p = document.querySelector('[data-rec-pin]').getBoundingClientRect();
  const at = document.elementFromPoint(b.left + b.width/2, b.top + b.height/2);
  return { focus: a.textContent.trim().slice(0,50), el: [Math.round(b.top), Math.round(b.bottom)], pin: [Math.round(p.top), Math.round(p.bottom)], pinned: document.querySelector('[data-rec-bar]').hasAttribute('data-pinned'), scrollY, topAt: at?.className?.toString().slice(0,30), covered: !a.contains(at) };
});
console.log(w,h,y, JSON.stringify(r));
if (w===1366 && y===250) await page.screenshot({ path: 'chip-covered-1366.png' });
// try clicking the chip by mouse at its centre after scrolling to y
await page.evaluate((y) => scrollTo(0, y), y); await page.waitForTimeout(200);
const box = await page.locator('.rec-todo button').first().boundingBox();
const before = await page.evaluate(() => document.querySelector('[role=tab][aria-selected=true]').id);
await page.mouse.click(box.x + box.width/2, box.y + box.height/2); await page.waitForTimeout(400);
const after = await page.evaluate(() => document.querySelector('[role=tab][aria-selected=true]').id);
console.log('  mouse click on chip centre: tab before', before, 'after', after);
await ctx.close();
}
await b.close();
