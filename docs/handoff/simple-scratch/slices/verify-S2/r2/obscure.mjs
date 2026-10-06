// Verifier: keyboard focus moving UP the page (Shift+Tab) — does a focused control end up hidden under the stuck row?
import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const BASE = 'http://127.0.0.1:4470';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
  for (const tab of ['overview', 'patient', 'chart', 'treatment-record']) {
    await page.goto('about:blank');
    await page.goto(`${BASE}/c/session-road/patients/1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb/#${tab}`, { waitUntil: 'load' }); await page.waitForTimeout(300);
    // Focus the last focusable in the tab, then walk up with Shift+Tab and record any focus that lands under the row.
    await page.evaluate((t) => { const p = document.getElementById('rec-' + t); const f = [...p.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, summary')].filter((e) => e.checkVisibility() && e.getClientRects().length && !e.closest('[hidden]')); f[f.length - 1].focus(); }, tab);
    let under = 0, total = 0; const ex = [];
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Shift+Tab');
      const s = await page.evaluate(() => { const a = document.activeElement; const bar = document.querySelector('[data-rec-bar]').getBoundingClientRect(); const top = document.querySelector('[data-ws-top]').getBoundingClientRect(); const r = a.getBoundingClientRect(); const inBar = !!a.closest('[data-rec-bar], [data-ws-top], .ws-side'); return { inBar, r: [Math.round(r.top), Math.round(r.bottom)], bar: Math.round(bar.bottom), topBar: Math.round(top.bottom), stuck: bar.top <= top.bottom + 1, name: (a.innerText || a.getAttribute('aria-label') || a.name || a.tagName).replace(/\s+/g, ' ').trim().slice(0, 30), inTab: !!a.closest('[data-rec-panel]') }; });
      if (!s.inTab) break;
      total++;
      if (s.stuck && s.r[1] <= s.bar + 1) { under++; if (ex.length < 3) ex.push(`${s.name} y${s.r[0]}-${s.r[1]} (row ends ${s.bar})`); }
      else if (s.stuck && s.r[0] < s.bar) { under++; if (ex.length < 3) ex.push(`partly: ${s.name} y${s.r[0]}-${s.r[1]} (row ends ${s.bar})`); }
    }
    console.log(`${w} ${tab.padEnd(17)} focus steps ${total}, hidden or partly hidden under the row: ${under} ${ex.join(' | ')}`);
  }
  await ctx.close();
}
await browser.close();
