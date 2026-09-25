// The Dashboard's three side panels — a visit, a new booking, a patient —
// filled in the browser from what the page already has. They are the shell's
// <SidePanel>s (window.ws.openPanel / closePanel: a modal dialog, Escape and
// the scrim close it, focus returns to the card or row that opened it).
//
// Every change is one call to /api/schedule through ctx.call; the panel and
// the calendar are redrawn from the server's answer (ctx.absorb). A refusal
// is shown inside the panel where the hand is, in the server's own sentence.
// The status buttons are the server's state machine (boot.next = NEXT_STATUS
// in src/lib/schedule.ts), so a button is only ever one the server allows.
//
// Very simple (the soft template): each panel has one teal button — the step
// most likely next — a couple of quiet ones beside it, and the rest behind
// More (the shell's <Menu>, filled here). Sentences come back in tinted
// callouts with an icon; people carry their initials avatar.
import * as M from './model';
import { statusOf } from '../status';
import type { IconName } from '../icons';
import { avatar, callout, icon, pill } from './ui';
import type { Card } from './model';
import type { Ctx } from './board';
import type { Pt } from './patients';

export interface Panels {
  openVisit: (id: string, opener: Element | null, o?: { place?: boolean }) => void;
  openBook: (o: { ymd?: string; min?: number; col?: string; by?: 'chair' | 'dentist'; patientId?: string }, opener: Element | null) => void;
  openPatient: (id: string, opener: Element | null) => void;
}

/** The words on each status button; the order is the order they appear in. */
const STEP: [string, string][] = [
  ['confirmed', 'Confirm'], ['arrived', 'Arrived'], ['in_lobby', 'In the lobby'], ['in_chair', 'In the chair'],
  ['completed', 'Done'], ['no_show', 'No-show'], ['cancelled', 'Cancel'],
];
/** What each status step means, under its words in the More menu: the desk can tell "Arrived" (the teal button
 *  on a visit today) from "In the lobby" without guessing. */
const STEP_HINT: Record<string, string> = {
  confirmed: 'They said they will come',
  arrived: 'Here, checking in at the desk',
  in_lobby: 'Checked in, waiting to be seated',
  in_chair: 'Seated with the dentist',
  completed: 'The visit is over',
  no_show: 'They did not come',
};
/** The icon beside each status step. */
const STEP_ICON: Record<string, IconName> = {
  confirmed: 'check', arrived: 'user', in_lobby: 'clock', in_chair: 'user', completed: 'check', no_show: 'alert', cancelled: 'close',
};
const DAYWORD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** What a status change says, once it is saved. */
const SAID: Record<string, (name: string) => string> = {
  confirmed: (n) => `${n}'s visit is confirmed.`,
  arrived: (n) => `${n} has arrived.`,
  in_lobby: (n) => `${n} is in the lobby.`,
  in_chair: (n) => `${n} is in the chair.`,
  completed: (n) => `${n}'s visit is done.`,
  no_show: (n) => `${n} is marked a no-show.`,
};

