// Records the home page's two "How to register" walkthroughs (public/video/
// register-clinic.mp4 and register-patient.mp4) from the real product, with
// sample data and a caption bar naming each step. Needs a dev server with a
// seeded scratch database and no demo banners, e.g.:
//   DATABASE_URL=postgres://flossify_app:flossify_dev@localhost:5432/flossify_t_home \
//   SESSION_SECRET=... SHOW_DEMO_LOGINS=0 npx astro dev --port 4520
// then: node scripts/record-walkthroughs.mjs <out-dir> clinic|patient
// and encode the .webm with ffmpeg (H.264, crf 27, faststart) into public/video/.
import { chromium } from 'playwright';
const B = process.env.REC_BASE || 'http://localhost:4520', OUT = process.argv[2], which = process.argv[3];
const cap = () => {
  const draw = () => {
    const t = sessionStorage.getItem('__cap'); if (!t) return;
    let el = document.getElementById('__cap');
    if (!el) {
      el = document.createElement('div'); el.id = '__cap';
      Object.assign(el.style, { position: 'fixed', left: '28px', bottom: '28px', zIndex: '2147483647', padding: '14px 22px 14px 14px', background: '#ffffff', color: '#1f2937', borderRadius: '14px', boxShadow: '0 10px 30px rgb(16 24 40 / 0.16)', border: '1px solid #e6e9ee', font: '600 24px/1.2 Inter, system-ui, sans-serif', letterSpacing: '-0.01em', display: 'flex', gap: '14px', alignItems: 'center', pointerEvents: 'none' });
      document.documentElement.appendChild(el);
    }
    const [n, ...rest] = t.split('|');
    el.innerHTML = '';
    const a = document.createElement('span'); a.textContent = n; Object.assign(a.style, { font: '600 16px/1 Inter, system-ui, sans-serif', color: '#0f7776', background: '#e8f6f5', borderRadius: '999px', padding: '7px 11px' });
    const b = document.createElement('span'); b.textContent = rest.join('|');
    el.append(a, b);
  };
  window.__cap = (t) => { sessionStorage.setItem('__cap', t); draw(); };
  const st = document.createElement('style'); st.textContent = 'astro-dev-toolbar{display:none!important}';
  document.addEventListener('DOMContentLoaded', () => { document.head.append(st); draw(); });
};
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: OUT, size: { width: 1280, height: 720 } } });
await ctx.addInitScript(cap);
const p = await ctx.newPage(); p.setDefaultTimeout(20000);
await p.route('**/video/tour-*.mp4', (r) => r.continue({ url: `${B}/video/tour-test.webm` }));
const say = (t) => p.evaluate((t) => window.__cap(t), t);
const type = async (sel, text) => { await p.click(sel); await p.type(sel, text, { delay: 45 }); await p.waitForTimeout(250); };
try {
  if (which === 'clinic') {
    await p.goto(`${B}/`, { waitUntil: 'load' }); await say('01|Open your clinic in the web'); await p.waitForTimeout(2600);
    await p.getByRole('link', { name: 'Open your clinic in the web' }).first().hover(); await p.waitForTimeout(700);
    await p.getByRole('link', { name: 'Open your clinic in the web' }).first().click(); await p.waitForLoadState('load');
    await say('02|Name the clinic, then yourself'); await p.waitForTimeout(1200);
    await type('input[name=name]', 'Pines Dental Studio');
    await p.selectOption('select[name=area]', { index: 0 }); await p.waitForTimeout(300);
    await type('input[name=address]', '12 Leonard Wood Road');
    await type('input[name=phone]', '0917 555 0199');
    await type('input[name=owner_name]', 'Dr. Aurora Balanay');
    await type('input[name=owner_phone]', '0917 555 7001');
    await type('input[name=owner_email]', 'aurora.balanay@example.com');
    await type('input[name=password]', 'pines are tall trees');
    await type('input[name=confirm]', 'pines are tall trees');
    await p.check('input[name=consent]'); await p.waitForTimeout(600);
    await p.getByRole('button', { name: /Open my clinic/ }).click(); await p.waitForLoadState('load'); await p.waitForTimeout(800);
    await say('03|Set your hours and fees'); await p.waitForTimeout(2200);
    await p.mouse.wheel(0, 700); await p.waitForTimeout(1600); await p.mouse.wheel(0, 700); await p.waitForTimeout(1600);
    const slug = new URL(p.url()).pathname.split('/')[2];
    await p.locator('.set-toc-item[data-set-toc-item=fees]').hover(); await p.waitForTimeout(500);
    await p.locator('.set-toc-item[data-set-toc-item=fees]').click(); await p.waitForTimeout(2800);
    await p.goto(`${B}/c/${slug}/`, { waitUntil: 'load' }); await say('04|Your Dashboard is ready'); await p.waitForTimeout(3200);
  } else {
    await p.goto(`${B}/`, { waitUntil: 'load' }); await say('01|Tap “I’m a Patient”'); await p.waitForTimeout(2600);
    await p.getByRole('link', { name: 'I’m a Patient' }).first().hover(); await p.waitForTimeout(700);
    await p.getByRole('link', { name: 'I’m a Patient' }).first().click(); await p.waitForLoadState('load');
    await say('02|Choose a clinic'); await p.waitForTimeout(1800);
    await p.mouse.wheel(0, 500); await p.waitForTimeout(1400);
    const book = p.locator('li[data-slug="session-road"] [data-book]');
    await book.scrollIntoViewIfNeeded(); await p.waitForTimeout(700); await book.click(); await p.waitForLoadState('load');
    await say('03|Pick a service and a time'); await p.waitForTimeout(1500);
    await p.locator('label.chip-radio', { hasText: 'Not sure' }).first().click(); await p.waitForTimeout(700);
    await p.click('[data-next]'); await p.waitForTimeout(1300);
    await p.click('[data-next]'); await p.waitForTimeout(1500);
    await p.locator('label.slot-radio').first().click(); await p.waitForTimeout(900);
    await p.click('[data-next]'); await p.waitForTimeout(1000);
    await say('04|Your name and mobile, and it is booked');
    await type('input[name=name]', 'Mila Santos');
    await type('input[name=phone]', '0917 555 0377');
    await p.check('input[name=consent]'); await p.waitForTimeout(600);
    await p.click('[data-next]'); await p.waitForTimeout(1600);
    await p.click('[data-next]'); await p.waitForTimeout(3500);
  }
} finally {
  const v = p.video(); await ctx.close(); console.log(await v.path()); await b.close();
}
