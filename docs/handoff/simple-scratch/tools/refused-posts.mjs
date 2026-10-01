// Refused record posts (nothing is written): each lands on the section the old rule gives, with its panel open.
import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
import pg from '/home/user/fl-simple/node_modules/pg/lib/index.js';
const BASE = `http://127.0.0.1:${process.env.PORT_ || 4470}`;
const db = new pg.Client({ host: '/var/run/postgresql', user: 'root', database: 'flossify_simple' }); await db.connect();
await db.query(`delete from throttle where key like 'login:%'`);
const before = (await db.query(`select (select count(*) from clinical_note) n, (select count(*) from treatment_plan_item) p, (select count(*) from vital_sign) v, (select count(*) from prescription) r`)).rows[0];
const URL_ = `${BASE}/c/session-road/patients/1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb/`;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' }); const page = await ctx.newPage();
await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
const cases = [['note-add', {}, null], ['note-add', {}, 'chart'], ['note-add', {}, 'treatment'], ['plan-add', {}, null], ['plan-add', {}, 'chart'], ['vitals-add', { systolic: '400' }, null], ['rx-add', {}, null], ['recall-set', { months: '99' }, null], ['letter-add', { kind: 'nonsense' }, null]];
for (const [intent, fields, back] of cases) {
  await page.goto(URL_, { waitUntil: 'load' });
  await Promise.all([page.waitForNavigation(), page.evaluate(([intent, fields, back, action]) => {
    const f = document.createElement('form'); f.method = 'post'; f.action = action;
    const add = (k, v) => { const i = document.createElement('input'); i.type = 'hidden'; i.name = k; i.value = v; f.append(i); };
    add('_csrf', document.querySelector('input[name=_csrf]').value); add('intent', intent);
    for (const [k, v] of Object.entries(fields)) add(k, v);
    if (back) add('back', back);
    document.body.append(f); f.submit();
  }, [intent, fields, back, URL_])]);
  await page.waitForTimeout(400);
  const got = await page.evaluate(() => ({ tab: document.querySelector('[role=tab][aria-selected=true][id^=rec-rec-]')?.id.replace(/^rec-rec-|-tab$/g, ''), dialogs: [...document.querySelectorAll('dialog[open]')].map((d) => d.id), problem: [...document.querySelectorAll('dialog[open] .ws-callout, dialog[open] [role=alert]')].map((c) => c.innerText.replace(/\s+/g, ' ').trim().slice(0, 70))[0] ?? null }));
  console.log(`${intent.padEnd(11)} back=${String(back).padEnd(9)} → ${String(got.tab).padEnd(17)} ${got.dialogs.join(',').padEnd(16)} ${got.problem}`);
}
const after = (await db.query(`select (select count(*) from clinical_note) n, (select count(*) from treatment_plan_item) p, (select count(*) from vital_sign) v, (select count(*) from prescription) r`)).rows[0];
console.log('rows written:', JSON.stringify(before) === JSON.stringify(after) ? 'none' : JSON.stringify({ before, after }));
await b.close(); await db.end();
