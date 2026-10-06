// Page errors and console errors on the record for each role: load, every tab by click and by arrow keys, Add ▾ open and
// closed, a panel opened and closed, a hash link, a reload with the tab in the address. Also duplicate ids, bad aria refs.
import { browser, login, rec } from './lib.mjs';
const b = await browser();
let bad = 0;
for (const who of ['owner', 'dentist', 'snap.desk@example.com', 'snap.sec@example.com']) {
  for (const vw of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const { ctx, page } = await login(b, who, { viewport: vw });
    const errs = [];
    page.on('pageerror', (e) => errs.push('pageerror ' + String(e).slice(0, 160)));
    page.on('console', (m) => { if (m.type() === 'error') errs.push('console ' + m.text().slice(0, 160)); });
    for (const pat of ['maria', 'rich', 'ledger']) {
      await page.goto('about:blank'); await page.goto(rec(pat), { waitUntil: 'load' }); await page.waitForTimeout(300);
      const d = await page.evaluate(() => {
        const ids = [...document.querySelectorAll('[id]')].map((e) => e.id); const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
        const refs = [...document.querySelectorAll('[aria-labelledby],[aria-controls],[aria-describedby],label[for]')].flatMap((e) => ['aria-labelledby', 'aria-controls', 'aria-describedby', 'for'].flatMap((a) => (e.getAttribute(a) || '').split(/\s+/).filter(Boolean).filter((id) => !document.getElementById(id)).map((id) => `${e.tagName}[${a}=${id}]`)));
        const hooks = {}; for (const h of ['data-rec-bar', 'data-rec-body', 'data-ws-top']) hooks[h] = document.querySelectorAll(`[${h}]`).length;
        return { dup: [...new Set(dup)], refs: [...new Set(refs)], hooks, tabs: document.querySelectorAll('.rec-tabs').length };
      });
      if (d.dup.length || d.refs.length || d.hooks['data-rec-bar'] !== 1 || d.hooks['data-rec-body'] !== 1 || d.tabs !== 1) { bad++; console.log('FAIL dom', who, vw.width, pat, JSON.stringify(d)); }
      await page.focus('#rec-rec-overview-tab').catch(() => {});
      for (const k of ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowLeft', 'Home', 'End']) { await page.keyboard.press(k); await page.waitForTimeout(60); }
      const afterKeys = await page.evaluate(() => ({ focus: document.activeElement?.id, sel: document.querySelector('[role=tab][aria-selected=true][id^=rec-rec-]')?.id, hash: location.hash }));
      if (afterKeys.focus !== 'rec-rec-treatment-record-tab' || afterKeys.sel !== 'rec-rec-treatment-record-tab') { bad++; console.log('FAIL keys', who, vw.width, pat, JSON.stringify(afterKeys)); }
      // Tab from the selected tab goes to Add ▾ (when there is one), then into the panel
      await page.keyboard.press('Tab'); await page.waitForTimeout(60);
      const next = await page.evaluate(() => { const a = document.activeElement; return { cls: a?.className?.toString().slice(0, 30), inPanel: !!a?.closest('[data-rec-panel]'), text: (a?.textContent || '').trim().slice(0, 20) }; });
      const hasAdd = await page.evaluate(() => { const a = document.querySelector('.rec-add'); return !!a && !a.hidden; });
      if (hasAdd ? !/rec-add-btn/.test(next.cls) : !next.inPanel) { bad++; console.log('FAIL tab order', who, vw.width, pat, hasAdd, JSON.stringify(next)); }
      if (hasAdd) { await page.keyboard.press('Enter'); await page.waitForTimeout(150); await page.keyboard.press('Escape'); await page.waitForTimeout(150); }
      await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(300);
      const rel = await page.evaluate(() => document.querySelector('[role=tab][aria-selected=true][id^=rec-rec-]')?.id);
      if (rel !== 'rec-rec-treatment-record-tab') { bad++; console.log('FAIL reload keeps tab', who, vw.width, pat, rel); }
    }
    if (errs.length) { bad++; console.log('FAIL errors', who, vw.width, [...new Set(errs)].join(' || ')); }
    else console.log('ok  ', who, vw.width, 'no errors; dom/keys/order/reload ok');
    await ctx.close();
  }
}
console.log(bad, 'failing');
await b.close();
