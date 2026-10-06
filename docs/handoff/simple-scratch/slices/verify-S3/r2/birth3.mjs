import { browser, login, rec, db } from './lib.mjs';
const ID = '7e57a1c0-0000-4000-8000-00000000fb01';
const b = await browser();
const { ctx, page } = await login(b, 'owner');
const st = () => page.evaluate(() => ({ url: location.pathname.slice(-12) + location.search + location.hash, open: [...document.querySelectorAll('dialog[open]')].map((d) => d.id), birth: document.querySelector('dialog[open] input[name=birth_date]')?.value, was: document.querySelector('dialog[open] input[name=birth_was]')?.value, err: [...document.querySelectorAll('dialog[open] .ws-callout, dialog[open] [role=alert]')].map((e) => e.innerText.replace(/\s+/g, ' ')).join(' | '), phone: document.querySelector('dialog[open] input[name=phone], dialog[open] input[name=mobile]')?.value, first: document.querySelector('dialog[open] input[name=first_name]')?.value }));
const c = await db();
// 1. conflict: open panel on chart tab, someone else changes birth, then change birth + first name
await page.goto(rec(ID, '#chart')); await page.waitForTimeout(300);
await page.click('[data-ws-open="details"]'); await page.waitForTimeout(200);
await c.query(`update patient set birth_date='1981-01-01' where id=$1`, [ID]);
await page.fill('dialog[open] input[name=birth_date]', '1979-05-05');
await page.fill('dialog[open] input[name=first_name]', 'Verified');
await Promise.all([page.waitForNavigation(), page.click('dialog[open] button[type=submit]:not([formnovalidate])')]);
console.log('conflict', JSON.stringify(await st()));
console.log('db', (await c.query(`select first_name, birth_date::text from patient where id=$1`, [ID])).rows[0]);
// save again should work now
await Promise.all([page.waitForNavigation(), page.click('dialog[open] button[type=submit]:not([formnovalidate])')]);
console.log('again', JSON.stringify(await st()), (await c.query(`select first_name, birth_date::text from patient where id=$1`, [ID])).rows[0]);
// 2. invalid date: future
await page.goto(rec(ID, '#patient')); await page.waitForTimeout(300);
await page.click('[data-ws-open="details"]'); await page.waitForTimeout(200);
await page.evaluate(() => { const i = document.querySelector('dialog[open] input[name=birth_date]'); i.removeAttribute('max'); i.removeAttribute('min'); i.form.noValidate = true; });
await page.fill('dialog[open] input[name=birth_date]', '2031-01-01');
await Promise.all([page.waitForNavigation(), page.click('dialog[open] button[type=submit]:not([formnovalidate])')]);
console.log('future', JSON.stringify(await st()));
// 3. clear birth date (remove) and the page's age
await page.goto(rec(ID)); await page.waitForTimeout(300);
await page.click('[data-ws-open="details"]'); await page.waitForTimeout(200);
await page.fill('dialog[open] input[name=birth_date]', '');
await Promise.all([page.waitForNavigation(), page.click('dialog[open] button[type=submit]:not([formnovalidate])')]);
console.log('cleared', JSON.stringify(await st()), (await c.query(`select birth_date::text from patient where id=$1`, [ID])).rows[0]);
console.log('audit', (await c.query(`select action, count(*) from audit_log where entity_id=$1 group by 1`, [ID])).rows);
await c.end(); await b.close();
