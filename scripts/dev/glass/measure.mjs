// Usage: node measure.mjs <outdir> [base]  — screenshots + pane geometry for the home page and /start/.
import { chromium } from 'playwright';
const OUT = process.argv[2], B = process.argv[3] || 'http://127.0.0.1:4610';
const browser = await chromium.launch();
const res = {};
for (const [vpName, vp] of [['desk', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport: vp, isMobile: vpName === 'phone', hasTouch: vpName === 'phone' });
  const p = await ctx.newPage();
  await p.route('**/video/tour-*.mp4', (r) => r.fulfill({ status: 302, headers: { location: '/video/tour-test.webm' } }));
  await p.goto(`${B}/`, { waitUntil: 'load' }); await p.waitForTimeout(1500);
  const home = await p.evaluate(() => {
    const secs = [...document.querySelectorAll('main section.page')].map((s) => { const pane = s.querySelector('.pane'); const r = pane?.getBoundingClientRect(); const cs = pane && getComputedStyle(pane); return { id: s.id, secH: Math.round(s.getBoundingClientRect().height), paneW: r && Math.round(r.width), paneH: r && Math.round(r.height), bg: cs?.backgroundColor, blur: cs?.backdropFilter }; });
    return { docH: document.documentElement.scrollHeight, secs };
  });
  res[`home-${vpName}`] = home;
  let n = 0;
  for (const s of home.secs) { await p.evaluate((id) => { const el = document.getElementById(id); el.scrollIntoView({ block: 'start' }); }, s.id); await p.waitForTimeout(900); await p.screenshot({ path: `${OUT}/home-${vpName}-${String(++n).padStart(2, '0')}-${s.id}.png` }); }
  await p.goto(`${B}/start/`, { waitUntil: 'load' }); await p.waitForTimeout(1000);
  res[`start-${vpName}`] = await p.evaluate(() => ({ docH: document.documentElement.scrollHeight, bodyBg: getComputedStyle(document.body).backgroundImage.slice(0, 80), cards: [...document.querySelectorAll('main .card, main aside')].map((c) => { const r = c.getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width), bg: getComputedStyle(c).backgroundColor }; }) }));
  await p.screenshot({ path: `${OUT}/start-${vpName}-top.png` });
  await p.screenshot({ path: `${OUT}/start-${vpName}-full.png`, fullPage: true });
  await ctx.close();
}
console.log(JSON.stringify(res, null, 1));
await browser.close();
