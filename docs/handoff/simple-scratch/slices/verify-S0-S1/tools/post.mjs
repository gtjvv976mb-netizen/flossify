// Real posts to the record (successful and refused), on the verifier's own patient (T-VRFY) and refused-only on Maria:
// the status, the Location (ids masked) and, for a refusal, the normalised HTML. node post.mjs <outdir>
import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
import pg from '/home/user/fl-simple/node_modules/pg/lib/index.js';
import { writeFileSync, mkdirSync } from 'node:fs';
const OUT = process.argv[2]; mkdirSync(OUT, { recursive: true });
const BASE = 'http://127.0.0.1:4470', S = `${BASE}/c/session-road`;
const db = new pg.Client({ host: '/var/run/postgresql', user: 'root', database: 'flossify_simple' }); await db.connect();
await db.query(`delete from throttle where key like 'login:%' or key like 'record:%' or key like 'chart:%'`);
const VP = '7e57a1c0-0000-4000-8000-00000000ff01', MARIA = '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb';
const OWNER = 'a7644577-cef7-437a-9290-38ffcfb64332';
const CAT = (await db.query(`select id from procedure_catalog where clinic_id = (select id from clinic where slug='session-road') order by name limit 1`)).rows[0]?.id ?? '';
const mask = (s) => (s ?? '').replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id');
const norm = (h) => mask(h.replace(/name="_csrf" value="[^"]*"/g, 'name="_csrf" value="X"').replace(/data-csrf="[^"]*"/g, 'data-csrf="X"').replace(/"csrf":"[^"]*"/g, '"csrf":"X"'));
const BACKS = [null, 'chart', 'treatment', 'overview', 'patient', 'treatment-record', 'constructor', ''];
const OK = [
  ['note-add', { complaint: 'Verifier note', dentist: OWNER }],
  ['vitals-add', { systolic: '120', diastolic: '80' }],
  ['vitals-add', { pulse: '72' }],
  ['recall-set', { months: '6' }],
  ['recall-clear', {}],
  ['plan-add', { name: 'Verifier plan item', price: '100' }],
  ['lab-add', { lab: 'Verifier lab', description: 'Crown' }],
];
const BAD = [
  ['note-add', {}], ['plan-add', {}], ['done-add', {}], ['vitals-add', { systolic: '400', diastolic: '80' }], ['rx-add', {}], ['recall-set', { months: '99' }],
  ['letter-add', { kind: 'nonsense' }], ['lab-add', {}], ['loa-add', {}], ['loa-approve', {}], ['payplan-add', {}], ['adjust-add', {}], ['letter-answer', {}],
  ['plan-status', { item: 'x', to: 'done' }], ['plan-remove', { item: 'x' }], ['lab-next', {}], ['file-remove', {}], ['chart-apply', {}], ['loa-deny', {}], ['loa-cancel', {}], ['payplan-stop', {}],
];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ serviceWorkers: 'block' }); const page = await ctx.newPage();
await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
  const cookie = (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
const csrfOf = async (pid) => { const h = await (await fetch(`${S}/patients/${pid}/`, { headers: { cookie } })).text(); return h.match(/name="_csrf" value="([^"]*)"/)[1]; };
const lines = [];
async function post(pid, intent, fields, back, save) {
  const form = { _csrf: await csrfOf(pid), intent, ...fields };
  if (back !== null) form.back = back;
  const r = await fetch(`${S}/patients/${pid}/`, { method: 'POST', body: new URLSearchParams(form), redirect: 'manual', headers: { cookie, origin: BASE } });
  const loc = mask(r.headers.get('location') ?? '');
  const line = `${pid === VP ? 'vrfy' : 'maria'} ${intent} ${JSON.stringify(fields)} back=${back} → ${r.status} ${loc}`;
  lines.push(line);
  if (save && r.status === 200) {
    const h = await r.text();
    writeFileSync(`${OUT}/${intent}__${back}.html`, norm(h));
    const sel = h.match(/id="rec-rec-([a-z-]+)-tab"[^>]*aria-selected="true"|aria-selected="true"[^>]*id="rec-rec-([a-z-]+)-tab"/);
    lines.push(`    tab=${sel ? sel[1] ?? sel[2] : '?'} open-dialogs=${[...h.matchAll(/<dialog[^>]*\bid="([^"]+)"[^>]*\bopen\b/g)].map((m) => m[1]).join(',')}`);
  }
}
for (const [intent, fields] of OK) for (const back of BACKS) { await post(VP, intent, fields, back, false); await db.query(`delete from throttle where key like 'record:%'`); }
for (const [intent, fields] of BAD) for (const back of BACKS) { await post(MARIA, intent, fields, back, true); await db.query(`delete from throttle where key like 'record:%'`); }
writeFileSync(`${OUT}/posts.txt`, lines.join('\n') + '\n');
console.log(lines.length, 'lines');
await browser.close(); await db.end();
