// Verifier: the tab row across widths (every 16px from 360 to 1600), owner and dentist, Maria (a count on Chart & plan):
// the four tabs on one line (≥768), Add ▾ on the same line, the row's height, targets ≥44, no sideways scroll, the row
// sticks under the top bar when scrolled; and a landing on #rx lands under the row.
import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const BASE = `http://127.0.0.1:${process.env.PORT_ || 4470}`;
const MARIA = '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let bad = 0;
for (const who of ['liwayway.domingo@example.com', 'hazel.tabanao@example.com']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', who); await page.fill('#password', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
  const lines = [];
  for (let w = 360; w <= 1600; w += 16) {
    await page.setViewportSize({ width: w, height: 800 });
    await page.goto('about:blank');
    await page.goto(`${BASE}/c/session-road/patients/${MARIA}/#rx`, { waitUntil: 'load' });
    await page.waitForTimeout(250);
    const s = await page.evaluate(async () => {
      const bar = document.querySelector('[data-rec-bar]');
      const tabs = [...bar.querySelectorAll('[role="tab"]')];
      const add = bar.querySelector('.rec-add > button');
      const tops = new Set(tabs.map((t) => Math.round(t.getBoundingClientRect().top)));
      const addTop = add ? Math.round(add.getBoundingClientRect().top) : null;
      const rx = document.getElementById('rx').getBoundingClientRect();
      const b = bar.getBoundingClientRect();
      const se = document.scrollingElement;
      const small = [...tabs, add].filter(Boolean).filter((t) => { const r = t.getBoundingClientRect(); return r.width < 44 || r.height < 44; }).map((t) => `${t.innerText.trim().replace(/\s+/g, ' ')} ${Math.round(t.getBoundingClientRect().width)}×${Math.round(t.getBoundingClientRect().height)}`);
      const top = document.querySelector('[data-ws-top]')?.getBoundingClientRect();
      // Clipped words: a label whose text is wider than its box.
      const clipped = tabs.flatMap((t) => [...t.querySelectorAll('.rec-nav-long, .rec-nav-short')].filter((x) => x.getClientRects().length && getComputedStyle(x).position !== 'absolute' && x.scrollWidth > x.clientWidth + 1).map((x) => x.textContent));
      return { fit: bar.dataset.fit ?? '', lines: tops.size, addSame: addTop === null || [...tops].some((t) => Math.abs(t - addTop) <= 8), h: Math.round(b.height), barTop: Math.round(b.top), barBottom: Math.round(b.bottom), topBar: Math.round(top?.bottom ?? 0), rxTop: Math.round(rx.top), sideways: se.scrollWidth - se.clientWidth, small, clipped, labels: tabs.map((t) => t.getAttribute('aria-label') ?? t.textContent.replace(/\s+/g, ' ').trim()).join('|') };
    });
    const fail = [];
    if (w >= 768 && s.lines !== 1) fail.push(`tabs on ${s.lines} lines`);
    if (w >= 768 && !s.addSame) fail.push('Add ▾ on another line');
    if (s.sideways > 0) fail.push(`sideways ${s.sideways}`);
    if (s.small.length) fail.push(`small ${s.small.join(', ')}`);
    if (s.clipped.length) fail.push(`clipped ${s.clipped.join(', ')}`);
    if (s.rxTop < s.barBottom - 1) fail.push(`#rx at ${s.rxTop} under the row (${s.barBottom})`);
    if (s.barTop < s.topBar - 1) fail.push(`row ${s.barTop} under the top bar ${s.topBar}`);
    if (fail.length) bad++;
    lines.push(`${who.split('.')[0].padEnd(9)} ${String(w).padEnd(5)} fit=${s.fit.padEnd(8)} h=${s.h} row@${s.barTop}-${s.barBottom} topbar ${s.topBar} #rx@${s.rxTop} ${fail.length ? 'FAIL ' + fail.join('; ') : 'ok'}`);
  }
  console.log(lines.join('\n'));
  console.log('errors:', errors.length ? errors.join(' | ') : 'none');
  await ctx.close();
}
await browser.close();
console.log(bad ? `${bad} failing` : 'all ok');
