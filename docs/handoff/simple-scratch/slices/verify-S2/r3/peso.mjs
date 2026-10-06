// The peso sign in a dentist's (no finance.bill) record page: every context it appears in, visible or not, and the
// visible ones separately. node peso.mjs <out.json>
import { browser, login, rec } from './lib.mjs';
import { writeFileSync } from 'node:fs';
const b = await browser();
const { ctx, page } = await login(b, process.env.WHO_ || 'dentist');
const out = {};
const urls = { maria: rec('maria'), rich: rec('rich'), ledger: rec('ledger'), 'maria-visit': rec('maria', '?visit=1b9c069c-4521-41fc-b079-559aaa843e6a'), 'ledger-tr': rec('ledger', '#treatment-record') };
for (const [k, u] of Object.entries(urls)) {
  await page.goto('about:blank'); await page.goto(u, { waitUntil: 'load' }); await page.waitForTimeout(500);
  out[k] = await page.evaluate(() => {
    const res = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!/₱|PHP\s?\d/.test(n.nodeValue)) continue;
      const el = n.parentElement;
      const where = el.closest('dialog')?.id ?? el.closest('[role=tabpanel]')?.id ?? el.closest('[data-rec-bar]') ? 'bar' : 'head';
      res.push({ where: el.closest('dialog')?.id ?? el.closest('[role=tabpanel]')?.id ?? 'other', text: n.nodeValue.trim().replace(/\s+/g, ' ').slice(0, 80), shown: el.getClientRects().length > 0 });
    }
    // attributes (data-price, value) too
    const attrs = [...document.querySelectorAll('*')].flatMap((e) => [...e.attributes].filter((a) => /₱/.test(a.value)).map((a) => `${e.tagName}.${a.name}=${a.value.slice(0, 60)}`));
    return { texts: res, attrs, tabs: [...document.querySelectorAll('[role=tab][id^=rec-rec-]')].map((t) => t.id) };
  });
  console.log(k, 'texts', out[k].texts.length, 'shown', out[k].texts.filter((t) => t.shown).length, 'attrs', out[k].attrs.length);
  const groups = {};
  for (const t of out[k].texts) (groups[t.where] ??= []).push(t.text);
  for (const [w, xs] of Object.entries(groups)) console.log('   ', w, xs.length, JSON.stringify([...new Set(xs)].slice(0, 6)));
}
writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
await b.close();
