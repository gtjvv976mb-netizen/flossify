// Contrast, targets and sideways scroll for the pages this round changed: the record with its This visit strip,
// the charge page with Paid now open, the Dashboard (rows with steps and waiting), Clinic settings' new switches.
// Light and dark (chosen through localStorage.theme), 1440 and 390. Contrast is computed from each visible text
// node's colour against the first opaque background behind it, composited through translucent ancestors.
import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:4399';
const SLUG = 'session-road';
const MARIA = '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', VISIT = '1b9c069c-4521-41fc-b079-559aaa843e6a';
const JOEL = 'b4121c23-8dbc-4f9e-91cc-ea8fbd2df542', JVISIT = '1bb3da6b-9e32-4630-a975-e0b69a29f293';
const PAGES = [
  ['record-strip', `/c/${SLUG}/patients/${MARIA}/?visit=${VISIT}`, '#this-visit'],
  ['record-strip-open', `/c/${SLUG}/patients/${JOEL}/?visit=${JVISIT}`, '#this-visit'],
  ['charge', `/c/${SLUG}/finances/new/?patient=${MARIA}&visit=${VISIT}`, '#pay'],
  ['dashboard', `/c/${SLUG}/`, '#patients, #calendar'],
  ['settings', `/c/${SLUG}/settings/#profile`, '#profile'],
];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const MEASURE = `(() => {
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const parse = (s) => { const m = s.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(',').map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const over = (top, under) => { const a = top[3]; return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), 1]; };
  const bgOf = (el) => {
    let layers = [];
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      const c = parse(cs.backgroundColor);
      if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
      const before = getComputedStyle(e, '::before');
      const bc = parse(before.backgroundColor);
      if (before.content !== 'none' && bc && bc[3] > 0 && before.position === 'absolute') { layers.push(bc); if (bc[3] >= 1) break; }
    }
    let bg = [255, 255, 255, 1];
    const body = parse(getComputedStyle(document.body).backgroundColor); if (body && body[3] > 0) bg = over(body, bg);
    for (const l of layers.reverse()) bg = over(l, bg);
    return bg;
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const out = []; let n;
  while ((n = walker.nextNode())) {
    const t = n.textContent.trim(); if (!t) continue;
    const el = n.parentElement; if (!el || el.closest('script, style, noscript, [hidden], dialog:not([open]), .sr-only')) continue;
    const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.opacity === '0') continue;
    if (!el.closest(SCOPE)) continue;
    const fg = parse(cs.color); if (!fg) continue;
    const bg = bgOf(el);
    const f = fg[3] < 1 ? over(fg, bg) : fg;
    const L1 = lum(f), L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    out.push({ t: t.slice(0, 40), ratio: Math.round(ratio * 100) / 100, size: parseFloat(cs.fontSize) });
  }
  const targets = [...document.querySelectorAll(SCOPE)].flatMap((s) => [...s.querySelectorAll('a, button, input:not([type=hidden]), select, textarea, label.chip-radio, label.check')])
    .filter((e) => !e.closest('[hidden], dialog:not([open])') && e.getBoundingClientRect().width > 0)
    .map((e) => ({ t: (e.getAttribute('aria-label') || e.textContent || e.name || '').trim().slice(0, 30), h: Math.round(e.getBoundingClientRect().height), w: Math.round(e.getBoundingClientRect().width) }))
    .filter((x) => x.h < 44 && !(x.t === '' && x.h === 0));
  return { n: out.length, low: out.filter((x) => x.ratio < 4.5).slice(0, 12), lowest: out.reduce((m, x) => Math.min(m, x.ratio), 99), small: targets.slice(0, 12), scroll: [document.documentElement.scrollWidth, innerWidth] };
})()`;
for (const theme of ['light', 'dark']) {
  for (const width of [1440, 390]) {
    const ctx = await b.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 } });
    await ctx.addInitScript((t) => { try { localStorage.setItem('theme', t); } catch {} }, theme);
    const p = await ctx.newPage();
    await p.goto(`${BASE}/auth/login/?any=1`);
    await p.fill('#email', 'liwayway.domingo@example.com');
    await p.fill('#password', 'flossify');
    await Promise.all([p.waitForNavigation(), p.click('button[type="submit"]')]);
    for (const [name, url, scope] of PAGES) {
      await p.goto(BASE + url, { waitUntil: 'networkidle' });
      if (name === 'charge') { await p.check('[data-pay-now]'); await p.waitForTimeout(150); }
      if (name === 'dashboard') await p.waitForTimeout(600);
      const r = await p.evaluate(`(() => { const SCOPE = ${JSON.stringify(scope)}; return ${MEASURE}; })()`);
      console.log(`${theme} ${width} ${name}: ${r.n} lines, lowest ${r.lowest}, under 4.5: ${JSON.stringify(r.low)}, small targets: ${JSON.stringify(r.small)}, scroll ${r.scroll[0]}/${r.scroll[1]}`);
      if (width === 390 || name === 'record-strip') await p.screenshot({ path: `/tmp/claude-0/shots/m-${name}-${theme}-${width}.png` });
    }
    await ctx.close();
  }
}
await b.close();
