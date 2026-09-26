// The workspace shell in the browser: menus, search as you type, the side
// panel, in-place tabs, the sidebar that slides in on a phone, and the two
// keyboard shortcuts (/ search, N new).
// Loaded once by src/layouts/Clinic.astro on every workspace page. It reads
// only the markup the layout and the ws components render (data-ws-* hooks,
// named so nothing else on a page matches them) and sets window.ws for pages:
//
//   ws.openPanel(id, opener?)   ws.closePanel(id)
//
// Search results are built with textContent, never innerHTML: names and
// booking notes come from people.

type SearchPatient = { id: string; name: string; chartNo: string; mobile: string | null; href: string };
type SearchBooking = { id: string; ref: string | null; patient: string; chartNo: string; when: string; service: string | null; status: string; href: string };
type SearchAnswer = { q: string; patients: SearchPatient[]; bookings: SearchBooking[]; error?: string };

declare global {
  interface Window { ws?: { openPanel: (id: string, opener?: Element | null) => void; closePanel: (id: string) => void } }
}

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
const visible = (e: HTMLElement) => e.offsetParent !== null || getComputedStyle(e).position === 'fixed';

// --- menus ------------------------------------------------------------------

const menus = $$('[data-ws-menu]');
const partsOf = (m: HTMLElement) => ({ button: m.querySelector<HTMLButtonElement>(':scope > button')!, pop: m.querySelector<HTMLElement>(':scope > .ws-menu-pop')! });
const itemsOf = (pop: HTMLElement) => $$<HTMLElement>('a[href], button:not([hidden]):not([disabled]), input:not([type="hidden"]), select, textarea', pop).filter(visible);

function closeMenu(m: HTMLElement, focusButton = false) {
  const { button, pop } = partsOf(m);
  if (pop.hidden) return;
  pop.hidden = true;
  button.setAttribute('aria-expanded', 'false');
  if (focusButton) button.focus();
}
function openMenu(m: HTMLElement, focusFirst = false) {
  menus.forEach((o) => o !== m && closeMenu(o));
  closeResults();
  const { button, pop } = partsOf(m);
  pop.hidden = false;
  button.setAttribute('aria-expanded', 'true');
  if (focusFirst) itemsOf(pop)[0]?.focus();
}
for (const m of menus) {
  const { button, pop } = partsOf(m);
  button.addEventListener('click', () => (pop.hidden ? openMenu(m) : closeMenu(m)));
  button.addEventListener('keydown', (e) => {
    // stopPropagation: the same keypress would otherwise reach the wrapper's
    // handler below and move on from item 1 to item 2.
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); openMenu(m, true); }
  });
  m.addEventListener('keydown', (e) => {
    if (pop.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(m, true); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
    const items = itemsOf(pop);
    if (!items.length) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1
      : e.key === 'ArrowDown' ? (i + 1) % items.length : (i <= 0 ? items.length - 1 : i - 1);
    items[next].focus();
  });
  // Tabbing out of an open list closes it.
  m.addEventListener('focusout', (e) => {
    const to = e.relatedTarget as Node | null;
    if (to && !m.contains(to)) closeMenu(m);
  });
}
document.addEventListener('click', (e) => {
  for (const m of menus) if (!m.contains(e.target as Node)) closeMenu(m);
});

// --- the sidebar on a phone ------------------------------------------------------
// Up to 767px the sidebar is off screen; the top bar's menu button slides it in
// from the left over a scrim. While it is open the rest of the page is inert
// (Tab stays in the sidebar, the shortcuts stop), Escape, the scrim and its ×
// close it, and focus goes back to the menu button. Wider than that it is
// simply there, and this does nothing.

