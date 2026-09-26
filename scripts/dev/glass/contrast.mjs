// Text contrast against the pixels actually behind it, for pages with translucent (frosted) cards.
//
// Usage: node contrast.mjs <home|start|find> <light|dark> <desk|phone> [base=http://127.0.0.1:4610] [outdir]
//
// For each scroll position: collect every visible text box (Range client rects of text nodes) inside
// the cards (home: .pane; start: main), hide all text and icons, screenshot, and read the pixels
// under each text box. Dark text is judged against the DARKEST background pixels under it (3rd
// percentile), light text against the BRIGHTEST (97th). WCAG AA: 4.5:1, or 3:1 for large text
// (>= 24px, or >= 18.66px and bold). On the home page the film is live (the tour MP4 is redirected to
// the VP9 test copy the server serves, since headless Chromium has no H.264), so each position is
// measured over the frame the film is really showing there.
// Prints JSON: { page, scheme, vp, positions, checked, fails: [...worst first], min }.
import { chromium } from 'playwright';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const [page = 'home', scheme = 'light', vpName = 'desk', B = 'http://127.0.0.1:4610', OUT] = process.argv.slice(2);
const vp = { phone: { width: 390, height: 844 }, wide: { width: 1920, height: 1080 }, laptop: { width: 1280, height: 720 }, tablet: { width: 768, height: 1024 } }[vpName] ?? { width: 1440, height: 900 };
if (OUT) mkdirSync(OUT, { recursive: true });

const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: vp, colorScheme: scheme, isMobile: vpName === 'phone', hasTouch: vpName === 'phone', deviceScaleFactor: 1 });
const p = await ctx.newPage();
await p.route('**/video/tour-*.mp4', (r) => r.fulfill({ status: 302, headers: { location: '/video/tour-test.webm' } }));
await p.goto(`${B}/${{ home: '', start: 'start/', find: 'find/' }[page] ?? page}`, { waitUntil: 'load' });
await p.addStyleTag({ content: 'astro-dev-toolbar{display:none!important}' });
await p.waitForTimeout(1200);
// Play every reveal at once so nothing is measured mid-rise.
await p.evaluate(() => document.querySelectorAll('.reveal, .rule-draw, [data-lines]').forEach((e) => e.classList.add('is-in')));
await p.waitForTimeout(900);

// Scroll positions: home — each card with its top near the top, centred, and its foot near the
// bottom (tall cards stepped through); start — the whole page in steps.
const positions = await p.evaluate(([page, vh]) => {
  const out = new Set();
  const max = document.documentElement.scrollHeight - vh;
  const clamp = (y) => Math.round(Math.max(0, Math.min(max, y)));
  if (page === 'home') {
    for (const el of document.querySelectorAll('main .pane')) {
      const r = el.getBoundingClientRect(); const top = r.top + scrollY;
      out.add(clamp(top - vh * 0.12));
      out.add(clamp(top + r.height / 2 - vh / 2));
      out.add(clamp(top + r.height - vh * 0.88));
      for (let y = top - vh * 0.12 + vh * 0.6; y < top + r.height - vh * 0.88; y += vh * 0.6) out.add(clamp(y));
    }
  } else {
    for (let y = 0; y < max + vh * 0.6; y += vh * 0.6) out.add(clamp(y));
  }
  return [...out].sort((a, b) => a - b);
}, [page, vp.height]);

const HIDE = `*{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;text-decoration-color:transparent!important;caret-color:transparent!important}
*::placeholder{color:transparent!important;-webkit-text-fill-color:transparent!important} svg,img.ws-icon{visibility:hidden!important} *::marker{color:transparent!important}`;

