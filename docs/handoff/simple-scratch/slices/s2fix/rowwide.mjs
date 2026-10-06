// The row with a wider font and a count on Today (S4 adds one): still one line at every width? node rowwide.mjs
import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const BASE = 'http://127.0.0.1:4470';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
for (const font of [null, 'DejaVu Sans', 'Verdana']) {
  await page.goto(`${BASE}/c/session-road/patients/1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb/`, { waitUntil: 'load' }); await page.waitForTimeout(300);
  await page.evaluate((font) => {
    if (font) { const st = document.createElement('style'); st.textContent = `.rec-bar, .rec-bar * { font-family: "${font}" !important; }`; document.head.append(st); }
    const t = document.getElementById('rec-rec-overview-tab');
    t.insertAdjacentHTML('beforeend', '<span class="rec-nav-count"><span aria-hidden="true">12</span></span>');
    const c = document.getElementById('rec-rec-chart-tab').querySelector('.rec-nav-count > [aria-hidden]'); if (c) c.textContent = '14';
  }, font);
  const out = [];
  for (const w of [768, 834, 900, 1024, 1080, 1112, 1200, 1280, 1366, 1440]) {
    await page.setViewportSize({ width: w, height: 900 }); await page.waitForTimeout(200);
    out.push(await page.evaluate((w) => { const bar = document.querySelector('[data-rec-bar]'); const tops = new Set([...bar.querySelectorAll('[role=tab]')].map((t) => t.offsetTop)); return `${w}:${bar.dataset.fit ?? 'full'}/${Math.round(bar.getBoundingClientRect().height)}${tops.size > 1 ? ' WRAPPED' : ''}`; }, w));
  }
  console.log(font ?? 'page font', await page.evaluate(() => getComputedStyle(document.querySelector('.rec-nav-item')).fontFamily.slice(0, 40)), '\n ', out.join('  '));
}
await b.close();
