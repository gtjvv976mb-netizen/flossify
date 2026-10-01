import { chromium } from '/home/user/flossify/node_modules/playwright/index.mjs';
const BASE = 'http://127.0.0.1:4399';
const ID = '9ea415bd-4b9e-4725-80e8-391464e2c12e';
const F = 'f0ad9227-8747-4fc7-b6de-11fccdff1518';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(`${BASE}/auth/login/?any=1`);
await p.fill('#email', 'liwayway.domingo@example.com'); await p.fill('#password', 'flossify');
await Promise.all([p.waitForNavigation(), p.click('button[type="submit"]')]);
await p.goto(`${BASE}/c/session-road/patients/${ID}/#treatment-record`, { waitUntil: 'networkidle' });
const days = await p.$$eval('#rec-treatment-record table.trec tbody', (bs) => bs.slice(-5).map((tb) => ({
  date: tb.querySelector('.trec-date span, .trec-date-plain')?.textContent.trim(),
  also: [...tb.querySelectorAll('.trec-also')].map((x) => x.textContent.trim()),
  rows: [...tb.querySelectorAll('tr')].map((tr) => `${tr.dataset.kind}: ${[...tr.querySelectorAll('td')].map((td) => [...td.childNodes].filter((n) => !(n.nodeType === 1 && n.classList.contains('trec-l'))).map((n) => n.textContent).join('').replace(/\s+/g, ' ').trim()).join(' | ')}`),
})));
for (const d of days) { console.log(`[${d.date}] also=${JSON.stringify(d.also)}`); d.rows.forEach((r) => console.log('   ', r)); }
const geo = await p.evaluate(() => {
  const w = document.querySelector('#rec-treatment-record .trec-wrap');
  const also = document.querySelector('#rec-treatment-record .trec-also');
  const date = also?.closest('th')?.querySelector('.trec-date');
  const r1 = date?.getBoundingClientRect(), r2 = also?.getBoundingClientRect();
  return { wrap: `${w.scrollWidth}/${w.clientWidth}`, date: r1 && [Math.round(r1.top), Math.round(r1.bottom), Math.round(r1.height)], also: r2 && [Math.round(r2.top), Math.round(r2.bottom), Math.round(r2.height), Math.round(r2.width)] };
});
console.log('geometry', JSON.stringify(geo));
// ?visit=<future> → Visits; Escape → focus on something shown
await p.goto(`${BASE}/c/session-road/patients/${ID}/?visit=${F}`, { waitUntil: 'networkidle' });
await p.waitForTimeout(300);
console.log('future visit section', await p.$eval('[data-rec-panel]:not([hidden])', (el) => el.dataset.recPanel), 'panel open', await p.$eval(`#rec-visit-${F}`, (d) => d.open));
await p.keyboard.press('Escape'); await p.waitForTimeout(500);
console.log('focus after close', await p.evaluate(() => { const a = document.activeElement; return `${a.tagName}.${a.className} shown=${a.getClientRects().length > 0} in=${a.closest('[data-rec-panel]')?.dataset.recPanel}`; }));
console.log('errors', errs.join(' | ') || 'none');
await b.close();
