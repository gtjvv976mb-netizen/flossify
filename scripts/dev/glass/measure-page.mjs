// Usage: node measure-page.mjs <outdir> <path, e.g. /coverage/> [base] — any page: screenshots + card geometry at 1440x900 and 390x844.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const OUT = process.argv[2], PATH_ = process.argv[3] || '/find/', B = process.argv[4] || 'http://127.0.0.1:4610'; const NAME = PATH_.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const res = {};
for (const [vn, vp] of [['desk', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  const p = await (await browser.newContext({ viewport: vp, isMobile: vn === 'phone', hasTouch: vn === 'phone' })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(`${B}${PATH_}`, { waitUntil: 'load' }); await p.addStyleTag({ content: 'astro-dev-toolbar{display:none!important}' }); await p.waitForTimeout(1200);
  res[vn] = await p.evaluate(() => {
    const main = document.querySelector('main');
    const top = [...main.querySelectorAll('*')].filter((el) => { const cs = getComputedStyle(el); const bg = cs.backgroundColor; const card = bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' && parseFloat(cs.borderTopLeftRadius) >= 10 && el.getBoundingClientRect().width > 200; if (!card) return false; for (let a = el.parentElement; a && a !== main; a = a.parentElement) { const b = getComputedStyle(a).backgroundColor; if (b !== 'rgba(0, 0, 0, 0)' && parseFloat(getComputedStyle(a).borderTopLeftRadius) >= 10 && a.getBoundingClientRect().width > 200) return false; } return true; });
    const cards = top.map((el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return { cls: [...el.classList].slice(0, 3).join('.'), w: Math.round(r.width), h: Math.round(r.height), bg: cs.backgroundColor, blur: cs.backdropFilter }; });
    const vh = innerHeight, vw = innerWidth;
    return { docH: document.documentElement.scrollHeight, mainW: Math.round(main.getBoundingClientRect().width), scrollW: document.documentElement.scrollWidth, bodyBg: getComputedStyle(document.body).backgroundColor, cards };
  });
  res[vn].errors = errs;
  const max = await p.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  let n = 0; for (let y = 0; y <= max + 1; y += Math.round(vp.height * 0.85)) { await p.evaluate((y) => scrollTo(0, y), Math.min(y, max)); await p.waitForTimeout(400); await p.screenshot({ path: `${OUT}/${NAME}-${vn}-${String(++n).padStart(2, '0')}.png` }); if (y >= max) break; }
  await p.screenshot({ path: `${OUT}/${NAME}-${vn}-full.png`, fullPage: true });
}
console.log(JSON.stringify(res, null, 1));
await browser.close();
