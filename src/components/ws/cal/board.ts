// The Dashboard in the browser: the calendar, the website's lane, the summary
// strip, and the wiring to the panels (panels.ts) and the patients list
// (patients.ts). It starts from the JSON the page wrote (data-dash-boot) and
// draws everything from that; every change is one call to /api/schedule and
// the card is redrawn from the server's answer, never from a guess — except
// while a dragged card waits for that answer, and a refusal puts it back.
//
// Moving to another day or week asks GET /api/schedule for that range and
// writes the URL (history), so Back works and a reload lands on the same view.
// Keyboard: ← → move the day (the selected day in a week), ↑ ↓ move between
// cards, Enter opens the one in focus, Escape closes the panel (the shell).
// Nothing here binds / or N: the shell owns those.
//
// Everything a person typed (names, notes, reasons) goes in with textContent.
import * as M from './model';
import type { Card, PackedPts, Service, StaffDay } from './model';
import { initPanels, type Panels } from './panels';
import { initPatients, type PatientsList, type Pt } from './patients';
import { avatar, callout, icon } from './ui';

export interface Boot {
  slug: string; csrf: string; today: string; date: string; view: 'day' | 'week'; by: 'chair' | 'dentist'; dentist: string;
  me: { id: string; name: string; dentist: boolean };
  finance: boolean;
  /** May add and import patients here (can_edit_records); the links to those pages show only then. */
  canEdit: boolean;
  chairs: number; hours: Record<number, [number, number] | null>; staff: StaffDay[]; catalog: Service[];
  next: Record<string, string[]>;
  cards: Card[]; todayCards: Card[]; toPlace: Card[]; toConfirm: Card[];
  /** Every patient, packed (model.ts, PT_KEYS); patients.ts unpacks it. */
  patients: PackedPts;
  links: { record: string; charge: string; messages: string; addPatient: string; importPatients: string };
  open: { new: boolean; patient: string | null; booking: string | null };
  pf: string; pq: string;
}
export type Reply = { ok: true; card: Card; texted: boolean } | { ok: false; error: string; status?: number };

/** What the panels and the patients list share with the calendar. */
export interface Ctx {
  boot: Boot;
  el: <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => HTMLElementTagNameMap[K];
  call: (method: 'POST' | 'PATCH', body: Record<string, unknown>) => Promise<Reply>;
  /** Take the server's word for a visit and redraw everything it touches. */
  absorb: (c: Card) => void;
  card: (id: string) => Card | undefined;
  /** Cards on a given Manila day that the page has (for "next free"), or null when that day is not loaded. */
  dayCards: (ymd: string) => Card[] | null;
  staffById: Map<string, StaffDay>;
  say: (text: string, go?: { label: string; ymd: string; id?: string }) => void;
  fail: (text: string) => void;
  /** Show a day (or week) of the calendar and, optionally, open a visit on it. */
  show: (ymd: string, openId?: string) => Promise<void>;
  flash: (id: string) => void;
  filter: () => string;
  setWhose: (whose: 'mine' | 'all') => void;
  url: () => string;
  panels: Panels;
  patients: PatientsList;
}

const OFFLINE = 'Could not reach the clinic. Nothing was saved; try again.';
/** Pixels per minute: a day is tall enough for three lines in 30 minutes and five in 45, a week for two in 30. */
const MPX = { day: 2.2, week: 2 } as const;
/** A card's line (its words and the gap under them) and what its padding and border take, in pixels (cal.css). */
const LINE = 17, CARD_PAD = 10;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const bootEl = document.querySelector<HTMLScriptElement>('script[data-dash-boot]');
const root = document.querySelector<HTMLElement>('[data-dash]');
if (bootEl && root) {
  let boot: Boot | null = null;
  try { boot = JSON.parse(bootEl.textContent || 'null'); } catch { boot = null; }
  if (boot) start(boot);
}

