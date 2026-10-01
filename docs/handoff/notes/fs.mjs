import { chromium } from '/home/user/flossify/node_modules/playwright/index.mjs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage();
await p.setContent(`<style>
.tp { container: tp / inline-size; min-width:0; margin:0; padding:0; border:0; }
.m { display:grid; grid-template-columns: max-content; gap: 12px; }
@container tp (width >= 400px) { .m { grid-template-columns: repeat(2, max-content); } }
.b { width:188px; height:20px; background:red }
</style>
<form style="display:grid;width:432px"><fieldset class="tp"><legend>x</legend><div class="m"><div class="b"></div><div class="b"></div></div></fieldset></form>
<div id=pop popover style="width:320px">
<button id=a data-ws-open="x">a</button></div>
<dialog id=d><p>hi</p></dialog>`);
const r = await p.evaluate(() => [...document.querySelectorAll('.b')].map(e => e.getBoundingClientRect().left + ',' + e.getBoundingClientRect().top));
console.log('fieldset cq', r);
// does showModal close popover?
const s = await p.evaluate(() => { const pop = document.getElementById('pop'); pop.showPopover(); document.getElementById('d').showModal(); return pop.matches(':popover-open'); });
console.log('popover open after showModal', s);
await b.close();
