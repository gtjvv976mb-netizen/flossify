import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
const B = process.argv[2] || 'http://127.0.0.1:4610', N = process.argv[3] || '1';
const browser = await chromium.launch();
for (const [vn, vp] of [['desk', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  execFileSync('psql', ['-d', 'flossify_glass', '-Atc', "delete from throttle where key like 'signup:%'"]);
  const p = await (await browser.newContext({ viewport: vp })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(`${B}/start/`, { waitUntil: 'load' });
  const focused = await p.evaluate(() => document.activeElement?.getAttribute('name'));
  const tag = `${N}${vn === 'desk' ? 'd' : 'p'}`;
  const fill = async (pw2) => {
    await p.fill('input[name=name]', `Glass Test Dental ${tag}`); await p.fill('input[name=address]', '1 Test Road'); await p.fill('input[name=phone]', '0917 555 0100');
    await p.fill('input[name=owner_name]', 'Dr. Test Owner'); await p.fill('input[name=owner_phone]', `0917 555 84${vn === 'desk' ? '1' : '2'}${N}`); await p.fill('input[name=owner_email]', `glass.check${tag}@example.com`);
    await p.fill('input[name=password]', 'a long test sentence here'); await p.fill('input[name=confirm]', pw2); await p.check('input[name=consent]');
  };
  await fill('something different entirely');
  await p.getByRole('button', { name: /Open my clinic/ }).click(); await p.waitForLoadState('load');
  const err = await p.evaluate(() => { const c = document.querySelector('[role=alert]'); const cs = c && getComputedStyle(c); return c && { text: c.textContent.trim().slice(0, 90), bg: cs.backgroundColor, color: cs.color, kept: document.querySelector('input[name=name]').value }; });
  await p.screenshot({ path: `mine/e2e-${vn}-error.png` });
  await fill('a long test sentence here');
  await p.getByRole('button', { name: /Open my clinic/ }).click(); await p.waitForLoadState('load');
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  console.log(vn, JSON.stringify({ autofocus: focused, error: err, landed: new URL(p.url()).pathname + new URL(p.url()).search, errors: errs }));
}
await browser.close();
