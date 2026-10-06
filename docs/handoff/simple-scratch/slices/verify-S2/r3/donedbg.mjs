import { browser, login, rec, state, db } from './lib.mjs';
const b = await browser();
const { ctx, page } = await login(b, 'owner');
const c = await db();
const cnt = async () => (await c.query(`select count(*) from procedure_done where patient_id = $1`, ['1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb'])).rows[0].count;
for (const tab of ['overview', 'patient', 'chart']) {
  const before = await cnt();
  await page.goto(rec('maria', `#${tab}`), { waitUntil: 'load' }); await page.waitForTimeout(300);
  await page.click('.rec-add-btn'); await page.waitForTimeout(200);
  await page.click(`#rec-add [data-ws-open="rec-done-add"]`); await page.waitForTimeout(400);
  const forms = await page.evaluate(() => [...document.querySelectorAll('#rec-done-add form')].map((f) => ({ intent: f.querySelector('[name=intent]')?.value, hidden: f.hidden || !!f.closest('[hidden]'), action: f.action })));
  console.log(tab, JSON.stringify(forms));
  await page.evaluate(() => { const f = document.querySelector('#rec-done-add form[data-pick-form]'); f.querySelectorAll('[required]').forEach((x) => x.removeAttribute('required')); f.noValidate = true; f.querySelectorAll('select').forEach((s) => { s.value = ''; }); const n = f.querySelector('input[name=name]'); if (n) n.value = ''; });
  const fd = await page.evaluate(() => [...new FormData(document.querySelector('#rec-done-add form[data-pick-form]')).entries()].filter(([k]) => k !== '_csrf').map(([k, v]) => `${k}=${v}`).join('&'));
  console.log('  posts', fd);
  await Promise.all([page.waitForNavigation(), page.evaluate(() => document.querySelector('#rec-done-add form[data-pick-form]').requestSubmit())]);
  await page.waitForTimeout(500);
  const st = await state(page);
  const msg = await page.evaluate(() => [...document.querySelectorAll('dialog[open] .callout, [data-rec-saved]')].map((x) => x.textContent.trim().slice(0, 120)));
  console.log('  →', JSON.stringify(st), msg, 'rows', before, '→', await cnt());
}
await c.end(); await b.close();
