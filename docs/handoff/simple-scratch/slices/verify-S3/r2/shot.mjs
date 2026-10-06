import { browser, login, rec } from './lib.mjs';
const b = await browser();
const { ctx, page } = await login(b, 'owner', { viewport: { width: 1366, height: 768 } });
for (const [n, id] of [['maria','1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb'], ['rich','7e57a1c0-0000-4000-8000-000000000001']]) {
  await page.goto(rec(id)); await page.waitForTimeout(400);
  await page.evaluate(() => scrollTo(0, 400)); await page.waitForTimeout(200);
  await page.click('#rec-rec-chart-tab'); await page.waitForTimeout(600);
  await page.screenshot({ path: `gap-${n}-1366.png` });
  console.log(n, await page.evaluate(() => Math.round(scrollY)));
}
await b.close();
