import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:4413';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext();
const p = await ctx.newPage();
await p.goto(`${BASE}/auth/login/?any=1`);
await p.fill('#email', 'liwayway.domingo@example.com');
await p.fill('#password', 'flossify');
await Promise.all([p.waitForNavigation(), p.click('button[type=submit]')]);
await p.goto(`${BASE}/c/session-road/calls/`, { waitUntil: 'networkidle' });
for (const sec of await p.locator('#confirm .cs-day').all()) {
  console.log('== ' + (await sec.locator('.cs-day-head').innerText()).replace(/\n/g, ' '));
  for (const row of await sec.locator('.cs-row').all()) console.log('  -- ' + (await row.innerText()).replace(/\n+/g, ' | '));
}
console.log('== call back');
for (const row of await p.locator('#callback .cs-row').all()) console.log('  -- ' + (await row.innerText()).replace(/\n+/g, ' | '));
console.log('lede:', await p.locator('.cs-lede').innerText());
await b.close();
