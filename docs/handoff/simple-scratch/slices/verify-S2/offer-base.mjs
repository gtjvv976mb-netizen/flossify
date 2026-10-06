import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const BASE = 'http://127.0.0.1:4470';
const RICH = '7e57a1c0-0000-4000-8000-000000000001', T = '7e57a1c0-0000-4000-8000-0000000000d1';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
  for (const qs of [`?saved=done&treated=${T}#chart-offer`, `?saved=done&treated=${T}&back=chart#chart-offer`]) {
    await page.goto('about:blank');
    await page.goto(`${BASE}/c/session-road/patients/${RICH}/${qs}`, { waitUntil: 'load' }); await page.waitForTimeout(700);
    const r = await page.evaluate(() => { const top = document.querySelector('[data-ws-top]').getBoundingClientRect(); const bar = document.querySelector('[data-rec-bar]')?.getBoundingClientRect(); const cover = Math.max(top.bottom, bar?.bottom ?? 0); const c = [...document.querySelectorAll('.ws-callout')].find((x) => x.innerText.includes('Treatment recorded') && x.getClientRects().length); const r = c?.getBoundingClientRect(); return { cover: Math.round(cover), line: r ? [Math.round(r.top), Math.round(r.bottom)] : null, tab: document.querySelector('[role=tab][aria-selected=true]')?.id }; });
    console.log(w, qs.includes('back=chart') ? 'back=chart' : 'no back', JSON.stringify(r), r.line && r.line[0] >= r.cover - 1 ? 'visible' : 'HIDDEN');
  }
  await ctx.close();
}
await b.close();
