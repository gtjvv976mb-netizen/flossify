import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
import pg from '/home/user/fl-simple/node_modules/pg/lib/index.js';
const db = new pg.Client({ host: '/var/run/postgresql', user: 'root', database: 'flossify_simple' }); await db.connect();
const pid = (await db.query(`select id from patient where chart_no like 'T-LAND-%' order by created_at desc limit 1`)).rows[0].id; await db.end();
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const page = await (await b.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' })).newPage();
  await page.goto('http://127.0.0.1:4470/auth/login/?any=1'); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
  for (const [n, u] of [['recall', '?saved=recall#recall'], ['plan', '?saved=plan-accepted#treatment'], ['lab', '?saved=lab-moved#treatment-lab']]) {
    await page.goto(`http://127.0.0.1:4470/c/session-road/patients/${pid}/${u}`, { waitUntil: 'load' }); await page.waitForTimeout(600);
    await page.screenshot({ path: `shot-${n}-${w}.png` });
  }
  if (w === 1440) for (const vw of [768, 1024]) {
    await page.setViewportSize({ width: vw, height: 768 });
    await page.goto(`http://127.0.0.1:4470/c/session-road/patients/1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb/#chart`, { waitUntil: 'load' }); await page.waitForTimeout(600);
    await page.screenshot({ path: `shot-row-${vw}.png` });
  }
}
await b.close();
