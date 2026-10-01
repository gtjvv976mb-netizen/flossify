import { chromium } from '/home/user/flossify/node_modules/playwright/index.mjs';
const BASE = 'http://127.0.0.1:4399';
const ID = '9ea415bd-4b9e-4725-80e8-391464e2c12e';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const who of ['hazel.tabanao@example.com', 'liwayway.domingo@example.com']) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/auth/login/?any=1`);
  await p.fill('#email', who); await p.fill('#password', 'flossify');
  await Promise.all([p.waitForNavigation(), p.click('button[type="submit"]')]);
  await p.goto(`${BASE}/c/session-road/patients/${ID}/#treatment-record`, { waitUntil: 'networkidle' });
  const r = await p.evaluate(() => {
    const s = document.querySelector('#rec-treatment-record');
    return {
      heads: [...s.querySelectorAll('thead th')].map((t) => t.textContent.trim()).join(' | '),
      kinds: [...new Set([...s.querySelectorAll('tbody tr')].map((t) => t.dataset.kind))].join(','),
      days: s.querySelectorAll('tbody').length,
      peso: /₱/.test(s.innerText),
      intro: s.querySelector('.trec-intro')?.textContent.slice(0, 60),
      foot: s.querySelector('.trec-foot')?.innerText.replace(/\s+/g, ' '),
      more: s.querySelector('[data-trec-more]')?.textContent.trim() ?? null,
    };
  });
  console.log(who.split('.')[0], JSON.stringify(r));
  const pr = await p.goto(`${BASE}/c/session-road/patients/${ID}/treatment-record/`, { waitUntil: 'networkidle' });
  const q = await p.evaluate(() => ({ heads: [...document.querySelectorAll('.tr-table thead th')].map((t) => t.textContent.trim()).join(' | '), peso: /₱/.test(document.body.innerText), rows: document.querySelectorAll('.tr-table tbody tr').length }));
  console.log('  print', pr.status(), JSON.stringify(q));
  if (who.startsWith('lili')) {}
  // Fold: the button, what shows, and after pressing it.
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto(`${BASE}/c/session-road/patients/${ID}/#treatment-record`, { waitUntil: 'networkidle' });
  const f = await p.evaluate(() => { const bs = [...document.querySelectorAll('#rec-treatment-record tbody')]; return { total: bs.length, zero: bs.filter((x) => x.getBoundingClientRect().height === 0).length, shown: bs.filter((x) => x.getBoundingClientRect().height > 0).length }; });
  console.log('  fold at 390', JSON.stringify(f));
  const btn = await p.$('#rec-treatment-record [data-trec-more]');
  if (btn) { await btn.click(); await p.waitForTimeout(200); console.log('  after show', await p.evaluate(() => ({ zero: [...document.querySelectorAll('#rec-treatment-record tbody')].filter((x) => x.getBoundingClientRect().height === 0).length, focus: document.activeElement?.className, btnGone: !document.querySelector('[data-trec-more]') }))); }
  await ctx.close();
}
// Scripts off: every day shows.
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false });
const p = await ctx.newPage();
await p.goto(`${BASE}/auth/login/?any=1`);
await p.fill('#email', 'liwayway.domingo@example.com'); await p.fill('#password', 'flossify');
await Promise.all([p.waitForNavigation(), p.click('button[type="submit"]')]);
await p.goto(`${BASE}/c/session-road/patients/${ID}/#treatment-record`);
console.log('no-js', await p.evaluate(() => { const bs = [...document.querySelectorAll('#rec-treatment-record tbody')]; return `${bs.filter((x) => !x.hidden).length}/${bs.length} days not hidden; more button hidden: ${document.querySelector('[data-trec-more]')?.hidden}`; }));
await b.close();