const side = $('[data-ws-side]');
const sideOpener = $<HTMLButtonElement>('[data-ws-side-open]');
const sideScrim = $('[data-ws-side-scrim]');
const sideCol = $('[data-ws-col]');
const phone = matchMedia('(max-width: 767px)');
let fencedBySide = false;
const sideIsOpen = () => !!side && 'open' in side.dataset;
function openSide() {
  if (!side || !sideOpener || !phone.matches || sideIsOpen()) return;
  menus.forEach((m) => closeMenu(m));
  closeResults();
  side.dataset.open = '';
  sideOpener.setAttribute('aria-expanded', 'true');
  if (sideScrim) sideScrim.hidden = false;
  if (sideCol && !sideCol.inert) { sideCol.inert = true; fencedBySide = true; }
  document.documentElement.dataset.wsDrawer = '';
  const first = side.querySelector<HTMLElement>('.ws-nav-item[aria-current="page"]') ?? side.querySelector<HTMLElement>('.ws-nav-item');
  requestAnimationFrame(() => first?.focus());
}
function closeSide(focusBack = true) {
  if (!side || !sideIsOpen()) return;
  delete side.dataset.open;
  sideOpener?.setAttribute('aria-expanded', 'false');
  if (sideScrim) sideScrim.hidden = true;
  if (sideCol && fencedBySide) { sideCol.inert = false; fencedBySide = false; }
  delete document.documentElement.dataset.wsDrawer;
  if (focusBack) sideOpener?.focus();
}
if (side && sideOpener) {
  sideOpener.addEventListener('click', () => (sideIsOpen() ? closeSide() : openSide()));
  $('[data-ws-side-close]')?.addEventListener('click', () => closeSide());
  sideScrim?.addEventListener('click', () => closeSide());
  side.addEventListener('keydown', (e) => {
    if (!sideIsOpen()) return;
    if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); closeSide(); return; }
    if (e.key !== 'Tab') return;
    const stops = $$<HTMLElement>('a[href], button:not([hidden]):not([disabled]), input:not([type="hidden"])', side)
      .filter((x) => x.getClientRects().length > 0 && !x.closest('[hidden]'));
    if (!stops.length) return;
    const first = stops[0], last = stops[stops.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  phone.addEventListener('change', () => { if (!phone.matches) closeSide(false); });
  // Coming back to this page from the history (bfcache) never finds the sidebar left open.
  addEventListener('pageshow', (e) => { if (e.persisted) closeSide(false); });
}

// --- search -----------------------------------------------------------------

const top = $('[data-ws-top]');
const box = $('#ws-search');
const input = $<HTMLInputElement>('#ws-q');
const pop = $('#ws-results');
const toggle = $<HTMLButtonElement>('[data-ws-search-toggle]');
const said = $('[data-ws-search-said]');
const clinic = box?.dataset.clinic ?? '';
const addPatient = box?.dataset.addPatient ?? ''; // absent until the page exists (routes.ts)
const norm = (v: string) => v.trim().replace(/\s+/g, ' ');
// The rows on screen, and the text they answer. Enter and the arrows choose only
// among rows that answer what is in the field now: typing forgets the old rows at
// once, so a quick "maria sa" + Enter never opens the first "maria".
let items: HTMLAnchorElement[] = [];
let shownFor: string | null = null;
let active = -1;
let timer = 0;
let inflight: AbortController | null = null;
let pending: { q: string; done: Promise<void> } | null = null;
const cache = new Map<string, SearchAnswer>();

function closeResults() {
  if (!pop || pop.hidden) return;
  pop.hidden = true;
  input?.setAttribute('aria-expanded', 'false');
  input?.removeAttribute('aria-activedescendant');
  active = -1;
}
function showResults() {
  if (!pop || !input) return;
  menus.forEach((m) => closeMenu(m));
  pop.hidden = false;
  input.setAttribute('aria-expanded', 'true');
}
function setActive(i: number) {
  items.forEach((a, j) => a.setAttribute('aria-selected', j === i ? 'true' : 'false'));
  active = i;
  if (i >= 0 && items[i]) {
    input?.setAttribute('aria-activedescendant', items[i].id);
    items[i].scrollIntoView({ block: 'nearest' });
  } else input?.removeAttribute('aria-activedescendant');
}
function forget() {
  items.forEach((a) => a.setAttribute('aria-selected', 'false'));
  items = [];
  shownFor = null;
  active = -1;
  input?.removeAttribute('aria-activedescendant');
}
function note(text: string, link?: { label: string; href: string }) {
  if (!pop) return;
  const p = el('p', 'ws-results-note', text);
  if (link) { p.append(' '); const a = el('a', '', link.label); a.href = link.href; p.append(a); }
  pop.replaceChildren(p);
  forget();
  showResults();
}
function group(label: string, key: string, rows: { main: string; sub: string; href: string }[], listbox: HTMLElement) {
  const g = el('div');
  g.setAttribute('role', 'group');
  const head = el('p', 'meta ws-results-head', label);
  head.id = `ws-rg-${key}`;
  g.setAttribute('aria-labelledby', head.id);
  g.append(head);
  for (const r of rows) {
    const a = el('a', 'ws-result');
    a.href = r.href;
    a.id = `ws-opt-${items.length}`;
    a.setAttribute('role', 'option');
    a.setAttribute('aria-selected', 'false');
    a.tabIndex = -1;
    a.append(el('span', 'ws-result-main', r.main), el('span', 'ws-result-sub', r.sub));
    items.push(a);
    g.append(a);
  }
  listbox.append(g);
}
function render(d: SearchAnswer) {
  if (!pop) return;
  forget();
  if (d.error) return note(d.error);
  const n = d.patients.length + d.bookings.length;
  if (!n) {
    if (said) said.textContent = 'No matches.';
    return note(`Nothing matches “${d.q}”.`, addPatient ? { label: 'Add a patient', href: addPatient } : undefined);
  }
  const listbox = el('div');
  listbox.id = 'ws-listbox';
  listbox.setAttribute('role', 'listbox');
  listbox.setAttribute('aria-label', 'Search results');
  if (d.patients.length) {
    group('Patients', 'p', d.patients.map((p) => ({
      main: p.name, sub: [p.chartNo, p.mobile].filter(Boolean).join(' · '), href: p.href,
    })), listbox);
  }
  if (d.bookings.length) {
    group('Bookings', 'b', d.bookings.map((b) => ({
      main: [b.ref, b.patient].filter(Boolean).join(' · '),
      sub: [b.when, b.service, b.status].filter(Boolean).join(' · '),
      href: b.href,
    })), listbox);
  }
  pop.replaceChildren(listbox);
  shownFor = d.q;
  setActive(-1);
  showResults();
  const words = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  if (said) said.textContent = [d.patients.length && words(d.patients.length, 'patient', 'patients'), d.bookings.length && words(d.bookings.length, 'booking', 'bookings')].filter(Boolean).join(', ') + '. Arrow keys to choose.';
}
/** Search for q and draw the answer; resolves once it is drawn (or dropped because the field moved on). */
function run(q: string): Promise<void> {
  if (q.length < 2) {
    inflight?.abort();
    pending = null;
    if (document.activeElement === input) note(q.length ? 'Keep typing: two letters or more.' : 'Patients by name, chart no. or mobile; bookings by reference.');
    else closeResults();
    return Promise.resolve();
  }
  const hitCache = cache.get(q);
  if (hitCache) { inflight?.abort(); pending = null; render(hitCache); return Promise.resolve(); }
  if (pending?.q === q) return pending.done; // already asking this
  inflight?.abort();
  const ctrl = new AbortController();
  inflight = ctrl;
  const done = (async () => {
    try {
      const res = await fetch(`/api/search?clinic=${encodeURIComponent(clinic)}&q=${encodeURIComponent(q)}`, {
        signal: ctrl.signal, credentials: 'same-origin', headers: { accept: 'application/json' },
      });
      const d = (await res.json().catch(() => ({}))) as Partial<SearchAnswer>;
      if (ctrl.signal.aborted || norm(input?.value ?? '') !== q) return;
      if (res.status === 401) return note('You have been signed out.', { label: 'Sign in again', href: `/auth/login/?next=${encodeURIComponent(location.pathname)}` });
      if (!res.ok) return note(d.error ?? 'Search did not answer. Try again in a moment.');
      const answer: SearchAnswer = { q, patients: d.patients ?? [], bookings: d.bookings ?? [] };
      cache.set(q, answer);
      if (cache.size > 30) cache.delete(cache.keys().next().value as string);
      render(answer);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') note(navigator.onLine === false ? 'Offline: search needs the connection.' : 'Search did not answer. Try again in a moment.');
    } finally {
      if (inflight === ctrl) inflight = null;
      if (pending?.done === done) pending = null;
    }
  })();
  pending = { q, done };
  return done;
}
/** Enter: the chosen row, or the first, of the answer to what is in the field now; asked for first if it is not on screen yet. */
async function go() {
  if (!input) return;
  const q = norm(input.value);
  if (shownFor !== q || timer) {
    clearTimeout(timer);
    timer = 0;
    await run(q);
    if (norm(input.value) !== q || shownFor !== q) return; // typed on, or nothing to open
  }
  const to = items[active] ?? items[0];
  if (to) location.href = to.href;
}
function openSearch() {
  if (!top || !input) return;
  if (toggle && visible(toggle)) {
    top.dataset.searchOpen = '';
    toggle.setAttribute('aria-expanded', 'true');
  }
  input.focus();
  input.select();
}
function closeSearchRow() {
  if (!top || !toggle || !('searchOpen' in top.dataset)) return;
  delete top.dataset.searchOpen;
  toggle.setAttribute('aria-expanded', 'false');
}
if (input && box && pop) {
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = norm(input.value);
    if (q !== shownFor) forget(); // the rows on screen no longer answer the field
    timer = window.setTimeout(() => { timer = 0; run(q); }, q.length < 2 ? 0 : 140);
  });
  input.addEventListener('focus', () => run(norm(input.value)));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!items.length) return;
      e.preventDefault();
      if (pop.hidden) showResults();
      setActive(e.key === 'ArrowDown' ? (active + 1) % items.length : active <= 0 ? items.length - 1 : active - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.isComposing) return;
      go();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (!pop.hidden) closeResults();
      else if (input.value) input.value = '';
      else { input.blur(); closeSearchRow(); toggle?.focus(); }
    }
  });
  pop.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus in the field while a result is clicked
  box.addEventListener('focusout', (e) => {
    const to = e.relatedTarget as Node | null;
    if (!to || !box.contains(to)) {
      closeResults();
      if (!input.value) closeSearchRow();
    }
  });
  toggle?.addEventListener('click', () => {
    if (top && 'searchOpen' in top.dataset) { closeSearchRow(); closeResults(); }
    else openSearch();
  });
}

