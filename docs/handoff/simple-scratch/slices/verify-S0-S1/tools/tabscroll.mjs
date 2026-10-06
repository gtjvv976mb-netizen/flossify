import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const BASE=`http://127.0.0.1:${process.env.PORT_ || 4470}`;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const ctx=await b.newContext({viewport:{width:1440,height:900}});
const page=await ctx.newPage();
await page.goto(BASE+'/auth/login/?any=1'); await page.fill('#email','liwayway.domingo@example.com'); await page.fill('#password','flossify');
await Promise.all([page.waitForNavigation(), page.click('[data-go]')]);
for (const vp of [[1440,900],[390,844]]) {
  await page.setViewportSize({width:vp[0],height:vp[1]});
  await page.goto(`${BASE}/c/session-road/patients/1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb/`,{waitUntil:'networkidle'});
  await page.click('#rec-rec-notes-tab'); await page.waitForTimeout(600);
  const r = await page.evaluate(()=>({scrollY:Math.round(scrollY), bannerTopInViewport: Math.round(document.querySelector('#rec-notes .rec-banner').getBoundingClientRect().top), stickyNav: getComputedStyle(document.querySelector('.rec-nav')).position}));
  console.log(vp.join('x'), JSON.stringify(r));
}
await b.close();
