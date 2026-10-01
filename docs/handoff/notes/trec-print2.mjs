import { chromium } from '/home/user/flossify/node_modules/playwright/index.mjs';
const BASE = 'http://127.0.0.1:4399';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 703, height: 1000 }, colorScheme: 'dark' });
const p = await ctx.newPage();
await p.goto(`${BASE}/auth/login/?any=1`);
await p.fill('#email', 'liwayway.domingo@example.com'); await p.fill('#password', 'flossify');
await Promise.all([p.waitForNavigation(), p.click('button[type="submit"]')]);
for (const id of ['9ea415bd-4b9e-4725-80e8-391464e2c12e', '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb']) {
  await p.goto(`${BASE}/c/session-road/patients/${id}/treatment-record/`, { waitUntil: 'networkidle' });
  await p.emulateMedia({ media: 'print', colorScheme: 'dark' });
  const m = await p.evaluate(() => { const t = document.querySelector('.tr-table'); const cs = getComputedStyle(t); const bar = document.querySelector('.px-bar'); return { tw: Math.round(t.getBoundingClientRect().width), sw: t.scrollWidth, docw: document.documentElement.scrollWidth, iw: innerWidth, color: cs.color, bg: getComputedStyle(document.body).backgroundColor, bar: getComputedStyle(bar).display, thead: getComputedStyle(t.querySelector('thead')).display, over: [...t.querySelectorAll('td, th')].filter((c) => c.scrollWidth > c.clientWidth + 1).map((c) => c.textContent.trim().slice(0, 20)) }; });
  console.log(id.slice(0, 8), JSON.stringify(m));
  await p.screenshot({ path: `/tmp/claude-0/shots/trec-print-emul-${id.slice(0, 4)}.png`, fullPage: false });
  await p.emulateMedia({ media: 'screen' });
}
await b.close();
