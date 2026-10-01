// The paperless day, end to end on the built server: a treatment recorded from the strip, the visit finished from
// the Dashboard row, the aftercare text queued, the charge from the visit with Paid now, the record's strip and
// Timeline after it, the settings switches, the Dashboard's new links.
import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:4399';
const SLUG = 'session-road';
const MARIA = '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', VISIT = '1b9c069c-4521-41fc-b079-559aaa843e6a';
const SHOTS = '/tmp/claude-0/shots';
const say = (k, v) => console.log(k + ':', typeof v === 'string' ? v : JSON.stringify(v));
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
const rec = (qs = '') => `${BASE}/c/${SLUG}/patients/${MARIA}/${qs}`;
const lines = async () => p.$$eval('#this-visit .vs-line', (ls) => ls.map((l) => `${l.dataset.tone}: ${l.querySelector('.vs-words').textContent} [${[...l.querySelectorAll('.vs-acts .ws-btn')].map((b) => b.textContent.trim()).join(' | ')}]`));
const done = async () => p.$$eval('#this-visit .vs-done .vs-go', (ps) => ps.map((x) => x.textContent.trim()));

// 1. Record a treatment from the strip (Maria is arrived; the line shows only once in the chair, so use the Also row → no: use ?open=done).
await p.goto(rec(`?visit=${VISIT}&open=done#treatment-done`), { waitUntil: 'networkidle' });
say('done panel open', await p.$eval('#rec-done-add', (d) => d.open));
const opt = await p.$$eval('#rec-done-add select[name="catalog_id"] option', (os) => os.map((o) => [o.value, o.textContent.trim()]).find(([, t]) => /prophylaxis|cleaning/i.test(t)) ?? null);
say('cleaning option', opt);
if (opt) await p.selectOption('#rec-done-add select[name="catalog_id"]', opt[0]);
await p.fill('#rec-done-add input[name="fdi"]', '');
const dentistOpt = await p.$eval('#rec-done-add select[name="dentist"]', (s) => s.value || [...s.options].find((o) => o.value)?.value);
await p.selectOption('#rec-done-add select[name="dentist"]', dentistOpt);
await Promise.all([p.waitForNavigation(), p.click('#rec-done-add button[type="submit"]')]);
say('after done url', p.url().replace(BASE, ''));
say('strip done pills', await done());
say('strip lines', await lines());

// 2. Finish the visit from the Dashboard's Today's patients row: In the chair, then Done.
await p.goto(`${BASE}/c/${SLUG}/`, { waitUntil: 'networkidle' });
for (let i = 0; i < 2; i++) {
  const step = await p.$(`.pt-step[data-visit="${VISIT}"]`);
  say(`row step ${i}`, step ? await step.textContent() : 'none');
  if (!step) break;
  await step.click();
  await p.waitForTimeout(900);
}
say('row after', await p.$eval(`.pt-open[data-patient="${MARIA}"]`, (el) => el.closest('.pt-row').innerText.replace(/\s+/g, ' ').trim()).catch(() => 'row gone'));
// The visit panel: Before they leave.
await p.click(`.cal-card[data-id="${VISIT}"]`);
await p.waitForTimeout(600);
say('panel title', await p.$eval('[data-vp-check-title]', (e) => e.textContent));
say('panel lines', await p.$$eval('[data-vp-check-list] li', (ls) => ls.map((l) => l.innerText.replace(/\s+/g, ' ').trim())));
const chargeBtn = await p.$('[data-vp-actions] a:has-text("Charge")');
say('charge button', chargeBtn ? await chargeBtn.getAttribute('href') : 'none');
await p.screenshot({ path: `${SHOTS}/leave-panel-2.png` });

// 3. Charge from the visit, paid now.
await p.goto(`${chargeBtn ? BASE + await chargeBtn.getAttribute('href') : `${BASE}/c/${SLUG}/finances/new/?patient=${MARIA}&visit=${VISIT}`}`, { waitUntil: 'networkidle' });
say('charge callout', await p.$eval('.fin-page .ws-callout', (e) => e.textContent.trim().slice(0, 160)).catch(() => 'none'));
say('charge lines', await p.$$eval('[data-line]', (ls) => ls.map((l) => [l.querySelector('[data-line-desc]').value, l.querySelector('[data-line-price]').value, !!l.querySelector('[data-line-procedure]').value])));
say('visit hidden', await p.$eval('input[name="visit"]', (i) => i.value === document.location.search.match(/visit=([^&]+)/)?.[1]));
await p.check('[data-pay-now]');
await p.waitForTimeout(200);
say('pay box shown', await p.$eval('[data-pay-box]', (e) => !e.hidden));
say('pay amount auto', await p.$eval('[data-pay-amount]', (i) => i.value));
await p.click('label:has(input[data-pay-method][value="gcash"])');
say('ref label', await p.$eval('[data-pay-ref-label]', (e) => e.textContent.trim()));
await p.fill('input[name="pay_reference"]', 'GC-123');
await p.screenshot({ path: `${SHOTS}/charge-visit.png`, fullPage: true });
await Promise.all([p.waitForNavigation(), p.click('[data-bill-save]')]);
say('after save url', p.url().replace(BASE, ''));
say('statement page says', await p.$eval('main, body', (e) => (e.innerText.match(/Paid[^\n]{0,80}/g) ?? []).slice(0, 3)));

// 4. The record after: strip says charged; the Timeline's card says Paid.
await p.goto(rec(`?visit=${VISIT}`), { waitUntil: 'networkidle' });
say('strip after charge lines', await lines());
say('strip after charge done', await done());
await p.click('#rec-rec-timeline-tab');
await p.waitForTimeout(300);
say('timeline card', await p.$eval(`#rec-timeline .vx-card[data-ws-open="rec-visit-${VISIT}"]`, (e) => e.innerText.replace(/\s+/g, ' ').slice(0, 220)));
say('texts section', await p.$$eval('#rec-texts tbody tr', (rs) => rs.slice(0, 3).map((r) => r.innerText.replace(/\s+/g, ' ').slice(0, 140))));

// 5. Settings: the two switches save.
await p.goto(`${BASE}/c/${SLUG}/settings/#profile`, { waitUntil: 'networkidle' });
say('switches', await p.$$eval('input[name="remind_48h"], input[name="recall_texts"]', (is) => is.map((i) => [i.name, i.checked])));
await p.check('input[name="recall_texts"]');
await Promise.all([p.waitForNavigation(), p.click('#profile button[type="submit"]')]);
say('settings url', p.url().replace(BASE, ''));
say('switches after', await p.$$eval('input[name="remind_48h"], input[name="recall_texts"]', (is) => is.map((i) => [i.name, i.checked])));

// 6. Dashboard links.
await p.goto(`${BASE}/c/${SLUG}/`, { waitUntil: 'networkidle' });
say('collected tile href', await p.$eval('#tile-collected', (e) => (e.closest('a') ?? e.querySelector('a') ?? e).getAttribute('href')).catch(() => 'no tile'));
say('calls link', await p.$eval('#patients a[href$="/calls/"]', (a) => a.textContent.trim()).catch(() => 'none'));
say('errors', errs.length ? errs.join(' || ') : 'none');
await b.close();