// --- side panels --------------------------------------------------------------

const openers = new WeakMap<HTMLDialogElement, Element | null>();
function openPanel(id: string, opener: Element | null = document.activeElement, auto = false) {
  const d = document.getElementById(id);
  if (!(d instanceof HTMLDialogElement) || d.open) return;
  menus.forEach((m) => closeMenu(m));
  closeResults();
  openers.set(d, opener);
  d.dispatchEvent(new CustomEvent('ws:panel-open', { detail: { opener, auto } }));
  delete d.dataset.closing;
  d.showModal();
  d.querySelector<HTMLElement>('[data-ws-title]')?.focus();
}
function closePanel(idOrDialog: string | HTMLDialogElement) {
  const d = typeof idOrDialog === 'string' ? document.getElementById(idOrDialog) : idOrDialog;
  if (!(d instanceof HTMLDialogElement) || !d.open || 'closing' in d.dataset) return;
  d.dataset.closing = '';
  let done = false;
  // Only the panel's own slide, not an animation inside it that happens to end now.
  const onEnd = (e: AnimationEvent) => { if (e.target === d) finish(); };
  const finish = () => { if (done) return; done = true; d.removeEventListener('animationend', onEnd); d.close(); };
  d.addEventListener('animationend', onEnd);
  window.setTimeout(finish, 260); // no animation event (hidden tab): close anyway
}
const focusables = (root: ParentNode) =>
  $$<HTMLElement>('a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]:not([tabindex="-1"])', root)
    .filter((e) => !(e as HTMLButtonElement).disabled && !e.closest('[hidden], [inert]') && e.getClientRects().length > 0);
