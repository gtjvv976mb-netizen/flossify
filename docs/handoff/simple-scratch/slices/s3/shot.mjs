// node shot.mjs <label> [who] : screenshots of the head (top) and scrolled, for Maria and Rich, 1440 and 390.
import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const BASE = `http://127.0.0.1:${process.env.PORT_ || 4470}`;
const label = process.argv[2] || 'x';
const who = process.argv[3] || 'owner';
const LOGIN = { owner: 'liwayway.domingo@example.com', dentist: 'hazel.tabanao@example.com' }[who];
const P = Object.fromEntries(Object.entries({ maria: '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', rich: '7e57a1c0-0000-4000-8000-000000000001', ledger: '9ea415bd-4b9e-4725-80e8-391464e2c12e', pin: '7e57a1c0-0000-4000-8000-000000000301', none: '7e57a1c0-0000-4000-8000-000000000302', ask: '7e57a1c0-0000-4000-8000-000000000303' }).filter(([k]) => !process.env.ONLY_ || process.env.ONLY_.split(',').includes(k)));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: process.env.DARK_ ? 'dark' : 'light' });
const page = await ctx.newPage();
await page.goto(BASE + '/auth/login/?any=1'); await page.fill('#email', LOGIN); await page.fill('#password', 'flossify');
await Promise.all([page.waitForNavigation(), page.click('[data-go]')]);
for (const [k, id] of Object.entries(P)) for (const vp of [[1440, 900], [1366, 768], [390, 844]]) {
  await page.setViewportSize({ width: vp[0], height: vp[1] });
  await page.goto(`${BASE}/c/session-road/patients/${id}/${process.env.HASH_ ?? ''}`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `/tmp/fl-simple-scratch/s3/${label}-${who}-${k}-${vp[0]}-top.png` });
  await page.evaluate(() => scrollTo(0, 900));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `/tmp/fl-simple-scratch/s3/${label}-${who}-${k}-${vp[0]}-scrolled.png` });
}
await b.close();
