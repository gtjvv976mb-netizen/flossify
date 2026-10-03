// The patient record as a digital copy of the clinic's paper record (the owner, 3 Oct 2026: "make the patient records as
// simple as this, better a digital copy of the real form", then "make it a better but still simple like that"), measured:
//   - three paper pages, numbered at their foot ("Page 1 of 3"): page 1 the letterhead, the patient's chart and the
//     patient information record (chart, overview, health), page 2 informed consent, page 3 the treatment record; then
//     "Attached to this record", each part a folded sheet, closed on a plain load; the parts' titles carry no number;
//   - the letterhead names THIS clinic (its row's name and address) with the patient's Chart # on its right; Basic
//     information has the paper's labels in the paper's order; the chart has the paper's codes and legend;
//   - page 2 is the paper's informed consent: the privacy notice first (#consent, #consent-paper), the paper's ten
//     paragraphs in its order, each holding our forms for it or saying why not (the two the library has no form for,
//     and Drugs and medications, point into the general consent's own words, which a click opens), every consent form
//     on the record drawn once (li.vx-signed-row, the hook the intake checks read), and the general consent's foot as
//     the paper's three boxes, the dentist's one "who explained", never a signature;
//   - the contents (in the head) land each part's head just under the workspace bar, open an attached sheet and put its
//     name in the address; an address with a part's name or an id in it (#money, #recall) opens there;
//   - a plus on every box that can be changed, Basic information's and More details' (HMO, Emergency contact, Desk note)
//     alike (Edit details opens with the caret in that field; every medical or dental history box opens the folded form
//     with the caret in its field, and that field in view, at 1440 and 390); a panel inside a folded sheet opened from
//     outside it (More → Prescription) is drawn, its sheet opened; none for someone who cannot edit records;
//   - no heading inside a part sits above the part's own title (an attached sheet's title is h3, its panes' h4);
//   - Edit details saves the occupation and the parent or guardian, an older form (no has_paper_fields) keeps them, and
//     a guardian's mobile that is not a Philippine mobile is refused;
//   - every line on the paper and in the head ≥ 4.5:1 against what is behind it, light and dark, 1440 and 390, on a plain
//     load and again with every attached sheet opened; no target under 44 px; no sideways scroll; New booking the only
//     teal button in view;
//   - printed (media print) from a full record (a full medical and dental history and a raised blood pressure planted for
//     the step, then removed): only the three pages, each starting a sheet of paper, page 1 on one A4 sheet (three sheets
//     in all), each page's foot naming the patient and the chart no. and its page without "of 3", the words dark on white
//     in either theme; printing tells the audit log (record.print).
//
//   node scripts/dev/record/paper-check.mjs [base=http://127.0.0.1:4610] [slug=session-road] [email] [password=flossify]
//   OUT=<folder for screenshots> · PATIENT=<id> · PW_CHROMIUM · DB=flossify_t · PGHOST · PGPORT · PGUSER (local only)
// It saves Edit details on the patient it checks and puts the occupation and guardian back as they were; the rows it plants
// for the print step are deleted after it.
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
const clinic = (await q('select id, name, address_line from clinic where slug = $1', [slug]))[0];
// A patient with a health history and the most else on file here (PATIENT=<id> to pick one).
const pt = process.env.PATIENT ? (await q('select id, chart_no, first_name, middle_name, last_name, suffix from patient where id = $1', [process.env.PATIENT]))[0]
  : (await q(`select p.id, p.chart_no, p.first_name, p.middle_name, p.last_name, p.suffix from patient p where p.clinic_id = $1 and p.archived_at is null
  order by exists (select 1 from medical_history h where h.patient_id = p.id and h.allergies is not null) desc,
    (select count(*) from appointment a where a.patient_id = p.id) + (select count(*) from procedure_done d where d.patient_id = p.id) desc limit 1`, [clinic.id]))[0];
