// Every deep link into the patient record (spec §5), and where it lands: the selected tab, the tab panels shown,
// the hash's element (there? shown? in which panel? on screen?), the side panels open, This visit, the focus, the
// callouts on screen and the address after the page's own rewrites. Also every data-rec-go / data-rec-show button
// on Maria's and Rich Test's records, pressed one at a time.
//
//   node links.mjs [out.json] [--expect [--slice=N]] [--only=<substring>]
//   env: PORT_ (default 4470), DB_ (default flossify_simple)
//
// Run /tmp/fl-simple-scratch/baseline/fixture.sql first (Maria's visit today, Rich Test, the snap sign-ins).
// Each case carries `expect`, the landing spec §5 asks for AFTER the change (tab ids overview | patient | chart |
// treatment-record). Without --expect the old tab is also mapped through the spec's TAB_OF (below) and the case is
// marked "same" when that already equals the expectation, "CHANGES" when §5 moves it: the baseline's CHANGES rows
// are the intended changes. With --expect every case must land on its expected tab (and element / panel), and the
// script exits 1 on any miss.
import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
import pg from '/home/user/fl-simple/node_modules/pg/lib/index.js';
import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const PORT = process.env.PORT_ || 4470;
const BASE = `http://127.0.0.1:${PORT}`;
const S = `${BASE}/c/session-road`;
const args = process.argv.slice(2);
const OUT = args.find((a) => !a.startsWith('--')) ?? '/tmp/fl-simple-scratch/links.json';
const EXPECT = args.includes('--expect');
const ONLY = args.find((a) => a.startsWith('--only='))?.slice(7) ?? null;
// --slice=N: cases whose landing a later slice builds (their `slice` is above N) are shown, not failed; cases whose
// landing a later slice replaces (their `until` is below N) are shown as retired, not failed. No --slice: the last slice.
const SLICE = Number(args.find((a) => a.startsWith('--slice='))?.slice(8) ?? 99);

const db = new pg.Client({ host: '/var/run/postgresql', user: 'root', database: process.env.DB_ || 'flossify_simple' });
await db.connect();
const q1 = async (sql, p = []) => (await db.query(sql, p)).rows[0];
await db.query(`delete from throttle where key like 'login:%'`);

const P = { maria: '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', ledger: '9ea415bd-4b9e-4725-80e8-391464e2c12e', rich: '7e57a1c0-0000-4000-8000-000000000001' };
const V = {
  today: '5a055ab9-8eaa-42aa-9951-395736601384',        // Maria, today 9:30, confirmed (fixture.sql pins it)
  past: '1b9c069c-4521-41fc-b079-559aaa843e6a',         // Maria, 28 Sep, completed, on the ledger
  staleChair: '2ac3bf8c-6471-4d0e-bff7-ada70b33522f',   // Maria, 27 Sep, still "in the chair" (the hereNow bug)
  cancelled: 'becca4e2-73b5-4ad7-a303-ccf353ba006f',    // Maria, 10 Jul, cancelled, holds nothing (not on the ledger)
  future: 'f0ad9227-8747-4fc7-b6de-11fccdff1518',       // Ledger Test, 9 Oct, booked
  futureCancelled: '0429460e-778c-4c37-811f-5c01373ad245', // Ledger Test, 4 Oct, cancelled
  ledgerChair: '77d83a8b-2083-47fb-b31d-72c2d146c1bf',  // Ledger Test, 29 Sep, in the chair
  richToday: '7e57a1c0-0000-4000-8000-0000000000e1',    // Rich Test, today 11:00, in the chair
};
const RX = (await q1(`select id from prescription where patient_id = $1 order by issued_at limit 1`, [P.maria])).id;
const LETTER = (await q1(`select id from clinical_letter where patient_id = $1 order by created_at limit 1`, [P.maria])).id;
const TREATED_RICH = '7e57a1c0-0000-4000-8000-0000000000d1'; // Filling 36 O (chart effect: filled)
const TREATED_MARIA = 'c86ef492-8a05-415f-9d43-4f43618cb254'; // 15 Jun, tooth 36, no catalog
const RANDOM = '0f0f0f0f-1111-4222-8333-444444444444';