export function initPanels(ctx: Ctx): Panels {
  const { boot, el } = ctx;
  const $ = <T extends Element = HTMLElement>(sel: string, from: ParentNode = document) => from.querySelector<T>(sel);
  const ws = () => window.ws!;
  const show = (p: HTMLElement, text: string) => callout(p, text);
  const hide = (p: HTMLElement) => { p.hidden = true; p.replaceChildren(); };
  const allergyOf = (c: Card): string => { const raw = c.allergies as unknown; return Array.isArray(raw) ? (raw as string[]).join(', ') : (raw as string | null) ?? ''; };
  const pt = (id: string): Pt | undefined => ctx.patients.byId.get(id);
  const recordHref = (id: string) => `${boot.links.record}${id}/`;
  // Finances' new charge, pre-filled: ?patient=<id>&service=<fee guide id> (src/pages/c/[clinic]/finances/new.astro).
  const chargeHref = (patientId: string, catalogId: string | null) => {
    const q = new URLSearchParams({ patient: patientId });
    if (catalogId) q.set('service', catalogId);
    return `${boot.links.charge}?${q}`;
  };
  // Messages texts anyone on the book today or tomorrow with a mobile on file (its own rule, checked again
  // when the text is sent); ?to= names the patient. For anyone else the action is left out, not offered and refused.
  const textHref = (patientId: string) => `${boot.links.messages}?to=${encodeURIComponent(patientId)}`;
  const tomorrow = M.addDays(boot.today, 1);
  const soon = (iso: string | null) => !!iso && M.manila(iso).ymd >= boot.today && M.manila(iso).ymd <= tomorrow;
  const textableVisit = (c: Card) => !!c.phone && ((soon(c.startsAt) && c.status !== 'cancelled' && c.status !== 'no_show') || soon(pt(c.patientId)?.next ?? null));
  const textablePatient = (p: Pt) => !!p.phone && (p.today || soon(p.next));
  /** Replace one panel with another: the first slides out, then the next slides in. */
  function swap(fromId: string, then: () => void) {
    const d = document.getElementById(fromId) as HTMLDialogElement | null;
    if (d?.open) { d.addEventListener('close', () => then(), { once: true }); ws().closePanel(fromId); } else then();
  }
  function dl(target: HTMLElement, rows: [string, string | Node | null | undefined, string?][]) {
    target.replaceChildren();
    for (const [k, v, sub] of rows) {
      if (v === null || v === undefined || v === '') continue;
      const dd = el('dd');
      dd.append(v);
      if (sub) dd.append(el('span', 'vp-sub', sub));
      target.append(el('dt', 'meta', k), dd);
    }
  }
  function link(text: string, href: string) { const a = el('a', '', text); a.href = href; return a; }
  function alertChips(target: HTMLElement, allergies: string, conditions: string) {
    target.replaceChildren();
    if (allergies) target.append(pill(`Allergy: ${allergies}`, 'red', 'alert'));
    for (const c of conditions ? conditions.split(', ') : []) target.append(pill(c, 'amber'));
  }
  /** The person at the top of a panel's patient part: avatar, name (a link to the record), a small line. */
  function who(target: HTMLElement, name: string, id: string, sub: string) {
    const a = link(name, recordHref(id));
    a.className = 'vp-who-name';
    const words = el('span', 'vp-who-words');
    words.append(a, el('span', 'vp-who-sub', sub));
    target.replaceChildren(avatar(name, 'lg'), words);
  }
  /** The dentists in on a given day, plus whoever is chosen already so a saved choice never vanishes. */
  function fillDentists(select: HTMLSelectElement, ymd: string, keep: string, keepName?: string | null) {
    const d = M.dowOf(ymd);
    const opts = [new Option('Any dentist', '')];
    for (const s of boot.staff) if (s.days.includes(d) || s.id === keep) opts.push(new Option(s.days.includes(d) ? s.name : `${s.name} · not in on ${DAYWORD[d]}`, s.id));
    if (keep && !opts.some((o) => o.value === keep)) opts.push(new Option(keepName ?? 'Dentist', keep));
    select.replaceChildren(...opts);
    select.value = keep;
  }
  const QUIET = 'ws-btn ws-btn-quiet ws-btn-sm', PRIMARY = 'ws-btn ws-btn-primary ws-btn-sm';
  const btn = (label: string, cls = QUIET, ic?: IconName) => { const b = el('button', cls); b.type = 'button'; if (ic) b.append(icon(ic)); b.append(label); return b; };
  const linkBtn = (label: string, href: string, cls = QUIET, ic?: IconName) => { const a = el('a', cls); a.href = href; if (ic) a.append(icon(ic)); a.append(label); return a; };
  /** One line of a More menu: a tinted icon square and the words (the shell's .ws-menu-item). */
  function menuItem(label: string, o: { href?: string; ic?: IconName; tint?: string; danger?: boolean; hint?: string }): HTMLElement {
    const it = o.href ? el('a', 'ws-menu-item') : el('button', 'ws-menu-item');
    if (it instanceof HTMLAnchorElement) it.href = o.href!; else (it as HTMLButtonElement).type = 'button';
    if (o.ic) { const sq = el('span', 'ws-menu-icon'); sq.dataset.tint = o.tint ?? 'teal'; sq.append(icon(o.ic)); it.append(sq); }
    const words = el('span', 'ws-menu-words', label);
    if (o.hint) words.append(el('span', 'ws-menu-hint', o.hint));
    it.append(words);
    if (o.danger) it.classList.add('vp-danger');
    return it;
  }
  /** Close a More menu (the shell's Menu) after one of its lines was used, and show or hide it by what is in it. */
  function menuOf(list: HTMLElement) {
    const m = list.closest<HTMLElement>('[data-ws-menu]')!;
    const button = m.querySelector<HTMLButtonElement>(':scope > button')!, pop = m.querySelector<HTMLElement>(':scope > .ws-menu-pop')!;
    return {
      close: (focus = false) => { if (!pop.hidden) { pop.hidden = true; button.setAttribute('aria-expanded', 'false'); if (focus) button.focus(); } },
      fit: () => { m.hidden = list.childElementCount === 0; },
    };
  }

  // ================================================================ a visit
  const V = {
    panel: document.getElementById('visit') as HTMLDialogElement,
    actions: $('[data-vp-actions]')!, more: $('[data-vp-more]')!, err: $('[data-vp-error]')!, said: $('[data-vp-said]')!,
    ask: $('[data-vp-ask]')!, askTitle: $('[data-vp-ask-title]')!, askYes: $<HTMLButtonElement>('[data-vp-ask-yes]')!, askKeep: $<HTMLButtonElement>('[data-vp-ask-keep]')!,
    visit: $('[data-vp-visit]')!, patient: $('[data-vp-patient]')!, alerts: $('[data-vp-alerts]')!, who: $('[data-vp-who]')!,
    move: $<HTMLFormElement>('[data-vp-move]')!, moveHead: $('#vp-move-h')!, moveTitle: $('[data-vp-move-title]')!, moveNote: $('[data-vp-move-note]')!,
    date: $<HTMLInputElement>('[data-vp-date]')!, time: $<HTMLInputElement>('[data-vp-time]')!, chair: $<HTMLSelectElement>('[data-vp-chair]')!,
    minutes: $<HTMLInputElement>('[data-vp-minutes]')!, dentist: $<HTMLSelectElement>('[data-vp-dentist]')!,
    save: $<HTMLButtonElement>('[data-vp-move-save]')!, saveWord: $('[data-vp-move-save-word]')!, moveClose: $<HTMLButtonElement>('[data-vp-move-close]')!,
    title: $('#visit [data-ws-title]')!, meta: $('#visit [data-ws-meta]')!,
  };
  const vMenu = menuOf(V.more);
  let current: string | null = null;
  let busy = false;

  /** The one step the desk most likely takes next, drawn as the teal button. */
  function primaryOf(c: Card, allowed: string[]): string | null {
    const day = M.manila(c.startsAt).ymd;
    const pick = (s: string) => (allowed.includes(s) ? s : null);
    if (c.status === 'in_chair') return pick('completed');
    if (c.status === 'arrived' || c.status === 'in_lobby') return pick('in_chair');
    if (c.status === 'booked' || c.status === 'confirmed') return day <= boot.today ? pick('arrived') : pick('confirmed');
    return null;
  }

  function fillVisit(c: Card, o: { place?: boolean } = {}) {
    const req = M.isRequest(c);
    const p = pt(c.patientId);
    V.title.textContent = c.patientName;
    V.meta.textContent = req ? 'Web request' : c.status === 'completed' ? 'Visit, done' : 'Visit';
    V.meta.hidden = false;
    V.ask.hidden = true;
    V.askTitle.textContent = req ? 'Decline this request?' : 'Cancel this visit?';
    V.askYes.textContent = req ? 'Yes, decline it' : 'Yes, cancel it';

    // Actions: the status steps the server allows from here — and, to keep the panel to what the desk
    // would press, only the ones that make sense for when the visit is: a request is placed or declined,
    // a visit on a later day is confirmed or cancelled, today's and past days' get every step.
    // On screen: the likeliest next step (teal), Move, Open record; behind More: the rest.
    const later = M.manila(c.startsAt).ymd > boot.today;
    const allowed = (boot.next[c.status] ?? []).filter((to) => (req ? to === 'cancelled' : later ? to === 'confirmed' || to === 'cancelled' : true));
    const primary = req ? null : primaryOf(c, allowed);
    // Once a visit is done, what the desk does next is the bill (for the people who may see money).
    const chargeFirst = boot.finance && c.status === 'completed';
    V.actions.replaceChildren();
    V.more.replaceChildren();
    if (req) {
      const b = btn('Place it', PRIMARY, 'calendar');
      b.addEventListener('click', () => toMove());
      V.actions.append(b);
    }
    for (const [to, word] of STEP) {
      if (!allowed.includes(to) || to !== primary) continue;
      const b = btn(word, PRIMARY, STEP_ICON[to]);
      b.dataset.to = to;
      b.addEventListener('click', () => void setStatus(c.id, to, word));
      V.actions.append(b);
    }
    if (chargeFirst) V.actions.append(linkBtn('Charge', chargeHref(c.patientId, c.catalogId), PRIMARY, 'money'));
    if (!M.DONE.has(c.status) && !req) { const b = btn('Move', QUIET, 'clock'); b.addEventListener('click', () => toMove()); V.actions.append(b); }
    V.actions.append(linkBtn('Open record', recordHref(c.patientId), QUIET, 'file'));

    // More: the other steps, then charge and text, then Cancel (asked first).
    for (const [to, word] of STEP) {
      if (!allowed.includes(to) || to === primary || to === 'cancelled') continue;
      const it = menuItem(word, { ic: STEP_ICON[to], tint: to === 'no_show' ? 'red' : to === 'completed' ? 'green' : 'teal', hint: STEP_HINT[to] });
      it.dataset.to = to;
      it.addEventListener('click', () => { vMenu.close(); void setStatus(c.id, to, word); });
      V.more.append(it);
    }
    if (boot.finance && !chargeFirst) V.more.append(menuItem('Charge', { href: chargeHref(c.patientId, c.catalogId), ic: 'money', tint: 'green', hint: 'A statement for this visit' }));
    if (textableVisit(c)) V.more.append(menuItem('Text the patient', { href: textHref(c.patientId), ic: 'message', tint: 'blue' }));
    if (allowed.includes('cancelled')) {
      if (V.more.childElementCount) { const sep = el('div', 'ws-menu-sep'); sep.setAttribute('aria-hidden', 'true'); V.more.append(sep); }
      const it = menuItem(req ? 'Decline the request…' : 'Cancel the visit…', { ic: 'close', tint: 'red', danger: true });
      it.dataset.to = 'cancelled';
      it.addEventListener('click', () => { vMenu.close(); V.ask.hidden = false; V.ask.scrollIntoView({ block: 'nearest' }); V.askYes.focus(); });
      V.more.append(it);
    }
    vMenu.fit();

    // The visit.
    const dur = Math.round((Date.parse(c.endsAt) - Date.parse(c.startsAt)) / 60_000);
    const chip = el('span', `ws-chip cal-status`, req ? 'Request, not placed yet' : M.statusWord(c.status));
    chip.dataset.status = req ? 'request' : c.status;
    const booked = [M.sourceLine(c), c.createdAt && M.whenOf(c.createdAt)].filter(Boolean).join(', ');
    dl(V.visit, [
      c.dateOnly
        ? ['When', M.dateText(c.startsAt), 'No time on record: from the clinic’s earlier records']
        : ['When', `${M.whenOf(c.startsAt)} – ${M.timeOf(c.endsAt)}`, `${dur} minutes${req ? ' · the time the patient asked for' : ''}`],
      ['Status', chip],
      // One name for the visit, the card's: the service and the teeth its reason names ("Filling · tooth 26"). The
      // reason as written ("Restoration 26", what the record and search show) under it when it says more than that.
      ['Service', M.whatOf(c) || 'None given', (() => { const r = M.reasonBeyond(c); return r ? `Reason: ${r}` : undefined; })()],
      // No price: either the service has none in the fee guide, or no fee-guide service is recorded for the visit
      // (an older or imported visit whose reason names none) — which one, in words.
      ['Price', c.price ? M.priceLong(c.price) : c.catalogId ? 'Not priced in the fee guide' : 'No fee-guide service on this visit', c.price ? 'From the fee guide' : undefined],
      ['Dentist', c.dentistName ?? 'Any dentist', c.dentistFree && !c.dentistId ? 'As the old record names them' : undefined],
      ['Chair', c.chair === null ? (M.DONE.has(c.status) ? 'None' : 'No chair yet') : `Chair ${c.chair}`],
      [c.source === 'import' ? 'Brought in' : 'Booked', booked, c.publicRef ? `Booking ref ${c.publicRef}` : undefined],
      ['Moved', c.movedAt ? M.whenOf(c.movedAt) : null],
      ['Notes', c.notes],
    ]);

    // The patient.
    const age = M.ageOf(p?.birth ?? c.birth, boot.today);
    who(V.who, c.patientName, c.patientId, [age === null ? null : `${age} years`, `Chart ${c.chartNo}`].filter(Boolean).join(' · '));
    alertChips(V.alerts, allergyOf(c), c.conditions ?? (p ? p.conditions.join(', ') : ''));
    const bal = p?.balance ?? null;
    const nextOther = p?.next && p.nextId !== c.id ? M.nearWhen(p.next, boot.today) : null;
    dl(V.patient, [
      ['Mobile', c.phone ? M.prettyPhone(c.phone) : 'None on file', bookersNumber(c) ? `${c.bookedFor}’s number: they booked it` : undefined],
      ['Age', age === null ? 'No birth date on file' : null],
      ['HMO', c.patientHmo ?? p?.hmo ?? c.hmo ?? 'None on file',
        c.hmo && !(c.patientHmo ?? p?.hmo ?? c.hmo).startsWith(c.hmo) ? `This visit was booked under ${c.hmo}` : undefined],
      ['Balance', boot.finance ? (bal === null ? '—' : bal > 0 ? M.pesoBal(bal) : bal < 0 ? `${M.pesoBal(-bal)} credit` : 'Nothing owed') : null],
      ['Last visit', p ? (p.last ? M.dateText(p.last) : 'None yet') : null],
      ['Next visit', nextOther],
    ]);

    // Move (or place): the visit's own values to start from. Folded until Move or Place it is pressed.
    V.move.hidden = true;
    V.moveTitle.textContent = req ? 'Give it a time' : 'Move to a new time';
    moveNoteBase = req
      ? 'Pick a chair and a time. Until then it is not a booking and no reminder goes out.'
      : 'A new time for a visit still ahead is texted to the patient.';
    V.moveNote.textContent = closedNote(M.manila(c.startsAt).ymd, moveNoteBase);
    V.saveWord.textContent = req ? 'Place it' : 'Save new time';
    const m = M.manila(c.startsAt);
    V.date.value = m.ymd; V.time.value = M.hhmm(m.min);
    V.minutes.value = String(Math.max(5, dur));
    fillDentists(V.dentist, m.ymd, c.dentistId ?? '', c.dentistName);
    V.chair.value = c.chair === null ? '' : String(c.chair);
    if (req && c.chair === null) {
      // The first chair free at the asked time, so "Place it" is usually one press.
      const day = ctx.dayCards(m.ymd);
      if (day) {
        for (let n = 1; n <= boot.chairs; n++) {
          const clash = day.some((x) => x.id !== c.id && x.chair === n && !M.DONE.has(x.status) && Date.parse(x.startsAt) < Date.parse(c.endsAt) && Date.parse(x.endsAt) > Date.parse(c.startsAt));
          if (!clash) { V.chair.value = String(n); break; }
        }
      } else V.chair.value = '1';
    }
    if (o.place) window.setTimeout(() => toMove(), 320);
  }
  /** The visit texts the number it was booked from; say so when that is someone else's (the patient's own differs). */
  function bookersNumber(c: Card): boolean {
    const p = pt(c.patientId), d = (x: string | null) => (x ?? '').replace(/\D/g, '').slice(-10);
    return !!(c.bookedFor && c.phone && p && d(p.phone) !== d(c.phone));
  }
  function toMove() {
    V.move.hidden = false;
    V.moveHead.scrollIntoView({ block: 'start', behavior: 'smooth' });
    V.date.focus({ preventScroll: true });
  }
  V.moveClose.addEventListener('click', () => {
    V.move.hidden = true;
    V.actions.querySelector<HTMLElement>('.ws-btn-primary, button')?.focus();
  });

  function openVisit(id: string, opener: Element | null, o: { place?: boolean } = {}) {
    const c = ctx.card(id);
    if (!c) return;
    current = id;
    hide(V.err); hide(V.said);
    fillVisit(c, o);
    if (V.panel.open) return;
    swap('book', () => swap('patient', () => ws().openPanel('visit', opener)));
  }
  V.panel.addEventListener('ws:panel-close', () => {
    // The card that opened it may have been redrawn since: find it again by id.
    const id = current; current = null;
    if (id && !(document.activeElement instanceof HTMLElement && document.activeElement !== document.body)) {
      document.querySelector<HTMLElement>(`.cal-card[data-id="${id}"]`)?.focus({ preventScroll: true });
    }
  });

  async function patch(body: Record<string, unknown>): Promise<{ card: Card; texted: boolean } | null> {
    if (busy) return null;
    busy = true; V.panel.setAttribute('aria-busy', 'true');
    vMenu.close();
    for (const b of V.panel.querySelectorAll<HTMLButtonElement>('button')) if (!b.hasAttribute('data-ws-close')) b.disabled = true;
    const r = await ctx.call('PATCH', body);
    busy = false; V.panel.removeAttribute('aria-busy');
    for (const b of V.panel.querySelectorAll<HTMLButtonElement>('button')) b.disabled = false;
    if (!r.ok) { hide(V.said); show(V.err, r.error); V.err.scrollIntoView({ block: 'nearest' }); return null; }
    hide(V.err);
    ctx.absorb(r.card);
    ctx.flash(r.card.id);
    return r;
  }
  async function setStatus(id: string, to: string, word: string) {
    const was = ctx.card(id);
    const r = await patch({ id, status: to });
    if (!r) return;
    const c = r.card;
    if (to === 'cancelled') {
      ws().closePanel('visit');
      ctx.say(`${was && M.isRequest(was) ? 'Declined' : 'Cancelled'}: ${c.patientName}, ${M.whenOf(c.startsAt)}. Texts still waiting for it are dropped.`);
      return;
    }
    if (current === id) fillVisit(c);
    show(V.said, SAID[c.status]?.(c.patientName) ?? `${c.patientName}: ${statusOf(c.status).label}.`);
    V.actions.querySelector<HTMLElement>('.ws-btn-primary, .ws-btn')?.focus();
  }
  V.askYes.addEventListener('click', () => { if (current) void setStatus(current, 'cancelled', 'Cancelled'); });
  V.askKeep.addEventListener('click', () => { V.ask.hidden = true; V.more.closest<HTMLElement>('[data-ws-menu]')?.querySelector<HTMLElement>(':scope > button')?.focus(); });
  const DAYNAME = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
  /** One line under the move form: a closed day is allowed, but said. */
  function closedNote(ymd: string, base: string) {
    const d = M.realDay(ymd) ? M.dowOf(ymd) : -1;
    return d >= 0 && !M.hoursOf(boot.hours, d) ? `${base} The clinic is closed on ${DAYNAME[d]}.` : base;
  }
  let moveNoteBase = '';
  V.date.addEventListener('change', () => {
    fillDentists(V.dentist, V.date.value || boot.today, V.dentist.value);
    V.moveNote.textContent = closedNote(V.date.value, moveNoteBase);
  });
  V.move.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!current) return;
    const was = ctx.card(current);
    const minutes = Number(V.minutes.value);
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 480) return show(V.err, 'Minutes is a whole number from 5 to 480.');
    if (!M.realDay(V.date.value) || !/^\d{2}:\d{2}/.test(V.time.value)) return show(V.err, 'Pick a date and a time.');
    const r = await patch({ id: current, startsAt: M.isoOf(V.date.value, V.time.value), minutes, chair: V.chair.value === '' ? null : Number(V.chair.value), dentistId: V.dentist.value || null });
    if (!r) return;
    const c = r.card;
    const placed = was ? M.isRequest(was) && !M.isRequest(c) : false;
    const where = `${M.whenOf(c.startsAt)}${c.chair ? `, Chair ${c.chair}` : ''}${c.dentistName ? `, ${M.shortName(c.dentistName)}` : ''}`;
    const sentence = `${placed ? 'Placed' : 'Moved'}: ${where}.${r.texted ? ' The new time is texted to them.' : ''}`;
    if (current === c.id) fillVisit(c);
    show(V.said, sentence);
    V.said.scrollIntoView({ block: 'nearest' });
    const onScreen = document.querySelector(`.cal-card[data-id="${c.id}"]`);
    ctx.say(`${c.patientName}: ${sentence}`, onScreen ? undefined : { label: 'Show that day', ymd: M.manila(c.startsAt).ymd, id: c.id });
  });

  // ================================================================ a new booking
  const B = {
    panel: document.getElementById('book') as HTMLDialogElement,
    form: $<HTMLFormElement>('[data-bk-form]')!, err: $('[data-bk-error]')!,
    lookup: $('[data-bk-lookup]')!, search: $<HTMLInputElement>('[data-bk-search]')!, results: $<HTMLUListElement>('[data-bk-results]')!,
    hint: $('[data-bk-hint]')!, toggle: $<HTMLInputElement>('[data-bk-toggle]')!,
    chosen: $('[data-bk-chosen]')!, chosenName: $('[data-bk-chosen-name]')!, chosenMore: $('[data-bk-chosen-more]')!, change: $<HTMLButtonElement>('[data-bk-change]')!,
    newBox: $('[data-bk-new]')!, name: $<HTMLInputElement>('[data-bk-name]')!, phone: $<HTMLInputElement>('[data-bk-phone]')!,
    service: $<HTMLSelectElement>('[data-bk-service]')!, price: $('[data-bk-price]')!, reason: $<HTMLInputElement>('[data-bk-reason]')!,
    date: $<HTMLInputElement>('[data-bk-date]')!, time: $<HTMLInputElement>('[data-bk-time]')!, minutes: $<HTMLInputElement>('[data-bk-minutes]')!,
    chair: $<HTMLSelectElement>('[data-bk-chair]')!, free: $('[data-bk-free]')!, dentist: $<HTMLSelectElement>('[data-bk-dentist]')!,
    notes: $<HTMLTextAreaElement>('[data-bk-notes]')!, save: $<HTMLButtonElement>('[data-bk-save]')!, saveWord: $('[data-bk-save-word]')!,
    face: $('[data-bk-chosen-face]')!, more: $<HTMLDetailsElement>('[data-bk-more]')!,
  };
  let patientId = '';
  let autoReason = false;

  function choose(p: { id: string; name: string; chart: string; phone: string | null }) {
    patientId = p.id;
    B.chosenName.textContent = p.name;
    B.chosenMore.textContent = [p.chart, p.phone && M.prettyPhone(p.phone)].filter(Boolean).join(' · ');
    B.face.replaceChildren(avatar(p.name));
    B.chosen.hidden = false; B.lookup.hidden = true; B.results.hidden = true; B.newBox.hidden = true; B.toggle.checked = false;
  }
  function unchoose() { patientId = ''; B.chosen.hidden = true; B.lookup.hidden = false; B.search.value = ''; B.results.hidden = true; B.hint.hidden = false; }
  function results(found: { id: string; name: string; chart: string; phone: string | null; note?: string }[], note: string) {
    B.results.replaceChildren(...found.slice(0, 8).map((p) => {
      const li = el('li'), b = el('button'); b.type = 'button';
      const words = el('span', 'bk-result-words');
      words.append(el('b', '', p.name), el('span', '', [p.chart, p.phone && M.prettyPhone(p.phone), p.note].filter(Boolean).join(' · ')));
      b.append(avatar(p.name, 'sm'), words);
      b.addEventListener('click', () => { choose(p); (B.service.value ? B.time : B.service).focus(); });
      li.append(b); return li;
    }));
    B.results.hidden = found.length === 0;
    B.hint.textContent = note; B.hint.hidden = !note;
  }
  const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  let searchTimer = 0, searchAbort: AbortController | null = null;
  B.search.addEventListener('input', () => {
    window.clearTimeout(searchTimer); searchAbort?.abort();
    const q = B.search.value.trim();
    if (q.length < 2) { results([], 'Type two letters of a name, a chart number or a mobile.'); return; }
    const f = fold(q), d = q.replace(/\D/g, '');
    const local = [...ctx.patients.byId.values()].filter((p) =>
      fold(p.chart).includes(f) || (d.length >= 3 && (p.phone ?? '').replace(/\D/g, '').includes(d))
      || f.split(/\s+/).every((w) => fold(`${p.name} ${p.sort}`).includes(w)));
    if (local.length) { results(local.map((p) => ({ ...p, note: p.next ? `next ${M.nearWhen(p.next, boot.today)}` : undefined })), ''); return; }
    // Nobody on the page matches: ask the server, in case they were added a minute ago elsewhere.
    results([], 'Looking…');
    searchTimer = window.setTimeout(async () => {
      searchAbort = new AbortController();
      try {
        // The shell's search (src/pages/api/search.ts): this branch only, the same matching as the top bar.
        const res = await fetch(`/api/search?clinic=${encodeURIComponent(boot.slug)}&q=${encodeURIComponent(q)}`, { credentials: 'same-origin', signal: searchAbort.signal, headers: { accept: 'application/json' } });
        const data = res.ok ? await res.json() : null;
        const found: { id: string; name: string; chartNo: string; mobile: string | null }[] = Array.isArray(data?.patients) ? data.patients : [];
        results(found.map((p) => ({ id: p.id, name: p.name, chart: p.chartNo, phone: p.mobile })),
          res.ok ? (found.length ? '' : 'Nobody on file matches. Tick New patient to add them.') : 'Search did not answer. Tick New patient, or try again.');
      } catch (e) {
        if ((e as Error).name !== 'AbortError') results([], 'Could not reach the clinic to search. Tick New patient, or try again.');
      }
    }, 200);
  });
  B.search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); B.results.querySelector<HTMLButtonElement>('button')?.click(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); B.results.querySelector<HTMLButtonElement>('button')?.focus(); }
  });
  B.results.addEventListener('keydown', (e) => {
    const items = [...B.results.querySelectorAll<HTMLButtonElement>('button')];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); (items[i + (e.key === 'ArrowDown' ? 1 : -1)] ?? B.search).focus(); }
  });
  B.change.addEventListener('click', () => { unchoose(); B.search.focus(); });
  B.toggle.addEventListener('change', () => {
    const on = B.toggle.checked;
    B.newBox.hidden = !on; B.results.hidden = true; B.hint.hidden = on; B.search.disabled = on;
    if (on) { patientId = ''; B.name.value = B.search.value.trim() && !/\d/.test(B.search.value) ? B.search.value.trim() : B.name.value; B.name.focus(); }
  });
  function servicePicked() {
    const o = B.service.selectedOptions[0];
    const svc = boot.catalog.find((s) => s.code === B.service.value);
    B.price.textContent = svc?.price ? `Fee guide: ${M.priceLong(svc.price)}.` : svc ? 'Not priced in the fee guide.' : '';
    if (!o || !o.value) return;
    if (o.dataset.minutes) B.minutes.value = o.dataset.minutes;
    if (!B.reason.value.trim() || autoReason) { B.reason.value = o.dataset.name ?? o.text; autoReason = true; }
    freeHint();
  }
  B.service.addEventListener('change', servicePicked);
  B.reason.addEventListener('input', () => { autoReason = false; });
  B.date.addEventListener('change', () => { fillDentists(B.dentist, B.date.value || boot.today, B.dentist.value); freeHint(); });
  B.minutes.addEventListener('change', freeHint);

  /** "Next free: Chair 2 at 10:30 am", from the day on screen, as a one-press fill. */
  function freeHint() {
    B.free.replaceChildren();
    const ymd = B.date.value;
    const day = M.realDay(ymd) ? ctx.dayCards(ymd) : null;
    const open = M.realDay(ymd) ? M.hoursOf(boot.hours, M.dowOf(ymd)) : null;
    if (!day || !open) return;
    const f = M.nextFree(day, open, M.startMs(ymd), ymd === boot.today, boot.chairs);
    if (!f) { B.free.textContent = ymd === boot.today ? 'No free half hour left today on any chair.' : 'No free half hour on this day.'; return; }
    const b = el('button', '', `Chair ${f.chair} at ${M.hm(f.min)}`); b.type = 'button';
    b.addEventListener('click', () => { B.chair.value = String(f.chair); B.time.value = M.hhmm(f.min); B.time.focus(); });
    B.free.append('Next free half hour: ', b);
  }

  function openBook(o: { ymd?: string; min?: number; col?: string; by?: 'chair' | 'dentist'; patientId?: string }, opener: Element | null) {
    B.form.reset();
    B.more.open = false;
    hide(B.err);
    autoReason = false; B.search.disabled = false; B.price.textContent = '';
    unchoose(); B.newBox.hidden = true;
    results([], 'Type two letters of a name, a chart number or a mobile.');
    const ymd = o.ymd && M.realDay(o.ymd) ? o.ymd : boot.today;
    B.date.value = ymd;
    const open = M.hoursOf(boot.hours, M.dowOf(ymd));
    const nowMin = ymd === boot.today ? Math.ceil(M.manila(Date.now()).min / 15) * 15 : open ? open[0] : 9 * 60;
    const min = o.min ?? Math.max(open ? open[0] : 0, nowMin);
    B.time.value = M.hhmm(Math.min(min, 23 * 60 + 45));
    B.minutes.value = '30';
    const by = o.by ?? 'chair';
    B.chair.value = by === 'chair' && o.col ? o.col : '';
    fillDentists(B.dentist, ymd, by === 'dentist' && o.col !== undefined ? o.col : ctx.filter());
    const p = o.patientId ? ctx.patients.byId.get(o.patientId) : undefined;
    if (p) choose(p);
    freeHint();
    swap('visit', () => swap('patient', () => {
      ws().openPanel('book', opener);
      window.setTimeout(() => (p ? B.service : B.search).focus(), 60);
    }));
  }

  B.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hide(B.err);
    const body: Record<string, unknown> = {};
    if (B.toggle.checked) {
      const name = B.name.value.trim();
      if (!name) { show(B.err, 'Give the new patient a name.'); B.name.focus(); return; }
      body.newPatient = { name, phone: B.phone.value.trim() || undefined };
    } else if (patientId) body.patientId = patientId;
    else { show(B.err, 'Pick a patient from the search, or tick New patient.'); B.search.focus(); return; }
    const minutes = Number(B.minutes.value);
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 480) { show(B.err, 'Minutes is a whole number from 5 to 480.'); B.more.open = true; B.minutes.focus(); return; }
    if (!M.realDay(B.date.value) || !/^\d{2}:\d{2}/.test(B.time.value)) { show(B.err, 'Pick a date and a time.'); B.date.focus(); return; }
    body.startsAt = M.isoOf(B.date.value, B.time.value);
    body.minutes = minutes;
    body.chair = B.chair.value === '' ? null : Number(B.chair.value);
    body.dentistId = B.dentist.value || null;
    if (B.reason.value.trim()) body.reason = B.reason.value.trim();
    if (B.service.value) body.catalogCode = B.service.value;
    if (B.notes.value.trim()) body.notes = B.notes.value.trim();
    B.save.disabled = true; B.saveWord.textContent = 'Saving…';
    const r = await ctx.call('POST', body);
    B.save.disabled = false; B.saveWord.textContent = 'Save booking';
    if (!r.ok) { show(B.err, r.error); B.err.scrollIntoView({ block: 'nearest' }); return; }
    const c = r.card;
    // The new card takes the focus once the panel has gone (the page behind a modal cannot hold it).
    B.panel.addEventListener('close', () => {
      const card = document.querySelector<HTMLElement>(`.cal-card[data-id="${c.id}"]`);
      if (card) { card.focus({ preventScroll: true }); card.scrollIntoView({ block: 'nearest' }); ctx.flash(c.id); }
    }, { once: true });
    ws().closePanel('book');
    ctx.absorb(c);
    const onScreen = document.querySelector(`.cal-card[data-id="${c.id}"]`);
    ctx.say(`Booked: ${c.patientName}, ${M.whenOf(c.startsAt)}${c.chair ? `, Chair ${c.chair}` : ''}${c.dentistName ? `, ${M.shortName(c.dentistName)}` : ''}.${r.texted ? ' A confirmation text is queued.' : ''}`,
      onScreen ? undefined : { label: 'Show that day', ymd: M.manila(c.startsAt).ymd, id: c.id });
  });

  // ================================================================ a patient
  const P = {
    panel: document.getElementById('patient') as HTMLDialogElement,
    actions: $('[data-pp-actions]')!, more: $('[data-pp-more]')!, alerts: $('[data-pp-alerts]')!, facts: $('[data-pp-facts]')!, who: $('[data-pp-who]')!,
    title: $('#patient [data-ws-title]')!, meta: $('#patient [data-ws-meta]')!,
  };
  const pMenu = menuOf(P.more);
  function openPatient(id: string, opener: Element | null) {
    const p = ctx.patients.byId.get(id);
    if (!p) return;
    P.title.textContent = p.name;
    P.meta.textContent = 'Patient'; P.meta.hidden = false;
    P.actions.replaceChildren();
    P.more.replaceChildren();
    const book = btn('New booking', PRIMARY, 'plus');
    book.addEventListener('click', () => openBook({ ymd: boot.today, patientId: p.id }, opener));
    P.actions.append(book, linkBtn('Open record', recordHref(p.id), QUIET, 'file'));
    if (boot.finance) P.more.append(menuItem('Charge', { href: chargeHref(p.id, null), ic: 'money', tint: 'green', hint: 'A statement for this patient' }));
    if (textablePatient(p)) P.more.append(menuItem('Text the patient', { href: textHref(p.id), ic: 'message', tint: 'blue' }));
    pMenu.fit();
    const age = M.ageOf(p.birth, boot.today);
    who(P.who, p.name, p.id, [age === null ? null : `${age} years`, `Chart ${p.chart}`].filter(Boolean).join(' · '));
    alertChips(P.alerts, p.allergies.join(', '), p.conditions.join(', '));
    let next: Node | string = 'None booked';
    if (p.next && p.nextId) {
      const a = el('button', 'vp-link', M.nearWhen(p.next, boot.today)); a.type = 'button';
      const ymd = M.manila(p.next).ymd, visit = p.nextId;
      a.addEventListener('click', () => swap('patient', () => { void ctx.show(ymd, visit); }));
      next = a;
    }
    dl(P.facts, [
      ['Next visit', next],
      ['Mobile', p.phone ? M.prettyPhone(p.phone) : 'None on file'],
      ['Age', age === null ? 'No birth date on file' : null],
      ['HMO', p.hmo ?? 'None on file'],
      ['Balance', boot.finance ? ((p.balance ?? 0) > 0 ? M.pesoBal(p.balance ?? 0) : (p.balance ?? 0) < 0 ? `${M.pesoBal(-(p.balance ?? 0))} credit` : 'Nothing owed') : null],
      ['Last visit', p.last ? M.dateText(p.last) : 'None yet'],
    ]);
    swap('visit', () => swap('book', () => ws().openPanel('patient', opener)));
  }

  return { openVisit, openBook, openPatient };
}
