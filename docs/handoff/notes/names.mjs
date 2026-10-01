import { chromium } from '/home/user/flossify/node_modules/playwright/index.mjs';
const BASE = 'http://127.0.0.1:4415';
const LIST = `${BASE}/c/session-road/patients/`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await (await browser.newContext()).newPage();
await page.goto(`${BASE}/auth/login/?any=1`);
await page.fill('#email', 'liwayway.domingo@example.com');
await page.fill('#password', 'flossify');
await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
for (const f of ['due', 'quiet', 'attention']) {
  await page.goto(`${LIST}?f=${f}&show=1000`);
  const names = await page.$$eval('tr.pts-row', (trs) => trs.map((tr) => [tr.querySelector('.pts-name').textContent.trim(), tr.querySelector('.pts-c-check').textContent.replace(/\s+/g, ' ').trim(), [...tr.querySelectorAll('.pts-c-visits .pts-line')].map((l) => l.textContent.replace(/\s+/g, ' ').trim()).slice(2).join(' / ')]));
  console.log(`${f} | ${names.map((n) => n[0]).join(', ')}`);
  if (f !== 'quiet') for (const n of names) if (n[2] || n[1].includes('update')) console.log(`   ${n[0]}: ${n[2]} ${n[1]}`);
}
await browser.close();
