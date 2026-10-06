import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const BASE = 'http://127.0.0.1:4470';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [w, h] of [[360, 740], [390, 844], [768, 1024], [1024, 768]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' }); const page = await ctx.newPage();
  await page.goto(BASE + '/auth/login/?any=1'); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('[data-go]')]);
  await page.goto(`${BASE}/c/session-road/patients/7e57a1c0-0000-4000-8000-000000000402/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => { const y = document.querySelector('[data-rec-bar]').getBoundingClientRect().top + scrollY; scrollTo(0, y + 400); }); await page.waitForTimeout(300);
  const r = await page.evaluate(() => {
    const chk = (c, box) => { const r = c.getBoundingClientRect(), br = box.getBoundingClientRect(); return { w: Math.round(r.width), over: Math.round(r.right - br.right), sw: c.scrollWidth, cw: c.clientWidth }; };
    const head = document.querySelector('[data-rec-safety] .ws-chip'); const pin = document.querySelector('[data-rec-pin] .rec-pin-chip');
    return { side: document.documentElement.scrollWidth - innerWidth, head: chk(head, head.closest('.ws-pane')), pin: getComputedStyle(document.querySelector('[data-rec-pin]')).display !== 'none' ? chk(pin, document.querySelector('[data-rec-pin]')) : null, line: document.querySelector('.rec-pin-line') && getComputedStyle(document.querySelector('.rec-pin-line')).display !== 'none' ? document.querySelector('.rec-pin-line').textContent.trim() : null };
  });
  console.log(w, JSON.stringify(r));
  await ctx.close();
}
await b.close();
