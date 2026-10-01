// The Treatment record (the PDA ledger): balance against patient_balance(), rows, layout, addresses, fold, print.
import { chromium } from '/home/user/flossify/node_modules/playwright/index.mjs';
import { execSync } from 'node:child_process';
const BASE = 'http://127.0.0.1:4399';
const SLUG = 'session-road';
const psql = (sql) => execSync(`psql -U root -h /var/run/postgresql -d flossify_dev -X -A -t -c "${sql.replace(/"/g, '\\"')}"`).toString().trim();
const ONLY = process.argv[2] ?? 'all';
let fails = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails++; };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(`${BASE}/auth/login/?any=1`);
await p.fill('#email', 'liwayway.domingo@example.com');
await p.fill('#password', 'flossify');
await Promise.all([p.waitForNavigation(), p.click('button[type="submit"]')]);
const rec = (id, qs = '') => `${BASE}/c/${SLUG}/patients/${id}/${qs}`;
const shown = () => p.$eval('[data-rec-panel]:not([hidden])', (el) => el.dataset.recPanel);
const pesoOf = (t) => { const m = t.replace(/,/g, '').match(/([\d.]+)/); if (!m) return null; const n = Number(m[1]); return /credit/i.test(t) ? -n : n; };

const rowsOf = () => p.$$eval('#rec-treatment-record table.trec tbody', (bodies) => bodies.map((tb) => ({
  date: tb.querySelector('th')?.innerText.replace(/\s+/g, ' ').trim(),
  hidden: tb.hidden,
  rows: [...tb.querySelectorAll('tr')].map((tr) => ({
    kind: tr.dataset.kind,
    cells: [...tr.querySelectorAll('td')].map((td) => [...td.childNodes].filter((n) => !(n.nodeType === 1 && n.classList.contains('trec-l'))).map((n) => n.textContent).join('').replace(/\s+/g, ' ').trim()),
  })),
})));

if (ONLY === 'all' || ONLY === 'balance') {
  const ids = psql(`select p.id from patient p join clinic c on c.id = p.clinic_id where c.slug = '${SLUG}'`).split('\n').filter(Boolean);
  for (const id of ids) {
    await p.goto(rec(id, '#treatment-record'), { waitUntil: 'networkidle' });
    const onFile = Number(psql(`select coalesce(patient_balance('${id}'), 0)`));
    const bal = await p.$$eval('#rec-treatment-record td.trec-bal:not([data-none])', (tds) => tds.map((td) => td.lastChild?.textContent ?? td.textContent));
    const last = bal.length ? pesoOf(bal[bal.length - 1]) : 0;
    const note = await p.$eval('#rec-treatment-record .trec-foot', (el) => el.innerText).catch(() => '');
    check(Math.abs((last ?? 0) - onFile) < 0.005 && !/did not match/.test(note), `balance ${id.slice(0, 8)}: shown ${last} vs patient_balance ${onFile}`);
    // Every counted statement's total is charged exactly once across the rows.
    const charged = await p.$$eval('#rec-treatment-record td.trec-c-amt:not(.trec-paid):not(.trec-bal):not([data-none])', (tds) => tds.map((td) => td.lastChild?.textContent ?? ''));
    const sumCharged = charged.reduce((s, t) => s + (pesoOf(t) ?? 0) * (/^[−-]/.test(t.trim()) ? -1 : 1), 0);
    const paid = await p.$$eval('#rec-treatment-record td.trec-paid:not([data-none])', (tds) => tds.map((td) => td.lastChild?.textContent ?? ''));
    const sumPaid = paid.reduce((s, t) => s + (pesoOf(t) ?? 0), 0);
    const dbPaid = Number(psql(`select coalesce(sum(y.amount), 0) from payment y left join invoice i on i.id = y.invoice_id where y.patient_id = '${id}' and y.voided_at is null and (i.id is null or i.status in ('issued','partly_paid','paid'))`));
    check(Math.abs(sumPaid - dbPaid) < 0.005, `paid ${id.slice(0, 8)}: rows ${sumPaid} vs db ${dbPaid}`);
    if (charged.length) console.log('     charged cells', JSON.stringify(charged), 'sum', sumCharged);
  }
}