// The spec's map (§5), for reading an old tab as a new one. Kept in step with TAB_OF in _record/sections.ts.
const TAB_OF = {
  overview: 'overview', 'this-visit': 'overview', visits: 'overview', recall: 'overview',
  patient: 'patient', health: 'patient', vitals: 'patient', consent: 'patient', 'consent-paper': 'patient', 'consent-forms': 'patient', 'visit-consents': 'patient', 'patient-forms': 'patient', 'details-card': 'patient',
  chart: 'chart', 'chart-offer': 'chart', treatment: 'chart', 'treatment-done': 'chart', 'treatment-lab': 'chart', loas: 'chart', payplans: 'chart', files: 'chart',
  'treatment-record': 'treatment-record', timeline: 'treatment-record', notes: 'treatment-record', rx: 'treatment-record', letters: 'treatment-record', money: 'treatment-record', texts: 'treatment-record',
};

// --- the cases -----------------------------------------------------------------------------------------------
// expect: tab (or a list of acceptable tabs), el (the hash element must be there and shown), dialog (a side panel
// open: an id, or a prefix ending in '*'), strip (This visit shown), url (a regexp the final address must match).
const C = [];
const add = (id, patient, url, expect, extra = {}) => C.push({ id, who: 'owner', patient, url, expect, ...extra });

