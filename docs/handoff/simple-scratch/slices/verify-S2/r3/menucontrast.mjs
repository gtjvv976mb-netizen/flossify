// Add ▾ open, stuck over scrolled content: every text in the row and the menu against the pixels behind (the
// elementsFromPoint stack composited), light and dark (device and chosen), 1440 / 1024 / 390. Plus the phone row's
// count dot and the tab icons (non-text, 3:1 against the row).
import { browser, login, rec } from './lib.mjs';
const b = await browser();
let low = 99, fails = 0, n = 0;
for (const theme of ['light', 'dark', 'chosen-dark', 'chosen-light-on-dark-device']) {
  for (const vw of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 }]) {
    const scheme = theme === 'dark' || theme === 'chosen-light-on-dark-device' ? 'dark' : 'light';
    const { ctx, page } = await login(b, 'owner', { viewport: vw, colorScheme: scheme });
    if (theme.startsWith('chosen')) await ctx.addInitScript((t) => { try { localStorage.setItem('theme', t); } catch {} }, theme === 'chosen-dark' ? 'dark' : 'light');
    for (const pat of ['rich', 'maria']) {
      await page.goto('about:blank'); await page.goto(rec(pat), { waitUntil: 'load' }); await page.waitForTimeout(400);
      await page.evaluate(() => { document.getElementById('rec-rec-chart-tab').click(); scrollTo(0, 1400); });
      await page.waitForTimeout(250);
      await page.click('.rec-add-btn'); await page.waitForTimeout(300);
      const r = await page.evaluate(() => {
        const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
        const over = (t, u) => ({ r: t.r * t.a + u.r * (1 - t.a), g: t.g * t.a + u.g * (1 - t.a), b: t.b * t.a + u.b * (1 - t.a), a: 1 });
        const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
        const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
        const pageBg = parse(getComputedStyle(document.body).backgroundColor);
        const bgAt = (el, x, y) => { const s = document.elementsFromPoint(x, y); const i = s.indexOf(el); const L = i >= 0 ? s.slice(i) : []; let col = pageBg; for (let k = L.length - 1; k >= 0; k--) { const c = parse(getComputedStyle(L[k]).backgroundColor); if (c && c.a > 0) col = over(c, col); } return col; };
        const out = [];
        const roots = [document.querySelector('[data-rec-bar]')];
        const w = document.createTreeWalker(roots[0], NodeFilter.SHOW_TEXT);
        for (let t = w.nextNode(); t; t = w.nextNode()) {
          if (!t.nodeValue.trim()) continue; const el = t.parentElement; if (!el.getClientRects().length) continue;
          const cs = getComputedStyle(el); if (/rect\(0/.test(cs.clip)) continue; if (el.closest('.sr-only')) continue;
          const rg = document.createRange(); rg.selectNodeContents(t); const rc = [...rg.getClientRects()].find((q) => q.width > 0); if (!rc) continue;
          const x = rc.left + Math.min(rc.width / 2, 6), y = rc.top + rc.height / 2; if (y < 0 || y > innerHeight) continue;
          const bg = bgAt(el, x, y); const fg = over(parse(cs.color), bg);
          out.push({ t: t.nodeValue.trim().slice(0, 28), r: Math.round(ratio(fg, bg) * 100) / 100 });
        }
        // non-text: the tab icons' glyph against their tile, the dot against the row
        for (const ic of document.querySelectorAll('[data-rec-bar] .rec-nav-icon svg')) { const tile = ic.parentElement; const tc = getComputedStyle(ic).color; const r = tile.getBoundingClientRect(); const bg = bgAt(tile, r.left + 2, r.top + 2); out.push({ t: 'icon ' + (tile.closest('[role=tab]')?.id ?? 'add'), r: Math.round(ratio(over(parse(tc), bg), bg) * 100) / 100, nonText: true }); }
        const dot = [...document.querySelectorAll('.rec-nav-dot')].find((d) => d.getClientRects().length); if (dot) { const r = dot.getBoundingClientRect(); const row = document.querySelector('[data-rec-bar]'); const bg = bgAt(row, r.right + 3, r.top + 4); out.push({ t: 'dot', r: Math.round(ratio(parse(getComputedStyle(dot).backgroundColor), bg) * 100) / 100, nonText: true }); }
        const barR = document.querySelector('[data-rec-bar]').getBoundingClientRect(); const top = document.querySelector('[data-ws-top]').getBoundingClientRect();
        return { out, stuck: Math.abs(barR.top - top.bottom) < 2, theme: document.documentElement.dataset.theme ?? null };
      });
      for (const x of r.out) { n++; const need = x.nonText ? 3 : 4.5; if (x.r < need) { fails++; console.log('FAIL', theme, vw.width, pat, JSON.stringify(x)); } if (!x.nonText) low = Math.min(low, x.r); }
      console.log(theme, vw.width, pat, 'stuck', r.stuck, 'data-theme', r.theme, 'texts', r.out.filter((x) => !x.nonText).length, 'lowest', Math.min(...r.out.filter((x) => !x.nonText).map((x) => x.r)), 'nontext lowest', Math.min(...r.out.filter((x) => x.nonText).map((x) => x.r)));
    }
    await ctx.close();
  }
}
console.log('checked', n, 'fails', fails, 'lowest text', low);
await b.close();
