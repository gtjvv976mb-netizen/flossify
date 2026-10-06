import { browser, login, rec } from './lib.mjs';
const b = await browser();
const PATS = { maria: '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', pin: '7e57a1c0-0000-4000-8000-000000000301', none: '7e57a1c0-0000-4000-8000-000000000302', ask: '7e57a1c0-0000-4000-8000-000000000303', rich: '7e57a1c0-0000-4000-8000-000000000001', ledger: '9ea415bd-4b9e-4725-80e8-391464e2c12e' };
for (const who of ['owner', 'dentist']) {
  for (const w of [1440, 390]) {
    const { ctx, page } = await login(b, who, { viewport: { width: w, height: w > 800 ? 900 : 844 } });
    for (const [k, id] of Object.entries(PATS)) {
      await page.goto(rec(id));
      await page.waitForTimeout(300);
      const r = await page.evaluate(() => {
        const t = (s) => document.querySelector(s)?.innerText.replace(/\s+/g, ' ').trim() ?? null;
        const head = document.querySelector('[data-rec-safety]')?.closest('section,div[class*=pane],[aria-label]');
        const pesoHead = [...document.querySelectorAll('.rec-head-row, [data-rec-safety], .rec-todo, [data-rec-pin], .rec-pin-line')].map((e) => e.textContent).join(' ');
        const btns = [...document.querySelectorAll('[data-rec-safety] button, [data-rec-safety] a, [data-rec-pin] button, [data-rec-pin] a')].length;
        const sideways = document.documentElement.scrollWidth > innerWidth;
        return { facts: t('.rec-facts'), safety: t('[data-rec-safety]'), todo: t('.rec-todo'), desk: t('.rec-desk-note'), pinline: (() => { const e = document.querySelector('.rec-pin-line'); return e && e.getClientRects().length ? e.innerText.replace(/\s+/g,' ') : null; })(),
          peso: /₱|PHP|Owes|In credit|Nothing owed/.test(pesoHead), btns, sideways, role: document.querySelector('[data-rec-safety]')?.getAttribute('role'),
          anyPesoPage: /₱/.test(document.body.innerText) };
      });
      console.log(who, w, k, JSON.stringify(r));
    }
    await ctx.close();
  }
}
await b.close();
