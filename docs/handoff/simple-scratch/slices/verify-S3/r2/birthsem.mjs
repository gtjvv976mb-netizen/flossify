import { browser, login, rec, S } from './lib.mjs';
const ID = '7e57a1c0-0000-4000-8000-00000000fb01', VISIT = '7e57a1c0-0000-4000-8000-00000000fbe1';
const b = await browser();
const { ctx, page } = await login(b, 'owner');
const look = async (label) => {
  await page.goto(rec(ID)); await page.waitForTimeout(400);
  const r = await page.evaluate(() => ({
    todo: document.querySelector('.rec-todo')?.innerText.replace(/\s+/g, ' ') ?? null,
    strip: [...document.querySelectorAll('#this-visit, [data-vs], .vs')].map((e) => e.innerText.replace(/\s+/g, ' ')).join(' | ').slice(0, 600),
    health: document.getElementById('health')?.innerText.replace(/\s+/g, ' ').slice(0, 300),
  }));
  await page.goto(`${S}/?booking=${VISIT}`); await page.waitForTimeout(1200);
  const dash = await page.evaluate(() => { const d = [...document.querySelectorAll('dialog[open], [data-vp]')].map((e) => e.innerText.replace(/\s+/g, ' ')).join(' | '); const m = d.match(/.{0,80}[Hh]ealth.{0,120}/g); return m; });
  console.log(label, JSON.stringify({ ...r, dash }, null, 1));
};
await look('BEFORE');
await page.goto(rec(ID)); await page.waitForTimeout(300);
await page.click('[data-ws-open="details"]'); await page.waitForTimeout(300);
await page.fill('dialog[open] input[name=birth_date]', '1980-03-16');
await Promise.all([page.waitForNavigation(), page.click('dialog[open] button[type=submit]:not([formnovalidate])')]);
console.log('landed', page.url(), await page.evaluate(() => [...document.querySelectorAll('.ws-callout, [role=status]')].map((e) => e.innerText.replace(/\s+/g,' ')).join(' | ').slice(0, 300)));
await look('AFTER');
await b.close();
