// Every tab (HEAD: the four; base: the twelve sections) scrolled through a screen at a time, light and dark, 1440 and
// 390: teal buttons on one screen, text contrast against the pixels behind (elementsFromPoint stack composited),
// targets under 44px, sideways scroll, and the peso sign for a person without finance.bill.
//   node sweep.mjs <out.json>   env MODE_=head|base, WHO_=owner|dentist, PAT_=maria|rich|ledger
import { browser, login, rec } from './lib.mjs';
import { writeFileSync } from 'node:fs';
const OUT = process.argv[2];
const WHO = process.env.WHO_ || 'owner';
const PAT = (process.env.PAT_ || 'maria').split(',');
const b = await browser();
const result = [];
for (const scheme of ['light', 'dark']) {
  for (const vw of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const { ctx, page } = await login(b, WHO, { viewport: vw, colorScheme: scheme });
    for (const pat of PAT) {
      await page.goto('about:blank');
      await page.goto(rec(pat), { waitUntil: 'load' }); await page.waitForTimeout(600);
      const html = await page.content();
      const pesoInHtml = (html.match(/₱/g) || []).length;
      const tabs = await page.evaluate(() => [...document.querySelectorAll('[role=tab][id^=rec-rec-]')].map((t) => t.id));
      for (const tab of tabs) {
        await page.evaluate((id) => { document.getElementById(id).click(); window.scrollTo(0, 0); }, tab);
        await page.waitForTimeout(350);
        const r = await page.evaluate(async () => {
          const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
          const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
          const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
          const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
          const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
          const bodyBg = parse(getComputedStyle(document.body).backgroundColor);
          const pageBg = bodyBg && bodyBg.a > 0 ? bodyBg : parse(getComputedStyle(document.documentElement).backgroundColor) ?? { r: 255, g: 255, b: 255, a: 1 };
          const vis = (el) => { const rs = el.getClientRects(); if (!rs.length) return false; const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.opacity !== '0'; };
          const inView = (rc) => rc.bottom > 0 && rc.top < innerHeight && rc.width > 0 && rc.height > 0;
          const isTeal = (el) => el.classList.contains('ws-btn-primary') || /rgb\(14, 116, 113\)|rgb\(13, 112, 109\)|rgb\(11, 93, 91\)/.test(getComputedStyle(el).backgroundColor);
          const pathOf = (el) => { const p = []; let e = el; while (e && e !== document.body && p.length < 6) { p.unshift(e.id ? `#${e.id}` : `${e.tagName.toLowerCase()}${e.classList[0] ? '.' + e.classList[0] : ''}`); if (e.id) break; e = e.parentElement; } return p.join('>'); };
          const bgAt = (el, x, y) => {
            const stack = document.elementsFromPoint(x, y);
            const i = stack.indexOf(el);
            let layers = i >= 0 ? stack.slice(i) : [];
            if (i < 0) { let e = el; while (e) { layers.push(e); e = e.parentElement; } }
            let col = pageBg;
            let complex = false;
            for (let k = layers.length - 1; k >= 0; k--) {
              const cs = getComputedStyle(layers[k]);
              if (cs.backgroundImage && cs.backgroundImage !== 'none' && !/url\(/.test(cs.backgroundImage)) complex = true;
              const c = parse(cs.backgroundColor);
              if (c && c.a > 0) col = over({ ...c, a: c.a * Number(cs.opacity) }, col);
            }
            return { col, complex };
          };
          const main = document.querySelector('[data-rec-body]')?.parentElement ?? document.querySelector('main') ?? document.body;
          const root = document.querySelector('main') ?? document.body;
          const H = document.documentElement.scrollHeight;
          const teal = [], contrast = new Map(), targets = new Map();
          let maxTeal = 0, maxTealAt = null, sideways = document.documentElement.scrollWidth > innerWidth;
          for (let y = 0; y < H; y += Math.round(innerHeight * 0.8)) {
            window.scrollTo(0, y); await sleep(60);
            const sy = Math.round(scrollY);
            const tealNow = [...root.querySelectorAll('a, button, summary, [role=button]')].filter((el) => !el.closest('dialog') && vis(el) && inView(el.getBoundingClientRect()) && isTeal(el));
            if (tealNow.length > maxTeal) { maxTeal = tealNow.length; maxTealAt = { y: sy, which: tealNow.map((e) => (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30)) }; }
            // text contrast
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            const seen = new Set();
            for (let n = walker.nextNode(); n; n = walker.nextNode()) {
              if (!n.nodeValue.trim()) continue;
              const el = n.parentElement;
              if (!el || seen.has(el) || el.closest('dialog, script, style, template, [aria-hidden=true] svg, .sr-only, noscript')) continue;
              seen.add(el);
              if (!vis(el)) continue;
              const range = document.createRange(); range.selectNodeContents(n);
              const rc = [...range.getClientRects()].find((q) => q.width > 0 && q.bottom > 0 && q.top < innerHeight);
              if (!rc) continue;
              const x = rc.left + Math.min(rc.width / 2, 6), yy = rc.top + rc.height / 2;
              if (x < 0 || x >= innerWidth || yy < 0 || yy >= innerHeight) continue;
              const cs = getComputedStyle(el);
              if (cs.clip && cs.clip !== 'auto' && /rect\(0/.test(cs.clip)) continue;
              const fg0 = parse(cs.color); if (!fg0) continue;
              // the topmost element at the point: is our text covered by something else (the sticky row)? then skip, the covering one is measured itself
              const top = document.elementFromPoint(x, yy);
              if (top && top !== el && !el.contains(top) && !top.contains(el)) continue;
              const { col, complex } = bgAt(el, x, yy);
              let op = 1; for (let e = el; e; e = e.parentElement) op *= Number(getComputedStyle(e).opacity);
              const fg = over({ ...fg0, a: fg0.a * op }, col);
              const rr = ratio(fg, col);
              const key = pathOf(el) + ' "' + n.nodeValue.trim().slice(0, 40) + '"';
              if (rr < 4.5 && !complex) { const prev = contrast.get(key); if (!prev || prev.ratio > rr) contrast.set(key, { ratio: Math.round(rr * 100) / 100, fg: cs.color, bg: `rgb(${Math.round(col.r)},${Math.round(col.g)},${Math.round(col.b)})`, size: cs.fontSize, y: sy }); }
            }
            // targets
            for (const el of root.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, summary, [role=tab], [role=button]')) {
              if (el.closest('dialog, .ws-menu-pop')) continue;
              if (!vis(el)) continue;
              const rc = el.getBoundingClientRect();
              if (!inView(rc)) continue;
              if (el.matches('input[type=checkbox], input[type=radio]') && el.closest('label')) continue;
              const inline = el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.parentElement && /^(P|LI|SPAN|TD|DD|SMALL|STRONG|EM)$/.test(el.parentElement.tagName);
              if (rc.height < 44 || rc.width < 44) {
                const key = pathOf(el) + ' "' + (el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 30) + '"';
                if (!targets.has(key)) targets.set(key, { w: Math.round(rc.width), h: Math.round(rc.height), inline, tag: el.tagName });
              }
            }
            if (document.documentElement.scrollWidth > innerWidth) sideways = true;
          }
          window.scrollTo(0, 0);
          let minR = null;
          return { H, maxTeal, maxTealAt, sideways, contrast: [...contrast.entries()], targets: [...targets.entries()] };
        });
        result.push({ scheme, vw: vw.width, pat, tab, pesoInHtml, ...r });
        console.log(`${scheme} ${vw.width} ${pat} ${tab.padEnd(30)} H=${r.H} teal≤${r.maxTeal} ${r.maxTealAt ? JSON.stringify(r.maxTealAt.which) : ''} contrast<4.5: ${r.contrast.length} targets<44: ${r.targets.length} (${r.targets.filter(([, t]) => !t.inline).length} not inline) sideways=${r.sideways} ₱html=${pesoInHtml}`);
      }
    }
    await ctx.close();
  }
}
writeFileSync(OUT, JSON.stringify(result, null, 1));
await b.close();
