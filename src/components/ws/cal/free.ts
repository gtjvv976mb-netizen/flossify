// Free times (p24): under New booking's Chair · Dentist, and inside a visit's Move form, the starts that fit the
// length on the day chosen, as chips a tap puts into the form — and, with a dentist chosen, their next free days.
//
// The arithmetic is model.ts's (freeStarts, pickStarts, freeDays: pure, the server can import it); the book comes
// from the calendar when the day is on screen, else from one GET of eight days (ctx.rangeCards, kept 60 s). A
// suggestion honours the clinic's hours, the dentist's weekdays, every visit that still holds its time, visits with
// no chair or no dentist yet (counted), and the visit being moved (never in its own way) — and blocked time (040):
// lunch and a closure hold everything, a chair out of use its chair, a dentist away or outside their hours that
// dentist (model.ts blockHolds), so a day a closure or a dentist's leave covers says why. A chip never saves:
// Save does, and the server checks the book again under its lock (findClash), so a time another desk took
// meanwhile is refused with its own sentence, the board reloads and the chips are read again.
//
// Hooks are data-<bk|vp>-slots-* on the block (FreeTimes.astro) and data-ft-* on a chip; classes are .ft-*.
import * as M from './model';
import type { Ctx } from './board';
import { icon } from './ui';
import { blockSentence } from '../../../lib/block-words';

export interface FreeFields {
  date: HTMLInputElement; time: HTMLInputElement; minutes: HTMLInputElement; chair: HTMLSelectElement; dentist: HTMLSelectElement;
  /** The visit being moved or placed; null for a new booking. */
  exclude: () => string | null;
  /** True while the block must stay hidden and fetch nothing: Book's "Here now" ticked; Move's form folded. */
  off: () => boolean;
  /** Called when a read of days not on screen has landed (their blocked time is now known: the soft stop's line). */
  loaded?: () => void;
}
export interface FreeTimes {
  update: (o?: { fresh?: boolean; keep?: boolean }) => void;
  hide: () => void;
  mark: () => void;
  /** The live board absorbed changes on these Manila days: redraw (keeping focus) when the block shows one of them. */
  changed: (days: Set<string>) => void;
}

const COUNTED = 'Visits with no chair or no dentist yet are counted, so a chair that looks empty may not be offered.';
const CHECKS = 'Saving checks the book again.';
const LOOKING = 'Looking for free times…';
const FAILED = 'Free times could not be loaded. Type a time instead; saving checks the book.';
const OFFLINE = 'Offline: free times need the connection.';
const LENGTH = 'Set the length (5 to 480 minutes) to see free times.';
const turnoverWords = (n: number) => `Suggestions leave at least ${n} minutes after each visit to ready the chair, then start on the next quarter hour.`;

/** "09:30" (or "09:30:00") → 570; anything else null. */
export function timeMin(v: string): number | null {
  const m = /^(\d{2}):(\d{2})/.exec(v);
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  return h < 24 && mi < 60 ? h * 60 + mi : null;
}

type Kept = { next: boolean; min: string; chair: string; ymd: string };

