import { browser, login, rec } from './lib.mjs';
const b = await browser();
const { ctx, page } = await login(b, 'owner');
for (const p of ['maria', 'ledger', '7e57a1c0-0000-4000-8000-000000000302']) { await page.goto(rec(p)); console.log(p, await page.locator('.rec-facts').innerText()); }
await b.close();
