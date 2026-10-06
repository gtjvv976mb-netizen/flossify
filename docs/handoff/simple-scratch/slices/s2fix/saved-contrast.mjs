// The saved line and a refused card sentence where they are drawn now (inside the card, at the offer): every text's
// contrast on its own (opaque) callout ground, light and dark, 1440 and 390. node saved-contrast.mjs
import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
import pg from '/home/user/fl-simple/node_modules/pg/lib/index.js';
const db = new pg.Client({ host: '/var/run/postgresql', user: 'root', database: 'flossify_simple' }); await db.connect();
const pid = (await db.query(`select id from patient where chart_no like 'T-LAND-%' order by created_at desc limit 1`)).rows[0].id;
const rx = (await db.query(`select id from prescription where patient_id = $1 limit 1`, [pid])).rows[0].id;
const tr = (await db.query(`select id from procedure_done where patient_id = $1 and fdi = 28 limit 1`, [pid])).rows[0]?.id; await db.end();
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let low = 99, n = 0, bad = 0;
for (const theme of ['light', 'dark']) for (const [w, h] of [[1440, 900], [390, 844]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block', colorScheme: theme });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:4470/auth/login/?any=1'); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
  await page.addInitScript((t) => { try { localStorage.setItem('theme', t); } catch {} }, theme);
  for (const u of ['?saved=recall-done#recall', '?saved=plan-accepted#treatment', `?saved=rx:${rx}#rx`, '?saved=vitals-high#vitals', '?saved=payplan-stopped#payplans', ...(tr ? [`?saved=done&treated=${tr}#chart-offer`] : [])]) {
    await page.goto(`http://127.0.0.1:4470/c/session-road/patients/${pid}/${u}`, { waitUntil: 'load' }); await page.waitForTimeout(350);
    const r = await page.evaluate(() => {
      const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; };
      const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const over = (t, u) => ({ r: t.r * t.a + u.r * (1 - t.a), g: t.g * t.a + u.g * (1 - t.a), b: t.b * t.a + u.b * (1 - t.a), a: 1 });
      const bgOf = (el) => { const st = []; for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0) { st.push(c); if (c.a >= 1) break; } } let o = { r: 255, g: 255, b: 255, a: 1 }; for (const c of st.reverse()) o = over(c, o); return { o, opaque: st.length && st[0].a >= 1 }; };
      const box = document.querySelector('[data-rec-saved]');
      if (!box) return { none: true };
      const out = [];
      for (const e of box.querySelectorAll('*')) {
        if (![...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()) || !e.getClientRects().length) continue;
        const { o, opaque } = bgOf(e); const fg = over(parse(getComputedStyle(e).color), o);
        const L1 = lum(fg), L2 = lum(o); out.push({ t: e.textContent.trim().slice(0, 30), ratio: (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05), opaque, where: box.parentElement.closest('[id]')?.id });
      }
      return { out };
    });
    if (r.none) { console.log(theme, w, u.slice(0, 30), 'NO SAVED LINE'); bad++; continue; }
    for (const x of r.out) { n++; low = Math.min(low, x.ratio); if (x.ratio < 4.5 || !x.opaque) { bad++; console.log('LOW', theme, w, u, x); } }
    console.log(theme, w, u.replace(/[0-9a-f-]{36}/, '…').padEnd(40), `#${r.out[0]?.where}`, r.out.map((x) => x.ratio.toFixed(2)).join(' '));
  }
  await ctx.close();
}
console.log(`${n} texts, lowest ${low.toFixed(2)}, ${bad} failing`);
await b.close();