if (ONLY === 'all' || ONLY === 'dump') {
  for (const id of (process.argv[3] ? [process.argv[3]] : ['1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', 'b4121c23-8dbc-4f9e-91cc-ea8fbd2df542', '9c5cddc3-e786-4050-96eb-9effd1829fba', 'dc9ec446-24d5-439b-999f-9e3013b671f5'])) {
    await p.goto(rec(id, '#treatment-record'), { waitUntil: 'networkidle' });
    console.log(`--- ${id.slice(0, 8)} shown=${await shown()}`);
    for (const d of await rowsOf()) {
      console.log(`  [${d.date}]${d.hidden ? ' (hidden)' : ''}`);
      for (const r of d.rows) console.log(`     ${r.kind}: ${r.cells.join(' | ')}`);
    }
    console.log('  foot:', await p.$eval('#rec-treatment-record .trec-foot', (el) => el.innerText.replace(/\s+/g, ' ')).catch(() => '(none)'));
  }
}

if (ONLY === 'all' || ONLY === 'layout') {
  const MARIA = '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb';
  for (const theme of ['light', 'dark']) for (const w of [1440, 1366, 1280, 1200, 1024, 390]) {
    await p.setViewportSize({ width: w, height: 900 });
    await p.emulateMedia({ colorScheme: theme });
    await p.goto(rec(MARIA, '#treatment-record'), { waitUntil: 'networkidle' });
    const m = await p.evaluate(() => {
      const sec = document.querySelector('#rec-treatment-record');
      const t = sec.querySelector('table.trec');
      const pane = sec.querySelector('#treatment-record');
      const small = [...sec.querySelectorAll('button, a')].map((e) => { const r = e.getBoundingClientRect(); return [e.textContent.trim().slice(0, 24), Math.round(r.width), Math.round(r.height)]; }).filter(([, w, h]) => h > 0 && (h < 44 || w < 44));
      const idx = document.querySelector('#rec-rec-treatment-record-tab');
      const lh = idx ? parseFloat(getComputedStyle(idx).lineHeight) || 20 : 0;
      return {
        sw: document.documentElement.scrollWidth, iw: innerWidth,
        tw: Math.round(t.getBoundingClientRect().width), pw: Math.round(pane.getBoundingClientRect().width),
        mode: getComputedStyle(t.querySelector('thead')).display === 'none' || getComputedStyle(t.querySelector('thead')).position === 'absolute' ? 'cards' : getComputedStyle(t).display,
        tr: getComputedStyle(t.querySelector('tbody tr')).display,
        small,
        idx: idx ? `${idx.innerText.trim()} h=${Math.round(idx.getBoundingClientRect().height)}` : 'none',
      };
    });
    check(m.sw <= m.iw, `${theme} ${w}: no sideways scroll (${m.sw} vs ${m.iw})`);
    check(m.tw <= m.pw, `${theme} ${w}: table ${m.tw} within pane ${m.pw}`);
    check(m.small.length === 0, `${theme} ${w}: targets ≥44 ${JSON.stringify(m.small)}`);
    console.log(`     ${theme} ${w}: table display ${m.mode}, row display ${m.tr}; index ${m.idx}`);
    await p.screenshot({ path: `/tmp/claude-0/shots/trec-${theme}-${w}.png`, fullPage: false });
  }
  await p.setViewportSize({ width: 1440, height: 1000 });
  await p.emulateMedia({ colorScheme: 'light' });
}

