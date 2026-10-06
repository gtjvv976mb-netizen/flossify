// Verifier: Today's "What to do" (after a high blood pressure) and the head's BP chip, both data-rec-go="health":
// after the press, is the blood pressure advice (the Vitals card's callout) on screen?
import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const BASE = 'http://127.0.0.1:4470';
const RICH = '7e57a1c0-0000-4000-8000-000000000001';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [w, h] of [[1440, 900], [1366, 768], [390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
  for (const [name, sel] of [['This visit: What to do', '#this-visit button[data-rec-go="health"]:has-text("What to do")'], ['head BP chip', '.rec-alerts button[data-rec-go="health"]:has-text("BP")']]) {
    await page.goto('about:blank');
    await page.goto(`${BASE}/c/session-road/patients/${RICH}/`, { waitUntil: 'load' }); await page.waitForTimeout(400);
    const b = page.locator(sel).first();
    if (!(await b.count())) { console.log(w, name, 'not on the page'); continue; }
    await b.click(); await page.waitForTimeout(600);
    const s = await page.evaluate(() => {
      const vis = (el) => !!el && el.checkVisibility() && el.getClientRects().length > 0;
      const bar = document.querySelector('[data-rec-bar], .rec-tabs, [role=tablist]');
      const barB = bar ? bar.getBoundingClientRect() : null;
      const stuck = barB && barB.top < 100 ? barB.bottom : 0;
      const adv = [...document.querySelectorAll('#vitals .ws-callout')].find(vis);
      const r = adv?.getBoundingClientRect();
      const big = document.querySelector('#vitals .vt-big')?.getBoundingClientRect();
      const sel = document.querySelector('[role="tab"][aria-selected="true"]');
      const hr = document.getElementById('health').getBoundingClientRect();
      return { tab: sel?.id, advice: r ? `${Math.round(r.top)}–${Math.round(r.bottom)}` : 'none', adviceOn: !!r && r.top >= stuck - 2 && r.bottom <= innerHeight, reading: big ? Math.round(big.top) : null, readingOn: !!big && big.top >= stuck - 2 && big.bottom <= innerHeight, healthTop: Math.round(hr.top), stuck: Math.round(stuck), vh: innerHeight };
    });
    console.log(`${w} ${name.padEnd(24)} tab=${s.tab} row ends ${s.stuck} · BP reading y=${s.reading} on screen=${s.readingOn} · advice ${s.advice} on screen=${s.adviceOn} · #health y=${s.healthTop}`);
  }
  await ctx.close();
}
await browser.close();
