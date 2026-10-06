// ?visit=<id> opens that visit's panel as the page loads (no opener was pressed). Closing it (Escape, Close) must give
// focus to a control on screen, never <body>. Every visit of Maria, Rich and Ledger Test; 1440 and 390. Writes nothing.
import { browser, login, rec, db } from '/tmp/fl-simple-scratch/verify-S2/r3/lib.mjs';
const c = await db();
const pats = { maria: '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', rich: '7e57a1c0-0000-4000-8000-000000000001', ledger: '9ea415bd-4b9e-4725-80e8-391464e2c12e' };
const visits = {};
for (const [k, id] of Object.entries(pats)) visits[k] = (await c.query(`select id, status, to_char(starts_at at time zone 'Asia/Manila', 'YYYY-MM-DD') d from appointment where patient_id = $1 order by starts_at`, [id])).rows;
await c.end();
const b = await browser();
let bad = 0, n = 0, none = 0;
for (const vw of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  const { ctx, page } = await login(b, 'owner', { viewport: vw });
  for (const [pat, vs] of Object.entries(visits)) for (const v of vs) for (const how of ['escape', 'close']) {
    await page.goto('about:blank');
    await page.goto(rec(pat, `?visit=${v.id}`), { waitUntil: 'load' }); await page.waitForTimeout(450);
    const open = await page.evaluate(() => [...document.querySelectorAll('dialog[open]')].map((d) => d.id));
    if (!open.length) { none++; continue; }
    if (how === 'escape') await page.keyboard.press('Escape'); else await page.locator(`#${open[0]} [data-ws-close]:visible`).first().click();
    await page.waitForTimeout(500);
    const f = await page.evaluate(() => {
      const a = document.activeElement;
      if (!a || a === document.body) return { ok: false, what: 'BODY' };
      const r = a.getBoundingClientRect();
      const hit = document.elementFromPoint(Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 1), Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 1));
      const ok = a.getClientRects().length > 0 && r.bottom > 0 && r.top < innerHeight && !!hit && (hit === a || a.contains(hit) || hit.contains(a));
      return { ok, what: `${a.tagName.toLowerCase()}${a.id ? '#' + a.id : ''} "${(a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30)}" y=${Math.round(r.top)}` };
    });
    n++; if (!f.ok) bad++;
    console.log(`${f.ok ? 'ok  ' : 'FAIL'} ${vw.width} ${pat.padEnd(6)} ${v.d} ${v.status.padEnd(10)} ${open[0].padEnd(22)} ${how.padEnd(6)} → ${f.what}`);
  }
  await ctx.close();
}
await b.close();
console.log(`${n} closes, ${bad} failing; ${none} visits opened no panel`);
