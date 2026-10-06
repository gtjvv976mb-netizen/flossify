// Two teal buttons on one screen: where exactly (a scroll position with both in view), for the record.
import { browser, login, rec } from './lib.mjs';
const b = await browser();
for (const [pat, tab, vw] of [['maria', 'patient', { width: 1440, height: 900 }], ['maria', 'patient', { width: 390, height: 844 }], ['rich', 'treatment-record', { width: 1440, height: 900 }], ['rich', 'treatment-record', { width: 390, height: 844 }]]) {
  const { ctx, page } = await login(b, 'owner', { viewport: vw });
  await page.goto(rec(pat, `#${tab}`), { waitUntil: 'load' }); await page.waitForTimeout(500);
  const r = await page.evaluate(async () => {
    const teal = () => [...document.querySelectorAll('main a, main button')].filter((e) => !e.closest('dialog') && e.getClientRects().length && (e.classList.contains('ws-btn-primary') || /rgb\(14, 116, 113\)/.test(getComputedStyle(e).backgroundColor)));
    for (let y = 0; y < document.documentElement.scrollHeight; y += 40) {
      scrollTo(0, y); await new Promise((r) => setTimeout(r, 20));
      const v = teal().map((e) => ({ e, r: e.getBoundingClientRect() })).filter(({ r }) => r.top >= 0 && r.bottom <= innerHeight);
      if (v.length >= 2) return { scrollY: Math.round(scrollY), both: v.map(({ e, r }) => ({ text: e.textContent.trim().replace(/\s+/g, ' '), top: Math.round(r.top), bottom: Math.round(r.bottom), bg: getComputedStyle(e).backgroundColor })) };
    }
    return null;
  });
  console.log(pat, tab, vw.width, JSON.stringify(r));
  if (r) await page.screenshot({ path: `/tmp/fl-simple-scratch/verify-S2/r3/teal-${pat}-${tab}-${vw.width}.png` });
  await ctx.close();
}
await b.close();