for (const d of $$<HTMLDialogElement>('dialog[data-ws-panel]')) {
  d.addEventListener('cancel', (e) => { e.preventDefault(); closePanel(d); }); // Escape: close with the slide
  d.addEventListener('click', (e) => { if (e.target === d) closePanel(d); }); // the scrim
  // The page behind a modal dialog is inert already; Tab and Shift+Tab also go round the
  // panel's own controls instead of out to the browser's address bar.
  d.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const stops = focusables(d);
    if (!stops.length) { e.preventDefault(); return; }
    const first = stops[0], last = stops[stops.length - 1];
    const at = document.activeElement;
    if (e.shiftKey && (at === first || !d.contains(at) || at === d.querySelector('[data-ws-title]'))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (at === last || !d.contains(at))) { e.preventDefault(); first.focus(); }
  });
  d.addEventListener('close', () => {
    delete d.dataset.closing;
    const back = openers.get(d);
    if (back instanceof HTMLElement && back.isConnected) back.focus();
    d.dispatchEvent(new CustomEvent('ws:panel-close'));
  });
}
document.addEventListener('click', (e) => {
  const t = e.target as Element | null;
  const open = t?.closest<HTMLElement>('[data-ws-open]');
  if (open) { e.preventDefault(); openPanel(open.dataset.wsOpen!, open); return; }
  const close = t?.closest<HTMLElement>('[data-ws-close]');
  const d = close?.closest('dialog');
  if (close && d instanceof HTMLDialogElement) closePanel(d);
});
window.ws = { openPanel, closePanel };
// <SidePanel open>: a panel the server drew open (a refused form comes back inside it). `auto` in the
// event says so: its form already holds what was posted, so a page does not fill it from the opener.
for (const d of $$<HTMLDialogElement>('dialog[data-ws-panel][data-ws-open-now]')) openPanel(d.id, document.querySelector(`[data-ws-open="${d.id}"]`), true);

