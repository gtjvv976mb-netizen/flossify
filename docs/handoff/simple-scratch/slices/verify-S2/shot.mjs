import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const BASE = 'http://127.0.0.1:4470';
const [w, h, path, who = 'liwayway.domingo@example.com', patient = '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', scroll = '0', js = ''] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: +w, height: +h }, serviceWorkers: 'block' });
const page = await ctx.newPage();
await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', who); await page.fill('#password', 'flossify');
await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
await page.goto(`${BASE}/c/session-road/patients/${patient}/${process.env.Q ?? ''}`, { waitUntil: 'load' }); await page.waitForTimeout(500);
if (js) { await page.evaluate(js); await page.waitForTimeout(400); }
await page.evaluate((y) => scrollTo(0, +y), scroll); await page.waitForTimeout(300);
await page.screenshot({ path });
await b.close();
