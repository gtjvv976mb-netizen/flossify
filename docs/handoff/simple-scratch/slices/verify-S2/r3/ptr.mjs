// A prescription written from Today (Add ▾ › Prescription; Rich's This visit › Also › Prescription), saved through the
// real panel: it lands on Today with "Prescription saved. Print it …" and the PTR warning on screen under the row.
import { browser, login, rec, state } from './lib.mjs';
const b = await browser();
let bad = 0;
for (const vw of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  for (const [who, pat, via] of [['owner', 'maria', 'add'], ['dentist', 'maria', 'add'], ['owner', 'rich', 'strip'], ['owner', 'maria', 'add-chart'], ['owner', 'maria', 'add-patient']]) {
    const { ctx, page } = await login(b, who, { viewport: vw });
    const tab = via === 'add-chart' ? 'chart' : via === 'add-patient' ? 'patient' : 'overview';
    await page.goto(rec(pat, `#${tab}`), { waitUntil: 'load' }); await page.waitForTimeout(400);
    if (via === 'strip') {
      const btn = page.locator('#rec-overview [data-ws-open="rec-rx-add"]:visible').first();
      if (!(await btn.count())) { console.log('FAIL no strip Prescription button'); bad++; await ctx.close(); continue; }
      await btn.click();
    } else { await page.click('.rec-add-btn'); await page.waitForTimeout(200); await page.click('#rec-add [data-ws-open="rec-rx-add"]'); }
    await page.waitForTimeout(400);
    const pre = await page.evaluate(() => { const f = document.querySelector('#rec-rx-add input[name=intent][value="rx-add"]').form; return { back: f.querySelector('input[name=back]').value, hash: new URL(f.action).hash, prescriber: f.querySelector('select[name=prescriber], select[name=dentist]')?.value ?? null }; });
    await page.fill('#rec-rx-add input[name=drug] >> nth=0', 'Amoxicillin');
    const s = page.locator('#rec-rx-add input[name=strength] >> nth=0'); if (await s.count()) await s.fill('500 mg');
    const q = page.locator('#rec-rx-add input[name=qty] >> nth=0'); if (await q.count()) await q.fill('21');
    await page.fill('#rec-rx-add input[name=sig] >> nth=0', '1 capsule 3 times a day for 7 days');
    await Promise.all([page.waitForNavigation(), page.locator('#rec-rx-add button[type=submit]').click()]);
    await page.waitForTimeout(700);
    const st = await state(page);
    const line = await page.evaluate(() => {
      const bar = document.querySelector('[data-rec-bar]').getBoundingClientRect();
      const saved = [...document.querySelectorAll('[data-rec-saved]')].filter((e) => e.getClientRects().length);
      const txt = saved.map((e) => e.textContent.replace(/\s+/g, ' ').trim()).join(' | ');
      const r = saved[0]?.getBoundingClientRect();
      const print = saved[0]?.querySelector('a[href*="/rx/"]');
      return { n: saved.length, txt: txt.slice(0, 220), top: r ? Math.round(r.top) : null, bottom: r ? Math.round(r.bottom) : null, barBottom: Math.round(bar.bottom), vh: innerHeight, print: print?.getAttribute('href') ?? null, ptr: /PTR/.test(txt) };
    });
    const ok = st.tab === tab && st.url.includes(`back=${tab}`) && line.n === 1 && /Prescription saved/.test(line.txt) && line.ptr && !!line.print && line.top >= line.barBottom - 1 && line.bottom <= line.vh && st.dialogs.length === 0;
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${vw.width} ${who} ${pat} via ${via}: before ${JSON.stringify(pre)} → tab=${st.tab} url=${st.url.replace(/.*\//, '')} ${JSON.stringify(line)}`);
    await ctx.close();
  }
}
console.log(bad, 'failing');
await b.close();