// --- in-place tabs --------------------------------------------------------------

for (const list of $$('[data-ws-tabs]')) {
  const tabs = $$<HTMLButtonElement>('[role="tab"]', list);
  const select = (t: HTMLButtonElement, focus = false) => {
    for (const o of tabs) {
      const on = o === t;
      o.setAttribute('aria-selected', on ? 'true' : 'false');
      o.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(o.getAttribute('aria-controls') ?? '');
      if (panel) panel.hidden = !on;
    }
    if (focus) t.focus();
    list.dispatchEvent(new CustomEvent('ws:tab', { detail: { id: t.getAttribute('aria-controls') } }));
  };
  list.addEventListener('click', (e) => {
    const t = (e.target as Element).closest<HTMLButtonElement>('[role="tab"]');
    if (t) select(t);
  });
  list.addEventListener('keydown', (e) => {
    const i = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const k = e.key;
    const next = k === 'ArrowRight' ? (i + 1) % tabs.length : k === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length
      : k === 'Home' ? 0 : k === 'End' ? tabs.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    select(tabs[next], true);
  });
}

// --- tables wider than their card ----------------------------------------------------
// A .ws-table that cannot fit its card at this width (the sidebar takes 92–244px of
// the screen, so a table tuned for the whole width can meet a narrower card) scrolls
// sideways inside itself instead of pushing the page sideways: data-ws-overflow
// (global.css). Measured again whenever its card changes width.
const tables = $$<HTMLTableElement>('table.ws-table');
if (tables.length && 'ResizeObserver' in window) {
  // Which edge has more columns behind it: data-ws-more = right · left · both, for the fade
  // and the "Scroll sideways" line in global.css.
  const edges = (t: HTMLTableElement) => {
    const more = t.hasAttribute('data-ws-overflow')
      ? [t.scrollLeft > 2 && 'left', t.scrollLeft + t.clientWidth < t.scrollWidth - 2 && 'right'].filter(Boolean)
      : [];
    const v = more.length === 2 ? 'both' : more[0] || '';
    if (v) t.setAttribute('data-ws-more', v);
    else t.removeAttribute('data-ws-more');
  };
  const fit = (t: HTMLTableElement) => {
    const box = t.parentElement;
    if (!box || t.closest('[hidden]')) return;
    const cs = getComputedStyle(box);
    const room = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    t.removeAttribute('data-ws-overflow');
    if (room > 0 && t.offsetWidth > room + 1) t.setAttribute('data-ws-overflow', '');
    edges(t);
  };
  for (const t of tables) t.addEventListener('scroll', () => edges(t), { passive: true });
  const widths = new WeakMap<Element, number>();
  const ro = new ResizeObserver((entries) => {
    for (const e of entries) {
      const w = Math.round(e.contentRect.width);
      if (widths.get(e.target) === w) continue; // only a change of width, never our own toggle
      widths.set(e.target, w);
      for (const t of tables) if (t.parentElement === e.target || t === e.target) fit(t);
    }
  });
  // Observing the card also catches a table in a hidden tab: its card goes from no width to some.
  for (const t of tables) { if (t.parentElement) ro.observe(t.parentElement); fit(t); }
}

// --- shortcuts: / search, N new ------------------------------------------------------

// Not while any panel or dialog is showing — a <SidePanel>, or a page's own (the
// Schedule's New visit is role="dialog"), or data-ws-busy on anything — and not while
// the top bar is fenced off: desk consent turns the screen to the patient and makes
// everything else inert.
const busy = () =>
  !top || top.closest('[inert]') !== null || document.querySelector('[data-ws-busy]') !== null
  || $$('dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"]').some((d) => d.getClientRects().length > 0);
document.addEventListener('keydown', (e) => {
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
  if (e.key !== '/' && e.key !== 'n' && e.key !== 'N') return;
  if (busy()) return;
  if (e.key === '/') {
    e.preventDefault();
    openSearch();
  } else if (e.key === 'n' || e.key === 'N') {
    const m = document.getElementById('ws-new')?.closest<HTMLElement>('[data-ws-menu]');
    if (!m) return;
    e.preventDefault();
    openMenu(m, true);
  }
});

export {};