const record = `${base}/c/${slug}/patients/${pt.id}/`;
const fullName = [pt.first_name, pt.middle_name, pt.last_name, pt.suffix].filter(Boolean).join(' ');
const PAGE1 = ['chart', 'overview', 'health'], PAGE2 = ['consent'], PAGE3 = ['treatment-record'];
const ATTACHED = ['treatment', 'notes', 'rx', 'files', 'visits', 'money', 'texts'];
const BASIC = ['Patient name', 'Occupation', 'Date of birth', 'Age', 'Gender', 'Contact number', 'Email address', 'Address', 'Parent’s or guardian’s name'];
const MORE = ['HMO', 'Emergency contact', 'Desk note'];

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
  // Any CSS colour (rgb(), oklab() from a Tailwind opacity, color-mix()) as sRGB 0–255 and its alpha, through a canvas.
  const cv = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const rgba = (s) => {
    if (/^rgba?\(/.test(s)) return (s.match(/[\d.]+/g) || []).map(Number);
    cv.clearRect(0, 0, 1, 1); cv.fillStyle = '#000'; cv.fillStyle = s; cv.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = cv.getImageData(0, 0, 1, 1).data;
    return [r, g, b, a / 255];
  };
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
    && !(el.closest('details:not([open])') && !el.closest('details:not([open]) > summary'));
  const text = (el) => el?.textContent.replace(/\s+/g, ' ').trim() ?? null;
  const plus = [...document.querySelectorAll('.rec-plus, .pf-go')].filter(vis);
  // Every element on the paper and in the head with words of its own, measured against what is behind it; the chart's
  // own words are its legend.
  const words = [...document.querySelectorAll('.pp-sheet *, .pp-top *, .pp-attached-title, [data-code-legend], [data-code-legend] *')].filter((el) => vis(el) && !el.closest('dialog')
    && (!el.closest('[data-odontogram]') || el.closest('[data-code-legend]')) && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
  const measured = words.map((el) => ({ t: el.textContent.trim().slice(0, 30), r: ratio(rgba(getComputedStyle(el).color).slice(0, 3), bg(el)) }));
  const small = [...document.querySelectorAll('.pp-sheet button, .pp-sheet a, .pp-sheet summary, .pp-top button, .pp-top a')].filter(vis)
    .filter((el) => !el.closest('dialog') && !el.closest('.trec') && !el.closest('[data-odontogram]') && !el.closest('p:not(.rp-row)') && !el.closest('dd') && el.getBoundingClientRect().height < 44)
    .map((el) => `${(el.getAttribute('aria-label') || el.textContent).trim().slice(0, 24)} ${Math.round(el.getBoundingClientRect().height)}`);
  const pages = [...document.querySelectorAll('.pp-page')];
  const top = document.querySelector('.pp-top')?.getBoundingClientRect(), sh = pages[0].getBoundingClientRect();
  const lh = document.querySelector('.pp-lh');
  return {
    // The foot as shown (its print-only words are not).
    pages: pages.map((pg) => ({ caption: pg.querySelector(':scope > .pp-page-no')?.innerText.trim() ?? null, parts: [...pg.querySelectorAll('[data-rec-panel]')].map((s) => s.dataset.recPanel), hidden: !vis(pg) })),
    attached: [...document.querySelectorAll('.pp-attached [data-rec-panel]')].map((s) => ({ id: s.dataset.recPanel, open: !!s.querySelector(':scope > details[data-rec-fold]')?.open, title: text(s.querySelector('.pp-title')), line: text(s.querySelector('.pp-fold-st')) })),
    numbered: [...document.querySelectorAll('.pp-title')].filter((t) => /^\d/.test(text(t)) || t.querySelector('.pp-n')).length,
    links: [...document.querySelectorAll('[data-rec-link]')].map((a) => a.dataset.recLink),
    groups: [...document.querySelectorAll('.pp-contents-k')].map(text),
    letterhead: { name: text(lh?.querySelector('.pp-lh-name')), lines: [...(lh?.querySelectorAll('.pp-lh-line') ?? [])].map(text), chart: text(lh?.querySelector('.pf-cell:has(dt) .pf-v')), labels: [...(lh?.querySelectorAll('dt') ?? [])].map(text) },
    basic: [...document.querySelectorAll('#overview > .pf-cell > dt')].map(text),
    more: [...document.querySelectorAll('#rec-overview .pp-band > dl.pf-grid:not(#overview) > .pf-cell > dt')].map(text),
    // Both grids of Basic information: the paper's boxes (#overview) and More details under them.
    linesWithout: [...document.querySelectorAll('#rec-overview .pp-band > dl.pf-grid > .pf-cell')].filter((t) => !t.querySelector('.pf-go')).map((t) => text(t.querySelector('dt'))),
    // A heading inside a part above the part's own title (h2 panes in an h3 sheet read as the record's parts).
    inverted: [...document.querySelectorAll('[data-rec-panel]')].flatMap((reg) => {
      const t = document.getElementById(`${reg.id}-title`), lv = (h) => Number(h.tagName[1]);
      return t ? [...reg.querySelectorAll('h1, h2, h3, h4, h5, h6')].filter((h) => !h.closest('dialog') && lv(h) < lv(t)).map((h) => `${reg.id} ${t.tagName} > ${h.tagName} ${text(h)}`) : [];
    }),
    chart: { codes: !!document.querySelector('[data-odontogram][data-codes]'), legend: text(document.querySelector('[data-code-legend]'))?.slice(0, 40), swatches: document.querySelectorAll('[data-odontogram] [data-odo-keys] .swatch:not(.waiting-swatch)').length },
    plus: plus.length,
    cellsShort: [...document.querySelectorAll('.pf-go')].filter(vis).filter((b) => b.getBoundingClientRect().height < 44 || b.getBoundingClientRect().width < 44).length,
    decoration: { banners: document.querySelectorAll('.rec-banner').length, icons: [...document.querySelectorAll('.pp-sheet .ws-pane-icon')].filter(vis).length, tiles: document.querySelectorAll('.pt-tiles, .rec-nav-item').length },
    teal: [...document.querySelectorAll('.ws-btn-primary')].filter(vis).filter((b) => !b.closest('dialog') && b.getBoundingClientRect().top < innerHeight).map((b) => b.textContent.trim().slice(0, 20)),
    aligned: Math.abs(top.left - sh.left) < 1 && Math.abs(top.width - sh.width) < 1,
    fails: measured.filter((x) => x.r < 4.5), lowest: Math.min(...measured.map((x) => x.r)), n: measured.length,
    small, scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
});
// Every attached sheet opened, the medical history's form (its paper questions show only there), and page 2's folds.
const openAll = () => p.evaluate(() => document.querySelectorAll('details[data-rec-fold], details[data-pp-edit], #rec-consent details').forEach((d) => { d.open = true; }));

// 1. Three pages and the attached sheets, desk and phone, light and dark; measured again with every sheet opened.
for (const [w, h] of [[1440, 900], [390, 844]]) {
  await p.setViewportSize({ width: w, height: h });
  for (const scheme of ['light', 'dark']) {
    await p.emulateMedia({ colorScheme: scheme });
    await p.goto(record, { waitUntil: 'load' });
    await p.waitForTimeout(400);
    const m = await measure();
    assert.deepEqual(m.pages.map((x) => x.parts), [PAGE1, PAGE2, PAGE3], 'the paper\'s three pages hold their parts');
    assert.deepEqual(m.pages.map((x) => x.caption), ['Page 1 of 3', 'Page 2 of 3', 'Page 3 of 3'], 'the pages are numbered at their foot');
    assert.deepEqual(m.pages.filter((x) => x.hidden), [], 'no page hidden');
    assert.deepEqual(m.attached.map((x) => x.id), ATTACHED, 'the attached sheets, in order');
    assert.deepEqual(m.attached.filter((x) => x.open).map((x) => x.id), [], 'every attached sheet closed on a plain load');
    assert.ok(m.attached.every((x) => x.title && x.line), 'each folded sheet says its name and where it stands');
    assert.equal(m.numbered, 0, 'the parts are not numbered');
    assert.deepEqual(m.links, [...PAGE1, ...PAGE2, ...PAGE3, ...ATTACHED], 'the contents list the parts in the paper\'s order');
    assert.deepEqual(m.groups, ['Page 1', 'Page 2', 'Page 3', 'Attached'], 'the contents are grouped by page');
    assert.equal(m.letterhead.name, clinic.name, 'the letterhead names this clinic');
    assert.ok(!clinic.address_line || m.letterhead.lines[0]?.startsWith(clinic.address_line), `the letterhead has this clinic's address: ${m.letterhead.lines[0]}`);
    assert.deepEqual(m.letterhead.labels, ['Chart #', 'Date'], 'Chart # and Date beside the letterhead');
    assert.equal(m.letterhead.chart, pt.chart_no, 'Chart # is the patient\'s chart no.');
    assert.deepEqual(m.basic, BASIC, 'Basic information: the paper\'s labels in its order');
    assert.deepEqual(m.more, MORE, 'More details: HMO, Emergency contact, Desk note');
    assert.deepEqual(m.linesWithout, [], 'every box of Basic information and More details is a box that opens its field');
    assert.deepEqual(m.inverted, [], 'no heading in a part sits above the part\'s title');
    assert.deepEqual(m.chart, { codes: true, legend: 'C – Caries · Ex – Extraction · RF – Root', swatches: 0 }, 'the chart has the paper\'s codes and legend');
    assert.deepEqual(m.decoration, { banners: 0, icons: 0, tiles: 0 }, 'no colour banners, icon tiles or number tiles');
    assert.equal(m.cellsShort, 0, 'every box is a 44 px target');
    assert.ok(m.plus >= 25, `plus signs: ${m.plus}`);
    assert.deepEqual(m.teal, ['New booking'], 'New booking is the one teal button in view');
    assert.ok(m.aligned, 'the head and the paper line up');
    assert.deepEqual(m.fails, [], `${w} ${scheme}: contrast`);
    assert.deepEqual(m.small, [], `${w} ${scheme}: targets`);
    assert.equal(m.scroll, 0, `${w} ${scheme}: no sideways scroll`);
    if (OUT && scheme === 'light') await p.screenshot({ path: `${OUT}/record-${w}.png`, fullPage: true });
    await openAll();
    await p.waitForTimeout(200);
    const o = await measure();
    assert.equal(o.attached.filter((x) => x.open).length, ATTACHED.length);
    assert.deepEqual(o.fails, [], `${w} ${scheme}, sheets opened: contrast`);
    assert.deepEqual(o.small, [], `${w} ${scheme}, sheets opened: targets`);
    assert.equal(o.scroll, 0, `${w} ${scheme}, sheets opened: no sideways scroll`);
    ok(`${w} ${scheme}: three pages, ${m.attached.length} attached sheets closed, ${m.plus} plus signs; ${m.n} lines measured, lowest ${m.lowest.toFixed(2)}:1; sheets and the health form opened: ${o.n} lines, lowest ${o.lowest.toFixed(2)}:1`);
  }
}
await p.emulateMedia({ colorScheme: 'light' });

// 1b. Page 2, informed consent: the paper's ten paragraphs in its order, each with its forms or words; every consent form
// on the record drawn once; the paragraphs with no form of their own point into the general consent's words; its foot.
const PARAS = ['Orthodontic treatment', 'Changes in treatment plan', 'Radiograph', 'Removal of teeth', 'Crowns (caps) and bridges',
  'Endodontics (root canal)', 'Periodontal disease', 'Fillings', 'Dentures', 'Drugs and medications'];
const FOOT = ['Patient’s signature (parent or guardian if a minor)', 'Dentist who explained', 'Date'];
{
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.goto(record, { waitUntil: 'load' });
  const docs = (await q('select id from consent_document where patient_id = $1 and cancelled_at is null', [pt.id])).map((x) => x.id);
  const r = await p.evaluate((docs) => {
    const sec = document.getElementById('rec-consent');
    const text = (el) => el?.textContent.replace(/\s+/g, ' ').trim() ?? null;
    const paras = [...sec.querySelectorAll('#consent-forms > [data-cf-para]')];
    return {
      paras: paras.map((li) => text(li.querySelector('.cf-k'))),
      empty: paras.filter((li) => !li.querySelector('.vx-signed-row, .cf-text')).map((li) => li.dataset.cfPara),
      own: paras.filter((li) => /No form of its own\./.test(text(li))).map((li) => li.dataset.cfPara),
      points: [...sec.querySelectorAll('#consent-forms .cf-see[href^="#consent-point-"]')].map((a) => [a.closest('[data-cf-para]').dataset.cfPara, !!sec.querySelector(`details.cf-words ${a.getAttribute('href')}`)]),
      rows: docs.map((id) => sec.querySelectorAll(`li.vx-signed-row:has(a[href$="/consents/${id}/"])`).length),
      foot: [...sec.querySelectorAll('.cf-signoff dt')].map(text),
      signature: /dentist’?'?s signature/i.test(sec.textContent),
      ids: ['consent', 'consent-paper', 'consent-forms', 'consent-general'].filter((id) => !sec.querySelector(`#${id}`)),
    };
  }, docs);
  assert.deepEqual(r.paras.slice(0, 10), PARAS, 'page 2: the paper\'s ten paragraphs, in its order');
  assert.deepEqual(r.empty, [], 'every paragraph holds its forms or says why not');
  assert.deepEqual(r.own, ['changes', 'radiograph'], 'the two the library has no form for say so');
  assert.deepEqual(r.points, [['changes', true], ['radiograph', true], ['drugs', true]], 'they, and Drugs and medications, point into the general consent\'s words');
  assert.deepEqual(r.rows, docs.map(() => 1), 'every consent form on the record is drawn once');
  assert.deepEqual(r.foot, FOOT, 'the general consent\'s foot: the paper\'s three boxes');
  assert.equal(r.signature, false, 'no dentist\'s signature is claimed');
  assert.deepEqual(r.ids, [], 'the privacy notice, its paper, the forms and the general consent keep their ids');
  await p.locator('[data-cf-para="radiograph"] .cf-see').click();
  await p.waitForTimeout(800);
  const at = await p.evaluate(() => {
    const el = document.getElementById('consent-point-examination');
    return { open: el.closest('details').open, top: el.getBoundingClientRect().top, bar: document.querySelector('[data-ws-top]')?.getBoundingClientRect().bottom ?? 0 };
  });
  assert.ok(at.open && at.top >= at.bar - 1 && at.top <= at.bar + 40, `Radiograph's “Examination” opens the general consent's words there: ${JSON.stringify(at)}`);
  ok(`page 2: the ten paragraphs in the paper's order, ${docs.length} consent forms each drawn once, the points into the general consent's words open them, its foot's three boxes`);
}

// 2. The contents go to each part, its head just under the workspace bar, an attached sheet opened; an address opens its part.
const landed = (id) => p.evaluate((id) => {
  const sec = document.getElementById(`rec-${id}`);
  const head = sec.getBoundingClientRect().top;
  const bar = document.querySelector('[data-ws-top]')?.getBoundingClientRect().bottom ?? 0;
  const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
  const fold = sec.querySelector(':scope > details[data-rec-fold]');
  return { head, bar, atEnd, hash: location.hash, open: fold ? fold.open : true };
}, id);
for (const [w, h] of [[1440, 900], [390, 844]]) {
  await p.setViewportSize({ width: w, height: h });
  await p.goto(record, { waitUntil: 'load' });
  for (const id of ['chart', 'treatment-record', 'consent', 'health', 'notes', 'visits', 'money', 'overview']) {
    await p.locator(`[data-rec-link="${id}"]`).click();
    await p.waitForTimeout(900);
    const r = await landed(id);
    assert.equal(r.hash, `#${id}`);
    assert.ok(r.open, `${w} ${id}: its sheet opened`);
    assert.ok(r.head >= r.bar - 1 && (r.head <= r.bar + 30 || r.atEnd), `${w} ${id}: head at ${Math.round(r.head)}, bar ${Math.round(r.bar)}`);
  }
  ok(`${w}: the contents land each part just under the bar (an attached sheet opened), and the address says which`);
}
await p.setViewportSize({ width: 1440, height: 900 });
for (const [hash, part] of [['consent', 'consent'], ['money', 'money'], ['visits', 'visits'], ['notes', 'notes'], ['rx', 'rx'], ['recall', 'visits']]) {
  await p.goto('about:blank');
  await p.goto(`${record}#${hash}`, { waitUntil: 'load' });
  await p.waitForTimeout(500);
  const r = await p.evaluate(([hash, part]) => {
    const fold = document.querySelector(`#rec-${part} > details[data-rec-fold]`);
    const el = document.getElementById(`rec-${hash}`) ?? document.getElementById(hash);
    const t = el.getBoundingClientRect().top;
    const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    return { open: fold ? fold.open : true, inView: t >= 0 && (t < 260 || (atEnd && t < innerHeight - 40)), others: [...document.querySelectorAll('details[data-rec-fold][open]')].map((d) => d.parentElement.dataset.recPanel) };
  }, [hash, part]);
  assert.ok(r.open && r.inView, `#${hash} opens ${part} there`);
  assert.deepEqual(r.others, part === 'consent' ? [] : [part], `#${hash}: only its own sheet opened`);
}
ok('an address ending #consent, #money, #visits, #notes, #rx or #recall opens its part (its sheet, and only it) there');

// 3. The plus signs do what they say.
await p.goto(record, { waitUntil: 'load' });
const caretAfter = async (loc, name, what) => {
  await loc.click();
  await p.waitForTimeout(400);
  assert.equal(await p.evaluate(() => document.activeElement?.getAttribute('name')), name, what);
};
await caretAfter(p.locator('#overview .pf-cell:has(dt:text-is("Contact number")) .pf-go'), 'mobile', 'Contact number opens Edit details with the caret in Mobile');
await p.keyboard.press('Escape');
// The panel gives focus back to its opener as it finishes closing: wait for that before the next plus.
await p.waitForFunction(() => !document.getElementById('details')?.open);
await p.waitForTimeout(600);
await caretAfter(p.locator('.pp-lh .pf-go'), 'chart_no', 'Chart # opens Edit details with the caret in Chart no.');
await p.keyboard.press('Escape');
await p.waitForFunction(() => !document.getElementById('details')?.open);
await p.waitForTimeout(600);
ok('the plus on Contact number and on Chart # open Edit details with the caret in their field');
await caretAfter(p.locator('.pf-go:has(.sr-only:text-is("Add to allergies"))'), 'allergies_add', 'the allergies box has the caret');
assert.equal(await p.evaluate(() => document.querySelector('[data-pp-edit]')?.open), true, 'the folded form opened');
await p.goto(record, { waitUntil: 'load' });
await caretAfter(p.locator('[data-ph-box="last_care"] .pf-go'), 'ph_last_care', 'Date of last dental care has the caret');
ok('the plus on Allergies and on Date of last dental care open the medical history\'s form with the caret in their box');
// Every history box, one after another: the caret in its field and the field in view, under the bar (the lists and the
// note sit screens down the form, under the dental history).
for (const [w, h] of [[1440, 900], [390, 844]]) {
  await p.setViewportSize({ width: w, height: h });
  await p.goto(record, { waitUntil: 'load' });
  const boxes = p.locator('[data-rec-go="health-form"][data-rec-field]');
  const n = await boxes.count(), off = [];
  for (let i = 0; i < n; i++) {
    const field = await boxes.nth(i).getAttribute('data-rec-field');
    await boxes.nth(i).click();
    await p.waitForTimeout(150);
    const r = await p.evaluate(() => {
      const a = document.activeElement, t = a.getBoundingClientRect(), bar = document.querySelector('[data-ws-top]')?.getBoundingClientRect().bottom ?? 0;
      return { name: a.getAttribute('name'), top: Math.round(t.top), inView: t.top >= bar - 1 && t.bottom <= innerHeight + 1 };
    });
    if (r.name !== field || !r.inView) off.push(`${field}: caret in ${r.name} at ${r.top}`);
  }
  assert.ok(n >= 15, `${w}: history boxes ${n}`);
  assert.deepEqual(off, [], `${w}: every history box puts the caret in its field, in view`);
  ok(`${w}: each of the ${n} medical and dental history boxes puts the caret in its field, in view`);
}
await p.setViewportSize({ width: 1440, height: 900 });
await p.goto(record, { waitUntil: 'load' });
await p.locator('[data-rec-link="notes"]').click();
await p.waitForTimeout(700);
await p.locator('#rec-notes .rec-plus', { hasText: 'New note' }).first().click();
await p.waitForTimeout(400);
assert.equal(await p.evaluate(() => document.getElementById('rec-note-add')?.open), true, 'New note opens its panel');
await p.keyboard.press('Escape');
ok('a sheet\'s plus (New note) opens its panel');
// A panel inside a folded sheet, opened from outside it: drawn, and its sheet opened.
await p.goto(record, { waitUntil: 'load' });
if (await p.locator('#rec-more').count()) {
  await p.locator('button[aria-controls="rec-more"]').click();
  await p.locator('[data-ws-open="rec-rx-add"]').first().click();
  await p.waitForTimeout(500);
  const r = await p.evaluate(() => { const d = document.getElementById('rec-rx-add'); const b = d?.getBoundingClientRect(); return { open: d?.open, w: b?.width ?? 0, h: b?.height ?? 0, sheet: document.querySelector('#rec-rx > details').open }; });
  assert.ok(r.open && r.w > 200 && r.h > 200 && r.sheet, `More → Prescription draws its panel over a folded sheet: ${JSON.stringify(r)}`);
  await p.keyboard.press('Escape');
  ok('More → Prescription draws its panel and opens Prescriptions and letters behind it');
}

// 4. Edit details: the occupation and the parent or guardian, saved; an older form keeps them; a bad mobile refused.
const before = (await q('select occupation, guardian_name, guardian_relation, guardian_phone from patient where id = $1', [pt.id]))[0];
try {
  await p.goto(record, { waitUntil: 'load' });
  await p.locator('[data-ws-open="details"]').first().click();
  await p.waitForTimeout(300);
  await p.fill('#details [name="occupation"]', 'Librarian');
  await p.fill('#details [name="guardian_name"]', 'Rosa Halimbawa');
  await p.fill('#details [name="guardian_relation"]', 'Aunt');
  await p.fill('#details [name="guardian_phone"]', '0917 555 0199');
  await Promise.all([p.waitForURL(/saved=details/), p.locator('#details button[type="submit"]').click()]);
  let row = (await q('select occupation, guardian_name, guardian_relation, guardian_phone from patient where id = $1', [pt.id]))[0];
  assert.deepEqual(row, { occupation: 'Librarian', guardian_name: 'Rosa Halimbawa', guardian_relation: 'Aunt', guardian_phone: '09175550199' }, 'Edit details saves the occupation and the guardian');
  const sheet = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('#overview > .pf-cell')].map((c) => [c.querySelector('dt').textContent.trim(), c.querySelector('dd').textContent.trim()])));
  assert.equal(sheet.Occupation, 'Librarian');
  assert.equal(sheet['Parent’s or guardian’s name'], 'Rosa Halimbawa · Aunt · 0917 555 0199');
  // A form drawn before these fields: no flag and no such inputs. It changes the occupation and guardian not at all.
  await p.locator('[data-ws-open="details"]').first().click();
  await p.waitForTimeout(300);
  await p.evaluate(() => document.querySelectorAll('#details :is([name="has_paper_fields"], [name="occupation"], [name^="guardian_"])').forEach((x) => x.closest('label')?.remove() ?? x.remove()));
  await Promise.all([p.waitForURL(/saved=details/), p.locator('#details button[type="submit"]').click()]);
  row = (await q('select occupation, guardian_name, guardian_relation, guardian_phone from patient where id = $1', [pt.id]))[0];
  assert.deepEqual(row, { occupation: 'Librarian', guardian_name: 'Rosa Halimbawa', guardian_relation: 'Aunt', guardian_phone: '09175550199' }, 'an older form keeps them');
  // A guardian's mobile that is not a Philippine mobile: refused, nothing saved.
  await p.locator('[data-ws-open="details"]').first().click();
  await p.waitForTimeout(300);
  await p.fill('#details [name="occupation"]', 'Nurse');
  await p.fill('#details [name="guardian_phone"]', '12345');
  await p.locator('#details button[type="submit"]').click();
  await p.waitForLoadState('load');
  assert.match(await p.locator('#details .ws-callout').innerText(), /parent’s or guardian’s mobile is a Philippine mobile/);
  row = (await q('select occupation from patient where id = $1', [pt.id]))[0];
  assert.equal(row.occupation, 'Librarian', 'nothing saved on a refused post');
  ok('Edit details saves the occupation and the parent or guardian; an older form keeps them; a bad guardian mobile is refused');
} finally {
  await q('update patient set occupation = $2, guardian_name = $3, guardian_relation = $4, guardian_phone = $5 where id = $1', [pt.id, before.occupation, before.guardian_name, before.guardian_relation, before.guardian_phone]);
}

