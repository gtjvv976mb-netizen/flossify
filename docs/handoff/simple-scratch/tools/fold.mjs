import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const BASE=`http://127.0.0.1:${process.env.PORT_ || 4470}`;
const P={maria:'1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', ledger:'9ea415bd-4b9e-4725-80e8-391464e2c12e'};
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const ctx=await b.newContext({viewport:{width:1440,height:900}});
const page=await ctx.newPage();
await page.goto(BASE+'/auth/login/?any=1'); await page.fill('#email','liwayway.domingo@example.com'); await page.fill('#password','flossify');
await Promise.all([page.waitForNavigation(), page.click('[data-go]')]);
for (const [k,id] of Object.entries(P)) for (const vp of [[1440,900],[1366,768],[390,844]]) {
  await page.setViewportSize({width:vp[0],height:vp[1]});
  await page.goto(`${BASE}/c/session-road/patients/${id}/`,{waitUntil:'networkidle'});
  const r=await page.evaluate(()=>{
    const y=(s)=>{const e=document.querySelector(s); if(!e) return null; const r=e.getBoundingClientRect(); return Math.round(r.top+scrollY);};
    const tabs=[...document.querySelectorAll('.rec-nav-item')]; const vw=innerWidth;
    const nav=document.querySelector('.rec-nav-list'); const nr=nav.getBoundingClientRect();
    const inView=tabs.filter(t=>{const r=t.getBoundingClientRect(); return r.left>=nr.left-1 && r.right<=nr.right+1 && r.left>=0 && r.right<=vw;}).length;
    const firstSec = document.querySelector('[data-rec-panel]:not([hidden]) .ws-pane:not(.rec-banner)');
    return {headTop:y('.rec-who'), headBottom: (()=>{const h=document.querySelector('.rec-actions').closest('.ws-pane').getBoundingClientRect(); return Math.round(h.bottom+scrollY)})(), navTop:y('.rec-nav'), stripTop:y('#this-visit'), stripBottom:(()=>{const s=document.getElementById('this-visit'); if(!s) return null; const r=s.getBoundingClientRect(); return Math.round(r.bottom+scrollY)})(), bannerTop:y('[data-rec-panel]:not([hidden]) .rec-banner'), firstCardTop: firstSec? Math.round(firstSec.getBoundingClientRect().top+scrollY):null, tabsInView:inView, tabsTotal:tabs.length, navScrollW:nav.scrollWidth, navClientW:nav.clientWidth, docH:document.documentElement.scrollHeight, vh:innerHeight};
  });
  console.log(k, vp.join('x'), JSON.stringify(r));
}
await b.close();
