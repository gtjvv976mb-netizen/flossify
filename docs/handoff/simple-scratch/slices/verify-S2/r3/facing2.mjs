// "Show the patient": is anything of the record (the tab row, Add ▾) drawn over the full-screen notice?
import { browser, login, rec } from './lib.mjs';
const b = await browser();
for (const vw of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  const { ctx, page } = await login(b, 'owner', { viewport: vw });
  await page.goto(rec('maria', '#consent'), { waitUntil: 'load' }); await page.waitForTimeout(400);
  // scroll so the row is stuck, then show the patient
  await page.evaluate(() => scrollBy(0, 200)); await page.waitForTimeout(150);
  const btn = page.locator('#consent button:has-text("Show the patient")').first();
  await btn.click(); await page.waitForTimeout(400);
  const r = await page.evaluate(() => {
    const c = document.getElementById('consent');
    const pts = []; for (let y = 5; y < innerHeight; y += 30) for (const x of [10, innerWidth / 2, innerWidth - 10]) { const e = document.elementFromPoint(x, y); if (e && !c.contains(e)) pts.push(`${Math.round(x)},${y}:${e.tagName}.${(e.className || '').toString().slice(0, 30)}${e.closest('[data-rec-bar]') ? '[ROW]' : ''}`); }
    return { facing: c.hasAttribute('data-facing'), notInside: pts.slice(0, 8), count: pts.length };
  });
  console.log(vw.width, JSON.stringify(r));
  await page.screenshot({ path: `/tmp/fl-simple-scratch/verify-S2/r3/facing-${vw.width}.png` });
  await ctx.close();
}
await b.close();
