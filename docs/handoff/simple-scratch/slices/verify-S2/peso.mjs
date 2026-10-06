import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const BASE = `http://127.0.0.1:${process.env.PORT_ || 4470}`;
const P = { maria: '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', ledger: '9ea415bd-4b9e-4725-80e8-391464e2c12e', rich: '7e57a1c0-0000-4000-8000-000000000001' };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', process.env.WHO || 'hazel.tabanao@example.com'); await page.fill('#password', 'flossify');
await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
for (const [name, id] of Object.entries(P)) for (const qs of ['', '?saved=payplan:0f0f0f0f-1111-4222-8333-444444444444&back=overview', '?saved=adjusted:2026-10-30']) {
  await page.goto(`${BASE}/c/session-road/patients/${id}/${qs}`, { waitUntil: 'load' }); await page.waitForTimeout(300);
  const r = await page.evaluate(() => {
    const out = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n; (n = walk.nextNode());) if (/₱|PHP|peso/i.test(n.textContent)) {
      const e = n.parentElement; const where = e.closest('dialog')?.id ?? e.closest('[data-rec-panel]')?.dataset.recPanel ?? (e.closest('[data-rec-bar]') ? 'row' : 'head/other');
      out.push(`${where}: ${n.textContent.trim().slice(0, 70)}`);
    }
    return out;
  });
  console.log(`${name} ${qs || '(plain)'}: ${r.length}`); for (const x of [...new Set(r)]) console.log('   ', x);
}
await b.close();
