import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const BASE = 'http://127.0.0.1:4470';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const who of ['liwayway.domingo@example.com', 'hazel.tabanao@example.com']) {
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', who); await page.fill('#password', 'flossify');
await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
await page.goto(`${BASE}/c/session-road/patients/1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb/`, { waitUntil: 'load' }); await page.waitForTimeout(400);
const out = [];
for (const w of [390, 414, 700, 767, 768, 800, 810, 820, 834, 900, 1000, 1024, 1080, 1112, 1150, 1180, 1200, 1280, 1366, 1440]) {
  await page.setViewportSize({ width: w, height: 900 }); await page.waitForTimeout(150);
  out.push(await page.evaluate((w) => {
    const bar = document.querySelector('[data-rec-bar]').getBoundingClientRect();
    const tabs = [...document.querySelectorAll('[data-rec-bar] [role=tab]')].map((t) => Math.round(t.getBoundingClientRect().top));
    return `${w}: row ${Math.round(bar.height)}px, tab tops ${[...new Set(tabs)].join('/')}, sw ${document.documentElement.scrollWidth}`;
  }, w));
}
console.log(who.split('@')[0]); console.log(out.join('\n'));
await ctx.close();
}
await b.close();
