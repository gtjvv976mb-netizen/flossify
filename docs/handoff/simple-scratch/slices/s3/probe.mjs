// node probe.mjs <w> <h> <patient> <js-expression-file>
import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const BASE = 'http://127.0.0.1:4470';
const [w, h, who, file] = process.argv.slice(2);
const P = { maria: '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', rich: '7e57a1c0-0000-4000-8000-000000000001', ledger: '9ea415bd-4b9e-4725-80e8-391464e2c12e' };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: +w, height: +h } });
const page = await ctx.newPage();
await page.goto(BASE + '/auth/login/?any=1'); await page.fill('#email', process.env.LOGIN_ || 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
await Promise.all([page.waitForNavigation(), page.click('[data-go]')]);
await page.goto(`${BASE}/c/session-road/patients/${P[who] ?? who}/${process.env.Q_ ?? ''}`, { waitUntil: 'networkidle' });
const out = await page.evaluate(fs.readFileSync(file, 'utf8'));
console.log(JSON.stringify(out, null, 1));
await b.close();
