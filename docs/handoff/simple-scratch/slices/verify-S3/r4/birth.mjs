import { browser, login, rec, db } from './lib.mjs';
const P = '7e57a1c0-0000-4000-8000-0000009fb177';
const b = await browser();
const c = await db();
const q = async (s, a=[]) => (await c.query(s, a)).rows;
const { ctx, page } = await login(b, 'owner', { viewport: { width: 1366, height: 768 } });
const openDetails = async () => { await page.goto('about:blank'); await page.goto(rec(P)); await page.waitForTimeout(500); await page.click('[data-ws-open=details]'); await page.waitForTimeout(300); };
// 1. change the birth date and the first name together
const h0 = (await q('select count(*)::int n from medical_history where patient_id=$1', [P]))[0].n;
await openDetails();
console.log('age shown:', await page.textContent('[data-rec-birth-age]'));
await page.fill('#rec-birth', '1981-03-04');
await page.waitForTimeout(100);
console.log('age after typing:', await page.textContent('[data-rec-birth-age]'));
const fn = page.locator('#details input[name=first_name]'); await fn.fill('Birthe');
await Promise.all([page.waitForNavigation(), page.locator('#details button[type=submit]').last().click()]);
await page.waitForTimeout(500);
console.log('1 url', page.url().replace(/.*patients\/[^/]+\//, ''));
console.log('1 row', await q('select first_name, birth_date::text from patient where id=$1', [P]));
console.log('1 hist', await q(`select answers::text, recorded_by is not null by from medical_history where patient_id=$1 order by answered_at desc limit 1`, [P]), 'count', h0, '->', (await q('select count(*)::int n from medical_history where patient_id=$1', [P]))[0].n);
console.log('1 audit', await q(`select action from audit_log where entity_id=$1 and at > now() - interval '1 minute' order by at desc limit 3`, [P]).catch(e=>e.message));
// 2. conflict: someone else changes it after the panel opened
await openDetails();
await q(`update patient set birth_date='1979-01-01' where id=$1`, [P]);
await page.fill('#rec-birth', '1982-05-05'); await fn.fill('Conflicted');
await Promise.all([page.waitForNavigation(), page.locator('#details button[type=submit]').last().click()]);
await page.waitForTimeout(500);
const st = await page.evaluate(() => ({ open: document.getElementById('details')?.open, text: document.getElementById('details')?.innerText.match(/Someone changed[^\n]*/)?.[0], birth: document.getElementById('rec-birth')?.value, was: document.querySelector('#details input[name=birth_was]')?.value, name: document.querySelector('#details input[name=first_name]')?.value }));
console.log('2 panel', st);
console.log('2 row', await q('select first_name, birth_date::text from patient where id=$1', [P]));
// 3. save again after conflict -> goes through
await Promise.all([page.waitForNavigation(), page.locator('#details button[type=submit]').last().click()]);
await page.waitForTimeout(500);
console.log('3 url', page.url().replace(/.*patients\/[^/]+\//, ''), await q('select first_name, birth_date::text from patient where id=$1', [P]));
// 4. invalid: future date typed via value
await openDetails();
await page.evaluate(() => { const i = document.getElementById('rec-birth'); i.removeAttribute('max'); i.value = '2099-01-01'; });
await Promise.all([page.waitForNavigation(), page.locator('#details button[type=submit]').last().click()]);
await page.waitForTimeout(500);
console.log('4', await page.evaluate(() => ({ open: document.getElementById('details')?.open, err: document.getElementById('details')?.innerText.match(/birth date is after today[^\n]*/)?.[0] })), await q('select birth_date::text from patient where id=$1', [P]));
// 5. health form has no birth field
await page.goto(rec(P)); await page.waitForTimeout(300);
console.log('5 birth inputs outside details:', await page.evaluate(() => [...document.querySelectorAll('input[name=birth_date]')].filter((i) => !i.closest('#details')).length));
// 6. clear the birth date
await openDetails(); await page.fill('#rec-birth', '');
await Promise.all([page.waitForNavigation(), page.locator('#details button[type=submit]').last().click()]);
await page.waitForTimeout(500);
console.log('6', page.url().replace(/.*patients\/[^/]+\//, ''), await q('select birth_date::text from patient where id=$1', [P]), await q(`select answers::text from medical_history where patient_id=$1 order by answered_at desc limit 1`, [P]));
await c.end(); await b.close();
