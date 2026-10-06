// ?open=<panel> (the Dashboard's links): the panel over Today; closed with Escape, where does focus go?
import { browser, login, rec } from './lib.mjs';
const b = await browser();
const base = !!process.env.BASE_;
let bad = 0;
const { ctx, page } = await login(b, 'owner');
for (const pat of ['maria', 'rich']) {
  for (const k of ['vitals', 'note', 'rx', 'done', 'file', 'details']) {
    await page.goto('about:blank'); await page.goto(rec(pat, `?open=${k}`), { waitUntil: 'load' }); await page.waitForTimeout(700);
    const open = await page.evaluate(() => [...document.querySelectorAll('dialog[open]')].map((d) => d.id));
    await page.keyboard.press('Escape'); await page.waitForTimeout(500);
    const a = await page.evaluate(() => { const a = document.activeElement; return a === document.body ? 'BODY' : `${a.tagName}#${a.id}[${a.dataset.wsOpen ?? ''}] "${(a.textContent || '').trim().slice(0, 25)}"`; });
    const ok = open.length === 1 && a !== 'BODY';
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${pat} ?open=${k} opened ${open.join(',')} → closed, focus ${a}`);
  }
}
console.log(bad, 'with focus lost');
await b.close();
