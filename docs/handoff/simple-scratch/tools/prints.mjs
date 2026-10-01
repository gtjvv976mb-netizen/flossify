// The paper pages under a record, as the server sends them (for S7's "the paper treatment-record/ renders
// byte-identical"): the Treatment record of Maria, Ledger Test and Rich Test, for the owner and for a dentist
// without billing, and Maria's prescription and letter. Saved as <out>/<who>-<name>.html; the CSRF token and
// asset hashes are left as they are (compare with `diff`, or after masking /_astro|assets\/[^"]+/).
// node prints.mjs <out dir>
import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
import pg from '/home/user/fl-simple/node_modules/pg/lib/index.js';
import { mkdirSync, writeFileSync } from 'node:fs';
const OUT = process.argv[2] ?? '/tmp/fl-simple-scratch/prints';
mkdirSync(OUT, { recursive: true });
const BASE = `http://127.0.0.1:${process.env.PORT_ || 4470}`, S = `${BASE}/c/session-road`;
const db = new pg.Client({ host: '/var/run/postgresql', user: 'root', database: process.env.DB_ || 'flossify_simple' }); await db.connect();
await db.query(`delete from throttle where key like 'login:%'`);
const MARIA = '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', LEDGER = '9ea415bd-4b9e-4725-80e8-391464e2c12e', RICH = '7e57a1c0-0000-4000-8000-000000000001';
const RX = (await db.query(`select id from prescription where patient_id = $1 order by issued_at limit 1`, [MARIA])).rows[0].id;
const LT = (await db.query(`select id from clinical_letter where patient_id = $1 order by created_at limit 1`, [MARIA])).rows[0].id;
const PAGES = { 'maria-trec': `/patients/${MARIA}/treatment-record/`, 'ledger-trec': `/patients/${LEDGER}/treatment-record/`, 'rich-trec': `/patients/${RICH}/treatment-record/`,
  'maria-rx': `/patients/${MARIA}/rx/${RX}/`, 'maria-letter': `/patients/${MARIA}/letters/${LT}/` };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [who, email] of Object.entries({ owner: 'liwayway.domingo@example.com', dentist: 'hazel.tabanao@example.com' })) {
  const ctx = await browser.newContext({ serviceWorkers: 'block' }); const page = await ctx.newPage();
  await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', email); await page.fill('#password', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
  for (const [name, p] of Object.entries(PAGES)) {
    const r = await ctx.request.get(`${S}${p}`);
    writeFileSync(`${OUT}/${who}-${name}.html`, await r.text());
    console.log(who, name, r.status());
  }
  await ctx.close();
}
await browser.close(); await db.end();
