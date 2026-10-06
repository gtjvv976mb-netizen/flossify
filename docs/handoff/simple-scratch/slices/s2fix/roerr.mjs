import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await (await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' })).newPage();
const msgs = [];
page.on('console', (m) => msgs.push(`${m.type()}: ${m.text()}`)); page.on('pageerror', (e) => msgs.push(`pageerror: ${e}`));
await page.goto('http://127.0.0.1:4470/auth/login/?any=1'); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
await page.goto('http://127.0.0.1:4470/c/session-road/patients/1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb/', { waitUntil: 'load' });
await page.evaluate(() => { window.__ro = []; window.addEventListener('error', (e) => window.__ro.push(String(e.message))); });
for (let w = 1440; w >= 380; w -= 17) { await page.setViewportSize({ width: w, height: 900 }); await page.waitForTimeout(30); }
for (let w = 380; w <= 1440; w += 23) { await page.setViewportSize({ width: w, height: 900 }); await page.waitForTimeout(30); }
await page.waitForTimeout(300);
console.log('window errors:', await page.evaluate(() => window.__ro), 'console/page:', msgs.filter((m) => !/^(log|debug|info)/.test(m)));
// First paint: the fit is set by the time the row is parsed (read in a script right after it, before the module script runs)
await page.setViewportSize({ width: 834, height: 1112 });
await page.goto('http://127.0.0.1:4470/c/session-road/patients/1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb/', { waitUntil: 'commit' });
await page.waitForSelector('[data-rec-bar]', { state: 'attached' });
console.log('834 at parse:', await page.evaluate(() => document.querySelector('[data-rec-bar]').dataset.fit));
await b.close();
