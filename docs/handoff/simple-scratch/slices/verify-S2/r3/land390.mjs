// Where a deep link's element lands on the screen (phone, small laptop, tablet): selected tab, the element shown,
// its top just under the stuck row (not under it) and on screen. Plus every data-rec-go press on Rich's record.
import { browser, login, rec, state } from './lib.mjs';
const b = await browser();
const RX = null;
let bad = 0, n = 0;
const HASHES = { maria: ['rx', 'letters', 'treatment', 'money', 'consent', 'consent-paper', 'health', 'vitals', 'recall', 'visits', 'notes', 'texts', 'files', 'treatment-done', 'treatment-record', 'chart', 'patient', 'overview', 'visit-consents'],
  rich: ['treatment-lab', 'loas', 'payplans', 'health', 'rx'] };
const TREATED = '7e57a1c0-0000-4000-8000-0000000000d1';
const WANT = { rx: 'treatment-record', letters: 'treatment-record', treatment: 'chart', money: 'treatment-record', consent: 'patient', 'consent-paper': 'patient', health: 'patient', vitals: 'patient', recall: 'overview', visits: 'overview', notes: 'treatment-record', texts: 'treatment-record', files: 'chart', 'treatment-done': 'chart', 'treatment-record': 'treatment-record', chart: 'chart', patient: 'patient', overview: 'overview', 'visit-consents': 'patient', 'treatment-lab': 'chart', loas: 'chart', payplans: 'chart', 'chart-offer': 'chart' };
const measure = (page, id) => page.evaluate((id) => {
  const el = document.getElementById(id);
  const bar = document.querySelector('[data-rec-bar]').getBoundingClientRect();
  const topBar = document.querySelector('[data-ws-top]')?.getBoundingClientRect();
  if (!el) return { el: false };
  const target = el.matches('.rec-anchor') ? el.closest('[data-rec-panel]') : el;
  const r = target.getBoundingClientRect();
  const hit = document.elementFromPoint(Math.min(innerWidth - 2, r.left + 24), Math.min(innerHeight - 2, Math.max(r.top + 8, 0)));
  return { el: true, shown: target.getClientRects().length > 0, top: Math.round(r.top), barBottom: Math.round(bar.bottom), barTop: Math.round(bar.top), topBar: Math.round(topBar?.bottom ?? 0), vh: innerHeight, hitInside: !!hit && (target.contains(hit) || hit === target), scrollY: Math.round(scrollY), sideways: document.documentElement.scrollWidth > innerWidth };
}, id);
for (const vw of [{ width: 390, height: 844 }, { width: 1366, height: 768 }, { width: 768, height: 1024 }]) {
  const { ctx, page } = await login(b, 'owner', { viewport: vw });
  const cases = [];
  for (const [pat, hs] of Object.entries(HASHES)) for (const h of hs) cases.push([pat, `#${h}`, h]);
  cases.push(['rich', `?saved=done&treated=${TREATED}#chart-offer`, 'chart-offer']);
  cases.push(['maria', `?saved=note&back=treatment-record#treatment-record`, 'treatment-record']);
  cases.push(['maria', `?saved=recall#recall`, 'recall']);
  cases.push(['maria', `?saved=plan-accepted#treatment`, 'treatment']);
  for (const [pat, suffix, id] of cases) {
    await page.goto('about:blank'); await page.goto(rec(pat, suffix), { waitUntil: 'load' }); await page.waitForTimeout(700);
    const st = await state(page);
    const m = await measure(page, id);
    // under the row: the element's top at or below the row's bottom (when the row is stuck), and on screen
    const stuck = m.barTop <= m.topBar + 1;
    const okPos = m.el && m.shown && m.top < m.vh - 40 && (!stuck || m.top >= m.barBottom - 1) && m.hitInside;
    const ok = st.tab === WANT[id] && okPos && !m.sideways;
    n++; if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${vw.width}x${vw.height} ${pat} ${suffix.slice(0, 60).padEnd(60)} tab=${st.tab} want=${WANT[id]} ${JSON.stringify(m)}`);
  }
  // data-rec-go presses on Rich (head chips, This visit lines, overview cards), scrolled to the top first
  await page.goto('about:blank'); await page.goto(rec('rich'), { waitUntil: 'load' }); await page.waitForTimeout(500);
  const gos = await page.evaluate(() => [...document.querySelectorAll('[data-rec-go]')].map((b, i) => ({ i, go: b.dataset.recGo, text: (b.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30), shown: b.getClientRects().length > 0, panel: b.closest('[data-rec-panel]')?.dataset.recPanel ?? 'head' })));
  for (const g of gos.filter((x) => x.shown || x.panel === 'head')) {
    await page.goto('about:blank'); await page.goto(rec('rich'), { waitUntil: 'load' }); await page.waitForTimeout(500);
    await page.evaluate((i) => { const b = document.querySelectorAll('[data-rec-go]')[i]; b.scrollIntoView({ block: 'center' }); }, g.i);
    await page.waitForTimeout(150);
    await page.evaluate((i) => document.querySelectorAll('[data-rec-go]')[i].click(), g.i);
    await page.waitForTimeout(600);
    const st = await state(page);
    const m = await measure(page, g.go);
    const stuck = m.barTop <= m.topBar + 1;
    const ok = st.tab === WANT[g.go === 'visits' ? 'visits' : g.go] && m.el && m.shown && m.top < m.vh - 40 && (!stuck || m.top >= m.barBottom - 1);
    n++; if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${vw.width}x${vw.height} rich go=${g.go} "${g.text}" (${g.panel}) tab=${st.tab} focus=${st.focus} ${JSON.stringify(m)}`);
  }
  await ctx.close();
}
console.log(bad, 'failing of', n);
await b.close();
