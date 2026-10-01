import { chromium } from '/home/user/flossify/node_modules/playwright/index.mjs';
const BASE = 'http://127.0.0.1:4399';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await p.goto(`${BASE}/auth/login/?any=1`);
await p.fill('#email', 'liwayway.domingo@example.com'); await p.fill('#password', 'flossify');
await Promise.all([p.waitForNavigation(), p.click('button[type="submit"]')]);
for (const id of ['1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', '9c5cddc3-e786-4050-96eb-9effd1829fba']) {
  await p.goto(`${BASE}/c/session-road/patients/${id}/#chart`, { waitUntil: 'networkidle' });
  const d = await p.$('#rec-chart details');
  if (!d) { console.log(id.slice(0, 8), 'no chart changes'); continue; }
  const sum = await d.$('summary');
  const r = await sum.boundingBox();
  await sum.click();
  console.log(id.slice(0, 8), 'summary', Math.round(r.height), (await d.innerText()).replace(/\s+/g, ' ').slice(0, 300));
  await d.screenshot({ path: `/tmp/claude-0/shots/chart-changes-${id.slice(0, 4)}.png` });
}
await b.close();
