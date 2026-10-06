// The tab row and Add ▾: every text's contrast against its own background (the row is opaque, so the background is
// the nearest ancestor with a colour), light and dark (the theme chosen, data-theme), at 1440 and 390, the page
// scrolled so the row is stuck over content, and Add ▾ open. Also each tab's and each item's box (≥ 44px).
import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
import pg from '/home/user/fl-simple/node_modules/pg/lib/index.js';
const BASE = `http://127.0.0.1:${process.env.PORT_ || 4470}`;
const REC = `${BASE}/c/session-road/patients/1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb/`;
const db = new pg.Client({ host: '/var/run/postgresql', user: 'root', database: 'flossify_simple' }); await db.connect();
await db.query(`delete from throttle where key like 'login:%'`); await db.end();
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let bad = 0, n = 0, low = 99;
for (const theme of ['light', 'dark']) for (const [w, h] of (process.env.SIZES_ ? JSON.parse(process.env.SIZES_) : [[1440, 900], [390, 844]])) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block', colorScheme: theme });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
  await page.addInitScript((t) => { try { localStorage.setItem('theme', t); } catch {} }, theme);
  await page.goto(REC, { waitUntil: 'load' }); await page.waitForTimeout(400);
  await page.evaluate(() => scrollTo(0, 1500)); await page.waitForTimeout(200);
  for (const state of ['closed', 'open']) {
    if (state === 'open') { await page.evaluate(() => document.querySelector('.rec-add-btn').click()); await page.waitForTimeout(300); }
    const r = await page.evaluate(() => {
      const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; };
      const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
      const bgOf = (el) => { const stack = []; for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0) { stack.push(c); if (c.a >= 1) break; } } let out = { r: 255, g: 255, b: 255, a: 1 }; for (const c of stack.reverse()) out = over(c, out); return out; };
      const out = [];
      const texts = [...document.querySelectorAll('[data-rec-bar] *')].filter((e) => [...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()) && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
      for (const e of texts) {
        const cs = getComputedStyle(e);
        if (cs.clip === 'rect(0px, 0px, 0px, 0px)' || e.getBoundingClientRect().width <= 1) continue;
        const fg = parse(cs.color), bg = bgOf(e);
        const L1 = lum(over(fg, bg)), L2 = lum(bg);
        const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
        out.push({ text: e.textContent.trim().slice(0, 28), ratio: Math.round(ratio * 100) / 100, size: cs.fontSize });
      }
      const boxes = [...document.querySelectorAll('[data-rec-bar] [role=tab], .rec-add-btn, #rec-add:not([hidden]) .ws-menu-item')].filter((e) => e.getClientRects().length).map((e) => ({ t: e.textContent.trim().slice(0, 20), w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height) }));
      return { out, boxes, dark: document.documentElement.dataset.theme ?? '', sw: document.documentElement.scrollWidth, iw: innerWidth };
    });
    for (const t of r.out) { n++; low = Math.min(low, t.ratio); if (t.ratio < 4.5) { bad++; console.log(`FAIL ${theme} ${w} ${state} "${t.text}" ${t.ratio} (${t.size})`); } }
    for (const x of r.boxes) if (x.h < 44 || x.w < 44) { bad++; console.log(`FAIL ${theme} ${w} ${state} target "${x.t}" ${x.w}×${x.h}`); }
    if (r.sw > r.iw) { bad++; console.log(`FAIL ${theme} ${w} sideways scroll ${r.sw} > ${r.iw}`); }
    console.log(`${theme} ${w} ${state}: ${r.out.length} texts, lowest ${Math.min(...r.out.map((t) => t.ratio))}; targets ${r.boxes.map((x) => `${x.w}×${x.h}`).join(' ')}`);
    await page.screenshot({ path: `/tmp/fl-simple-scratch/s3/run/row-${theme}-${w}-${state}.png` });
  }
  await ctx.close();
}
await b.close();
console.log(`${n} texts measured, lowest ${low}; ${bad} failing`);
if (bad) process.exit(1);
