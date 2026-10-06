// S3 check: the birth date in Edit details. Patient T-NONE (…0302); Maria for the Dashboard return (?open=details&dash=).
// Each case: what the address and the page say, and what the database holds after (patient.birth_date, the health
// history's versions and their birth_date change, the audit rows written).
import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
import { execFileSync } from 'node:child_process';
const BASE = 'http://127.0.0.1:4470';
const ID = '7e57a1c0-0000-4000-8000-000000000302';
const MARIA = '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb';
const sql = (q) => execFileSync('psql', ['-U', 'root', '-h', '/var/run/postgresql', '-d', 'flossify_simple', '-Atc', q]).toString().trim();
const db = (id = ID) => ({
  birth: sql(`select coalesce(to_char(birth_date, 'YYYY-MM-DD'), 'null') from patient where id = '${id}'`),
  middle: sql(`select coalesce(middle_name, '') from patient where id = '${id}'`),
  versions: +sql(`select count(*) from medical_history where patient_id = '${id}'`),
  lastChange: sql(`select coalesce(answers->>'birth_date', '') || ' | ' || coalesce(array_to_string(allergies, ','), 'null') || ' | ' || coalesce(array_to_string(conditions, ','), 'null') from medical_history where patient_id = '${id}' order by answered_at desc, id desc limit 1`),
  audits: sql(`select string_agg(action, ',' order by action) from audit_log where entity_id = '${id}' and action in ('patient.update', 'patient.birth_date', 'health.update') and at > now() - interval '8 seconds'`),
});
let fails = 0;
const check = (name, ok, got) => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${JSON.stringify(got)}`); };
sql(`update patient set birth_date = '1990-01-10', middle_name = null where id = '${ID}'`);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(BASE + '/auth/login/?any=1'); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
await Promise.all([page.waitForNavigation(), page.click('[data-go]')]);
const open = async (id = ID, q = '') => { await page.goto(`${BASE}/c/session-road/patients/${id}/${q}`, { waitUntil: 'networkidle' }); };
const panel = async () => { await page.click('.rec-actions [data-ws-open="details"]'); await page.waitForSelector('#details[open]'); };
const save = async () => { await Promise.all([page.waitForLoadState('networkidle'), page.waitForNavigation(), page.click('#details button[type="submit"]')]); await page.waitForTimeout(150); };
const seen = () => page.evaluate(() => ({
  url: location.pathname.split('/').slice(-2).join('/') + location.search + location.hash,
  tab: document.querySelector('[role="tab"][aria-selected="true"]')?.id,
  callouts: [...document.querySelectorAll('.ws-callout')].filter((c) => c.checkVisibility()).map((c) => c.textContent.replace(/\s+/g, ' ').trim().slice(0, 400)),
  panelOpen: !!document.querySelector('#details[open]'),
  birth: document.querySelector('[name="birth_date"]')?.value, was: document.querySelector('[name="birth_was"]')?.value,
  middle: document.querySelector('#details [name="middle_name"]')?.value,
  age: document.querySelector('[data-rec-birth-age]')?.textContent,
}));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. A new birth date
await open(); await panel();
check('panel draws the birth date and the age', (await seen()).birth === '1990-01-10' && /36 years old/.test((await seen()).age), await seen());
await page.fill('[name="birth_date"]', '1990-01-11');
check('the age follows the date as typed', /36 years old/.test((await seen()).age), (await seen()).age);
let before = db(); await save(); let s = await seen(); let a = db();
check('1 birth changed → ?saved=birth on Today, the head says so', s.url.endsWith('?saved=birth#overview') && s.tab === 'rec-rec-overview-tab' && s.callouts.some((c) => c.startsWith('Details saved. The birth date')), s);
check('1 database: birth, one new version with from/to and the answers kept, audits', a.birth === '1990-01-11' && a.versions === before.versions + 1 && a.lastChange.includes('"from": "1990-01-10"') && a.lastChange.includes('"to": "1990-01-11"') && a.lastChange.endsWith('|  | ') === false && a.audits === 'patient.birth_date,patient.update', a);
// 2. Details only
await wait(8200);
await open(); await panel(); await page.fill('#details [name="middle_name"]', 'Mid'); before = db(); await save(); s = await seen(); a = db();
check('2 details only → ?saved=details, no version', s.url.endsWith('?saved=details#overview') && a.versions === before.versions && a.birth === '1990-01-11' && a.middle === 'Mid' && a.audits === 'patient.update', { s, a });
// 3. Someone else changed the birth date while the panel was open, and this person changed it too
await wait(8200);
await open(); await panel(); sql(`update patient set birth_date = '1990-01-12' where id = '${ID}'`);
await page.fill('[name="birth_date"]', '1990-01-13'); await page.fill('#details [name="middle_name"]', 'Conflict');
before = db(); await save(); s = await seen(); a = db();
check('3 conflict → nothing saved, the panel again with the sentence, typed kept, drawn with the date on file', s.panelOpen && s.callouts.some((c) => c.includes('Nothing was saved.') && c.includes('changed the birth date on file to 12 Jan 1990')) && s.birth === '1990-01-13' && s.was === '1990-01-12' && s.middle === 'Conflict', s);
check('3 database untouched (middle name rolled back too)', a.birth === '1990-01-12' && a.middle === 'Mid' && a.versions === before.versions && !a.audits, a);
await save(); s = await seen(); a = db();
check('3 saved again → birth, and the middle name', s.url.endsWith('?saved=birth#overview') && a.birth === '1990-01-13' && a.middle === 'Conflict' && a.versions === before.versions + 1 && a.lastChange.includes('"from": "1990-01-12"'), { s, a });
// 4. Someone else changed it; this person did not touch it
await wait(8200);
await open(); await panel(); sql(`update patient set birth_date = '1990-01-14' where id = '${ID}'`);
await page.fill('#details [name="middle_name"]', 'Kept'); before = db(); await save(); s = await seen(); a = db();
check('4 not touched here → details saved, the other person\'s birth date stays', s.url.endsWith('?saved=details#overview') && a.birth === '1990-01-14' && a.middle === 'Kept' && a.versions === before.versions, { s, a });
// 5. A date after today
await wait(8200);
await open(); await panel(); await page.evaluate(() => { document.querySelector('#details form').noValidate = true; }); await page.fill('[name="birth_date"]', '2030-01-01'); before = db(); await save(); s = await seen(); a = db();
check('5 future date refused, nothing saved, typed kept', s.panelOpen && s.callouts.some((c) => c.includes('The birth date is after today')) && s.birth === '2030-01-01' && a.birth === '1990-01-14' && a.versions === before.versions && !a.audits, { s, a });
// 6. Cleared
await wait(8200);
await open(); await panel(); await page.fill('[name="birth_date"]', ''); before = db(); await save(); s = await seen(); a = db();
check('6 cleared → saved=birth, none on file, the version says from → null', s.url.endsWith('?saved=birth#overview') && a.birth === 'null' && a.versions === before.versions + 1 && a.lastChange.includes('"to": null'), { s, a });
check('6 the panel says "Not on file yet"', await (async () => { await open(); await panel(); return (await seen()).age === 'Not on file yet'; })(), (await seen()).age);
// 7. The health form no longer carries a birth date, and saves the answers only
sql(`update patient set birth_date = '1990-01-10' where id = '${ID}'`);
await wait(8200);
await open('', ''); await open(ID, '#patient');
check('7 no birth date field in the health form', await page.evaluate(() => !document.querySelector('[data-health-form] [name="birth_date"], [data-health-form] [name="birth_was"]')), '');
await page.fill('[data-health-list] [data-health-add-input] >> nth=0', 'Latex'); await page.click('[data-health-add] >> nth=0');
before = db(); await Promise.all([page.waitForNavigation(), page.click('[data-health-save]')]); s = await seen(); a = db();
check('7 health save → saved=health, birth untouched', s.url.includes('saved=health') && a.birth === '1990-01-10' && a.versions === before.versions + 1 && a.lastChange.startsWith('| Latex') && a.audits === 'health.update', { s, a });
// 8. The health form's conflict: someone saved a version after the page opened
await wait(8200);
await open(ID, '#patient'); sql(`insert into medical_history (clinic_id, patient_id, answered_at, answered_by, allergies, conditions, medications, recorded_by) select clinic_id, id, now(), 'staff', array['Iodine'], array[]::text[], array[]::text[], (select id from staff where email = 'hazel.tabanao@example.com') from patient where id = '${ID}'`);
await page.fill('[data-health-list] [data-health-add-input] >> nth=0', 'Sulfa'); await page.click('[data-health-add] >> nth=0');
before = db(); await Promise.all([page.waitForNavigation(), page.click('[data-health-save]')]); s = await seen(); a = db();
check('8 health conflict → nothing saved, the sentence names who saved and what is on file, no birth date in it', a.versions === before.versions && s.callouts.some((c) => /saved this record .* after you opened it/.test(c) && c.includes('On file now: Allergies Iodine') && !/Birth date/.test(c)), s.callouts);
// 10. A health form drawn before the birth date moved (it still posts birth_date and birth_was): the birth date is kept.
await wait(8200);
sql(`update patient set birth_date = '1990-01-10' where id = '${ID}'`);
// A fresh page: after case 8's refused post, a goto to the same path with a hash is a same-document move that keeps the typed answers.
await page.goto('about:blank'); await open(ID, '#patient');
await page.evaluate(() => { const f = document.querySelector('[data-health-form]'); for (const [n, v] of [['birth_date', '1990-02-02'], ['birth_was', '1990-01-10']]) { const i = document.createElement('input'); i.type = 'hidden'; i.name = n; i.value = v; f.append(i); } });
before = db(); await Promise.all([page.waitForNavigation(), page.click('[data-health-save]')]); s = await seen(); a = db();
check('10 an old health form with a birth date → kept (saved=birth on Today), a version with from/to', s.url.endsWith('?saved=birth#overview') && a.birth === '1990-02-02' && a.versions === before.versions + 1 && a.lastChange.includes('"to": "1990-02-02"') && a.audits === 'patient.birth_date', { s, a });
// 9. From the Dashboard (dash): a birth change goes back to the Dashboard with the visit open
const visit = sql(`select id from appointment where patient_id = '${MARIA}' and id = '5a055ab9-8eaa-42aa-9951-395736601384'`);
const mariaBirth = sql(`select to_char(birth_date, 'YYYY-MM-DD') from patient where id = '${MARIA}'`);
await open(MARIA, `?open=details&dash=${visit}`); await page.waitForSelector('#details[open]');
const y = String(+mariaBirth.slice(0, 4) - 1) + mariaBirth.slice(4);
await page.fill('[name="birth_date"]', y);
const resp = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes(MARIA));
await save();
const dash = (await (await resp).headerValue('location')) ?? '';
check('9 dash + a birth change → back to the Dashboard with that visit', /^\/c\/session-road\/\?(date=\d{4}-\d{2}-\d{2}&)?booking=/.test(dash) && dash.endsWith(`booking=${visit}`) && db(MARIA).birth === y, { dash, birth: db(MARIA).birth });
// Put Maria back as she was: her birth date, and no trace of this check in her health history (the other checks count it).
sql(`update patient set birth_date = '${mariaBirth}' where id = '${MARIA}'`);
sql(`delete from medical_history where patient_id = '${MARIA}' and answers ? 'birth_date' and answered_at > now() - interval '10 minutes'`);
await b.close();
console.log(`page errors: ${errors.length ? errors.join(' | ') : 'none'}`);
console.log(fails ? `${fails} failing` : 'all ok');
process.exit(fails || errors.length ? 1 : 0);
