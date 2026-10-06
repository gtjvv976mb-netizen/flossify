import { browser, login, rec, P } from '/tmp/fl-simple-scratch/verify-S2/r3/lib.mjs';
const b = await browser();
const { ctx, page } = await login(b, 'owner');
for (const pat of ['maria', 'rich', 'ledger']) {
  await page.goto(rec(pat), { waitUntil: 'load' });
  const d = await page.evaluate(() => [...document.querySelectorAll('dialog[data-ws-panel]')].filter((x) => !x.id.startsWith('rec-visit-')).map((x) => `${x.id}:${[...x.querySelectorAll('input[name=intent]')].map((i) => i.value).join('/')}:openers=${document.querySelectorAll(`[data-ws-open="${x.id}"]`).length}`));
  console.log(pat, d.join('  '));
}
await b.close();