export function initFreeTimes(ctx: Ctx, hook: 'bk' | 'vp', f: FreeFields): FreeTimes {
  const { boot } = ctx;
  const found = document.querySelector<HTMLElement>(`[data-${hook}-slots]`);
  if (!found) return { update: () => {}, hide: () => {}, mark: () => {}, changed: () => {} };
  const root: HTMLElement = found;
  const part = (k: string) => root.querySelector<HTMLElement>(`[data-${hook}-slots-${k}]`)!;
  const head = part('head'), row = part('row'), say = part('say'), note = part('note');
  const next = part('next'), nextHead = part('next-head'), nextRow = part('next-row'), nextNote = part('next-note');
  // seq: the newest update wins (an answer for an older one is dropped). shownYmd / shownBase: the day drawn, and the
  // first of the eight days read for the next-free part (the live board's changes are matched against both).
  // nextFor: the dentist the next-free part was drawn for (kept on screen while the same dentist's is read again).
  // rowFor: the day the day row was drawn for (kept on screen while that day is read again).
  let seq = 0, shownYmd = '', shownBase = '', nextShown = false, pendingFocus = false, nextFor = '', rowFor = '';

  /** What stands in the way on a day: the visits that hold their time, less the one being moved, and its blocked time. */
  const dayHolds = (list: M.Slotted[], blocks: M.Blocky[], ymd: string): M.Hold[] =>
    [...M.holdsOf(list, M.startMs(ymd), f.exclude()), ...M.blockHolds(blocks, M.startMs(ymd))];
  /** Blocked time that leaves the whole day with nothing (040): a closure over it, or the chosen dentist away all of it. */
  const blockReason = (blocks: M.BlockRange[], ymd: string, d: M.StaffDay | undefined): string => {
    const shut = M.wholeDayClosed(blocks, boot.hours, ymd);
    if (shut) return blockSentence(shut);
    const away = d ? M.wholeDayAway(blocks, boot.hours, ymd, d) : null;
    return away ? blockSentence(away) : '';
  };

  function chip(min: number, chair: number, ymd?: string): HTMLButtonElement {
    const b = ctx.el('button', 'ft-chip');
    b.type = 'button';
    b.setAttribute('aria-pressed', 'false');
    b.dataset.ftMin = String(min);
    b.dataset.ftChair = String(chair);
    if (ymd) b.dataset.ftYmd = ymd;
    // A day's chip: the time, then the chair (left out when the branch has one). A next day's: the day, then the time.
    const words = ymd ? [M.dayLabel(ymd), M.hm(min)] : boot.chairs === 1 ? [M.hm(min)] : [M.hm(min), `Chair ${chair}`];
    const lines = words.map((w, i) => ctx.el('span', i === 0 ? 'ft-a' : 'ft-b', w));
    lines[lines.length - 1].prepend(icon('check', 14, 'ft-tick'));
    // A space between the lines, for the button's name ("9:00 am Chair 1"); a grid does not draw it.
    lines.forEach((l, i) => { if (i) b.append(' '); b.append(l); });
    b.addEventListener('click', () => (ymd ? takeDay(ymd, min, chair) : take(min, chair)));
    return b;
  }
  /** Put these chips in a row, keeping every chip already there that is still wanted: a redraw that lands between a
   *  press and its release (a field's change fires as the focus leaves it for the chip) must not replace the chip under
   *  the hand, or the tap is lost; a chip kept also keeps the focus. */
  function fillRow(target: HTMLElement, list: { min: number; chair: number; ymd?: string }[]) {
    const key = (min: string | number, chair: string | number, ymd = '') => `${ymd}|${min}|${chair}`;
    const have = new Map([...target.querySelectorAll<HTMLButtonElement>(':scope > .ft-chip')].map((b) => [key(b.dataset.ftMin!, b.dataset.ftChair!, b.dataset.ftYmd), b]));
    const want = list.map((x) => have.get(key(x.min, x.chair, x.ymd)) ?? chip(x.min, x.chair, x.ymd));
    for (const b of have.values()) if (!want.includes(b)) b.remove();
    want.forEach((b, i) => { if (target.children[i] !== b) target.insertBefore(b, target.children[i] ?? null); });
  }
  /** A day's chip fills Time and Chair; nothing is redrawn, so the focus stays on it. Nothing is saved. */
  function take(min: number, chair: number) {
    f.time.value = M.hhmm(min);
    f.chair.value = String(chair);
    mark();
  }
  /** A next day's chip fills Date, Time and Chair (the dentist stays); the panel's date listener works the day out again. */
  function takeDay(ymd: string, min: number, chair: number) {
    f.time.value = M.hhmm(min);
    f.chair.value = String(chair);
    f.date.value = ymd;
    pendingFocus = true;
    f.date.dispatchEvent(new Event('change'));
  }
  /** A day's chip is pressed when both its time and its chair are the form's. */
  function mark() {
    const t = f.time.value.slice(0, 5), c = f.chair.value;
    for (const b of row.querySelectorAll<HTMLButtonElement>('.ft-chip')) {
      b.setAttribute('aria-pressed', String(t === M.hhmm(Number(b.dataset.ftMin)) && c === b.dataset.ftChair));
    }
  }
  function hideNext() { next.hidden = true; nextShown = false; nextFor = ''; nextRow.replaceChildren(); nextNote.textContent = ''; }
  function hide() {
    seq++;
    root.hidden = true;
    head.textContent = ''; say.textContent = ''; note.textContent = ''; nextHead.textContent = '';
    row.replaceChildren(); rowFor = '';
    hideNext();
    pendingFocus = false;
  }

  function remember(): Kept | null {
    const a = document.activeElement;
    if (!(a instanceof HTMLElement) || !a.classList.contains('ft-chip') || !root.contains(a)) return null;
    return { next: nextRow.contains(a), min: a.dataset.ftMin ?? '', chair: a.dataset.ftChair ?? '', ymd: a.dataset.ftYmd ?? '' };
  }
  /** After a redraw: the chip the hand was on (same time and chair, or day), else the pressed one, else the first,
   *  else Time. Only while the focus has nowhere else to be (it fell off a chip that was redrawn). */
  function restore(k: Kept | null) {
    const a = document.activeElement;
    const lost = !a || a === document.body || root.contains(a);
    if (pendingFocus && lost) {
      pendingFocus = false;
      (row.querySelector<HTMLElement>('.ft-chip[aria-pressed="true"]') ?? row.querySelector<HTMLElement>('.ft-chip') ?? f.time).focus({ preventScroll: true });
      return;
    }
    if (!k || !lost) return;
    const same = [...(k.next ? nextRow : row).querySelectorAll<HTMLElement>('.ft-chip')]
      .find((b) => b.dataset.ftMin === k.min && b.dataset.ftChair === k.chair && (b.dataset.ftYmd ?? '') === k.ymd);
    const to = same ?? row.querySelector<HTMLElement>('.ft-chip[aria-pressed="true"]') ?? root.querySelector<HTMLElement>('.ft-chip') ?? f.time;
    if (to !== document.activeElement) to.focus({ preventScroll: true });
  }

  /** The day's chips (at most four, in time order) from a list of visits, and the words under them. */
  function drawDay(list: M.Slotted[], blocks: M.Blocky[], ymd: string, dow: number, open: [number, number], minutes: number, withName: string) {
    const today = boot.today;
    const from = Math.ceil((ymd === today ? Math.max(open[0], M.manila(Date.now()).min) : open[0]) / 15) * 15;
    const ask: M.FreeAsk = {
      open, from, minutes, chairs: boot.chairs, dentistId: f.dentist.value || undefined, pool: true,
      anyOf: boot.staff.filter((s) => s.days.includes(dow)).map((s) => s.id),
      preferChair: Number(f.chair.value) || null, turnover: boot.turnover ?? 0,
    };
    const holds = dayHolds(list, blocks, ymd);
    const all = M.freeStarts(holds, { ...ask, limit: Infinity });
    const at = timeMin(f.time.value), atChair = at !== null && at >= from ? M.freeAt(holds, ask, at) : null;
    const chips = M.pickStarts(all, { at: atChair === null ? null : { min: at!, chair: atChair }, limit: 4, gap: M.chipGap(minutes, from, open[1], 4) });
    const counted = M.freeStarts(holds, { ...ask, pool: false, limit: Infinity }).length > all.length;
    fillRow(row, chips);
    rowFor = ymd;
    if (!chips.length) {
      say.textContent = `Nothing free for ${minutes} minutes${withName} ${ymd === today ? 'left today' : 'on this day'}.`;
      note.textContent = '';
    } else {
      say.textContent = '';
      note.textContent = [counted && COUNTED, (boot.turnover ?? 0) > 0 && turnoverWords(boot.turnover ?? 0), CHECKS].filter(Boolean).join(' ');
    }
    mark();
  }

  async function run(o: { fresh?: boolean; keep?: boolean }) {
    const my = ++seq;
    const ymd = f.date.value;
    if (f.off() || !boot.canSchedule || !M.realDay(ymd)) { hide(); return; }
    const kept = o.keep ? remember() : null;
    root.hidden = false;
    shownYmd = ymd;
    const minutes = Number(f.minutes.value);
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 480) {
      head.textContent = 'Free times';
      say.textContent = LENGTH;
      row.replaceChildren(); rowFor = ''; note.textContent = '';
      hideNext();
      restore(kept);
      return;
    }
    const today = boot.today, dow = M.dowOf(ymd), open = M.hoursOf(boot.hours, dow);
    const id = f.dentist.value, d = id ? ctx.staffById.get(id) : undefined;
    const name = id ? M.shortName(d?.name ?? f.dentist.selectedOptions[0]?.text.split(' · ')[0] ?? '') : '';
    const withName = name ? ` with ${name}` : '';
    head.textContent = `Free for ${minutes} minutes${withName}${ymd === today ? ' today' : ` on ${M.dayLabel(ymd)}`}`;

    // Why the day has none, in this order.
    const reason = ymd < today ? 'That day has passed.'
      : !open ? `The clinic is closed on ${M.DAYS[dow]}.`
      : id && !d ? `${name} is not on this branch’s schedule.`
      : d && !d.days.includes(dow) ? `${name} is not in on ${M.DAYS[dow]}.`
      : !id && boot.staff.length && !boot.staff.some((s) => s.days.includes(dow)) ? `No dentist is on the schedule on ${M.DAYS[dow]}.`
      : '';
    let drawn = false;
    const sayReason = (why: string) => { say.textContent = why; row.replaceChildren(); rowFor = ''; note.textContent = ''; };
    /** The day row from a list of visits and its blocked time: its chips, or why a block leaves it none. */
    const dayFrom = (list: M.Slotted[], blocks: M.BlockRange[]) => {
      const why = blockReason(blocks, ymd, d);
      if (why) sayReason(why); else drawDay(list, blocks, ymd, dow, open!, minutes, withName);
    };
    if (reason) sayReason(reason);
    else {
      const local = o.fresh ? null : ctx.dayCards(ymd);
      if (local) { dayFrom(local, ctx.dayBlocks(ymd) ?? []); drawn = true; }
      // Another day: its chips go at once. The same day read again (a new length, dentist or chair): its chips stay
      // until the answer replaces them, which from what is kept comes before a press is released.
      else if (rowFor !== ymd) { row.replaceChildren(); rowFor = ''; note.textContent = ''; say.textContent = LOOKING; }
    }
    if (drawn) restore(kept);

    // The day on screen and no dentist: nothing to read. Otherwise the eight days from the day (or from today).
    if ((reason || drawn) && !d) { hideNext(); restore(kept); return; }
    // Another dentist's next days go at once; the same dentist's stay until the new answer replaces them.
    if (nextFor !== id) hideNext();
    const base = ymd >= today ? ymd : today;
    const book = await ctx.rangeCards(base, { fresh: o.fresh });
    if (my !== seq) return;
    f.loaded?.();
    if (!book) {
      const words = navigator.onLine === false ? OFFLINE : FAILED;
      if (reason || drawn) {
        // The day row stands (drawn from the board, or its reason said): only the next-free part could not be read.
        nextHead.textContent = `Next free with ${name}`;
        nextRow.replaceChildren(); nextNote.textContent = words;
        next.hidden = false; nextShown = false;
      } else { say.textContent = words; hideNext(); }
      restore(kept);
      return;
    }
    if (!reason && !drawn) dayFrom(book.cards, M.blocksOn(book.blocks, ymd));
    if (d) {
      const days = M.freeDays(book.cards, {
        after: ymd, today, nowMin: M.manila(Date.now()).min, days: 7, hours: boot.hours, dentist: d, staff: boot.staff,
        at: timeMin(f.time.value), minutes, chairs: boot.chairs, preferChair: Number(f.chair.value) || null, excludeId: f.exclude(),
        turnover: boot.turnover ?? 0, max: 2,
        extra: (day) => M.blockHolds(M.blocksOn(book.blocks, day), M.startMs(day)),
      });
      nextHead.textContent = `Next free with ${name}`;
      fillRow(nextRow, days);
      // Their hours and the blocked time are honoured now (040), so the note names the hours too.
      nextNote.textContent = days.length
        ? `Going by the days and hours ${name} is in (${M.daysHoursText(d)}).`
        : `No free ${minutes} minutes with ${name} ${ymd < today ? 'in the next 7 days' : 'in the 7 days after this one'}.`;
      next.hidden = false; nextShown = true; nextFor = id; shownBase = base;
    } else hideNext();
    restore(kept);
  }

  return {
    update: (o = {}) => { void run(o); },
    hide,
    mark,
    changed(days) {
      if (root.hidden || f.off()) return;
      const inNext = nextShown && [...days].some((x) => x >= shownBase && x < M.addDays(shownBase, 8));
      if (days.has(shownYmd) || inNext) void run({ keep: true });
    },
  };
}