// 5. Printed: only the three pages, each on a sheet of its own, dark words on white in either theme; the audit log told.
// Printed from a full record: a medical and dental history with every box answered (the pregnancy questions where they
// apply), lists and a note, and a raised blood pressure with one before it, planted for this step (rows a superuser
// writes, removed after: these tables are insert-only for the app).
const me = (await q('select id from staff where email = $1', [email]))[0];
const fullPaper = { v: 'paper-2026-10', dentist_name: 'Dr. Ana Cruz', dentist_place: 'Baguio City', dentist_phone: '09171234567', last_care: '2025-06', last_xray: '2024',
  flossing: 'sometimes', brushing: 'twice', problems: ['bleeding_gums', 'sens_cold', 'grinding'], physician_name: 'Dr. Ramon Santos', physician_place: 'Baguio General Hospital',
  physician_visit: '2026-08', transfusion: 'no', pregnant: 'no', nursing: 'no', pill: 'no', illnesses: 'Appendectomy 2015' };
const plantedHistory = (await q(`insert into medical_history (clinic_id, patient_id, answered_at, answered_by, recorded_by, allergies, conditions, medications, note, answers)
  values ($1, $2, now(), 'staff', $3, '{Penicillin,Latex}', '{Asthma,Hypertension,Diabetes}', '{Salbutamol inhaler,Metformin}', 'Anxious with needles; prefers morning visits.', $4) returning id`,
  [clinic.id, pt.id, me.id, JSON.stringify({ paper: fullPaper })]))[0].id;
