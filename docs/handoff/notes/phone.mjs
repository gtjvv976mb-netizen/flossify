import { chromium } from '/home/user/flossify/node_modules/playwright/index.mjs';
const BASE='http://127.0.0.1:4471', PID='1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
for (const W of [390, 1440]) {
  const ctx = await b.newContext({ viewport: { width: W, height: 844 } }); const p = await ctx.newPage();
  await p.goto(`${BASE}/auth/login/?any=1`); await p.fill('#email','liwayway.domingo@example.com'); await p.fill('#password','flossify');
  await Promise.all([p.waitForNavigation(), p.click('[data-go]')]);
  await p.goto(`${BASE}/c/session-road/patients/${PID}/`); await p.waitForLoadState('networkidle');
  const r = await p.evaluate(() => {
    const top = (s) => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().top + scrollY) : null; };
    const nav = document.querySelector('.rec-tabs');
    const tabs = [...document.querySelectorAll('.rec-nav [role=tab]')];
    const inView = tabs.filter((t) => { const r = t.getBoundingClientRect(); return r.right <= innerWidth && r.left >= 0; }).length;
    return { navTop: top('.rec-nav'), stripTop: top('#this-visit'), sectionTop: top('[data-rec-panel]:not([hidden])'), navScrollW: nav.scrollWidth, navClientW: nav.clientWidth, tabsInView: inView, docH: document.documentElement.scrollHeight };
  });
  console.log(W, JSON.stringify(r));
  await ctx.close();
}
await b.close();
