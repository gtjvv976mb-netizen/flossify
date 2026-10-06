import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await (await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' })).newPage();
await page.goto('http://127.0.0.1:4470/auth/login/?any=1'); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
await Promise.all([page.waitForNavigation(), page.click('[data-go]')]);
let bad = 0, n = 0;
for (const id of ['1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb','7e57a1c0-0000-4000-8000-000000000301','7e57a1c0-0000-4000-8000-000000000302','9ea415bd-4b9e-4725-80e8-391464e2c12e','7e57a1c0-0000-4000-8000-000000000401'])
  for (const w of [1440, 1024, 390, 360, 320]) {
    await page.setViewportSize({ width: w, height: 800 });
    await page.goto(`http://127.0.0.1:4470/c/session-road/patients/${id}/`, { waitUntil: 'networkidle' });
    const pill = await page.evaluate(() => { const p = document.querySelector(".rec-facts .pt-ref"); return [Math.round(p.getBoundingClientRect().height), getComputedStyle(p).whiteSpace]; }); console.log("pill", w, JSON.stringify(pill));
    const r = await page.evaluate(() => [...document.querySelectorAll('.rec-facts-in > span')].map((s) => { const h = s.getBoundingClientRect().height; s.style.whiteSpace = 'nowrap'; const h1 = s.getBoundingClientRect().height; s.style.whiteSpace = ''; return [s.textContent.trim().replace(/\s+/g,' '), h > h1 + 1 ? 2 : 1]; }));
    for (const [t, lines] of r) { n++; const fitsLine = t.length < 18; if (lines > 1 && fitsLine) { bad++; console.log('WRAPPED', w, t); } }
    console.log(w, id.slice(-4), JSON.stringify(r));
  }
console.log(n, 'facts,', bad, 'short ones wrapped');
await b.close();