// ?visit= (panels.ts:85,358; sign/[visit].astro:171,186,192)
add('visit-today', 'maria', `?visit=${V.today}`, { tab: 'overview', strip: true }, { src: 'sign/[visit].astro back links; Dashboard "Open record"' });
add('visit-past-ledger', 'maria', `?visit=${V.past}`, { tab: 'treatment-record', dialog: 'rec-visit-*' });
add('visit-stale-chair', 'maria', `?visit=${V.staleChair}`, { tab: 'treatment-record', dialog: 'rec-visit-*' });
add('visit-cancelled-empty', 'maria', `?visit=${V.cancelled}`, { tab: 'treatment-record', dialog: 'rec-visit-*' }, { slice: 7, note: '§5: a cancelled visit opens the "Cancelled and missed" fold (S7)' });
add('visit-future', 'ledger', `?visit=${V.future}`, { tab: 'overview', dialog: 'rec-visit-*' });
add('visit-future-cancelled', 'ledger', `?visit=${V.futureCancelled}`, { tab: 'overview', dialog: 'rec-visit-*' }, { until: 6, note: 'not on the ledger: the old Visits fallback, Today, until the fold exists (S7)' });
add('visit-future-cancelled-fold', 'ledger', `?visit=${V.futureCancelled}`, { tab: 'treatment-record', dialog: 'rec-visit-*' }, { slice: 7, note: '§5: a cancelled visit opens its "Cancelled and missed" fold (S7), a future one or not' });
add('visit-ledger-chair', 'ledger', `?visit=${V.ledgerChair}`, { tab: 'treatment-record', dialog: 'rec-visit-*' });
add('visit-rich-today', 'rich', `?visit=${V.richToday}`, { tab: 'overview', strip: true });
add('visit-unknown', 'maria', `?visit=${RANDOM}`, { tab: 'overview' });
// The Dashboard's visit panel (panels.ts:234-248): rec(hash, open)
add('dash-health', 'maria', `?visit=${V.today}#health`, { tab: 'patient', el: true }, { src: 'panels.ts rec("health")' });
add('dash-vitals-open', 'maria', `?visit=${V.today}&open=vitals#vitals`, { tab: 'overview', dialog: 'rec-vitals-add' }, { src: 'panels.ts rec("vitals","vitals")', note: '§5: every ?open= lands on Today, so the BP panel opens over Today (the #vitals hash does not move it to Patient info)' });
add('dash-rx', 'maria', `?visit=${V.today}#rx`, { tab: 'treatment-record', el: true }, { src: 'panels.ts rec("rx")' });
add('dash-treatment', 'maria', `?visit=${V.today}#treatment`, { tab: 'chart', el: true }, { src: 'panels.ts rec("treatment")' });
add('dash-desk-note', 'maria', `?open=details&dash=${V.today}`, { tab: 'overview', dialog: 'details', url: /^[^?]*(\?(?!.*(open|dash)=)[^#]*)?(#.*)?$/ }, { src: 'panels.ts:463' });
// ?open=
for (const [k, dlg] of Object.entries({ vitals: 'rec-vitals-add', note: 'rec-note-add', rx: 'rec-rx-add', done: 'rec-done-add', file: 'rec-file-add', details: 'details', health: 'rec-health' })) {
  add(`open-${k}`, 'maria', `?open=${k}`, { tab: 'overview', dialog: dlg }, k === 'health' ? { slice: 5, note: 'rec-health is new in S5' } : {});
  if (k !== 'details' && k !== 'health') add(`open-${k}-visit`, 'maria', `?visit=${V.today}&open=${k}`, { tab: 'overview', dialog: dlg, strip: true });
}
// The palette's back=chart, the chart's offer
add('back-chart', 'maria', `?back=chart`, { tab: 'chart' });
add('treated-rich', 'rich', `?saved=done&treated=${TREATED_RICH}#chart-offer`, { tab: 'chart', el: true });
add('treated-rich-back-chart', 'rich', `?saved=done&treated=${TREATED_RICH}&back=chart#chart-offer`, { tab: 'chart', el: true });
add('treated-rich-plain', 'rich', `?treated=${TREATED_RICH}#chart-offer`, { tab: 'chart', el: true });
add('treated-maria', 'maria', `?saved=done&treated=${TREATED_MARIA}#chart-offer`, { tab: 'chart' });
add('chartskip-changed', 'rich', `?saved=charted&treated=${TREATED_RICH}&chartskip=changed#chart-offer`, { tab: 'chart', el: true });
add('chartskip-ended', 'rich', `?saved=charted&treated=${TREATED_RICH}&chartskip=ended#chart-offer`, { tab: 'chart', el: true });
add('back-treatment-old', 'rich', `?saved=done&treated=${TREATED_RICH}&back=treatment#chart-offer`, { tab: 'chart' }, { note: '§5: an old back=treatment maps to chart' });
// The page's own saves
add('saved-new', 'maria', `?saved=new`, { tab: 'overview' });
add('saved-details', 'maria', `?saved=details#overview`, { tab: 'overview' });
add('saved-form', 'maria', `?saved=form&form=${RANDOM}`, { tab: 'overview' });
add('form-used', 'maria', `?form=${RANDOM}&used=phone#overview`, { tab: 'overview' });
add('stale', 'maria', `?stale=1`, { tab: 'overview' });
add('saved-health', 'maria', `?saved=health#health`, { tab: 'patient', el: true });
add('saved-birth', 'maria', `?saved=birth#health`, { tab: 'patient', el: true }, { until: 4, note: 'the birth date is saved from the Health form until S5: the page\'s redirect, on Patient info' });
add('saved-birth-details', 'maria', `?saved=birth`, { tab: 'overview' }, { slice: 3, note: '§5: the birth date is saved from Edit details (S3) and lands on Today (SAVED_TO)' });
add('saved-nothing', 'maria', `?saved=nothing#health`, { tab: 'patient', el: true });
add('saved-checked', 'maria', `?visit=${V.today}&saved=checked`, { tab: 'overview', strip: true });
add('saved-checked-today', 'maria', `?visit=${V.today}&saved=checked-today`, { tab: 'overview', strip: true });
add('saved-consent', 'maria', `?saved=consent#consent`, { tab: 'patient', el: true });
add('saved-consent-already', 'maria', `?saved=consent-already#consent`, { tab: 'patient', el: true });
add('saved-paper', 'maria', `?saved=paper#consent-paper`, { tab: 'patient', el: true });
add('consent-paper', 'maria', `#consent-paper`, { tab: 'patient', el: true }, { src: 'DeskConsent.astro:163' });
add('saved-intake', 'maria', `?saved=intake&intake=${RANDOM}`, { tab: 'overview' });
add('saved-capacity', 'maria', `?saved=capacity#consent`, { tab: 'patient', el: true }, { src: 'consents/index.astro:35' });
add('saved-consent-removed', 'maria', `?saved=consent-removed#consent`, { tab: 'patient', el: true }, { src: 'consents/[document].astro:100' });
add('capacity-refused', 'maria', `?capacity=refused#consent`, { tab: 'patient', el: true }, { src: 'consents/index.astro:35' });
add('stale-consent', 'maria', `?stale=1#consent`, { tab: 'patient', el: true }, { src: 'consents/index.astro:23' });
// Inbound hashes from other pages
add('hash-treatment-record', 'maria', `#treatment-record`, { tab: 'treatment-record' }, { src: 'treatment-record.astro:33' });
add('aftercare-back', 'maria', `?visit=${V.past}#treatment-record`, { tab: 'treatment-record', dialog: 'rec-visit-*' }, { src: 'aftercare/[kind].astro:35' });
add('aftercare-back-today', 'maria', `?visit=${V.today}#treatment-record`, { tab: 'treatment-record' }, { src: 'aftercare/[kind].astro:35 (today)' });
add('hash-timeline', 'maria', `#timeline`, { tab: 'treatment-record', url: /#treatment-record$/ });
add('hash-rx', 'maria', `#rx`, { tab: 'treatment-record', el: true }, { src: 'rx/[rx].astro:27' });
add('hash-letters', 'maria', `#letters`, { tab: 'treatment-record', el: true }, { src: 'letters/[letter].astro:26' });
add('hash-files', 'maria', `#files`, { tab: 'chart' }, { src: 'files/[file]/view.astro:26' });
add('hash-treatment', 'maria', `#treatment`, { tab: 'chart', el: true }, { src: 'finances/close:338' });
add('hash-money', 'maria', `#money`, { tab: 'treatment-record', el: true }, { src: 'finances/close:370' });
add('hash-money-dentist', 'maria', `#money`, { tab: 'treatment-record' }, { who: 'dentist', note: 'no Statements for a dentist without billing: the tab\'s top' });
add('hash-visits', 'maria', `#visits`, { tab: 'overview' }, { src: 'import.astro:572' });
add('hash-consent', 'maria', `#consent`, { tab: 'patient', el: true }, { src: 'consents/index.astro, [document].astro:170, new/index.astro:107, intake/[intake].astro:709' });
// Post anchors (ANCHOR, EXTRA_ANCHOR) and the old section names
for (const h of ['treatment-done', 'treatment-lab', 'recall', 'vitals', 'letters', 'loas', 'payplans']) add(`anchor-${h}`, 'maria', `#${h}`, { tab: TAB_OF[h] });
for (const h of ['treatment-lab', 'loas']) add(`anchor-${h}-rich`, 'rich', `#${h}`, { tab: TAB_OF[h], el: true });
for (const h of ['overview', 'health', 'chart', 'notes', 'texts', 'this-visit', 'chart-offer', 'consent-forms', 'visit-consents', 'patient-forms', 'details-card', 'patient'])
  add(`hash-${h}`, 'maria', `#${h}`, { tab: TAB_OF[h] });
for (const h of ['rec-overview', 'rec-health', 'rec-chart', 'rec-treatment-record']) add(`hash-${h}`, 'maria', `#${h}`, { tab: TAB_OF[h.slice(4)] });
// What a clinical-record post redirects to (record.ts / record-extra.ts: saved word, ANCHOR / EXTRA_ANCHOR / section)
const POSTS = [
  ['plan-add', 'plan', 'treatment'], ['plan-status', 'plan-accepted', 'treatment'], ['plan-status', 'plan-done', 'treatment'], ['plan-remove', 'plan-removed', 'treatment'],
  ['done-add', 'done', 'treatment-done'], ['lab-add', 'lab', 'treatment-lab'], ['lab-next', 'lab-moved', 'treatment-lab'],
  ['note-add', 'note', 'notes'], ['note-add', 'addendum', 'notes'], ['rx-add', `rx:${RX}`, 'rx'], ['file-add', 'file', 'files'], ['file-add', 'files:2', 'files'], ['file-remove', 'file-removed', 'files'],
  ['recall-set', 'recall', 'recall'], ['recall-done', 'recall-done', 'recall'], ['recall-clear', 'recall-cleared', 'recall'],
  ['vitals-add', 'vitals', 'vitals'], ['vitals-add', 'vitals-high', 'vitals'], ['letter-add', `letter:${LETTER}`, 'letters'], ['letter-answer', 'answered', 'letters'],
  ['loa-add', 'loa', 'loas'], ['loa-approve', 'loa-approved', 'loas'], ['loa-deny', 'loa-denied', 'loas'], ['loa-cancel', 'loa-cancelled', 'loas'],
  ['payplan-add', `payplan:${RANDOM}`, 'payplans'], ['payplan-stop', 'payplan-stopped', 'payplans'], ['adjust-add', 'adjusted:2026-10-30', 'payplans'],
];
for (const [intent, saved, hash] of POSTS) {
  add(`post-${intent}-${saved.split(':')[0]}`, 'maria', `?saved=${encodeURIComponent(saved)}#${hash}`, { tab: TAB_OF[hash] }, { src: `post ${intent}` });
  if (['plan-add', 'done-add', 'note-add'].includes(intent) && saved !== 'addendum') add(`post-${intent}-back-chart`, 'maria', `?saved=${encodeURIComponent(saved)}&back=chart#chart`, { tab: 'chart', el: true }, { src: `palette post ${intent}` });
}
// S2's generalised back: a save redirects to #<back>, the tab the panel was opened over (§5 "back generalised")
for (const [intent, saved] of [['rx-add', `rx:${RX}`], ['note-add', 'note'], ['vitals-add', 'vitals'], ['letter-add', `letter:${LETTER}`], ['file-add', 'file'], ['done-add', 'done'], ['recall-set', 'recall']])
  for (const back of ['overview', 'patient', 'chart', 'treatment-record'])
    add(`back-${back}-${intent}`, 'maria', `?visit=${V.today}&saved=${encodeURIComponent(saved)}&back=${back}#${back}`, { tab: back }, { note: 'new in S2' });
// The offline kept copy (sw.js marks <html data-offline-copy>): opens on the Chart
add('offline-copy', 'maria', ``, { tab: 'chart' }, { offline: true });
add('offline-copy-visit', 'maria', `?visit=${V.today}`, { tab: 'chart' }, { offline: true });

// --- running ---------------------------------------------------------------------------------------------------
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctxs = {};
async function ctxFor(who) {
  if (ctxs[who]) return ctxs[who];
  const email = { owner: 'liwayway.domingo@example.com', dentist: 'hazel.tabanao@example.com' }[who];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', email); await page.fill('#password', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
  await page.close();
  return (ctxs[who] = ctx);
}
const COLLECT = (asked) => {
  const vis = (el) => !!el && el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && el.getClientRects().length > 0;
  const txt = (el) => (el?.innerText ?? '').replace(/\s+/g, ' ').trim();
  const sel = document.querySelector('[role="tab"][aria-selected="true"][id^="rec-rec-"]');
  // The element of the hash the link asked for (the page may rewrite the address to its section afterwards).
  const hash = asked ?? decodeURIComponent(location.hash.slice(1));
  const t = hash ? document.getElementById(hash) : null;
  const r = t?.getBoundingClientRect();
  const strip = document.getElementById('this-visit');
  const ae = document.activeElement;
  return {
    status: document.title,
    url: location.pathname.replace(/^\/c\/[^/]+\/patients\/[^/]+\//, '') + location.search + location.hash,
    tab: sel ? sel.id.replace(/^rec-rec-|-tab$/g, '') : null,
    panels: [...document.querySelectorAll('[data-rec-panel]')].filter((p) => !p.hidden).map((p) => p.dataset.recPanel),
    el: hash ? { id: hash, exists: !!t, shown: vis(t), panel: t?.closest('[data-rec-panel]')?.dataset.recPanel ?? null, top: r ? Math.round(r.top) : null, onScreen: r ? r.top < innerHeight && r.bottom > 0 : null } : null,
    dialogs: [...document.querySelectorAll('dialog[open]')].map((d) => d.id),
    strip: strip ? { shown: vis(strip), meta: txt(strip.querySelector('.ws-pane-meta')).slice(0, 80) } : null,
    focus: ae && ae !== document.body ? `${ae.tagName.toLowerCase()}${ae.id ? '#' + ae.id : ''}${ae.getAttribute('name') ? `[name=${ae.getAttribute('name')}]` : ''}` : null,
    scrollY: Math.round(scrollY),
    callouts: [...document.querySelectorAll('.ws-callout')].filter(vis).map((c) => txt(c).slice(0, 100)),
  };
};
const settle = async (page) => { await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(450); };
const asList = (x) => (Array.isArray(x) ? x : [x]);
function judge(c, got) {
  const miss = [];
  const e = c.expect;
  if (e.tab && !asList(e.tab).includes(got.tab)) miss.push(`tab ${got.tab} ≠ ${asList(e.tab).join('|')}`);
  if (e.el && !(got.el?.exists && got.el?.shown)) miss.push(`#${got.el?.id ?? '?'} not shown`);
  if (e.el && got.el?.shown && got.el.panel && got.el.panel !== got.tab) miss.push(`#${got.el.id} is in ${got.el.panel}, not the tab shown`);
  if (e.dialog) { const d = e.dialog; if (!got.dialogs.some((x) => (d.endsWith('*') ? x.startsWith(d.slice(0, -1)) : x === d))) miss.push(`no dialog ${d}`); }
  if (e.strip && !got.strip?.shown) miss.push('no This visit');
  if (e.url && !e.url.test(got.url)) miss.push(`url ${got.url}`);
  return miss;
}

const results = [];
for (const c of C) {
  if (ONLY && !c.id.includes(ONLY)) continue;
  const ctx = await ctxFor(c.who);
  const page = await ctx.newPage();
  const url = `${S}/patients/${P[c.patient]}/${c.url}`;
  if (c.offline) {
    // What sw.js serves for a kept copy: the record's HTML with <html data-offline-copy="<kept at>">.
    await page.route((u) => u.pathname === `/c/session-road/patients/${P[c.patient]}/`, async (route) => {
      const res = await route.fetch();
      const body = (await res.text()).replace(/<html\b/i, `<html data-offline-copy="${Date.now()}"`);
      await route.fulfill({ response: res, body });
    });
  }
  const res = await page.goto(url, { waitUntil: 'load' });
  await settle(page);
  const asked = c.url.includes('#') ? decodeURIComponent(c.url.split('#')[1]) : null;
  const got = { http: res?.status(), ...(await page.evaluate(COLLECT, asked)) };
  const miss = judge(c, got);
  const oldAsNew = got.tab ? TAB_OF[got.tab] ?? got.tab : null;
  const sameAsSpec = c.expect.tab ? asList(c.expect.tab).includes(oldAsNew) : true;
  results.push({ ...c, expect: { ...c.expect, url: c.expect.url?.toString() }, got, miss, oldAsNew, sameAsSpec });
  await page.close();
}

// data-rec-go / data-rec-show, pressed one at a time (el.click(), so a button in the closed More menu is pressed too).
const presses = [];
for (const [patient, qs] of [['maria', ''], ['rich', '']]) {
  if (ONLY && !'press'.includes(ONLY)) continue;
  const ctx = await ctxFor('owner');
  const page = await ctx.newPage();
  await page.goto(`${S}/patients/${P[patient]}/${qs}`, { waitUntil: 'load' }); await settle(page);
  const list = await page.evaluate(() => [...document.querySelectorAll('[data-rec-go], [data-rec-show]')].map((b, i) => ({ i, go: b.dataset.recGo ?? null, show: b.dataset.recShow ?? null, opens: b.getAttribute('data-ws-open'), text: (b.innerText || b.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 60), where: b.closest('#this-visit') ? 'this-visit' : b.closest('#rec-more') ? 'more' : b.closest('.rec-alerts') ? 'head-chip' : b.closest('[data-rec-panel]')?.dataset.recPanel ?? 'head' })));
  for (const b of list) {
    await page.goto(`${S}/patients/${P[patient]}/${qs}`, { waitUntil: 'load' }); await settle(page);
    await page.evaluate((i) => document.querySelectorAll('[data-rec-go], [data-rec-show]')[i].click(), b.i);
    await page.waitForTimeout(350);
    const got = await page.evaluate(COLLECT, null);
    const want = TAB_OF[b.go ?? b.show];
    presses.push({ patient, ...b, got: { tab: got.tab, dialogs: got.dialogs, url: got.url, focus: got.focus }, want, oldAsNew: TAB_OF[got.tab] ?? got.tab });
  }
  await page.close();
}
await browser.close(); await db.end();

let commit = '';
try { commit = execSync('git -C /home/user/fl-simple rev-parse --short HEAD').toString().trim(); } catch {}
writeFileSync(OUT, JSON.stringify({ meta: { at: new Date().toISOString(), commit, base: BASE, expect: EXPECT }, cases: results, presses }, null, 1));

// The table.
const pad = (s, n) => String(s ?? '').padEnd(n).slice(0, n);
console.log(`${pad('case', 34)} ${pad('tab', 17)} ${pad('→ new', 17)} ${pad('expect', 26)} ${pad('el', 30)} dialogs`);
let bad = 0;
for (const r of results) {
  const el = r.got.el ? `#${r.got.el.id}${r.got.el.exists ? (r.got.el.shown ? ` in ${r.got.el.panel} y${r.got.el.top}` : ' hidden') : ' absent'}` : '';
  const later = (r.slice ?? 0) > SLICE;
  const retired = r.until !== undefined && SLICE > r.until;
  const flag = EXPECT ? (retired ? `retired (after S${r.until})` : r.miss.length ? `${later ? `later (S${r.slice})` : 'FAIL'} ${r.miss.join('; ')}` : 'ok') : (r.sameAsSpec ? 'same' : 'CHANGES');
  if (EXPECT && r.miss.length && !later && !retired) bad++;
  console.log(`${pad(r.id, 34)} ${pad(r.got.tab, 17)} ${pad(r.oldAsNew, 17)} ${pad(asList(r.expect.tab).join('|'), 26)} ${pad(el, 30)} ${pad(r.got.dialogs.join(','), 22)} ${flag}`);
}
console.log('\npresses (data-rec-go / data-rec-show):');
for (const p of presses) {
  const ok = p.oldAsNew === p.want || p.got.tab === p.want;
  if (EXPECT && p.got.tab !== p.want) bad++;
  console.log(`${pad(p.patient, 7)} ${pad(p.where, 11)} ${pad((p.go ? 'go=' + p.go : 'show=' + p.show), 18)} ${pad(p.text, 34)} → ${pad(p.got.tab, 17)} (${pad(p.oldAsNew, 16)} want ${pad(p.want, 16)}) ${pad(p.got.dialogs.join(','), 18)} ${EXPECT ? (p.got.tab === p.want ? 'ok' : 'FAIL') : ok ? 'same' : 'CHANGES'}`);
}
console.log(`\n${results.length} links, ${presses.length} presses${EXPECT ? `, ${bad} failing` : ''} → ${OUT}`);
if (EXPECT && bad) process.exit(1);
