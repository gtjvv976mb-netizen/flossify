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
    for (const [vk, vp] of Object.entries(VIEWS)) {
      await page.setViewportSize(vp);
      const url = `${BASE}/c/${SLUG}/patients/${pid}/`;
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      const key = `${who}.${pk}.${vk}`;
      const R = { url, key };
      // whole page on first load
      R.pageFirst = summarise(await page.evaluate(COLLECT, 'body'));
      R.mainFirst = summarise(await page.evaluate(COLLECT, 'main'));
      // head pane (the first pane: the record's head)
      R.head = await page.evaluate(() => {
        const txt = (el) => (el.innerText || '').replace(/\s+/g, ' ').trim();
        const vis = (el) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && el.getClientRects().length > 0;
        const head = document.querySelector('.rec-actions')?.closest('.ws-pane');
        const title = document.querySelector('.ws-bar-title, .ws-bar-h1, h1');
        return {
          name: title ? txt(title) : null,
          facts: [...document.querySelectorAll('.rec-facts-in > span')].map(txt),
          back: txt(document.querySelector('.rec-back') || document.body).slice(0, 40),
          quick: [...document.querySelectorAll('.rec-actions > a, .rec-actions > button, .rec-actions [data-ws-menu] > button')].filter(vis).map((e) => ({ text: txt(e), primary: e.classList.contains('ws-btn-primary') })),
          more: [...document.querySelectorAll('#rec-more .ws-menu-item')].map((e) => ({ text: txt(e.querySelector('.ws-menu-words') || e).replace(txt(e.querySelector('.ws-menu-hint') || document.createElement('i')), '').trim(), hint: txt(e.querySelector('.ws-menu-hint') || document.createElement('i')), opens: e.getAttribute('data-ws-open'), href: e.getAttribute('href') })),
          chips: [...document.querySelectorAll('.rec-alerts > *')].map((e) => ({ text: txt(e), clickable: e.tagName === 'BUTTON', go: e.getAttribute('data-rec-go') })),
          callouts: head ? [...head.querySelectorAll('.ws-callout')].filter(vis).map(txt) : [],
          tiles: [...document.querySelectorAll('.pt-tiles .ws-tile')].filter(vis).map((e) => ({ text: txt(e), link: e.tagName === 'A' ? e.getAttribute('href') : null })),
          height: head ? Math.round(head.getBoundingClientRect().height) : null,
        };
      });
      R.headDetail = summarise(await page.evaluate((c) => { const h = document.querySelector('.rec-actions')?.closest('.ws-pane'); return h ? (0, eval)('(' + c + ')')(h) : null; }, COLLECT.toString()));
      // tabs
      R.tabs = await page.evaluate(() => {
        const out = [];
        let group = null;
        for (const el of document.querySelectorAll('.rec-nav-list > *')) {
          if (el.classList.contains('rec-nav-group')) { group = { name: el.innerText.trim(), hue: [...el.classList].find((c) => c.startsWith('hue-')) }; continue; }
          out.push({ id: el.id.replace(/^rec-rec-|-tab$/g, ''), label: el.querySelector('.rec-nav-label')?.innerText.replace(/^.*?: /, '').trim(), count: el.querySelector('.rec-nav-count')?.innerText ?? null, group: group?.name, hue: group?.hue, selected: el.getAttribute('aria-selected') });
        }
        const nav = document.querySelector('.rec-nav');
        const r = nav.getBoundingClientRect();
        return { tabs: out, navBox: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, groupsShown: [...document.querySelectorAll('.rec-nav-group')].filter((e) => e.checkVisibility()).length };
      });
      // this visit strip
      R.strip = await page.evaluate(() => {
        const s = document.getElementById('this-visit');
        if (!s) return null;
        const txt = (el) => (el.innerText || '').replace(/\s+/g, ' ').trim();
        return {
          meta: txt(s.querySelector('.ws-pane-meta') || document.createElement('i')),
          status: txt(s.querySelector('.vs-status') || document.createElement('i')),
          lines: [...s.querySelectorAll('.vs-line')].map((l) => ({ words: txt(l.querySelector('.vs-words')), tone: l.dataset.tone, actions: [...l.querySelectorAll('.vs-acts a, .vs-acts button')].map(txt) })),
          done: txt(s.querySelector('.vs-done') || document.createElement('i')),
          also: txt(s.querySelector('.vs-also') || document.createElement('i')),
          all: txt(s.querySelector('.vs-all') || document.createElement('i')),
          height: Math.round(s.getBoundingClientRect().height),
        };
      });
      R.stripDetail = summarise(await page.evaluate((c) => { const h = document.getElementById('this-visit'); return h ? (0, eval)('(' + c + ')')(h) : null; }, COLLECT.toString()));
      if (shots) await page.screenshot({ path: `${OUT}/${who}-${pk}-${vk}-00-first-load.png`, fullPage: true });
      // each section
      R.sections = {};
      let n = 0;
      for (const t of R.tabs.tabs) {
        n++;
        await page.click(`#rec-rec-${t.id}-tab`);
        await page.waitForTimeout(250);
        await page.evaluate(() => window.scrollTo(0, 0));
        const s = await page.evaluate((args) => {
          const [id, c] = args;
          const el = document.querySelector(`[data-rec-panel="${id}"]`);
          const f = (0, eval)('(' + c + ')');
          const out = f(el);
          const b = el.querySelector('.rec-banner');
          out.title = b?.querySelector('.rec-banner-title')?.innerText.trim();
          out.group = b?.querySelector('.rec-banner-group')?.innerText.trim();
          out.blurb = b?.querySelector('.rec-banner-blurb')?.innerText.trim();
          out.paneTitles = [...el.querySelectorAll('.ws-pane-title')].filter((e) => e.checkVisibility()).map((e) => e.innerText.trim());
          out.detailsSummaries = [...el.querySelectorAll('details > summary')].map((e) => ({ text: e.innerText.replace(/\s+/g, ' ').trim().slice(0, 70), open: e.parentElement.open, visible: e.checkVisibility() }));
          out.dialogsInside = [...el.querySelectorAll('dialog[data-ws-panel]')].map((d) => d.id);
          return out;
        }, [t.id, COLLECT.toString()]);
        R.sections[t.id] = summarise(s);
        if (shots) await page.screenshot({ path: `${OUT}/${who}-${pk}-${vk}-${String(n).padStart(2, '0')}-${t.id}.png`, fullPage: true });
      }
      // panels
      R.panels = await page.evaluate(() => [...document.querySelectorAll('dialog[data-ws-panel]')].map((d) => ({
        id: d.id, title: d.querySelector('.ws-panel-title')?.innerText.trim(), meta: d.querySelector('[data-ws-meta]')?.innerText.trim(),
        section: d.closest('[data-rec-panel]')?.dataset.recPanel ?? (d.closest('#this-visit') ? 'this-visit' : 'outside'),
        openers: [...document.querySelectorAll(`[data-ws-open="${d.id}"], [data-pick-open="${d.id}"]`)].map((o) => ({ text: (o.innerText || o.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 50), where: o.closest('[data-rec-panel]')?.dataset.recPanel ?? (o.closest('#this-visit') ? 'this-visit' : o.closest('#rec-more') ? 'more-menu' : o.closest('dialog') ? 'panel:' + o.closest('dialog').id : o.closest('.odo, [class*=odo]') ? 'chart-palette' : 'other') })),
      })));
      // open each panel to count what is inside
      let pshot = 0;
      for (const p of R.panels) {
        if (p.section !== 'outside' && p.section !== 'this-visit') { await page.click(`#rec-rec-${p.section}-tab`); await page.waitForTimeout(150); }
        if (shots && (p.id.startsWith('rec-visit-') ? pshot++ < 2 : true) && vk && true) {
          await page.evaluate((id) => window.ws?.openPanel(id, null), p.id); await page.waitForTimeout(300);
          await page.screenshot({ path: `${OUT}/${who}-${pk}-${vk}-panel-${p.id.replace(/^rec-/, '').slice(0, 24)}.png` });
          await page.evaluate((id) => window.ws?.closePanel(id), p.id); await page.waitForTimeout(150);
        }
        const inside = await page.evaluate(async (args) => {
          const [id, c] = args;
          const d = document.getElementById(id);
          window.ws?.openPanel(id, null);
          await new Promise((r) => setTimeout(r, 200));
          const out = (0, eval)('(' + c + ')')(d, { inDialog: true });
          window.ws?.closePanel(id);
          await new Promise((r) => setTimeout(r, 120));
          return out;
        }, [p.id, COLLECT.toString()]);
        const s = summarise(inside);
        p.visible = s.visible; p.hidden = s.hidden; p.words = s.words; p.fields = s.fieldsVisible; p.fieldsHidden = s.fieldsHidden; p.chips = s.chips.length;
        p.buttonTexts = s.items.filter((i) => i.visible && i.kind !== 'text-link').map((i) => (i.teal ? '[teal] ' : '') + i.text);
      }
      if (shots) {
        // the More menu open, and the chart's palette on a tooth
        await page.click('#rec-rec-overview-tab'); await page.evaluate(() => window.scrollTo(0, 0));
        const more = page.locator('[data-ws-menu]:has(#rec-more) > button');
        if (await more.count()) { await more.click(); await page.waitForTimeout(200); await page.screenshot({ path: `${OUT}/${who}-${pk}-${vk}-menu-more-open.png` }); await page.keyboard.press('Escape'); }
        await page.click('#rec-rec-chart-tab'); await page.waitForTimeout(200);
        const tooth = page.locator('[data-rec-panel="chart"] button[aria-label^="Tooth 26"], [data-rec-panel="chart"] button:has-text("26")').first();
        try { await tooth.click({ timeout: 2000 }); await page.waitForTimeout(300); R.paletteOpen = await page.evaluate(() => [...document.querySelectorAll('[data-rec-panel="chart"] button')].filter((b) => b.checkVisibility() && !/^Tooth \d/.test(b.getAttribute('aria-label') || '')).map((b) => (b.innerText || b.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim())); await page.screenshot({ path: `${OUT}/${who}-${pk}-${vk}-chart-palette-open.png`, fullPage: true }); } catch (e) { R.paletteOpen = 'failed: ' + e.message.slice(0, 80); }
      }
      result[key] = R;
      console.log('done', key);
    }
  }
  await ctx.close();
}
await browser.close();
fs.writeFileSync(`${OUT}/inventory${only ? '-' + only : ''}.json`, JSON.stringify(result, null, 1));
console.log('wrote');
