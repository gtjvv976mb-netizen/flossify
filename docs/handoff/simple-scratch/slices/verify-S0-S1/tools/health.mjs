import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const BASE=`http://127.0.0.1:${process.env.PORT_ || 4470}`;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const ctx=await b.newContext({viewport:{width:1440,height:900}});
const page=await ctx.newPage();
await page.goto(BASE+'/auth/login/?any=1'); await page.fill('#email','liwayway.domingo@example.com'); await page.fill('#password','flossify');
await Promise.all([page.waitForNavigation(), page.click('[data-go]')]);
await page.goto(`${BASE}/c/session-road/patients/1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb/#health`,{waitUntil:'networkidle'});
for (const s of ['health','consent','chart']) {
  await page.click(`#rec-rec-${s}-tab`); await page.waitForTimeout(200);
  const r = await page.evaluate((s)=>{ const el=document.querySelector(`[data-rec-panel="${s}"]`);
    const inputs=[...el.querySelectorAll('input:not([type=hidden]),select,textarea')].filter(i=>!i.closest('dialog'));
    return inputs.map(i=>{ const lab=i.closest('label')||document.querySelector(`label[for="${i.id}"]`); const target = lab && lab.checkVisibility() ? lab : i; const r=target.getBoundingClientRect(); return `${i.type}:${(lab?lab.innerText:i.name||'').replace(/\s+/g,' ').trim().slice(0,30)}${target.checkVisibility()&&r.width>0?'':' (not shown)'}`; });
  }, s);
  console.log(s, r.length, r.join(' | '));
}
await b.close();
