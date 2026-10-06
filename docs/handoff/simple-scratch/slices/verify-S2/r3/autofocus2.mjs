import { browser, login, rec } from './lib.mjs';
const b = await browser();
const { ctx, page } = await login(b, 'owner');
await ctx.addInitScript(() => {
  window.__log = [];
  document.addEventListener('focusin', (e) => window.__log.push('in ' + (e.target.id || e.target.tagName) + ' ' + Math.round(performance.now())), true);
  document.addEventListener('focusout', (e) => window.__log.push('out ' + (e.target.id || e.target.tagName) + ' ' + Math.round(performance.now()) + ' ' + new Error().stack.split('\n').slice(2, 5).join(' | ')), true);
  const f = HTMLElement.prototype.blur; HTMLElement.prototype.blur = function () { window.__log.push('blur() ' + (this.id || this.tagName) + new Error().stack.split('\n').slice(1, 4).join(' | ')); return f.call(this); };
});
const panel = 'rec-vitals-add';
await page.goto(rec('maria', '#patient'), { waitUntil: 'load' }); await page.waitForTimeout(300);
await page.evaluate((id) => window.ws.openPanel(id, null), panel); await page.waitForTimeout(400);
await page.evaluate((panel) => { const f = document.querySelector(`#${panel} form`); f.noValidate = true; f.querySelectorAll('input').forEach((i) => { if (['sys', 'dia', 'pulse'].includes(i.name)) i.value = ''; }); }, panel);
await Promise.all([page.waitForNavigation(), page.evaluate((panel) => document.querySelector(`#${panel} form`).requestSubmit(), panel)]);
await page.waitForTimeout(800);
console.log(await page.evaluate(() => window.__log.join('\n')));
console.log('active', await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName), 'hasFocus', await page.evaluate(() => document.hasFocus()));
await b.close();
