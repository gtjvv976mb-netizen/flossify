// Verifier: real clicks, as a person would, at 1440×900 and 390×844. Each flow opens the record on a tab, presses the
// real opener (Add ▾ and its item, a Today line, a card button, the chart's palette), fills the panel, presses its own
// Save, and reads where the page lands: the tab, the address, the saved line (one, on screen, under the row, its words),
// and for a refusal the panel reopened over the same tab with its sentence and its back.
import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
const BASE = `http://127.0.0.1:${process.env.PORT_ || 4470}`;
const P = { maria: '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', rich: '7e57a1c0-0000-4000-8000-000000000001', ledger: '9ea415bd-4b9e-4725-80e8-391464e2c12e' };
const SIZES = (process.env.S_ ?? '1440x900,390x844').split(',').map((s) => s.split('x').map(Number));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const results = [];
const LAND = () => {
  const vis = (el) => !!el && el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && el.getClientRects().length > 0;
  const sel = document.querySelector('[role="tab"][aria-selected="true"][id^="rec-rec-"]');
  const bar = document.querySelector('[data-rec-bar]').getBoundingClientRect();
  const lines = [...document.querySelectorAll('[data-rec-saved]')].filter(vis);
  const l = lines[0];
  const r = l?.getBoundingClientRect();
  let hit = null;
  if (r) { const e = document.elementFromPoint(Math.min(r.left + 30, innerWidth - 2), Math.min(Math.max(r.top + 12, 1), innerHeight - 2)); hit = !!e && l.contains(e); }
  const dlg = [...document.querySelectorAll('dialog[open]')];
  return {
    url: location.pathname.replace(/^.*\/patients\/[^/]+\//, '') + location.search + location.hash,
    tab: sel ? sel.id.replace(/^rec-rec-|-tab$/g, '') : null,
    lines: lines.length, words: l ? l.innerText.replace(/\s+/g, ' ').trim().slice(0, 200) : null,
    top: r ? Math.round(r.top) : null, bottom: r ? Math.round(r.bottom) : null, barBottom: Math.round(bar.bottom), vh: innerHeight, hit,
    dialogs: dlg.map((d) => d.id),
    dialogText: dlg.map((d) => [...d.querySelectorAll('.ws-callout')].filter(vis).map((c) => c.innerText.replace(/\s+/g, ' ').trim().slice(0, 100))).flat(),
    dialogBack: dlg.map((d) => [...d.querySelectorAll('input[name=back]')].map((b) => `${b.value}${b.form ? new URL(b.form.action).hash : ''}`)).flat(),
    sideways: document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth,
    focus: document.activeElement ? `${document.activeElement.tagName}${document.activeElement.id ? '#' + document.activeElement.id : ''}${document.activeElement.dataset?.fdi ? '[fdi=' + document.activeElement.dataset.fdi + ']' : ''}` : null,
  };
};
async function run(page, name, patient, tab, steps, expect) {
  await page.goto('about:blank');
  await page.goto(`${BASE}/c/session-road/patients/${P[patient]}/#${tab}`, { waitUntil: 'load' });
  await page.waitForTimeout(350);
  let err = null;
  try { await steps(page); } catch (e) { err = String(e).slice(0, 200); }
  await page.waitForLoadState('load'); await page.waitForTimeout(700);
  const got = await page.evaluate(LAND);
  const fail = [];
  if (err) fail.push('steps: ' + err);
  if (expect.tab && got.tab !== expect.tab) fail.push(`tab ${got.tab} ≠ ${expect.tab}`);
  if (expect.saved) {
    if (got.lines !== 1) fail.push(`${got.lines} saved lines`);
    else {
      if (got.top < got.barBottom - 1) fail.push(`line top ${got.top} under the row (ends ${got.barBottom})`);
      if (got.top > got.vh - 40) fail.push(`line top ${got.top} below the screen (${got.vh})`);
      if (!got.hit) fail.push('line not hit-testable');
      for (const w of [].concat(expect.saved)) if (!got.words?.includes(w)) fail.push(`no "${w}" in "${got.words}"`);
    }
  }
  if (expect.dialog) {
    if (!got.dialogs.includes(expect.dialog)) fail.push(`no dialog ${expect.dialog} (${got.dialogs})`);
    if (!got.dialogText.length) fail.push('no sentence in the panel');
    if (expect.back && !got.dialogBack.some((b) => b === `${expect.back}#${expect.back}`)) fail.push(`back ${JSON.stringify(got.dialogBack)}`);
  }
  if (expect.url && !expect.url.test(got.url)) fail.push(`url ${got.url}`);
  if (got.sideways > 0) fail.push(`sideways ${got.sideways}`);
  results.push({ name, size: page.viewportSize().width, patient, tab, got, fail });
}
const addItem = async (page, label) => {
  await page.click('.rec-add > button');
  await page.waitForTimeout(150);
  await page.locator('[data-rec-add-item]', { hasText: label }).first().click();
  await page.waitForTimeout(250);
};
const saveIn = async (page, dlg, sel = 'button[type=submit]') => {
  await Promise.all([page.waitForNavigation(), page.locator(`#${dlg} form:not([hidden]) ${sel}`).last().click()]);
};
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDlnNqdQAAAABJRU5ErkJggg==', 'base64');

for (const [w, h] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('dialog', (d) => d.accept());
  await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);

  // Rx from Today through Add ▾: the Print line and the PTR warning on Today.
  await run(page, 'addmenu rx', 'maria', 'overview', async (p) => {
    await addItem(p, 'Prescription');
    await p.fill('#rec-rx-add [name=drug] >> nth=0', 'Amoxicillin');
    await p.fill('#rec-rx-add [name=sig] >> nth=0', '1 capsule every 8 hours for 7 days');
    await p.selectOption('#rec-rx-add [name=prescriber]', { index: 1 });
    await saveIn(p, 'rec-rx-add');
  }, { tab: 'overview', saved: ['Prescription saved', 'Print it', 'PTR'], url: /back=overview.*#overview$/ });
  // Rx from Today's This visit "Also: Prescription" (Rich is in the chair).
  await run(page, 'strip rx', 'rich', 'overview', async (p) => {
    await p.locator('#this-visit [data-ws-open="rec-rx-add"]').click(); await p.waitForTimeout(250);
    await p.fill('#rec-rx-add [name=drug] >> nth=0', 'Paracetamol');
    await p.fill('#rec-rx-add [name=sig] >> nth=0', '1 tablet every 6 hours as needed');
    await p.selectOption('#rec-rx-add [name=prescriber]', { index: 1 });
    await saveIn(p, 'rec-rx-add');
  }, { tab: 'overview', saved: ['Prescription saved', 'PTR'], url: /visit=.*back=overview/ });
  // Rx refused from Treatment record (no medicine): the panel back over the Treatment record.
  await run(page, 'addmenu rx refused', 'maria', 'treatment-record', async (p) => {
    await addItem(p, 'Prescription');
    await p.selectOption('#rec-rx-add [name=prescriber]', { index: 1 });
    await p.evaluate(() => { document.querySelector('#rec-rx-add form').noValidate = true; });
    await saveIn(p, 'rec-rx-add');
  }, { tab: 'treatment-record', dialog: 'rec-rx-add', back: 'treatment-record' });
  // Blood pressure from Today's "Take it" line (Maria, not taken today).
  await run(page, 'strip bp', 'maria', 'overview', async (p) => {
    await p.locator('#this-visit [data-ws-open="rec-vitals-add"]').first().click(); await p.waitForTimeout(250);
    await p.fill('#rec-vitals-add [name=systolic]', '118'); await p.fill('#rec-vitals-add [name=diastolic]', '76');
    await saveIn(p, 'rec-vitals-add');
  }, { tab: 'overview', saved: 'Reading saved', url: /back=overview/ });
  // A high BP from Treatment record via Add ▾: the line there says what it means.
  await run(page, 'addmenu bp high', 'ledger', 'treatment-record', async (p) => {
    await addItem(p, 'Blood pressure');
    await p.fill('#rec-vitals-add [name=systolic]', '182'); await p.fill('#rec-vitals-add [name=diastolic]', '112');
    await saveIn(p, 'rec-vitals-add');
  }, { tab: 'treatment-record', saved: 'Reading saved', url: /back=treatment-record/ });
  // Letter (certificate) from Patient info through Add ▾.
  await run(page, 'addmenu letter', 'ledger', 'patient', async (p) => {
    await addItem(p, 'Certificate or letter');
    await p.selectOption('#rec-letter-add select[name=dentist], #rec-letter-add select[name=signer]', { index: 1 }).catch(() => {});
    await p.evaluate(() => { const f = document.querySelector('#rec-letter-add form'); const d = f.querySelector('[name=diagnosis]'); if (d) d.value = 'Tooth 36 restored'; const s = f.querySelector('select'); if (s && !s.value) s.selectedIndex = 1; });
    await saveIn(p, 'rec-letter-add');
  }, { tab: 'patient', saved: ['saved', 'Print it'], url: /back=patient/ });
  // Note from Chart & plan through Add ▾ (not the palette): lands on Chart & plan.
  await run(page, 'addmenu note on chart', 'ledger', 'chart', async (p) => {
    await addItem(p, 'Clinical note');
    await p.fill('#rec-note-add [name=complaint]', 'Verifier note from Chart & plan');
    await saveIn(p, 'rec-note-add');
  }, { tab: 'chart', saved: 'Note saved', url: /back=chart/ });
  // Lab case from Today through Add ▾.
  await run(page, 'addmenu lab', 'ledger', 'overview', async (p) => {
    await addItem(p, 'Lab case');
    await p.fill('#rec-lab-add [name=lab]', 'Verifier Lab'); await p.fill('#rec-lab-add [name=description]', 'PFM crown, 21');
    await saveIn(p, 'rec-lab-add');
  }, { tab: 'overview', saved: 'Lab case added', url: /back=overview/ });
  // X-ray from Treatment record through Add ▾.
  await run(page, 'addmenu file', 'ledger', 'treatment-record', async (p) => {
    await addItem(p, 'X-ray or photo');
    await p.setInputFiles('#rec-file-add input[type=file]', { name: 'bitewing.png', mimeType: 'image/png', buffer: PNG });
    await p.waitForTimeout(200);
    await saveIn(p, 'rec-file-add');
  }, { tab: 'treatment-record', saved: 'added to the record', url: /back=treatment-record/ });
  // Add to plan from Patient info through Add ▾.
  await run(page, 'addmenu plan', 'ledger', 'patient', async (p) => {
    await addItem(p, 'Add to plan');
    await p.evaluate(() => { const s = document.querySelector('#rec-plan-add select[name=catalog_id]'); s.value = [...s.options].find((o) => o.value)?.value; s.dispatchEvent(new Event('change', { bubbles: true })); });
    await saveIn(p, 'rec-plan-add');
  }, { tab: 'patient', saved: 'Added to the plan', url: /back=patient/ });
  // A plan row's own Patient agreed (no back): lands in the plan card with its line.
  await run(page, 'plan row agreed', 'ledger', 'chart', async (p) => {
    const b = p.locator('#treatment form:has(input[name=to][value=accepted]) button').first();
    await b.scrollIntoViewIfNeeded();
    await Promise.all([p.waitForNavigation(), b.click()]);
  }, { tab: 'chart', saved: 'Marked accepted', url: /#treatment$/ });
  // The next check-up's own "In 6 months" on Today.
  await run(page, 'recall 6 months', w > 1000 ? 'ledger' : 'rich', 'overview', async (p) => {
    const b = p.locator('#recall form:has(input[name=months][value="6"]) button').first();
    await b.scrollIntoViewIfNeeded();
    await Promise.all([p.waitForNavigation(), b.click()]);
  }, { tab: 'overview', saved: 'Next check-up set', url: /#recall$/ });
  // Palette: tooth 26 → Add to plan → Save: Chart & plan, back=chart.
  await run(page, 'palette plan', 'maria', 'chart', async (p) => {
    const t = p.locator('[data-odontogram] button[data-tooth][data-fdi="26"]').first();
    await t.scrollIntoViewIfNeeded(); await t.click(); await p.waitForTimeout(250);
    await p.locator('[data-pick-open="rec-plan-add"]:visible').first().click(); await p.waitForTimeout(300);
    await p.evaluate(() => { const s = document.querySelector('#rec-plan-add select[name=catalog_id]'); s.value = [...s.options].find((o) => o.value)?.value; s.dispatchEvent(new Event('change', { bubbles: true })); });
    await saveIn(p, 'rec-plan-add');
  }, { tab: 'chart', saved: 'Added to the plan', url: /back=chart.*#chart$/ });
  // Edit details from Chart & plan, refused (no last name): back over Chart & plan.
  await run(page, 'details refused', 'maria', 'chart', async (p) => {
    await p.locator('button[data-ws-open="details"]').first().click(); await p.waitForTimeout(250);
    await p.evaluate(() => { const f = document.querySelector('#details form'); f.noValidate = true; f.querySelector('[name=last_name]').value = ''; });
    await saveIn(p, 'details');
  }, { tab: 'chart', dialog: 'details', back: 'chart' });
  // Record a treatment from Today (Rich is in the chair; Treatment done has one today): Add ▾ › Record a treatment.
  await run(page, 'addmenu done', 'ledger', 'patient', async (p) => {
    await addItem(p, 'Record a treatment');
    await p.fill('#rec-done-add form[data-pick-form] input[name=name]', 'Oral prophylaxis (verifier)');
    await saveIn(p, 'rec-done-add', 'form[data-pick-form] button[type=submit]'.replace('form[data-pick-form] ', ''));
  }, { tab: 'patient', saved: 'Treatment recorded', url: /back=patient/ });
  results.forEach((r) => { if (r.size === w) r.errors = errors.slice(); });
  await ctx.close();
}
await browser.close();
writeFileSync('/tmp/fl-simple-scratch/verify-S2/r2/flows.json', JSON.stringify(results, null, 1));
let bad = 0;
const pad = (s, n) => String(s ?? '').padEnd(n).slice(0, n);
for (const r of results) {
  if (r.fail.length) bad++;
  console.log(`${pad(r.size, 5)} ${pad(r.name, 24)} ${pad(r.tab, 17)} → ${pad(r.got.tab, 17)} line y${r.got.top}-${r.got.bottom} row ${r.got.barBottom} ${pad(r.got.words ?? r.got.dialogText.join(' / '), 90)} ${r.fail.length ? 'FAIL ' + r.fail.join('; ') : 'ok'}`);
}
const errs = [...new Set(results.flatMap((r) => r.errors ?? []))];
console.log(`page errors: ${errs.length ? errs.join(' | ') : 'none'}`);
console.log(`${results.length} flows, ${bad} failing`);
