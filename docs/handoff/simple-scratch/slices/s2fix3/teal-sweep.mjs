// One teal button per screen, measured continuously: every tab of the record, scrolled 40px at a time from the top to
// the foot; at each stop, the teal controls (ws-btn-primary or the teal fill) with any part on screen, outside dialogs.
//   node teal-sweep.mjs <out.json>   env WHO_=owner,dentist  PAT_=maria,rich,ledger,teal,stale  SCHEMES_=light,dark
import { browser, login, rec, P } from '/tmp/fl-simple-scratch/verify-S2/r3/lib.mjs';
import { writeFileSync } from 'node:fs';
P.teal = '7e57a1c0-0000-4000-8000-0000000000f1';
P.stale = '684ab095-f878-4d09-994e-4adcb141edf2';
const OUT = process.argv[2];
const WHO = (process.env.WHO_ || 'owner,dentist').split(',');
const PAT = (process.env.PAT_ || 'maria,rich,ledger,teal,stale').split(',');
const SCHEMES = (process.env.SCHEMES_ || 'light').split(',');
const VWS = [{ width: 1440, height: 900 }, { width: 1366, height: 768 }, { width: 390, height: 844 }];
const b = await browser();
const out = [];
let worst = 0;
for (const who of WHO) for (const scheme of SCHEMES) for (const vw of VWS) {
  const { ctx, page } = await login(b, who, { viewport: vw, colorScheme: scheme });
  for (const pat of PAT) {
    await page.goto('about:blank');
    await page.goto(rec(pat), { waitUntil: 'load' }); await page.waitForTimeout(500);
    const tabs = await page.evaluate(() => [...document.querySelectorAll('[role=tab][id^=rec-rec-]')].map((t) => t.id));
    for (const tab of tabs) {
      await page.evaluate((id) => { document.getElementById(id).click(); window.scrollTo(0, 0); }, tab);
      await page.waitForTimeout(250);
      const r = await page.evaluate(async () => {
        const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
        const TEAL = /rgb\(14, 116, 113\)|rgb\(13, 112, 109\)|rgb\(11, 93, 91\)/;
        const isTeal = (el) => el.classList.contains('ws-btn-primary') || TEAL.test(getComputedStyle(el).backgroundColor);
        const vis = (el) => { if (!el.getClientRects().length) return false; const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.opacity !== '0'; };
        const all = [...document.querySelectorAll('a, button, summary, [role=button], input[type=submit]')].filter((el) => !el.closest('dialog') && isTeal(el));
        const H = document.documentElement.scrollHeight;
        let max = 0, at = null; const seen = new Set();
        for (let y = 0; y <= H; y += 40) {
          window.scrollTo(0, y); await sleep(15);
          const now = all.filter((el) => { if (!vis(el)) return false; const rc = el.getBoundingClientRect(); return rc.bottom > 0 && rc.top < innerHeight && rc.width > 0 && rc.height > 0; });
          now.forEach((el) => seen.add((el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30)));
          if (now.length > max) { max = now.length; at = { y: Math.round(scrollY), which: now.map((e) => `${(e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30)} @${Math.round(e.getBoundingClientRect().top)}`) }; }
          if (scrollY + innerHeight >= H) break;
        }
        return { H, max, at, teal: [...seen] };
      });
      worst = Math.max(worst, r.max);
      out.push({ who, scheme, vw: `${vw.width}x${vw.height}`, pat, tab: tab.replace(/^rec-rec-|-tab$/g, ''), ...r });
      console.log(`${r.max > 1 ? 'FAIL' : 'ok  '} ${who} ${scheme} ${vw.width} ${pat.padEnd(6)} ${tab.replace(/^rec-rec-|-tab$/g, '').padEnd(16)} max ${r.max}${r.max > 1 ? ' ' + JSON.stringify(r.at) : ''}  teal: ${r.teal.join(' | ')}`);
    }
  }
  await ctx.close();
}
await b.close();
writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(`${out.filter((r) => r.max > 1).length} screens with more than one teal, of ${out.length} tab sweeps; worst ${worst}`);
