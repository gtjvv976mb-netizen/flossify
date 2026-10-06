import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const BASE = 'http://127.0.0.1:4470';
const RICH = '7e57a1c0-0000-4000-8000-000000000001', T = '7e57a1c0-0000-4000-8000-0000000000d1';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [w, h] of [[1440, 900], [1366, 768], [390, 844], [820, 1180], [1024, 768]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
  for (const qs of [`?saved=done&treated=${T}&back=overview#chart-offer`, `?saved=done&treated=${T}&back=chart#chart-offer`, `?saved=charted&treated=${T}&chartskip=changed#chart-offer`]) {
    await page.goto('about:blank');
    await page.goto(`${BASE}/c/session-road/patients/${RICH}/${qs}`, { waitUntil: 'load' }); await page.waitForTimeout(700);
    const r = await page.evaluate(() => { const bar = document.querySelector('[data-rec-bar]').getBoundingClientRect(); const o = document.getElementById('chart-offer'); const or = o?.getBoundingClientRect(); const sel = document.querySelector('[role=tab][aria-selected=true]'); const saved = document.querySelector('#rec-chart > .ws-callout'); return { tab: sel?.id, bar: Math.round(bar.bottom), offer: or ? [Math.round(or.top), Math.round(or.bottom)] : null, saved: saved ? [Math.round(saved.getBoundingClientRect().top), saved.innerText.slice(0, 30)] : null, y: Math.round(scrollY) }; });
    console.log(w, qs.split('&')[0], qs.includes('back=overview') ? 'back=overview' : '', JSON.stringify(r), r.offer && r.offer[0] >= r.bar - 1 ? 'ok' : 'COVERED');
  }
  await ctx.close();
}
await b.close();
