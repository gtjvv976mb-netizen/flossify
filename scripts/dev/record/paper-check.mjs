// The patient record as a paper chart (the owner, 2 Oct 2026: "one seamless page, where all details are shown, and a
// plus sign appears next to editable or addable", then "its still too complicated, imagine that the patient records is
// a paper record, simple, uneventful but effective"), measured:
//   - one sheet: the contents, then the twelve parts in the paper chart's order, numbered, none hidden; no colour
//     banners, no icon tiles, no number tiles in the head;
//   - the contents' links land each part's head just under the workspace bar and put its name in the address; an
//     address with a part's name opens there;
//   - a plus beside every detail that can be changed (Edit details opens with the caret in that field), beside each
//     answer of the medical history (its folded form opens with the caret in that list's box), and at each part's
//     adds; none for someone who cannot edit records;
//   - every line on the sheet ≥ 4.5:1 against what is behind it, light and dark, 1440 and 390; no target under 44 px;
//     no sideways scroll; the head's teal New booking is the only teal button in view.
//
//   node scripts/dev/record/paper-check.mjs [base=http://127.0.0.1:4610] [slug=session-road] [email] [password=flossify]
//   OUT=<folder for screenshots> · PW_CHROMIUM · DB=flossify_t · PGHOST · PGPORT · PGUSER (local only)
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import pg from 'pg';

const [base = 'http://127.0.0.1:4610', slug = 'session-road', email = 'liwayway.domingo@example.com', password = 'flossify'] = process.argv.slice(2);
const OUT = process.env.OUT ?? null;
const HOST = process.env.PGHOST ?? '/var/run/postgresql';
if (!HOST.startsWith('/') && !['localhost', '127.0.0.1', '::1'].includes(HOST)) throw new Error('refusing: not a local database');
const db = new pg.Client({ host: HOST, port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined, user: process.env.PGUSER, database: process.env.DB ?? 'flossify_t' });
await db.connect();
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const ok = (s) => console.log(`  ok  ${s}`);
const clinicId = (await q('select id from clinic where slug = $1', [slug]))[0]?.id;
// A patient with a health history and the most else on file here (PATIENT=<id> to pick one).
const pt = process.env.PATIENT ? { id: process.env.PATIENT } : (await q(`select p.id, p.first_name from patient p where p.clinic_id = $1 and p.archived_at is null
  order by exists (select 1 from medical_history h where h.patient_id = p.id and h.allergies is not null) desc,
    (select count(*) from appointment a where a.patient_id = p.id) + (select count(*) from procedure_done d where d.patient_id = p.id) desc limit 1`, [clinicId]))[0];
