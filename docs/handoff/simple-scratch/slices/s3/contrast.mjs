// S3 check: contrast of every word S3 draws or moves — the head (facts, "Owes"/"In credit" link, the safety line, the
// to-do chips, the note for the dentist, the desk note), the pinned copy (stuck, scrolled over content), the phone's
// alert line, and Edit details' birth date field — light and dark (the theme chosen), at 1440, 1366 and 390.
// Backgrounds: a text's own tint composited over the card; a card (.ws-glass, 94% white or charcoal on a blurred photo)
// composited over pure black AND over pure white, the lower ratio kept (the photo can be either). Targets ≥ 44px:
// the head's buttons and link. Sideways scroll.
import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const BASE = 'http://127.0.0.1:4470';
const P = { maria: '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', rich: '7e57a1c0-0000-4000-8000-000000000001', pin: '7e57a1c0-0000-4000-8000-000000000301',
  none: '7e57a1c0-0000-4000-8000-000000000302', ask: '7e57a1c0-0000-4000-8000-000000000303' };
const SIZES = [[1440, 900], [1366, 768], [390, 844]];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let bad = 0, n = 0, low = 99, lowAt = '';
const MEASURE = (sel) => `(() => {
  const parse = (c) => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const bgOf = (el, base) => { const stack = []; for (let e = el; e; e = e.parentElement) {
      let c = parse(getComputedStyle(e).backgroundColor);
      if ((!c || c.a === 0) && e.classList.contains('ws-glass')) c = parse(getComputedStyle(e, '::before').backgroundColor);
      if (c && c.a > 0) { stack.push(c); if (c.a >= 1) break; } }
    let out = base; for (const c of stack.reverse()) out = over(c, out); return out; };
  const ratio = (fg, bg) => { const L1 = lum(over(fg, bg)), L2 = lum(bg); return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05); };
  const out = [];
  for (const root of document.querySelectorAll(${JSON.stringify(sel)})) {
    const texts = [root, ...root.querySelectorAll('*')].filter((e) => [...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()) && e.getClientRects().length && e.checkVisibility({ visibilityProperty: true }) && !e.closest('[hidden]'));
    for (const e of texts) {
      const cs = getComputedStyle(e);
      if (cs.clip === 'rect(0px, 0px, 0px, 0px)' || e.getBoundingClientRect().width <= 1 || e.closest('.sr-only')) continue;
      const fg = parse(cs.color);
      const r = Math.min(ratio(fg, bgOf(e, { r: 0, g: 0, b: 0, a: 1 })), ratio(fg, bgOf(e, { r: 255, g: 255, b: 255, a: 1 })));
      out.push({ text: e.textContent.trim().replace(/\\s+/g, ' ').slice(0, 34), ratio: Math.round(r * 100) / 100, size: cs.fontSize });
    }
  }
  return out;
})()`;
for (const theme of ['light', 'dark']) for (const [w, h] of SIZES) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block', colorScheme: theme });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('[data-go]')]);
  await page.addInitScript((t) => { try { localStorage.setItem('theme', t); } catch {} }, theme);
  for (const [who, id] of Object.entries(P)) {
    await page.goto(`${BASE}/c/session-road/patients/${id}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(300);
    const results = [];
    results.push(['head', await page.evaluate(MEASURE('.rec-back ~ *, .ws-pane:has(> .rec-back)'))]);
    if (w < 768) results.push(['phone line', await page.evaluate(MEASURE('.rec-pin-line'))]);
    const t = await page.evaluate(() => {
      const r = (e) => e && { w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height), t: e.textContent.trim().slice(0, 20) };
      return { boxes: [...document.querySelectorAll('.rec-actions > *, .rec-owes, .rec-back, .rec-todo button')].map(r), side: document.documentElement.scrollWidth - innerWidth, theme: document.documentElement.dataset.theme };
    });
    await page.evaluate(() => { const y = document.querySelector('[data-rec-bar]').getBoundingClientRect().top + scrollY; scrollTo(0, y + 700); });
    await page.waitForTimeout(300);
    if (w >= 768) results.push(['pinned copy', await page.evaluate(MEASURE('[data-rec-bar][data-pinned] .rec-pin'))]);
    if (who === 'maria' || who === 'pin') {
      await page.evaluate(() => document.querySelector('.rec-actions [data-ws-open="details"]').click()); await page.waitForTimeout(300);
      results.push(['birth field', await page.evaluate(MEASURE('#details .field:has([data-rec-birth])'))]);
      await page.keyboard.press('Escape');
    }
    for (const [part, out] of results) {
      if (!out.length && part === 'pinned copy') { bad++; console.log(`FAIL ${theme} ${w} ${who} ${part}: nothing measured (not pinned?)`); }
      for (const x of out) { n++; if (x.ratio < low) { low = x.ratio; lowAt = `${theme} ${w} ${who} ${part} "${x.text}"`; } if (x.ratio < 4.5) { bad++; console.log(`FAIL ${theme} ${w} ${who} ${part} "${x.text}" ${x.ratio} (${x.size})`); } }
    }
    for (const x of t.boxes) if (x && (x.h < 44 || x.w < 44)) { bad++; console.log(`FAIL ${theme} ${w} ${who} target "${x.t}" ${x.w}×${x.h}`); }
    if (t.side > 0) { bad++; console.log(`FAIL ${theme} ${w} ${who} sideways ${t.side}px`); }
    console.log(`${theme}(${t.theme}) ${w} ${who.padEnd(5)} ${results.map(([p, o]) => `${p} ${o.length} texts ≥ ${o.length ? Math.min(...o.map((x) => x.ratio)) : '-'}`).join('; ')}; targets ${t.boxes.filter(Boolean).map((x) => `${x.w}×${x.h}`).join(' ')}`);
  }
  await ctx.close();
}
await b.close();
console.log(`${n} texts measured, lowest ${low} (${lowAt}); ${bad} failing`);
process.exit(bad ? 1 : 0);
