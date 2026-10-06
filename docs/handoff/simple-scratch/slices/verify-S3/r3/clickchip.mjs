import { browser, login, rec } from './lib.mjs';
const b = await browser();
const { ctx, page } = await login(b, 'owner', { viewport: { width: 1366, height: 768 } });
for (const y of [0, 100, 200, 250]) {
  await page.goto(rec('7e57a1c0-0000-4000-8000-00000000fc03')); await page.waitForTimeout(500);
  await page.evaluate((y) => scrollTo(0, y), y); await page.waitForTimeout(250);
  const box = await page.locator('.rec-todo button').first().boundingBox();
  const at = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e?.closest('[data-rec-pin]') ? 'PIN COPY' : e?.className?.toString().slice(0, 30); }, [box.x + box.width / 2, box.y + box.height / 2]);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(400);
  const after = await page.evaluate(() => document.querySelector('[role=tab][aria-selected=true]').id);
  console.log('scrollY', y, 'chip', Math.round(box.y), '-', Math.round(box.y + box.height), 'hit', at, '-> tab', after);
}
await b.close();
