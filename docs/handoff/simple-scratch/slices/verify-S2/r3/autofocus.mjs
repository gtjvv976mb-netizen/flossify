// Where focus is right after the server draws a refused panel open (the shell focuses the panel's title).
import { browser, login, rec } from './lib.mjs';
const b = await browser();
const { ctx, page } = await login(b, 'owner');
const act = () => page.evaluate(() => { const a = document.activeElement; return a === document.body ? 'BODY' : `${a.tagName}#${a.id}`; });
const base = !!process.env.BASE_;
for (const [panel, spoil, from] of [
  ['rec-vitals-add', (f) => { f.querySelectorAll('input').forEach((i) => { if (['sys', 'dia', 'pulse'].includes(i.name)) i.value = ''; }); }, 'patient'],
  ['rec-rx-add', (f) => { f.querySelectorAll('input[name=drug]').forEach((i) => { i.value = ''; }); }, 'treatment-record'],
  ['rec-lab-add', (f) => { f.querySelectorAll('input[type=text], input:not([type])').forEach((i) => { if (i.name !== 'back') i.value = ''; }); }, 'chart'],
]) {
  await page.goto('about:blank');
  await page.goto(rec('maria', base ? '' : `#${from}`), { waitUntil: 'load' }); await page.waitForTimeout(300);
  await page.evaluate((id) => window.ws.openPanel(id, null), panel); await page.waitForTimeout(400);
  await page.evaluate(([panel, src]) => { const f = document.querySelector(`#${panel} form`); f.querySelectorAll('[required]').forEach((x) => x.removeAttribute('required')); f.noValidate = true; (0, eval)(`(${src})`)(f); }, [panel, spoil.toString()]);
  await Promise.all([page.waitForNavigation({ waitUntil: 'commit' }), page.evaluate((panel) => document.querySelector(`#${panel} form`).requestSubmit(), panel)]);
  const seq = [];
  for (const t of [50, 150, 300, 600, 1200]) { await page.waitForTimeout(t - (seq.length ? [50, 150, 300, 600, 1200][seq.length - 1] : 0)); seq.push(`${t}ms:${await act()}`); }
  const open = await page.evaluate((p) => document.getElementById(p)?.open, panel);
  console.log(panel, 'open', open, seq.join(' '));
}
await b.close();
