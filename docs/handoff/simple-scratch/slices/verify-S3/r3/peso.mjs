import { browser, login, rec } from './lib.mjs';
const b = await browser();
for (const who of ['dentist', 'owner']) {
  const { ctx, page } = await login(b, who, { viewport: { width: 1440, height: 900 } });
  for (const p of ['maria', 'ledger', '7e57a1c0-0000-4000-8000-000000000302', '7e57a1c0-0000-4000-8000-000000000301']) {
    await page.goto(rec(p)); await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const head = document.querySelector('.rec-back').parentElement;
      const txt = head.innerText;
      const bar = document.querySelector('[data-rec-bar]').innerText;
      const all = document.body.innerText;
      return { headPeso: /₱/.test(txt), owes: /Owes|In credit|Nothing owed/.test(txt), barPeso: /₱/.test(bar), pagePesoCount: (all.match(/₱/g) || []).length, owesLink: document.querySelector('.rec-owes')?.getAttribute('href') ?? null };
    });
    console.log(who, p.slice(0, 12), JSON.stringify(r));
  }
  await ctx.close();
}
await b.close();
