// The Dashboard's "Today's patients": only the people with a visit today, in
// the order they come, each with the time of that visit, what it is for and
// where it stands. Every patient of the branch — searched, filtered, sorted,
// each record's check — is the Patients tab (/c/<slug>/patients/, the owner,
// 26 Sep 2026); the pane's head links there ("See all patients"), so the
// Dashboard keeps to the day. A row opens the patient beside the list
// (panels.ts).
//
// Today's visits are the page's own (boot.todayCards) and every change the
// calendar takes (absorb), so a booking made, moved, cancelled or finished on
// the calendar adds, moves or drops its patient here at once. A dentist sees
// the patients of their own visits, with the same Mine · Everyone switch as
// the calendar. Balance only for the people who may see money; for anyone
// else the server never read it.
//
// The page still carries every patient (byId), because the side panels and
// the booking panel read a patient's facts from it — only the list is today's.
import * as M from './model';
import { avatar, icon, pill } from './ui';
import type { Card } from './model';
import type { Ctx } from './board';

export type { Pt } from './model';
import type { Pt, PackedPts } from './model';
export interface PatientsList {
  byId: Map<string, Pt>;
  /** Kept for the calendar's address: the list has no filter or search of its own any more. */
  state: () => { pf: string; q: string };
  absorb: (c: Card) => void;
  /** The calendar's Mine · Everyone changed: follow it. */
  scope: () => void;
  fromUrl: (u: URL) => void;
  focus: () => void;
  add: (p: Pt) => void;
}

type Tint = Parameters<typeof pill>[1];
/** The visit's status as a soft pill: the word always, the tint as the calendar's cards (cal.css). */
function statusPill(c: Card): HTMLSpanElement {
  if (M.isRequest(c)) return pill('Request', 'amber');
  const tint: Record<string, Tint> = {
    booked: 'slate', confirmed: 'blue', arrived: 'amber', in_lobby: 'amber', in_chair: 'teal', completed: 'green', no_show: 'red',
  };
  return pill(M.statusWord(c.status), tint[c.status] ?? 'slate');
}

