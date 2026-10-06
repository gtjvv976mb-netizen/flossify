// S2 fix 2 check: keyboard focus is never under the stuck row (or the top bar), walking every tab of the record with
// Shift+Tab from its last control up to the row, and with Tab from the row down to its last control. Widths 1440×900,
// 1366×768, 1024×768, 768×1024, 390×844; Maria and Rich Test (every card drawn). A focus stop fails when any part of
// its box (or, for a date field, of its box) sits above the row's end, or below the screen's foot.
import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const BASE = `http://127.0.0.1:${process.env.PORT_ || 4470}`;
const PATIENTS = { maria: '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', rich: '7e57a1c0-0000-4000-8000-000000000001' };
const SIZES = (process.env.SIZES_ ?? '1440x900,1366x768,1024x768,768x1024,390x844').split(',').map((s) => s.split('x').map(Number));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let bad = 0, total = 0; const errors = [];
for (const [w, h] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
  for (const [who, pid] of Object.entries(PATIENTS)) {
    for (const tab of ['overview', 'patient', 'chart', 'treatment-record']) {
      for (const dir of ['up', 'down']) {
        await page.goto('about:blank');
        await page.goto(`${BASE}/c/session-road/patients/${pid}/#${tab}`, { waitUntil: 'load' }); await page.waitForTimeout(350);
        // MUTATE_=1: HEAD 0d1e4e6's rules back (no scroll padding; a card's id alone clears the row), to show the check sees it.
        if (process.env.MUTATE_) await page.addStyleTag({ content: 'html:has([data-rec-bar]) { scroll-padding: 0 !important; } .rec-body [id] { scroll-margin-top: calc(var(--rec-stick) + 0.75rem) !important; }' });
        await page.evaluate(([t, dir]) => {
          if (dir === 'down') { document.getElementById(`rec-rec-${t}-tab`).focus(); return; }
          const p = document.getElementById('rec-' + t);
          const f = [...p.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, summary')].filter((e) => e.checkVisibility() && e.getClientRects().length && !e.closest('[hidden]'));
          f[f.length - 1].focus();
        }, [tab, dir]);
        let steps = 0, under = 0; const ex = [];
        for (let i = 0; i < 90; i++) {
          await page.keyboard.press(dir === 'up' ? 'Shift+Tab' : 'Tab');
          const s = await page.evaluate(() => {
            const a = document.activeElement;
            const top = document.querySelector('[data-ws-top]').getBoundingClientRect();
            const bar = document.querySelector('[data-rec-bar]').getBoundingClientRect();
            const cover = Math.max(top.bottom, bar.top <= top.bottom + 1 ? bar.bottom : 0);
            const r = a.getBoundingClientRect();
            return { t: r.top, b: r.bottom, cover, h: innerHeight, name: (a.innerText || a.getAttribute('aria-label') || a.name || a.tagName).replace(/\s+/g, ' ').trim().slice(0, 28), inTab: !!a.closest('[data-rec-panel]'), dialog: !!a.closest('dialog') };
          });
          if (!s.inTab) { if (dir === 'down' && steps === 0 && !s.dialog) continue; break; }
          steps++;
          // A box taller than the space under the row cannot fit: its top may sit under the row only if it fills the space.
          const tall = s.b - s.t > s.h - s.cover;
          if ((s.t < s.cover - 0.5 && !tall) || (s.b > s.h + 0.5 && !tall)) { under++; if (ex.length < 3) ex.push(`${s.name} y${Math.round(s.t)}–${Math.round(s.b)} (row ends ${Math.round(s.cover)}, screen ${s.h})`); }
        }
        total += steps; bad += under;
        console.log(`${w}x${h} ${who.padEnd(5)} ${tab.padEnd(17)} ${dir.padEnd(4)} focus stops ${String(steps).padStart(3)}, under the row or below the foot: ${under} ${ex.join(' | ')}`);
      }
    }
  }
  await ctx.close();
}
await browser.close();
console.log(`page errors: ${errors.length ? errors.join(' | ') : 'none'}`);
console.log(`${total} focus stops, ${bad} hidden`);
if (bad || errors.length) process.exit(1);