const plantedVitals = (await q(`insert into vital_sign (clinic_id, patient_id, taken_at, systolic, diastolic, pulse, taken_by)
  values ($1, $2, now(), 150, 95, 88, $3), ($1, $2, now() - interval '30 days', 132, 84, 80, $3) returning id`, [clinic.id, pt.id, me.id])).map((x) => x.id);
let page1 = 0;
try {
for (const scheme of ['light', 'dark']) {
  await p.setViewportSize({ width: 703, height: 1000 });
  await p.emulateMedia({ colorScheme: scheme });
  await p.goto(record, { waitUntil: 'load' });
  await p.waitForTimeout(400);
  await p.emulateMedia({ media: 'print', colorScheme: scheme });
  const r = await p.evaluate(() => {
    const vis = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    const lum = (s) => { const [r, g, b] = (s.match(/[\d.]+/g) || []).map(Number); const l = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * l(r) + 0.7152 * l(g) + 0.0722 * l(b); };
    const main = document.querySelector('.rec-main');
    return {
      shown: [...main.children].filter(vis).map((c) => c.className || c.tagName),
      gone: ['.pp-top', '.pp-attached', '#this-visit', '.ws-side', '.ws-top', '.ws-phone-title', '.rec-plus', '.pf-go', '.pp-head-actions', 'dialog[open]'].filter((s) => [...document.querySelectorAll(s)].some(vis)),
      breaks: [...document.querySelectorAll('.pp-page')].map((pg) => getComputedStyle(pg).breakBefore),
      ink: ['.pp-lh-name', '.pp-title', '.pf-v', '.pp-page-no'].map((s) => lum(getComputedStyle(document.querySelector(s)).color)),
      paper: ['body', '.pp-page'].map((s) => getComputedStyle(document.querySelector(s)).backgroundColor),
      scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      heights: [...document.querySelectorAll('.pp-page')].map((pg) => pg.getBoundingClientRect().height),
      feet: [...document.querySelectorAll('.pp-page > .pp-page-no')].map((f) => f.innerText.trim()),
      consent: { words: !!document.querySelector('.cf-points-paper') && vis(document.querySelector('.cf-points-paper')), acts: [...document.querySelectorAll('#rec-consent :is(button, .ws-btn, summary, input:not([type="hidden"]))')].filter(vis).length },
    };
  });
  assert.deepEqual(r.consent, { words: true, acts: 0 }, `printed (${scheme}): page 2 has the general consent's words, and no button, fold or field`);
  assert.deepEqual(r.shown, ['pp-sheet pp-page', 'pp-sheet pp-page', 'pp-sheet pp-page'], `printed (${scheme}): only the three pages`);
  assert.deepEqual(r.gone, [], `printed (${scheme}): nothing else`);
  assert.deepEqual(r.breaks.slice(1), ['page', 'page'], 'pages 2 and 3 each start a sheet of paper');
  // A4 less the record's @page margins (10 mm top and bottom): 277 mm, 1047 px at 96 per inch, at its 703 px width.
  assert.ok(r.heights[0] <= 1047, `printed (${scheme}): page 1 fits one A4 sheet: ${Math.round(r.heights[0])} px`);
  page1 = Math.max(page1, Math.round(r.heights[0]));
  assert.deepEqual(r.feet, [1, 2, 3].map((n) => `${fullName} · Chart # ${pt.chart_no} · Page ${n}`), `printed (${scheme}): each foot names the patient, the chart no. and its page`);
  // The sheets of paper, counted in the PDF itself; on a page of its own, since printing tells the audit log only once a
  // minute per page (checked below).
  const sheet = await ctx.newPage();
  await sheet.emulateMedia({ colorScheme: scheme });
  await sheet.goto(record, { waitUntil: 'load' });
  const pdf = (await sheet.pdf({ format: 'A4', preferCSSPageSize: true, printBackground: true })).toString('latin1');
  await sheet.close();
  assert.equal((pdf.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length, 3, `printed (${scheme}): three sheets of A4`);
  // Dark words: at least 7:1 on the white paper (relative luminance under 0.1).
  assert.ok(r.ink.every((l) => l < 0.1), `printed (${scheme}): dark words ${r.ink.map((l) => l.toFixed(3))}`);
  assert.deepEqual(r.paper, ['rgb(255, 255, 255)', 'rgb(255, 255, 255)'], `printed (${scheme}): white paper`);
  assert.equal(r.scroll, 0);
  if (OUT) await p.screenshot({ path: `${OUT}/record-print-${scheme}.png`, fullPage: true });
  await p.emulateMedia({ media: null });
}
} finally {
  await q('delete from vital_sign where id = any($1)', [plantedVitals]);
  await q('delete from medical_history where id = $1', [plantedHistory]);
}
ok(`printed, light or dark, from a full record: only the three pages on three A4 sheets (page 1 ${page1} of 1047 px), pages 2 and 3 on sheets of their own, each foot naming the patient and the chart no., dark words on white; page 2 with the general consent's words and no buttons`);
const since = new Date();
await p.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
await p.waitForTimeout(1500);
const printed = await q(`select 1 from audit_log where action = 'record.print' and entity_id = $1 and at >= $2`, [pt.id, since]);
assert.ok(printed.length >= 1, 'printing tells the audit log (record.print)');
ok('printing the record writes record.print to the audit log');
await p.setViewportSize({ width: 1440, height: 900 });

// 6. Someone who cannot edit sees no plus.
// Another member here, for this check only, with editing records taken away at this branch (staff_access.can_edit_records),
// then given back.
const viewer = (await q(`select s.id, s.email from staff s join staff_access a on a.staff_id = s.id and a.clinic_id = $1
  where s.disabled_at is null and s.email is not null and s.email <> $2 and a.can_edit_records order by s.email limit 1`, [clinic.id, email]))[0];
if (viewer) await q('update staff_access set can_edit_records = false where staff_id = $1 and clinic_id = $2', [viewer.id, clinic.id]);
if (viewer) try {
  const c2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const v = await c2.newPage();
  await v.goto(`${base}/auth/login/?any=1`); await v.fill('#email', viewer.email); await v.fill('#password', password);
  await Promise.all([v.waitForURL(/\/c\//), v.click('[data-go]')]);
  await v.goto(record, { waitUntil: 'load' });
  const n = await v.evaluate(() => [...document.querySelectorAll('.rec-plus, .pf-go')].filter((e) => !e.closest('#rec-visits') && !e.closest('#rec-money')).length);
  assert.equal(n, 0, 'no plus to change the record for someone who cannot edit');
  assert.equal(await v.locator('[data-rec-print]').count(), 1, 'Print the record is there for them too');
  ok(`${viewer.email}, records not editable here: no plus sign to change the record (booking and charging follow their own permissions); Print the record is there`);
  await c2.close();
} finally { await q('update staff_access set can_edit_records = true where staff_id = $1 and clinic_id = $2', [viewer.id, clinic.id]); }
else console.log('  --  no other member here; the viewer check is skipped');

await db.end(); await browser.close();
if (errs.length) { console.log('browser errors:', errs); process.exit(1); }
console.log('all passed');