const fails = []; let checked = 0; let min = Infinity;
let idx = 0;
for (const y of positions) {
  idx++;
  await p.evaluate((y) => { document.activeElement?.blur?.(); window.scrollTo(0, y); }, y);
  // Let the film seek to this position and paint.
  await p.evaluate(() => new Promise((res) => {
    const v = document.querySelector('[data-film-video]'); const t0 = performance.now();
    const tick = () => { if (!v || ((!v.seeking) && v.readyState >= 2) || performance.now() - t0 > 2500) res(); else requestAnimationFrame(tick); };
    setTimeout(tick, 120);
  }));
  await p.waitForTimeout(250);
  const boxes = await p.evaluate(([page]) => {
    const roots = page === 'home' ? [...document.querySelectorAll('main .pane')] : [document.querySelector('main')];
    const vw = innerWidth, vh = innerHeight, out = [];
    const opacityOf = (el) => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) o *= +getComputedStyle(e).opacity; return o; };
    const path = (el) => { const parts = []; for (let e = el; e && e.tagName !== 'MAIN' && parts.length < 4; e = e.parentElement) parts.unshift(e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.classList.length ? '.' + [...e.classList].slice(0, 2).join('.') : '')); return parts.join(' > '); };
    for (const root of roots) {
      if (!root) continue;
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        if (!n.textContent.trim()) continue;
        const el = n.parentElement; if (!el) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        if (el.closest('.sr-only, [hidden], option, select, script, style, astro-dev-toolbar')) continue;
        const range = document.createRange(); range.selectNodeContents(n);
        // The part of the text actually drawn: clipped by the viewport and by every ancestor that
        // clips its overflow (a sideways-scrolling row cuts a pill at the card's edge).
        let cx0 = 0, cy0 = 0, cx1 = vw, cy1 = vh;
        for (let a = el; a && a !== document.body; a = a.parentElement) {
          const acs = getComputedStyle(a);
          if (acs.overflowX !== 'visible' || acs.overflowY !== 'visible') {
            const ar = a.getBoundingClientRect();
            cx0 = Math.max(cx0, ar.left + a.clientLeft); cy0 = Math.max(cy0, ar.top + a.clientTop);
            cx1 = Math.min(cx1, ar.left + a.clientLeft + a.clientWidth); cy1 = Math.min(cy1, ar.top + a.clientTop + a.clientHeight);
          }
        }
        for (const r of range.getClientRects()) {
          const x0 = Math.max(cx0, r.left), y0 = Math.max(cy0, r.top), x1 = Math.min(cx1, r.right), y1 = Math.min(cy1, r.bottom);
          if (x1 - x0 < 4 || y1 - y0 < 6) continue;
          // Covered by something else (the sticky top bar, a menu): not visible, so not measured.
          const mine = (hit) => hit && (el === hit || el.contains(hit) || hit.contains(el));
          const cx = (x0 + x1) / 2;
          if (![y0 + 1, (y0 + y1) / 2, y1 - 1].every((py) => mine(document.elementFromPoint(cx, py)))) continue;
          out.push({ x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0), color: cs.color, size: parseFloat(cs.fontSize), weight: +cs.fontWeight, op: opacityOf(el), text: n.textContent.trim().slice(0, 48), path: path(el) });
        }
      }
    }
    return out;
  }, [page]);
  const tag = await p.addStyleTag({ content: HIDE });
  await p.waitForTimeout(60);
  const png = await p.screenshot();
  await tag.evaluate((t) => t.remove());
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let posFail = 0;
  for (const b of boxes) {
    const m = b.color.match(/rgba?\(([\d.]+),?\s*([\d.]+),?\s*([\d.]+)(?:,?\s*\/?\s*([\d.]+))?\)/);
    if (!m) continue;
    const [tr, tg, tb] = [+m[1], +m[2], +m[3]]; const ta = (m[4] === undefined ? 1 : +m[4]) * b.op;
    const px = [];
    for (let yy = b.y + 1; yy < b.y + b.h - 1; yy += 1) for (let xx = b.x + 1; xx < b.x + b.w - 1; xx += 2) {
      const i = (yy * info.width + xx) * 3; px.push([data[i], data[i + 1], data[i + 2]]);
    }
    if (!px.length) continue;
    const ls = px.map(([r, g, b2]) => lum(r, g, b2)); const order = ls.map((l, i) => i).sort((a, c) => ls[a] - ls[c]);
    const med = px[order[Math.floor(order.length / 2)]];
    const comp = (bg) => [0, 1, 2].map((k) => [tr, tg, tb][k] * ta + bg[k] * (1 - ta));
    const darkText = lum(...comp(med)) < lum(...med);
    const worst = px[order[darkText ? Math.floor(order.length * 0.03) : Math.min(order.length - 1, Math.floor(order.length * 0.97))]];
    const r = ratio(lum(...comp(worst)), lum(...worst));
    const large = b.size >= 24 || (b.size >= 18.66 && b.weight >= 700);
    const need = large ? 3 : 4.5;
    checked++; min = Math.min(min, r);
    if (r < need) { posFail++; fails.push({ ratio: +r.toFixed(2), need, y, text: b.text, size: b.size, weight: b.weight, color: b.color, bg: `rgb(${worst.join(',')})`, path: b.path }); }
  }
  if (OUT && posFail) await p.screenshot({ path: `${OUT}/${page}-${scheme}-${vpName}-y${y}.png` });
}
fails.sort((a, b) => a.ratio / a.need - b.ratio / b.need);
// One line per distinct text+path (its worst position), so a card measured at three positions
// does not report the same line three times.
const seen = new Map(); for (const f of fails) { const k = f.path + '|' + f.text; if (!seen.has(k)) seen.set(k, { ...f, positions: 1 }); else seen.get(k).positions++; }
console.log(JSON.stringify({ page, scheme, vp: vpName, positions: positions.length, checked, min: +min.toFixed(2), failCount: seen.size, fails: [...seen.values()].slice(0, 60) }, null, 1));
await browser.close();