export function initPatients(ctx: Ctx): PatientsList {
  const { boot, el } = ctx;
  const $ = <T extends Element = HTMLElement>(sel: string, from: ParentNode = document) => from.querySelector<T>(sel);
  const list = $('[data-pt-list]')!, empty = $('[data-pt-empty]')!, scopeLine = $('[data-pt-scope]')!;
  const metaLine = $('#patients .ws-pane-head .meta');

  const all: Pt[] = M.unpackPts(boot.patients as PackedPts | Pt[]);
  const byId = new Map(all.map((p) => [p.id, p]));
  // The page carries every patient on file (data.ts leaves archived records out), so a visit on the page whose
  // patient is not among them is an archived record's. The Patients tab leaves those out, and so does this list,
  // so its "with a visit today" and the tab's Today count the same people. (Someone booked at the desk after the
  // page loaded comes in as a stub below, never from this set.)
  const archived = new Set([...boot.cards, ...boot.todayCards, ...boot.toPlace, ...boot.toConfirm]
    .map((c) => c.patientId).filter((id) => !byId.has(id)));

  // Today's visits (Manila), cancelled ones left out — the same rule as the summary strip's.
  const t0 = M.startMs(boot.today);
  const isToday = (c: Card) => c.status !== 'cancelled' && Date.parse(c.startsAt) >= t0 && Date.parse(c.startsAt) < t0 + M.DAY_MS;
  const todays = new Map<string, Card>(boot.todayCards.filter(isToday).map((c) => [c.id, c]));

  const mineOnly = () => boot.me.dentist && ctx.filter() === boot.me.id;

  /** Each patient once, with the visit that decides their row: the first one still ahead of them today, or — all done —
   *  the last one. In the order of those visits. */
  function people(): { p: Pt; c: Card }[] {
    const by = new Map<string, Card[]>();
    for (const c of todays.values()) {
      if (archived.has(c.patientId) || (mineOnly() && c.dentistId !== boot.me.id)) continue;
      const l = by.get(c.patientId); if (l) l.push(c); else by.set(c.patientId, [c]);
    }
    const out: { p: Pt; c: Card }[] = [];
    for (const [id, cards] of by) {
      cards.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      const c = cards.find((x) => !M.DONE.has(x.status)) ?? cards[cards.length - 1];
      const p = byId.get(id) ?? stub(c);
      out.push({ p, c });
    }
    return out.sort((a, b) => a.c.startsAt.localeCompare(b.c.startsAt) || a.p.sort.localeCompare(b.p.sort));
  }

  /** A patient the page did not carry (booked at the desk a moment ago): what the visit says about them. */
  function stub(c: Card): Pt {
    const p: Pt = {
      id: c.patientId, name: c.patientName, sort: c.lastName ? `${c.lastName}, ${c.patientName}` : c.patientName, chart: c.chartNo, phone: c.phone,
      birth: c.birth, allergies: c.allergies ? c.allergies.split(/,\s*/).filter(Boolean) : [], conditions: c.conditions ? c.conditions.split(/,\s*/).filter(Boolean) : [],
      next: null, nextId: null, last: null, today: true, isNew: true, dentists: [], hmo: c.patientHmo ?? c.hmo, balance: boot.finance ? 0 : null,
    };
    all.push(p); byId.set(p.id, p);
    return p;
  }

  function row({ p, c }: { p: Pt; c: Card }): HTMLLIElement {
    const li = el('li');
    const b = el('button', 'pt-row');
    b.type = 'button'; b.dataset.patient = p.id;
    const age = M.ageOf(p.birth, boot.today);
    const main = el('span', 'pt-main');
    // The name wraps between first and last name, never inside a compound surname ("Maria Liza / Dela Cruz").
    const comma = p.sort.indexOf(', '), last = comma > 0 ? p.sort.slice(0, comma) : '';
    const name = el('span', 'pt-name', last && p.name.endsWith(last) ? `${p.name.slice(0, p.name.length - last.length)}${last.replace(/ /g, '\u00a0')}` : p.name);
    if (age !== null) name.append(el('span', 'pt-age', ` · ${age}`));
    main.append(name);
    const what = M.whatOf(c);
    const time = c.dateOnly ? 'Today' : M.timeOf(c.startsAt);
    const when = el('span', 'pt-when');
    when.append(el('b', '', time));
    if (what) when.append(` · ${what}`);
    main.append(when);
    main.append(el('span', 'pt-sub', p.phone ? M.prettyPhone(p.phone) : 'No mobile on file'));
    if (p.allergies.length || p.conditions.length || p.isNew) {
      const marks = el('span', 'pt-marks');
      if (p.allergies.length) marks.append(pill(`Allergy: ${p.allergies.join(', ')}`, 'red', 'alert'));
      for (const x of p.conditions.slice(0, 1)) marks.append(pill(x, 'amber'));
      if (p.conditions.length > 1) marks.append(pill(`+${p.conditions.length - 1}`, 'slate'));
      if (p.isNew) marks.append(pill('New', 'teal'));
      main.append(marks);
    }
    const side = el('span', 'pt-side');
    side.append(statusPill(c));
    // The balance only where there is one: a column of ₱0 is noise.
    const bal = boot.finance ? (p.balance ?? 0) : 0;
    if (bal !== 0) {
      const v = el('span', 'pt-bal', bal > 0 ? M.pesoBal(bal) : `${M.pesoBal(-bal)} credit`);
      v.title = bal > 0 ? 'Owes the clinic' : 'Paid ahead';
      if (bal < 0) v.dataset.zero = '';
      side.append(v);
    }
    b.append(avatar(p.name), main, side);
    const status = M.isRequest(c) ? 'request, not placed yet' : M.statusWord(c.status).toLowerCase();
    const label = [p.name, age !== null ? `${age} years` : '', p.chart, `today ${time === 'Today' ? '' : time}`.trim(), what, status,
      p.phone ?? 'no mobile', p.allergies.length ? `allergy: ${p.allergies.join(', ')}` : '', p.conditions.length ? `alerts: ${p.conditions.join(', ')}` : '',
      p.isNew ? 'new' : '', boot.finance && (p.balance ?? 0) > 0 ? `owes ${M.pesoBal(p.balance ?? 0)}` : ''].filter(Boolean).join(', ');
    b.setAttribute('aria-label', label);
    li.append(b);
    return li;
  }

  /** The friendly empty state: a small icon, one line, and the one thing to do next. */
  function emptyWith(text: string, action?: { label: string; href: string }) {
    empty.replaceChildren();
    const box = el('p', 'ws-empty');
    box.append(icon(all.length ? 'calendar' : 'patients', 20, 'ws-empty-icon'), el('span', 'ws-empty-text', text));
    if (action) { const a = el('a', 'ws-empty-go', action.label); a.href = action.href; a.append(icon('arrow-right', 16)); box.append(a); }
    empty.append(box);
  }

  function render() {
    const found = people();
    list.replaceChildren(...found.map(row));
    list.hidden = found.length === 0;
    const n = found.length;
    if (metaLine) metaLine.textContent = `${n} with a visit today${mineOnly() ? ', with you' : ''}`;
    empty.hidden = n > 0;
    if (!n) {
      if (!all.length) {
        emptyWith(boot.canEdit ? 'No patients yet — add your first, or import your list.' : 'No patients yet. They arrive with their first booking.',
          boot.canEdit ? { label: 'Add patient', href: boot.links.addPatient } : undefined);
      } else {
        // "See all patients" is already at the pane's head: the line says only what is empty.
        emptyWith(mineOnly() ? 'Nobody has a visit with you today.' : 'Nobody has a visit today.');
      }
    }
    // A dentist's scope, in words, with the other half one click away.
    scopeLine.replaceChildren();
    if (boot.me.dentist) {
      const b = el('button', '', mineOnly() ? 'Show everyone' : 'Only mine'); b.type = 'button';
      b.addEventListener('click', () => ctx.setWhose(mineOnly() ? 'all' : 'mine'));
      scopeLine.append(mineOnly() ? 'Your patients today. ' : 'Everyone’s patients today. ', b);
    }
  }

  list.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('.pt-row[data-patient]');
    if (b) ctx.panels.openPatient(b.dataset.patient!, b);
  });

  render();

  return {
    byId,
    state: () => ({ pf: 'all', q: '' }),
    absorb(c: Card) {
      if (archived.has(c.patientId)) return;
      // A visit booked for someone new at the desk: they join at once.
      let p = byId.get(c.patientId);
      if (!p) p = stub(c);
      // What this one visit can say for sure: an earlier coming visit, today, whom it is with.
      const ahead = Date.parse(c.endsAt) > Date.now() && !M.DONE.has(c.status);
      if (ahead && (!p.next || c.startsAt < p.next || p.nextId === c.id)) { p.next = c.startsAt; p.nextId = c.id; }
      if (!ahead && p.nextId === c.id) { p.next = null; p.nextId = null; }
      if (c.status === 'completed' && (!p.last || c.startsAt > p.last)) p.last = c.startsAt;
      if (isToday(c)) { todays.set(c.id, c); p.today = true; } else todays.delete(c.id);
      if (c.dentistId && !p.dentists.includes(c.dentistId)) p.dentists.push(c.dentistId);
      render();
    },
    scope: render,
    fromUrl: () => render(),
    focus() {
      const pane = document.getElementById('patients');
      pane?.scrollIntoView({ block: 'start' });
      (list.querySelector<HTMLButtonElement>('.pt-row') ?? pane?.querySelector<HTMLElement>('[data-pt-all]'))?.focus({ preventScroll: true });
    },
    add(p: Pt) { if (!byId.has(p.id)) { all.push(p); byId.set(p.id, p); render(); } },
  };
}
