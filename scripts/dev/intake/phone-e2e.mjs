// The intake's phone path (phase 3), end to end in two browsers: the desk prepares the forms and shows the QR
// code; the patient's own phone scans it (opens its link), presses Start, fills in page 1 and signs the general
// consent, and sends; the desk's live panel sees it arrive. Then a patient on file: Start, a wrong birth date
// (told), the right one, sign, send. A second phone opening a claimed link is turned away. Checks the database
// after each path (the intake added, the signing sealed, the link retired as sent). Then the record (phase 4):
// a form signed again under newer words (B2), page 1 beside a record on file with "Use" per detail (D), and
// withdrawals and overrides asked for and drawn (E).
//
//   node scripts/dev/intake/phone-e2e.mjs [base=http://127.0.0.1:4610] [slug] [email] [password=flossify]
//   DB=flossify_t (default) · PGHOST (default /var/run/postgresql) · PGUSER — the server's own database, local only
//
// Needs a dev server on `base` whose DATABASE_URL is that database (the QR's link is read from the desk page's
// data-ik-qr-url in development, else from the database). The sign-in is a seeded owner (scripts/db/seed.ts).
// Leaves two added patients' intakes behind (archived data, never deleted: the chart-number rule in CLAUDE.md).
// Set PW_CHROMIUM to a Chromium binary when Playwright's own is not installed. Prints what it saw; exit 1 on
// the first failure.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import pg from 'pg';

