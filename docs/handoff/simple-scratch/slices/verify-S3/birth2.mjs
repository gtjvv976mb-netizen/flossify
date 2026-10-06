import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
import { execSync } from 'node:child_process';
const BASE = 'http://127.0.0.1:4470';
const ID = '7e57a1c0-0000-4000-8000-000000000401';
const URL_ = `${BASE}/c/session-road/patients/${ID}/`;
const sql = (q) => execSync(`psql -U root -h /var/run/postgresql -d flossify_simple -Atc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const state = () => ({ birth: sql(`select coalesce(birth_date::text,'null')||' '||coalesce(email,'-') from patient where id='${ID}'`), versions: sql(`select count(*) from medical_history where patient_id='${ID}'`), audits: sql(`select count(*) from audit_log where entity_id='${ID}' and action in ('patient.birth_date','patient.update')`) });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1366, height: 768 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(BASE + '/auth/login/?any=1'); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
await Promise.all([page.waitForNavigation(), page.click('[data-go]')]);
const openDetails = async (from = '#chart') => {
  await page.goto('about:blank'); await page.goto(URL_ + from, { waitUntil: 'networkidle' });
  await page.click('button[data-ws-open="details"] >> visible=true');
  await page.waitForSelector('dialog[open] #rec-birth');
};
const view = async () => page.evaluate(() => {
  const d = document.querySelector('dialog[open]');
  return { url: location.pathname.slice(-12) + location.search + location.hash, open: d?.id ?? null, birth: d?.querySelector('#rec-birth')?.value, was: d?.querySelector('[name=birth_was]')?.value,
    age: d?.querySelector('[data-rec-birth-age]')?.textContent, problems: [...(d?.querySelectorAll('[role=alert], .ws-callout, [data-callout]') ?? [])].map((x) => x.textContent.trim().replace(/\s+/g, ' ').slice(0, 200)),
    callouts: [...document.querySelectorAll('.ws-pane [class*="callout"]')].map((x) => x.textContent.trim().replace(/\s+/g, ' ').slice(0, 120)).slice(0, 4),
    tab: document.querySelector('[role=tab][aria-selected=true]')?.id, safety: document.querySelector('[data-rec-safety]')?.textContent.replace(/\s+/g, ' ').trim().slice(0, 80) };
});
const log = (n, x) => console.log(`\n## ${n}\n`, JSON.stringify(x, null, 1));
sql(`update patient set birth_date='1984-03-02', email=null where id='${ID}'`);
log('start', state());
// 1. age follows typing
await openDetails();
await page.fill('#rec-birth', '2010-05-01'); await page.dispatchEvent('#rec-birth', 'input');
log('1 age while typing', await view());
// 2. change birth + submit
await Promise.all([page.waitForNavigation(), page.click('dialog[open] button[type=submit]')]);
log('2 after save', { ...(await view()), ...state(), hist: sql(`select answers::text from medical_history where patient_id='${ID}' order by answered_at desc limit 1`) });
// 3. conflict: open, someone else changes, change birth + email, submit
await openDetails('#patient');
sql(`update patient set birth_date='1999-09-09' where id='${ID}'`);
await page.fill('#rec-birth', '2001-01-01'); await page.fill('dialog[open] [name=email]', 'vv@example.com');
const before3 = state();
await Promise.all([page.waitForNavigation(), page.click('dialog[open] button[type=submit]')]);
log('3 conflict', { ...(await view()), before: before3, after: state() });
// 3b. submit again: should save now
await Promise.all([page.waitForNavigation(), page.click('dialog[open] button[type=submit]')]);
log('3b resubmit', { ...(await view()), ...state() });
// 4. others changed birth, I don't touch birth, change email only
await openDetails();
sql(`update patient set birth_date='1970-07-07' where id='${ID}'`);
await page.fill('dialog[open] [name=email]', 'vv2@example.com');
await Promise.all([page.waitForNavigation(), page.click('dialog[open] button[type=submit]')]);
log('4 untouched birth, email change', { ...(await view()), ...state() });
// 5. future date
await openDetails();
await page.evaluate(() => { const i = document.querySelector('#rec-birth'); i.removeAttribute('max'); i.value = '2030-01-01'; });
await page.fill('dialog[open] [name=email]', 'vv3@example.com');
const b5 = state();
await Promise.all([page.waitForNavigation(), page.click('dialog[open] button[type=submit]')]);
log('5 future', { ...(await view()), before: b5, after: state() });
// 6. clear the birth date
await openDetails();
await page.fill('#rec-birth', '');
await Promise.all([page.waitForNavigation(), page.click('dialog[open] button[type=submit]')]);
log('6 cleared', { ...(await view()), ...state(), hist: sql(`select answers::text from medical_history where patient_id='${ID}' order by answered_at desc limit 1`) });
// 7. legacy health form with birth
const csrf = await page.evaluate(() => document.querySelector('input[name=csrf], input[name=_csrf], input[name*=csrf]')?.value);
const csrfName = await page.evaluate(() => document.querySelector('input[name*=csrf]')?.name);
const base = sql(`select id from medical_history where patient_id='${ID}' order by answered_at desc, id desc limit 1`);
const res = await page.evaluate(async ({ u, csrf, csrfName, base }) => {
  const f = new FormData(); f.set(csrfName, csrf); f.set('intent', 'health'); f.set('base', base); f.set('birth_was', ''); f.set('birth_date', '1985-05-05');
  ['Penicillin', 'Latex', 'Sulfa drugs', 'Aspirin', 'Codeine'].forEach((a) => f.append('allergies', a)); ['Hypertension', 'Asthma'].forEach((a) => f.append('conditions', a)); f.append('medications', 'Amlodipine 5 mg');
  f.set('note', document.querySelector('[data-health-form] [name=note]')?.value ?? '');
  const r = await fetch(u, { method: 'POST', body: f, redirect: 'manual' }); return { status: r.status, type: r.type, loc: r.headers.get('location') };
}, { u: URL_, csrf, csrfName, base });
log('7 legacy health post', { res, ...state() });
await page.goto(URL_ + '?saved=birth#overview', { waitUntil: 'networkidle' });
log('7b landing', await view());
console.log('errors', errs);
await b.close();
