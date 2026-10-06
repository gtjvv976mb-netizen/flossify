import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const BASE = 'http://127.0.0.1:4470';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
await page.goto(`${BASE}/c/session-road/patients/1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb/#chart`, { waitUntil: 'load' }); await page.waitForTimeout(500);
const fe = () => page.evaluate(() => { const a = document.activeElement; return `${a.tagName}${a.id ? '#' + a.id : ''}${a.dataset?.fdi ? '[fdi=' + a.dataset.fdi + ']' : ''}.${String(a.className).split(' ')[0]}`; });
for (const dlg of ['rec-plan-add', 'rec-done-add', 'rec-note-add']) {
  // palette first
  await page.click('[data-odontogram] button[data-tooth][data-fdi="26"]'); await page.waitForTimeout(250);
  await page.evaluate((dlg) => [...document.querySelectorAll(`[data-pick-open="${dlg}"]`)].find((x) => x.getClientRects().length).click(), dlg); await page.waitForTimeout(350);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  const f1 = await fe();
  // then Add ▾
  await page.click('.rec-add-btn'); await page.waitForTimeout(200);
  await page.click(`.rec-add [data-ws-open="${dlg}"]`); await page.waitForTimeout(350);
  const st = await page.evaluate((dlg) => { const d = document.getElementById(dlg); const f = [...d.querySelectorAll('form')].find((f) => !f.hidden && !f.dataset.planFdi && f.querySelector('input[name=back]')); return { back: f?.querySelector('input[name=back]').value, hash: f?.action.split('#')[1], pick: f?.querySelector('[data-pick-tooth]')?.value ?? null, teeth: [...d.querySelectorAll('input[type=checkbox]:checked, input[type=radio]:checked')].map((x) => x.value).slice(0, 5) }; }, dlg);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  const f2 = await fe();
  console.log(dlg, 'palette close →', f1, '| Add ▾ open', JSON.stringify(st), 'close →', f2);
}
await b.close();
