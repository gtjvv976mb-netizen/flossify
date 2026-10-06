// For each sample HMO fact, set T-VER1's HMO, open its record at each size, light and dark,
// and measure every fact against the facts box: nothing past the right edge, no sideways scroll, all words present.
import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
import { execSync } from 'node:child_process';
const BASE = 'http://127.0.0.1:4470', ID = '7e57a1c0-0000-4000-8000-000000000401';
const SAMPLES = [['Health Partners Dental Access','HPDA-0000-1234-5678-9'],['EastWest Healthcare','1100-2233-4455'],['Maxicare','0123-4567-8901-2345'],['Intellicare',null],['Health Partners Dental Access','HPDA00001234567890123456789']];
const SIZES = [[1440,900],[1366,768],[1024,768],[768,1024],[390,844],[360,740],[320,640]];
const psql = (q) => execSync(`psql -U root -h /var/run/postgresql -d flossify_simple -qAtc "${q}"`).toString();
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let fails = 0, n = 0;
for (const [hmo, no] of SAMPLES) {
  psql(`update patient set hmo_name='${hmo}', hmo_member_no=${no ? `'${no}'` : 'null'} where id='${ID}'`);
  for (const scheme of ['light','dark']) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', colorScheme: scheme });
    const page = await ctx.newPage();
    await page.goto(BASE + '/auth/login/?any=1'); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
    await Promise.all([page.waitForNavigation(), page.click('[data-go]')]);
    for (const [w, h] of SIZES) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(`${BASE}/c/session-road/patients/${ID}/`, { waitUntil: 'networkidle' });
      const r = await page.evaluate(([hmo, no]) => {
        const fr = document.querySelector('.rec-facts').getBoundingClientRect();
        const spans = [...document.querySelectorAll('.rec-facts-in > span')];
        const past = spans.map((s) => { const r = s.getBoundingClientRect(); return { t: s.textContent.trim(), over: Math.round(r.right - fr.right), under: Math.round(r.bottom - fr.bottom) }; }).filter((x) => x.over > 0 || x.under > 0);
        const hs = spans.find((s) => s.textContent.includes(hmo));
        // every character of the HMO fact inside the box: measure the text's own rects
        let outChars = 0;
        if (hs) { const rg = document.createRange(); rg.selectNodeContents(hs); for (const q of rg.getClientRects()) if (q.right > fr.right + 0.5) outChars++; }
        const txt = hs ? hs.textContent.replace(/\s+/g, ' ').trim() : '';
        return { past, outChars, whole: !!hs && txt.includes(hmo) && (!no || txt.includes(no)), lines: hs ? Math.round(hs.getBoundingClientRect().height / 22) : 0, side: document.documentElement.scrollWidth - innerWidth, factsW: Math.round(fr.width) };
      }, [hmo, no]);
      n++;
      const ok = !r.past.length && !r.outChars && r.whole && r.side <= 0;
      if (!ok) fails++;
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${scheme} ${w} "${hmo} ${no ?? ''}" box=${r.factsW} lines~${r.lines} side=${r.side}${r.past.length ? ' past=' + JSON.stringify(r.past) : ''}${r.outChars ? ' outRects=' + r.outChars : ''}`);
    }
    await ctx.close();
  }
}
psql(`update patient set hmo_name='Health Partners Dental Access', hmo_member_no='HPDA-0000-1234-5678-9' where id='${ID}'`);
console.log(`${n} cases, ${fails} failing`);
await b.close();
