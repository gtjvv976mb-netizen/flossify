import { browser, login, rec } from '/tmp/fl-simple-scratch/verify-S3/r2/lib.mjs';
const b = await browser();
for (const scheme of ['light','dark']) {
const { ctx, page } = await login(b, 'owner', { viewport: { width: 1366, height: 768 }, colorScheme: scheme });
for (const [n, id] of [['rich','7e57a1c0-0000-4000-8000-000000000001'],['maria','1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb']]) {
  await page.goto(rec(id)); await page.waitForTimeout(400);
  await page.evaluate(() => scrollTo(0, 400)); await page.waitForTimeout(200);
  await page.click('#rec-rec-chart-tab'); await page.waitForTimeout(600);
  await page.screenshot({ path: `/tmp/fl-simple-scratch/s3fix2/land-${n}-1366-${scheme}.png` });
}
await ctx.close(); }
await b.close();
