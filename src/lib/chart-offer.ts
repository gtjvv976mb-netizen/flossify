// What a treatment could do to the chart, and the words for it (tooth-first charting, step 2; migration 042).
//
// After a treatment is recorded or marked done on a tooth, the record offers to update the chart — "Chart 26 MO
// as filled. Now: caries MO." — and writes it only when the dentist taps (src/lib/chart-write.ts). This file only
// decides: pure functions, no Node or database imports, so the record's panel script imports it too and the
// screen and the server can never disagree about an offer.
//
// The chart keeps one finding per tooth (a whole-tooth condition, or a surface condition with its surfaces), so an
// offer never hides a different finding: anything that would is pointed at the chart for the person to choose.
// The rules, exactly (the chart now ↓, the treatment's effect →):
//
//                          filled, sealant               crown   root canal  veneer  missing
//   sound                  offer (needs a surface)       offer   offer       offer   offer
//   caries on S            offer if it covers all of S,  offer   offer       other   offer
//                          else uncovered
//   the same finding       union of surfaces: offer,     nothing nothing     nothing nothing
//                          or nothing if already shown
//   another surface        other                         offer   offer       other   offer
//   finding (filled, sealant, amalgam, inlay), a different one
//   any other whole-tooth  other                         other   other       other   offer
//   finding (crown, root canal, veneer, bridge, implant, unerupted, impacted, missing, and 045's extraction,
//   root fragment, abutment, pontic, denture), a different one
//   a baby tooth (51–85)   baby everywhere: the chart draws permanent teeth only
//
// A filling or sealant with no surfaces is always no-surfaces. What a treatment does is procedure_catalog's
// chart_effect (042), never guessed from its name; null means no offer.

import { CONDITION_LABEL, SURFACE_SCOPED, surfaceSummary, type Surface, type ToothCondition } from '../data/demo';

export const CHART_EFFECTS = ['filled', 'sealant', 'root_canal', 'crown', 'missing', 'veneer'] as const;
export type ChartEffect = (typeof CHART_EFFECTS)[number];
/** One tooth as the chart draws it: a condition, and for a surface finding (SURFACE_SCOPED) its surfaces. Null = sound. */
export interface LiveMark { condition: ToothCondition; surfaces: Surface[] }

/** The 32 teeth the chart draws. */
export const isPermanent = (fdi: number) => fdi >= 11 && fdi <= 48 && fdi % 10 >= 1 && fdi % 10 <= 8;
/** The 20 baby teeth: quadrants 5–8, positions 1–5. */
const isBaby = (fdi: number) => fdi >= 51 && fdi <= 85 && fdi % 10 >= 1 && fdi % 10 <= 5;
const isEffect = (e: string | null): e is ChartEffect => e !== null && (CHART_EFFECTS as readonly string[]).includes(e);
const onSurfaces = (c: string) => (SURFACE_SCOPED as string[]).includes(c);

/** The chart's order for surfaces, the one surfaceSummary writes them in: M O D B L. */
const ORDER: Surface[] = ['mesial', 'occlusal', 'distal', 'buccal', 'lingual'];
const inOrder = (s: Iterable<Surface>) => { const set = new Set(s); return ORDER.filter((x) => set.has(x)); };
const LETTER: Record<string, Surface> = { M: 'mesial', O: 'occlusal', I: 'occlusal', D: 'distal', B: 'buccal', F: 'buccal', L: 'lingual', P: 'lingual' };

/** M→mesial, O/I→occlusal (the chart's one biting slot), D→distal, B/F→buccal, L/P→lingual; deduped, chart order. */
export function surfacesFromLetters(letters: string | null): Surface[] {
  return inOrder([...(letters ?? '').toUpperCase()].map((ch) => LETTER[ch]).filter((s): s is Surface => !!s));
}

/** A sound tooth, or a mark that says 'sound', is null; a whole-tooth condition carries no surfaces (the chart
 *  draws none for it); surfaces come deduped in chart order. */
function tidy(m: LiveMark | null): LiveMark | null {
  if (!m || m.condition === 'sound') return null;
  return { condition: m.condition, surfaces: onSurfaces(m.condition) ? inOrder(m.surfaces ?? []) : [] };
}

/** 'sound' | '<condition>' | '<condition>:<surfaces in chart order, comma-joined>' — what a form says it showed. */
export function markKey(m: LiveMark | null): string {
  const t = tidy(m);
  if (!t) return 'sound';
  return t.surfaces.length ? `${t.condition}:${t.surfaces.join(',')}` : t.condition;
}

