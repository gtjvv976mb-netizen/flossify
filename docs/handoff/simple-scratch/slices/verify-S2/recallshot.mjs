import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
import pg from '/home/user/fl-simple/node_modules/pg/lib/index.js';
const BASE = 'http://127.0.0.1:4470';
const db = new pg.Client({ host: '/var/run/postgresql', user: 'root', database: 'flossify_simple' }); await db.connect();
const id = '7e57a1c0-0000-4000-8000-0000000cffff'; await db.end();
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [w, h] of [[1440, 900], [834, 1112]]) {
const ctx = await b.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
const page = await ctx.newPage();
await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
await page.goto(`${BASE}/c/session-road/patients/${id}/#overview`, { waitUntil: 'load' }); await page.waitForTimeout(400);
const btn = page.locator('#rec-overview form:has(input[name=months]) button').nth(1);
await btn.scrollIntoViewIfNeeded();
await Promise.all([page.waitForNavigation(), btn.click()]); await page.waitForTimeout(700);
await page.screenshot({ path: `shots/recall-after-${w}.png` });
console.log(w, await page.evaluate(() => location.search + location.hash));
await ctx.close();
}
await b.close();