function start(boot: Boot) {
  const $ = <T extends Element = HTMLElement>(sel: string, from: ParentNode = document) => from.querySelector<T>(sel);
  const $$ = <T extends Element = HTMLElement>(sel: string, from: ParentNode = document) => [...from.querySelectorAll<T>(sel)];
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
    const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n;
  };
  const me = boot.me;
  const staffById = new Map(boot.staff.map((s) => [s.id, s]));

  // --- state ---------------------------------------------------------------------------------
  type View = 'day' | 'week';
  const S = {
    date: boot.date, view: boot.view as View, by: boot.by, dentist: boot.dentist,
    cards: new Map<string, Card>(boot.cards.map((c) => [c.id, c])),
    today: new Map<string, Card>(boot.todayCards.map((c) => [c.id, c])),
    lane: new Map<string, Card>([...boot.toPlace, ...boot.toConfirm].map((c) => [c.id, c])),
    selDay: boot.date,
    focusId: null as string | null,
    phone: window.matchMedia('(max-width: 767px)').matches,
    scrollTo: true,
    dragging: false,
  };
  const cache = new Map<string, Card[]>();
  // Set once the panels and the list exist (below); everything that reads them runs after that.
  let patients: PatientsList | null = null;
  let panels: Panels = null as unknown as Panels;
  const filterOf = (param: string) => (param === 'all' ? '' : param || (me.dentist ? me.id : ''));
  const byDefault = (param: string) => (me.dentist && filterOf(param) === me.id ? 'dentist' : 'chair');
  const filter = () => filterOf(S.dentist);
  const rangeOf = (date: string, view: View) => {
    const first = view === 'week' ? M.mondayOf(date) : date;
    const from = M.startMs(first);
    return { first, from, to: from + (view === 'week' ? 7 : 1) * M.DAY_MS };
  };
  const inRange = (c: Card, r = rangeOf(S.date, S.view)) => c.status !== 'cancelled' && Date.parse(c.startsAt) < r.to && Date.parse(c.endsAt) > r.from;
  const t0 = M.startMs(boot.today);
  const isTodayCard = (c: Card) => c.status !== 'cancelled' && Date.parse(c.startsAt) >= t0 && Date.parse(c.startsAt) < t0 + M.DAY_MS;
  const inLane = (c: Card) => c.status !== 'cancelled' && Date.parse(c.startsAt) >= Date.now() - M.DAY_MS
    && ((c.source === 'request' && !c.movedAt && c.status !== 'no_show' && c.status !== 'completed') || (c.source === 'web' && c.status === 'booked'));

  // --- the URL ---------------------------------------------------------------------------------
  const calUrl = (o: Partial<{ date: string; view: string; by: string; dentist: string }> = {}) => {
    const v = { date: S.date, view: S.view as string, by: S.by as string, dentist: S.dentist, ...o };
    const p = new URLSearchParams();
    if (v.date !== boot.today) p.set('date', v.date);
    if (v.view !== 'day') p.set('view', v.view);
    if (v.by !== byDefault(v.dentist)) p.set('by', v.by);
    if (v.dentist) p.set('dentist', v.dentist);
    const pf = patients?.state().pf, pq = patients?.state().q;
    if (pf && pf !== 'all') p.set('pf', pf);
    if (pq) p.set('pq', pq);
    const s = p.toString();
    return `/c/${boot.slug}/${s ? `?${s}` : ''}`;
  };
  const writeUrl = (push: boolean) => {
    const u = calUrl() + location.hash;
    if (u === location.pathname + location.search + location.hash) return;
    history[push ? 'pushState' : 'replaceState']({ dash: true }, '', u);
  };

  // --- talking to the server --------------------------------------------------------------------
  async function call(method: 'POST' | 'PATCH', body: Record<string, unknown>): Promise<Reply> {
    try {
      const res = await fetch('/api/schedule', {
        method, credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'X-CSRF': boot.csrf, accept: 'application/json' },
        body: JSON.stringify({ clinic: boot.slug, ...body }),
      });
      let data: any = null;
      try { data = await res.json(); } catch { /* no body */ }
      if (res.ok && data?.appointment) return { ok: true, card: data.appointment as Card, texted: data.texted === true };
      if (res.status === 401) return { ok: false, status: 401, error: 'Your sign-in has ended. Sign in again, then try that once more.' };
      return { ok: false, status: res.status, error: typeof data?.error === 'string' && data.error ? data.error : OFFLINE };
    } catch {
      return { ok: false, error: OFFLINE };
    }
  }
  let loadSeq = 0;
  async function fetchRange(date: string, view: View): Promise<Card[] | null> {
    const r = rangeOf(date, view), key = `${r.from}|${r.to}`;
    const hit = cache.get(key);
    if (hit) return hit;
    try {
      const q = new URLSearchParams({ clinic: boot.slug, from: new Date(r.from).toISOString(), to: new Date(r.to).toISOString() });
      const res = await fetch(`/api/schedule?${q}`, { credentials: 'same-origin', headers: { accept: 'application/json' } });
      if (!res.ok) return null;
      const data = await res.json();
      const list = Array.isArray(data?.appointments) ? (data.appointments as Card[]) : null;
      if (list) { cache.set(key, list); if (cache.size > 12) cache.delete(cache.keys().next().value as string); }
      return list;
    } catch { return null; }
  }

  // --- the messages under the bar -----------------------------------------------------------------
  const toastErr = $('[data-cal-err]')!, toastOk = $('[data-cal-ok]')!;
  let okTimer = 0;
  const closeX = (box: HTMLElement) => {
    const x = el('button', 'ws-tool cal-toast-x'); x.type = 'button'; x.setAttribute('aria-label', 'Dismiss');
    x.append(icon('close', 16));
    x.addEventListener('click', () => { box.hidden = true; });
    return x;
  };
  function fail(text: string) {
    callout(toastErr, text); toastErr.append(closeX(toastErr)); toastOk.hidden = true;
    toastErr.style.animation = 'none'; void toastErr.offsetWidth; toastErr.style.animation = '';
  }
  function say(text: string, go?: { label: string; ymd: string; id?: string }) {
    const extra: Node[] = [];
    if (go) {
      const b = el('button', 'cal-toast-go', go.label); b.type = 'button';
      // Done with once pressed: the day it offered is the one on screen now.
      b.addEventListener('click', () => { toastOk.hidden = true; window.clearTimeout(okTimer); void show(go.ymd, go.id); });
      extra.push(' ', b);
    }
    callout(toastOk, text, extra); toastOk.append(closeX(toastOk));
    toastErr.hidden = true;
    toastOk.style.animation = 'none'; void toastOk.offsetWidth; toastOk.style.animation = '';
    window.clearTimeout(okTimer);
    okTimer = window.setTimeout(() => { if (!toastOk.contains(document.activeElement)) toastOk.hidden = true; }, go ? 12000 : 7000);
  }

  // --- the calendar ---------------------------------------------------------------------------------
  const frame = $('[data-cal-frame]')!, list = $('[data-cal-list]')!;
  const title = $('#calendar-title')!, metaLine = $('#calendar .ws-pane-head .meta');
  const dateInput = $<HTMLInputElement>('[data-cal-date]')!;
  let geo = { start: 0, end: 0, dayStart: 0 }; // the grid's first and last minute, and (day view) its midnight

  function allergyOf(c: Card): string {
    const raw = c.allergies as unknown;
    return Array.isArray(raw) ? (raw as string[]).filter(Boolean).join(', ') : (raw as string | null) ?? '';
  }
  // What a visit is, by one name: the service and the teeth its reason names ("Filling · tooth 26"), model.ts.
  const serviceOf = (c: Card) => M.whatOf(c);

  /** One card: every detail the desk decides on, the status always in words — on the smallest card too.
   *  Day: time range and status · name and chart no. · service and price · dentist, source and booker.
   *  Week (narrow columns): status · surname · start time · service and price — the status first, so a card
   *  cascaded under the next one still shows it. Static (the website's lane,
   *  a phone's list): the day and time · name · service and price · dentist, chair, source. */
  function cardEl(c: Card, o: { s?: number; e?: number; lane?: number; lanes?: number; z?: number; nudge?: number; base?: number; static?: boolean; week?: boolean; undated?: boolean }): HTMLButtonElement {
    const req = M.isRequest(c);
    // The card's colours come from its status (cal.css, [data-status]): a pale tint and a coloured edge, the
    // status always in words on a small pill as well.
    const b = el('button', 'cal-card');
    b.type = 'button'; b.dataset.id = c.id; b.tabIndex = -1;
    b.dataset.status = req ? 'request' : c.status;
    if (req) b.classList.add('is-request');
    const startMin = M.manila(c.startsAt).min;
    const dur = Math.round((Date.parse(c.endsAt) - Date.parse(c.startsAt)) / 60_000);
    let size: 'xs' | 'sm' | 'full' = 'full';
    // Whole lines only: a card shows as many lines as its height holds, never half of one.
    let lines = 9;
    if (o.static) {
      b.classList.add('is-static');
      if (o.lane === 1) b.classList.add('is-lane');
    } else {
      const s = o.s ?? 0, e = o.e ?? 0;
      b.style.cssText = `--s:${s - (o.base ?? 0)};--d:${e - s};--lane:${o.lane ?? 0};--lanes:${o.lanes ?? 1};--z:${o.z ?? 0};--nudge:${o.nudge ?? 0}px`;
      // A cascaded card nudged down (stack) is that much shorter; its lines are counted from what is left.
      const px = (e - s) * (o.week ? MPX.week : MPX.day) - (o.nudge ?? 0);
      lines = Math.max(1, Math.floor((px - CARD_PAD) / LINE));
      size = lines <= 1 ? 'xs' : lines <= 3 ? 'sm' : 'full';
      if (size !== 'full') b.classList.add(`is-${size}`);
      if (lines >= 2 && lines <= 4) b.classList.add(`is-l${lines}`);
      // A line to spare: the status may go under the time rather than beside it.
      if (lines >= 5) b.classList.add('is-roomy');
      // Too many side by side to read (two in a week's narrow day, three in a day's column): they cascade
      // instead, each a little to the right of the one before and over it, the start of every card in view.
      if ((o.lanes ?? 1) >= (o.week ? 2 : 3)) b.classList.add('is-cascade');
      // Two side by side in a day's column: halves while the column is wide enough to read both, a cascade in a
      // narrow one (cal.css, the column's width decides) — never two slivers with a letter of the name each.
      else if (o.lanes === 2) b.classList.add('is-pair');
    }
    const inLaneList = o.static && o.lane === 1;
    const toConfirm = inLaneList && c.source === 'web' && c.status === 'booked';
    // "Done", as the summary strip and the panel's step say it (and short enough for a narrow card's pill).
    const word = req ? 'Request' : toConfirm ? 'To confirm' : M.statusWord(c.status);
    if (toConfirm) b.dataset.status = 'confirm';
    const allergy = allergyOf(c);
    const price = M.priceShort(c.price);
    const near = M.nearWhen(c.startsAt, boot.today);

    const undatedWhen = `${S.view === 'week' ? `${M.dayLabel(M.manila(c.startsAt).ymd)} · ` : ''}no time on record`;
    const time = o.undated ? undatedWhen
      : o.static ? (req ? `Asks ${near.replace(/^[TY]/, (x) => x.toLowerCase())}` : inLaneList ? near : M.span(startMin, startMin + dur))
      : o.week || size === 'xs' ? M.hm(startMin) : M.span(startMin, startMin + dur).replace(/ [ap]m$/, ''); // the gutter says am or pm
    const statusEl = el('span', 'cal-card-status', word);
    const top = el('span', 'cal-card-top');
    // On the timeline the end of the range is its own span: a short card in a narrow column drops it (cal.css)
    // rather than cut its status word, which a card never loses. The panel and the label keep the whole range.
    const timeEl = el('span', 'cal-card-time');
    const dash = !o.static && !o.undated ? time.indexOf('–') : -1;
    if (dash > 0) timeEl.append(time.slice(0, dash), el('span', 'cal-card-end', time.slice(dash)));
    else timeEl.textContent = time;
    top.append(timeEl);
    const who = el('span', 'cal-card-who');
    if (allergy || c.conditions) {
      const mark = el('span', 'cal-mark');
      mark.title = [allergy && `Allergy: ${allergy}`, c.conditions && `Alert: ${c.conditions}`].filter(Boolean).join(' · ');
      mark.append(icon('alert', 13));
      who.append(mark);
    }
    // The name and the chart no. share a one-line box that wraps: a chart no. with no room goes, whole, to the
    // hidden second line; a name with no room ellipsises. The alert mark stands outside it and never pushes the name off.
    const nm = el('span', 'cal-card-nm');
    const nameEl = el('span', 'cal-card-name', o.week ? M.surnameOf(c) : c.patientName);
    // A card on the grid with no room for the whole name shows "M. Dela Cruz", then "Dela Cruz" (fitCards): the
    // surname whole before anything else.
    if (!o.static && !o.week) { nameEl.dataset.full = c.patientName; nameEl.dataset.short = M.shortPatient(c); nameEl.dataset.sur = M.surnameOf(c); }
    nm.append(nameEl, el('span', 'cal-card-chart', c.chartNo));
    who.append(nm);
    const what = el('span', 'cal-card-line cal-card-what');
    what.append(serviceOf(c) || 'No service given');
    if (price) what.append(' · ', el('span', 'cal-card-price', price));
    // Who and where: the dentist on a chair's column, the chair on a dentist's column (the column head says the
    // other); both when the card stands alone. A card too short for this line carries the first half of it on the
    // service line instead, so the dentist (or the chair) is on every card that has room for three lines.
    const dentistWord = M.shortName(c.dentistName) || 'Any dentist';
    const chairWord = c.chair === null ? (M.DONE.has(c.status) ? 'no chair' : 'no chair yet') : `Chair ${c.chair}`;
    // In the website's lane the chair is what is missing (the lane says so): the dentist the patient asked for, if any.
    const whoWhere = inLaneList ? (c.dentistName ? [dentistWord] : []) : o.static ? [dentistWord, chairWord] : S.view === 'day' && S.by === 'dentist' ? [chairWord] : [dentistWord];
    const how = el('span', 'cal-card-line cal-card-how', [...whoWhere, M.sourceLine(c)].filter(Boolean).join(' · '));
    if (lines === 3 && !o.week && whoWhere[0]) what.append(` · ${whoWhere[0]}`);

    if (o.week) {
      // The status first, on a line of its own, then the surname: a card cascaded under a later one keeps both in
      // view. Then the time, then the service. The smallest card is the status and the surname on one line.
      if (size === 'xs') b.append(statusEl, who);
      else if (lines === 2) b.append(statusEl, who);
      else b.append(statusEl, who, top, what);
    } else if (size === 'xs') {
      b.append(top, who, statusEl);
    } else {
      top.append(statusEl);
      b.append(top, who, what, how);
    }

    const label = [
      o.undated ? `${M.dayLabel(M.manila(c.startsAt).ymd, 'long')}, no time on record` : o.static ? M.whenOf(c.startsAt) : M.span(startMin, startMin + dur),
      `${c.patientName}, chart ${c.chartNo}`,
      serviceOf(c), price && `fee guide ${price}`,
      c.dentistName ?? 'any dentist', c.chair === null ? 'no chair' : `chair ${c.chair}`,
      word, allergy && `allergy: ${allergy}`, c.conditions && `alert: ${c.conditions}`, M.sourceLine(c),
    ].filter(Boolean).join(', ');
    b.setAttribute('aria-label', label);
    return b;
  }

  /** A column's head: its name and a small line; a dentist's column carries their avatar. */
  /** Cards that overlap in one column, ready to cascade (cal.css: .is-cascade, and .is-pair in a narrow day
   *  column): the later start on top, and a card that starts within a line of one under it drawn a line lower
   *  (--nudge), so the first line of every card — its time and status, a week's status — stays in view, even for
   *  two visits at the same minute. Side by side (a wide column) the nudge and the order are not used. */
  function stack<T extends { s: number; e: number; lane: number; lanes: number }>(ps: T[], mpx: number): (T & { z: number; nudge: number })[] {
    const order = ps.map((p, i) => ({ p, i })).sort((x, y) => x.p.s - y.p.s || x.p.lane - y.p.lane);
    const out = ps.map((p) => ({ ...p, z: 0, nudge: 0 }));
    const top: number[] = [];
    order.forEach(({ p, i }, k) => {
      out[i].z = k;
      if (p.lanes < 2) { top[k] = p.s * mpx; return; }
      let t = p.s * mpx;
      for (let again = true; again;) {
        again = false;
        for (let j = 0; j < k; j++) {
          const q = order[j].p, tq = top[j];
          if (q.s < p.e && q.e > p.s && tq <= t && t < tq + LINE) { t = tq + LINE; again = true; }
        }
      }
      // Never so far down that the card keeps less than one line.
      t = Math.min(t, Math.max(p.s * mpx, p.e * mpx - LINE - CARD_PAD));
      top[k] = t;
      out[i].nudge = Math.round(t - p.s * mpx);
    });
    return out;
  }

  function colHead(label: string, sub: string | null, person = false) {
    const d = el('div', 'cal-colhead');
    const words = el('span', 'cal-colhead-words');
    words.append(el('span', 'cal-colhead-name', label));
    if (sub) words.append(el('span', 'meta', sub));
    if (person) { d.classList.add('has-avatar'); d.append(avatar(label, 'sm')); }
    d.append(words);
    return d;
  }
  function gutter(start: number, end: number) {
    const g = el('div', 'cal-gutter');
    for (let m = start; m < end; m += 60) { const h = el('span', 'cal-hour', M.hm(m)); h.style.setProperty('--s', String(m - start)); g.append(h); }
    return g;
  }
  function closedBlocks(lane: HTMLElement, open: [number, number] | null, start: number, end: number) {
    const add = (a: number, b: number) => { if (b <= a) return; const d = el('div', 'cal-closed'); d.style.cssText = `--s:${a - start};--d:${b - a}`; lane.append(d); };
    if (!open) { add(start, end); return; }
    add(start, Math.min(end, open[0])); add(Math.max(start, open[1]), end);
  }
  const shownCards = () => { const f = filter(); const all = [...S.cards.values()]; return f ? all.filter((a) => a.dentistId === f) : all; };
  // A visit brought in from old records with its day only has no place on a timeline: it is listed above the
  // grid instead (renderUndated), never drawn at the noon it is stored at.
  const timed = (c: Card) => !c.dateOnly;
  const allTimed = () => [...S.cards.values()].filter(timed);
  const shownTimed = () => shownCards().filter(timed);

  function renderDay() {
    const dayStart = M.startMs(S.date), dow = M.dowOf(S.date);
    const all = allTimed(), shown = shownTimed();
    const open = M.hoursOf(boot.hours, dow);
    const [start, end] = M.bounds(all.map((a) => M.spanOn(a, dayStart)), open);
    geo = { start, end, dayStart };
    const cols = M.columns(S.by, shown, boot.chairs, boot.staff, dow, S.by === 'dentist' ? filter() : '');
    frame.dataset.view = 'day';
    frame.style.setProperty('--mpx', `${MPX.day}px`);
    frame.style.setProperty('--cols', String(cols.length));
    frame.style.setProperty('--span', String(end - start));
    const head = el('div', 'cal-head');
    head.append(el('div', 'cal-corner'));
    const body = el('div', 'cal-body');
    body.append(gutter(start, end));
    for (const c of cols) {
      const mine = shown.filter((a) => M.colOf(S.by, a) === c.key);
      head.append(colHead(c.label, c.sub ?? (mine.length ? `${mine.length} visit${mine.length === 1 ? '' : 's'}` : 'free'), S.by === 'dentist' && c.key !== ''));
      const lane = el('div', 'cal-lanecol');
      lane.dataset.lane = c.key; lane.dataset.laneLabel = c.label;
      closedBlocks(lane, open, start, end);
      for (const p of stack(M.lanes(mine.map((a) => ({ a, ...M.spanOn(a, dayStart) }))), MPX.day)) lane.append(cardEl(p.a, { s: p.s, e: p.e, lane: p.lane, lanes: p.lanes, z: p.z, nudge: p.nudge, base: start }));
      body.append(lane);
    }
    if (S.date === boot.today) {
      const now = el('div', 'cal-now'); now.dataset.now = ''; body.append(now);
      const lab = el('span', 'cal-now-label'); lab.dataset.nowLabel = ''; body.firstElementChild!.append(lab);
    }
    frame.replaceChildren(head, body);
    tickNow();
  }

  function renderWeek() {
    const first = M.mondayOf(S.date);
    const days = Array.from({ length: 7 }, (_, i) => { const ymd = M.addDays(first, i), dow = M.dowOf(ymd); return { ymd, dow, start: M.startMs(ymd), open: M.hoursOf(boot.hours, dow) }; });
    const all = allTimed(), shown = shownTimed();
    const inDay = (a: Card, d: { start: number }) => { const t = Date.parse(a.startsAt); return t >= d.start && t < d.start + M.DAY_MS; };
    const opens = days.map((d) => d.open).filter((h): h is [number, number] => !!h);
    const [start, end] = M.bounds(days.flatMap((d) => all.filter((a) => inDay(a, d)).map((a) => M.spanOn(a, d.start))),
      opens.length ? [Math.min(...opens.map((h) => h[0])), Math.max(...opens.map((h) => h[1]))] : null);
    geo = { start, end, dayStart: 0 };
    frame.dataset.view = 'week';
    frame.style.setProperty('--mpx', `${MPX.week}px`);
    frame.style.setProperty('--cols', '7');
    frame.style.setProperty('--span', String(end - start));
    const head = el('div', 'cal-head'); head.append(el('div', 'cal-corner'));
    const body = el('div', 'cal-body'); body.append(gutter(start, end));
    for (const d of days) {
      const mine = shown.filter((a) => inDay(a, d));
      const h = el('button', 'cal-colhead');
      h.type = 'button'; h.dataset.day = d.ymd;
      h.setAttribute('aria-label', `${M.dayLabel(d.ymd, 'long')}${d.ymd === boot.today ? ', today' : ''}: ${d.open ? `${mine.length} visit${mine.length === 1 ? '' : 's'}` : 'closed'}. Open the day.`);
      // "Today" goes on the second line, before the count, so a narrow day's name is never cut to "Fri 25 · t…";
      // in a narrow column the word "visits" gives way to it (cal.css), the number never does.
      const sub = el('span', 'meta');
      if (d.ymd === boot.today) sub.append('today · ');
      if (d.open) sub.append(`${mine.length || 'no'}`, el('span', 'cal-colhead-unit', ` visit${mine.length === 1 ? '' : 's'}`));
      else sub.append('closed');
      h.append(el('span', 'cal-colhead-name', M.dayLabel(d.ymd, 'day')), sub);
      if (d.ymd === boot.today) h.dataset.today = '';
      if (d.ymd === S.selDay) h.dataset.selected = '';
      head.append(h);
      const lane = el('div', 'cal-lanecol');
      lane.dataset.lane = d.ymd; lane.dataset.laneLabel = M.dayLabel(d.ymd);
      if (d.ymd === boot.today) lane.dataset.today = '';
      if (d.ymd === S.selDay) lane.dataset.selected = '';
      closedBlocks(lane, d.open, start, end);
      for (const p of stack(M.lanes(mine.map((a) => ({ a, ...M.spanOn(a, d.start) }))), MPX.week)) lane.append(cardEl(p.a, { s: p.s, e: p.e, lane: p.lane, lanes: p.lanes, z: p.z, nudge: p.nudge, base: start, week: true }));
      if (d.ymd === boot.today) { const now = el('div', 'cal-now'); now.dataset.now = ''; lane.append(now); }
      body.append(lane);
    }
    if (days.some((d) => d.ymd === boot.today)) { const lab = el('span', 'cal-now-label'); lab.dataset.nowLabel = ''; body.firstElementChild!.append(lab); }
    frame.replaceChildren(head, body);
    tickNow();
  }

  /** A phone: the day (or the week) as a list, every card whole. */
  function renderList() {
    const shown = shownTimed().sort((x, y) => x.startsAt.localeCompare(y.startsAt));
    const days = S.view === 'week' ? Array.from({ length: 7 }, (_, i) => M.addDays(M.mondayOf(S.date), i)) : [S.date];
    const out: HTMLElement[] = [];
    // A week: days with nothing booked are said once, together ("Mon 21 – Thu 24: nothing booked"), not one by one.
    let quiet: string[] = [];
    const flushQuiet = () => {
      if (!quiet.length) return;
      const name = (d: string) => `${M.dayLabel(d)}${d === boot.today ? ' (today)' : ''}`;
      out.push(el('p', 'cal-empty cal-list-quiet', `${quiet.length > 1 ? `${name(quiet[0])} – ${name(quiet[quiet.length - 1])}` : name(quiet[0])}: nothing booked`));
      quiet = [];
    };
    for (const ymd of days) {
      const start = M.startMs(ymd);
      const mine = shown.filter((a) => { const t = Date.parse(a.startsAt); return t >= start && t < start + M.DAY_MS; });
      if (!mine.length) { if (S.view === 'day') out.push(emptyDay()); else quiet.push(ymd); continue; }
      flushQuiet();
      if (S.view === 'week') out.push(el('h3', 'cal-list-day', `${M.dayLabel(ymd)}${ymd === boot.today ? ' · today' : ''}`));
      for (const c of mine) out.push(cardEl(c, { static: true }));
    }
    flushQuiet();
    list.replaceChildren(...out);
  }
  function emptyText() {
    const f = filter();
    if (shownCards().some((c) => !timed(c))) return 'Nothing else on this day: the visits above came from earlier records, without a time.';
    if (f && S.cards.size) return `Nothing booked for ${f === me.id ? 'you' : staffById.get(f)?.name ?? 'that dentist'} on this day.`;
    return M.hoursOf(boot.hours, M.dowOf(S.date)) ? 'Nothing booked on this day yet.' : 'The clinic is closed on this day. A visit can still be booked on it.';
  }
  /** A phone's empty day, the friendly way: an icon, one line, and the next thing to do. */
  function emptyDay() {
    const p = el('p', 'ws-empty cal-empty');
    const go = el('button', 'ws-empty-go', 'New booking'); go.type = 'button';
    go.append(icon('arrow-right', 16));
    go.addEventListener('click', () => panels.openBook({ ymd: S.date, by: S.by }, go));
    p.append(icon('calendar', 20, 'ws-empty-icon'), el('span', 'ws-empty-text', emptyText()), go);
    return p;
  }

  function tickNow() {
    const now = Date.now();
    const lines = $$('[data-now]', frame), label = $('[data-now-label]', frame);
    const dayStart = S.view === 'day' ? geo.dayStart : t0;
    const m = (now - dayStart) / 60_000;
    const show = (S.view === 'day' ? S.date === boot.today : rangeOf(S.date, 'week').from <= t0 && t0 < rangeOf(S.date, 'week').to) && m >= geo.start && m <= geo.end;
    for (const l of lines) { l.hidden = !show; l.style.setProperty('--s', String(m - geo.start)); }
    if (label) { label.hidden = !show; label.style.setProperty('--s', String(m - geo.start)); label.textContent = M.hm(m).replace(' ', ''); }
  }
  window.setInterval(() => { if (!S.dragging) tickNow(); }, 30_000);

  /** One short line beside the view switch: how full the day is and where the next free half hour is. */
  function renderCount() {
    const out = $('[data-cal-count]')!;
    const all = allTimed();
    const unplaced = all.filter((a) => a.chair === null && !M.DONE.has(a.status)).length;
    const needs = unplaced ? `${unplaced} need${unplaced === 1 ? 's' : ''} a chair` : '';
    if (S.view === 'week') {
      out.textContent = [`${all.length || 'Nothing'} booked this week`, needs].filter(Boolean).join(' · ');
      return;
    }
    const dayStart = M.startMs(S.date), open = M.hoursOf(boot.hours, M.dowOf(S.date));
    const bits = [all.length === 0 ? 'Nothing booked' : `${all.length} booked`, needs];
    if (open && S.date >= boot.today) {
      const f = M.nextFree(all, open, dayStart, S.date === boot.today, boot.chairs);
      bits.push(f ? `next free: Chair ${f.chair} at ${M.hm(f.min)}` : S.date === boot.today ? 'no free time left today' : 'fully booked');
    } else if (!open) bits.push('the clinic is closed');
    const f = filter();
    if (f && all.length) {
      const mine = all.filter((a) => a.dentistId === f).length;
      bits.push(`${mine} with ${f === me.id ? 'you' : M.shortName(staffById.get(f)?.name ?? '') || 'one dentist'}`);
    }
    out.textContent = bits.filter(Boolean).join(' · ');
  }

  function renderLane() {
    const place = [...S.lane.values()].filter(M.isRequest).sort((x, y) => x.startsAt.localeCompare(y.startsAt));
    const confirm = [...S.lane.values()].filter((c) => !M.isRequest(c)).sort((x, y) => x.startsAt.localeCompare(y.startsAt));
    const count = $('[data-lane-count]')!;
    count.textContent = String(place.length);
    if (place.length) delete count.dataset.zero; else count.dataset.zero = '';
    $('[data-lane-hint]')!.textContent = place.length
      ? (S.phone ? 'Open one to give it a time.' : 'Give each a time: drag it onto a chair, or open it.')
      : confirm.length ? 'Booked online: open one to confirm it.' : 'None waiting. A request from the website waits here for a time.';
    // Amber ("needs attention") only while something waits for the desk; a quiet line when nothing does.
    const lane = $('[data-reqs]')!;
    if (place.length + confirm.length) lane.dataset.some = ''; else delete lane.dataset.some;
    $('[data-lane-confirm-head]')!.hidden = confirm.length === 0;
    $('[data-confirm-count]')!.textContent = String(confirm.length);
    $('[data-lane-list]')!.replaceChildren(...[...place, ...confirm].map((c) => { const li = el('li'); li.append(cardEl(c, { static: true, lane: 1 })); return li; }));
  }

  /** Visits brought in from old records with their day only (026): listed, with the day, never on the timeline. */
  function renderUndated() {
    const box = $('[data-cal-undated]');
    if (!box) return;
    const cards = shownCards().filter((c) => !timed(c)).sort((x, y) => x.startsAt.localeCompare(y.startsAt) || x.patientName.localeCompare(y.patientName));
    box.hidden = cards.length === 0;
    $('[data-undated-count]', box)!.textContent = String(cards.length);
    $('[data-undated-list]', box)!.replaceChildren(...cards.map((c) => { const li = el('li'); const b = cardEl(c, { static: true, undated: true }); b.tabIndex = 0; li.append(b); return li; }));
  }

  function renderPrint() {
    const rows = shownCards().sort((x, y) => x.startsAt.localeCompare(y.startsAt));
    $('[data-cal-print-caption]')!.textContent = `${document.title.split(' — ')[1] ?? ''} · ${title.textContent}`;
    $('[data-cal-print-rows]')!.replaceChildren(...(rows.length ? rows.map((a) => {
      const tr = el('tr');
      const name = el('td', '', a.patientName);
      const allergy = allergyOf(a);
      if (allergy) name.append(` · allergy: ${allergy}`);
      const at = a.dateOnly ? `${S.view === 'week' ? `${M.dayLabel(M.manila(a.startsAt).ymd)}, ` : ''}no time` : S.view === 'week' ? M.whenOf(a.startsAt) : M.timeOf(a.startsAt);
      // The words the grid and the panel use: a website request is not a booking until the desk gives it a time.
      tr.append(el('td', '', at), name, el('td', '', a.chartNo), el('td', '', serviceOf(a)),
        el('td', '', a.dentistName ?? 'Any dentist'), el('td', '', a.chair === null ? 'none' : String(a.chair)),
        el('td', '', M.isRequest(a) ? 'Request, not placed' : M.statusWord(a.status)));
      return tr;
    }) : [(() => { const tr = el('tr'); const td = el('td', '', 'Nothing on the book.'); td.colSpan = 7; tr.append(td); return tr; })()]));
  }

  const TILE_TONE: Record<string, string> = { default: '', accent: 'text-accent', warn: 'text-crown', success: 'ws-text-green' };
  /** The four numbers, recounted from today's visits after every change (Collected is the server's own figure:
   *  only its note, what the fee guide expects, follows the book). */
  function renderTiles() {
    const s = M.summarize([...S.today.values()], me.dentist ? me.id : '');
    const n = M.summaryNotes(s, boot.chairs, me.dentist, boot.finance);
    const set = (id: string, value: string | null, note: string, tone?: string) => {
      const t = document.getElementById(id); if (!t) return;
      const v = t.querySelector<HTMLElement>('.ws-tile-value'), nn = t.querySelector('.ws-tile-note');
      if (v && value !== null) {
        if (v.textContent !== value) { v.textContent = value; v.animate?.([{ opacity: 0.2, transform: 'translateY(3px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }); }
        if (tone) { v.className = `ws-tile-value ${TILE_TONE[tone] ?? ''}`.trim(); t.dataset.tone = tone; }
      }
      if (nn) nn.textContent = note;
    };
    set('tile-booked', String(s.booked), n.booked);
    set('tile-waiting', String(s.waiting), n.waiting, s.waiting ? 'warn' : 'default');
    set('tile-chair', String(s.inChair), n.inChair, s.inChair ? 'accent' : 'default');
    set('tile-done', String(s.done), n.done);
    set('tile-collected', null, n.expected);
  }

  /** The head, the bar and their links, from the state. */
  function renderChrome() {
    const r = rangeOf(S.date, S.view);
    title.textContent = S.view === 'week' ? `${M.dayLabel(r.first)} – ${M.dayLabel(M.addDays(r.first, 6))}` : M.dayLabel(S.date, 'long');
    if (metaLine) metaLine.textContent = S.view === 'week' ? (r.first === M.mondayOf(boot.today) ? 'This week' : 'Week')
      : S.date === boot.today ? 'Today' : S.date === M.addDays(boot.today, 1) ? 'Tomorrow' : S.date === M.addDays(boot.today, -1) ? 'Yesterday' : 'Calendar';
    dateInput.value = S.date;
    const step = S.view === 'week' ? 7 : 1;
    for (const a of $$<HTMLAnchorElement>('[data-cal-step]')) {
      const dir = Number(a.dataset.calStep);
      a.href = calUrl({ date: M.addDays(S.date, dir * step) });
      a.setAttribute('aria-label', `${dir < 0 ? 'Previous' : 'Next'} ${S.view === 'week' ? 'week' : 'day'}`);
    }
    const todayLink = $<HTMLAnchorElement>('[data-cal-today]'); if (todayLink) todayLink.href = calUrl({ date: boot.today });
    const seg = (label: string, ids: string[], current: string, href: (id: string) => string) => {
      const links = $$<HTMLAnchorElement>(`nav[aria-label="${label}"] a`);
      links.forEach((a, i) => { const id = ids[i]; a.href = href(id); if (id === current) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    };
    seg('View', ['day', 'week'], S.view, (id) => calUrl({ view: id }));
    seg('Whose visits and patients', ['mine', 'all'], filter() === me.id ? 'mine' : 'all', (id) => (id === 'mine' ? calUrl({ dentist: '', by: 'dentist' }) : calUrl({ dentist: 'all' })));
    // More: the columns and one dentist's visits, as links with the chosen one marked.
    const mark = (a: HTMLAnchorElement, on: boolean) => { if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); };
    for (const a of $$<HTMLAnchorElement>('[data-cal-by]')) { a.href = calUrl({ by: a.dataset.calBy }); mark(a, a.dataset.calBy === S.by); }
    for (const a of $$<HTMLAnchorElement>('[data-cal-who]')) { a.href = calUrl({ dentist: a.dataset.calWho }); mark(a, (a.dataset.calWho ?? '') === filter()); }
    const byWrap = $('[data-cal-by-wrap]'); if (byWrap) byWrap.hidden = S.view === 'week';
  }

  /** Put the view where the eye starts: now on today, else the first visit, else opening time. */
  function scrollToStart() {
    if (S.phone) return;
    const mpx = MPX[S.view];
    let target = geo.start;
    const now = (Date.now() - (S.view === 'day' ? geo.dayStart : t0)) / 60_000;
    const onToday = S.view === 'day' ? S.date === boot.today : rangeOf(S.date, 'week').from <= t0 && t0 < rangeOf(S.date, 'week').to;
    if (onToday && now > geo.start && now < geo.end) target = now - 60;
    else {
      const first = shownTimed().map((a) => M.manila(a.startsAt).min).sort((a, b) => a - b)[0];
      const open = M.hoursOf(boot.hours, M.dowOf(S.date));
      target = first !== undefined ? first - 30 : open ? open[0] : geo.start;
    }
    frame.scrollTop = Math.max(0, (target - geo.start) * mpx);
  }

  /** Roving focus: one card in the calendar is in the Tab order, the rest by ↑ ↓. */
  function cardsInOrder(ymd?: string): HTMLButtonElement[] {
    const scope = S.phone ? list : frame;
    let cards = $$<HTMLButtonElement>('.cal-card[data-id]', scope);
    if (S.view === 'week' && ymd && !S.phone) cards = $$<HTMLButtonElement>(`.cal-lanecol[data-lane="${ymd}"] .cal-card[data-id]`, frame);
    const at = (b: HTMLElement) => { const c = S.cards.get(b.dataset.id!); return c ? Date.parse(c.startsAt) : 0; };
    const x = (b: HTMLElement) => b.getBoundingClientRect().left;
    return cards.sort((a, b) => at(a) - at(b) || x(a) - x(b));
  }
  function setRoving() {
    const cards = cardsInOrder(S.view === 'week' ? S.selDay : undefined);
    const all = $$<HTMLButtonElement>('.cal-card[data-id]', S.phone ? list : frame);
    for (const b of all) b.tabIndex = -1;
    const pick = (S.focusId && all.find((b) => b.dataset.id === S.focusId)) || cards[0] || all[0];
    if (pick) pick.tabIndex = 0;
    for (const b of $$<HTMLButtonElement>('[data-reqs] .cal-card')) b.tabIndex = 0;
  }

  function renderCalendar() {
    if (S.phone) { frame.replaceChildren(); renderList(); } else { list.replaceChildren(); if (S.view === 'week') renderWeek(); else renderDay(); }
    frame.setAttribute('aria-busy', 'false');
    frame.setAttribute('aria-label', `${title.textContent ?? 'Calendar'}: ${S.view === 'week' ? 'the week' : S.by === 'dentist' ? 'a column per dentist' : 'a column per chair'}`);
    setRoving();
    if (S.scrollTo) { S.scrollTo = false; scrollToStart(); }
    markCut();
    fitCards();
  }

  /** Fit each card on the grid to the width it got, once it is drawn and again whenever the grid's width changes:
   *  - a day card whose status word does not fit beside its time puts it under the time (is-tight: cal.css then
   *    gives up the card's last line for it, so the card still shows whole lines only; a one-line card drops its
   *    time instead, which the grid and the panel still say) — the status is never cut;
   *  - a name that does not fit becomes "M. Dela Cruz", then "Dela Cruz": the surname whole (the panel has the rest).
   *  All the reads, then all the writes, each time: three layouts for the whole grid, however many cards. */
  function fitCards() {
    if (S.phone) return;
    const cards = $$<HTMLElement>('.cal-card[data-id]:not(.is-static)', frame);
    const names = cards.map((b) => b.querySelector<HTMLElement>('.cal-card-name[data-short]'));
    cards.forEach((b, i) => { b.classList.remove('is-tight'); const n = names[i]; if (n && n.textContent !== n.dataset.full) n.textContent = n.dataset.full!; });
    const over = (e: Element | null) => !!e && e.scrollWidth > e.clientWidth + 1;
    const week = S.view === 'week';
    const tight = week ? [] : cards.filter((b) => (b.classList.contains('is-xs')
      ? (b.querySelector('.cal-card-who')?.clientWidth ?? 99) < 48 || b.scrollWidth > b.clientWidth + 1
      : over(b.querySelector('.cal-card-status'))));
    for (const b of tight) b.classList.add('is-tight');
    for (const step of ['short', 'sur'] as const) {
      const cut = names.filter((n): n is HTMLElement => !!n && n.dataset[step] !== n.textContent && over(n));
      for (const n of cut) n.textContent = n.dataset[step]!;
    }
  }
  // The first measure may run before the web font is in; measure again once it is.
  void document.fonts?.ready.then(() => fitCards());

  /** Columns the pane is too narrow for (more chairs than fit side by side): the bar names them, and a press
   *  scrolls the grid to them. Nothing is off to the side silently — an overlay scrollbar shows nothing. */
  const moreBtn = $<HTMLButtonElement>('[data-cal-more]');
  let moreDir = 0;
  function markCut() {
    if (!moreBtn) return;
    moreDir = 0;
    if (!S.phone && frame.scrollWidth > frame.clientWidth + 1) {
      const fr = frame.getBoundingClientRect();
      const left = fr.left + ($('.cal-corner', frame)?.getBoundingClientRect().width ?? 0), right = fr.left + frame.clientWidth;
      const heads = $$('.cal-head > .cal-colhead', frame);
      const nameOf = (h: HTMLElement) => h.querySelector('.cal-colhead-name')?.textContent ?? '';
      const names = (hs: HTMLElement[]) => (hs.length > 3 ? `${hs.slice(0, 2).map(nameOf).join(', ')} and ${hs.length - 2} more` : hs.map(nameOf).join(', '));
      const cutR = heads.filter((h) => h.getBoundingClientRect().right > right + 2);
      const cutL = heads.filter((h) => h.getBoundingClientRect().left < left - 2);
      if (cutR.length) { moreDir = 1; moreBtn.textContent = `More to the right: ${names(cutR)} →`; }
      else if (cutL.length) { moreDir = -1; moreBtn.textContent = `← More to the left: ${names(cutL)}`; }
    }
    moreBtn.hidden = moreDir === 0;
  }
  moreBtn?.addEventListener('click', () => { if (moreDir) frame.scrollTo({ left: moreDir > 0 ? frame.scrollWidth : 0, behavior: 'smooth' }); });
  let cutRaf = 0;
  frame.addEventListener('scroll', () => { if (!cutRaf) cutRaf = window.requestAnimationFrame(() => { cutRaf = 0; markCut(); }); }, { passive: true });
  let fitRaf = 0, frameW = 0;
  if ('ResizeObserver' in window) new ResizeObserver(() => {
    markCut();
    // Only a new width changes what fits (the frame's height follows the screen's).
    if (frame.clientWidth !== frameW && !S.dragging && !fitRaf) fitRaf = window.requestAnimationFrame(() => { fitRaf = 0; frameW = frame.clientWidth; fitCards(); });
  }).observe(frame);

  // Whatever the shell keeps stuck to the top of the screen (a top bar, whose height changes with the width;
  // none at all in a layout without one): cal.css keeps what the page scrolls to (#requests, #patients, a card
  // the keyboard reaches) and the toasts' dock below it, by --dash-bar. Found by what covers the top edge of the
  // screen — a sticky or fixed box outside the Dashboard, not a full-screen layer — so it does not depend on
  // the shell's class names.
  const barObs = 'ResizeObserver' in window ? new ResizeObserver(() => setBar()) : null;
  let barEl: Element | null = null;
  function setBar() {
    let bottom = 0, found: Element | null = null;
    for (const x of [innerWidth - 24, innerWidth / 2]) {
      for (const hit of document.elementsFromPoint(x, 1)) {
        for (let n: Element | null = hit; n && n !== document.body; n = n.parentElement) {
          if (root!.contains(n) || n.closest('dialog')) break;
          const pos = getComputedStyle(n).position;
          if (pos !== 'sticky' && pos !== 'fixed') continue;
          const r = n.getBoundingClientRect();
          if (r.top <= 1 && r.height < innerHeight * 0.4 && r.bottom > bottom) { bottom = r.bottom; found = n; }
        }
      }
    }
    document.documentElement.style.setProperty('--dash-bar', `${Math.ceil(bottom)}px`);
    if (found !== barEl) { if (barEl) barObs?.unobserve(barEl); barEl = found; if (found) barObs?.observe(found); }
  }
  setBar();
  window.addEventListener('resize', () => setBar(), { passive: true });
  function renderAll() {
    renderChrome(); renderCount(); renderLane(); renderUndated(); renderCalendar(); renderPrint(); renderTiles();
  }

  // --- changes ----------------------------------------------------------------------------------------
  function absorb(c: Card) {
    if (inRange(c)) S.cards.set(c.id, c); else S.cards.delete(c.id);
    if (isTodayCard(c)) S.today.set(c.id, c); else S.today.delete(c.id);
    if (inLane(c)) S.lane.set(c.id, c); else S.lane.delete(c.id);
    cache.clear();
    patients?.absorb(c);
    if (!S.dragging) renderAll();
  }
  function flash(id: string) {
    for (const b of $$<HTMLElement>(`.cal-card[data-id="${id}"]`)) { b.classList.remove('is-flash'); void b.offsetWidth; b.classList.add('is-flash'); }
  }

  // --- moving through days ---------------------------------------------------------------------------
  async function go(next: { date?: string; view?: View; by?: 'chair' | 'dentist'; dentist?: string }, o: { push?: boolean; openId?: string; focus?: 'first' | 'keep' } = {}) {
    const date = next.date ?? S.date, view = next.view ?? S.view;
    const same = rangeOf(date, view).from === rangeOf(S.date, S.view).from && rangeOf(date, view).to === rangeOf(S.date, S.view).to;
    const seq = ++loadSeq;
    const prev = { date: S.date, view: S.view, selDay: S.selDay, by: S.by, dentist: S.dentist };
    S.date = date; S.view = view;
    if (next.by) S.by = next.by;
    if (next.dentist !== undefined) S.dentist = next.dentist;
    S.selDay = view === 'week' ? (next.date ? date : S.selDay) : date;
    if (view === 'week' && (S.selDay < rangeOf(date, 'week').first || S.selDay > M.addDays(rangeOf(date, 'week').first, 6))) S.selDay = date;
    renderChrome();
    if (!same) {
      frame.setAttribute('aria-busy', 'true');
      const got = await fetchRange(date, view);
      if (seq !== loadSeq) return;
      if (!got) {
        Object.assign(S, prev); renderChrome(); frame.setAttribute('aria-busy', 'false');
        fail(navigator.onLine === false ? 'Offline: the calendar needs the connection to show another day.' : 'That day could not be loaded. Try again in a moment.');
        return;
      }
      S.cards = new Map(got.filter((c) => c.status !== 'cancelled').map((c) => [c.id, c]));
      S.scrollTo = true;
    }
    if (o.push !== false) writeUrl(true);
    patients?.scope();
    renderAll();
    if (o.openId) { const c = S.cards.get(o.openId); if (c) panels.openVisit(c.id, frame.querySelector(`.cal-card[data-id="${o.openId}"]`)); }
    else if (o.focus === 'first') focusCard(cardsInOrder(S.view === 'week' ? S.selDay : undefined)[0] ?? null);
  }
  async function show(ymd: string, openId?: string) { await go({ date: ymd, view: S.view === 'week' ? 'week' : 'day' }, { openId }); }

  /** Read a calendar link's query into the state, the same way the server does. */
  function fromUrl(u: URL) {
    const p = u.searchParams;
    const d = p.get('date') ?? '';
    const dent = p.get('dentist') ?? '';
    const dentist = UUID.test(dent) ? dent.toLowerCase() : dent === 'all' && me.dentist ? 'all' : '';
    const b = p.get('by');
    return {
      date: M.realDay(d) ? d : boot.today,
      view: (p.get('view') === 'week' ? 'week' : 'day') as View,
      dentist,
      by: (b === 'chair' || b === 'dentist' ? b : byDefault(dentist)) as 'chair' | 'dentist',
    };
  }
  const plain = (e: MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
  $('#calendar')!.addEventListener('click', (e) => {
    const a = (e.target as Element).closest<HTMLAnchorElement>('[data-cal-step], [data-cal-today], nav.cal-seg a, a[data-cal-by], a[data-cal-who]');
    if (!a || !plain(e)) return;
    e.preventDefault();
    closeCalMenu(a);
    const next = fromUrl(new URL(a.href, location.href));
    // A line of the More menu has closed with it: the focus goes back to the menu's button.
    const keepFocus = a.closest('[data-ws-menu]')?.querySelector<HTMLElement>(':scope > button') ?? a;
    void go(next).then(() => { if (keepFocus.isConnected) keepFocus.focus({ preventScroll: true }); });
  });
  dateInput.addEventListener('change', () => { if (M.realDay(dateInput.value)) void go({ date: dateInput.value }); });
  /** A line of the calendar's More menu was used: close the menu (the shell's Menu) and hand the focus back to its button. */
  function closeCalMenu(from: Element) {
    const m = from.closest<HTMLElement>('[data-ws-menu]');
    const pop = m?.querySelector<HTMLElement>(':scope > .ws-menu-pop'), button = m?.querySelector<HTMLButtonElement>(':scope > button');
    if (!m || !pop || !button || pop.hidden) return;
    pop.hidden = true; button.setAttribute('aria-expanded', 'false');
  }
  $('[data-cal-print]')?.addEventListener('click', (e) => { closeCalMenu(e.currentTarget as Element); window.print(); });
  window.addEventListener('popstate', () => {
    const next = fromUrl(new URL(location.href));
    void go(next, { push: false });
    patients?.fromUrl(new URL(location.href));
  });
  // Week view: a day's head opens that day.
  frame.addEventListener('click', (e) => {
    const h = (e.target as Element).closest<HTMLElement>('button.cal-colhead[data-day]');
    if (h) void go({ date: h.dataset.day!, view: 'day' }, { focus: 'first' });
  });

  // --- a card, a free slot -----------------------------------------------------------------------------
  let suppressClick = false;
  function onCardClick(e: MouseEvent) {
    if (suppressClick) { suppressClick = false; e.preventDefault(); return; }
    const b = (e.target as Element).closest<HTMLButtonElement>('.cal-card[data-id]');
    if (b) { S.focusId = b.dataset.id!; panels.openVisit(b.dataset.id!, b); return; }
    const lane = (e.target as Element).closest<HTMLElement>('.cal-lanecol[data-lane]');
    if (lane && !S.phone && !(e.target as Element).closest('.cal-colhead')) {
      const min = minuteAt(lane, e.clientY, 0);
      const ymd = S.view === 'week' ? lane.dataset.lane! : S.date;
      panels.openBook({ ymd, min, col: S.view === 'day' ? lane.dataset.lane : undefined, by: S.by }, lane);
    }
  }
  frame.addEventListener('click', onCardClick);
  list.addEventListener('click', onCardClick);
  $('[data-reqs]')!.addEventListener('click', onCardClick);
  $('[data-cal-undated]')?.addEventListener('click', onCardClick);
  $('[data-cal-new]')!.addEventListener('click', (e) => panels.openBook({ ymd: S.date, by: S.by }, e.currentTarget as HTMLElement));

  const mpx = () => MPX[S.view];
  function minuteAt(lane: HTMLElement, clientY: number, grab: number) {
    const r = lane.getBoundingClientRect();
    const m = geo.start + Math.floor(((clientY - r.top) / mpx() - grab) / 15) * 15;
    return Math.max(geo.start, Math.min(geo.end - 15, m));
  }
  // The free-slot hint under the pointer: "+ 10:15 am".
  const slot = el('div', 'cal-slot'); slot.hidden = true; slot.setAttribute('aria-hidden', 'true');
  function showSlot(lane: HTMLElement | null, min: number, dur: number, text: string) {
    if (!lane) { slot.hidden = true; return; }
    if (slot.parentElement !== lane) lane.append(slot);
    slot.style.cssText = `--s:${min - geo.start};--d:${Math.max(15, Math.min(dur, geo.end - min))}`;
    slot.textContent = text; slot.hidden = false;
  }
  frame.addEventListener('pointermove', (e) => {
    if (drag || S.phone || e.pointerType === 'touch') return;
    const t = e.target as Element;
    const lane = t.closest<HTMLElement>('.cal-lanecol[data-lane]');
    if (!lane || t.closest('.cal-card')) { slot.hidden = true; return; }
    const m = minuteAt(lane, e.clientY, 0);
    showSlot(lane, m, 15, `+ ${M.hm(m)}`);
  });
  frame.addEventListener('pointerleave', () => { if (!drag) slot.hidden = true; });

  // --- drag to move ----------------------------------------------------------------------------------------
  // Pointer events, a mouse or a finger. Six pixels of travel start a drag, so a click still opens the visit.
  // The ghost follows the hand, the slot under it shows where it would land, and the calendar scrolls at its edges.
  type Drag = { el: HTMLButtonElement; c: Card; x0: number; y0: number; started: boolean; ghost: HTMLElement | null; grab: number; dur: number; dx: number; dy: number; w: number; h: number; lane: HTMLElement | null; min: number; fromLane: boolean; pid: number; time: string };
  let drag: Drag | null = null;
  let autoscroll = 0;
  function onDown(e: PointerEvent) {
    if (e.button !== 0 || drag || S.phone) return;
    const b = (e.target as Element).closest<HTMLButtonElement>('.cal-card[data-id]');
    if (!b) return;
    const c = S.cards.get(b.dataset.id!) ?? S.lane.get(b.dataset.id!);
    if (!c || M.DONE.has(c.status)) return;
    const r = b.getBoundingClientRect();
    const fromLane = !!b.closest('[data-reqs]');
    const dur = Math.max(5, Math.round((Date.parse(c.endsAt) - Date.parse(c.startsAt)) / 60_000));
    // Where the hand holds the visit, in minutes from its start — from the visit's own time, not the card's top,
    // which a cascade may draw a line lower (stack).
    const col = b.closest<HTMLElement>('.cal-lanecol[data-lane]');
    const colStart = S.view === 'week' && col ? M.startMs(col.dataset.lane!) : geo.dayStart;
    // (Half a pixel less, so a card let go where it was lands on its own quarter hour, never the one before.)
    const grab = fromLane || !col ? 0 : (e.clientY - col.getBoundingClientRect().top - 0.5) / mpx() - (M.spanOn(c, colStart).s - geo.start);
    drag = { el: b, c, x0: e.clientX, y0: e.clientY, started: false, ghost: null, grab, dur, dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height, lane: null, min: 0, fromLane, pid: e.pointerId, time: b.querySelector('.cal-card-time')?.textContent ?? '' };
  }
  function onMove(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pid) return;
    if (!drag.started) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
      drag.started = true; S.dragging = true;
      try { drag.el.setPointerCapture(e.pointerId); } catch { /* the pointer is gone */ }
      // From the website's lane the card is drawn as it will sit on the grid — a column wide, as tall as the visit —
      // rather than as the lane's wide card squeezed into that box; on the grid it is the card itself.
      const colW = (frame.querySelector('.cal-lanecol')?.getBoundingClientRect().width ?? 186) - 6;
      const ghost = drag.fromLane
        ? cardEl(drag.c, { s: 0, e: drag.dur, base: 0, week: S.view === 'week' })
        : drag.el.cloneNode(true) as HTMLElement;
      ghost.classList.add('cal-ghost'); ghost.removeAttribute('data-id'); ghost.setAttribute('aria-hidden', 'true');
      const h = drag.fromLane ? Math.max(28, drag.dur * mpx() - 2) : drag.h;
      ghost.style.cssText = `width:${drag.fromLane ? Math.max(120, colW) : drag.w}px;height:${h}px;left:0;top:0`;
      if (drag.fromLane) { drag.dy = 10; drag.dx = Math.min(drag.dx, 40); }
      document.body.append(ghost); document.body.classList.add('is-dragging');
      drag.ghost = ghost; drag.el.classList.add('is-dragging');
    }
    e.preventDefault();
    drag.ghost!.style.transform = `translate(${e.clientX - drag.dx}px, ${e.clientY - drag.dy}px)`;
    const under = document.elementsFromPoint(e.clientX, e.clientY).find((n) => n instanceof HTMLElement && n.matches('.cal-lanecol[data-lane]')) as HTMLElement | undefined;
    // The card under the hand says where it would land (the slot's own label is under it); off the grid, its own time again.
    const ghostTime = drag.ghost!.querySelector<HTMLElement>('.cal-card-time');
    if (under) {
      drag.lane = under; drag.min = minuteAt(under, e.clientY, drag.fromLane ? 0 : drag.grab);
      drag.min = Math.min(drag.min, Math.max(geo.start, geo.end - drag.dur));
      const where = `${M.span(drag.min, drag.min + drag.dur)}${S.view === 'week' ? ` · ${M.dayLabel(under.dataset.lane!, 'day')}` : ` · ${under.dataset.laneLabel}`}`;
      showSlot(under, drag.min, drag.dur, where);
      // The ghost carries the new time only (the column head and the slot name the chair), so its status word keeps its room.
      const at = S.view === 'week' ? `${M.dayLabel(under.dataset.lane!, 'day')} ${M.hm(drag.min)}` : M.span(drag.min, drag.min + drag.dur);
      if (ghostTime && ghostTime.textContent !== at) ghostTime.textContent = at;
    } else {
      drag.lane = null; slot.hidden = true;
      if (ghostTime && ghostTime.textContent !== drag.time) ghostTime.textContent = drag.time;
    }
    // The calendar scrolls when the hand nears its top or bottom edge.
    const fr = frame.getBoundingClientRect();
    const edge = e.clientY < fr.top + 48 && e.clientY > fr.top - 60 ? -1 : e.clientY > fr.bottom - 48 && e.clientY < fr.bottom + 60 ? 1 : 0;
    window.cancelAnimationFrame(autoscroll);
    if (edge) { const tick = () => { frame.scrollTop += edge * 12; autoscroll = window.requestAnimationFrame(tick); }; autoscroll = window.requestAnimationFrame(tick); }
  }
  async function onUp(e: PointerEvent, drop: boolean) {
    if (!drag || e.pointerId !== drag.pid) return;
    const d = drag; drag = null;
    window.cancelAnimationFrame(autoscroll);
    if (!d.started) return;
    S.dragging = false;
    suppressClick = true; window.setTimeout(() => { suppressClick = false; }, 0);
    d.ghost?.remove(); document.body.classList.remove('is-dragging'); d.el.classList.remove('is-dragging');
    slot.hidden = true;
    if (!drop || !d.lane) { renderAll(); return; }
    const c = d.c, key = d.lane.dataset.lane ?? '';
    const ymd = S.view === 'week' ? key : S.date;
    const startMs = M.startMs(ymd) + d.min * 60_000;
    const body: Record<string, unknown> = { id: c.id, startsAt: new Date(startMs).toISOString() };
    const guess: Card = { ...c, startsAt: new Date(startMs).toISOString(), endsAt: new Date(startMs + d.dur * 60_000).toISOString() };
    if (S.view === 'day') {
      if (S.by === 'chair') { body.chair = key === '' ? null : Number(key); guess.chair = body.chair as number | null; }
      else { body.dentistId = key || null; guess.dentistId = key || null; guess.dentistName = key ? (staffById.get(key)?.name ?? c.dentistName) : null; }
    }
    const same = guess.startsAt === c.startsAt && guess.chair === c.chair && guess.dentistId === c.dentistId;
    if (same) {
      renderAll();
      // A request dropped where it already is has no time from the desk yet: say how to place it.
      if (M.isRequest(c)) panels.openVisit(c.id, null, { place: true });
      return;
    }
    // The card moves under the hand; a refusal puts it back with the reason.
    const was = S.cards.get(c.id);
    if (inRange(guess)) S.cards.set(c.id, guess);
    renderAll();
    const r = await call('PATCH', body);
    if (!r.ok) {
      if (was) S.cards.set(c.id, was); else S.cards.delete(c.id);
      renderAll();
      fail(r.error);
      return;
    }
    absorb(r.card);
    toastErr.hidden = true;
    const placed = M.isRequest(c) && !M.isRequest(r.card);
    say(`${placed ? 'Placed' : 'Moved'}: ${r.card.patientName}, ${M.whenOf(r.card.startsAt)}${r.card.chair ? `, Chair ${r.card.chair}` : ''}${r.card.dentistName ? `, ${M.shortName(r.card.dentistName)}` : ''}.${r.texted ? ' The new time is texted to them.' : ''}`,
      inRange(r.card) ? undefined : { label: 'Show that day', ymd: M.manila(r.card.startsAt).ymd, id: r.card.id });
    S.focusId = r.card.id;
    flash(r.card.id);
  }
  for (const zone of [frame, $('[data-reqs]')!]) zone.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', (e) => { void onUp(e, true); });
  window.addEventListener('pointercancel', (e) => { void onUp(e, false); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drag?.started) { e.preventDefault(); e.stopPropagation(); void onUp(new PointerEvent('pointercancel', { pointerId: drag.pid }), false); } }, true);

  // --- the keyboard -----------------------------------------------------------------------------------------
  function focusCard(b: HTMLButtonElement | null) {
    if (!b) { frame.focus({ preventScroll: true }); return; }
    for (const x of $$<HTMLButtonElement>('.cal-card[data-id]', S.phone ? list : frame)) x.tabIndex = -1;
    b.tabIndex = 0; S.focusId = b.dataset.id!;
    b.focus();
    b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
    const k = e.key;
    if (k !== 'ArrowLeft' && k !== 'ArrowRight' && k !== 'ArrowUp' && k !== 'ArrowDown') return;
    const t = e.target as HTMLElement;
    if (typing(t) || document.querySelector('dialog[open]') || drag) return;
    // ← → from anywhere outside a field (nothing on this page scrolls sideways); ↑ ↓ only inside the calendar,
    // so they still scroll the page from anywhere else.
    const inCal = !!t.closest('.dash-cal');
    if (!inCal && (t !== document.body || k === 'ArrowUp' || k === 'ArrowDown')) return;
    if (t.closest('[role="tablist"], nav.ws-seg, [data-ws-menu], [data-reqs], [data-cal-undated]')) return;
    e.preventDefault();
    if (k === 'ArrowLeft' || k === 'ArrowRight') {
      const dir = k === 'ArrowLeft' ? -1 : 1;
      if (S.view === 'day' || S.phone) { void go({ date: M.addDays(S.date, dir * (S.view === 'week' ? 7 : 1)) }, { focus: 'first' }); return; }
      // From the day of the card in focus, when one is; else from the selected day.
      const onCard = t.closest<HTMLElement>('.cal-lanecol[data-lane]')?.dataset.lane;
      const nextDay = M.addDays(onCard && M.realDay(onCard) ? onCard : S.selDay, dir);
      const r = rangeOf(S.date, 'week');
      if (nextDay < r.first || nextDay > M.addDays(r.first, 6)) { S.selDay = nextDay; void go({ date: nextDay }, { focus: 'first' }); return; }
      S.selDay = nextDay; S.focusId = null;
      renderCalendar();
      focusCard(cardsInOrder(S.selDay)[0] ?? null);
      if (!cardsInOrder(S.selDay).length) frame.querySelector<HTMLElement>(`button.cal-colhead[data-day="${S.selDay}"]`)?.focus();
      return;
    }
    const cards = cardsInOrder(S.view === 'week' ? S.selDay : undefined);
    if (!cards.length) return;
    const i = cards.findIndex((b) => b === document.activeElement);
    const next = i < 0 ? (k === 'ArrowDown' ? 0 : cards.length - 1) : Math.max(0, Math.min(cards.length - 1, i + (k === 'ArrowDown' ? 1 : -1)));
    focusCard(cards[next]);
  });

  // --- a phone or a desk ---------------------------------------------------------------------------------------
  window.matchMedia('(max-width: 767px)').addEventListener('change', (e) => { S.phone = e.matches; S.scrollTo = true; renderLane(); renderCalendar(); });

  // --- the rest of the page -------------------------------------------------------------------------------------
  const ctx: Ctx = {
    boot, el, call, absorb, card: (id) => S.cards.get(id) ?? S.lane.get(id) ?? S.today.get(id),
    dayCards: (ymd) => {
      const r = rangeOf(S.date, S.view);
      const s = M.startMs(ymd);
      if (s < r.from || s >= r.to) return null;
      return [...S.cards.values()].filter((c) => Date.parse(c.startsAt) >= s && Date.parse(c.startsAt) < s + M.DAY_MS);
    },
    staffById, say, fail, show, flash, filter,
    setWhose: (whose) => { void go(whose === 'mine' ? { dentist: '', by: 'dentist' } : { dentist: 'all' }); },
    url: () => calUrl(),
    panels: null as unknown as Panels,
    patients: null as unknown as PatientsList,
  };
  patients = initPatients(ctx);
  ctx.patients = patients;
  panels = initPanels(ctx);
  ctx.panels = panels;

  renderAll();

  // What the link asked for: a new booking, a visit, the lane, the patients.
  const whenShellReady = (f: () => void) => (window.ws ? f() : document.addEventListener('DOMContentLoaded', f, { once: true }));
  whenShellReady(() => {
    const clean = new URL(location.href);
    let changed = false;
    for (const k of ['new', 'booking', 'patient', 'stale', 'refused']) if (clean.searchParams.has(k)) { clean.searchParams.delete(k); changed = true; }
    if (boot.open.booking) {
      // On the day asked for, or — a request still waiting for a time, whatever day it asks — in the website's lane.
      const c = S.cards.get(boot.open.booking) ?? S.lane.get(boot.open.booking);
      if (c) { S.focusId = c.id; setRoving(); panels.openVisit(c.id, document.querySelector(`.cal-card[data-id="${c.id}"]`)); }
      else fail('That booking is not on the book for this day any more. It may have been cancelled or moved; search for the patient to find it.');
    } else if (boot.open.new) {
      panels.openBook({ ymd: S.date, by: S.by, patientId: boot.open.patient ?? undefined }, $('[data-cal-new]'));
    }
    if (changed) history.replaceState({ dash: true }, '', clean.pathname + clean.search + clean.hash);
    // After the load's own scroll to the fragment, which would otherwise take the focus back off the field.
    if (location.hash === '#patients') {
      const f = () => window.requestAnimationFrame(() => patients?.focus());
      if (document.readyState === 'complete') f(); else window.addEventListener('load', f, { once: true });
    }
    if (location.hash === '#requests' || location.hash === '#web-title') {
      const lane = $('[data-reqs]')!;
      lane.scrollIntoView({ block: 'start' });
      lane.classList.add('is-flash');
    }
  });
}