const record = `${base}/c/${slug}/patients/${pt.id}/`;

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
p.setDefaultTimeout(30_000);
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/Astro background:|dev toolbar|audit's match function/.test(m.text())) errs.push(m.text()); });
await p.goto(`${base}/auth/login/?any=1`);
await p.fill('#email', email); await p.fill('#password', password);
await Promise.all([p.waitForURL(/\/c\//), p.click('[data-go]')]);

const measure = () => p.evaluate(() => {
  const rgba = (s) => (s.match(/[\d.]+/g) || []).map(Number);
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const bg = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) { const c = rgba(getComputedStyle(e).backgroundColor); if (c.length >= 3 && (c[3] ?? 1) > 0) layers.push(c); }
    let out = [255, 255, 255];
    for (const c of layers.reverse()) { const a = c[3] ?? 1; out = out.map((v, i) => v * (1 - a) + c[i] * a); }
    return out;
  };
  // Shown: laid out, not hidden, and not folded inside a closed <details> (Chromium still gives folded content a size).
  const vis = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'
    && !(el.closest('details:not([open])') && !el.closest('summary'));
  const sections = [...document.querySelectorAll('[data-rec-panel]')];
  const plus = [...document.querySelectorAll('.rec-plus')].filter(vis);
  const sheet = document.querySelector('.pp-sheet');
  // Every element on the sheet (and the head's facts) with words of its own, measured against what is behind it.
  const words = [...document.querySelectorAll('.pp-sheet *, .pp-facts *')].filter((el) => vis(el) && !el.closest('dialog') && !el.closest('details:not([open])')
    && !el.closest('[data-odontogram]') && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
  const measured = words.map((el) => ({ t: el.textContent.trim().slice(0, 30), r: ratio(rgba(getComputedStyle(el).color).slice(0, 3), bg(el)) }));
  const small = [...document.querySelectorAll('.pp-sheet button, .pp-sheet a, .pp-sheet summary, .pp-top button, .pp-top a')].filter(vis)
    .filter((el) => !el.closest('dialog') && !el.closest('details:not([open]) > :not(summary)') && !el.closest('.trec') && !el.closest('[data-odontogram]') && !el.closest('p:not(.rp-row)') && !el.closest('dd') && el.getBoundingClientRect().height < 44)
    .map((el) => `${(el.getAttribute('aria-label') || el.textContent).trim().slice(0, 24)} ${Math.round(el.getBoundingClientRect().height)}`);
  const top = document.querySelector('.pp-top')?.getBoundingClientRect(), sh = sheet.getBoundingClientRect();
  return {
    sections: sections.map((s) => ({ id: s.dataset.recPanel, hidden: s.hidden || !vis(s), title: s.querySelector('.pp-title')?.textContent.trim() })),
    links: [...document.querySelectorAll('[data-rec-link]')].map((a) => a.dataset.recLink),
    plus: plus.length,
    linesWithout: [...document.querySelectorAll('#overview > .pp-line')].filter((t) => !t.querySelector('.pp-plus') && t.querySelector('dt')?.textContent.trim() !== 'On file since').map((t) => t.querySelector('dt')?.textContent.trim()),
    decoration: { banners: document.querySelectorAll('.rec-banner').length, icons: [...document.querySelectorAll('.pp-sheet .ws-pane-icon')].filter(vis).length, tiles: document.querySelectorAll('.pt-tiles, .rec-nav-item').length },
    teal: [...document.querySelectorAll('.ws-btn-primary')].filter(vis).filter((b) => !b.closest('dialog')).map((b) => b.textContent.trim().slice(0, 20)),
    aligned: Math.abs(top.left - sh.left) < 1 && Math.abs(top.width - sh.width) < 1,
    fails: measured.filter((x) => x.r < 4.5), lowest: Math.min(...measured.map((x) => x.r)), n: measured.length,
    small, scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
});

// 1. One page, desk and phone, light and dark.
for (const [w, h] of [[1440, 900], [390, 844]]) {
  await p.setViewportSize({ width: w, height: h });
  for (const scheme of ['light', 'dark']) {
    await p.emulateMedia({ colorScheme: scheme });
    await p.goto(record, { waitUntil: 'load' });
    await p.waitForTimeout(400);
    const m = await measure();
    const ORDER = ['overview', 'health', 'chart', 'treatment', 'treatment-record', 'notes', 'consent', 'rx', 'files', 'visits', 'money', 'texts'];
    assert.deepEqual(m.sections.map((x) => x.id), ORDER, 'the parts in the paper chart\'s order');
    assert.deepEqual(m.sections.filter((x) => x.hidden).map((x) => x.id), [], 'no part hidden');
    assert.deepEqual(m.sections.map((x) => x.title.match(/^\d+/)?.[0]), ORDER.map((_, i) => String(i + 1)), 'numbered 1 to 12');
    assert.deepEqual(m.links, ORDER, 'the contents list the parts in order');
    assert.deepEqual(m.decoration, { banners: 0, icons: 0, tiles: 0 }, 'no colour banners, icon tiles or number tiles');
    assert.deepEqual(m.linesWithout, [], 'a plus on every detail that can be changed');
    assert.ok(m.plus >= 15, `plus signs: ${m.plus}`);
    assert.deepEqual(m.teal, ['New booking'], 'New booking is the one teal button in view');
    assert.ok(m.aligned, 'the head and the sheet line up');
    assert.deepEqual(m.fails, [], `${w} ${scheme}: contrast`);
    assert.deepEqual(m.small, [], `${w} ${scheme}: targets`);
    assert.equal(m.scroll, 0, `${w} ${scheme}: no sideways scroll`);
    ok(`${w} ${scheme}: one sheet, ${m.sections.length} numbered parts, ${m.plus} plus signs, ${m.n} lines measured, lowest ${m.lowest.toFixed(2)}:1`);
    if (OUT && scheme === 'light') await p.screenshot({ path: `${OUT}/record-${w}.png`, fullPage: true });
  }
}
await p.emulateMedia({ colorScheme: 'light' });

// 2. The contents go to each part, its head just under the workspace bar.
for (const [w, h] of [[1440, 900], [390, 844]]) {
  await p.setViewportSize({ width: w, height: h });
  await p.goto(record, { waitUntil: 'load' });
  for (const id of ['chart', 'treatment-record', 'consent', 'visits', 'health']) {
    await p.locator(`[data-rec-link="${id}"]`).click();
    await p.waitForTimeout(900);
    const r = await p.evaluate((id) => {
      const head = document.getElementById(`rec-${id}`).getBoundingClientRect().top;
      const bar = document.querySelector('[data-ws-top]')?.getBoundingClientRect().bottom ?? 0;
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      return { head, bar, atEnd, hash: location.hash };
    }, id);
    assert.equal(r.hash, `#${id}`);
    assert.ok(r.head >= r.bar - 1 && (r.head <= r.bar + 30 || r.atEnd), `${w} ${id}: head at ${Math.round(r.head)}, bar ${Math.round(r.bar)}`);
  }
  ok(`${w}: the contents land each part just under the bar, and the address says which`);
}
await p.setViewportSize({ width: 1440, height: 900 });
await p.goto(`${record}#consent`, { waitUntil: 'load' });
await p.waitForTimeout(500);
const at = await p.evaluate(() => { const h = document.getElementById('rec-consent').getBoundingClientRect().top; return h >= 0 && h < 200; });
assert.ok(at, 'an address ending #consent opens on Consent');
ok('an address ending #consent opens on Consent');

// 3. The plus signs do what they say.
await p.goto(record, { waitUntil: 'load' });
const mobile = p.locator('#overview .pp-line:has(dt:text-is("Mobile")) .pp-plus');
if (await mobile.count()) {
  await mobile.click();
  await p.waitForTimeout(400);
  assert.equal(await p.evaluate(() => document.activeElement?.getAttribute('name')), 'mobile', 'Edit details opens with the caret in Mobile');
  await p.keyboard.press('Escape');
  // The panel gives focus back to its opener as it finishes closing: wait for that before the next plus.
  await p.waitForFunction(() => !document.getElementById('details')?.open);
  await p.waitForTimeout(600);
  ok('the plus beside Mobile opens Edit details with the caret in Mobile');
}
const allergy = p.locator('.pp-plus[aria-label="Add to allergies"]');
assert.ok(await allergy.count() || !(await q('select 1 from medical_history where patient_id = $1 and allergies is not null', [pt.id])).length, 'a plus beside Allergies when there are health answers');
if (await allergy.count()) {
  await allergy.click();
  await p.waitForTimeout(400);
  assert.equal(await p.evaluate(() => document.activeElement?.getAttribute('name')), 'allergies_add', 'the allergies box has the caret');
  assert.equal(await p.evaluate(() => document.querySelector('[data-pp-edit]')?.open), true, 'the folded form opened');
  ok('the plus beside Allergies opens the medical history\'s form with the caret in its box');
}
await p.goto(record, { waitUntil: 'load' });
const note = p.locator('#rec-notes .rec-plus', { hasText: 'New note' });
await note.click();
await p.waitForTimeout(300);
assert.equal(await p.evaluate(() => document.getElementById('rec-note-add')?.open), true, 'New note opens its panel');
await p.keyboard.press('Escape');
ok('a section\'s plus (New note) opens its panel in place');

// 4. Someone who cannot edit sees no plus.
// Another member here, for this check only, with editing records taken away at this branch (staff_access.can_edit_records),
// then given back.
const viewer = (await q(`select s.id, s.email from staff s join staff_access a on a.staff_id = s.id and a.clinic_id = $1
  where s.disabled_at is null and s.email is not null and s.email <> $2 and a.can_edit_records order by s.email limit 1`, [clinicId, email]))[0];
if (viewer) await q('update staff_access set can_edit_records = false where staff_id = $1 and clinic_id = $2', [viewer.id, clinicId]);
if (viewer) try {
  const c2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const v = await c2.newPage();
  await v.goto(`${base}/auth/login/?any=1`); await v.fill('#email', viewer.email); await v.fill('#password', password);
  await Promise.all([v.waitForURL(/\/c\//), v.click('[data-go]')]);
  await v.goto(record, { waitUntil: 'load' });
  const n = await v.evaluate(() => [...document.querySelectorAll('.rec-plus')].filter((e) => !e.closest('#rec-visits') && !e.closest('#rec-money')).length);
  assert.equal(n, 0, 'no plus to change the record for someone who cannot edit');
  ok(`${viewer.email}, records not editable here: no plus sign to change the record (booking and charging follow their own permissions)`);
  await c2.close();
} finally { await q('update staff_access set can_edit_records = true where staff_id = $1 and clinic_id = $2', [viewer.id, clinicId]); }
else console.log('  --  no other member here; the viewer check is skipped');

await db.end(); await browser.close();
if (errs.length) { console.log('browser errors:', errs); process.exit(1); }
console.log('all passed');
