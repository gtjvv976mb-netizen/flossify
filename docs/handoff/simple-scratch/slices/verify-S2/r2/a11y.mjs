import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const BASE = 'http://127.0.0.1:4470';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
for (const w of [1440, 1064, 834, 390]) {
  await page.setViewportSize({ width: w, height: 844 });
  await page.goto(`${BASE}/c/session-road/patients/1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb/`, { waitUntil: 'load' }); await page.waitForTimeout(300);
  const snap = await page.locator('[data-rec-bar]').ariaSnapshot();
  const fit = await page.evaluate(() => document.querySelector('[data-rec-bar]').dataset.fit ?? '');
  console.log(`--- ${w} fit=${fit}\n${snap}`);
  // keyboard: focus the selected tab, arrows
  await page.focus('#rec-rec-overview-tab');
  const seq = [];
  for (const k of ['ArrowRight', 'ArrowRight', 'ArrowLeft', 'End', 'Home', 'Tab']) { await page.keyboard.press(k); await page.waitForTimeout(120); seq.push(await page.evaluate(() => { const a = document.activeElement; return (a.id || a.className || a.tagName).toString().slice(0, 30) + (a.getAttribute('aria-selected') === 'true' ? '*' : ''); })); }
  console.log('keys:', seq.join(' → '));
}
await browser.close();
