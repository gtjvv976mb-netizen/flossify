// Add ▾ for each role: every item opens its panel over the tab in view (or is the New charge link), the menu fits the
// screen with no sideways scroll, items ≥ 44px; without Add ▾ the phone row still fits.
import { browser, login, rec, state } from './lib.mjs';
const b = await browser();
let bad = 0;
const say = (ok, s) => { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${s}`); };
for (const who of ['owner', 'dentist', 'snap.sec@example.com', 'snap.desk@example.com', 'snap.asst@example.com']) {
  for (const vw of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 768, height: 1024 }]) {
    const { ctx, page } = await login(b, who, { viewport: vw });
    for (const pat of ['maria', 'ledger']) {
      await page.goto('about:blank'); await page.goto(rec(pat), { waitUntil: 'load' }); await page.waitForTimeout(400);
      const has = await page.evaluate(() => { const a = document.querySelector('.rec-add'); return !!a && !a.hidden && a.getClientRects().length > 0; });
      const row = await page.evaluate(() => { const bar = document.querySelector('[data-rec-bar]'); const r = bar.getBoundingClientRect(); const tabs = [...bar.querySelectorAll('[role=tab]')].map((t) => t.getBoundingClientRect()); return { h: Math.round(r.height), w: Math.round(r.width), right: Math.round(r.right), tabsIn: tabs.every((t) => t.right <= r.right + 0.5 && t.left >= r.left - 0.5), minTab: Math.round(Math.min(...tabs.map((t) => Math.min(t.width, t.height)))), sideways: document.documentElement.scrollWidth > innerWidth }; });
      say(row.tabsIn && !row.sideways && row.minTab >= 44, `${who} ${vw.width} ${pat} row ${JSON.stringify(row)} add=${has}`);
      if (!has) continue;
      const items = await page.evaluate(() => [...document.querySelectorAll('#rec-add .ws-menu-item')].map((i) => ({ open: i.getAttribute('data-ws-open'), href: i.getAttribute('href'), label: (i.querySelector('.ws-menu-words')?.firstChild?.textContent ?? '').trim() })));
      for (const [k, it] of items.entries()) {
        for (const tab of ['overview', 'treatment-record']) {
          await page.evaluate((t) => { document.getElementById(`rec-rec-${t}-tab`).click(); window.scrollTo(0, 400); }, tab);
          await page.waitForTimeout(150);
          await page.click('.rec-add-btn'); await page.waitForTimeout(250);
          const m = await page.evaluate((k) => { const pop = document.querySelector('#rec-add'); const el = document.querySelectorAll('#rec-add .ws-menu-item')[k]; const r = el.getBoundingClientRect(); const pr = pop.getBoundingClientRect(); return { h: Math.round(r.height), inView: r.top >= 0 && r.bottom <= innerHeight + 0.5 || pop.scrollHeight > pop.clientHeight, popRight: Math.round(pr.right), popLeft: Math.round(pr.left), sideways: document.documentElement.scrollWidth > innerWidth }; }, k);
          if (it.href) { say(m.h >= 44 && !m.sideways && m.popLeft >= 0 && m.popRight <= vw.width, `${who} ${vw.width} ${pat} ${tab} "${it.label}" link ${it.href} ${JSON.stringify(m)}`); await page.keyboard.press('Escape'); break; }
          await page.locator(`#rec-add .ws-menu-item >> nth=${k}`).click();
          await page.waitForTimeout(350);
          const st = await state(page);
          const f = await page.evaluate((id) => { const d = document.getElementById(id); const b = d?.querySelector('input[name=back]'); const form = b?.form; return { back: b?.value ?? null, hash: form ? new URL(form.action).hash : null, dialogW: Math.round(d?.getBoundingClientRect().width ?? 0), sideways: document.documentElement.scrollWidth > innerWidth }; }, it.open);
          const ok = st.dialogs.includes(it.open) && st.tab === tab && f.back === tab && f.hash === `#${tab}` && m.h >= 44 && !m.sideways && !f.sideways && m.popLeft >= 0 && m.popRight <= vw.width;
          say(ok, `${who} ${vw.width} ${pat} ${tab} "${it.label}" → ${JSON.stringify({ dialogs: st.dialogs, tab: st.tab, ...f, item: m })}`);
          await page.keyboard.press('Escape'); await page.waitForTimeout(350);
        }
      }
    }
    await ctx.close();
  }
}
console.log(bad, 'failing');
await b.close();
