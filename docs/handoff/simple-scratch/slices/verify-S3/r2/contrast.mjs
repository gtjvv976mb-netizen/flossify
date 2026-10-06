import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const BASE = 'http://127.0.0.1:4470';
const P = { maria: '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', rich: '7e57a1c0-0000-4000-8000-000000000001', vb: '7e57a1c0-0000-4000-8000-00000000fb01', ledger: '9ea415bd-4b9e-4725-80e8-391464e2c12e', pin: '7e57a1c0-0000-4000-8000-000000000301', none: '7e57a1c0-0000-4000-8000-000000000302', ask: '7e57a1c0-0000-4000-8000-000000000303' };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let lowest = 99, fails = [];
for (const theme of ['light', 'dark']) for (const how of ['device', 'chosen']) for (const [w, h] of [[1440, 900], [390, 844]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block', colorScheme: how === 'device' ? theme : (theme === 'dark' ? 'light' : 'dark') });
  const page = await ctx.newPage();
  if (how === 'chosen') await page.addInitScript((t) => { try { localStorage.setItem('theme', t); } catch {} }, theme);
  await page.goto(BASE + '/auth/login/?any=1'); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('[data-go]')]);
  for (const [n, id] of Object.entries(P)) {
    await page.goto(`${BASE}/c/session-road/patients/${id}/#chart`, { waitUntil: 'networkidle' });
    await page.evaluate(() => { const y = document.querySelector('[data-rec-bar]').getBoundingClientRect().top + scrollY; scrollTo(0, y + 400); });
    await page.waitForTimeout(300);
    const res = await page.evaluate(() => {
      const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) { const m2 = c.match(/color\(srgb ([^)]+)\)/); if (!m2) return null; const p = m2[1].split(/[\s/]+/).map(Number); return [p[0] * 255, p[1] * 255, p[2] * 255, p[3] ?? 1]; } const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; };
      const over = (a, b) => [a[0] * a[3] + b[0] * (1 - a[3]), a[1] * a[3] + b[1] * (1 - a[3]), a[2] * a[3] + b[2] * (1 - a[3]), 1];
      const bgOf = (el) => { const layers = []; for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; } } let acc = [255, 255, 255, 1]; if (!layers.length || layers[layers.length - 1][3] < 1) acc = parse(getComputedStyle(document.body).backgroundColor) || acc; for (let i = layers.length - 1; i >= 0; i--) acc = over(layers[i], acc); return acc; };
      const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
      const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
      const roots = [document.querySelector('.rec-back').parentElement, document.querySelector('[data-rec-pin]'), document.querySelector('.rec-pin-line')].filter(Boolean);
      const out = [];
      for (const r of roots) {
        const walker = document.createTreeWalker(r, NodeFilter.SHOW_TEXT);
        for (let t; (t = walker.nextNode());) {
          if (!t.textContent.trim()) continue; const el = t.parentElement; const s = getComputedStyle(el);
          const rect = el.getBoundingClientRect(); if (s.visibility === 'hidden' || s.display === 'none' || !rect.width || el.closest('[hidden]') || el.closest('.sr-only') || el.closest('dialog:not([open])')) continue;
          const fg = parse(s.color); const bg = bgOf(el); const c = cr(over(fg, bg), bg);
          out.push({ t: t.textContent.trim().slice(0, 40), c: Math.round(c * 100) / 100, where: r.matches('[data-rec-pin]') ? 'pin' : r.matches('.rec-pin-line') ? 'line' : 'head' });
        }
      }
      return { theme: document.documentElement.dataset.theme ?? '', out, pinned: document.querySelector('[data-rec-bar]').hasAttribute('data-pinned') };
    });
    for (const o of res.out) { if (o.c < lowest) lowest = o.c; if (o.c < 4.5) fails.push(`${theme}/${how} ${w} ${n} ${o.where}: "${o.t}" ${o.c}`); }
    console.log(`${theme}/${how} ${w} ${n}: ${res.out.length} texts, pinned=${res.pinned}, min ${Math.min(...res.out.map((o) => o.c))}`);
  }
  await ctx.close();
}
console.log('lowest', lowest); console.log(fails.length ? fails.join('\n') : 'no fails');
await b.close();