export type ChartOffer =
  | { kind: 'none' }                                   // no tooth, or no chart effect: say nothing
  | { kind: 'baby'; fdi: number }
  | { kind: 'same'; fdi: number; now: LiveMark }
  | { kind: 'apply'; fdi: number; now: LiveMark | null; to: { condition: ChartEffect; surfaces: Surface[] } }
  // `to` on a point: what the treatment would have charted, for its sentence ("which Filling on MO does not cover",
  // "so root canal would hide it"); chartOffer always sets it.
  | { kind: 'point'; fdi: number; now: LiveMark | null; why: 'no-surfaces' | 'uncovered' | 'other'; left?: Surface[]; to?: { condition: ChartEffect; surfaces: Surface[] } };

/** The table above, exactly. Checks in order: none → baby → no-surfaces → sound → same (union) → missing →
 *  caries cover (and a crown or root canal over a filling or sealant) → other. */
export function chartOffer(effect: string | null, fdi: number | null, letters: string | null, now: LiveMark | null): ChartOffer {
  if (fdi === null || !Number.isInteger(fdi) || !isEffect(effect)) return { kind: 'none' };
  if (!isPermanent(fdi)) return isBaby(fdi) ? { kind: 'baby', fdi } : { kind: 'none' };
  const cur = tidy(now);
  const scoped = effect === 'filled' || effect === 'sealant';
  const mine = scoped ? surfacesFromLetters(letters) : [];
  const to = { condition: effect, surfaces: mine };
  if (scoped && mine.length === 0) return { kind: 'point', fdi, now: cur, why: 'no-surfaces', to };
  const apply = (surfaces: Surface[]): ChartOffer => ({ kind: 'apply', fdi, now: cur, to: { condition: effect, surfaces } });
  if (!cur) return apply(mine);
  if (cur.condition === effect) {
    if (!scoped) return { kind: 'same', fdi, now: cur };
    const union = inOrder([...cur.surfaces, ...mine]);
    return union.length === cur.surfaces.length ? { kind: 'same', fdi, now: cur } : apply(union);
  }
  if (effect === 'missing') return apply([]);
  if (onSurfaces(cur.condition)) {
    // A crown or a root canal is the whole tooth: it takes over caries, a filling or a sealant.
    if (effect === 'crown' || effect === 'root_canal') return apply([]);
    if (cur.condition === 'caries' && scoped) {
      const left = cur.surfaces.filter((s) => !mine.includes(s));
      return left.length ? { kind: 'point', fdi, now: cur, why: 'uncovered', left, to } : apply(mine);
    }
  }
  return { kind: 'point', fdi, now: cur, why: 'other', to };
}

/** Whether an offer earns the follow-up callout: 'apply' and 'point' only (never none, same or baby). */
export const calloutWorthy = (o: ChartOffer) => o.kind === 'apply' || o.kind === 'point';

const word = (c: ToothCondition) => CONDITION_LABEL[c].toLowerCase();

/** "caries MO", "filled O", "sound", "crown", "root canal": a tooth's mark in the chart's words and letters. */
export function markWords(fdi: number, m: LiveMark | null): string {
  const t = tidy(m);
  if (!t) return 'sound';
  const codes = surfaceSummary(fdi, t.surfaces);
  return codes ? `${word(t.condition)} ${codes}` : word(t.condition);
}

/** §1.5's sentences for an offer. `treatment` is the treatment's name as recorded ("Filling"). The title is the
 *  callout's head, and only an offer has one ("Update the chart?"); the other states are one line. Null for none
 *  and same, which say nothing. */
export function offerWords(o: ChartOffer, treatment: string): { title: string; line: string } | null {
  switch (o.kind) {
    case 'none':
    case 'same':
      return null;
    case 'baby':
      return { title: '', line: `The chart shows permanent teeth only, so ${o.fdi} is not on it. The treatment is listed in Treatment.` };
    case 'apply': {
      const codes = surfaceSummary(o.fdi, o.to.surfaces);
      return { title: 'Update the chart?', line: `Chart ${o.fdi}${codes ? ` ${codes}` : ''} as ${word(o.to.condition)}. Now: ${markWords(o.fdi, o.now)}.` };
    }
    case 'point': {
      if (o.why === 'no-surfaces') return { title: '', line: `No surfaces were written for this ${treatment}, so the chart cannot show it. Chart ${o.fdi} yourself.` };
      if (o.why === 'uncovered') {
        return { title: '', line: `${o.fdi} still has caries on ${surfaceSummary(o.fdi, o.left ?? [])}, which ${treatment} on ${surfaceSummary(o.fdi, o.to?.surfaces ?? [])} does not cover. The chart keeps one finding per tooth, so it was not changed.` };
      }
      // 'other': the finding the treatment would chart, in the same words as the one it would hide.
      const would = o.to ? markWords(o.fdi, o.to) : treatment.toLowerCase();
      return { title: '', line: `${o.fdi} shows ${markWords(o.fdi, o.now)}. The chart keeps one finding per tooth, so ${would} would hide it. Choose on the chart.` };
    }
  }
}
