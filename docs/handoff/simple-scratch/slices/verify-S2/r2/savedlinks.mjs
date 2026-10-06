// Verifier: §5's ?saved= links and the page's other just-saved words — is the sentence drawn, shown and ON SCREEN where
// the page lands? Run on both builds (S1 and HEAD) and compare. node savedlinks.mjs <label>
import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const BASE = `http://127.0.0.1:${process.env.PORT_ || 4470}`;
const MARIA = '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', TODAY = '5a055ab9-8eaa-42aa-9951-395736601384';
const CASES = [
  ['saved=health#health', /^Saved\.$/],
  ['saved=birth#health', /^Saved\.$/],
  ['saved=nothing#health', /Nothing was saved: nothing is ticked/],
  ['saved=consent#consent', /agreed|Recorded|recorded/],
  ['saved=consent-already#consent', /already/],
  ['saved=paper#consent-paper', /paper|Recorded|recorded/],
  [`visit=${TODAY}&saved=checked`, /checked|Checked/],
  [`visit=${TODAY}&saved=checked-today`, /checked|Checked/],
  ['saved=new', /^Added\./],
  ['saved=details#overview', /Details saved/],
  ['saved=capacity#consent', /Recorded\. For 30 days/],
  ['saved=consent-removed#consent', /The form was removed/],
  ['capacity=refused#consent', /Nothing was recorded\. Only a treating dentist/],
  ['stale=1', /./],
  ['stale=1#consent', /./],
];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
  for (const [qs, re] of CASES) {
    await page.goto('about:blank');
    await page.goto(`${BASE}/c/session-road/patients/${MARIA}/?${qs}`, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    const s = await page.evaluate((src) => {
      const re = new RegExp(src);
      const vis = (el) => !!el && el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && el.getClientRects().length > 0;
      const sel = document.querySelector('[role="tab"][aria-selected="true"][id^="rec-rec-"], [role="tab"][aria-selected="true"]');
      const bar = document.querySelector('[data-rec-bar]')?.getBoundingClientRect();
      const barBottom = bar && bar.top <= 80 ? bar.bottom : 0;
      const cs = [...document.querySelectorAll('.ws-callout, [role=status], [role=alert]')].filter((c) => re.test(c.textContent.replace(/\s+/g, ' ').trim()));
      const shown = cs.filter(vis);
      const on = shown.filter((c) => { const r = c.getBoundingClientRect(); return r.bottom > barBottom + 8 && r.top < innerHeight - 8; });
      return { tab: sel?.id ?? null, drawn: cs.length, shown: shown.length, onScreen: on.length, y: Math.round(scrollY), first: shown[0] ? Math.round(shown[0].getBoundingClientRect().top) : null, text: (shown[0] ?? cs[0])?.textContent.replace(/\s+/g, ' ').trim().slice(0, 60) };
    }, re.source);
    console.log(`${String(w).padEnd(5)} ${qs.replace(TODAY, 'TODAY').padEnd(34)} tab=${String(s.tab).padEnd(26)} drawn=${s.drawn} shown=${s.shown} onScreen=${s.onScreen} y=${s.y} top=${s.first} "${s.text}"`);
  }
  await ctx.close();
}
await browser.close();
