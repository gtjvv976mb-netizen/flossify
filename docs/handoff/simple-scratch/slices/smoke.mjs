import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const pg = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
await pg.goto('http://127.0.0.1:4470/auth/login/?any=1');
await pg.fill('input[type=email]', 'liwayway.domingo@example.com'); await pg.fill('input[type=password]', 'flossify');
await Promise.all([pg.waitForNavigation(), pg.click('button[type=submit]')]);
for (const id of ['1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', '9ea415bd-4b9e-4725-80e8-391464e2c12e']) {
  const r = await pg.goto(`http://127.0.0.1:4470/c/session-road/patients/${id}/#consent`);
  await pg.waitForTimeout(800);
  const info = await pg.evaluate(() => ({
    tabs: [...document.querySelectorAll('[role=tab]')].filter((t) => t.closest('[data-rec-nav], nav, [role=tablist]')).map((t) => t.textContent.trim().replace(/\s+/g, ' ')).slice(0, 8),
    consentForms: !!document.getElementById('consent-forms'),
    visible: [...document.querySelectorAll('[data-rec-panel]')].filter((p) => !p.hidden).map((p) => p.dataset.recPanel),
  }));
  console.log(r.status(), JSON.stringify(info));
}
console.log('page errors:', errs.length, errs.slice(0, 3));
await b.close();
