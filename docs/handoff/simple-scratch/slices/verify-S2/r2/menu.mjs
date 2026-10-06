import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const BASE = 'http://127.0.0.1:4470';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const who of ['liwayway.domingo@example.com', 'hazel.tabanao@example.com']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', who); await page.fill('#password', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
  for (const [w, h] of [[1440, 900], [1366, 768], [1024, 768], [768, 1024], [390, 844], [360, 640]]) {
    for (const scroll of [0, 1200]) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('about:blank');
      await page.goto(`${BASE}/c/session-road/patients/1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb/`, { waitUntil: 'load' }); await page.waitForTimeout(300);
      await page.evaluate((y) => scrollTo(0, y), scroll); await page.waitForTimeout(150);
      await page.click('.rec-add > button'); await page.waitForTimeout(350);
      const s = await page.evaluate(() => {
        const pop = document.querySelector('.rec-add .ws-menu-pop'); const r = pop.getBoundingClientRect();
        const items = [...pop.querySelectorAll('.ws-menu-item')];
        const last = items[items.length - 1].getBoundingClientRect();
        const se = document.scrollingElement;
        // is the last item reachable: inside the pop's scroll box, and the pop inside the screen
        return { hidden: pop.hidden, l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom), vw: innerWidth, vh: innerHeight, sideways: se.scrollWidth - se.clientWidth, scrollable: pop.scrollHeight > pop.clientHeight + 1, overflowY: getComputedStyle(pop).overflowY, lastBottom: Math.round(last.bottom), n: items.length, minH: Math.min(...items.map((i) => Math.round(i.getBoundingClientRect().height))) };
      });
      const fail = [];
      if (s.hidden) fail.push('did not open');
      if (s.l < 0 || s.r > s.vw) fail.push('off the side');
      if (s.b > s.vh + 1) fail.push(`bottom ${s.b} > ${s.vh}`);
      if (s.sideways > 0) fail.push(`sideways ${s.sideways}`);
      if (s.scrollable && !/auto|scroll/.test(s.overflowY)) fail.push('cut off, no scroll');
      if (s.minH < 44) fail.push(`item ${s.minH}px`);
      console.log(`${who.split('.')[0].padEnd(9)} ${w}x${h} scroll=${scroll} pop ${s.l}-${s.r} × ${s.t}-${s.b} items=${s.n} min=${s.minH} scrollable=${s.scrollable}/${s.overflowY} ${fail.length ? 'FAIL ' + fail.join('; ') : 'ok'}`);
    }
  }
  await ctx.close();
}
await browser.close();
