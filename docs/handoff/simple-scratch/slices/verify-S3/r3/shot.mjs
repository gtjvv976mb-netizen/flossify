import { browser, login, rec } from './lib.mjs';
const b = await browser();
const { ctx, page } = await login(b, 'owner', { viewport: { width: 1366, height: 768 } });
await page.goto(rec('7e57a1c0-0000-4000-8000-00000000fc03')); await page.waitForTimeout(500);
await page.evaluate(() => scrollTo(0, 230)); await page.waitForTimeout(300);
await page.screenshot({ path: 'chip-covered-1366-y230.png' });
await b.close();
