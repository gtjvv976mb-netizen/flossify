// Inventory of the patient record: tabs, sections, buttons, chips, cards, panels.
import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
import fs from 'node:fs';

const BASE = `http://127.0.0.1:${process.env.PORT_ || 4470}`;
const OUT = process.env.OUT_ || '/tmp/fl-simple-scratch/baseline';
const SLUG = 'session-road';
const PATIENTS = { maria: '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', ledger: '9ea415bd-4b9e-4725-80e8-391464e2c12e' };
const USERS = { owner: 'liwayway.domingo@example.com', dentist: 'hazel.tabanao@example.com' };
const VIEWS = { w1440: { width: 1440, height: 900 }, w390: { width: 390, height: 844 } };
const only = process.argv[2]; // e.g. owner
const shots = process.argv.includes('--shots');

// Runs in the page: describes interactive things inside a root.
const COLLECT = (rootSel, opts = {}) => {
  const root = typeof rootSel === 'string' ? document.querySelector(rootSel) : rootSel;
  if (!root) return null;
  const vis = (el) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && el.getClientRects().length > 0;
  const txt = (el) => (el.innerText || el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
  const label = (el) => {
    let t = txt(el);
    if (!t) t = el.getAttribute('aria-label') || el.getAttribute('title') || '';
    return t.slice(0, 90);
  };
  const isTeal = (el) => {
    const cs = getComputedStyle(el);
    const bg = cs.backgroundColor;
    return el.classList.contains('ws-btn-primary') || /rgb\(14, 116, 113\)|rgb\(13, 112, 109\)|rgb\(11, 93, 91\)/.test(bg);
  };
  const excludeDialog = !opts.inDialog;
  const inDlg = (el) => excludeDialog && !!el.closest('dialog');
  // "button-like": buttons, summaries, role=button, and links drawn as buttons / tiles / menu items / go-links
  const BTNLIKE_A = /(^|\s)(ws-btn|ws-menu-item|ws-tile-link|ws-seg-item|rec-chip-go|trec-date-go|vs-go|ws-empty-go|entry-go|tl-filter|ws-pill)(\s|$)|-go(\s|$)|btn/;
  const all = [...root.querySelectorAll('button, summary, [role="button"], a[href], input[type="submit"], input[type="button"]')].filter((el) => !inDlg(el));
  const items = all.map((el) => {
    const tag = el.tagName.toLowerCase();
    const cls = el.className && typeof el.className === 'string' ? el.className : '';
    let kind;
    if (tag === 'button' || tag === 'input') kind = el.getAttribute('role') === 'tab' ? 'tab' : 'button';
    else if (tag === 'summary') kind = 'disclosure';
    else if (tag === 'a' && (BTNLIKE_A.test(cls) || el.hasAttribute('data-ws-open'))) kind = 'link-button';
    else if (tag === 'a') kind = 'text-link';
    else kind = 'button';
    const v = vis(el);
    let why = null;
    if (!v) {
      if (el.closest('.ws-menu-pop[hidden]')) why = 'menu';
      else if (el.closest('details:not([open])')) why = 'details';
      else if (el.closest('[hidden]')) why = 'hidden-attr';
      else why = 'css';
    }
    const opens = el.getAttribute('data-ws-open') || el.getAttribute('data-pick-open') || null;
    const go = el.getAttribute('data-rec-go') || null;
    const menuToggle = !!el.closest('[data-ws-menu]') && el.hasAttribute('aria-expanded');
    const tooth = !!el.closest('.odo, [data-odo], .tooth, .tp-grid') || /tooth|odo/.test(cls);
    return { tag, kind, cls: cls.slice(0, 80), text: label(el), visible: v, why, teal: v ? isTeal(el) : el.classList.contains('ws-btn-primary'), opens, go, menuToggle, tooth,
      submit: tag === 'button' && (el.getAttribute('type') || 'submit') === 'submit', href: tag === 'a' ? el.getAttribute('href') : null };
  });
  // chips / pills
  const chipSel = '.ws-chip, .rp, .rk, .pt-ref, .ws-pill';
  const chips = [...root.querySelectorAll(chipSel)].filter((el) => !inDlg(el) && !el.parentElement.closest(chipSel));
  const chipsVis = chips.filter(vis).map((el) => ({ cls: [...el.classList].filter((c) => /^(ws-chip|rp|rk|pt-ref|ws-pill|ws-tint-|rp-)/.test(c)).join(' '), text: txt(el).slice(0, 70) }));
  const chipsHidden = chips.filter((el) => !vis(el)).length;
  // cards
  const cardSel = '.ws-pane, .ws-tile, .nt-card, .rx-card, .fl-card, .pk-card, .rf, .lo-item, .ws-callout, .ws-empty, .rec-banner, .trec-detail';
  const cards = [...root.querySelectorAll(cardSel)].filter((el) => !inDlg(el) && vis(el));
  const cardList = cards.map((el) => {
    const c = [...el.classList].find((x) => cardSel.includes('.' + x + ',') || cardSel.endsWith('.' + x)) || el.className;
    const h = el.querySelector('.ws-pane-title, .rec-banner-title, h2, h3, .meta, .rf-k');
    return { cls: c, title: h ? txt(h).slice(0, 60) : txt(el).slice(0, 40), h: Math.round(el.getBoundingClientRect().height) };
  });
  const words = (root.innerText || '').split(/\s+/).filter(Boolean).length;
  const r = root.getBoundingClientRect();
  // fields
  const fields = [...root.querySelectorAll('input:not([type=hidden]), select, textarea')].filter((el) => !inDlg(el));
  return {
    height: Math.round(r.height), docHeight: document.documentElement.scrollHeight, words,
    items, chips: chipsVis, chipsHidden, cards: cardList,
    fieldsVisible: fields.filter(vis).length, fieldsHidden: fields.filter((e) => !vis(e)).length,
  };
};

async function login(browser, email) {
  const ctx = await browser.newContext({ viewport: VIEWS.w1440 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/auth/login/?any=1`);
  await page.fill('#email', email);
  await page.fill('#password', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('[data-go]')]);
  return ctx;
}

const summarise = (x) => {
  if (!x) return x;
  const v = x.items.filter((i) => i.visible);
  const h = x.items.filter((i) => !i.visible);
  const count = (arr, k) => arr.filter((i) => i.kind === k).length;
  return {
    ...x,
    visible: { buttons: count(v, 'button'), linkButtons: count(v, 'link-button'), disclosures: count(v, 'disclosure'), textLinks: count(v, 'text-link'), tabs: count(v, 'tab'), teal: v.filter((i) => i.teal).length, opensPanel: v.filter((i) => i.opens).length, toothButtons: v.filter((i) => i.tooth).length },
    hidden: { total: h.length, byWhy: h.reduce((m, i) => ((m[i.why] = (m[i.why] || 0) + 1), m), {}), buttonsAndLinkButtons: h.filter((i) => i.kind !== 'text-link').length },
  };
};


const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const result = {};
for (const [who, email] of Object.entries(USERS)) {
  if (only && only !== who) continue;
  const ctx = await login(browser, email);
  const page = await ctx.newPage();
  for (const [pk, pid] of Object.entries(PATIENTS)) {
    const vk = 'w1440';
    await page.setViewportSize(VIEWS[vk]);
    const url = `${BASE}/c/${SLUG}/patients/${pid}/`;
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    const ids = await page.evaluate(() => [...document.querySelectorAll('dialog[data-ws-panel]')].map((d) => ({ id: d.id, section: d.closest('[data-rec-panel]')?.dataset.recPanel ?? 'outside' })));
    const out = [];
    let vshots = 0;
    for (const { id, section } of ids) {
      if (section !== 'outside') { await page.click(`#rec-rec-${section}-tab`); await page.waitForTimeout(150); }
      await page.evaluate((id) => window.ws.openPanel(id, null), id);
      await page.waitForFunction((id) => { const d = document.getElementById(id); return d.open && d.checkVisibility(); }, id, { timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(450);
      const r = summarise(await page.evaluate((args) => { const [id, c] = args; return (0, eval)('(' + c + ')')(document.getElementById(id), { inDialog: true }); }, [id, COLLECT.toString()]));
      const meta = await page.evaluate((id) => { const d = document.getElementById(id); const b = d.querySelector('.ws-panel-body'); return { title: d.querySelector('.ws-panel-title')?.innerText.trim(), meta: d.querySelector('[data-ws-meta]')?.innerText.trim(), bodyScroll: b ? b.scrollHeight : null, secs: [...d.querySelectorAll('.vx-h, h3, legend')].filter((e) => e.checkVisibility()).map((e) => e.innerText.trim()).slice(0, 20),
        openers: [...document.querySelectorAll(`[data-ws-open="${id}"], [data-pick-open="${id}"]`)].map((o) => ({ text: (o.innerText || o.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 50), where: o.closest('[data-rec-panel]')?.dataset.recPanel ?? (o.closest('#this-visit') ? 'this-visit' : o.closest('#rec-more') ? 'more-menu' : o.closest('dialog') ? 'panel:' + o.closest('dialog').id : 'head') })) }; }, id);
      if (shots && (!id.startsWith('rec-visit-') || vshots++ < 3)) await page.screenshot({ path: `${OUT}/${who}-${pk}-${vk}-panel-${id.replace(/^rec-/, '').slice(0, 24)}.png` });
      await page.evaluate((id) => window.ws.closePanel(id), id);
      await page.waitForFunction((id) => !document.getElementById(id).open, id, { timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(350);
      out.push({ id, section, ...meta, visible: r.visible, hidden: r.hidden, words: r.words, fields: r.fieldsVisible, fieldsHidden: r.fieldsHidden, chips: r.chips.length,
        buttons: r.items.filter((i) => i.visible && i.kind !== 'text-link').map((i) => (i.teal ? '[teal] ' : '') + (i.kind === 'disclosure' ? '[summary] ' : '') + i.text),
        links: r.items.filter((i) => i.visible && i.kind === 'text-link').map((i) => i.text) });
    }
    result[`${who}.${pk}`] = out;
    console.log('done', who, pk, out.length);
  }
  await ctx.close();
}
await browser.close();
fs.writeFileSync(`${OUT}/panels${only ? '-' + only : ''}.json`, JSON.stringify(result, null, 1));
console.log('wrote');
