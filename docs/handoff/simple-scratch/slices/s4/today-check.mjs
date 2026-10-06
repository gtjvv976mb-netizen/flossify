// S4 check: Today. (A) owner, Maria, first load: the record's controls in <main> (buttons, link-buttons, disclosures,
// tabs; menu items and dialogs apart) and the teal ones; the first to-do line and its first button above the fold.
// (B) every patient × owner/dentist × 1440/1366/390 × light/dark: every word on the Today tab ≥ 4.5:1 (its tint over
// the card, the card over black AND white, the lower kept), teal buttons on Today + head + row ≤ 1, every button and
// link on Today ≥ 44px tall and wide, no sideways scroll. (C) ?visit=<today's visit> opens Today with This visit and no
// panel; ?visit=<an earlier visit> the Treatment record with its panel (as before).
import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const BASE = 'http://127.0.0.1:4470';
const P = { maria: '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', rich: '7e57a1c0-0000-4000-8000-000000000001', ledger: '9ea415bd-4b9e-4725-80e8-391464e2c12e',
  pin: '7e57a1c0-0000-4000-8000-000000000301', none: '7e57a1c0-0000-4000-8000-000000000302', ask: '7e57a1c0-0000-4000-8000-000000000303' };
const WHO = { owner: 'liwayway.domingo@example.com', dentist: 'hazel.tabanao@example.com' };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let bad = 0, n = 0, low = 99, lowAt = '';
const fail = (m) => { bad++; console.log('FAIL', m); };
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
const FIRST = `(() => {
  const vis = (el) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && el.getClientRects().length > 0;
  const c = [...document.querySelector('main').querySelectorAll('button, a.ws-btn, summary, [role=tab]')].filter(vis).filter((e) => !e.closest('dialog') && !e.closest('.ws-menu-pop'));
  const line = document.querySelector('#rec-overview .vs-line'); const btn = line?.querySelector('.ws-btn');
  return { n: c.length, teal: c.filter((e) => e.classList.contains('ws-btn-primary')).length, names: c.map((e) => e.innerText.replace(/\\s+/g, ' ').trim().slice(0, 24)),
    lineTop: line && Math.round(line.getBoundingClientRect().top), btnBottom: btn && Math.round(btn.getBoundingClientRect().bottom), h: innerHeight };
})()`;
const PAGE = `(() => {
  const vis = (el) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && el.getClientRects().length > 0;
  const tab = document.querySelector('#rec-overview');
  const teal = [...document.querySelectorAll('main .ws-btn-primary')].filter(vis).filter((e) => !e.closest('dialog') && (tab.contains(e) || !e.closest('[data-rec-panel]')));
  const small = [...tab.querySelectorAll('button, a')].filter(vis).map((e) => { const r = e.getBoundingClientRect(); return { t: e.innerText.trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) }; }).filter((x) => x.w < 44 || x.h < 44);
  return { teal: teal.length, small, side: document.documentElement.scrollWidth - innerWidth, hidden: tab.hidden };
})()`;
for (const [role, email] of Object.entries(WHO)) for (const theme of ['light', 'dark']) for (const [w, h] of [[1440, 900], [1366, 768], [390, 844]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block', colorScheme: theme });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', email); await page.fill('#password', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('[data-go]')]);
  await page.addInitScript((t) => { try { localStorage.setItem('theme', t); } catch {} }, theme);
  for (const [who, id] of Object.entries(P)) {
    await page.goto(`${BASE}/c/session-road/patients/${id}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(250);
    const at = `${role} ${theme} ${w} ${who}`;
    if (role === 'owner' && who === 'maria' && theme === 'light' && w !== 1366) {
      const f = await page.evaluate(FIRST);
      console.log(`A ${at}: first load ${f.n} controls, ${f.teal} teal; first to-do line top ${f.lineTop}, its first button bottom ${f.btnBottom} (viewport ${f.h})`);
      console.log('  ' + f.names.join(' | '));
      if (f.n !== 16) fail(`${at} first load ${f.n} ≠ 16`);
      if (f.teal !== 1) fail(`${at} teal ${f.teal}`);
      if (!(f.btnBottom <= f.h)) fail(`${at} first to-do below the fold`);
    }
    const p = await page.evaluate(PAGE);
    if (p.hidden) fail(`${at} Today not shown first`);
    if (p.teal > 1) fail(`${at} ${p.teal} teal`);
    if (p.small.length) fail(`${at} small targets ${JSON.stringify(p.small)}`);
    if (p.side > 0) fail(`${at} sideways ${p.side}`);
    const texts = await page.evaluate(MEASURE('#rec-overview'));
    for (const t of texts) { n++; if (t.ratio < low) { low = t.ratio; lowAt = `${at} "${t.text}"`; } if (t.ratio < 4.5) fail(`${at} contrast ${t.ratio} "${t.text}"`); }
  }
  if (role === 'owner' && theme === 'light') {
    // ?visit= for today's visit: Today, This visit for it, no panel open.
    await page.goto(`${BASE}/c/session-road/patients/${P.maria}/?visit=5a055ab9-8eaa-42aa-9951-395736601384`, { waitUntil: 'networkidle' }); await page.waitForTimeout(250);
    const v = await page.evaluate(() => ({ tab: document.querySelector('[role=tab][aria-selected=true]')?.id, strip: !!document.querySelector('#rec-overview:not([hidden]) #this-visit'), meta: document.querySelector('#this-visit .ws-pane-meta')?.textContent, open: [...document.querySelectorAll('dialog[open]')].map((d) => d.id), visitField: [...document.querySelectorAll('dialog input[name=visit]')].filter((i) => i.value === '5a055ab9-8eaa-42aa-9951-395736601384').length }));
    console.log(`C ${w} ?visit=today:`, JSON.stringify(v));
    if (v.tab !== 'rec-rec-overview-tab' || !v.strip || v.open.length || !v.visitField) fail(`${w} ?visit=today ${JSON.stringify(v)}`);
    await page.goto(`${BASE}/c/session-road/patients/${P.maria}/?visit=1b9c069c-4521-41fc-b079-559aaa843e6a`, { waitUntil: 'networkidle' }); await page.waitForTimeout(250);
    const v2 = await page.evaluate(() => ({ tab: document.querySelector('[role=tab][aria-selected=true]')?.id, open: [...document.querySelectorAll('dialog[open]')].map((d) => d.id) }));
    console.log(`C ${w} ?visit=28 Sep:`, JSON.stringify(v2));
    if (v2.tab !== 'rec-rec-treatment-record-tab' || v2.open[0] !== 'rec-visit-1b9c069c-4521-41fc-b079-559aaa843e6a') fail(`${w} ?visit=past ${JSON.stringify(v2)}`);
  }
  await ctx.close();
}
await b.close();
console.log(`B: ${n} texts on Today, lowest ${low} (${lowAt})`);
console.log(`${bad} failing`);
process.exit(bad ? 1 : 0);