if (ONLY === 'all' || ONLY === 'address') {
  const MARIA = '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb';
  await p.goto(rec(MARIA, '#timeline'), { waitUntil: 'networkidle' });
  check(await shown() === 'treatment-record', `#timeline opens the treatment record (${await shown()})`);
  check(new URL(p.url()).hash === '#treatment-record', `#timeline rewritten to ${new URL(p.url()).hash}`);
  const today = psql(`select (now() at time zone 'Asia/Manila')::date`);
  const past = psql(`select id from appointment where patient_id = '${MARIA}' and status = 'completed' and (starts_at at time zone 'Asia/Manila')::date < '${today}' order by starts_at desc limit 1`);
  const fut = psql(`select id from appointment where patient_id = '${MARIA}' and status not in ('cancelled','no_show') and (starts_at at time zone 'Asia/Manila')::date > '${today}' order by starts_at limit 1`);
  if (past) {
    await p.goto(rec(MARIA, `?visit=${past}`), { waitUntil: 'networkidle' });
    await p.waitForTimeout(300);
    check(await shown() === 'treatment-record', `?visit=<past> shows ${await shown()}`);
    check(await p.$eval(`#rec-visit-${past}`, (d) => d.open).catch(() => false), '?visit=<past> opens its panel');
  } else console.log('     (no past completed visit for Maria)');
  if (fut) {
    await p.goto(rec(MARIA, `?visit=${fut}`), { waitUntil: 'networkidle' });
    await p.waitForTimeout(300);
    check(await shown() === 'visits', `?visit=<future> shows ${await shown()}`);
    check(await p.$eval(`#rec-visit-${fut}`, (d) => d.open).catch(() => false), '?visit=<future> opens its panel');
  } else console.log('     (no future visit for Maria)');
  // A date button opens its visit panel.
  await p.goto(rec(MARIA, '#treatment-record'), { waitUntil: 'networkidle' });
  const btn = await p.$('#rec-treatment-record .trec-date');
  if (btn) {
    const target = await btn.getAttribute('data-ws-open');
    await btn.click();
    await p.waitForTimeout(300);
    check(await p.$eval(`#${target}`, (d) => d.open).catch(() => false), `a date opens ${target}`);
  }
  // Aftercare back link.
  const kind = 'extraction';
  await p.goto(`${BASE}/c/${SLUG}/patients/${MARIA}/aftercare/${kind}/`, { waitUntil: 'networkidle' });
  const backs = await p.$$eval('a', (as) => as.map((a) => a.getAttribute('href')).filter((h) => h && /#(timeline|treatment-record)/.test(h)));
  check(backs.length > 0 && backs.every((h) => h.endsWith('#treatment-record')), `aftercare back links ${JSON.stringify(backs)}`);
}

if (ONLY === 'all' || ONLY === 'print') {
  const MARIA = '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb';
  const n0 = Number(psql(`select count(*) from audit_log where action = 'record.treatment_record_print'`));
  await p.emulateMedia({ colorScheme: 'dark', media: 'print' });
  const r = await p.goto(`${BASE}/c/${SLUG}/patients/${MARIA}/treatment-record/`, { waitUntil: 'networkidle' });
  check(r.status() === 200, `print page ${r.status()}`);
  const n1 = Number(psql(`select count(*) from audit_log where action = 'record.treatment_record_print'`));
  check(n1 === n0 + 1, `print audited (${n0} → ${n1})`);
  const colors = await p.evaluate(() => { const t = document.querySelector('.tr-table td'); const cs = getComputedStyle(t); return [cs.color, getComputedStyle(document.body).backgroundColor]; });
  console.log('     print colours', colors);
  const heads = await p.$$eval('.tr-table thead th', (ths) => ths.map((t) => t.textContent.trim()));
  console.log('     print heads', JSON.stringify(heads));
  await p.pdf({ path: '/tmp/claude-0/shots/trec-print.pdf', format: 'A4' });
  await p.emulateMedia({ colorScheme: 'light', media: 'screen' });
  await p.screenshot({ path: '/tmp/claude-0/shots/trec-print.png', fullPage: true });
  const other = psql(`select p.id from patient p join clinic c on c.id = p.clinic_id where c.slug <> '${SLUG}' limit 1`);
  if (other) { const r2 = await p.goto(`${BASE}/c/${SLUG}/patients/${other}/treatment-record/`); check(r2.status() === 404, `other clinic's patient → ${r2.status()}`); }
}

console.log('errors:', errs.length ? errs.join(' || ') : 'none');
await b.close();
console.log(`${fails} failed`);
process.exit(fails ? 1 : 0);