const [base = 'http://127.0.0.1:4610', slugArg = '', emailArg = '', password = 'flossify'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const DB = process.env.DB ?? 'flossify_t';
const HOST = process.env.PGHOST ?? '/var/run/postgresql';
if (!HOST.startsWith('/') && !['localhost', '127.0.0.1', '::1'].includes(HOST)) throw new Error('refusing: not a local database');
const db = new pg.Client({ host: HOST, user: process.env.PGUSER, database: DB });
await db.connect();
const q = async (sql, params = []) => (await db.query(sql, params)).rows;

// Who signs in, and where: the first seeded owner with a password, at their home clinic.
const owner = (await q(
  `select s.email, c.slug, c.id as clinic_id from staff s join clinic c on c.id = s.home_clinic_id
    where s.role = 'owner' and s.password_hash is not null and s.email like '%@example.com' ${emailArg ? 'and s.email = $1' : ''}
    order by s.email limit 1`, emailArg ? [emailArg] : []))[0];
assert(owner, 'no seeded owner to sign in as');
const slug = slugArg || owner.slug;
const clinicId = (await q('select id from clinic where slug = $1', [slug]))[0]?.id;
assert(clinicId, `no clinic ${slug}`);
const log = (s) => console.log(`  ${s}`);
const ok = (s) => console.log(`  ok  ${s}`);

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const errs = [];
// Astro's dev toolbar audits the page and sometimes cannot fetch its own data: not the app's error.
const noise = (t) => /Astro background:|dev toolbar|audit's match function/.test(t);
const watch = (p, who) => { p.on('pageerror', (e) => errs.push(`${who}: ${e.message}`)); p.on('console', (m) => { if (m.type() === 'error' && !noise(m.text())) errs.push(`${who}: ${m.text()}`); }); };

// ---------------------------------------------------------------------------
// The desk
// ---------------------------------------------------------------------------
const deskCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const desk = await deskCtx.newPage();
desk.setDefaultTimeout(60_000);
watch(desk, 'desk');
await desk.goto(`${base}/auth/login/?any=1`, { waitUntil: 'load' });
await desk.fill('#email', owner.email);
await desk.fill('#password', password);
await Promise.all([desk.waitForURL(/\/c\//), desk.click('[data-go]')]);
ok(`desk signed in as ${owner.email} at ${slug}`);

/** The chooser → the intake → Check → the phone → step 4 with the QR code. Returns the intake id and the link. */
async function prepareOnDesk(patientId) {
  await desk.goto(`${base}/c/${slug}/patients/new/${patientId ? `?patient=${patientId}` : ''}`, { waitUntil: 'load' });
  const phone = desk.locator('input[name="way"][value="phone"]');
  assert.equal(await phone.isDisabled(), false, 'the phone card is open on this server');
  await phone.check();
  await Promise.all([desk.waitForURL(/\/patients\/intake\/[0-9a-f-]+\//), desk.click('[data-ik-choose] button[type="submit"].ws-btn-primary')]);
  const intakeId = desk.url().match(/\/intake\/([0-9a-f-]+)\//)[1];
  const here = `${base}/c/${slug}/patients/intake/${intakeId}/`;
  ok(`intake started ${intakeId.slice(0, 8)}… (${patientId ? 'a patient on file' : 'a new patient'})`);
  // Step 1: not under 18; only the general consent (every procedure form would wait for the dentist).
  if (!patientId) await desk.check('input[name="desk_minor"][value="no"]');
  const boxes = await desk.locator('input[data-ik-form]').all();
  const codes = await Promise.all(boxes.map((b) => b.getAttribute('data-ik-form')));
  for (const [i, box] of boxes.entries()) {
    if (codes[i] !== 'general' && (await box.isChecked()) && !(await box.isDisabled())) await box.uncheck();
  }
  // The general consent where it is a box; for a patient on file who has signed it already, the first form offered.
  const general = boxes.find((_, i) => codes[i] === 'general');
  if (general && !(await general.isDisabled())) await general.check();
  else if (!(await desk.locator('input[data-ik-form]:checked').count())) {
    for (const box of boxes) if (!(await box.isDisabled())) { await box.check(); break; }
  }
  log(`forms ticked: ${(await desk.locator('input[data-ik-form]:checked').evaluateAll((els) => els.map((e) => e.dataset.ikForm))).join(', ') || '(the general consent, always)'}`);
  await desk.click('[data-ik-handover-now]');
  await desk.waitForLoadState('load');
  if (!/step=check/.test(desk.url())) {
    const problems = await desk.locator('[data-ik-problems]').allTextContents();
    throw new Error(`the consents step was refused: ${problems.join(' | ').replace(/\s+/g, ' ').trim() || desk.url()}`);
  }
  // Step 3: their phone.
  const radio = desk.locator('input[name="device"][value="phone"]');
  assert.equal(await radio.isDisabled(), false, 'the phone is offered on Check');
  await radio.check();
  assert.equal((await desk.textContent('[data-ik-go]')).trim(), 'Show the QR code');
  await Promise.all([desk.waitForURL(/step=out/), desk.click('[data-ik-go]')]);
  // Step 4: the QR code, the state words, and the link.
  await desk.waitForSelector('[data-ik-qr] svg');
  const state = (await desk.textContent('[data-ik-state]')).trim();
  assert.match(state, /^Waiting to be scanned, until \d/, state);
  const url = await desk.getAttribute('[data-ik-qr]', 'data-ik-qr-url');
  const row = (await q(
    `select l.token, l.open_by from intake_link l where l.intake_id = $1 and l.retired_at is null and l.device = 'phone'`, [intakeId]))[0];
  assert(row, 'a live phone link in the database');
  const link = url ?? `${base}/f/i/${row.token}/`;
  assert(link.endsWith(`/f/i/${row.token}/`), `the QR holds the link: ${link}`);
  const svgLabel = await desk.getAttribute('[data-ik-qr] svg', 'aria-label');
  ok(`QR code shown (${svgLabel}); state "${state}"; scan by ${new Date(row.open_by).toISOString()}`);
  return { intakeId, here, link, token: row.token };
}

/** The desk's live panel, as the page's script reads it. */
async function live(here) {
  const r = await desk.request.get(`${here}?step=out&live=1`, { headers: { accept: 'application/json' } });
  assert.equal(r.status(), 200, `live panel answers 200 (got ${r.status()})`);
  return r.json();
}

// ---------------------------------------------------------------------------
// The patient's phone
// ---------------------------------------------------------------------------
const phoneCtx = async () => browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

/** Fill whatever the visible screen asks for (page 1's screens): the server reads the answers, this only types. */
async function fillPage1Screen(p, who) {
  for (let round = 0; round < 5; round++) {
    const did = await p.evaluate((who) => {
      const form = document.querySelector('[data-ip-page1]');
      if (!form) return -1;
      // A pill's radio or box is visually hidden behind its label: for those, only the page's own hiding counts.
      const hidden = (el) => !!el.closest('[data-off]') || !!el.closest('[hidden]');
      const visible = (el) => !hidden(el) && (el.type === 'radio' || el.type === 'checkbox' || !!el.offsetParent || el.getClientRects().length > 0);
      let n = 0;
      const fire = (el) => { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
      const seen = new Set();
      for (const el of form.querySelectorAll('input, select, textarea')) {
        if (!visible(el) || el.disabled || el.type === 'hidden') continue;
        if (el.type === 'radio') {
          if (seen.has(el.name)) continue; seen.add(el.name);
          const group = Array.from(form.querySelectorAll(`input[type="radio"][name="${el.name}"]`)).filter(visible);
          if (group.some((r) => r.checked)) continue;
          // A health question: "No" where it is offered, else the first answer.
          const pick = group.find((r) => /^(no|none|wala|hindi)$/i.test(r.value)) ?? group[0];
          pick.checked = true; fire(pick); n++;
        } else if (el.type === 'checkbox') {
          const group = Array.from(form.querySelectorAll(`input[type="checkbox"][name="${el.name}"]`)).filter(visible);
          if (group.length > 1) { if (seen.has(el.name)) continue; seen.add(el.name); if (group.some((c) => c.checked)) continue; group[0].checked = true; fire(group[0]); n++; }
          else if (!el.checked && (el.getAttribute('aria-required') === 'true' || /consent|agree|privacy/.test(el.name))) { el.checked = true; fire(el); n++; }
        } else if (el.tagName === 'SELECT') {
          if (el.value) continue;
          const opt = Array.from(el.options).find((o) => o.value);
          if (opt) { el.value = opt.value; fire(el); n++; }
        } else if (el.tagName === 'TEXTAREA') {
          if (el.value || el.getAttribute('aria-required') !== 'true') continue;
          el.value = 'None'; fire(el); n++;
        } else {
          if (el.value) continue;
          const name = el.name;
          const required = el.getAttribute('aria-required') === 'true';
          let v = '';
          if (el.type === 'date') v = who.birth;
          else if (el.type === 'tel') v = who.mobile;
          else if (el.type === 'email') v = required ? who.email : '';
          else if (/first/.test(name)) v = who.first;
          else if (/last/.test(name)) v = who.last;
          else if (/middle|suffix/.test(name)) v = '';
          else if (/city|town|municipal/.test(name)) v = 'Baguio City';
          else if (/province/.test(name)) v = 'Benguet';
          else if (/barangay|street|address/.test(name)) v = 'Session Road';
          else if (/postal|zip/.test(name)) v = '2600';
          else if (/occupation|work/.test(name)) v = 'Teacher';
          else if (/name/.test(name)) v = `${who.first} ${who.last}`;
          else if (/relation/.test(name)) v = 'Mother';
          else if (required) v = 'Test';
          if (!v) continue;
          el.value = v; fire(el); n++;
        }
      }
      return n;
    }, who);
    if (did <= 0) break;
  }
}

/** Page 1, screen by screen, until a consent form shows. */
async function doPage1(p, who) {
  for (let screen = 0; screen < 8; screen++) {
    if (await p.locator('[data-ip-consent]').count()) return;
    await p.waitForSelector('[data-ip-page1]');
    await fillPage1Screen(p, who);
    const legend = (await p.textContent('[data-ip-page1] legend')).trim();
    await Promise.all([p.waitForLoadState('load'), p.click('[data-ip-page1] button.btn-primary')]);
    if (await p.locator('[data-ip-alert]').count()) {
      const items = await p.locator('[data-ip-alert] li').allTextContents();
      // What the refused questions look like on the page, for whoever fixes this script or the page.
      const why = await p.evaluate(() => Array.from(document.querySelectorAll('[data-ip-alert] a')).map((a) => {
        const name = (a.getAttribute('href') ?? '').replace(/^#f-/, '').replace(/-0$/, '');
        const els = Array.from(document.querySelectorAll(`[name="${name}"]`));
        return `${name}: ${els.length} inputs` + els.slice(0, 3).map((el) => ` [${el.type} checked=${el.checked} off=${!!el.closest('[data-off]')} rects=${el.getClientRects().length} label=${el.closest('label')?.className ?? '-'}]`).join('');
      }));
      throw new Error(`page 1 "${legend}" refused: ${items.join(' | ')}\n${why.join('\n')}`);
    }
    log(`page 1: ${legend} saved`);
  }
  throw new Error('page 1 never reached a consent form');
}

/** A consent form: every tick, "I agree", the patient signs, a signature drawn on the pad. */
async function signForm(p) {
  await p.waitForSelector('[data-ip-consent]');
  const title = (await p.locator('[data-ip-consent] h2, [data-ip-consent] .cd-title, [data-ip-consent] h1').first().textContent().catch(() => 'a form')).trim();
  assert(await p.locator('[data-ip-consent][data-signable]').count(), `${title} can be signed now`);
  for (const t of await p.locator('[data-ip-tick]').all()) if (!(await t.isChecked())) await t.check();
  await p.check('[data-ip-decision][value="agree"]');
  if (await p.locator('[data-ip-signer="patient"]').count()) await p.check('[data-ip-signer="patient"]');
  const canvas = p.locator('[data-sp-canvas]');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  assert(box, 'the signature pad is on the page');
  const x0 = box.x + box.width * 0.15, y0 = box.y + box.height * 0.6;
  await p.mouse.move(x0, y0); await p.mouse.down();
  for (let i = 1; i <= 24; i++) await p.mouse.move(x0 + (box.width * 0.6 * i) / 24, y0 + Math.sin(i / 2) * box.height * 0.18);
  await p.mouse.up();
  await p.mouse.move(x0 + 20, y0 - 30); await p.mouse.down();
  for (let i = 1; i <= 10; i++) await p.mouse.move(x0 + 20 + i * 8, y0 - 30 + i * 4);
  await p.mouse.up();
  const strokes = await p.inputValue('[data-sp-strokes]');
  assert(strokes.length > 40, 'the pad recorded the strokes');
  await Promise.all([p.waitForLoadState('load'), p.click('[data-ip-go]')]);
  if (await p.locator('[data-ip-note]').count()) throw new Error(`${title} refused: ${(await p.textContent('[data-ip-note]')).trim()}`);
  log(`signed: ${title}`);
}

/** Every form, then Check and send, to the thank-you. */
async function signAllAndSend(p) {
  for (let n = 0; n < 6 && (await p.locator('[data-ip-consent]').count()); n++) await signForm(p);
  await p.waitForSelector('form:has(input[name="intent"][value="send"])');
  await Promise.all([p.waitForLoadState('load'), p.click('form:has(input[name="intent"][value="send"]) button[type="submit"]')]);
  await p.waitForSelector('[data-ip-done-card]');
  const thanks = (await p.textContent('[data-ip-done-card] h1')).trim();
  ok(`phone: "${thanks}"`);
}

// ---------------------------------------------------------------------------
// Path A: a new patient
// ---------------------------------------------------------------------------
console.log('\nA. A new patient, on their own phone');
const A = await prepareOnDesk(null);
const phoneA = await (await phoneCtx()).newPage();
phoneA.setDefaultTimeout(60_000);
watch(phoneA, 'phone A');
await phoneA.goto(A.link, { waitUntil: 'load' });
await phoneA.waitForSelector('[data-ip-start]');
assert.match(await phoneA.textContent('#ip-start-title'), /Your forms from/, 'the Start screen names the clinic');
assert.equal(await phoneA.locator('[data-ip-page1]').count(), 0, 'nothing of the forms before Start');
await Promise.all([phoneA.waitForLoadState('load'), phoneA.click('[data-ip-start] button.btn-primary')]);
await phoneA.waitForSelector('[data-ip-page1]');
ok('phone A: Start claimed the link; page 1 open');
{
  const j = await live(A.here);
  assert.equal(j.status, 'out'); assert.equal(j.claimed, true);
  assert.match(j.state.words, /^On their phone/, j.state.words);
  await desk.reload({ waitUntil: 'load' });
  assert.equal(await desk.locator('[data-ik-qr]').count(), 0, 'the QR code is gone from the desk once claimed');
  ok(`desk live panel: "${j.state.words}", no QR code`);
}
// A second phone on the same link is turned away.
{
  const other = await (await phoneCtx()).newPage();
  const r = await other.goto(A.link, { waitUntil: 'load' });
  assert.equal(r.status(), 409, `a second phone gets 409 (got ${r.status()})`);
  assert.match(await other.textContent('#ip-status-title'), /another device/);
  await other.context().close();
  ok('a second phone: "open on another device"');
}
const whoA = { first: 'Ana', last: 'Dimaculangan', birth: '1990-05-14', mobile: '0917 555 0199', email: 'ana.dimaculangan@example.com' };
await doPage1(phoneA, whoA);
{
  const j = await live(A.here);
  assert.equal(j.pages[0].words, 'Done', `page 1 reads Done on the desk (got ${j.pages[0].words})`);
  ok('desk live panel: page 1 Done');
}
await signAllAndSend(phoneA);
{
  const j = await live(A.here);
  assert.ok(j.status === 'added' || j.status === 'sent', `the desk sees it sent (got ${j.status})`);
  const it = (await q('select status, added_as, patient_id from intake where id = $1', [A.intakeId]))[0];
  const pt = it.patient_id ? (await q('select first_name, last_name, birth_date::text as b from patient where id = $1', [it.patient_id]))[0] : null;
  const link = (await q('select retired_why from intake_link where token = $1', [A.token]))[0];
  const signings = await q('select count(*)::int as n from consent_signing s join consent_document d on d.id = s.document_id where d.intake_id = $1', [A.intakeId]);
  assert.equal(link.retired_why, 'sent');
  assert.equal(signings[0].n, 1, 'one signing sealed');
  ok(`database: intake ${it.status}${it.added_as ? ` as ${it.added_as}` : ''}${pt ? `, patient ${pt.first_name} ${pt.last_name} born ${pt.b}` : ''}, link retired as sent, 1 signing`);
  const r = await desk.goto(`${A.here}?step=out`, { waitUntil: 'load' });
  assert.equal(r.status(), 200);
  log(`desk page now at ${new URL(desk.url()).search || '(no step)'}`);
}
await phoneA.context().close();

/** No sideways scroll, and every visible button at least 44 px tall, on the page as it is (a dialog's buttons too). */
async function fitsPage(p, what) {
  const g = await p.evaluate(() => ({
    scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    small: Array.from(document.querySelectorAll('button, a.btn, a.ws-btn, input[type="submit"]')).filter((b) => b.getClientRects().length && b.getBoundingClientRect().height > 0 && b.getBoundingClientRect().height < 44)
      .map((b) => `${(b.textContent ?? '').trim().slice(0, 30)} ${Math.round(b.getBoundingClientRect().height)}px`),
  }));
  assert.equal(g.scroll, 0, `${what}: no sideways scroll (overflow ${g.scroll}px)`);
  assert.deepEqual(g.small, [], `${what}: every button at least 44 px`);
  ok(`${what}: fits ${await p.evaluate(() => innerWidth)} px, buttons ≥ 44 px`);
}

// ---------------------------------------------------------------------------
// Path B: a patient on file types their birth date first
// ---------------------------------------------------------------------------
console.log('\nB. A patient on file, on their own phone');
// A patient on file with a birth date, by preference one with a visit today, so the signed form's place on the
// record (phase 4: the Treatment record and the visit panel) can be checked afterwards.
const onFile = (await q(
  `select * from (
     select p.id, p.first_name, p.birth_date::text as birth, p.created_at,
            (select a.id from appointment a where a.patient_id = p.id and (a.starts_at at time zone 'Asia/Manila')::date = (now() at time zone 'Asia/Manila')::date
                and a.status not in ('cancelled', 'no_show') order by a.starts_at limit 1) as visit_today
       from patient p where p.clinic_id = $1 and p.birth_date is not null and p.archived_at is null) x
    order by (visit_today is null), created_at limit 1`, [clinicId]))[0];
assert(onFile, 'a seeded patient with a birth date');
const B = await prepareOnDesk(onFile.id);
const phoneB = await (await phoneCtx()).newPage();
phoneB.setDefaultTimeout(60_000);
watch(phoneB, 'phone B');
await phoneB.goto(B.link, { waitUntil: 'load' });
await phoneB.waitForSelector('[data-ip-start]');
await Promise.all([phoneB.waitForLoadState('load'), phoneB.click('[data-ip-start] button.btn-primary')]);
await phoneB.waitForSelector('[data-ip-verify]');
assert.equal(await phoneB.locator('[data-ip-consent]').count(), 0, 'no form before the birth date');
ok('phone B: Start → the birth date is asked, nothing of the record shown');
{
  const j = await live(B.here);
  assert.match(j.state.words, /typing the birth date/, j.state.words);
  ok(`desk live panel: "${j.state.words}"`);
}
await phoneB.fill('#f-birth_date', '2001-02-03');
await Promise.all([phoneB.waitForLoadState('load'), phoneB.click('[data-ip-verify] button.btn-primary')]);
await phoneB.waitForSelector('[data-ip-verify] [data-ip-note]');
assert.match(await phoneB.textContent('[data-ip-verify] [data-ip-note]'), /not the date of birth/);
assert.equal((await q('select id_tries from intake where id = $1', [B.intakeId]))[0].id_tries, 1);
ok('phone B: a wrong birth date is told, one try counted');
await phoneB.fill('#f-birth_date', onFile.birth);
await Promise.all([phoneB.waitForLoadState('load'), phoneB.click('[data-ip-verify] button.btn-primary')]);
await phoneB.waitForSelector('[data-ip-consent]');
ok('phone B: the right birth date opens the forms');
await signAllAndSend(phoneB);
{
  const it = (await q('select status, added_as, patient_id, verified_at is not null as v from intake where id = $1', [B.intakeId]))[0];
  assert.equal(it.patient_id, onFile.id);
  assert.equal(it.v, true);
  const link = (await q('select retired_why from intake_link where token = $1', [B.token]))[0];
  assert.equal(link.retired_why, 'sent');
  ok(`database: intake ${it.status} for ${onFile.first_name} (verified), link retired as sent`);
}
await phoneB.context().close();

// Phase 4: the signed form on the record. With a visit today, the form joins it: a card in the visit panel (where it
// was signed, by whom, Open the form, Print) and, once the visit has begun, a consent row on the Treatment record
// and on its paper. Without one, the form stays in Consent only (checked too).
{
  const title = (await q(`select v.title from consent_document d join consent_version v on v.id = d.version_id where d.intake_id = $1 and d.cancelled_at is null limit 1`, [B.intakeId]))[0]?.title;
  const record = `${base}/c/${slug}/patients/${onFile.id}/`;
  await desk.goto(record, { waitUntil: 'load' });
  if (onFile.visit_today) {
    const panel = desk.locator(`#rec-visit-${onFile.visit_today}`);
    assert.equal(await panel.count(), 1, 'the visit panel for today’s visit is on the record');
    const card = panel.locator('[data-vx-form]');
    assert.ok(await card.count() >= 1, 'the signed form has a card in the visit panel');
    const words = (await card.first().innerText()).replace(/\s+/g, ' ');
    assert.match(words, /Signed/, words);
    assert.match(words, /on their phone/, words);
    assert.ok(words.includes(title), `the card names the form (${title})`);
    assert.equal(await card.first().locator('a[href$="/print/"]').count(), 1, 'the card has Print');
    assert.equal(await card.first().locator('svg').count() >= 1, true, 'the card draws the signature');
    const visit = (await q(`select status, starts_at < now() as begun from appointment where id = $1`, [onFile.visit_today]))[0];
    const begun = visit.begun || ['arrived', 'in_lobby', 'in_chair', 'completed'].includes(visit.status);
    const row = desk.locator('tr[data-kind="consent"]');
    if (begun) {
      assert.ok(await row.count() >= 1, 'a consent row on the Treatment record once the visit has begun');
      const rowWords = (await row.first().innerText()).replace(/\s+/g, ' ');
      assert.match(rowWords, /Signed by .* · on their phone/, rowWords);
      const paper = await desk.goto(`${record}treatment-record/`, { waitUntil: 'load' });
      assert.equal(paper.status(), 200);
      assert.match((await desk.textContent('body')).replace(/\s+/g, ' '), /on their phone/, 'the paper carries the consent row');
      ok(`record: the form is on the visit panel and the Treatment record (visit ${visit.status}); the paper too`);
      // The record with that visit's panel open fits a desk and a phone.
      await desk.goto(`${record}?visit=${onFile.visit_today}`, { waitUntil: 'load' });
      await desk.waitForTimeout(600);
      await fitsPage(desk, 'record with the visit panel open at 1440');
      await desk.setViewportSize({ width: 390, height: 844 });
      await desk.reload({ waitUntil: 'load' });
      await desk.waitForTimeout(600);
      await fitsPage(desk, 'record with the visit panel open at 390');
      await desk.setViewportSize({ width: 1440, height: 900 });
    } else {
      assert.equal(await row.count(), 0, 'no ledger row before the visit begins');
      ok(`record: the form is on the visit panel; the visit (${visit.status}, not begun) has no ledger row yet`);
    }
  } else {
    assert.equal(await desk.locator('[data-vx-form]').count(), 0, 'with no visit today the form joins no visit');
    ok('record: no visit today, so the form stays in Consent only');
  }
}

// ---------------------------------------------------------------------------
// Path B2 (phase 4.2): a form on the record under older words is signed again under the words in force, from
// the record, on the patient's phone. An older version of the general consent is planted (a superuser's row,
// never offered: the words in force stay treatment-2026-09), with an unsigned form on it for the same patient.
// ---------------------------------------------------------------------------
console.log('\nB2. Newer words: sign again from the record, on their phone');
{
  await q(`insert into consent_version (id, title, summary, effective_from, kind) values ('treatment-2026-01', 'Consent to dental examination and treatment', 'An older wording, for the test.', '2026-01-01', 'treatment') on conflict (id) do nothing`);
  const staffId = (await q('select id from staff where email = $1', [owner.email]))[0].id;
  await q(`delete from consent_document where ref = 'CF-TEST2' and clinic_id = $1 and not exists (select 1 from consent_signing s where s.document_id = consent_document.id)`, [clinicId]).catch(() => {});
  const old = (await q(`insert into consent_document (clinic_id, ref, version_id, patient_id, fields, sort, prepared_by) values ($1, 'CF-TEST2', 'treatment-2026-01', $2, '{}', 1, $3) returning id`, [clinicId, onFile.id, staffId]))[0];
  assert.equal((await q('select consent_in_force($1) as f', ['treatment-2026-01']))[0].f, false, 'the planted version is not in force');
  // The desk may already be on this record (path B with no visit today): a goto that only changes the hash would not
  // load the page again, so leave it first.
  await desk.goto('about:blank');
  await desk.goto(`${base}/c/${slug}/patients/${onFile.id}/#consent`, { waitUntil: 'load' });
  // The record shows one section at a time: open Consent.
  const tab = desk.locator('#rec-rec-consent-tab');
  if (await tab.count()) await tab.click();
  const row = desk.locator('li.vx-signed-row', { hasText: 'Newer words: sign again' });
  assert.equal(await row.count(), 1, 'the record marks the form "Newer words: sign again"');
  await row.scrollIntoViewIfNeeded();
  const again = row.locator('form[data-rc-sign="phone"] button');
  assert.match((await again.textContent()).trim(), /^Sign again on their phone/);
  await again.click();
  await desk.waitForLoadState('load');
  if (!/step=check&via=phone/.test(desk.url())) {
    const why = await desk.locator('[role="alert"], [data-ik-problems], .ws-callout').allTextContents();
    throw new Error(`Sign again did not reach the Check step: at ${desk.url()}; ${why.join(' | ').replace(/\s+/g, ' ').trim()}`);
  }
  const intakeId = desk.url().match(/\/intake\/([0-9a-f-]+)\//)[1];
  const here = `${base}/c/${slug}/patients/intake/${intakeId}/`;
  assert.equal(await desk.locator('input[name="device"][value="phone"]').isChecked(), true, 'the phone is preselected from the record');
  const renewed = (await q(`select d.version_id, consent_document_state(d.id) as state from consent_document d where d.intake_id = $1 and d.cancelled_at is null`, [intakeId]));
  assert.deepEqual(renewed.map((r) => r.version_id), ['treatment-2026-09'], 'the intake holds the form under the words in force');
  assert.equal((await q('select cancel_why from consent_document where id = $1', [old.id]))[0].cancel_why, 'renewed', 'the unsigned old form retired as renewed');
  ok(`record → intake ${intakeId.slice(0, 8)}…: the form prepared again under treatment-2026-09, the old one renewed`);
  await Promise.all([desk.waitForURL(/step=out/), desk.click('[data-ik-go]')]);
  await desk.waitForSelector('[data-ik-qr] svg');
  const link = (await q(`select token from intake_link where intake_id = $1 and retired_at is null and device = 'phone'`, [intakeId]))[0];
  const phone = await (await phoneCtx()).newPage();
  phone.setDefaultTimeout(60_000);
  watch(phone, 'phone B2');
  await phone.goto(`${base}/f/i/${link.token}/`, { waitUntil: 'load' });
  await phone.waitForSelector('[data-ip-start]');
  await Promise.all([phone.waitForLoadState('load'), phone.click('[data-ip-start] button.btn-primary')]);
  await phone.waitForSelector('[data-ip-verify]');
  await phone.fill('#f-birth_date', onFile.birth);
  await Promise.all([phone.waitForLoadState('load'), phone.click('[data-ip-verify] button.btn-primary')]);
  await signAllAndSend(phone);
  await phone.context().close();
  const after = (await q(`select consent_document_state(d.id) as state, d.version_id from consent_document d where d.intake_id = $1 and d.cancelled_at is null`, [intakeId]))[0];
  assert.equal(after.state, 'agreed');
  assert.equal(after.version_id, 'treatment-2026-09');
  await desk.goto(`${base}/c/${slug}/patients/${onFile.id}/`, { waitUntil: 'load' });
  assert.equal(await desk.locator('li.vx-signed-row', { hasText: 'Newer words' }).count(), 0, 'nothing on the record is under older words any more');
  ok('phone B2: signed under the new words; the record shows it Signed, the old form gone from the list');
  // What the test planted goes (the retired old form was never signed, so nothing restricts it; the database checks count the versions).
  await q('delete from consent_document where id = $1', [old.id]);
  await q(`delete from consent_version where id = 'treatment-2026-01'`);
}

// ---------------------------------------------------------------------------
// Path D (phase 4.3): a new patient's forms on their phone, where page 1 names someone already on file (the
// same name and birth date), so Send waits for the desk; the desk adds them to that record; the record then
// says what page 1 said differently and offers "Use" per detail, and the Health section names the forms.
// ---------------------------------------------------------------------------
console.log('\nD. Page 1 beside the record: a look-alike added to a patient on file, "Use" per detail');
{
  // The record says Nurse; page 1 will say Teacher (the script's answer). The city is empty on file: filled in.
  await q(`update patient set occupation = 'Nurse', city = null where id = $1`, [onFile.id]);
  const D = await prepareOnDesk(null);
  const phone = await (await phoneCtx()).newPage();
  phone.setDefaultTimeout(60_000);
  watch(phone, 'phone D');
  await phone.goto(D.link, { waitUntil: 'load' });
  await phone.waitForSelector('[data-ip-start]');
  await Promise.all([phone.waitForLoadState('load'), phone.click('[data-ip-start] button.btn-primary')]);
  const name = (await q('select first_name, last_name from patient where id = $1', [onFile.id]))[0];
  await doPage1(phone, { first: name.first_name, last: name.last_name, birth: onFile.birth, mobile: '0917 555 0188', email: 'lookalike@example.com' });
  await signAllAndSend(phone);
  await phone.context().close();
  const it = (await q('select status, patient_id from intake where id = $1', [D.intakeId]))[0];
  assert.equal(it.status, 'sent', `Send waits for the desk when someone on file looks like them (got ${it.status})`);
  assert.equal(it.patient_id, null);
  ok('phone D: sent; the look-alike on file makes it wait for the desk');
  // Screen F: "Is this someone on file?" → Add to <name>'s record (the panel says what the forms say otherwise).
  await desk.goto(`${D.here}?step=add`, { waitUntil: 'load' });
  const opener = desk.locator(`button[data-ws-open="ik-add-${onFile.id}"]`);
  assert.equal(await opener.count(), 1, 'the patient on file is offered on Screen F');
  await opener.click();
  const panel = desk.locator(`#ik-add-${onFile.id}`);
  const panelWords = (await panel.innerText()).replace(/\s+/g, ' ');
  assert.match(panelWords, /Occupation: on file Nurse · on the forms Teacher/, panelWords);
  await Promise.all([desk.waitForURL(/saved=intake/), panel.locator('button[type="submit"]').click()]);
  assert.match(desk.url(), new RegExp(`/patients/${onFile.id}/\\?saved=intake&intake=${D.intakeId}`), desk.url());
  const callouts = (await desk.locator('.ws-callout').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
  assert.ok(callouts.some((t) => /Added the forms \(IN-[A-Z0-9]+\) to .*record\. Empty details were filled in, and the record has the health history .* gave on page 1/.test(t)), callouts.join(' | '));
  const differs = desk.locator('[data-rec-differs="intake"]');
  assert.equal(await differs.count(), 1, 'the record lists what page 1 says differently');
  const dWords = (await differs.innerText()).replace(/\s+/g, ' ');
  assert.match(dWords, /Their forms say something the record does not/, dWords);
  assert.match(dWords, /Occupation ?On file: Nurse ?On their forms: Teacher/, dWords);
  assert.equal((await q('select occupation, city from patient where id = $1', [onFile.id]))[0].city, 'Baguio City', 'the empty city was filled in from page 1');
  ok('record: "Added the forms (IN-…) to the record", the city filled in, Occupation on file Nurse / on their forms Teacher');
  // "Use Teacher".
  const use = differs.locator('form:has(input[name="field"][value="occupation"]) button');
  assert.equal((await use.textContent()).trim(), 'Use Teacher');
  await Promise.all([desk.waitForURL(/used=occupation/), use.click()]);
  assert.equal((await q('select occupation from patient where id = $1', [onFile.id]))[0].occupation, 'Teacher');
  const after = (await desk.locator('.ws-callout').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
  assert.ok(after.some((t) => /The occupation on the record is now the one from their forms\./.test(t)), after.join(' | '));
  assert.equal(await desk.locator('[data-rec-differs="intake"] form:has(input[name="field"][value="occupation"])').count(), 0, 'Occupation no longer differs');
  ok('record: Use Teacher → the occupation is Teacher, said on the page, no longer listed');
  // The Health section names the forms the version came from.
  await desk.locator('#rec-rec-health-tab').click();
  await desk.locator('#rec-health details.pt-more summary').click();
  const hWords = (await desk.locator('#rec-health details.pt-more').innerText()).replace(/\s+/g, ' ');
  assert.match(hWords, new RegExp(`from the forms ${name.first_name} filled in \\(IN-[A-Z0-9]+, sent `), hWords);
  ok('Health: the new version reads "from the forms <name> filled in (IN-…, sent …)"');
}

// ---------------------------------------------------------------------------
// Path E (phase 4.4): a consent form linked to a plan line and today's visit, not signed. The This visit strip
// asks why before the visit goes ahead; Mark done refuses without a reason and records the override with one;
// the Consent pane, the visit panel, the Treatment record, its paper and the form's page all show it. Then a
// signed form is withdrawn, and the same places say so.
// ---------------------------------------------------------------------------
console.log('\nE. Withdrawals and overrides: ask first, then drawn everywhere');
if (onFile.visit_today) {
  const staffId = (await q('select id from staff where email = $1', [owner.email]))[0].id;
  const plan = (await q(`insert into treatment_plan (clinic_id, patient_id, name) values ($1, $2, 'Test plan') returning id`, [clinicId, onFile.id]))[0];
  const item = (await q(`insert into treatment_plan_item (clinic_id, plan_id, patient_id, name, fdi, price, created_by) values ($1, $2, $3, 'Tooth extraction', 36, 1500, $4) returning id`, [clinicId, plan.id, onFile.id, staffId]))[0];
  // A reference in the forms' alphabet (no I, L, O, 0 or 1: consent_document's check), unique enough for a test.
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const ref = `CF-${Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')}`;
  const gapDoc = (await q(`insert into consent_document (clinic_id, ref, version_id, patient_id, appointment_id, plan_item_id, fields, sort, prepared_by)
                           values ($1, $2, 'treatment-2026-09', $3, $4, $5, '{}', 1, $6) returning id`, [clinicId, ref, onFile.id, onFile.visit_today, item.id, staffId]))[0];
  const record = `${base}/c/${slug}/patients/${onFile.id}/`;
  // The strip: the gap in words, Go ahead anyway with a reason.
  await desk.goto(`${record}?visit=${onFile.visit_today}`, { waitUntil: 'load' });
  const line = desk.locator('.vs-line', { hasText: 'Consent form ·' });
  assert.equal(await line.count(), 1, 'the strip has a line for the unsigned form');
  assert.match((await line.innerText()).replace(/\s+/g, ' '), /Consent form · Consent to dental examination and treatment: not signed yet/);
  await line.locator(`button[data-ws-open="rec-ahead-${gapDoc.id}"]`).click();
  const ahead = desk.locator(`#rec-ahead-${gapDoc.id}`);
  await ahead.locator('input[name="reason"]').fill('Emergency: pain relief first, the form after');
  await Promise.all([desk.waitForURL(/saved=consent-ahead/), ahead.locator('button[type="submit"]').click()]);
  const strip1 = (await desk.locator('#this-visit').innerText()).replace(/\s+/g, ' ');
  assert.match(strip1, /Recorded: the visit goes ahead without that consent form/, strip1);
  assert.match(strip1, /went ahead anyway \(the visit went ahead\)/, strip1);
  assert.equal(await desk.locator('.vs-line', { hasText: 'Consent form ·' }).count(), 0, 'the line is gone once it went ahead today');
  let ov = await q('select context, state_then, reason from consent_override where document_id = $1 order by at', [gapDoc.id]);
  assert.deepEqual(ov, [{ context: 'strip', state_then: 'to_sign', reason: 'Emergency: pain relief first, the form after' }]);
  ok('strip: "Consent form · …: not signed yet" → Go ahead anyway with a reason → recorded (context strip, state to_sign), the strip says so');
  // Mark done: refused without a reason, recorded with one.
  await desk.locator('#rec-rec-treatment-tab').click();
  const gap = desk.locator(`[data-tx-gap="${item.id}"]`);
  assert.equal(await gap.count(), 1, 'the plan line shows its consent gap');
  assert.match((await gap.innerText()).replace(/\s+/g, ' '), /Consent to dental examination and treatment: not signed yet/);
  const doneForm = desk.locator(`form.tx-done-form:has(input[name="item"][value="${item.id}"])`);
  assert.equal((await doneForm.locator('button').textContent()).trim(), 'Mark done anyway');
  await doneForm.locator('input[name="consent_reason"]').evaluate((el) => { el.removeAttribute('required'); });
  // A refused post draws the page again at the same address: wait for the post's answer, not for a URL change.
  const posted = () => desk.waitForResponse((r) => r.request().method() === 'POST' && r.url().startsWith(record));
  await Promise.all([posted(), doneForm.locator('button').click()]);
  await desk.waitForLoadState('load');
  const refusal = (await desk.locator('#rec-treatment .ws-callout').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ')).join(' | ');
  assert.match(refusal, /not signed yet\. To mark it done anyway, say why in the box beside Mark done\./, refusal);
  assert.equal((await q('select status from treatment_plan_item where id = $1', [item.id]))[0].status, 'planned', 'nothing changed on a refused Mark done');
  const doneForm2 = desk.locator(`form.tx-done-form:has(input[name="item"][value="${item.id}"])`);
  await doneForm2.locator('input[name="consent_reason"]').fill('Patient asked to go ahead; signs after');
  await Promise.all([desk.waitForURL(/saved=plan-done/), doneForm2.locator('button').click()]);
  assert.equal((await q('select status from treatment_plan_item where id = $1', [item.id]))[0].status, 'done');
  ov = await q('select context, state_then, reason from consent_override where document_id = $1 order by at', [gapDoc.id]);
  assert.deepEqual(ov.map((o) => o.context), ['strip', 'plan_done']);
  assert.equal(ov[1].reason, 'Patient asked to go ahead; signs after');
  ok('Mark done: refused without a reason (the plan unchanged); with one, done and recorded (context plan_done)');
  // Drawn: the Consent pane, the visit panel, the form's page, the Treatment record and its paper.
  await desk.goto(record, { waitUntil: 'load' });
  await desk.locator('#rec-rec-consent-tab').click();
  // Scoped to this form's row: an earlier run may have left a form with overrides of its own on the record.
  const rcOv = desk.locator(`li.vx-signed-row:has(a[href$="/consents/${gapDoc.id}/"]) [data-rc-override]`);
  assert.equal(await rcOv.count(), 2, 'the Consent pane lists both overrides');
  const rcWords = (await rcOv.allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
  assert.ok(rcWords.some((t) => /^Went ahead anyway \(not signed\), treatment marked done · .+, \d+ \w+ \d{4}, \d+:\d\d [ap]m: “Patient asked to go ahead; signs after”$/.test(t)), rcWords.join(' | '));
  assert.ok(rcWords.some((t) => /the visit went ahead/.test(t)), rcWords.join(' | '));
  const vxOv = desk.locator(`#rec-visit-${onFile.visit_today} [data-vx-form="${gapDoc.id}"] [data-vx-override]`);
  assert.equal(await vxOv.count(), 2, 'the visit panel card lists both');
  const cardPill = (await desk.locator(`#rec-visit-${onFile.visit_today} [data-vx-form="${gapDoc.id}"]`).innerText()).replace(/\s+/g, ' ');
  assert.match(cardPill, /Went ahead anyway ×2/, cardPill);
  await desk.goto(`${record}consents/${gapDoc.id}/`, { waitUntil: 'load' });
  assert.equal(await desk.locator('[data-cd-override]').count(), 2, 'the form’s page lists both');
  assert.match((await desk.locator('section', { hasText: 'Went ahead without this consent' }).first().innerText()).replace(/\s+/g, ' '), /2 times/);
  const visit = (await q(`select status, starts_at < now() as begun from appointment where id = $1`, [onFile.visit_today]))[0];
  // Mark done above recorded a treatment at the visit, which puts the visit on the ledger whether or not its time has
  // come (a visit later today, before the desk checks it in).
  const worked = (await q('select exists (select 1 from procedure_done where appointment_id = $1) as w', [onFile.visit_today]))[0].w;
  const begun = worked || visit.begun || ['arrived', 'in_lobby', 'in_chair', 'completed'].includes(visit.status);
  await desk.goto(record, { waitUntil: 'load' });
  const rows = (await desk.locator('tr[data-kind="consent"]').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
  if (begun) {
    assert.ok(rows.filter((t) => /Went ahead without Consent to dental examination and treatment/.test(t)).length >= 2, rows.join(' | '));
    assert.match((await (await desk.goto(`${record}treatment-record/`, { waitUntil: 'load' })).text()).replace(/\s+/g, ' '), /Went ahead without Consent to dental/, 'the paper carries the override rows');
    ok('drawn: Consent pane (2), visit panel (2, "Went ahead anyway ×2"), the form’s page (2), the Treatment record and its paper');
  } else {
    assert.equal(rows.filter((t) => /Went ahead without/.test(t)).length, 0, 'no ledger row before the visit begins');
    ok('drawn: Consent pane (2), visit panel (2, "Went ahead anyway ×2"), the form’s page (2); the ledger waits for the visit to begin');
  }
  // A withdrawal, on the form path B signed: the form's page, the Consent pane and the visit panel say who told the clinic, how, who recorded it.
  const signedDoc = (await q(`select d.id from consent_document d where d.intake_id = $1 and d.cancelled_at is null and consent_document_state(d.id) = 'agreed'`, [B.intakeId]))[0];
  assert(signedDoc, 'path B’s signed form is agreed');
  await desk.goto(`${record}consents/${signedDoc.id}/`, { waitUntil: 'load' });
  await desk.locator('button[data-ws-open="cd-withdraw"]').click();
  const wd = desk.locator('#cd-withdraw');
  await wd.locator('input[name="told_by"]').fill(`${onFile.first_name} Bautista`.replace(/ Bautista$/, '') + ' (the patient)');
  await wd.locator('label.chip-radio', { hasText: 'By phone' }).click();
  await wd.locator('input[name="note"]').fill('Changed their mind');
  await Promise.all([desk.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/consents/')), wd.locator('button[type="submit"]').click()]);
  await desk.waitForLoadState('load');
  await desk.waitForSelector('.rp-alert');
  const pageWords = (await desk.textContent('body')).replace(/\s+/g, ' ');
  assert.match(pageWords, /Withdrawn \d+ \w+ \d{4}: told by .* \(the patient\), by phone, recorded by .*\. “Changed their mind”/, pageWords.slice(0, 400));
  await desk.goto(record, { waitUntil: 'load' });
  await desk.locator('#rec-rec-consent-tab').click();
  const rcWd = desk.locator(`li.vx-signed-row:has(a[href$="/consents/${signedDoc.id}/"]) [data-rc-withdrawal]`);
  assert.equal(await rcWd.count(), 1, 'the Consent pane says it was withdrawn, in full');
  assert.match((await rcWd.innerText()).replace(/\s+/g, ' '), /told by .* \(the patient\), by phone, recorded by .*\. “Changed their mind”/);
  const wdCard = desk.locator(`#rec-visit-${onFile.visit_today} [data-vx-form="${signedDoc.id}"]`);
  if (await wdCard.count()) assert.match((await wdCard.innerText()).replace(/\s+/g, ' '), /Withdrawn .* told by .* by phone/, 'the visit panel card says so');
  ok(`withdrawn: the form’s page, the Consent pane${(await wdCard.count()) ? ' and the visit panel card' : ''} say who told the clinic, how, and who recorded it`);
} else {
  log('no visit today for the patient on file: path E (the strip, the plan line, the panel) needs one; skipped');
}

// ---------------------------------------------------------------------------
// Path C: a phone that walks away; "Show a new code". And the screens fit a phone.
// ---------------------------------------------------------------------------
console.log('\nC. A code left idle, and a new one');
const C = await prepareOnDesk(null);
/** No sideways scroll, and every button at least 44 px tall, on the page as it is. */
async function fits(p, what) {
  const g = await p.evaluate(() => ({
    scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    small: Array.from(document.querySelectorAll('button, a.btn, a.ws-btn, input[type="submit"]')).filter((b) => b.offsetParent && b.getBoundingClientRect().height < 44)
      .map((b) => `${(b.textContent ?? '').trim().slice(0, 30)} ${Math.round(b.getBoundingClientRect().height)}px`),
  }));
  assert.equal(g.scroll, 0, `${what}: no sideways scroll (overflow ${g.scroll}px)`);
  assert.deepEqual(g.small, [], `${what}: every button at least 44 px`);
  ok(`${what}: fits ${await p.evaluate(() => innerWidth)} px, buttons ≥ 44 px`);
}
{
  const p = await (await phoneCtx()).newPage();
  p.setDefaultTimeout(60_000);
  await p.goto(C.link, { waitUntil: 'load' });
  await p.waitForSelector('[data-ip-start]');
  await fits(p, 'phone: the Start screen');
  await Promise.all([p.waitForLoadState('load'), p.click('[data-ip-start] button.btn-primary')]);
  await p.waitForSelector('[data-ip-page1]');
  // The phone goes quiet for 21 minutes (the page would have pinged every 2 minutes).
  await q(`update intake_link set last_seen_at = now() - interval '21 minutes' where token = $1`, [C.token]);
  const r = await p.reload({ waitUntil: 'load' });
  assert.equal(r.status(), 410, `an idle code answers 410 (got ${r.status()})`);
  assert.match(await p.textContent('#ip-status-title'), /expired/);
  await fits(p, 'phone: a closed code');
  await p.context().close();
}
await desk.goto(`${C.here}?step=out`, { waitUntil: 'load' });
assert.match((await desk.textContent('[data-ik-state]')).trim(), /Closed after 20 minutes idle/);
assert.equal(await desk.locator('[data-ik-qr]').count(), 0, 'no QR code for an ended link');
const newCode = desk.locator('form:has(input[name="device"][value="phone"]) button[type="submit"]');
assert.match((await newCode.textContent()).trim(), /Show a new code/);
await Promise.all([desk.waitForURL(/step=out/), newCode.click()]);
await desk.waitForSelector('[data-ik-qr] svg');
const links = await q(`select retired_why from intake_link where intake_id = $1 order by created_at`, [C.intakeId]);
assert.deepEqual(links.map((l) => l.retired_why), ['idle', null]);
ok('desk: an idle code says so, "Show a new code" makes a new one (the old retired as idle)');
await fits(desk, 'desk: step 4 with the QR code at 1440');
await desk.setViewportSize({ width: 390, height: 844 });
await desk.reload({ waitUntil: 'load' });
await fits(desk, 'desk: step 4 with the QR code at 390');
await desk.setViewportSize({ width: 1440, height: 900 });

// --keep: leave the screens the contrast tool measures open, with the browsers' sign-in states saved beside them.
if (process.argv.includes('--keep')) {
  const { writeFileSync, mkdirSync } = await import('node:fs');
  const out = process.env.KEEP_DIR ?? '/tmp/phone-e2e';
  mkdirSync(out, { recursive: true });
  const D = await prepareOnDesk(null);
  const E = await prepareOnDesk(onFile.id);
  const pe = await (await phoneCtx()).newPage();
  await pe.goto(E.link, { waitUntil: 'load' });
  await Promise.all([pe.waitForLoadState('load'), pe.click('[data-ip-start] button.btn-primary')]);
  await pe.waitForSelector('[data-ip-verify]');
  await pe.context().storageState({ path: `${out}/phone-verify.json` });
  await deskCtx.storageState({ path: `${out}/desk.json` });
  await desk.goto(`${D.here}?step=out`, { waitUntil: 'load' });
  writeFileSync(`${out}/urls.txt`, [`WELCOME=${new URL(D.link).pathname}`, `VERIFY=${new URL(E.link).pathname}`, `DESK=${new URL(`${D.here}?step=out`).pathname}?step=out`].join('\n') + '\n');
  console.log(`\nkept for measuring (${out}/urls.txt; states desk.json, phone-verify.json): Start ${D.link}, birth date ${E.link}, desk ${D.here}?step=out`);
}

await db.end();
await browser.close();
if (errs.length) { console.log('\nbrowser errors:'); for (const e of errs) console.log('  ' + e); process.exit(1); }
console.log('\nall paths passed');
