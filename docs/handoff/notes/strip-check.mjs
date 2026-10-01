// This visit strip (036): the record's checklist for today's visit, end to end on the built server.
import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:4399';
const SLUG = 'session-road';
const MARIA = '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', MARIA_VISIT = '1b9c069c-4521-41fc-b079-559aaa843e6a';
const CARLOS = '9c5cddc3-e786-4050-96eb-9effd1829fba', CARLOS_VISIT = '4399b808-189a-4294-9035-2668462613ae';
const SHOTS = '/tmp/claude-0/shots';
const out = [];
const say = (k, v) => { out.push(`${k}: ${v}`); console.log(k + ':', v); };
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
const stripText = async () => p.$eval('#this-visit', (el) => el.innerText.replace(/\s+/g, ' ').trim()).catch(() => '(no strip)');
const lines = async () => p.$$eval('#this-visit .vs-line', (ls) => ls.map((l) => `${l.dataset.tone}: ${l.querySelector('.vs-words').textContent} [${[...l.querySelectorAll('.vs-acts .ws-btn')].map((b) => b.textContent.trim()).join(' | ')}]`));
const done = async () => p.$$eval('#this-visit .vs-done .vs-pill', (ps) => ps.map((x) => x.textContent.trim()));

// 1. Maria: arrived, no ?visit= — the strip picks the visit under way.
await p.goto(rec(MARIA), { waitUntil: 'networkidle' });
say('maria strip', await stripText());
say('maria lines', JSON.stringify(await lines(), null, 0));
say('maria done', JSON.stringify(await done()));
say('maria current section', await p.$eval('[data-rec-panel]:not([hidden])', (el) => el.dataset.recPanel));
await p.screenshot({ path: `${SHOTS}/strip-maria.png`, fullPage: false });

// 2. "No change" → health checked today, ?visit kept, strip says so.
const noChange = await p.$('#this-visit form button:has-text("No change")');
if (noChange) {
  await Promise.all([p.waitForNavigation(), noChange.click()]);
  say('after no-change url', p.url().replace(BASE, ''));
  say('after no-change strip', (await stripText()).slice(0, 220));
  say('after no-change done', JSON.stringify(await done()));
} else say('no-change button', 'absent (already checked today?)');

// 3. "Take it" opens the vitals panel over the Health section; save a reading; the strip shows it.
await p.click('#this-visit button:has-text("Take it")');
await p.waitForTimeout(300);
say('vitals panel open', await p.$eval('#rec-vitals-add', (d) => d.open));
say('section shown', await p.$eval('[data-rec-panel]:not([hidden])', (el) => el.dataset.recPanel));
say('vitals form carries visit', await p.$eval('#rec-vitals-add input[name="visit"]', (i, v) => i.value === v, MARIA_VISIT).catch(() => 'no visit input'));
await p.fill('#rec-vitals-add input[name="systolic"]', '118');
await p.fill('#rec-vitals-add input[name="diastolic"]', '76');
await p.fill('#rec-vitals-add input[name="pulse"]', '70');
await Promise.all([p.waitForNavigation(), p.click('#rec-vitals-add button[type="submit"]')]);
say('after vitals url', p.url().replace(BASE, ''));
say('after vitals done', JSON.stringify(await done()));
say('after vitals lines', JSON.stringify(await lines()));

// 4. ?open=note from the Dashboard: the note panel opens as the page loads, with the visit stamped.
await p.goto(rec(MARIA, `?visit=${MARIA_VISIT}&open=note#notes`), { waitUntil: 'networkidle' });
await p.waitForTimeout(300);
say('note panel open on load', await p.$eval('#rec-note-add', (d) => d.open));
say('note form carries visit', await p.$eval('#rec-note-add input[name="visit"]', (i, v) => i.value === v, MARIA_VISIT).catch(() => 'no visit input'));
await p.fill('#rec-note-add textarea[name="findings"]', 'Strip check: caries 36 occlusal.');
await p.fill('#rec-note-add input[name="teeth"]', '36');
await Promise.all([p.waitForNavigation(), p.click('#rec-note-add button[type="submit"]')]);
say('after note url', p.url().replace(BASE, ''));
say('after note done', JSON.stringify(await done()));

// 5. The Timeline: the note and the reading sit under today's visit (stamped, not matched by day).
await p.click('[data-rec-go="timeline"], #rec-rec-timeline-tab');
await p.waitForTimeout(300);
const card = await p.$(`#rec-timeline .vx-card[data-ws-open="rec-visit-${MARIA_VISIT}"]`);
say('timeline card found', !!card);
if (card) say('timeline card text', (await card.innerText()).replace(/\s+/g, ' ').slice(0, 200));

// 6. Carlos: completed this morning — before they leave.
await p.goto(rec(CARLOS, `?visit=${CARLOS_VISIT}`), { waitUntil: 'networkidle' });
say('carlos strip', (await stripText()).slice(0, 300));
say('carlos lines', JSON.stringify(await lines()));
say('carlos done', JSON.stringify(await done()));
say('carlos current section', await p.$eval('[data-rec-panel]:not([hidden])', (el) => el.dataset.recPanel));
say('carlos visit panel open', await p.$eval(`#rec-visit-${CARLOS_VISIT}`, (d) => d.open).catch(() => 'none'));
await p.screenshot({ path: `${SHOTS}/strip-carlos.png` });

// 7. A past visit by ?visit= still opens on the Timeline with its panel.
const past = await p.evaluate(() => [...document.querySelectorAll("#rec-timeline .vx-card")].map((x) => x.dataset.wsOpen.replace("rec-visit-", "")).filter((v) => !v.startsWith("day-"))[1] ?? null);
if (past) {
  await p.goto(rec(CARLOS, `?visit=${past}`), { waitUntil: 'networkidle' });
  say('past visit section', await p.$eval('[data-rec-panel]:not([hidden])', (el) => el.dataset.recPanel));
  say('past visit panel open', await p.$eval(`#rec-visit-${past}`, (d) => d.open).catch(() => 'none'));
}

// 8. Phone: no sideways scroll, targets.
await p.setViewportSize({ width: 390, height: 844 });
await p.goto(rec(MARIA), { waitUntil: 'networkidle' });
say('390 scrollWidth', await p.evaluate(() => `${document.documentElement.scrollWidth} vs ${innerWidth}`));
say('390 small targets', JSON.stringify(await p.$$eval('#this-visit button, #this-visit a', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return [e.textContent.trim().slice(0, 20), Math.round(r.height)]; }).filter(([, h]) => h > 0 && h < 44))));
await p.screenshot({ path: `${SHOTS}/strip-maria-390.png` });

say('errors', errs.length ? errs.join(' || ') : 'none');
await b.close();
