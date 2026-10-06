// Verifier probe (S2, round 2): per role × patient × width × tab — sideways scroll, teal buttons in one viewport
// (scrolling the tab in steps), peso signs for a role without billing, small targets in the bar and the tab, page errors.
import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
const PORT = process.env.PORT_ || 4470;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = process.argv[2] ?? '/tmp/fl-simple-scratch/verify-S2/r2/probe.json';
const OLD = process.env.OLD_ === '1'; // the S1 build: its tabs are the 12 sections
const P = { maria: '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', ledger: '9ea415bd-4b9e-4725-80e8-391464e2c12e', rich: '7e57a1c0-0000-4000-8000-000000000001' };
const WHO = { owner: 'liwayway.domingo@example.com', dentist: 'hazel.tabanao@example.com' };
const WIDTHS = (process.env.W_ ?? '1440,1366,1024,768,390').split(',').map(Number);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const out = [];
for (const who of Object.keys(WHO)) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const lp = await ctx.newPage();
  await lp.goto(`${BASE}/auth/login/?any=1`); await lp.fill('#email', WHO[who]); await lp.fill('#password', 'flossify');
  await Promise.all([lp.waitForNavigation(), lp.click('button[type="submit"]')]);
  await lp.close();
  for (const [pn, pid] of Object.entries(P)) {
    for (const w of WIDTHS) {
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.setViewportSize({ width: w, height: w <= 400 ? 844 : w <= 1024 ? 768 : 900 });
      await page.goto(`${BASE}/c/session-road/patients/${pid}/`, { waitUntil: 'load' });
      await page.waitForTimeout(300);
      const tabs = await page.evaluate(() => [...document.querySelectorAll('[role="tab"][id^="rec-rec-"]')].map((t) => t.id));
      for (const tabId of tabs) {
        await page.evaluate((id) => { document.getElementById(id).click(); window.scrollTo(0, 0); }, tabId);
        await page.waitForTimeout(250);
        const r = await page.evaluate(async () => {
          const vis = (el) => !!el && el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && el.getClientRects().length > 0;
          const se = document.scrollingElement;
          const sideways = se.scrollWidth - se.clientWidth;
          const panel = document.querySelector('[data-rec-panel]:not([hidden]), [role="tabpanel"]:not([hidden])');
          // Teal buttons in the viewport, at each scroll step down the page.
          const H = innerHeight; let maxTeal = 0; let where = null; const steps = [];
          const full = se.scrollHeight;
          for (let y = 0; y <= full; y += Math.round(H / 3)) {
            window.scrollTo(0, y);
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
            const teal = [...document.querySelectorAll('.ws-btn-primary, .btn-primary, [class*="ws-btn-teal"]')].filter((b) => {
              if (!vis(b) || b.closest('dialog:not([open])')) return false;
              const q = b.getBoundingClientRect(); return q.bottom > 0 && q.top < H && q.width > 0;
            });
            if (teal.length > maxTeal) { maxTeal = teal.length; where = { y: Math.round(scrollY), which: teal.map((b) => b.innerText.replace(/\s+/g, ' ').trim().slice(0, 30)) }; }
            steps.push(teal.length);
            if (y + H >= full) break;
          }
          window.scrollTo(0, 0);
          // Small targets: visible buttons / links / tabs in the tab panel and the bar (not inline links in running text).
          const small = [];
          const scope = [document.querySelector('[data-rec-bar]'), panel].filter(Boolean);
          for (const s of scope) for (const el of s.querySelectorAll('button, a[href], [role="tab"], summary, input[type=checkbox], input[type=radio], select')) {
            if (!vis(el)) continue;
            const q = el.getBoundingClientRect();
            if (q.width === 0) continue;
            // inline link inside a sentence: skip (a text link, the same as before)
            if (el.tagName === 'A' && getComputedStyle(el).display === 'inline') continue;
            if (q.height < 43.5 || q.width < 43.5) small.push(`${el.tagName.toLowerCase()} "${(el.innerText || el.getAttribute('aria-label') || el.value || '').replace(/\s+/g, ' ').trim().slice(0, 28)}" ${Math.round(q.width)}×${Math.round(q.height)}`);
          }
          const text = panel?.innerText ?? '';
          const bar = document.querySelector('[data-rec-bar]')?.innerText ?? '';
          const head = document.querySelector('.ws-pane')?.innerText ?? '';
          return { sideways, maxTeal, where, steps, small: [...new Set(small)], peso: (text.match(/₱|PHP/g) ?? []).length + (bar.match(/₱/g) ?? []).length, pesoHead: (head.match(/₱/g) ?? []).length };
        });
        out.push({ who, pn, w, tab: tabId.replace(/^rec-rec-|-tab$/g, ''), ...r, errors: [...errors] });
      }
      await page.close();
    }
  }
  await ctx.close();
}
await browser.close();
writeFileSync(OUT, JSON.stringify(out, null, 1));
const pad = (s, n) => String(s ?? '').padEnd(n).slice(0, n);
for (const r of out) console.log(`${pad(r.who, 8)} ${pad(r.pn, 7)} ${pad(r.w, 5)} ${pad(r.tab, 17)} side=${pad(r.sideways, 4)} teal=${r.maxTeal} ${pad(r.where ? `@${r.where.y} ${r.where.which.join(' | ')}` : '', 70)} peso=${r.peso}/${r.pesoHead} small=${r.small.length} ${r.small.slice(0, 4).join(', ')} ${r.errors.length ? 'ERR ' + r.errors.join(' ') : ''}`);
